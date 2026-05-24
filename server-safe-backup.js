
const express = require('express')
const cors = require('cors')
const multer = require('multer')
const fs = require('fs')
const path = require('path')
const http = require('http')

const {
default: makeWASocket,
DisconnectReason,
useMultiFileAuthState,
delay
} = require('@whiskeysockets/baileys')

const P = require('pino')
const QRCode = require('qrcode')
const { v4: uuidv4 } = require('uuid')

const app = express()
const server = http.createServer(app)

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({extended:true}))

app.use('/uploads',express.static('uploads'))
app.use(express.static('public'))

const upload = multer({
dest:'uploads/'
})

/* ===== SESSIONS ===== */

const sessions = {}
const whatsappSessions = {}

/* ===== WHATSAPP SESSION ===== */

async function startWhatsAppSession(username){

if(whatsappSessions[username]?.sock){

return whatsappSessions[username]

}

const authPath =
`./sessions/${username}`

const { state, saveCreds } =
await useMultiFileAuthState(authPath)

const sock = makeWASocket({

logger:P({level:'silent'}),

auth:state,

browser:[
'Safari',
'iPhone',
'16.0'
]

})

whatsappSessions[username] = {

sock,
qr:null,
connected:false

}

sock.ev.on(
'creds.update',
saveCreds
)

sock.ev.on(
'connection.update',
async(update)=>{

const {
connection,
lastDisconnect,
qr
} = update

/* QR */

if(qr){

whatsappSessions[username].qr =
await QRCode.toDataURL(qr)

whatsappSessions[username].connected =
false

console.log(
'QR:',
username
)

}

/* CONNECT */

if(connection === 'open'){

whatsappSessions[username].connected =
true

whatsappSessions[username].qr = null

console.log(
'CONECTADO:',
username
)

}

/* CLOSE */

if(connection === 'close'){

whatsappSessions[username].connected =
false

console.log(
'DESCONECTADO:',
username
)

const statusCode =
lastDisconnect?.error?.output?.statusCode

if(
statusCode === DisconnectReason.loggedOut
){

if(fs.existsSync(authPath)){

fs.rmSync(authPath,{
recursive:true,
force:true
})

}

delete whatsappSessions[username]

setTimeout(()=>{

startWhatsAppSession(username)

},3000)

return

}

setTimeout(()=>{

startWhatsAppSession(username)

},3000)

}

})

return whatsappSessions[username]

}

/* ===== LOGIN ===== */

app.post('/login', async(req,res)=>{

try{

const {
user,
pass
} = req.body

const users =
JSON.parse(
fs.readFileSync(
'./data/users.json'
)
)

const found =
users.find(u=>

u.user === user &&
u.pass === pass

)

if(!found){

return res.json({
success:false
})

}

await startWhatsAppSession(user)

const token =
uuidv4()

sessions[token] = {

user:found.user,
role:found.role

}

res.json({

success:true,

token,

user:found.user,

role:found.role

})

}catch(err){

console.log(err)

res.json({
success:false
})

}

})

/* ===== AUTH ===== */

app.get('/auth',(req,res)=>{

const token =
req.headers.authorization

if(
!token ||
!sessions[token]
){

return res.json({
success:false
})

}

res.json({

success:true,

user:sessions[token].user,

role:sessions[token].role

})

})

/* ===== STATUS ===== */

app.get('/status',(req,res)=>{

const token =
req.headers.authorization

if(
!token ||
!sessions[token]
){

return res.json({
connected:false
})

}

const user =
sessions[token].user

const session =
whatsappSessions[user]

if(!session){

return res.json({
connected:false
})

}

res.json({

connected:session.connected,
qr:session.qr

})

})

/* ===== GROUPS ===== */

app.get('/groups',async(req,res)=>{

try{

const token =
req.headers.authorization

if(
!token ||
!sessions[token]
){

return res.json([])

}

const user =
sessions[token].user

const session =
whatsappSessions[user]

if(!session){

return res.json([])

}

const groupsData =
await session.sock.groupFetchAllParticipating()

const groups =
Object.values(groupsData).map(group=>({

id:group.id,
name:group.subject

}))

res.json(groups)

}catch(err){

console.log(err)

res.json([])

}

})

/* ===== SEND LIST ===== */

app.post('/send-list', upload.single('media'), async(req,res)=>{

try{

const token =
req.headers.authorization

if(
!token ||
!sessions[token]
){

return res.json({
success:false
})

}

const user =
sessions[token].user

const session =
whatsappSessions[user]

const sock =
session.sock

const numbers =
req.body.numbers
.split('\n')

const message =
req.body.message || ''

let sent = 0
let failed = 0

for(const number of numbers){

try{

const clean =
number.replace(/\D/g,'')

if(!clean) continue

const check =
await sock.onWhatsApp(clean)

if(!check.length){

failed++
continue

}

const jid =
check[0].jid

await delay(
3000 + Math.floor(Math.random()*3000)
)

if(req.file){

const ext =
req.file.originalname
.toLowerCase()

if(ext.endsWith('.mp4')){

await sock.sendMessage(jid,{

video:{
url:req.file.path
},

caption:message

})

}else{

await sock.sendMessage(jid,{

image:{
url:req.file.path
},

caption:message

})

}

}else{

await sock.sendMessage(jid,{
text:message
})

}

sent++

await delay(
5000 + Math.floor(Math.random()*5000)
)

}catch(err){

console.log(err)

failed++

}

}

res.json({

success:true,
sent,
failed

})

}catch(err){

console.log(err)

res.json({
success:false
})

}

})

/* ===== SEND GROUPS ===== */

app.post('/send-groups', upload.single('media'), async(req,res)=>{

try{

const token =
req.headers.authorization

if(
!token ||
!sessions[token]
){

return res.json({
success:false
})

}

const user =
sessions[token].user

const session =
whatsappSessions[user]

const sock =
session.sock

const groups =
JSON.parse(req.body.groups)

const message =
req.body.message || ''

let sent = 0
let failed = 0

for(const groupId of groups){

try{

await delay(
3000 + Math.floor(Math.random()*3000)
)

if(req.file){

const ext =
req.file.originalname
.toLowerCase()

if(ext.endsWith('.mp4')){

await sock.sendMessage(groupId,{

video:{
url:req.file.path
},

caption:message

})

}else{

await sock.sendMessage(groupId,{

image:{
url:req.file.path
},

caption:message

})

}

}else{

await sock.sendMessage(groupId,{
text:message
})

}

sent++

await delay(
6000 + Math.floor(Math.random()*5000)
)

}catch(err){

console.log(err)

failed++

}

}

res.json({

success:true,
sent,
failed

})

}catch(err){

console.log(err)

res.json({
success:false
})

}

})

/* ===== CREATE USER ===== */

app.post('/create-user',(req,res)=>{

try{

const token =
req.headers.authorization

if(
!token ||
!sessions[token]
){

return res.json({
success:false
})

}

if(
sessions[token].role !== 'admin'
){

return res.json({
success:false
})

}

const {
user,
pass
} = req.body

const users =
JSON.parse(
fs.readFileSync(
'./data/users.json'
)
)

const exists =
users.find(u=>
u.user === user
)

if(exists){

return res.json({
success:false
})

}

users.push({

user,
pass,
role:'user'

})

fs.writeFileSync(
'./data/users.json',
JSON.stringify(users,null,2)
)

res.json({
success:true
})

}catch(err){

console.log(err)

res.json({
success:false
})

}

})

/* ===== USERS ===== */

app.get('/users',(req,res)=>{

try{

const token =
req.headers.authorization

if(
!token ||
!sessions[token]
){

return res.json([])

}

if(
sessions[token].role !== 'admin'
){

return res.json([])

}

const users =
JSON.parse(
fs.readFileSync(
'./data/users.json'
)
)

res.json(users)

}catch(err){

console.log(err)

res.json([])

}

})

/* ===== DELETE USER ===== */

app.post('/delete-user',(req,res)=>{

try{

const token =
req.headers.authorization

if(
!token ||
!sessions[token]
){

return res.json({
success:false
})

}

if(
sessions[token].role !== 'admin'
){

return res.json({
success:false
})

}

const {
user
} = req.body

let users =
JSON.parse(
fs.readFileSync(
'./data/users.json'
)
)

users =
users.filter(u=>
u.user !== user
)

fs.writeFileSync(
'./data/users.json',
JSON.stringify(users,null,2)
)

const sessionPath =
`./sessions/${user}`

if(fs.existsSync(sessionPath)){

fs.rmSync(sessionPath,{
recursive:true,
force:true
})

}

delete whatsappSessions[user]

res.json({
success:true
})

}catch(err){

console.log(err)

res.json({
success:false
})

}

})

/* ===== HOME ===== */

app.get('/',(req,res)=>{

res.sendFile(
path.join(
__dirname,
'public',
'index.html'
)
)

})

/* ===== START ===== */

server.listen(4000,()=>{

console.log('ONLINE 4000')

})

