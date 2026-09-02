const mongoose = require('mongoose')
const ChatSchema = new mongoose.Schema({
    message: {
        type: String
    },
    image: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Image'
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    deletedForSender: { type: Boolean, default: false },
    deletedForReceiver: { type: Boolean, default: false }
}, { timestamps: true })
module.exports = mongoose.model('Chat', ChatSchema);