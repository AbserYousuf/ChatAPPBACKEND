const jwt = require('jsonwebtoken')

const TokenKey = process.env.GLOBAL_KEY

// userId -> Set of socketIds
const onlineUsers = new Map()

function emitOnlineUsers(io) {
    io.emit(
        'onlineUsers',
        Array.from(onlineUsers.keys())
    )
}

function initSocket(io) {

    // -----------------------------------------
    // SOCKET AUTHENTICATION
    // -----------------------------------------

    io.use((socket, next) => {

        const token = socket.handshake.auth?.token

        if (!token) {
            return next(new Error('Authentication token missing'))
        }

        try {

            const decoded = jwt.verify(token, TokenKey)

            socket.userId = decoded.id

            next()

        } catch (error) {

            console.log('JWT verify error:', error.message)

            return next(new Error('Invalid or expired token'))
        }
    })


    // -----------------------------------------
    // CONNECTION
    // -----------------------------------------

    io.on('connection', (socket) => {

        console.log('========== SOCKET CONNECTED ==========')
        console.log('User:', socket.userId)
        console.log('Socket:', socket.id)


        // -----------------------------------------
        // ADD SOCKET FOR THIS USER
        // -----------------------------------------

        if (!onlineUsers.has(socket.userId)) {
            onlineUsers.set(socket.userId, new Set())
        }

        onlineUsers
            .get(socket.userId)
            .add(socket.id)


        console.log(
            'Online users:',
            Array.from(onlineUsers.keys())
        )


        // Tell EVERY connected client
        // about the updated online users
        emitOnlineUsers(io)


        // -----------------------------------------
        // GET ONLINE USERS
        // -----------------------------------------

        socket.on('getOnlineUsers', () => {

            console.log(
                `Sending online users to ${socket.userId}`
            )

            socket.emit(
                'onlineUsers',
                Array.from(onlineUsers.keys())
            )
        })


        // -----------------------------------------
        // TYPING
        // -----------------------------------------

        socket.on('typing', ({ to }) => {

            console.log(
                `Typing event from ${socket.userId} to ${to}`
            )

            const receiverSockets = onlineUsers.get(to)

            if (!receiverSockets) {
                return
            }

            for (const socketId of receiverSockets) {

                io.to(socketId).emit(
                    'typing',
                    {
                        from: socket.userId
                    }
                )
            }
        })


        // -----------------------------------------
        // STOP TYPING
        // -----------------------------------------

        socket.on('stopTyping', ({ to }) => {

            const receiverSockets = onlineUsers.get(to)

            if (!receiverSockets) {
                return
            }

            for (const socketId of receiverSockets) {

                io.to(socketId).emit(
                    'stopTyping',
                    {
                        from: socket.userId
                    }
                )
            }
        })


        // -----------------------------------------
        // DISCONNECT
        // -----------------------------------------

        socket.on('disconnect', () => {

            console.log(
                `User disconnected: ${socket.userId}`
            )

            console.log(
                `Disconnected socket: ${socket.id}`
            )


            const userSockets = onlineUsers.get(socket.userId)

            if (!userSockets) {
                return
            }


            // Remove only this socket
            userSockets.delete(socket.id)


            // If user has no remaining sockets
            if (userSockets.size === 0) {

                onlineUsers.delete(socket.userId)

                console.log(
                    `Removed ${socket.userId} from online users`
                )

            } else {

                console.log(
                    `User ${socket.userId} still has ${userSockets.size} active socket(s)`
                )
            }


            // Send updated presence
            emitOnlineUsers(io)
        })
    })
}


// -----------------------------------------
// GET ONE SOCKET ID
// -----------------------------------------

function getReceiverSocketId(userId) {

    const sockets = onlineUsers.get(userId)

    if (!sockets || sockets.size === 0) {
        return null
    }

    // Return one socket for code that expects
    // a single socket ID
    return sockets.values().next().value
}


module.exports = {
    initSocket,
    getReceiverSocketId
}
