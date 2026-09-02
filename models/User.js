const mongoose = require('mongoose')
const UserSchema = new mongoose.Schema({
    Name: {
        type: String,
        required: true
    },
    Username: {
        type: String,
        required: true,
        unique: true
    },
    Email: {
        type: String,
        required: true,
        unique: true,
    },
    Password: {
        type: String,
        required: true
    },
    PasswordChangedAt: {
        type: Date
    },
    ProfilePicture: {
        type: String,
        trim: true,

    },
    OTP: { type: String },
    OTPExpiry: { type: Date },
    Date: {
        type: Date,
        default: Date.now()
    }
}, { timestamps: true })
module.exports = mongoose.model("User", UserSchema)