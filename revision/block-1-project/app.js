const express = require("express");


const app = express();

app.get("/",(req,res)=>{
    return res.status(200).send("welcome to landing page");
})



module.exports = {app};
