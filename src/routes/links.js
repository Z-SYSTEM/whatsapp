require('dotenv').config()
const {Router} = require('express');
const {whatsapp, MessageMedia} = require('../lib/whatsapp');
const logger = require('../lib/logger');
const router = Router();

router.post('/send', async (req, res) => {
    logger.info('Received request to /send');
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

    const { phoneNumber, message, imageUrl, pdfUrl } = req.body;

    if (!phoneNumber || (!message && !imageUrl && !pdfUrl)) {
        logger.warn('Missing phoneNumber and message, imageUrl or pdfUrl');
        return res.status(400).json({ res: false, error: 'Missing phoneNumber and message, imageUrl or pdfUrl' });
    }

    try {
        const chatId = phoneNumber.substring(1) + "@c.us";
        logger.info(`Looking up WhatsApp ID for ${chatId}`);
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
                logger.info(`Sending text message to ${chatId}`);
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
        return res.status(500).json({ res: false, error: 'Internal server error' });
    }
});

router.get('/test', (req, res) => {
    logger.info('Health check on /test');
    res.status(200).json({ status: 'ok' });
});

module.exports = router;