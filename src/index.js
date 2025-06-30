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
    logger.info(`Server started on port ${puerto}`);
});

// Monitor de memoria cada 5 minutos
setInterval(() => {
    const memoryUsage = process.memoryUsage();
    const formatMB = (bytes) => (bytes / 1024 / 1024).toFixed(2);
    
    logger.info(`Memory Report - RSS: ${formatMB(memoryUsage.rss)}MB, Heap: ${formatMB(memoryUsage.heapUsed)}/${formatMB(memoryUsage.heapTotal)}MB, External: ${formatMB(memoryUsage.external)}MB`);
    
    // Alerta si el uso excede 1GB
    if (memoryUsage.rss > 1024 * 1024 * 1024) {
        logger.error(`High memory usage detected: ${formatMB(memoryUsage.rss)}MB - Restarting process`);
        process.exit(1); // PM2 lo reiniciará automáticamente
    }
}, 5 * 60 * 1000); // cada 5 minutos

// Reinicio automático diario a las 3 AM
const RESTART_HOUR = 3;
setInterval(() => {
    const now = new Date();
    if (now.getHours() === RESTART_HOUR && now.getMinutes() === 0) {
        logger.info('Scheduled daily restart at 3 AM');
        setTimeout(() => process.exit(0), 5000); // Delay para completar logs
    }
}, 60 * 1000); // verificar cada minuto

process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    // No cerrar el proceso por errores no críticos
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
    
    try {
        await whatsapp.destroy();
    } catch (e) {
        logger.error('Error destroying WhatsApp client:', e);
    }
    
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.warn('Recibido SIGTERM, apagando gracefully...');
    try {
        await whatsapp.destroy();
    } catch (e) {
        logger.error('Error destroying WhatsApp client on SIGTERM:', e);
    }
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
                
                // Manejar SingletonLock específicamente aquí
                if (err.message && err.message.includes('SingletonLock')) {
                    logger.warn('SingletonLock detected during re-initialization, cleaning up...');
                    const { execSync } = require('child_process');
                    const fs = require('fs');
                    
                    try {
                        execSync('pkill -f puppeteer || true', { stdio: 'ignore' });
                        execSync('pkill -f chrome || true', { stdio: 'ignore' });
                        
                        const lockPath = '/root/app/yapai/.wwebjs_auth/session-cliente-2/SingletonLock';
                        if (fs.existsSync(lockPath)) {
                            fs.unlinkSync(lockPath);
                            logger.info('SingletonLock file removed');
                        }
                        
                        // Intentar reinicializar después de limpiar
                        setTimeout(async () => {
                            try {
                                await whatsapp.initialize();
                                logger.info('WhatsApp re-initialized after SingletonLock cleanup');
                            } catch (retryErr) {
                                logger.error('Failed to re-initialize after cleanup:', retryErr);
                            }
                        }, 3000);
                        
                    } catch (cleanupErr) {
                        logger.error('Error during SingletonLock cleanup:', cleanupErr);
                    }
                }
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
