const {Router} = require('express');
const {whatsapp, MessageMedia} = require('../lib/whatsapp');
const router = Router();


router.post('/sendText', async(req, res)=>{
  // Ruta con parametros
  // number: debe llevar +549 con el número!
  // text: texto a enviar
  
  
  const tokenUser = req.body.token
  const data = `token = ${tokenUser}`

  const validUser = await  fetch(process.env.HOST, {
    method: 'POST',
    body: JSON.stringify(data),
    headers: { 'Content-type': 'application/json' }
  })
  if (validUser) {

    const tel = req.body.phoneNumber
    const chatId = tel.substring(1) + "@c.us";
    const number_details = await whatsapp.getNumberId(chatId);
    if(number_details){
      const mensaje = req.body.message
      await whatsapp.sendMessage(chatId, mensaje);
      res.json({res: true})
    }else{
      res.json({res: false})
    }
  } else {
    res.json({res: false, user: false})
  }
  

})

// router.post('/enviarMensajeUrl', async(req, res)=>{
//   console.log('ingresando....')
//   const tel = '+5493435193917'
//   const chatId = tel.substring(1) + "@c.us";
//   const number_details = await whatsapp.getNumberId(chatId);
//   if(number_details){
//     const media = await MessageMedia.fromUrl('https://drive.google.com/file/d/1FO3MYqQcnYEVE2aWxHXy2k8JPG9GdIRS/view?usp=drive_link',{unsafeMime:true})
//     await whatsapp.sendMessage(chatId, media);
//     res.json({res: true})
//   }else{
//     res.json({res: false})
//   }
// })


module.exports = router;