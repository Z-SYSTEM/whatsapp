require('dotenv').config()
const {Router} = require('express');

const {whatsapp, MessageMedia} = require('../lib/whatsapp');
const { validUser } = require('../lib/utils');
const router = Router();


router.post('/sendText', async(req, res)=>{
  // Ruta con parametros en body
  // phoneNumber: debe llevar +549 con el número!
  // messsage: texto a enviar
  // token
  // TokenHardCore no validarlo : dG9rZW50b2tlbnRva2VudG9rZW50b2tlbg==
  
  
  const tokenUser = req.body.token
  const data = `token = ${tokenUser}`

  // Validar usuario cdo el token es !== TOKENACCESS
  if (tokenUser == process.env.TOKENACCESS) {
    validUser = true
  }
  else {
    // Sólo valido cdo tokenAccess es de algún cliente!
    const validUser = await  fetch(process.env.HOST, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-type': 'application/json' }
    })
  }
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

router.post('/enviarMensajeUrl', async(req, res)=>{
  
  const tel = req.body.phoneNumber
  const imgUrl = req.body.imgUrl
  const tokenUser = req.body.token
  const data = `token = ${tokenUser}`

   // Sólo valido cdo tokenAccess es de algún cliente!
   const validUser = await  fetch(process.env.HOST, {
    method: 'POST',
    body: JSON.stringify(data),
    headers: { 'Content-type': 'application/json' }
  })
  if (validUser) {
    const chatId = tel.substring(1) + "@c.us";
    const number_details = await whatsapp.getNumberId(chatId);
    if(number_details){
      const media = await MessageMedia.fromUrl(imgUrl,{unsafeMime:true})
      await whatsapp.sendMessage(chatId, media);
      res.json({res: true})
    }else{
      res.json({res: false})
    }
  }
  else {
    res.json({res: false, user: false})
  }
  
})

router.post('/sendFile',async(req,res) => {
  
  let isUserValid = await validUser(req.body.token)
  console.log(isUserValid)

  if (isUserValid) {
    res.json({res: true})

    // const chatId = tel.substring(1) + "@c.us";
    // const number_details = await whatsapp.getNumberId(chatId);
    // if(number_details){
    //   const media = await MessageMedia.fromUrl(imgUrl,{unsafeMime:true})
    //   await whatsapp.sendMessage(chatId, media);
    //   res.json({res: true})
    // }else{
    //   res.json({res: false})
    // }
  }
  else {
    res.json({res: false, user: false})
  }

})


module.exports = router;