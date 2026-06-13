const jwt = require("jsonwebtoken");

async function tokencheck(req,res,next) {
    const authtoken = req.token ;
    if(!authtoken){
        return res.status(401).send("inalid token");
    }
}