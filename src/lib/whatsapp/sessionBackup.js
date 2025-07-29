const fs = require('fs');
const path = require('path');

const sessionFile = path.join(__dirname, '../../../wwebjs_auth/session.json');
const backupDir = path.join(__dirname, '../../../backups');
const backupFile = path.join(backupDir, 'session-backup.json');

function backupSession(logger) {
    if (fs.existsSync(sessionFile)) {
        try {
            fs.copyFileSync(sessionFile, backupFile);
            logger && logger.info('Backup de sesión realizado.');
        } catch (err) {
            logger && logger.error('Error al hacer backup de sesión:', err);
        }
    }
}

function restoreSessionIfCorrupt(logger) {
    if (fs.existsSync(sessionFile)) {
        try {
            JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
        } catch (err) {
            logger && logger.warn('Archivo de sesión corrupto. Restaurando backup...');
            if (fs.existsSync(backupFile)) {
                fs.copyFileSync(backupFile, sessionFile);
                logger && logger.info('Backup restaurado.');
            } else {
                logger && logger.error('No hay backup disponible para restaurar.');
            }
        }
    }
}

function startSessionBackup(logger, intervalMs = 10 * 60 * 1000) {
    restoreSessionIfCorrupt(logger);
    setInterval(() => backupSession(logger), intervalMs);
}

module.exports = {
    backupSession,
    restoreSessionIfCorrupt,
    startSessionBackup,
    sessionFile,
    backupFile
};
