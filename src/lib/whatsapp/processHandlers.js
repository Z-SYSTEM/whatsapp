const logger = require('../logger');
const { logSystemContext, cleanupProcessListeners } = require('./whatsapp-utils');
const { execSync } = require('child_process');

function setupProcessHandlers(whatsapp) {
    cleanupProcessListeners();
    process.on('beforeExit', async () => {
        logSystemContext('beforeExit');
        logger.info('Process before exit, cleaning up...');
        try {
            await whatsapp.destroy();
            execSync('pkill -f chrome || true', { stdio: 'ignore' });
            execSync('pkill -f puppeteer || true', { stdio: 'ignore' });
        } catch (e) {
            logger.error('Error in cleanup:', e);
        }
    });
    process.on('SIGINT', () => {
        logSystemContext('SIGINT');
        logger.warn('Process received SIGINT');
    });
    process.on('SIGTERM', () => {
        logSystemContext('SIGTERM');
        logger.warn('Process received SIGTERM');
    });
    process.on('SIGHUP', () => {
        logSystemContext('SIGHUP');
        logger.warn('Process received SIGHUP');
    });
    process.on('exit', (code) => {
        logSystemContext(`exit code ${code}`);
        logger.warn(`Process exit with code ${code}`);
    });
    process.on('uncaughtException', (err) => {
        logSystemContext('uncaughtException');
        logger.error(`Uncaught Exception: ${err.stack || err}`);
    });
    process.on('unhandledRejection', (reason, promise) => {
        logSystemContext('unhandledRejection');
        logger.error(`Unhandled Rejection: ${reason}`);
    });
}

module.exports = { setupProcessHandlers };
