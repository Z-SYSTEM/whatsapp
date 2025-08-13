// === REQUIRES Y CONSTANTES ===
const axios = require('axios');
const logger = require('../core/logger');

// Eliminamos la importación circular - los objetos whatsapp, whatsappState, MessageMedia 
// se pasan como parámetros a las funciones
const { updateLastOperation } = require('./whatsapp-utils');
const qrcode = require('qrcode-terminal');
// Estos dos deben ser importados desde el archivo principal y pasados como parámetro si se usan en los handlers:
// const sendPushNotificationFCMWrapper = require('./whatsapp-utils').sendPushNotificationFCMWrapper;
// const sendPushNotificationFCM = require('./whatsapp-utils').sendPushNotificationFCM;


// === FUNCIONES ===

// Función para manejar álbumes (múltiples medios en un mensaje)
async function handleAlbumMessage(msg, logger, updateLastOperation) {
  try {
    logger.info(`[ALBUM] Detectado posible álbum - ID: ${msg.id._serialized}`);
    
    // Verificar si es parte de un álbum usando propiedades del mensaje
    if (!msg._data || (!msg._data.isGrouped && !msg._data.groupedMessageId)) {
      return false;
    }

    const albumId = msg._data.groupedMessageId || msg.id._serialized;
    logger.info(`[ALBUM] Procesando álbum con ID: ${albumId}`);
    
    // Crear estructura del álbum
    const albumData = {
      id: albumId,
      type: 'album',
      phoneNumber: msg.from.replace('@c.us', ''),
      from: msg.from,
      timestamp: msg.timestamp,
      body: msg.body || msg.caption || '',
      hasMedia: true,
      isForwarded: msg.isForwarded || (msg.forwardingScore > 0),
      media: []
    };

    // Si el mensaje tiene media, procesarlo
    if (msg.hasMedia) {
      try {
        logger.info(`[ALBUM] Descargando media del álbum...`);
        const media = await msg.downloadMedia();
        if (media) {
          albumData.media.push({
            index: 0,
            mimetype: media.mimetype,
            filename: media.filename || msg.filename || `album_item_0`,
            data: media.data,
            size: media.data ? Buffer.from(media.data, 'base64').length : 0
          });
          logger.info(`[ALBUM] Media descargado - Tipo: ${media.mimetype}, Tamaño: ${albumData.media[0].size} bytes`);
        }
      } catch (err) {
        logger.error(`[ALBUM] Error descargando media:`, err);
      }
    }

    // Enviar al endpoint si hay media
    if (albumData.media.length > 0 && process.env.ONMESSAGE) {
      albumData.mediaCount = albumData.media.length;
      
      const url = process.env.ONMESSAGE;
      const config = {
        headers: {
          'Content-type': 'application/json'
        }
      };

      try {
        logger.info(`[ALBUM] Enviando álbum al endpoint: ${JSON.stringify(albumData).substring(0, 200)}...`);
        await axios.post(url, JSON.stringify(albumData), config);
        logger.info(`[ALBUM] Álbum enviado exitosamente - ID: ${albumId}, Media count: ${albumData.mediaCount}`);
        updateLastOperation();
      } catch (err) {
        logger.error(`[ALBUM] Error enviando álbum al endpoint:`, err);
      }
    }

    return true;
  } catch (error) {
    logger.error('[ALBUM] Error procesando álbum:', error);
    return false;
  }
}

function registerWhatsappConnectionEvents(whatsapp, whatsappState, notifyDown, sendPushNotificationFCM, logger) {
  whatsapp.on('disconnected', (reason) => {
    logger.warn(`WhatsApp client disconnected: ${reason}`);
    whatsappState.isReady = false;
    if (whatsappState.wasEverReady) {
      notifyDown('Sesión cerrada: ' + (reason || 'unknown'));
      // Aquí puedes agregar lógica adicional si es necesario
    }
  });
  whatsapp.on('auth_failure', (msg) => {
    logger.error(`Authentication failure: ${msg}`);
    whatsappState.isReady = false;
    notifyDown(msg);
  });
}

function registerWhatsappCallEvents(whatsapp, logger, updateLastOperation) {
  whatsapp.on('call', async (call) => {
    logger.info(`Incoming call from ${call.from} (${call.isVideo ? 'video' : 'voice'})`);
    try {
      await call.reject();
      logger.info(`Call from ${call.from} rejected.`);
      await whatsapp.sendMessage(call.from, 'No se pueden recibir llamadas');
      logger.info(`Sent "No se pueden recibir llamadas" to ${call.from}`);
      updateLastOperation();
    } catch (err) {
      logger.error(`Error handling call: ${err.stack || err}`);
      return;
    }
    if (process.env.ONMESSAGE) {
      const data = {
        phoneNumber: `${call.from}`,
        message: `Llamada rechazada del número: ${call.from}`,
        type: 'call',
        isVideo: call.isVideo,
        timestamp: new Date().toISOString()
      };
      try {
        await axios.post(process.env.ONMESSAGE, data, {
          headers: { 'Content-Type': 'application/json' }
        });
        logger.info(`Posted call info to ${process.env.ONMESSAGE}`);
      } catch (err) {
        logger.error(`Error posting call info: ${err.stack || err}`);
      }
    }
  });
}

function registerWhatsappMessageEvents(whatsapp, logger, updateLastOperation) {
  whatsapp.on('message', async (msg) => {
    logger.info(`Received message from ${msg.from} of type ${msg.type}`);
    logger.info(`[ONMESSAGE][DEBUG] msg.id: ${msg.id ? msg.id._serialized : 'N/A'} | hasMedia: ${msg.hasMedia} | caption: ${msg.caption || ''} | body: ${msg.body || ''} | mimetype: ${msg.mimetype || ''} | filename: ${msg.filename || ''}`);
    
    // Debug adicional para álbumes
    if (msg._data) {
      logger.info(`[ONMESSAGE][DEBUG] _data.isGrouped: ${msg._data.isGrouped} | _data.groupedMessageId: ${msg._data.groupedMessageId || 'N/A'}`);
    }
    
    if (msg.location) {
      logger.info(`[ONMESSAGE][DEBUG] location: lat=${msg.location.latitude}, lon=${msg.location.longitude}, desc=${msg.location.description}`);
    }
    if (msg.vcard) {
      logger.info(`[ONMESSAGE][DEBUG] vcard: ${msg.vcard.substring(0, 200)}...`);
    }
    if (msg.from === 'status@broadcast' || msg.from === 'status@c.us') {
      logger.info(`Estado ignorado de ${msg.from} | type: ${msg.type} | id: ${msg.id ? msg.id._serialized : 'N/A'}`);
      return;
    }
    const ignoredTypes = [
      'call_log', 'e2e_notification', 'revoked',
      'order', 'product', 'list', 'buttons_response', 'list_response',
      'poll', 'poll_response', 'notification_template'
    ];
    if (ignoredTypes.includes(msg.type)) {
      logger.info(`Mensaje ignorado de tipo ${msg.type} de ${msg.from}`);
      return;
    }

    // Verificar primero si es parte de un álbum
    if (msg._data && (msg._data.isGrouped || msg._data.groupedMessageId) && msg.hasMedia) {
      logger.info(`[MESSAGE] Detectado mensaje agrupado (álbum)`);
      const handled = await handleAlbumMessage(msg, logger, updateLastOperation);
      if (handled) {
        logger.info(`[MESSAGE] Mensaje procesado como álbum`);
        return; // Salir temprano si se procesó como álbum
      }
    }

    if (process.env.ONMESSAGE) {
      let match = msg.from.match(/^([^@]+)@/);
      let phoneNumber = match ? match[1] : null;
      let url = process.env.ONMESSAGE;
      
      // Manejo especial para multi_vcard - enviar cada contacto individualmente
      if (msg.type === 'multi_vcard' && msg.vcards && Array.isArray(msg.vcards)) {
        logger.info(`Processing multi_vcard with ${msg.vcards.length} contacts from ${msg.from}`);
        
        for (let i = 0; i < msg.vcards.length; i++) {
          const vcard = msg.vcards[i];
          let individualPayload = {
            phoneNumber: msg.from.replace('@c.us', ''),
            type: 'vcard', // Enviamos cada uno como vcard individual
            from: msg.from,
            id: `${msg.id._serialized}_contact_${i}`, // ID único para cada contacto
            timestamp: msg.timestamp,
            body: msg.body,
            hasMedia: msg.hasMedia,
            isForwarded: msg.isForwarded || (msg.forwardingScore > 0),
            data: {
              vcard: vcard || ''
            }
          };
          
          logger.info(`Posting individual contact ${i + 1}/${msg.vcards.length} to ONMESSAGE (${url}): ${JSON.stringify(individualPayload)}`);
          let config = {
            headers: {
              'Content-type': 'application/json'
            }
          };
          
          try {
            await axios.post(url, JSON.stringify(individualPayload), config);
            logger.info(`Posted contact ${i + 1}/${msg.vcards.length} info to ${url} | id: ${individualPayload.id} | type: ${individualPayload.type} | phoneNumber: ${individualPayload.phoneNumber}`);
          } catch (err) {
            logger.error(`Error posting contact ${i + 1}/${msg.vcards.length} info: ${err.stack || err} | id: ${individualPayload.id} | type: ${individualPayload.type} | phoneNumber: ${individualPayload.phoneNumber}`);
          }
        }
        
        updateLastOperation();
        return; // Salir temprano ya que procesamos todo aquí
      }
      
      let payload = {
        phoneNumber: msg.from.replace('@c.us', ''),
        type: msg.type,
        from: msg.from,
        id: msg.id._serialized,
        timestamp: msg.timestamp,
        body: msg.body,
        hasMedia: msg.hasMedia,
        isForwarded: msg.isForwarded || (msg.forwardingScore > 0)
      };
      switch (msg.type) {
        case 'chat':
          payload.body = msg.body || '';
          break;
        case 'image':
          payload.body = msg.caption || '';
          logger.info('Iniciando descarga de media (imagen)...');
          try {
            const media = await msg.downloadMedia();
            if (media) {
              logger.info('Descarga de media OK (imagen)');
              payload.data = {
                mimetype: media.mimetype,
                filename: media.filename || undefined,
                data: media.data
              };
            } else {
              logger.warn('downloadMedia() devolvió null para imagen.');
            }
          } catch (err) {
            logger.error(`Error descargando imagen: ${err.stack || err}`);
          }
          break;
        case 'video':
          payload.body = msg.caption || '';
          logger.info('Iniciando descarga de media (video)...');
          try {
            const media = await msg.downloadMedia();
            if (media) {
              logger.info('Descarga de media OK (video)');
              payload.data = {
                mimetype: media.mimetype,
                filename: media.filename || undefined,
                data: media.data
              };
            } else {
              logger.warn('downloadMedia() devolvió null para video.');
            }
          } catch (err) {
            logger.error(`Error descargando video: ${err.stack || err}`);
          }
          break;
        case 'audio':
        case 'ptt':
          payload.body = '';
          logger.info('Iniciando descarga de media (audio/ptt)...');
          try {
            const media = await msg.downloadMedia();
            if (media) {
              logger.info('Descarga de media OK (audio/ptt)');
              payload.data = {
                mimetype: media.mimetype,
                filename: media.filename || undefined,
                data: media.data
              };
            } else {
              logger.warn('downloadMedia() devolvió null para audio/ptt.');
            }
          } catch (err) {
            logger.error(`Error descargando audio: ${err.stack || err}`);
          }
          break;
        case 'document':
          payload.body = msg.caption || '';
          logger.info('Iniciando descarga de media (documento)...');
          try {
            const media = await msg.downloadMedia();
            if (media) {
              logger.info('Descarga de media OK (documento)');
              payload.data = {
                mimetype: media.mimetype,
                filename: msg.filename || media.filename || undefined,
                data: media.data
              };
            } else {
              logger.warn('downloadMedia() devolvió null para documento.');
            }
          } catch (err) {
            logger.error(`Error descargando documento: ${err.stack || err}`);
          }
          break;
        case 'sticker':
          payload.body = '';
          logger.info('Iniciando descarga de media (sticker)...');
          try {
            const media = await msg.downloadMedia();
            if (media) {
              logger.info('Descarga de media OK (sticker)');
              payload.data = {
                mimetype: media.mimetype,
                filename: media.filename || undefined,
                data: media.data
              };
            } else {
              logger.warn('downloadMedia() devolvió null para sticker.');
            }
          } catch (err) {
            logger.error(`Error descargando sticker: ${err.stack || err}`);
          }
          break;
        case 'location':
          payload.data = {
            latitude: msg.location?.latitude,
            longitude: msg.location?.longitude,
            description: msg.location?.description
          };
          break;
        case 'contact':
        case 'vcard':
          payload.data = {
            vcard: msg.vcard || ''
          };
          break;
        case 'ciphertext':
          payload.data = { ciphertext: true };
          break;
        default:
          break;
      }
      logger.info(`Posting message to ONMESSAGE (${url}): ${JSON.stringify(payload)}`);
      let config = {
        headers: {
          'Content-type': 'application/json'
        }
      };
      try {
        if (payload.data) {
          logger.info(`[ONMESSAGE] Se enviará campo data: ${JSON.stringify(payload.data).substring(0, 200)}...`);
        }
        await axios.post(url, JSON.stringify(payload), config);
        logger.info(`Posted message info to ${url} | id: ${payload.id} | type: ${payload.type} | phoneNumber: ${payload.phoneNumber}`);
        updateLastOperation();
      } catch (err) {
        logger.error(`Error posting message info: ${err.stack || err} | id: ${payload.id} | type: ${payload.type} | phoneNumber: ${payload.phoneNumber}`);
      }
    }
  });
}

function registerWhatsappQrEvents(whatsapp, logger, sendPushNotificationFCM) {
  whatsapp.on('qr', async qr => {
    logger.info('QR code generated for WhatsApp session');
    qrcode.generate(qr, { small: true });
    logger.info(qr);
    if (sendPushNotificationFCM && process.env.FCM_DEVICE_TOKEN) {
      await sendPushNotificationFCM(
        process.env.FCM_DEVICE_TOKEN,
        'WhatsApp requiere escaneo',
        'El bot está esperando que escanees el QR para autenticarse.'
      );
    }
  });
}

function registerWhatsappReadyEvents(whatsapp, whatsappState, logger, updateLastOperation) {
  whatsapp.on('ready', () => {
    logger.info('WhatsApp client is ready!');
    whatsappState.isReady = true;
    whatsappState.wasEverReady = true;
    updateLastOperation();
  });
}

// === EXPORTS ===
module.exports = {
  registerWhatsappConnectionEvents,
  registerWhatsappCallEvents,
  registerWhatsappMessageEvents,
  registerWhatsappQrEvents,
  registerWhatsappReadyEvents
};

