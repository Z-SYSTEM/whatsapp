const {Router} = require('express');
const {whatsapp, MessageMedia} = require('../lib/whatsapp');
const router = Router();


router.post('/sendText', async(req, res)=>{
  // Ruta con parametros
  // number: debe llevar +549 con el número!
  // text: texto a enviar
  
  const tel = req.body.number
  const chatId = tel.substring(1) + "@c.us";
  const number_details = await whatsapp.getNumberId(chatId);
  if(number_details){
    const mensaje = req.body.text
    await whatsapp.sendMessage(chatId, mensaje);
    res.json({res: true})
  }else{
    res.json({res: false})
  }
})


router.post('/enviarMensajeUrl', async(req, res)=>{
  console.log('ingresando....')
  const tel = '+5493435193917'
  const chatId = tel.substring(1) + "@c.us";
  const number_details = await whatsapp.getNumberId(chatId);
  if(number_details){
    const media = await MessageMedia.fromUrl('https://drive.google.com/file/d/1FO3MYqQcnYEVE2aWxHXy2k8JPG9GdIRS/view?usp=drive_link',{unsafeMime:true})
    await whatsapp.sendMessage(chatId, media);
    res.json({res: true})
  }else{
    res.json({res: false})
  }
})

module.exports = router;