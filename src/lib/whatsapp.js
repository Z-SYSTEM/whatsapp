var axios = require('axios');
require('dotenv').config()
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth, MessageMedia  } = require('whatsapp-web.js');
const { postJson, postJSON } = require('./utils');

const whatsapp = new Client({
  puppeteer: {
		args: ['--no-sandbox', '--disable-setuid-sandbox'],
	},
  authStrategy: new LocalAuth({
    clientId: "cliente-2"
  }),
  webVersionCache: { type: 'remote', remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html', }
    
});

whatsapp.on('qr', qr => {
  qrcode.generate(qr, {
      small: true
  });
  console.log(qr)
});

whatsapp.on('ready', () => {
  console.log('Client is ready!');
});


whatsapp.on('call', async(call) => {
  
  call.reject()  
  
  var data = JSON.stringify(
    {
      'phoneNumber': `${call.from}`,
      'message': `Llamada recibida del número: ${call.from}` ,
      'type' : 'call'
    }
  );
  postJSON(data).then()
 
})

whatsapp.on( 'message', async(msg) => {
  
  const match = msg.from.match(/^([^@]+)@/);
  const phoneNumber = match ? match[1] : null;
  let msgType = ''
  // según msg Type armo body
        // TEXT = 'chat',
        // AUDIO = 'audio',
        // VOICE = 'ptt',
        // IMAGE = 'image',
        // VIDEO = 'video',
        // DOCUMENT = 'document'
  switch (msg.type ) {
    case 'image':
      msgType = 'image'
      break;
    case 'audio':
      msgType = 'audio'
      break;
    
    default:
      msgType = 'chat'
      break;
  }
  var data = JSON.stringify(
    {
      'phoneNumber': `${phoneNumber}`,
      'message': `${msg.body}` ,
      'type' : msgType
    }
  );
  postJSON(data)
})

module.exports = {whatsapp,MessageMedia};




