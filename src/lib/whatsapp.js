var axios = require('axios');
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
  
  const match = msg.from.match(/^([^@]+)@/);
  const phoneNumber = match ? match[1] : null;
  
  var data = JSON.stringify(
    {
      'phoneNumber': `${phoneNumber}`,
      'message': `${msg.body}` 
    }
  );
 var config = {
    method: 'POST',
    url: process.env.ONMESSAGE,
    headers: { 
       'Content-type': 'application/json'
    },
    data : data
 };
 
 axios(config)
 .then(function (response) {
    console.log(JSON.stringify(response.data));
 })
 .catch(function (error) {
    console.log(error)
 });
})

module.exports = {whatsapp,MessageMedia};




