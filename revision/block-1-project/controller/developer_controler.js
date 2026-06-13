const {developer_login , developer_register} = require("../services/developer_service");

async function dev_login_cont(req,res,next) {
    try{
    await developer_login;
    req.user = Token;
    return res.status(200).send("login success");
    }catch(err){
        next(err);
    }
}

async function dev_register_cont(req,res,next) {
    try{
        await developer_register;
        return res.status(201).send("user is added");
    }catch(err){
        next(err);
    }
}

module.exports = {dev_login_cont , dev_register_cont}