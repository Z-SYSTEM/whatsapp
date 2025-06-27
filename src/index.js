require('dotenv').config();
const express = require('express');
const { whatsapp, whatsappState, isClientReady } = require('./lib/whatsapp');
const logger = require('./lib/logger');
const rateLimit = require('express-rate-limit');
const app = express();

if (!process.env.PORT || !process.env.TOKENACCESS) {
    logger.error('Faltan variables de entorno requeridas (PORT, TOKENACCESS)');
    process.exit(1);
}

const puerto = parseInt(process.env.PORT);
const CHECK_INTERVAL_MINUTES = parseInt(process.env.WHATSAPP_CHECK_INTERVAL_MINUTES) || 2;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use('/api/send', rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 10 // máximo 10 requests por minuto
}));

// Rutas
app.use('/api', require('./routes/links'));

whatsapp.initialize();

app.listen(puerto, () => {
    console.log(`Server on port ${puerto}`);
});

process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', reason);

    if (reason && reason.message && reason.message.includes('Failed to launch the browser process')) {
        logger.error('Bloqueando salida por fallo de Puppeteer');
        return;
    }
});
process.on('SIGINT', async () => {
    const motivo = 'SIGINT (Ctrl+C o señal de apagado)';
    const fecha = new Date().toISOString();
    const uptime = process.uptime();
    const usuario = process.env.USER || process.env.USERNAME || 'desconocido';

    logger.warn(`Apagando servidor por ${motivo}`);
    logger.info(`Motivo: ${motivo} | Fecha: ${fecha} | Uptime: ${uptime}s | Usuario: ${usuario} | PID: ${process.pid}, PPID: ${process.ppid}`);
    console.trace('[DEBUG] SIGINT recibido');
    await whatsapp.destroy();
    process.exit(0);
});

setInterval(async () => {
    try {
        const clientReady = await isClientReady();
        if (!clientReady) {
            logger.warn('WhatsApp client not ready (interval check), attempting to re-initialize...');
            try {
                await whatsapp.initialize();
                logger.info('Attempted to re-initialize WhatsApp client from interval.');
            } catch (err) {
                logger.error('Error re-initializing WhatsApp client from interval:', err);
            }
        } else {
            logger.info('WhatsApp client is ready (interval check).');
        }
    } catch (error) {
        logger.error('Error during interval check:', error.message);
    }
}, CHECK_INTERVAL_MINUTES * 60 * 1000);

logger.info('Iniciando servidor WhatsApp API...');
logger.info(`Configuración: puerto=${puerto}, intervalo chequeo=${CHECK_INTERVAL_MINUTES} min`);
