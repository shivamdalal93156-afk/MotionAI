const {developer_register_model} = require("../models/developer_model");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

async function developer_register(name , email , password , bio) {
    const existing = await developer_register_model.findOne({email : email});
    if(existing){
        const err = new Error("devveloper already existed");
        err.status(400)
        throw err
    }
    const hashpassword = await bcrypt.hash(password , 10);
    const new_developer = developer_register_model.create({
        email,
        name,
        password,
        bio
    })
}

async function developer_login(email , password) {
    const existing = await developer_register_model.findOne({email : email});
    if(!existing){{
        const err = new Error("no user exist with respective email");
        err.status(404)
        throw err
    }}
    const decoded = await bcrypt.compare(password , existing.password);
    const token = jwt.sign(
        {id : existing._id , email : existing.email},
        process.env.JWT_TOKEN,
        {expiresIn : "7d"}
    )
    return token;
}

module.exports = {developer_login ,developer_register};
