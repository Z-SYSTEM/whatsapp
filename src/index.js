// Habilitar logs internos de whatsapp y puppeteer para debug
// process.env.DEBUG = 'whatsapp*';
process.env.DEBUG = '';
require('dotenv').config();

const { preStartupCheck } = require('./lib/core/startup');

const BOT_NAME = process.env.BOT_NAME || 'default-bot';
const puerto = parseInt(process.env.PORT, 10) || 3000;
const SESSION_PATH = process.env.SESSION_PATH || `./.wwebjs_auth/session-${BOT_NAME}`;
const HEALTHCHECK_URL = `http://localhost:${puerto}/api/test`;

console.info('[BOOT] Configuración leída:');
console.info(`[BOOT] BOT_NAME=${BOT_NAME}, puerto=${puerto}, SESSION_PATH=${SESSION_PATH}`);

// Ejecutar el pre-check antes de todo y luego inicializar WhatsApp y el servidor, con logs detallados

(async () => {
    console.info('[BOOT] [STEP 3] Iniciando preStartupCheck...');
    await preStartupCheck(BOT_NAME, puerto, SESSION_PATH, HEALTHCHECK_URL);
    console.info('[BOOT] [STEP 4] preStartupCheck finalizado. Iniciando inicialización de WhatsApp...');
    console.info('[BOOT] [STEP 4.1] Llamando whatsapp.initialize()...');
    
    // Agregar timeout manual para debug - aumentado a 90 segundos
    const initPromise = whatsapp.initialize();
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Manual timeout after 90 seconds')), 90000);
    });
    
    try {
        await Promise.race([initPromise, timeoutPromise]);
        console.info('[BOOT] [STEP 5] WhatsApp inicializado exitosamente.');
        startServerAndHealthCheck();
    } catch (err) {
        console.error('[BOOT] [ERROR] Error o timeout en inicialización:', err.message);
        logger.error('Error inicializando WhatsApp:', {
            message: err && err.message,
            stack: err && err.stack,
            full: err,
            json: (() => { try { return JSON.stringify(err); } catch (e) { return 'No se pudo serializar el error'; } })()
        });
        process.exit(1);
    }
})();

// Flag para controlar notificaciones de estado
let wasClientReady = true;
let restartCount = 0; // Contador de reinicios


const HEALTH_CHECK_INTERVAL_SECONDS = parseInt(process.env.HEALTH_CHECK_INTERVAL_SECONDS, 10) || 30;




const express = require('./lib/services/express');
const app = express();
const linksRouter = require('./routes/links');
app.use('/api', linksRouter);
const { whatsapp, whatsappState, isClientReady } = require('./lib/whatsapp/whatsapp');
const logger = require('./lib/core/logger');
const { sendPushNotificationFCM, canSendPush } = require('./lib/services/fcm');
const { startMemoryMonitor } = require('./lib/core/memoryMonitor');
const { startHealthCheck } = require('./lib/core/health');



const startServerAndHealthCheck = async () => {
    // Esperar a que el cliente esté listo antes de iniciar el health check y el servidor
    let waitCount = 0;
    while (!(await isClientReady(whatsapp, whatsappState))) {
        waitCount++;
        logger.info(`[INIT] Esperando que el cliente WhatsApp esté listo... (${waitCount})`);
        await new Promise(res => setTimeout(res, 5000));
    }
    logger.info('[INIT] Cliente WhatsApp listo, iniciando health check y servidor.');
    app.listen(puerto, () => {
        logger.info(`Server started on port ${puerto}`);
        startMemoryMonitor();
        startHealthCheck({
            isClientReady,
            whatsapp,
            whatsappState,
            logger,
            sendPushNotificationFCMWrapper: sendPushNotificationFCM,
            recoverySequence: async () => {
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
                        logger.error(`[RECOVERY] Error al intentar reiniciar WhatsApp: ${err && err.message}`);
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
        });
    });
};






process.on('uncaughtException', async (err) => {
    logger.error('Uncaught Exception:', {
        message: err && err.message,
        stack: err && err.stack,
        full: err,
        json: (() => { try { return JSON.stringify(err); } catch (e) { return 'No se pudo serializar el error'; } })()
    });
    logger.error(`[RECOVERY] Stack trace uncaughtException: ${err && err.stack}`);
    let errorType = 'unknown';
    if (err && err.message) {
        if (err.message.includes('Out of memory')) errorType = 'memory';
        else if (err.message.includes('Failed to launch the browser process')) errorType = 'chrome_launch';
        else if (err.message.includes('ECONNREFUSED')) errorType = 'connection_refused';
        else if (err.message.includes('EADDRINUSE')) errorType = 'address_in_use';
        else if (err.message.includes('Session closed')) errorType = 'session_closed';
    }
    logger.warn(`[RECOVERY] Tipo de error detectado: ${errorType}`);
    const botName = process.env.BOT_NAME || 'desconocido';
    restartCount++;
    logger.warn(`[RECOVERY] Intentando reinicio #${restartCount} para instancia: ${botName} por uncaughtException. Motivo: ${err && err.message}`);
    // Notificación push de cuelgue
    const deviceToken = process.env.FCM_DEVICE_TOKEN;
    if (canSendPush && deviceToken) {
        await sendPushNotificationFCM(
            deviceToken,
            'Bot caído',
            `La instancia ${botName} se colgó por uncaughtException: ${err && err.message} | Tipo: ${errorType}`
        );
    }
    // Intentar recuperación ante cualquier error
    try {
        await whatsapp.destroy();
    } catch (e) {
        logger.error('[RECOVERY] Error al destruir cliente tras uncaughtException:', e);
    }
    try {
        await whatsapp.initialize();
        logger.info('[RECOVERY] Cliente WhatsApp reiniciado tras uncaughtException.');
        // Notificación push de recuperación
        if (canSendPush && deviceToken) {
            await sendPushNotificationFCM(
                deviceToken,
                'Bot recuperado',
                `La instancia ${botName} fue reiniciada tras uncaughtException. | Tipo: ${errorType}`
            );
        }
    } catch (e) {
        logger.error('[RECOVERY] Error al reiniciar cliente tras uncaughtException:', e);
    }
    // Si el error es crítico, reiniciar el proceso para que PM2 lo levante
    if (err && err.message && (
        err.message.includes('Out of memory') ||
        err.message.includes('Failed to launch the browser process') ||
        err.message.includes('ECONNREFUSED') ||
        err.message.includes('EADDRINUSE')
    )) {
        logger.error('[RECOVERY] Error crítico detectado, reiniciando proceso...');
        process.exit(1);
    }
});



process.on('unhandledRejection', async (reason, promise) => {
    logger.error('Unhandled Rejection:', reason);
    logger.error(`[RECOVERY] Stack trace unhandledRejection: ${reason && reason.stack}`);
    let errorType = 'unknown';
    if (reason && reason.message) {
        if (reason.message.includes('Out of memory')) errorType = 'memory';
        else if (reason.message.includes('Failed to launch the browser process')) errorType = 'chrome_launch';
        else if (reason.message.includes('ECONNREFUSED')) errorType = 'connection_refused';
        else if (reason.message.includes('EADDRINUSE')) errorType = 'address_in_use';
        else if (reason.message.includes('Session closed')) errorType = 'session_closed';
    }
    logger.warn(`[RECOVERY] Tipo de error detectado: ${errorType}`);
    const botName = process.env.BOT_NAME || 'desconocido';
    restartCount++;
    logger.warn(`[RECOVERY] Intentando reinicio #${restartCount} para instancia: ${botName} por unhandledRejection. Motivo: ${reason && reason.message}`);
    // Notificación push de cuelgue
    const deviceToken = process.env.FCM_DEVICE_TOKEN;
    if (canSendPush && deviceToken) {
        await sendPushNotificationFCM(
            deviceToken,
            'Bot caído',
            `La instancia ${botName} se colgó por unhandledRejection: ${reason && reason.message} | Tipo: ${errorType}`
        );
    }
    // Intentar recuperación ante cualquier error
    try {
        await whatsapp.destroy();
    } catch (e) {
        logger.error('[RECOVERY] Error al destruir cliente tras unhandledRejection:', e);
    }
    try {
        await whatsapp.initialize();
        logger.info('[RECOVERY] Cliente WhatsApp reiniciado tras unhandledRejection.');
        // Notificación push de recuperación
        if (canSendPush && deviceToken) {
            await sendPushNotificationFCM(
                deviceToken,
                'Bot recuperado',
                `La instancia ${botName} fue reiniciada tras unhandledRejection. | Tipo: ${errorType}`
            );
        }
    } catch (e) {
        logger.error('[RECOVERY] Error al reiniciar cliente tras unhandledRejection:', e);
    }
    // Si el error es crítico, reiniciar el proceso para que PM2 lo levante
    if (reason && reason.message && (
        reason.message.includes('Out of memory') ||
        reason.message.includes('Failed to launch the browser process') ||
        reason.message.includes('ECONNREFUSED') ||
        reason.message.includes('EADDRINUSE')
    )) {
        logger.error('[RECOVERY] Error crítico detectado, reiniciando proceso...');
        process.exit(1);
    }
});

process.on('SIGINT', async () => {
    const motivo = 'SIGINT (Ctrl+C o señal de apagado)';
    const fecha = new Date().toISOString();
    const uptime = process.uptime();
    const usuario = process.env.USER || process.env.USERNAME || 'desconocido';

    logger.warn(`Apagando servidor por ${motivo}`);
    logger.info(`Motivo: ${motivo} | Fecha: ${fecha} | Uptime: ${uptime}s | Usuario: ${usuario} | PID: ${process.pid}, PPID: ${process.ppid}`);
    console.trace('[DEBUG] SIGINT recibido');
    
    try {
        await whatsapp.destroy();
    } catch (e) {
        logger.error('Error destroying WhatsApp client:', e);
    }
    
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.warn('Recibido SIGTERM, apagando gracefully...');
    try {
        await whatsapp.destroy();
    } catch (e) {
        logger.error('Error destroying WhatsApp client on SIGTERM:', e);
    }
    process.exit(0);
});

// --- FIN DE COMENTARIOS IMPORTANTES ---


