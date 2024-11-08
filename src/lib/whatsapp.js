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



module.exports = {whatsapp,MessageMedia};