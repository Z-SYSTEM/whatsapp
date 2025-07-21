const { isClientReady, whatsapp } = require('./whatsapp');
const logger = require('./logger');
const { sendPushNotificationFCM, canSendPush } = require('./fcm');


let wasClientReady = true;
let failedAttempts = 0;
const MAX_FAILED_ATTEMPTS = 3;
const HEALTH_CHECK_INTERVAL_SECONDS = parseInt(process.env.HEALTH_CHECK_INTERVAL_SECONDS, 10) || 30;


function startHealthCheck() {
    setInterval(async () => {
        try {
            const clientReady = await isClientReady();
            if (!clientReady) {
                failedAttempts++;
                logger.warn(`[HEALTH] Cliente WhatsApp no está listo, intento fallido #${failedAttempts}`);
                if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
                    logger.warn(`[HEALTH] Se alcanzaron ${MAX_FAILED_ATTEMPTS} intentos fallidos. Enviando notificación FCM.`);
                    const deviceToken = process.env.FCM_DEVICE_TOKEN;
                    if (canSendPush && deviceToken) {
                        await sendPushNotificationFCM(
                            deviceToken,
                            `WhatsApp no disponible (${process.env.BOT_NAME || ''})`,
                            `El cliente WhatsApp no está listo. Se intentó re-inicializar ${failedAttempts} veces. [Instancia: ${process.env.BOT_NAME || ''}]`
                        );
                    } else if (canSendPush && !deviceToken) {
                        logger.warn('FCM_DEVICE_TOKEN no está configurado en el entorno, no se envía notificación push.');
                    }
                    failedAttempts = 0; // Reinicia el contador tras notificar
                }
                wasClientReady = false;
                try {
                    // Limpieza de SingletonLock antes de reiniciar
                    const fs = require('fs');
                    const lockPath = '/root/app/yapai/.wwebjs_auth/session-cliente-2/SingletonLock';
                    if (fs.existsSync(lockPath)) {
                        try {
                            fs.unlinkSync(lockPath);
                            logger.warn('[HEALTH] Archivo SingletonLock eliminado antes de reiniciar WhatsApp.');
                        } catch (e) {
                            logger.error('[HEALTH] Error eliminando SingletonLock:', e);
                        }
                    }
                    await whatsapp.initialize();
                    logger.info('Attempted to re-initialize WhatsApp client from interval.');
                } catch (err) {
                    logger.error('Error re-initializing WhatsApp client from interval:', err);
                }
            } else {
                // Solo log si se recupera de un estado no listo
                if (!wasClientReady && failedAttempts > 0) {
                    logger.info(`[HEALTH] Cliente WhatsApp recuperado, reiniciando contador de fallos.`);
                }
                failedAttempts = 0;
                wasClientReady = true;
                // No log si está listo
            }
        } catch (error) {
            logger.error('Error during interval check:', error.message);
        }
    }, HEALTH_CHECK_INTERVAL_SECONDS * 1000);
}

module.exports = { startHealthCheck };
