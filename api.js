const mongodb = require('mongodb')
const ajv = require('ajv')()

const mongoUrl = process.env.MONGO_URI || 'mongodb://localhost:27017/foosball-rankings'
const connectDb = mongodb.MongoClient.connect(mongoUrl)
.catch(err => {
	console.error('Error connecting to database')
	console.error(err.stack || err)
})

console.log('Using mongo connection string "%s"', mongoUrl)

function getCollection(collection) {
	return connectDb.then(db => db.collection(collection))
}

const api = {
	getRankings: function() {
		return getCollection('players')
		.then(players => players.find().sort({elo: -1}).toArray())
		.then(playerList => playerList.map(player => ({name: player.name, elo: player.elo})))
	},

	newPlayer: function(query) {
		const valid = ajv.validate({
			type: 'object',
			required: ['name'],
			properties: {
				name: { type: 'string' },
			},
		}, query);

		if (!valid) {
			throw new Error(ajv.errors)
		}

		return getCollection('players')
		.then(players => {
			players.findOne({name: query.name})
			.then(player => {
				if (player) {
					throw new Error('player already exists')
				}

				return players.insertOne({
					name: query.name,
					elo: 1000,
				})
			})
		})
	},

	getPlayerProfile: function(playerName) {
		return getCollection('players')
		.then(players => players.findOne({name: playerName}))
	},
}

module.exports = api;
