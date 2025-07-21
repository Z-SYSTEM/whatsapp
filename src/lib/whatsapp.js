// Todas las funciones utilitarias (logSystemContext, cleanupProcessListeners, updateLastOperation, etc.)
// deben ser importadas desde whatsapp-utils.js. No dupliques lógica aquí.
// Este archivo no debe contener definiciones de funciones utilitarias duplicadas.
var axios = require('axios');
require('dotenv').config()
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth, MessageMedia  } = require('whatsapp-web.js');
const { config } = require('dotenv');
const logger = require('./logger');
const fs = require('fs');
const { execSync } = require('child_process');
const { logSystemContext, cleanupProcessListeners, updateLastOperation, isClientReady, handleSessionError, sendMessageWithTimeout } = require('./whatsapp/whatsapp-utils');

const whatsapp = new Client({
  puppeteer: {
    // Solo usar executablePath específico en Linux/producción
    ...(process.platform === 'linux' && {
      executablePath: '/root/.cache/puppeteer/chrome/linux-137.0.7151.119/chrome-linux64/chrome'
    }),
    headless: true,
    dumpio: false, // Captura logs de Chrome en la consola
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  },
  authStrategy: new LocalAuth({
    clientId: process.env.BOT_NAME || "default-bot"
  }),
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
  }
});

const whatsappState = { isReady: false, wasEverReady: false };

// Las funciones utilitarias updateLastOperation, cleanupProcessListeners y logSystemContext
// ahora se importan desde whatsapp-utils.js

// Si necesitas funciones como isClientReady, sendMessageWithTimeout o handleSessionError,
// impórtalas también desde el módulo correspondiente o centralízalas en whatsapp-utils.js si son utilidades generales.

// Si necesitas health checks, usa performHealthCheck desde whatsapp-health.js

const path = require('path');
let sendPushNotificationFCM = null;
try {
    // Intentar requerir la función de notificación desde index.js
    sendPushNotificationFCM = require(path.join(__dirname, '../index.js')).sendPushNotificationFCM;
} catch (e) {
    // Si no se puede requerir, dejarla como null
    sendPushNotificationFCM = null;
}

// Enviar notificación FCM y loguear solo title y body
async function sendPushNotificationFCMWrapper(token, title, body) {
    if (!sendPushNotificationFCM) return;
    try {
        await sendPushNotificationFCM(token, title, body);
        logger.info(`[FCM] Notificación enviada | title: ${title} | body: ${body}`);
    } catch (err) {
        logger.error(`[FCM] Error enviando notificación | title: ${title} | body: ${body} | error: ${err.stack || err}`);
    }
}

whatsapp.on('qr', async qr => {
    logger.info('QR code generated for WhatsApp session');
    qrcode.generate(qr, { small: true });
    logger.info(qr);
    // Notificación FCM si está disponible
    if (sendPushNotificationFCM && process.env.FCM_DEVICE_TOKEN) {
        await sendPushNotificationFCMWrapper(
            process.env.FCM_DEVICE_TOKEN,
            'WhatsApp requiere escaneo',
            'El bot está esperando que escanees el QR para autenticarse.'
        );
    }
});

whatsapp.on('ready', () => {
    logger.info('WhatsApp client is ready!');
    whatsappState.isReady = true;
    whatsappState.wasEverReady = true;
    updateLastOperation();
});

async function notifyDown(reason) {
    if (process.env.ONDOWN) {
        const data = {
            message: 'WhatsApp client is down',
            reason: reason || 'unknown',
            timestamp: new Date().toISOString()
        };
        try {
            await axios.post(process.env.ONDOWN, data, {
                headers: { 'Content-Type': 'application/json' }
            });
            logger.info(`Posted ONDOWN info to ${process.env.ONDOWN}`);
        } catch (err) {
            logger.error(`Error posting ONDOWN info: ${err.stack || err}`);
        }
    }
}

whatsapp.on('disconnected', (reason) => {
    logger.warn(`WhatsApp client disconnected: ${reason}`);
    whatsappState.isReady = false;
    if (whatsappState.wasEverReady) {
        // Notificar solo si alguna vez estuvo listo
        notifyDown('Sesión cerrada: ' + (reason || 'unknown'));
        // Notificación FCM explícita de sesión cerrada
        if (sendPushNotificationFCM && process.env.FCM_DEVICE_TOKEN) {
            sendPushNotificationFCMWrapper(
                process.env.FCM_DEVICE_TOKEN,
                'WhatsApp sesión cerrada',
                'La sesión de WhatsApp se ha cerrado. Se requiere acción.'
            );
        }
    }
});

whatsapp.on('auth_failure', (msg) => {
    logger.error(`Authentication failure: ${msg}`);
    whatsappState.isReady = false;
    notifyDown(msg);
});

whatsapp.on('call', async (call) => {
    logger.info(`Incoming call from ${call.from} (${call.isVideo ? 'video' : 'voice'})`);
    
    try {
        // Rechaza la llamada
        await call.reject();
        logger.info(`Call from ${call.from} rejected.`);

        // Envía mensaje al usuario que llamó
        await whatsapp.sendMessage(call.from, 'No se pueden recibir llamadas');
        logger.info(`Sent "No se pueden recibir llamadas" to ${call.from}`);
        updateLastOperation();
    } catch (err) {
        logger.error(`Error handling call: ${err.stack || err}`);
        handleSessionError(err);
        return; // No continuar si hay error de sesión
    }

    // (Opcional) Notifica a ONMESSAGE si está configurado
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

whatsapp.on( 'message', async (msg) => {
    logger.info(`Received message from ${msg.from} of type ${msg.type}`);

    // Filtrar mensajes de estado (status@broadcast y similares)
    if (msg.from === 'status@broadcast' || msg.from === 'status@c.us') {
        logger.info(`Estado ignorado de ${msg.from} | type: ${msg.type} | id: ${msg.id ? msg.id._serialized : 'N/A'}`);
        return;
    }

    // Tipos a ignorar
    const ignoredTypes = [
        'sticker', 'call_log', 'e2e_notification', 'revoked', 'multi_vcard',
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
        let data = {
            phoneNumber: `${phoneNumber}`,
            type: msg.type,
            from: msg.from,
            id: msg.id ? msg.id._serialized : undefined,
            timestamp: msg.timestamp,
            body: msg.body || '',
            hasMedia: msg.hasMedia || false
        };

        switch (msg.type) {
            case 'chat':
                // Solo texto
                break;
            case 'image':
                data.imagen = true;
                data.caption = msg.caption || '';
                break;
            case 'video':
                data.video = true;
                data.caption = msg.caption || '';
                break;
            case 'audio':
            case 'ptt':
                data.audio = true;
                break;
            case 'document':
                data.document = true;
                data.filename = msg.filename || '';
                data.caption = msg.caption || '';
                break;
            case 'location':
                data.location = {
                    latitude: msg.location?.latitude,
                    longitude: msg.location?.longitude,
                    description: msg.location?.description
                };
                break;
            case 'contact':
            case 'vcard':
                data.contact = msg.vcard || '';
                break;
            case 'ciphertext':
                data.ciphertext = true;
                break;
            default:
                // Si llega aquí, es un tipo permitido pero no detallado
                break;
        }

        logger.info(`Posting message to ONMESSAGE (${url}): ${JSON.stringify(data)}`);

        let config = {
            headers: {
                'Content-type': 'application/json'
            }
        };
        try {
            await axios.post(url, JSON.stringify(data), config);
            logger.info(`Posted message info to ${url} | id: ${data.id} | type: ${data.type} | phoneNumber: ${data.phoneNumber}`);
            updateLastOperation();
        } catch (err) {
            logger.error(`Error posting message info: ${err.stack || err} | id: ${data.id} | type: ${data.type} | phoneNumber: ${data.phoneNumber}`);
            
            // Si hay error de sesión cerrada durante el procesamiento de mensajes
            handleSessionError(err);
        }
    }
});


// Lógica de reintentos de reinicio y notificación FCM si no levanta
let restartAttempts = 0;
let retryInterval = null;

async function tryRestartWhatsApp() {
    logger.warn('[RECOVERY] Entrando a tryRestartWhatsApp');
    if (whatsappState.isReady) {
        logger.warn('[RECOVERY] Cliente ya está listo, reseteando contadores de recovery');
        restartAttempts = 0;
        if (retryInterval) {
            clearInterval(retryInterval);
            retryInterval = null;
        }
        logger.warn('[RECOVERY] Saliendo de tryRestartWhatsApp (cliente listo)');
        return;
    }
    restartAttempts++;
    logger.warn(`[RECOVERY] Chequeo fallido #${restartAttempts} - WhatsApp no está listo`);
    if (restartAttempts < 3) {
        logger.warn(`[RECOVERY] Intento de reinicio WhatsApp #${restartAttempts}`);
    }
    try {
        await whatsapp.initialize();
        logger.info(`[RECOVERY] Intento de reinicio ejecutado (#${restartAttempts})`);
    } catch (err) {
        logger.error(`[RECOVERY] Error al intentar reiniciar WhatsApp: ${err && err.message}`);
    }
    if (restartAttempts >= 3 && !whatsappState.isReady) {
        logger.warn(`[RECOVERY] Se alcanzaron ${restartAttempts} chequeos fallidos. Enviando notificación FCM de caída.`);
        if (sendPushNotificationFCM && process.env.FCM_DEVICE_TOKEN) {
            await sendPushNotificationFCMWrapper(
                process.env.FCM_DEVICE_TOKEN,
                'WhatsApp caído',
                `No se pudo reiniciar el cliente WhatsApp tras ${restartAttempts} intentos.`
            );
        }
        // No seguir intentando hasta que se recupere manualmente
        clearInterval(retryInterval);
        retryInterval = null;
    }
    logger.warn('[RECOVERY] Saliendo de tryRestartWhatsApp');
}

// Health check configurable por .env (por defecto 30s)
const HEALTH_CHECK_INTERVAL = (parseInt(process.env.HEALTH_CHECK_INTERVAL_SECONDS, 10) || 30) * 1000;
let recoveryInProgress = false;

async function recoverySequence() {
    if (recoveryInProgress) {
        logger.warn('[RECOVERY] Ya hay un recovery en progreso, omitiendo nuevo intento');
        return;
    }
    // Solo intentar recovery si alguna vez hubo sesión (no si está esperando QR)
    if (!whatsappState.wasEverReady) {
        logger.warn('[RECOVERY] No se ha establecido sesión nunca (esperando QR), omitiendo recovery.');
        return;
    }
    recoveryInProgress = true;
    let recovered = false;
    for (let i = 1; i <= 3; i++) {
        // Verificar si el cliente ya está listo antes de intentar recovery
        if (await isClientReady()) {
            logger.info(`[RECOVERY] Cliente WhatsApp ya está listo antes del intento #${i}, abortando recovery.`);
            recovered = true;
            break;
        }
        logger.warn(`[RECOVERY] Intento de reinicio WhatsApp #${i}`);
        try {
            await whatsapp.initialize();
            // Esperar 2 segundos para ver si se pone ready
            await new Promise(res => setTimeout(res, 2000));
            if (await isClientReady()) {
                logger.info(`[RECOVERY] Cliente WhatsApp recuperado en el intento #${i}`);
                recovered = true;
                break;
            }
        } catch (err) {
            logger.error(`[RECOVERY] Error al intentar reiniciar WhatsApp: ${err && err.message}`);
        }
        if (i < 3) {
            await new Promise(res => setTimeout(res, 10000)); // Espera 10s entre intentos
        }
    }
    if (!recovered) {
        logger.warn('[RECOVERY] No se pudo recuperar WhatsApp tras 3 intentos. Enviando notificación FCM.');
        if (sendPushNotificationFCM && process.env.FCM_DEVICE_TOKEN) {
            await sendPushNotificationFCMWrapper(
                process.env.FCM_DEVICE_TOKEN,
                'WhatsApp caído',
                'No se pudo reiniciar el cliente WhatsApp tras 3 intentos.'
            );
        }
    }
    recoveryInProgress = false;
}

setInterval(async () => {
    const isHealthy = await performHealthCheck();
    if (!isHealthy) {
        logger.warn('[HEALTH] Cliente WhatsApp no está listo, lanzando recovery');
        await recoverySequence();
    }
}, HEALTH_CHECK_INTERVAL);

// Monitor de cliente zombie: usa logSystemContext y cleanupProcessListeners importados

// Garbage collection cada 30 minutos
setInterval(() => {
    if (global.gc) {
        global.gc();
        logger.info('Garbage collection executed');
    }
}, 30 * 60 * 1000);

// Cleanup y logging de proceso: usa logSystemContext y cleanupProcessListeners importados

module.exports = { whatsapp, MessageMedia, whatsappState, isClientReady, handleSessionError, sendMessageWithTimeout, updateLastOperation, recoverySequence, sendPushNotificationFCM };




