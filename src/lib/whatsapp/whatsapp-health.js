const logger = require('../logger');
const { whatsappState } = require('./whatsapp-client');

async function performHealthCheck(whatsapp) {
    try {
        if (!whatsappState.isReady) return false;
        const state = await whatsapp.getState();
        await whatsapp.getContacts();
        return state === 'CONNECTED';
    } catch (error) {
        logger.error(`Health check failed: ${error.message}`);
        return false;
    }
}

module.exports = { performHealthCheck };
