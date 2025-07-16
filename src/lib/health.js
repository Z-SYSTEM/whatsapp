const { isClientReady, whatsapp } = require('./whatsapp');
const logger = require('./logger');
const { sendPushNotificationFCM, canSendPush } = require('./fcm');

let wasClientReady = true;
const HEALTH_CHECK_INTERVAL_SECONDS = parseInt(process.env.HEALTH_CHECK_INTERVAL_SECONDS, 10) || 30;

function startHealthCheck() {
    setInterval(async () => {
        try {
            logger.info(`[INTERVAL CHECK] Ejecutando health check cada ${HEALTH_CHECK_INTERVAL_SECONDS} segundos`);
            const clientReady = await isClientReady();
            if (!clientReady) {
                if (wasClientReady) {
                    logger.warn('WhatsApp client not ready (interval check), attempting to re-initialize...');
                    const deviceToken = process.env.FCM_DEVICE_TOKEN;
                    if (canSendPush && deviceToken) {
                        await sendPushNotificationFCM(
                            deviceToken,
                            'WhatsApp no disponible',
                            'El cliente WhatsApp no está listo. Se intentará re-inicializar.'
                        );
                    } else if (canSendPush && !deviceToken) {
                        logger.warn('FCM_DEVICE_TOKEN no está configurado en el entorno, no se envía notificación push.');
                    }
                }
                wasClientReady = false;
                try {
                    await whatsapp.initialize();
                    logger.info('Attempted to re-initialize WhatsApp client from interval.');
                } catch (err) {
                    logger.error('Error re-initializing WhatsApp client from interval:', err);
                }
            } else {
                wasClientReady = true;
                logger.info('WhatsApp client is ready (interval check).');
            }
        } catch (error) {
            logger.error('Error during interval check:', error.message);
        }
    }, HEALTH_CHECK_INTERVAL_SECONDS * 1000);
}

module.exports = { startHealthCheck };
