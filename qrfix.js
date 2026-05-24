const fs = require('fs')

let code = fs.readFileSync('server.js','utf8')

/* REMOVE DUPLICATE SESSION START */

code = code.replace(
/async function startWhatsAppSession\(username\)\{[\s\S]*?const authPath =/,
`async function startWhatsAppSession(username){

if(
whatsappSessions[username] &&
(
whatsappSessions[username].connected ||
whatsappSessions[username].starting
)
){
return whatsappSessions[username]
}

whatsappSessions[username] = {

starting:true,
connected:false,
reconnecting:false,
qr:null

}

const authPath =`
)

/* FIX QR */

code = code.replace(
/if\(qr\)\{[\s\S]*?console\.log\([\s\S]*?'QR.*?\)/,
`if(qr){

if(
!whatsappSessions[username].connected
){

const qrBase64 =
await QRCode.toDataURL(qr)

if(
whatsappSessions[username].qr !== qrBase64
){

whatsappSessions[username].qr =
qrBase64

console.log(
'QR:',
username
)

}

}

}`
)

/* FIX OPEN */

code = code.replace(
/if\(connection === 'open'\)\{[\s\S]*?console\.log\([\s\S]*?'CONECTADO:'.*?\)/,
`if(connection === 'open'){

whatsappSessions[username].connected =
true

whatsappSessions[username].starting =
false

whatsappSessions[username].reconnecting =
false

whatsappSessions[username].qr =
null

console.log(
'CONECTADO:',
username
)`
)

/* FIX CLOSE */

code = code.replace(
/if\(connection === 'close'\)\{[\s\S]*?setTimeout\(\(\)=>\{[\s\S]*?\},[0-9]+\)\s*\}/,
`if(connection === 'close'){

whatsappSessions[username].connected =
false

const statusCode =
lastDisconnect?.error?.output?.statusCode

console.log(
'DESCONECTADO:',
username
)

/* EVITA LOOP */

if(
whatsappSessions[username].reconnecting
){
return
}

whatsappSessions[username].reconnecting =
true

/* LOGOUT */

if(
statusCode === DisconnectReason.loggedOut
){

const authPath =
\`./sessions/\${username}\`

if(fs.existsSync(authPath)){

fs.rmSync(authPath,{
recursive:true,
force:true
})

}

delete whatsappSessions[username]

setTimeout(()=>{

startWhatsAppSession(username)

},5000)

return

}

/* RECONNECT CONTROLADO */

setTimeout(()=>{

delete whatsappSessions[username]

startWhatsAppSession(username)

},10000)

}`
)

fs.writeFileSync('server.js',code)

console.log('QR FIX OK')
