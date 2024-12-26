var axios = require('axios');
const validUser = async (tokenUser) => {

    
    const data = JSON.stringify(
        {
            'token' : `${tokenUser}`
        }
    )
    var config = {
        method: 'POST',
        url: process.env.HOST,
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
   
    
   
    return validUser.ok

}

const postJSON = async (dataJSON) => {
    let config = {
        method: 'POST',
        url: process.env.ONMESSAGE,
        headers: { 
           'Content-type': 'application/json'
        },
        data : dataJSON
    };
    try {
        
        axios(config)
        .then(function (response) {
            console.log(response.data);
        })
        .catch(function (error) {
            console.log(error)
         });
    } catch (error) {
        console.log(error)
    } 
      
}

module.exports = {validUser, postJSON};