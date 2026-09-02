require('dotenv').config()
const fs = require('fs')
const path = require('path')
const imageUploadDir = path.join(__dirname, 'imageUploads')
if (!fs.existsSync(imageUploadDir)) {
    fs.mkdirSync(imageUploadDir, { recursive: true })
}
const requiredEnvVars = ['GLOBAL_KEY', 'RESET_KEY', 'OTP_KEY', 'SENDGRID_API_KEY', 'MYEMAIL', 'PORT', 'MONGO_URL', 'REFRESH_KEY']
for (const key of requiredEnvVars) {
    if (!process.env[key]) {
        throw new Error(`Missing required environment variable: ${key}`)
    }
}

const MongoConnect = require('./Database')
MongoConnect();

const express = require('express')
const cors = require('cors')
const http = require('http')
const { Server } = require('socket.io')

const app = express()
const server = http.createServer(app)
app.set('trust proxy', 1)
const io = new Server(server, {
    cors: { origin: '*' }
})

const { initSocket } = require('./Socket')
initSocket(io)
app.set('io', io)

app.use(express.json())
app.use(cors())

const Port = process.env.PORT
const Global = require('./routes/Credentials')
const Chatauth = require('./routes/Chat')

app.use('/uploads', express.static(path.join(__dirname, 'uploads')))
app.use('/imageUploads', express.static(path.join(__dirname, 'imageuploads')))
app.use('/api/auth', Global)
app.use('/api/chat', Chatauth)

server.listen(Port, '0.0.0.0', () => {
    console.log("Your App is Listening on :: Port ", Port)
})

module.exports = { io }
