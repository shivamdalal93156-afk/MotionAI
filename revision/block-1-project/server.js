const express = require("express");
const {app} = require("./app")
const {ConnectDB} = require("./database/db");

function Startserver() {
    await ConnectDB;

    app.listen(process.env.PORT , ()=>{
        console.log(`server is running on port ${PORT}`);
    })
}

Startserver();
