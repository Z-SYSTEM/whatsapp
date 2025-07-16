# WhatsApp BOT Backend

## Descripción
Backend Node.js para automatización y monitoreo de WhatsApp usando `whatsapp-web.js`, con notificaciones de estado vía Firebase Cloud Messaging (FCM) y robusto manejo de errores y reinicios.

## Características principales
- **Reintentos automáticos:** Si el cliente WhatsApp falla, se intenta reiniciar cada 10 segundos.
- **Notificación FCM solo en fallos persistentes:** Si tras 3 intentos el cliente no se recupera, se envía una notificación push vía FCM.
- **Notificación de QR:** Cuando se genera un QR para autenticación, se envía una notificación FCM.
- **Logs detallados:** Incluye información de payload y respuesta de FCM, contexto de errores y uso de recursos.
- **Manejo de errores y recuperación:** Reinicio automático ante fallos, limpieza de listeners y recursos.
- **Configuración por variables de entorno:** Tokens, endpoints y credenciales se gestionan por `.env`.

## Variables de entorno requeridas
- `FCM_DEVICE_TOKEN`: Token del dispositivo para notificaciones push.
- `ONDOWN`: (opcional) Endpoint para notificar caídas.
- `ONMESSAGE`: (opcional) Endpoint para notificar mensajes/calls.
- `HEALTH_CHECK_INTERVAL_SECONDS`: Intervalo en segundos para el health check (por defecto 30).

## Flujo de recuperación y notificación
## Flujo de health check y recuperación
1. **Health check**: Cada X segundos (configurable por `.env` con `HEALTH_CHECK_INTERVAL_SECONDS`, por defecto 30), se verifica si el bot está listo (puede enviar y recibir mensajes).
2. Si el bot está listo, no hace nada.
3. Si el bot NO está listo, ejecuta el recovery:
   - Intenta reiniciar hasta 3 veces, esperando 10 segundos entre cada intento.
   - Si se recupera en cualquier intento, se resetea el contador y no se notifica.
   - Si tras 3 intentos sigue caído, se envía notificación FCM de caída.
   - El recovery es atómico: no se ejecutan varios a la vez.

## Ejecución
```bash
npm install
node src/index.js
```

## Logs
- Los logs incluyen información de intentos de recuperación, notificaciones FCM (payload y respuesta), y contexto de errores.

## Notas de desarrollo
- El código relevante para la lógica de reintentos y notificación se encuentra en `src/lib/whatsapp.js`.
- La función de envío de notificaciones FCM está en `src/index.js`.

## Git workflow sugerido
```bash
git add .
git commit -m "feat: retry WhatsApp client every 10s, FCM notification after 3 failures, improved logging"
git tag v1.2.0
git push && git push --tags
```

---
# WhatsApp API

API REST para envío de mensajes de WhatsApp utilizando whatsapp-web.js.

## Características

- 📱 Envío de mensajes de texto, imágenes y PDFs
- 🔐 Autenticación Bearer Token
- 🔄 Auto-reconexión automática
- 📊 Health checks y monitoreo
- 🔗 Webhooks para mensajes recibidos

## Instalación

```bash
# Clonar repositorio
git clone https://github.com/Z-SYSTEM/whatsapp.git
cd whatsapp

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus configuraciones

# Ejecutar en desarrollo
node src/index.js

# Ejecutar con PM2 (producción)
pm2 start src/index.js --name whatsapp-api --max-memory-restart 1G

# Ver logs
pm2 logs whatsapp-api

# Parar/reiniciar
pm2 stop whatsapp-api
pm2 restart whatsapp-api

# Eliminar de PM2
pm2 delete whatsapp-api
```


## Notificaciones Push (Firebase Cloud Messaging)

Para habilitar notificaciones push a una app móvil vía FCM:

- El archivo de credenciales de Firebase **NO debe estar en el repositorio**. Debe ubicarse fuera del proyecto, por ejemplo:
  - Linux: `/root/app/firebase-credentials.json`
  - Windows: en una ruta accesible y fuera del repo
- Configura la variable de entorno `FCM_CREDENTIALS_PATH` con la ruta absoluta al archivo de credenciales.
- El token del dispositivo receptor debe ir en la variable de entorno `FCM_DEVICE_TOKEN`.
- El nombre de la instancia del bot debe ir en la variable de entorno `BOT_NAME`.
- Las notificaciones push solo se envían si existen credenciales y token configurado.

Ejemplo de configuración en `.env`:
```properties
FCM_CREDENTIALS_PATH=/root/app/firebase-credentials.json
FCM_DEVICE_TOKEN=token_generado_por_la_app_movil
BOT_NAME=BOTENVIOS
```



```properties
# WhatsApp API Configuration
ONMESSAGE=http://localhost:3000/api/wclient/onmessage
ONDOWN=http://localhost:3000/api/wclient/ondown
PORT=4002
TOKENACCESS=your_access_token_here
WHATSAPP_CHECK_INTERVAL_MINUTES=2
FCM_CREDENTIALS_PATH=/root/app/firebase-credentials.json
FCM_DEVICE_TOKEN=token_generado_por_la_app_movil
BOT_NAME=BOTENVIOS
```

### Explicación de variables:

- **`ONMESSAGE`** - URL donde se enviarán los mensajes recibidos (webhook). Cuando alguien te escriba por WhatsApp, esta APP automáticamente hará un POST a la URL con el contenido del mensaje.

- **`ONDOWN`** - URL donde se notificará cuando WhatsApp se desconecte (webhook). Si la sesión de WhatsApp se pierde, esta APP enviará una alerta a la URL especificada.

- **`PORT`** - Puerto donde escuchará esta APP tus posteos. Tu API estará disponible en `http://localhost:PORT`

- **`TOKENACCESS`** - Token de seguridad para autenticar las peticiones que recibe esta APP. Puedes generarlo a tu gusto. Este token deberá enviarse en el header `Authorization: Bearer TOKENACCESS` cuando uses el endpoint `/api/send`.

- **`WHATSAPP_CHECK_INTERVAL_MINUTES`** - Cada cuántos minutos verificar si WhatsApp está conectado y funcionando correctamente. Si está desconectado, intentará reconectarse automáticamente.

## Endpoints

- **POST /api/send** - Enviar mensajes (texto, imágenes, PDFs)
- **GET /api/test** - Health check

## Documentación

### Postman Collection

Para probar la API, importa la colección de Postman incluida:

📁 **Archivos disponibles:**
- `whatsapp-api.postman_environment.json` - Variables de entorno preconfiguradas
- `API de Entrada.postman_collection.json` - Ejemplo de cómo pedirle al componente que envíe mensajes
- `Mensajeria al Endpoint de Callback.postman_collection.json` - Ejemplos mensajes que manda cuando se recibe un mensaje se cae.

**Cómo importar:**
1. Abre Postman
2. Importa `docs/whatsapp-api.postman_environment.json`
3. Importa `docs/API de Entrada.postman_collection.json`
4. Importa `docs/Mensajeria al Endpoint de Callback.postman_collection.json`
5. Configura las variables de entorno según tu servidor

### Carpetas incluidas:

#### 📤 **API de Entrada** - Endpoints para enviar mensajes
- POST Enviar Texto
- POST Enviar Imagen Individual  
- POST Enviar Múltiples Imágenes
- POST Enviar PDF
- GET Health Check

#### 📥 **Mensajería al Endpoint de Callback** - Webhooks recibidos
- Ejemplo: Mensaje de Texto Recibido
- Ejemplo: Mensaje con Imagen Recibida
- Ejemplo: Mensaje con Audio Recibido
- Ejemplo: Mensaje con Documento Recibido
- Ejemplo: Llamada Recibida
- Ejemplo: Desconexión de WhatsApp

La colección incluye ejemplos completos, tests automáticos y documentación
