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
git clone <repository-url>
cd whatsapp-api

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

## Configuración (.env)

```properties
# WhatsApp API Configuration
ONMESSAGE=http://localhost:3000/api/wclient/onmessage
ONDOWN=http://localhost:3000/api/wclient/ondown
PORT=4002
TOKENACCESS=your_access_token_here
WHATSAPP_CHECK_INTERVAL_MINUTES=2
```

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
