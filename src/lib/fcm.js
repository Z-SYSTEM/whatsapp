const fs = require('fs');
const path = require('path');
const logger = require('../lib/logger');


let admin = null;
let canSendPush = false;
let sendPushNotificationFCM = async () => {};

const credPath = process.env.FCM_CREDENTIALS_PATH
    ? process.env.FCM_CREDENTIALS_PATH
    : path.resolve(__dirname, '../../../firebase-credentials.json');

if (fs.existsSync(credPath)) {
    admin = require('firebase-admin');
    const serviceAccount = require(credPath);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    canSendPush = true;
    sendPushNotificationFCM = async (deviceToken, title, body) => {
        const botName = process.env.BOT_NAME || 'desconocido';
        const message = {
            token: deviceToken,
            notification: {
                title: `${title} (${botName})`,
                body: `${body} [Instancia: ${botName}]`
            },
            data: {
                botName: botName,
                title: title,
                body: body
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
    logger.warn('No se encontró el archivo de credenciales FCM, las notificaciones push están deshabilitadas.');
}

// Exporta siempre funciones y flags ya inicializadas
module.exports = {
    sendPushNotificationFCM: (...args) => sendPushNotificationFCM(...args),
    get canSendPush() { return canSendPush; }
};
