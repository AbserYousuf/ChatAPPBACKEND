const jwt = require('jsonwebtoken')
const tokenKey = process.env.OTP_KEY
const ResetTokenVerification = async (req, res, next) => {
    const authHeader = req.header('Authorization')
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, message: "Invalid Token Format" })
    }
    const token = authHeader?.split(' ')[1]
    if (!token) {
        return res.status(401).json({ success: false, message: "Token Missing" })
    }

    try {
        const VerifyToken = jwt.verify(token, tokenKey)
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
module.exports = ResetTokenVerification