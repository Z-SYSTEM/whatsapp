const axios = require('axios');
const logger = require('../logger');
const { whatsapp, whatsappState, MessageMedia } = require('./whatsapp-client');
const { updateLastOperation } = require('./whatsapp-utils');

whatsapp.on('call', async (call) => {
    logger.info(`Incoming call from ${call.from} (${call.isVideo ? 'video' : 'voice'})`);
    try {
        await call.reject();
        logger.info(`Call from ${call.from} rejected.`);
        await whatsapp.sendMessage(call.from, 'No se pueden recibir llamadas');
        logger.info(`Sent "No se pueden recibir llamadas" to ${call.from}`);
        updateLastOperation();
    } catch (err) {
        logger.error(`Error handling call: ${err.stack || err}`);
        return;
    }
    if (process.env.ONMESSAGE) {
        const data = {
            phoneNumber: `${call.from}`,
            message: `Llamada rechazada del número: ${call.from}`,
            type: 'call',
            isVideo: call.isVideo,
            timestamp: new Date().toISOString()
        };
        try {
            await axios.post(process.env.ONMESSAGE, data, {
                headers: { 'Content-Type': 'application/json' }
            });
            logger.info(`Posted call info to ${process.env.ONMESSAGE}`);
        } catch (err) {
            logger.error(`Error posting call info: ${err.stack || err}`);
        }
    }
});

whatsapp.on('message', async (msg) => {
    logger.info(`Received message from ${msg.from} of type ${msg.type}`);
    if (msg.from === 'status@broadcast' || msg.from === 'status@c.us') {
        logger.info(`Estado ignorado de ${msg.from} | type: ${msg.type} | id: ${msg.id ? msg.id._serialized : 'N/A'}`);
        return;
    }
    const ignoredTypes = [
        'call_log', 'e2e_notification', 'revoked', 'multi_vcard',
        'order', 'product', 'list', 'buttons_response', 'list_response',
        'poll', 'poll_response'
    ];
    if (ignoredTypes.includes(msg.type)) {
        logger.info(`Mensaje ignorado de tipo ${msg.type} de ${msg.from}`);
        return;
    }
    if (process.env.ONMESSAGE) {
        let match = msg.from.match(/^([^@]+)@/);
        let phoneNumber = match ? match[1] : null;
        let url = process.env.ONMESSAGE;
        let payload = {
            phoneNumber: `${phoneNumber}`,
            type: msg.type,
            from: msg.from,
            id: msg.id ? msg.id._serialized : undefined,
            timestamp: msg.timestamp,
            body: '',
            hasMedia: msg.hasMedia || false
        };
        switch (msg.type) {
            case 'chat':
                payload.body = msg.body || '';
                break;
            case 'image':
                payload.body = msg.caption || '';
                try {
                    const media = await msg.downloadMedia();
                    if (media) {
                        payload.data = {
                            mimetype: media.mimetype,
                            filename: media.filename || undefined,
                            data: media.data
                        };
                    }
                } catch (err) {
                    logger.error(`Error descargando imagen: ${err.stack || err}`);
                }
                break;
            case 'video':
                payload.body = msg.caption || '';
                try {
                    const media = await msg.downloadMedia();
                    if (media) {
                        payload.data = {
                            mimetype: media.mimetype,
                            filename: media.filename || undefined,
                            data: media.data
                        };
                    }
                } catch (err) {
                    logger.error(`Error descargando video: ${err.stack || err}`);
                }
                break;
            case 'audio':
            case 'ptt':
                payload.body = '';
                try {
                    const media = await msg.downloadMedia();
                    if (media) {
                        payload.data = {
                            mimetype: media.mimetype,
                            filename: media.filename || undefined,
                            data: media.data
                        };
                    }
                } catch (err) {
                    logger.error(`Error descargando audio: ${err.stack || err}`);
                }
                break;
            case 'document':
                payload.body = msg.caption || '';
                try {
                    const media = await msg.downloadMedia();
                    if (media) {
                        payload.data = {
                            mimetype: media.mimetype,
                            filename: msg.filename || media.filename || undefined,
                            data: media.data
                        };
                    }
                } catch (err) {
                    logger.error(`Error descargando documento: ${err.stack || err}`);
                }
                break;
            case 'sticker':
                payload.body = '';
                try {
                    const media = await msg.downloadMedia();
                    if (media) {
                        payload.data = {
                            mimetype: media.mimetype,
                            filename: media.filename || undefined,
                            data: media.data
                        };
                    }
                } catch (err) {
                    logger.error(`Error descargando sticker: ${err.stack || err}`);
                }
                break;
            case 'location':
                payload.data = {
                    latitude: msg.location?.latitude,
                    longitude: msg.location?.longitude,
                    description: msg.location?.description
                };
                break;
            case 'contact':
            case 'vcard':
                payload.data = {
                    vcard: msg.vcard || ''
                };
                break;
            case 'ciphertext':
                data.ciphertext = true;
                break;
            default:
                break;
        }
        logger.info(`Posting message to ONMESSAGE (${url}): ${JSON.stringify(data)}`);
        let config = {
            headers: {
                'Content-type': 'application/json'
            }
        };
        try {
            await axios.post(url, JSON.stringify(payload), config);
            logger.info(`Posted message info to ${url} | id: ${payload.id} | type: ${payload.type} | phoneNumber: ${payload.phoneNumber}`);
            updateLastOperation();
        } catch (err) {
            logger.error(`Error posting message info: ${err.stack || err} | id: ${payload.id} | type: ${payload.type} | phoneNumber: ${payload.phoneNumber}`);
        }
    }
});
