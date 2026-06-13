const mongoose = require("mongoose");

const company_register_schema = new mongoose.Schema({
    name : {
        type : string,
        required : true
    },
    email : {
        type : string,
        required : true
    },
    password : {
        type : string,
        required : true 
    },
    gst_no : {
        type : string,
        required : true
    }
})


const company_model = mongoose.model("company_register" , company_register_schema); 

module.exports = {company_model};