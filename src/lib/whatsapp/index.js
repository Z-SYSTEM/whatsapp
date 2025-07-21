const { whatsapp, MessageMedia, whatsappState } = require('./whatsapp-client');
const { logSystemContext, cleanupProcessListeners, updateLastOperation, isClientReady } = require('./whatsapp-utils');
const { performHealthCheck } = require('./whatsapp-health');
require('./whatsapp-events');

module.exports = {
  whatsapp,
  MessageMedia,
  whatsappState,
  logSystemContext,
  cleanupProcessListeners,
  updateLastOperation,
  isClientReady,
  performHealthCheck
};
