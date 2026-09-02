const jwt = require('jsonwebtoken')
const RefreshKey = process.env.REFRESH_KEY
const RefreshTokenVerification = async (req, res, next) => {
    const authHeader = req.header('Authorization')
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, message: "Invalid Token Format" })
    }
    const token = authHeader?.split(' ')[1]
    if (!token) {
        return res.status(401).json({ success: false, message: "Token Missing" })
    }

    try {
        console.log('\n========== INCOMING CHAT REQUEST ==========')
        console.log('IP:', req.ip)
        console.log('URL:', req.originalUrl)
        console.log('Content-Type:', req.headers['content-type'])
        console.log('Content-Length:', req.headers['content-length'])

        req.on('aborted', () => {
            console.log('🔥🔥🔥 REQUEST ABORTED BY CLIENT')
        })

        req.on('close', () => {
            console.log('🔥🔥🔥 REQUEST CLOSE')
        })

        req.on('end', () => {
            console.log('🔥 REQUEST END')
        })

        const VerifyToken = jwt.verify(token, RefreshKey)
        req.userId = VerifyToken.id
        next()
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: "Session Expired" })
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ success: false, message: "Invalid Token" })
        }
        console.error(error)
        return res.status(500).json({ success: false, message: "Internal Server Error" })
    }
}
module.exports = RefreshTokenVerification;