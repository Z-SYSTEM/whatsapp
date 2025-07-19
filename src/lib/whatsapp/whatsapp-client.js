const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const logger = require('../logger');
require('dotenv').config();

const whatsapp = new Client({
  puppeteer: {
    ...(process.platform === 'linux' && {
      executablePath: '/root/.cache/puppeteer/chrome/linux-137.0.7151.119/chrome-linux64/chrome'
    }),
    headless: true,
    dumpio: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  },
  authStrategy: new LocalAuth({
    clientId: process.env.BOT_NAME || "default-bot"
  }),
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
  }
});

const whatsappState = { isReady: false, wasEverReady: false };

whatsapp.on('qr', async qr => {
    logger.info('QR code generated for WhatsApp session');
    qrcode.generate(qr, { small: true });
    logger.info(qr);
});

whatsapp.on('ready', () => {
    logger.info('WhatsApp client is ready!');
    whatsappState.isReady = true;
    whatsappState.wasEverReady = true;
});

whatsapp.on('disconnected', (reason) => {
    logger.warn(`WhatsApp client disconnected: ${reason}`);
    whatsappState.isReady = false;
});

whatsapp.on('auth_failure', (msg) => {
    logger.error(`Authentication failure: ${msg}`);
    whatsappState.isReady = false;
});

module.exports = { whatsapp, MessageMedia, whatsappState };
