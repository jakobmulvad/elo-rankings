const mongodb = require('mongodb')
const mongoUrl = process.env.MONGO_URI || 'mongodb://localhost:27017/foosball-rankings'
const connection = mongodb.MongoClient.connect(mongoUrl)
.catch(err => {
	console.error('Error connecting to database')
	console.error(err.stack || err)
})

console.log('Using mongo connection string "%s"', mongoUrl)

module.exports = connection
