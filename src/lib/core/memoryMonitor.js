const logger = require('./logger');

function startMemoryMonitor() {
    setInterval(() => {
        const memoryUsage = process.memoryUsage();
        const formatMB = (bytes) => (bytes / 1024 / 1024).toFixed(2);
        logger.info(`Memory Report - RSS: ${formatMB(memoryUsage.rss)}MB, Heap: ${formatMB(memoryUsage.heapUsed)}/${formatMB(memoryUsage.heapTotal)}MB, External: ${formatMB(memoryUsage.external)}MB`);
        if (memoryUsage.rss > 1024 * 1024 * 1024 || memoryUsage.heapUsed > memoryUsage.heapTotal * 0.95) {
            logger.error(`High memory usage or heap leak detected: RSS ${formatMB(memoryUsage.rss)}MB, Heap ${formatMB(memoryUsage.heapUsed)}/${formatMB(memoryUsage.heapTotal)}MB - Restarting process`);
            process.exit(1);
        }
    }, 5 * 60 * 1000);
}

module.exports = { startMemoryMonitor };
