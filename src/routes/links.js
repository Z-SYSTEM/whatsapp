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
  
  let userIsValid = false
  let tokenUser = req.body.token
  let data = `token = ${tokenUser}`

  // Validar usuario cdo el token es !== TOKENACCESS
  if (tokenUser == process.env.TOKENACCESS) {
    userIsValid = true
  }
  else {
    // Sólo valido cdo tokenAccess es de algún cliente!
    userIsValid = await  fetch(process.env.HOST, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-type': 'application/json' }
    })
  }
  if (userIsValid) {

    let tel = req.body.phoneNumber
    let chatId = tel.substring(1) + "@c.us";
    let number_details = await whatsapp.getNumberId(chatId);
    if(number_details){
      let mensaje = req.body.message
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
   const userIsValid = await  fetch(process.env.HOST, {
    method: 'POST',
    body: JSON.stringify(data),
    headers: { 'Content-type': 'application/json' }
  })
  if (userIsValid) {
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