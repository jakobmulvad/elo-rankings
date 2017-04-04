const mongodb = require('mongodb')
const config = require('./config')
const connection = mongodb.MongoClient.connect(config.mongoUrl)
.catch(err => {
	console.error('Error connecting to database')
	console.error(err.stack || err)
})

module.exports = connection
