const {company_model} = require("../models/company_model")
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

async function company_register(email , password , name , gst_no) {
    const existing = await company_model.findone({email : email});
    if(existing){
        const err = new Error("email is already used");
        err.status(400);
        throw err
    }
    const hashpassword  = await bcrypt.hash(password , 10);
    const new_company = await company_register_model.create({
        email,
        gst_no,
        password : hashpassword,
        name
    })
}

async function company_login(email , password) {
    const existing = await company_model.find({email : email});
    if(!existing){
        const err = new Error("no user founnd with that email");
        err.status(404);
        throw err
    }
    const decoded = await bcrypt.compare(password , existing.password)
    if(!decoded){
        const err = new Error("password is incorrect");
        err.status(401);
        throw err
    }
    const token = jwt.sign(
        {id : existing._id , email : existing.email},
        process.env.JWT_SECRET,
        {expiresIn : "7d"} 
    )
    return token;
}


module.exports = {company_login , company_register};