const jwt = require('jsonwebtoken')
const TokenKey = process.env.GLOBAL_KEY

const onlineUsers = new Map()   // userId -> socketId
function initSocket(io) {

    io.use((socket, next) => {
        const token = socket.handshake.auth?.token
        if (!token) {
            return next(new Error("Authentication token missing"))
        }
        try {
            const decoded = jwt.verify(token, TokenKey)
            socket.userId = decoded.id
            next()
        } catch (error) {
            console.log('JWT verify error:', error.message)
            return next(new Error("Invalid or expired token"))
        }
    })

    io.on('connection', (socket) => {
        onlineUsers.set(socket.userId, socket.id)
        io.emit(
            'onlineUsers',
            Array.from(onlineUsers.keys())
        )
        socket.on('typing', ({ to }) => {
            console.log(`Typing event from ${socket.userId} to ${to}`)
            const receiverSocketId = onlineUsers.get(to)
            console.log(`Receiver socket found: ${receiverSocketId}`)
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('typing', { from: socket.userId })
            }
        })

        socket.on('stopTyping', ({ to }) => {
            const receiverSocketId = onlineUsers.get(to)
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('stopTyping', { from: socket.userId })
            }
        })

        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.userId}`)

            onlineUsers.delete(socket.userId)


            io.emit(
                'onlineUsers',
                Array.from(onlineUsers.keys())
            )
        })
    })
}

function getReceiverSocketId(userId) {
    return onlineUsers.get(userId)
}

module.exports = { initSocket, getReceiverSocketId }