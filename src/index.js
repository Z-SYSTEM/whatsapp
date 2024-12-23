require('dotenv').config()
const express = require('express');
const {whatsapp,whatsappConClient} = require('./lib/whatsapp');
const { validUser } = require('./lib/utils');
const app = express()

const puerto = parseInt(process.env.PORT);

app.use(express.urlencoded({extended: false}));
app.use(express.json());

//rutas
app.use('/api', require('./routes/links'));

whatsapp.initialize()

app.listen(puerto, ()=>{
  console.log(`Server on port ${puerto} and ${process.env.HOST}`)

});