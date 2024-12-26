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
        headers: { 
           'Content-type': 'application/json'
        }
    };
    return  await axios.post(process.env.ONMESSAGE, JSON.stringify(dataJSON),config)
}

module.exports = {validUser, postJSON};