// Todas las funciones utilitarias (logSystemContext, cleanupProcessListeners, updateLastOperation, etc.)
// deben ser importadas desde whatsapp-utils.js. No dupliques lógica aquí.
// Este archivo no debe contener definiciones de funciones utilitarias duplicadas.
var axios = require('axios');
require('dotenv').config();
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const logger = require('./logger');
const { logSystemContext, cleanupProcessListeners, updateLastOperation, isClientReady, handleSessionError, sendMessageWithTimeout } = require('./whatsapp/whatsapp-utils');
const { sendPushNotificationFCM } = require('./fcm');
const { setupProcessHandlers } = require('./whatsapp/processHandlers');

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




// ...existing code...


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



// Importar todas las funciones de registro de eventos
const {
  registerWhatsappConnectionEvents,
  registerWhatsappCallEvents,
  registerWhatsappMessageEvents,
  registerWhatsappQrEvents,
  registerWhatsappReadyEvents
} = require('./whatsapp/whatsapp-events');

// Registrar todos los handlers de eventos
registerWhatsappConnectionEvents(whatsapp, whatsappState, notifyDown, sendPushNotificationFCM, logger);
registerWhatsappCallEvents(whatsapp, logger, updateLastOperation);
registerWhatsappMessageEvents(whatsapp, logger, updateLastOperation);
registerWhatsappQrEvents(whatsapp, logger, sendPushNotificationFCM, sendPushNotificationFCM);
registerWhatsappReadyEvents(whatsapp, whatsappState, logger, updateLastOperation);


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
        logger.error('[RECOVERY] Error al intentar reiniciar WhatsApp:', {
            message: err && err.message,
            stack: err && err.stack,
            full: err,
            json: (() => { try { return JSON.stringify(err); } catch (e) { return 'No se pudo serializar el error'; } })()
        });
    }
    if (restartAttempts >= 3 && !whatsappState.isReady) {
        logger.warn(`[RECOVERY] Se alcanzaron ${restartAttempts} chequeos fallidos. Enviando notificación FCM de caída.`);
        if (sendPushNotificationFCM && process.env.FCM_DEVICE_TOKEN) {
            await sendPushNotificationFCM(
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


// Unificar health check: usar solo el robusto de health.js
const { startHealthCheck } = require('./health');

async function recoverySequence() {
  // Lógica de recovery unificada
  let recovered = false;
  for (let i = 1; i <= 3; i++) {
    if (await isClientReady(whatsapp, whatsappState)) {
      logger.info(`[RECOVERY] Cliente WhatsApp ya está listo antes del intento #${i}, abortando recovery.`);
      recovered = true;
      break;
    }
    logger.warn(`[RECOVERY] Intento de reinicio WhatsApp #${i}`);
    try {
      await whatsapp.initialize();
      await new Promise(res => setTimeout(res, 2000));
      if (await isClientReady(whatsapp, whatsappState)) {
        logger.info(`[RECOVERY] Cliente WhatsApp recuperado en el intento #${i}`);
        recovered = true;
        break;
      }
    } catch (err) {
      logger.error('[RECOVERY] Error al intentar reiniciar WhatsApp:', {
        message: err && err.message,
        stack: err && err.stack,
        full: err,
        json: (() => { try { return JSON.stringify(err); } catch (e) { return 'No se pudo serializar el error'; } })()
      });
    }
    if (i < 3) {
      await new Promise(res => setTimeout(res, 10000));
    }
  }
  if (!recovered) {
    logger.warn('[RECOVERY] No se pudo recuperar WhatsApp tras 3 intentos. Enviando notificación FCM.');
    if (sendPushNotificationFCM && process.env.FCM_DEVICE_TOKEN) {
      await sendPushNotificationFCM(
        process.env.FCM_DEVICE_TOKEN,
        'WhatsApp caído',
        'No se pudo reiniciar el cliente WhatsApp tras 3 intentos.'
      );
    }
  }
}

startHealthCheck({
  isClientReady: (whatsapp, whatsappState) => isClientReady(whatsapp, whatsappState),
  whatsapp,
  whatsappState,
  logger,
  recoverySequence
});


// Monitor de cliente zombie cada 5 minutos
setInterval(async () => {
    const timeSinceLastOperation = Date.now() - (global.lastSuccessfulOperation || Date.now());
    const maxIdleTime = 15 * 60 * 1000; // 15 minutos
    if (timeSinceLastOperation > maxIdleTime && whatsappState.isReady) {
        logger.warn(`Client may be zombie (${timeSinceLastOperation/1000}s idle), forcing restart`);
        logSystemContext('zombie restart');
        try {
            await whatsapp.destroy();
        } catch (e) {
            logger.error('Error destroying zombie client:', e);
        }
        whatsappState.isReady = false;
        cleanupProcessListeners();
        setTimeout(() => whatsapp.initialize(), 5000);
    }
}, 5 * 60 * 1000);

// Garbage collection cada 30 minutos
setInterval(() => {
    if (global.gc) {
        global.gc();
        logger.info('Garbage collection executed');
    }
}, 30 * 60 * 1000);

setupProcessHandlers(whatsapp);

module.exports = { whatsapp, MessageMedia, whatsappState, isClientReady, handleSessionError, sendMessageWithTimeout, updateLastOperation, recoverySequence, sendPushNotificationFCM };




