require('dotenv').config()
const {Router} = require('express');
const { whatsapp, MessageMedia, whatsappState, isClientReady, handleSessionError } = require('../lib/whatsapp');
const logger = require('../lib/logger');
const router = Router();

router.post('/send', async (req, res) => {
    logger.info('Received request to /send');

    // Verificación de token de acceso
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('No token provided');
        return res.status(401).json({ res: false, error: 'No token provided' });
    }

    const tokenUser = authHeader.split(' ')[1];
    const validToken = process.env.TOKENACCESS;

    if (tokenUser !== validToken) {
        logger.warn('Invalid token');
        return res.status(403).json({ res: false, error: 'Invalid token' });
    }

    // Verificación más robusta del estado del cliente
    const clientReady = await isClientReady();
    if (!clientReady) {
        logger.warn('WhatsApp client not ready or session closed');
        return res.status(503).json({ res: false, error: 'WhatsApp client not connected or session closed' });
    }

    const { phoneNumber, message, imageUrl, pdfUrl } = req.body;

    // Validación de parámetros
    if (!phoneNumber || (!message && !imageUrl && !pdfUrl)) {
        logger.warn('Missing phoneNumber and message, imageUrl or pdfUrl');
        return res.status(400).json({ res: false, error: 'Missing phoneNumber and message, imageUrl or pdfUrl' });
    }

    try {
        const chatId = phoneNumber.substring(1) + "@c.us";
        logger.info(`Looking up WhatsApp ID for ${chatId}`);

        // Control de destinatarios no válidos
        if (chatId === 'status@c.us' || chatId === 'status@broadcast') {
            logger.warn('Intento de enviar mensaje a destinatario no válido:', chatId);
            return res.status(400).json({ error: 'Destinatario no permitido.' });
        }

        const number_details = await whatsapp.getNumberId(chatId);

        if (number_details) {
            if (pdfUrl) {
                logger.info(`Sending PDF to ${chatId}`);
                const media = await MessageMedia.fromUrl(pdfUrl, { mimeType: 'application/pdf' });
                await whatsapp.sendMessage(chatId, media, { caption: message || '' });
            } else if (imageUrl) {
                logger.info(`Sending image to ${chatId}`);
                const media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
                await whatsapp.sendMessage(chatId, media, { caption: message || '' });
            } else {
                logger.info(`Sending text message to ${chatId}: ${message}`);
                await whatsapp.sendMessage(chatId, message);
            }
            logger.info(`Message sent to ${chatId}`);
            return res.json({ status: true });
        } else {
            logger.warn(`Number not found on WhatsApp: ${chatId}`);
            return res.status(404).json({ res: false, error: 'Number not found on WhatsApp' });
        }
    } catch (error) {
        logger.error(`Error sending message: ${error.stack || error}`);
        
        // Verificar si es error de sesión cerrada
        if (handleSessionError(error)) {
            logger.warn(`Session lost during message send to ${chatId}, will auto-reconnect`);
            return res.status(503).json({ 
                res: false, 
                error: 'WhatsApp session temporarily unavailable, please retry in a few seconds',
                retry: true 
            });
        }
        
        return res.status(500).json({ res: false, error: 'Internal server error' });
    }
});

router.get('/test', async (req, res) => {
    logger.info('Health check on /test');
    
    try {
        const clientReady = await isClientReady();
        if (clientReady) {
            logger.info('WhatsApp client ready - test passed');
            res.status(200).json({ status: 'ok', whatsapp: 'ready' });
        } else {
            logger.warn('WhatsApp client not ready - test failed');
            res.status(503).json({ status: 'error', whatsapp: 'not ready' });
        }
    } catch (error) {
        logger.error(`Error checking client status: ${error.message}`);
        res.status(503).json({ status: 'error', whatsapp: 'check failed' });
    }
});

module.exports = router;