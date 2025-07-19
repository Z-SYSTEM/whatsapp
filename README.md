# WhatsApp BOT Backend

Backend para enviar mensajes de WhatsApp por API usando whatsapp-web.js. Permite automatizar envíos, recibir mensajes y manejar eventos de WhatsApp.

## Características principales
- Reintentos automáticos si el cliente falla.
- Manejo de errores y recuperación automática.
- Configuración flexible por variables de entorno.
- Webhooks para recibir mensajes y eventos.
- Logs detallados.

## Instalación y ejecución rápida

```bash
git clone https://github.com/Z-SYSTEM/whatsapp.git
cd whatsapp
npm install
cp .env.example .env
# Edita .env y define BOT_NAME, TOKENACCESS y demás variables necesarias
node src/index.js
```

## Ejecución en producción con PM2

```bash
pm2 start src/index.js --name whatsapp-api --max-memory-restart 1G
pm2 logs whatsapp-api
```

## Variables de entorno requeridas

- `BOT_NAME`: **Obligatorio.** Identificador único del bot. Si no está definido, la app no arranca. Cada instancia debe tener un `BOT_NAME` distinto para evitar conflictos de sesión.
- `PORT`: Puerto donde escuchará la API (por defecto 4002).
- `TOKENACCESS`: Token inventado por el implementador. No se obtiene de ningún lado, lo defines vos. Se usa para autenticar y recibir los POST a la API; los clientes deben enviarlo en el header `Authorization: Bearer TOKENACCESS`.
- `ONDOWN`: (opcional) Endpoint para notificar caídas.
- `ONMESSAGE`: (opcional) Endpoint para notificar mensajes/calls.
- `HEALTH_CHECK_INTERVAL_SECONDS`: (opcional) Intervalo en segundos para el health check (por defecto 30).

### Ejemplo de archivo `.env`:

```properties
BOT_NAME=BOTENVIOS
PORT=4002
TOKENACCESS=tu_token_seguro
ONMESSAGE=http://localhost:3000/api/wclient/onmessage
ONDOWN=http://localhost:3000/api/wclient/ondown
HEALTH_CHECK_INTERVAL_SECONDS=30
```

## Flujo de recuperación y notificación

1. Health check cada X segundos (`HEALTH_CHECK_INTERVAL_SECONDS`).
2. Si el bot está listo, no hace nada.
3. Si el bot NO está listo, intenta reiniciar hasta 3 veces (10s entre intentos).
4. Si no se recupera, ejecuta el webhook de caída (`ONDOWN` si está configurado).

## Para múltiples bots en el mismo servidor
- Usa una carpeta distinta para cada bot.
- Define un `BOT_NAME` único en cada `.env`.
- Cada instancia usará su propia sesión y no habrá conflictos.

## Endpoints principales

- **POST /api/send** - Enviar mensajes (texto, imágenes, PDFs)
- **GET /api/test** - Health check

## Pruebas con Postman

Importa las colecciones desde la carpeta `docs/`:

- `Whatsapp BOT.postman_collection.json` - Ejemplo de cómo pedirle al componente que envíe mensajes
- `Whatsapp BOT a Endpoint.postman_collection.json` - Ejemplos de mensajes que manda cuando se recibe un mensaje o se cae
- `Development.postman_environment.json` - Variables de entorno preconfiguradas

**Cómo importar:**
1. Abre Postman
2. Importa los archivos desde la carpeta `docs/`
3. Configura las variables de entorno según tu servidor

# Estructura del webhook ONMESSAGE

Cuando se recibe un mensaje, el backend envía un JSON al endpoint definido en la variable `ONMESSAGE`. Todos los mensajes usan la misma estructura base:

```json
{
  "phoneNumber": "1234567890",        // Número del remitente (sin @c.us)
  "type": "chat",                     // Tipo de mensaje (chat, image, video, audio, ptt, document, sticker, location, contact, vcard, etc)
  "from": "1234567890@c.us",          // Identificador completo del remitente
  "id": "ABCD1234567890",             // ID único del mensaje
  "timestamp": 1626791234,              // Timestamp del mensaje
  "body": "Texto o caption",           // Texto del mensaje o caption (puede estar vacío)
  "hasMedia": false,                    // Indica si el mensaje tiene contenido multimedia
  "data": {                             // Información adicional según el tipo de mensaje
    // ... ver ejemplos abajo ...
  }
}
```

### Ejemplos de `data` según el tipo de mensaje

- **Texto (chat):**
  - `data` no está presente.

- **Imagen:**
  ```json
  "data": {
    "mimetype": "image/jpeg",
    "filename": "imagen.jpg",
    "data": "BASE64_DE_LA_IMAGEN"
  }
  ```

- **Video:**
  ```json
  "data": {
    "mimetype": "video/mp4",
    "filename": "video.mp4",
    "data": "BASE64_DEL_VIDEO"
  }
  ```

- **Audio / PTT:**
  ```json
  "data": {
    "mimetype": "audio/ogg",
    "filename": "audio.ogg",
    "data": "BASE64_DEL_AUDIO"
  }
  ```

- **Documento:**
  ```json
  "data": {
    "mimetype": "application/pdf",
    "filename": "archivo.pdf",
    "data": "BASE64_DEL_DOCUMENTO"
  }
  ```

- **Sticker:**
  ```json
  "data": {
    "mimetype": "image/webp",
    "filename": "sticker.webp",
    "data": "BASE64_DEL_STICKER"
  }
  ```

- **Ubicación:**
  ```json
  "data": {
    "latitude": -34.6037,
    "longitude": -58.3816,
    "description": "Buenos Aires"
  }
  ```

- **Contacto / vCard:**
  ```json
  "data": {
    "vcard": "BEGIN:VCARD\nVERSION:3.0\nFN:Juan Perez\nTEL;TYPE=CELL:1234567890\nEND:VCARD"
  }
  ```
