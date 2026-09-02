const express = require('express')
const router = express.Router()
const bcrypt = require('bcrypt')
const UserSchema = require('../models/User')
const { body, validationResult } = require("express-validator");
const TokenKey = process.env.GLOBAL_KEY
const MYEMAIL = process.env.MYEMAIL
const User = require('../models/User');
const { rateLimit } = require('express-rate-limit')
const TokenVerify = require('../middleware/Token')
const ResetVerify = require('../middleware/ResetToken')
const OTPKEY = process.env.OTP_KEY
const ResetKey = process.env.RESET_KEY
const RefreshKey = process.env.REFRESH_KEY
const PasswordVerify = require('../middleware/UpdatePass')
const sgMail = require('@sendgrid/mail')
const jwt = require('jsonwebtoken');
const multer = require('multer')
const path = require('path')

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../uploads'))
    },

    filename: (req, file, cb) => {
        const uniqueName =
            `${req.userId}-${Date.now()}${path.extname(file.originalname)}`

        cb(null, uniqueName)
    }
})

const upload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 5MB limit, adjust as needed
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true)
        } else {
            cb(new Error('Only image files are allowed'))
        }
    }
})
const GlobalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ipv6Subnet: 56,
})
const OTPLIMITER = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ipv6Subnet: 56,
})
router.post('/signup', GlobalLimiter, [
    body("Name").trim().
        notEmpty().withMessage("Name Required").
        isLength({
            max: 20,
            min: 3
        }).withMessage("Mimimum 3 and Maximum 20 characters are allowed in the Name"),

    body('Username').
        trim().
        notEmpty().withMessage("Username Required").
        isLength({
            min: 2,
            max: 10
        }).withMessage("Minimum 2 and Maximum 10 characters are allowed in Username"),

    body("Email").trim()
        .notEmpty().withMessage("Email Required").
        isEmail().withMessage("Please Enter a valid Email").
        normalizeEmail().withMessage('Please Enter a valid Email'),

    body('Password')
        .notEmpty().withMessage("Password is required")
        .isStrongPassword({
            minLength: 8,
            minUppercase: 1,
            minLowercase: 1,
            minSymbols: 1,
            minNumbers: 1
        })
        .withMessage("Password should contain Atlease 1 Uppercase,Lowercase, Number and symbol and Must Be 8 characters"),

    body("ProfilePicture").trim().optional().custom((value) => {
        const isWebUrl = /^https?:\/\/.+/i.test(value);
        const isLocalMobileUri = /^(file|content):\/\/\/.+/i.test(value);
        const isRelativeServerPath = /^(\/)?uploads\/.+/i.test(value);

        if (isWebUrl || isLocalMobileUri || isRelativeServerPath) {
            return true;
        }

        throw new Error(
            'Must be a valid web URL (http/https), local file URI (file/content), or server path'
        );
    })

], async (req, res) => {

    const errors = validationResult(req)

    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: errors.array()[0].msg
        })
    }

    const { Name, Username, Email, Password, ProfilePicture } = req.body

    try {

        const CheckIdentity = await User.findOne({
            $or: [{ Email }, { Username }]
        })

        if (CheckIdentity) {
            return res.status(400).json({
                success: false,
                message: "Try to Use a Different Email or Username."
            })
        }

        const saltRounds = 10

        const Salt = await bcrypt.genSalt(saltRounds)
        const DatabasePassword = await bcrypt.hash(Password, Salt)

        const userData = {
            Name,
            Username,
            Email,
            Password: DatabasePassword
        }

        if (ProfilePicture) {
            userData.ProfilePicture = ProfilePicture
        }

        const user = await User.create(userData)

        const id = user._id

        const payload = {
            id: id,
        }

        const Data = await User.findById(id).select('-Password')

        const SignupToken = jwt.sign(
            payload,
            TokenKey,
            { expiresIn: '7d' }
        )

        // Notify connected clients about the newly created user
        const io = req.app.get('io')

        if (io) {
            io.emit('newUser', Data)
        }

        return res.status(200).json({
            success: true,
            SignupToken: SignupToken,
            Data: Data,
            userId: id.toString(),
            message: "SuccessFully-Created"
        })

    } catch (error) {

        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "Email or Username already in use"
            })
        }

        console.error(error)

        return res.status(500).json({
            success: false,
            message: "Internal Server Error "
        })
    }
})
router.post('/Login', GlobalLimiter, [
    body('Username').trim().optional({ checkFalsy: true }),
    body('Email').optional({ checkFalsy: true }).trim().isEmail().withMessage("Please Enter a Correct Email").normalizeEmail(),
    body('Password').notEmpty().withMessage("Password is Required")
], async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: errors.array()[0].msg
        })
    }
    try {
        const { Email, Username, Password } = req.body
        const VerifyOneField = Boolean(Email) || Boolean(Username && Username.trim())
        if (!VerifyOneField) {
            return res.status(400).json({
                success: false,
                message: "One of the field is Required."
            })
        }

        const VerifyIdentity = await User.findOne({ $or: [{ Email }, { Username }] })
        if (!VerifyIdentity) {
            return res.status(401).json({
                success: false,
                message: "Invalid Credentials "
            })
        }
        const id = VerifyIdentity._id
        const GrabUserPasscode = VerifyIdentity.Password
        const CheckPermission = await bcrypt.compare(Password, GrabUserPasscode)
        if (!CheckPermission) {
            return res.status(401).json({
                success: false,
                message: "Invalid Credentials."
            })
        }
        const payload = {
            id: id
        }
        const LoginToken = jwt.sign(payload, TokenKey, { expiresIn: "7d" })
        return res.status(200).json({
            success: true,
            message: "Login Successful",
            LoginToken: LoginToken,
            userId: id.toString()
        })
    } catch (error) {
        console.error(error)
        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        })
    }
})
router.put('/UpdateProfile', GlobalLimiter, TokenVerify, upload.single('ProfilePicture'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No image file provided"
            })
        }

        const id = req.userId
        const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`
        const user = await User.findByIdAndUpdate(id, { ProfilePicture: imageUrl }, { new: true })
        if (!user) {
            return res.status(404).json({ success: false, message: "User Not Found" })
        }

        return res.status(200).json({
            success: true,
            message: "Profile Updated",
            data: user.ProfilePicture
        })
    } catch (error) {
        console.error(error)
        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        })
    }
})
router.get('/SecondUser/:id', GlobalLimiter, TokenVerify, async (req, res) => {
    try {
        const { id } = req.params
        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Id Required..."
            })
        }
        const user = await User.findById(id).select('-Password -OTP -OTPExpiry -Date -_id -Email -__v -PasswordChangedAt -createdAt -updatedAt')
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User Not Found"
            })
        }
        return res.status(200).json({
            success: true,
            message: "User Loaded SuccessFully",
            Data: user
        })
    } catch (error) {
        console.log(error)
        return res.status(500).json({
            success: false,
            message: "Internal Server Issue..."
        })
    }
})
router.get('/oneuser', GlobalLimiter, TokenVerify, async (req, res) => {
    try {
        const id = req.userId
        const user = await User.findById(id).select('-Password')
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User Not Found"
            })
        }

        return res.status(200).json({
            success: true,
            message: "Successfully Authoriazed",
            Data: user
        })
    } catch (error) {
        console.error(error)
        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        })
    }
})
router.get('/allusers', GlobalLimiter, TokenVerify, async (req, res) => {
    try {
        const users = await User.find().select('-Password')
        return res.status(200).json({
            success: true,
            message: "Successfully Loaded",
            Data: users
        })
    } catch (error) {
        console.error(error)
        return res.status(500).json({
            success: false,
            message: "Internal Server Error "
        })
    }
})
router.put('/UpdateUser', GlobalLimiter, TokenVerify, [
    body('Name').optional(),
    body('Username').optional(),
], async (req, res) => {
    try {
        const id = req.userId
        const { Name, Username } = req.body
        if (!Name?.trim() && !Username?.trim()) {
            return res.status(400).json({
                success: false,
                message: "At least one of the field is required."
            })
        }
        let userData = {}
        if (Name) { userData.Name = Name }
        if (Username) { userData.Username = Username }

        const user = await User.findByIdAndUpdate(id, userData, { new: true }).select('-Password')
        return res.status(200).json({
            success: true,
            message: "Updated Successfully",
            Data: user
        })

    } catch (error) {
        console.error(error)
        return res.status(500).json({
            success: false,
            message: "Internal Server Issue."
        })
    }
})
router.post('/forgot', OTPLIMITER, [
    body('Email').notEmpty().withMessage("Email is required").isEmail().withMessage("Please Enter the Valid Email").normalizeEmail()
], async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: errors.array()[0].msg
        })
    }
    try {
        const { Email } = req.body
        const user = await User.findOne({ Email })
        if (!user) {
            return res.status(200).json({
                success: true,
                message: "If Email is Correct The Otp has been sended"
            })
        }
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const salt = await bcrypt.genSalt(10)
        const hashedOtp = await bcrypt.hash(otp, salt)
        const otpExpiry = new Date(Date.now() + 3 * 60 * 1000)

        sgMail.setApiKey(process.env.SENDGRID_API_KEY)
        try {
            await sgMail.send({
                to: Email,
                from: MYEMAIL,
                subject: 'Your Verification Code',
                html: `<div>
          <p>Hi ${user.Name},</p>
          <p>Your one-time password is:</p>
          <h2>${otp}</h2>
          <p>This code will expire in 3 minutes. If you didn't request this, you can safely ignore this email.</p>
        </div>`,
            })
        } catch (emailError) {
            console.error(emailError.response?.body?.errors || emailError)
            return res.status(500).json({
                success: false,
                message: "Failed to send OTP email"
            })
        }
        const payload = {
            id: user._id,
        }
        const OtpToken = await jwt.sign(payload, OTPKEY, { expiresIn: '3min' })
        await User.findByIdAndUpdate(user._id, { OTP: hashedOtp, OTPExpiry: otpExpiry })
        return res.status(200).json({
            success: true,
            message: "If Email is Correct The Otp has been sended",
            Data: OtpToken
        })
    } catch (error) {
        console.error(error)
        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        })
    }
})
router.post('/verifyotp', OTPLIMITER, ResetVerify, [
    body('OTP').notEmpty().withMessage("Otp Field is required").isLength({
        min: 6,
        max: 6
    }).withMessage("Otp should of be 6 digits"),
], async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: errors.array()[0].msg
        })
    }
    try {
        const id = req.userId
        const user = await User.findById(id)
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not Found"
            })
        }
        const { OTP } = req.body
        const dbotp = user.OTP
        const dbOtpExpiry = user.OTPExpiry
        if (!dbotp || !dbOtpExpiry) {
            return res.status(400).json({
                success: false,
                message: "Not Reset Otp Requested"
            })
        }
        if (Date.now() > dbOtpExpiry) {
            return res.status(401).json({
                success: false,
                message: "Expired OTP"
            })
        }

        const compare = await bcrypt.compare(OTP, dbotp)
        if (!compare) {
            return res.status(403).json({
                success: false,
                message: "Invalid OTP"
            })
        }
        await User.findByIdAndUpdate(user._id, { OTP: null, OTPExpiry: null })
        const payload = {
            id: user._id,
            message: "Access granted"
        }
        const ResetToken = jwt.sign(payload, ResetKey, { expiresIn: "9min" })
        return res.status(200).json({
            success: true,
            message: "Otp Verified",
            Data: ResetToken
        })
    } catch (error) {
        console.error(error)
        return res.status(500).json({
            success: false,
            message: "Internal Server Issue."
        })
    }
})
router.put('/reset', OTPLIMITER, PasswordVerify, [
    body('Password').notEmpty().withMessage("Password Shouldnt be empty").isStrongPassword({
        minLength: 8,
        minUppercase: 1,
        minLowercase: 1,
        minSymbols: 1,
        minNumbers: 1
    }).withMessage("Password should contain Atlease 1 Uppercase,Lowercase, Number and SpecialCharacter and Must Be 8 characters"),

], async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: errors.array()[0].msg
        })
    }
    try {
        const id = req.userId
        const user = await User.findById(id)
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            })
        }
        if (user.PasswordChangedAt && (req.tokenIssuedAt * 1000) < user.PasswordChangedAt.getTime()) {
            return res.status(401).json({ success: false, message: "This reset link has already been used" })
        }
        const { Password } = req.body
        const salt = await bcrypt.genSalt(10)
        const newHashedPassword = await bcrypt.hash(Password, salt)
        await User.findByIdAndUpdate(id, {
            Password: newHashedPassword,
            PasswordChangedAt: new Date()
        })
        return res.status(200).json({
            success: true,
            message: "Password Updated SuccessFully."
        })
    } catch (error) {
        console.error(error)
        return res.status(500).json({
            success: false,
            message: "Internal Server Issue"
        })
    }
})
router.post('/refresh', TokenVerify, async (req, res) => {
    try {
        const id = req.userId
        const user = await User.findById(id)
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User Not Found "
            })
        }
        const payload = {
            id: id,
            message: "RefreshTokenGranted"
        }
        const RefreshToken = jwt.sign(payload, RefreshKey, { expiresIn: '15min' })
        return res.status(200).json({
            success: true,
            message: "Refreshed SuccessFully",
            Data: RefreshToken
        })

    } catch (error) {
        console.error(error)
        return res.status(500).json({
            success: false,
            message: "Internal Server Issue."
        })
    }
})
module.exports = router;
