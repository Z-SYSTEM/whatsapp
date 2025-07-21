const axios = require('axios');
const logger = require('../logger');
const { whatsapp, whatsappState, MessageMedia } = require('./whatsapp-client');
const { updateLastOperation } = require('./whatsapp-utils');

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

whatsapp.on('message', async (msg) => {
    logger.info(`Received message from ${msg.from} of type ${msg.type}`);
    logger.info(`[ONMESSAGE][DEBUG] msg.id: ${msg.id ? msg.id._serialized : 'N/A'} | hasMedia: ${msg.hasMedia} | caption: ${msg.caption || ''} | body: ${msg.body || ''} | mimetype: ${msg.mimetype || ''} | filename: ${msg.filename || ''}`);
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
        'call_log', 'e2e_notification', 'revoked', 'multi_vcard',
        'order', 'product', 'list', 'buttons_response', 'list_response',
        'poll', 'poll_response'
    ];
    if (ignoredTypes.includes(msg.type)) {
        logger.info(`Mensaje ignorado de tipo ${msg.type} de ${msg.from}`);
        return;
    }
    if (process.env.ONMESSAGE) {
        let match = msg.from.match(/^([^@]+)@/);
        let phoneNumber = match ? match[1] : null;
        let url = process.env.ONMESSAGE;
        let payload = {
            phoneNumber: `${phoneNumber}`,
            type: msg.type,
            from: msg.from,
            id: msg.id ? msg.id._serialized : undefined,
            timestamp: msg.timestamp,
            body: '',
            hasMedia: msg.hasMedia || false
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
                data.ciphertext = true;
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
