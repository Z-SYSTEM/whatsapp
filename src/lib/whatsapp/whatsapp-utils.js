const logger = require('../logger');

function logSystemContext(motivo) {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const uptime = process.uptime();
    logger.warn(`[MONITOR] Reinicio/Destrucción WhatsApp - Motivo: ${motivo}`);
    logger.warn(`[MONITOR] RAM: RSS ${(mem.rss/1024/1024).toFixed(2)}MB, Heap ${(mem.heapUsed/1024/1024).toFixed(2)}/${(mem.heapTotal/1024/1024).toFixed(2)}MB, External ${(mem.external/1024/1024).toFixed(2)}MB`);
    logger.warn(`[MONITOR] CPU: user ${(cpu.user/1000).toFixed(2)}ms, system ${(cpu.system/1000).toFixed(2)}ms, Uptime: ${uptime.toFixed(2)}s`);
}

function cleanupProcessListeners() {
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGHUP');
    process.removeAllListeners('exit');
    process.removeAllListeners('beforeExit');
}

function updateLastOperation() {
    global.lastSuccessfulOperation = Date.now();
}


// Verifica si el cliente está realmente listo
async function isClientReady(whatsapp, whatsappState) {
    if (!whatsappState.isReady) {
        return false;
    }
    try {
        // Intentar una operación simple para verificar que la sesión está activa
        const state = await whatsapp.getState();
        updateLastOperation();
        return state === 'CONNECTED';
    } catch (error) {
        logger.warn(`Client state check failed: ${error.message}`);
        whatsappState.isReady = false;
        return false;
    }
}

module.exports = { logSystemContext, cleanupProcessListeners, updateLastOperation, isClientReady };
