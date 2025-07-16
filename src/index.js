// Flag para controlar notificaciones de estado
let wasClientReady = true;
let restartCount = 0; // Contador de reinicios

const fs = require('fs');
const path = require('path');
let admin = null;
let canSendPush = false;
let sendPushNotificationFCM = async () => {};

// Buscar credencial en la ruta indicada por FCM_CREDENTIALS_PATH o en ../../firebase-credentials.json
const credPath = process.env.FCM_CREDENTIALS_PATH
    ? process.env.FCM_CREDENTIALS_PATH
    : path.resolve(__dirname, '../../firebase-credentials.json');
// Inicializa FCM solo si el archivo de credenciales existe
if (fs.existsSync(credPath)) {
    admin = require('firebase-admin');
    const serviceAccount = require(credPath);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    canSendPush = true;
    // Enviar notificación push usando FCM y agregando nombre de instancia
    sendPushNotificationFCM = async (deviceToken, title, body) => {
        const botName = process.env.BOT_NAME || 'desconocido';
        const message = {
            token: deviceToken,
            notification: {
                title: `${title} (${botName})`,
                body: `${body} [Instancia: ${botName}]`
            },
            data: {
                botName: botName
            }
        };
        logger.info('[FCM] Payload a enviar: ' + JSON.stringify(message));
        try {
            const response = await admin.messaging().send(message);
            logger.info('[FCM] Respuesta FCM: ' + JSON.stringify(response));
        } catch (err) {
            logger.error('[FCM] Error enviando notificación FCM:', err.stack || err);
        }
    };
} else {
    // Si no hay credenciales, las notificaciones push quedan deshabilitadas
    logger.warn('No se encontró el archivo de credenciales FCM, las notificaciones push están deshabilitadas.');
}

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
const CHECK_INTERVAL_MINUTES = parseInt(process.env.WHATSAPP_CHECK_INTERVAL_MINUTES) || 2;

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
    console.log(`Server on port ${puerto}`);
    logger.info(`Server started on port ${puerto}`);
});

// Monitor de memoria cada 5 minutos

setInterval(() => {
    const memoryUsage = process.memoryUsage();
    const formatMB = (bytes) => (bytes / 1024 / 1024).toFixed(2);
    logger.info(`Memory Report - RSS: ${formatMB(memoryUsage.rss)}MB, Heap: ${formatMB(memoryUsage.heapUsed)}/${formatMB(memoryUsage.heapTotal)}MB, External: ${formatMB(memoryUsage.external)}MB`);
    // Alerta si el uso excede 1GB o si hay fuga de memoria
    if (memoryUsage.rss > 1024 * 1024 * 1024 || memoryUsage.heapUsed > memoryUsage.heapTotal * 0.95) {
        logger.error(`High memory usage or heap leak detected: RSS ${formatMB(memoryUsage.rss)}MB, Heap ${formatMB(memoryUsage.heapUsed)}/${formatMB(memoryUsage.heapTotal)}MB - Restarting process`);
        process.exit(1); // PM2 lo reiniciará automáticamente
    }
}, 5 * 60 * 1000); // cada 5 minutos

// Reinicio automático diario a las 3 AM
const RESTART_HOUR = 3;
setInterval(() => {
    const now = new Date();
    if (now.getHours() === RESTART_HOUR && now.getMinutes() === 0) {
        logger.info('Scheduled daily restart at 3 AM');
        setTimeout(() => process.exit(0), 5000); // Delay para completar logs
    }
}, 60 * 1000); // verificar cada minuto



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

setInterval(async () => {
    try {
        const clientReady = await isClientReady();
        if (!clientReady) {
            if (wasClientReady) {
                logger.warn('WhatsApp client not ready (interval check), attempting to re-initialize...');
                // Solo se envía notificación si hay credenciales y token configurado
                const deviceToken = process.env.FCM_DEVICE_TOKEN;
                if (canSendPush && deviceToken) {
                    await sendPushNotificationFCM(
                        deviceToken,
                        'WhatsApp no disponible',
                        'El cliente WhatsApp no está listo. Se intentará re-inicializar.'
                    );
                } else if (canSendPush && !deviceToken) {
                    // Si no hay token, no se envía notificación push
                    logger.warn('FCM_DEVICE_TOKEN no está configurado en el entorno, no se envía notificación push.');
                }
            }
            wasClientReady = false;
            try {
                await whatsapp.initialize();
                logger.info('Attempted to re-initialize WhatsApp client from interval.');
            } catch (err) {
                logger.error('Error re-initializing WhatsApp client from interval:', err);
                // Manejar SingletonLock específicamente aquí
                if (err.message && err.message.includes('SingletonLock')) {
                    logger.warn('SingletonLock detected during re-initialization, cleaning up...');
                    const { execSync } = require('child_process');
                    const fs = require('fs');
                    try {
                        execSync('pkill -f puppeteer || true', { stdio: 'ignore' });
                        execSync('pkill -f chrome || true', { stdio: 'ignore' });
                        const lockPath = '/root/app/yapai/.wwebjs_auth/session-cliente-2/SingletonLock';
                        if (fs.existsSync(lockPath)) {
                            fs.unlinkSync(lockPath);
                            logger.info('SingletonLock file removed');
                        }
                        // Intentar reinicializar después de limpiar
                        setTimeout(async () => {
                            try {
                                await whatsapp.initialize();
                                logger.info('WhatsApp re-initialized after SingletonLock cleanup');
                            } catch (retryErr) {
                                logger.error('Failed to re-initialize after cleanup:', retryErr);
                            }
                        }, 3000);
                    } catch (cleanupErr) {
                        logger.error('Error during SingletonLock cleanup:', cleanupErr);
                    }
                }
            }
        } else {
            if (!wasClientReady) {
                // Notificar recuperación solo si está habilitado y el token está configurado
                const deviceToken = process.env.FCM_DEVICE_TOKEN;
                if (canSendPush && deviceToken) {
                    await sendPushNotificationFCM(
                        deviceToken,
                        'WhatsApp en línea',
                        'El cliente WhatsApp volvió a estar disponible.'
                    );
                } else if (canSendPush && !deviceToken) {
                    logger.warn('FCM_DEVICE_TOKEN no está configurado en el entorno, no se envía notificación push.');
                }
            }
            wasClientReady = true;
            logger.info('WhatsApp client is ready (interval check).');
        }
    } catch (error) {
        logger.error('Error during interval check:', error.message);
    }
}, CHECK_INTERVAL_MINUTES * 60 * 1000);

// --- FIN DE COMENTARIOS IMPORTANTES ---
logger.info('Iniciando servidor WhatsApp API...');
logger.info(`Configuración: puerto=${puerto}, intervalo chequeo=${CHECK_INTERVAL_MINUTES} min`);
