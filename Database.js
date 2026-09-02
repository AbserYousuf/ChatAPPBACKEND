const Mongoose = require('mongoose')
const mongooseUrl = process.env.MONGO_URL
const MongoConnect = async () => {
    try {
        const connect = await Mongoose.connect(mongooseUrl)
        console.log("Databse Connected Successfully")
    } catch (error) {
        console.error("Failed to Connect :: ", error)
    }
}
module.exports = MongoConnect;