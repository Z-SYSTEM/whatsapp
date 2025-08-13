const { createLogger, format, transports } = require('winston');
const fs = require('fs');
const path = require('path');

// Carpeta de logs relativa al directorio donde se ejecuta la app
const logDir = path.join(process.cwd(), 'logs');

// Asegura que exista la carpeta
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp(),
        format.printf(({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`)
    ),
    transports: [
        new transports.File({ filename: path.join(logDir, 'whatsapp-app.log') }),
        new transports.Console()
    ]
});

module.exports = logger;
