const { createLogger, format, transports } = require('winston');
const fs = require('fs');
const path = require('path');

// Asegura que la carpeta logs exista
const logDir = path.join(__dirname, '../../logs');
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