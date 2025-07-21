let wasClientReady = true;
let failedAttempts = 0;
const MAX_FAILED_ATTEMPTS = 3;
const HEALTH_CHECK_INTERVAL_SECONDS = parseInt(process.env.HEALTH_CHECK_INTERVAL_SECONDS, 10) || 30;

function startHealthCheck({
    isClientReady,
    whatsapp,
    whatsappState,
    logger,
    sendPushNotificationFCMWrapper,
    recoverySequence
}) {
    setInterval(async () => {
        try {
            if (!whatsappState.wasEverReady) return;
            const clientReady = await isClientReady(whatsapp, whatsappState);
            if (!clientReady) {
                failedAttempts++;
                logger.warn(`[HEALTH] Cliente WhatsApp no está listo, intento fallido #${failedAttempts}`);
                if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
                    logger.warn(`[HEALTH] Se alcanzaron ${MAX_FAILED_ATTEMPTS} intentos fallidos. Enviando notificación FCM.`);
                    const deviceToken = process.env.FCM_DEVICE_TOKEN;
                    if (sendPushNotificationFCMWrapper && deviceToken) {
                        await sendPushNotificationFCMWrapper(
                            deviceToken,
                            `WhatsApp no disponible (${process.env.BOT_NAME || ''})`,
                            `El cliente WhatsApp no está listo. Se intentó re-inicializar ${failedAttempts} veces. [Instancia: ${process.env.BOT_NAME || ''}]`
                        );
                    } else if (!deviceToken) {
                        logger.warn('FCM_DEVICE_TOKEN no está configurado en el entorno, no se envía notificación push.');
                    }
                    failedAttempts = 0; // Reinicia el contador tras notificar
                }
                wasClientReady = false;
                try {
                    // Recovery unificado
                    await recoverySequence();
                } catch (err) {
                    logger.error('Error re-initializing WhatsApp client from interval:', err && (err.stack || err.message) ? (err.stack || err.message) : JSON.stringify(err));
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
            logger.error('Error during interval check:', error && (error.stack || error.message) ? (error.stack || error.message) : JSON.stringify(error));
        }
    }, HEALTH_CHECK_INTERVAL_SECONDS * 1000);
}

module.exports = { startHealthCheck };
