require('dotenv').config()
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth, MessageMedia  } = require('whatsapp-web.js');

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


whatsapp.on('message', async(msg) => {
  //console.log(msg.rawData)
  // Requisitos:  5491160553338 // PERSONAL PABLO
  
    // recibo msg desde teléfono configurado en .env y  guardo en api soporte
    const data = `
      phoneNumber : ${msg.from},
      message: ${msg.body}
    `
    const response = await  fetch(process.env.ONMESSAGE, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-type': 'application/json' }
    })
})

module.exports = {whatsapp,MessageMedia};