require('dotenv').config()
const express = require('express');
const { whatsapp, whatsappState } = require('./lib/whatsapp');
const logger = require('./lib/logger');
const app = express()

const puerto = parseInt(process.env.PORT);

// Lee el intervalo de chequeo desde .env (en minutos), por defecto 2 si no está definido
const CHECK_INTERVAL_MINUTES = parseInt(process.env.WHATSAPP_CHECK_INTERVAL_MINUTES) || 2;

app.use(express.urlencoded({extended: false}));
app.use(express.json());

//rutas
app.use('/api', require('./routes/links'));

whatsapp.initialize()

app.listen(puerto, ()=>{
  console.log(`Server on port ${puerto}`)
});

process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', reason);
});

setInterval(async () => {
    if (!whatsappState.isReady) {
        logger.warn('WhatsApp client not ready (interval), trying to re-initialize...');
        try {
            await whatsapp.initialize();
            logger.info('Attempted to re-initialize WhatsApp client from interval.');
        } catch (err) {
            logger.error('Error re-initializing WhatsApp client from interval:', err);
        }
    } else {
        logger.info('WhatsApp client is ready (interval check).');
    }
}, CHECK_INTERVAL_MINUTES * 60 * 1000); // configurable por .env
