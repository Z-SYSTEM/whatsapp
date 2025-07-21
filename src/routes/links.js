require('dotenv').config()
const {Router} = require('express');
const whatsappModule = require('../lib/whatsapp');
let recoverySequence;
try {
    recoverySequence = whatsappModule.recoverySequence;
} catch (e) {
    recoverySequence = null;
}
const logger = require('../lib/logger');
const router = Router();

router.post('/send', async (req, res) => {
    // Eliminado log de IP para /send por solicitud

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
    const clientReady = await whatsappModule.isClientReady(whatsappModule.whatsapp, whatsappModule.whatsappState);
    if (!clientReady) {
        logger.warn('WhatsApp client not ready or session closed');
        return res.status(503).json({ res: false, error: 'WhatsApp client not connected or session closed' });
    }

    const { phoneNumber, message, imageUrl, imageUrls, pdfUrl } = req.body;

    // Validación 1: phoneNumber es obligatorio
    if (!phoneNumber) {
        logger.warn('Missing phoneNumber');
        return res.status(400).json({ res: false, error: 'phoneNumber is required' });
    }

    // Validación 2: phoneNumber debe ser string
    if (typeof phoneNumber !== 'string') {
        logger.warn('Invalid phoneNumber type');
        return res.status(400).json({ res: false, error: 'phoneNumber must be a string' });
    }

    // Validación 3: imageUrls debe ser array si se proporciona
    if (imageUrls && !Array.isArray(imageUrls)) {
        logger.warn('Invalid imageUrls type');
        return res.status(400).json({ res: false, error: 'imageUrls must be an array' });
    }

    // Validación 4: imageUrls no puede estar vacío si se proporciona
    if (imageUrls && Array.isArray(imageUrls) && imageUrls.length === 0) {
        logger.warn('Empty imageUrls array');
        return res.status(400).json({ res: false, error: 'imageUrls array cannot be empty' });
    }

    // Validación 5: cada URL en imageUrls debe ser string
    if (imageUrls && Array.isArray(imageUrls)) {
        for (let i = 0; i < imageUrls.length; i++) {
            if (typeof imageUrls[i] !== 'string') {
                logger.warn(`Invalid imageUrls[${i}] type`);
                return res.status(400).json({ res: false, error: `imageUrls[${i}] must be a string` });
            }
        }
    }

    // Validación 6: debe tener al menos un contenido para enviar
    if (!message && !imageUrl && !imageUrls && !pdfUrl) {
        logger.warn('No content to send');
        return res.status(400).json({ res: false, error: 'At least one of: message, imageUrl, imageUrls, or pdfUrl is required' });
    }

    // Declarar chatId fuera del try para que esté disponible en el catch
    let chatId;
    
    let triedRecovery = false;
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            chatId = phoneNumber.substring(1) + "@c.us";
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
                } else if (imageUrls && Array.isArray(imageUrls) && imageUrls.length > 0) {
                    logger.info(`Sending ${imageUrls.length} images to ${chatId}`);
                    for (let i = 0; i < imageUrls.length; i++) {
                        try {
                            const media = await MessageMedia.fromUrl(imageUrls[i], { unsafeMime: true });
                            // Solo enviar caption en la primera imagen
                            const caption = (i === 0 && message) ? message : '';
                            await whatsapp.sendMessage(chatId, media, { caption });
                            logger.info(`Image ${i + 1}/${imageUrls.length} sent to ${chatId}`);
                            // Pequeña pausa entre imágenes para evitar spam
                            if (i < imageUrls.length - 1) {
                                await new Promise(resolve => setTimeout(resolve, 1000));
                            }
                        } catch (imageError) {
                            logger.error(`Error sending image ${i + 1}: ${imageError.message}`);
                            // Continuar con las siguientes imágenes en caso de error
                        }
                    }
                } else if (imageUrl) {
                    logger.info(`Sending single image to ${chatId}`);
                    const media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
                    await whatsapp.sendMessage(chatId, media, { caption: message || '' });
                } else if (message) {
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
            lastError = error;
            logger.error(`Error sending message (attempt ${attempt + 1}): ${error.stack || error}`);
            // Verificar si es error de sesión cerrada
            if (handleSessionError(error)) {
                logger.warn(`Session lost during message send to ${chatId || phoneNumber}, will auto-reconnect`);
                if (!triedRecovery && recoverySequence) {
                    triedRecovery = true;
                    await recoverySequence();
                    // Esperar 2 segundos tras recovery para intentar reenvío
                    await new Promise(res => setTimeout(res, 2000));
                    continue; // Reintentar el envío
                } else {
                    return res.status(503).json({ 
                        res: false, 
                        error: 'WhatsApp session temporarily unavailable, please retry in a few seconds',
                        retry: true 
                    });
                }
            } else {
                break; // No es error de sesión, no reintentar
            }
        }
    }
    // Si llega aquí, falló ambos intentos
    return res.status(500).json({ res: false, error: 'Internal server error', details: lastError && (lastError.stack || lastError.message || lastError) });
});

router.get('/test', async (req, res) => {
    let clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || (req.connection.socket ? req.connection.socket.remoteAddress : null);
    if (clientIp && clientIp.startsWith('::ffff:')) {
        clientIp = clientIp.replace('::ffff:', '');
    }
    logger.info(`Health check on /test from IP: ${clientIp}`);
    
    try {
        if (!whatsappModule.whatsapp) {
            logger.error(`Health check on /test from IP: ${clientIp} - whatsapp client is undefined`);
            return res.status(503).json({ status: 'error', whatsapp: 'client undefined' });
        }
        if (!whatsappModule.whatsappState) {
            logger.error(`Health check on /test from IP: ${clientIp} - whatsappState is undefined`);
            return res.status(503).json({ status: 'error', whatsapp: 'state undefined' });
        }
        const clientReady = await whatsappModule.isClientReady(whatsappModule.whatsapp, whatsappModule.whatsappState);
        if (clientReady) {
            res.status(200).json({ status: 'ok', whatsapp: 'ready' });
        } else {
            logger.warn(`Health check on /test from IP: ${clientIp} client not ready - test failed`);
            res.status(503).json({ status: 'error', whatsapp: 'not ready' });
        }
    } catch (error) {
        logger.error(`Health check on /test from IP: ${clientIp} Error checking client status: ${error.message}`);
        res.status(503).json({ status: 'error', whatsapp: 'check failed' });
    }
});

module.exports = router;