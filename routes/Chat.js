const express = require('express')
const router = express.Router()
const RefreshVerify = require('../middleware/RefreshToken')
const Chat = require('../models/Chat')
const User = require('../models/User')
const multer = require('multer')
const Image = require('../models/image')
const path = require('path')
const { rateLimit } = require('express-rate-limit')
const { body, validationResult } = require("express-validator");
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../imageuploads'))
},
    filename: (req, file, cb) => {
        const uniqueName = `${req.userId}-${Date.now()}${path.extname(file.originalname)}`
        cb(null, uniqueName)
    }

})
const upload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit, adjust as needed
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true)
        } else {
            cb(new Error('Only image files are allowed'))
        }
    }
})

const ChatLimiter = rateLimit({
    windowMs: 25 * 60 * 1000,
    limit: 600,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ipv6Subnet: 56,
})
router.post('/sendChat/:id', ChatLimiter, RefreshVerify, upload.single('image'), [
    body('message')
        .optional()
        .isString()
        .isLength({ max: 3000 })
        .withMessage("Message Too Long"),
], async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: errors.array()[0].msg
        })
    }
    try {
        const { message } = req.body
        if (!message?.trim() && !req.file) {
            return res.status(400).json({
                success: false,
                message: "One of the Field is required"
            })
        }
        const senderId = req.userId
        const { id: receiverId } = req.params
        if (receiverId === senderId) {
            return res.status(400).json({ success: false, message: "Cannot send a message to yourself" })
        }

        const receiver = await User.findById(receiverId)
        if (!receiver) {
            return res.status(404).json({ success: false, message: "Receiver Not Found" })
        }
        let Userdata = { senderId, receiverId }
        if (req.file) {
            console.log("FILE:", req.file)
            const imageUrl = `${req.protocol}://${req.get('host')}/imageUploads/${req.file.filename}`
            const setimage = await Image.create({
                imageUrl: imageUrl,
                senderId: senderId,
                receiverId: receiverId
            })
            Userdata.image = setimage._id
        }
        if (message) {
            Userdata.message = message
        }
        const { getReceiverSocketId } = require('../Socket')
        const chat = await Chat.create(Userdata)
        await chat.populate('image')
        const receiverSocketId = getReceiverSocketId(receiverId)
        console.log('Sender:', senderId)
        console.log('Receiver id from route:', receiverId)
        console.log('Socket found for receiver:', receiverSocketId)
        if (receiverSocketId) {
            req.app.get('io').to(receiverSocketId).emit('newMessage', chat)
        }
        return res.status(200).json({
            success: true,
            message: "Chat Created SuccessFully",
            Data: chat
        })
    } catch (error) {
        console.error(error)
        return res.status(500).json({
            success: false,
            message: "Internal Server Issue"
        })
    }
})
router.get('/allChats/:id', RefreshVerify, async (req, res) => {
    try {
        const { id } = req.params
        const user = await User.findById(id)
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            })
        }
        const senderId = req.userId
        const receiverId = id
        const chats = await Chat.find({
            $or: [
                { senderId: senderId, receiverId: receiverId, deletedForSender: { $ne: true } },
                { senderId: receiverId, receiverId: senderId, deletedForReceiver: { $ne: true } }
            ]
        }).sort({ createdAt: 1 }).populate('image');
        if (chats.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Start a New Conversation",
            })
        }
        return res.status(200).json({
            success: true,
            message: "Chats Loaded SuccessFully",
            Data: chats
        })
    } catch (error) {
        console.error(error)
        return res.status(500).json({
            success: false,
            message: "Internal Server Issue "
        })
    }
})
router.delete('/delete', RefreshVerify, async (req, res) => {
    try {
        const { chatIds = [], imageIds = [] } = req.body;
        if (chatIds.length === 0 && imageIds.length === 0) {
            return res.status(400).json({ success: false, message: "Id's Are Missing " })
        }

        if (imageIds.length !== 0) {
            console.log(imageIds)
            const image = await Image.find({
                _id: { $in: imageIds },
                $or: [
                    { senderId: req.userId },
                    { receiverId: req.userId }
                ]
            });
            if (image.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "No Images Found to delete  "
                })
            }

            await Image.updateMany(
                {
                    _id: { $in: imageIds },
                    senderId: req.userId
                },
                {
                    $set: { deletedForSender: true }
                }
            );
            await Image.updateMany(
                {
                    _id: { $in: imageIds },
                    receiverId: req.userId
                },
                {
                    $set: { deletedForReceiver: true }
                }
            );

            await Image.deleteMany({
                _id: { $in: imageIds },
                deletedForSender: true,
                deletedForReceiver: true
            })
        }
        if (chatIds.length !== 0) {
            const chat = await Chat.find({
                _id: { $in: chatIds },
                $or: [
                    { senderId: req.userId },
                    { receiverId: req.userId }
                ]
            });
            if (chat.length === 0) {
                return res.status(404).json({ success: false, message: "No Chats Found to delete " })
            }
            await Chat.updateMany(
                {
                    _id: { $in: chatIds },
                    senderId: req.userId
                },
                {
                    $set: { deletedForSender: true }
                }
            );
            await Chat.updateMany(
                {
                    _id: { $in: chatIds },
                    receiverId: req.userId
                },
                {
                    $set: { deletedForReceiver: true }
                }
            );

            await Chat.deleteMany({
                _id: { $in: chatIds },
                deletedForSender: true,
                deletedForReceiver: true
            })
        }


        return res.status(200).json({
            success: true,
            message: "Chat Deleted Successfully"
        })
    } catch (error) {
        console.error(error)
        return res.status(500).json({ success: false, message: "Internal Server Issue" })
    }
})
router.delete('/deleteAll/:id', RefreshVerify, async (req, res) => {
    try {
        const senderId = req.userId
        const { id: otherUserId } = req.params
        const user = await User.findById(otherUserId)
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Reciever Not Found"
            })
        }

        await Chat.updateMany(
            { senderId: senderId, receiverId: otherUserId },
            { deletedForSender: true }
        )
        await Chat.updateMany(
            { senderId: otherUserId, receiverId: senderId },
            { deletedForReceiver: true }
        )
        await Image.updateMany(
            {
                senderId: senderId,
                receiverId: otherUserId
            },
            {
                deletedForSender: true
            }
        );

        await Image.updateMany(
            {
                senderId: otherUserId,
                receiverId: senderId
            },
            {
                deletedForReceiver: true
            }
        );
        await Chat.deleteMany({
            $or: [
                { senderId: senderId, receiverId: otherUserId },
                { senderId: otherUserId, receiverId: senderId }
            ],
            deletedForSender: true,
            deletedForReceiver: true
        })

        await Image.deleteMany({
            $or: [
                { senderId: senderId, receiverId: otherUserId },
                { senderId: otherUserId, receiverId: senderId }
            ],
            deletedForSender: true,
            deletedForReceiver: true
        })

        return res.status(200).json({
            success: true,
            message: "Conversation Cleared Successfully"
        })
    } catch (error) {
        console.error(error)
        return res.status(500).json({ success: false, message: "Internal Server Issue" })
    }
})
module.exports = router;
