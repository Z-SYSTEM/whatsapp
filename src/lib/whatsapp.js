var axios = require('axios');
require('dotenv').config()
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth, MessageMedia  } = require('whatsapp-web.js');
const { config } = require('dotenv');
const logger = require('./logger');

const whatsapp = new Client({
  puppeteer: {
		args: ['--no-sandbox', '--disable-setuid-sandbox'],
	},
  authStrategy: new LocalAuth({
    clientId: "cliente-2"
  }),
  webVersionCache: { type: 'remote', remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html', }
    
});

whatsapp.on('qr', qr => {
    logger.info('QR code generated for WhatsApp session');
    qrcode.generate(qr, { small: true });
    logger.info(qr);
});

whatsapp.on('ready', () => {
    logger.info('WhatsApp client is ready!');
});

whatsapp.on('disconnected', (reason) => {
    logger.warn(`WhatsApp client disconnected: ${reason}`);
});

whatsapp.on('auth_failure', (msg) => {
    logger.error(`Authentication failure: ${msg}`);
});

whatsapp.on('call', async(call) => {
    logger.info(`Incoming call from ${call.from}`);
    // Si tengo definido process.env.ONMESSAGE
    if (process.env.ONMESSAGE) {
        call.reject();
        let config = {
            headers: { 'Content-type': 'application/json' }
        }
        var data = JSON.stringify({
            'phoneNumber': `${call.from}`,
            'message': `Llamada recibida del número: ${call.from}`,
            'type' : 'call'
        });
        logger.info(`Posting call info to ${process.env.ONMESSAGE}`);
        try {
            await axios.post(process.env.ONMESSAGE, data, config);
        } catch (err) {
            logger.error(`Error posting call info: ${err.stack || err}`);
        }
    }
});

whatsapp.on( 'message', async (msg) => {
    logger.info(`Received message from ${msg.from} of type ${msg.type}`);
    if (process.env.ONMESSAGE) {
        let match = msg.from.match(/^([^@]+)@/);
        let phoneNumber = match ? match[1] : null;
        let url = process.env.ONMESSAGE;
        let data = {
            phoneNumber: `${phoneNumber}`,
            type: '',
        };

        switch (msg.type) {
            case 'image':
                data.type = 'image';
                data.imagen = msg.hasMedia ? true : false;
                data.texto = msg.body || '';
                break;
            case 'audio':
                data.type = 'audio';
                break;
            default:
                data.type = 'chat';
                data.texto = msg.body || '';
                break;
        }

        let config = {
            headers: {
                'Content-type': 'application/json'
            }
        };
        try {
            await axios.post(url, JSON.stringify(data), config);
            logger.info(`Posted message info to ${url}`);
        } catch (err) {
            logger.error(`Error posting message info: ${err.stack || err}`);
        }
    }
});

module.exports = {whatsapp,MessageMedia};




