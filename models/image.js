const mongoose = require('mongoose')
const ImageSchema = new mongoose.Schema({
    imageUrl: {
        type: String,
        required: true
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

    deletedForSender: {
        type: Boolean,
        default: false
    },

    deletedForReceiver: {
        type: Boolean,
        default: false
    }

});

module.exports = mongoose.model("Image", ImageSchema);