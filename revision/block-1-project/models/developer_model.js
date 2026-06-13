const mongoose = require("mongoose");

const developer_register_schema = new mongoose.Schema({
    name : {
        type : String,
        required : true
    },
    email : {
        type : String,
        required : true
    },
    password : {
        type : String,
        required: true
    },
    bio : {
        type : String,
        required : true
    }
})

const developer_register_model = mongoose.model("developer_resigester_model" , developer_register_schema);

module.exports = {developer_register_model}