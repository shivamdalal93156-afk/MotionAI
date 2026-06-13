const {company_login ,  company_register} = require("../services/company_service");

async function register_cont(req,res,next) {
    try{
    await company_register;
    return res.status(201).send("user is added");
    }catch(err){
        next(err);
    }
}

async function login_cont(req,res,next) {
    try{
        await company_login;        
        req.user = Token;
        return req.status(200).send("login success");
    }catch(err){
        next(err);
    }
}

module.exports = {register_cont ,login_cont};