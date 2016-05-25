const mongodb = require('mongodb')
const ajv = require('ajv')()
const elo = require('./elo')

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

	getHistory: function() {
		return getCollection('history')
		.then(history => history.find().toArray())
		.then(historyJson => historyJson.map(doc => {
			delete doc._id
			return doc
		}))
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
			throw ajv.errors
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

	resolveGame: function(query) {
		const valid = ajv.validate({
			type: 'object',
			required: ['winner', 'loser'],
			properties: {
				winner: { type: 'string' },
				loser: { type: 'string' },
			},
		}, query);

		if (!valid) {
			throw ajv.errors
		}

		return api.resolveGameNvN({
			winners: [query.winner],
			losers: [query.loser],
		})
	},

	resolveGameNvN: function(query) {
		const valid = ajv.validate({
			type: 'object',
			required: ['winners', 'losers'],
			properties: {
				winners: { type: 'array', items: { type: 'string' } },
				losers: { type: 'array', items: { type: 'string' } },
			},
		}, query);

		if (!valid) {
			throw ajv.errors
		}

		if (query.winners.length !== query.losers.length) {
			throw { message: 'there must be an equal number of winners and losers' }
		}

		const playerNames = [].concat(query.winners).concat(query.losers)

		return getCollection('players')
		.then(players => players.find({ name: { $in: playerNames }}).toArray()
			.then(playerDocs => {

				if (playerDocs.length !== playerNames.length) {
					throw { message: 'one or more players could not be found' }
				}

				const winnerDocs = query.winners
					.map(name => playerDocs.find(doc => doc.name === name))
				const loserDocs = query.losers
					.map(name => playerDocs.find(doc => doc.name === name))

				const winnerElo = Math.round(winnerDocs
					.reduce((elo, doc) => (elo + doc.elo), 0) / winnerDocs.length)

				const losersElo = Math.round(loserDocs
					.reduce((elo, doc) => (elo + doc.elo), 0) / loserDocs.length)

				const delta = Math.round(elo(winnerElo, losersElo) / winnerDocs.length)
				const date = new Date()

				const winnerUpdates = winnerDocs.map(doc => {
					return players.update({ _id: mongodb.ObjectID(doc._id) }, {
						$inc: { elo: delta, wins: 1 },
					})
				})

				const loserUpdates = loserDocs.map(doc => {
					return players.update({ _id: mongodb.ObjectID(doc._id) }, {
						$inc: { elo: -delta, loses: 1 },
					})
				})

				const historyUpdate = getCollection('history')
				.then(history => history.insertOne({
					time: date, 
					players: playerNames,
					winners: query.winners,
					losers: query.losers,
					deltaElo: delta, 
					elo: playerNames
						.map(name => playerDocs.find(doc => doc.name === name))
						.map(doc => doc.elo + delta),
				}))

				return Promise.all([
					winnerUpdates,
					loserUpdates,
					historyUpdate,
				])
				.then(() => ({
					message: 'game resolved',
					deltaElo: delta,
					newWinnerElo: winnerDocs.map(doc => ({ name: doc.name, elo: (doc.elo + delta)})),
					newLoserElo:  loserDocs.map(doc => ({ name: doc.name, elo: (doc.elo - delta)})),
				}))
			})
		)
	},
}

module.exports = api;
