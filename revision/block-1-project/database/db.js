const mongoose = require("mongoose");

async function ConnectDB() {
    try{
    await mongoose.connect(process.env.MONGO_URL);
    }catch(err){
        console.log("mongo server is not running");


        process.exit(1);
    }
}

module.exports = {ConnectDB};