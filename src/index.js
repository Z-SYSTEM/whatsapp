// Flag para controlar notificaciones de estado
let wasClientReady = true;
let restartCount = 0; // Contador de reinicios


// Modularización
const { sendPushNotificationFCM, canSendPush } = require('./lib/fcm');
const { startMemoryMonitor } = require('./lib/memoryMonitor');
const { startHealthCheck } = require('./lib/health');

// El token del dispositivo receptor debe venir de la variable de entorno FCM_DEVICE_TOKEN
// El nombre de la instancia del bot debe venir de la variable de entorno BOT_NAME
const express = require('express');
const { whatsapp, whatsappState, isClientReady } = require('./lib/whatsapp');
const logger = require('./lib/logger');
const rateLimit = require('express-rate-limit');
const app = express();

if (!process.env.PORT || !process.env.TOKENACCESS) {
    logger.error('Faltan variables de entorno requeridas (PORT, TOKENACCESS)');
    process.exit(1);
}

// Puerto y otros parámetros importantes se configuran por variables de entorno
const puerto = parseInt(process.env.PORT);
const HEALTH_CHECK_INTERVAL_SECONDS = parseInt(process.env.HEALTH_CHECK_INTERVAL_SECONDS, 10) || 30;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use('/api/send', rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 10 // máximo 10 requests por minuto
}));

// Rutas
app.use('/api', require('./routes/links'));

whatsapp.initialize();


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



process.on('uncaughtException', async (err) => {
    logger.error('Uncaught Exception:', err);
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

// ...existing code...

// --- FIN DE COMENTARIOS IMPORTANTES ---
logger.info('Iniciando servidor WhatsApp API...');
logger.info(`Configuración: puerto=${puerto}, intervalo chequeo=${HEALTH_CHECK_INTERVAL_SECONDS} seg`);
