# Backups automáticos de sesión WhatsApp

Este sistema realiza copias de seguridad periódicas del archivo de sesión (`wwebjs_auth/session.json`) cada 10 minutos en la carpeta `backups/session-backup.json`.

Si el archivo de sesión se corrompe, se restaura automáticamente desde el backup más reciente.

## Ubicación de archivos
- Archivo de sesión: `wwebjs_auth/session.json`
- Backup: `backups/session-backup.json`

## Restauración
La restauración ocurre automáticamente al detectar corrupción en el archivo de sesión al iniciar el bot.

## Configuración
No requiere configuración adicional. El backup y restore están integrados en `src/lib/whatsapp/whatsapp-client.js`.
