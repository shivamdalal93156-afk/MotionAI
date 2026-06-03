// // const express = require("express");
// // const app = express();


// // app.use("/user/:id",(req,res,next)=>{
// //     if(Number(req.params.id) !== 20){
// //         return res.status(400).json({message:"invalid request no reason to call"});
// //     }
// //     next();
// // })


// // app.get("/", (req,res)=>{
// //     res.send("welcome to aootra");
// // })

// // app.get("/user/:id" , (req,res)=>{
// //     const id =  req.params.id;
// //     res.json({user:`your id is ${id}`});
// // })

// // app.get("/search", (req,res)=>{
// //     const keyword = req.query.op;
// //     res.json({message  : `your search keyword is ${keyword}`});
// // })



// // app.listen(9000 , ()=>{
// //     console.log("server is started on 9000");
// // })


// // const express = require("express");

// // const app = express();

// // app.use(express.json());

// // app.get("/",(req,res)=>{
// //     return res.send("welcome to aootra");
// // })

// // app.get("/product/:id",(req,res)=>{
// //     const id = req.params.id;
// //     // if(!id){
// //     //     return res.status(400).send("please send the id");
// //     // }
// //     if(isNaN(id)){
// //         return res.status(400).send("please enter a valid id");
// //     }
// //     const user = {id:Number(id),name:"shivam"};
// //     if(!user){
// //         return res.status(404).send("no user found");
// //     }
// //     return res.status(200).send(user);
// // })

// // app.get("/search",(req,res)=>{
// //     const keyword = req.query.name;
// //     if(!keyword){
// //         return res.status(400).send("please fill the keyword box");
// //     }
// //     return res.status(200).json({mess:`your keyword id ${keyword}`})
// // })
// // app.listen(9000 , ()=>{
// //     console.log("server is at 9000 ruuning live");
// // })

// const express = require('express');
// const app = express();

// app.use(express.json());

// app.use((req,res,next)=>{
//   const time = Date.now();
//   console.log(`time of request ${time}`)

//   res.on('finish' , ()=>{
//     const delay = Date.now() - time;
//     console.log(`the delay in request url ${req.url} is ${delay}`)
//   })
//   next();
// })

// app.use((req,res,next)=>{
//   const authheader = req.header.authorization;
//   if(!authheader || !authheader.startswith('Bearer')){
//     return res.status(401).json({err:`unauthorized`});
//   }
//   const token = authheader.split(' ')[1];
//   if(!token){
//     return res.status(401).json({err:`token unvalid format`})
//   }
//   if(token !== "mytoken1234"){
//     return res.status(401).json({err:`invalid token`});
//   }
//   req.user = {id :1 , name : shivam};
//   next();
// })

// app.get('/', (req, res) => {
//   return res.status(200).json({ message: 'welcome to aootra' });
// })

// app.get('/product/:id', (req, res) => {
//   const id = req.params.id;

//   // only check what can actually be wrong
//   if (isNaN(id)) {
//     return res.status(400).json({ error: 'ID must be a number' });
//   }

//   // hardcoded for now - will come from database later
//   const product = { id: Number(id), name: 'Sample product' };

//   return res.status(200).json({ product });
// })

// app.get('/search', (req, res) => {
//   const keyword = req.query.name;

//   if (!keyword) {
//     return res.status(400).json({ error: 'keyword is required' });
//   }

//   return res.status(200).json({ results: `you searched for ${keyword}` });
// })

// // 404 - catches everything not matched above
// app.use((req, res) => {
//   return res.status(404).json({ error: 'route not found' });
// })

// app.listen(9000, () => {
//   console.log('server running on 9000');
// })
const express = require("express");
const app = express();

function requestlogger(req,res,next){
  const time = Date.now();
  res.on('finish',()=>{
    console.log(`${req.url} and ${req.method} and ${req.status} and ${Date.now()} and delay is ${Date.now() - time}`);
  })
  next();
}

function authmiddleware(req,res,next){
  const {email,password} = req.body;
  
}
app.post("/register",async (req,res)=>{
  const {name , email , password ,phone} = req.body;
  const existing = await User.findbyid({email : req.body.email});
  if(!existing){
    return res.status(401).send("user already exist");
  }
  const newuser = User.create
})