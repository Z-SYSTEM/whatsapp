var axios = require('axios');
require('dotenv').config()
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth, MessageMedia  } = require('whatsapp-web.js');
const { config } = require('dotenv');

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
  // Si tengo definido process.env.ONMESSAGE
  if (process.env.ONMESSAGE) {
    call.reject()  
    let config = {
        headers: { 
            'Content-type': 'application/json'
        }
    }
    var data = JSON.stringify(
        {
            'phoneNumber': `${call.from}`,
            'message': `Llamada recibida del número: ${call.from}` ,
            'type' : 'call'
        }
    );
    console.log(await axios.post(process.env.ONMESSAGE,data,config))
    } 
})

whatsapp.on( 'message', async(msg) => {
    
    if (process.env.ONMESSAGE) {
        let match = msg.from.match(/^([^@]+)@/);
        let phoneNumber = match ? match[1] : null;
        let msgType = ''
        let rsp 
        let url = process.env.ONMESSAGE

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

        let data =  {
            'phoneNumber': `${phoneNumber}`,
            'message': `${msg.body}` ,
            'type' : `${msgType}`
        }

        let config = {
            headers: { 
                'Content-type': 'application/json'
                }
        };
        await axios.post(url, JSON.stringify( data),config)
    }

})

module.exports = {whatsapp,MessageMedia};




