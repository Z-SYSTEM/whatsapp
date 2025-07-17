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
