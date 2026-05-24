
const fs = require('fs')

let code =
fs.readFileSync('server.js','utf8')

/* REMOVE SOCKET DUPLICADO */

code = code.replace(

/async function startWhatsAppSession\(username\)\{[\s\S]*?const authPath =/,

`async function startWhatsAppSession(username){

if(
whatsappSessions[username]?.starting
){
return
}

if(
whatsappSessions[username]?.sock
){
return whatsappSessions[username]
}

whatsappSessions[username] = {

starting:true,
connected:false,
qr:null,
reconnecting:false

}

const authPath =`

)

/* OPEN */

code = code.replace(

/if\(connection === 'open'\)\{[\s\S]*?console\.log\([\s\S]*?\)/,

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

/* CLOSE */

code = code.replace(

/if\(connection === 'close'\)\{[\s\S]*?\n\}/,

`if(connection === 'close'){

whatsappSessions[username].connected =
false

const statusCode =
lastDisconnect?.error?.output?.statusCode

console.log(
'DESCONECTADO:',
username,
statusCode
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

/* RECONNECT */

setTimeout(()=>{

delete whatsappSessions[username]

startWhatsAppSession(username)

},8000)

}`

)

fs.writeFileSync(
'server.js',
code
)

console.log('FIX OK')

