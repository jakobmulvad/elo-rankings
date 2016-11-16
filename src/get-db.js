const mongodb = require('mongodb')
const config = require('./config')
const connection = mongodb.MongoClient.connect(config.mongoUrl)
.catch(err => {
	console.error('Error connecting to database')
	console.error(err.stack || err)
})

console.log('Using mongo connection string "%s"', config.mongoUrl)

module.exports = connection
