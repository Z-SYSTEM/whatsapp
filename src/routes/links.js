require('dotenv').config()
const {Router} = require('express');
const {whatsapp, MessageMedia} = require('../lib/whatsapp');
const router = Router();

router.post('/send', async (req, res) => {
    // Requiere header Authorization: Bearer <token>
    // phoneNumber, message, imageUrl y opcionalmente pdfUrl vienen en el body
    console.log('Received request to /send');
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ res: false, error: 'No token provided' });
    }

    const tokenUser = authHeader.split(' ')[1];
    const validToken = process.env.TOKENACCESS;

    if (tokenUser !== validToken) {
        return res.status(403).json({ res: false, error: 'Invalid token' });
    }

    const { phoneNumber, message, imageUrl, pdfUrl } = req.body;

    if (!phoneNumber || (!message && !imageUrl && !pdfUrl)) {
        return res.status(400).json({ res: false, error: 'Missing phoneNumber and message, imageUrl or pdfUrl' });
    }

    try {
        const chatId = phoneNumber.substring(1) + "@c.us";
        const number_details = await whatsapp.getNumberId(chatId);

        if (number_details) {
            if (pdfUrl) {
                const media = await MessageMedia.fromUrl(pdfUrl, { mimeType: 'application/pdf' });
                await whatsapp.sendMessage(chatId, media, { caption: message || '' });
            } else if (imageUrl) {
                const media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
                await whatsapp.sendMessage(chatId, media, { caption: message || '' });
            } else {
                await whatsapp.sendMessage(chatId, message);
            }
            return res.json({ status: true });
        } else {
            return res.status(404).json({ res: false, error: 'Number not found on WhatsApp' });
        }
    } catch (error) {
        console.error('Error sending message:', error);
        return res.status(500).json({ res: false, error: 'Internal server error' });
    }
});

module.exports = router;