const mongodb = require('mongodb');
const getDb = require('./get-db')
const ajv = require('ajv')()
const elo = require('./elo')

async function getCollection(collection) {
	const db = await getDb
	return db.collection(collection)
}

function getAverageElo(docs) {
	const eloSum = docs.reduce((elo, doc) => elo + doc.elo, 0)
	return Math.round(eloSum / docs.length)
}

const api = {
	getRankings: async function() {
		const players = await getCollection('players')
		return players.find().sort({elo: -1}).toArray()
	},

	getHistory: async function() {
		const history = await getCollection('history')
		const documents = history.find().toArray()
		return documents.map(doc => {
			delete doc._id
			return doc
		})
	},

	newPlayer: async function(query) {
		const valid = ajv.validate({
			type: 'object',
			required: ['name'],
			properties: {
				name: { type: 'string' },
				elo: { type: 'number' },
			},
		}, query);

		if (!valid) {
			throw new Error(ajv.errors)
		}

		const players = await getCollection('players')
		const existingPLayer = await players.findOne({name: query.name})
		if (existingPLayer) {
			throw new Error('Player already exists')
		}

		await players.insertOne({
			name: query.name,
			elo: ('elo' in query) ? query.elo : 1000,
		})

		return {
			message: 'Player created',
			name: query.name,
		}
	},

	getPlayerProfile: async function(playerName) {
		const players = await getCollection('players')
		return players.findOne({name: playerName})
	},

	resolveGame: async function(query) {
		const valid = ajv.validate({
			type: 'object',
			required: ['winner', 'loser'],
			properties: {
				winner: { type: 'string' },
				loser: { type: 'string' },
			},
		}, query);

		if (!valid) {
			throw new Error(ajv.errors)
		}

		const gameResult = await api.resolveGameNvN({
			winners: [query.winner],
			losers: [query.loser],
		})

		return {
			message: gameResult.message,
			winner: gameResult.winners[0],
			loser: gameResult.losers[0],
			deltaElo: gameResult.deltaElo,
			probability: gameResult.probability,
		}
	},

	resolveGameNvN: async function(query) {
		const valid = ajv.validate({
			type: 'object',
			required: ['winners', 'losers'],
			properties: {
				winners: { type: 'array', items: { type: 'string' } },
				losers: { type: 'array', items: { type: 'string' } },
			},
		}, query);

		if (!valid) {
			throw new Error(ajv.errors)
		}

		if (query.winners.length !== query.losers.length) {
			throw new Error('there must be an equal number of winners and losers')
		}

		const playerNames = [].concat(query.winners).concat(query.losers)
		const players = await getCollection('players')
		const playerDocs = await players.find({ name: { $in: playerNames }}).toArray()
		
		if (playerDocs.length !== playerNames.length) {
			throw new Error('one or more players could not be found')
		}

		const winnerDocs = query.winners
			.map(name => playerDocs.find(doc => doc.name === name))
		const loserDocs = query.losers
			.map(name => playerDocs.find(doc => doc.name === name))

		const winnersElo = getAverageElo(winnerDocs)
		const losersElo = getAverageElo(loserDocs)

		const delta = Math.round(elo(winnersElo, losersElo) / winnerDocs.length)
		const date = new Date()

		const winnerUpdates = winnerDocs.map(doc => {
			return players.update({ _id: mongodb.ObjectID(doc._id) }, {
				$inc: { elo: delta, wins: 1 },
				$set: { lastActivity: new Date() },
			})
		})

		const loserUpdates = loserDocs.map(doc => {
			return players.update({ _id: mongodb.ObjectID(doc._id) }, {
				$inc: { elo: -delta, loses: 1 },
				$set: { lastActivity: new Date() },
			})
		})

		const playerObjects = playerNames
			.map(name => playerDocs.find(doc => doc.name === name))
			.map(doc => {
				const isWinner = query.winners.some(winner => winner == doc.name);
				return {
					name: doc.name,
					elo: doc.elo + (isWinner ? delta : -delta)
				}
			})

		const history = await getCollection('history')
		const historyUpdate = history.insertOne({
			time: date,
			players: playerObjects,
			winners: query.winners,
			losers: query.losers,
			deltaElo: delta,
		})

		await Promise.all([
			winnerUpdates,
			loserUpdates,
			historyUpdate,
		])

		return {
			message: 'game resolved',
			deltaElo: delta,
			winners: winnerDocs.map(doc => ({ name: doc.name, elo: (doc.elo + delta)})),
			losers:  loserDocs.map(doc => ({ name: doc.name, elo: (doc.elo - delta)})),
			probability: 1-elo(winnersElo, losersElo, 1),
		}
	},

	undoLastGame: async function() {
		const history = await getCollection('history')
		const players = await getCollection('players')
		const lastGame = await history.findOne({},{sort: {time: -1}})
		const winnerDocs = await players.find({ name: { $in: lastGame.winners }}).toArray()
		const loserDocs = await players.find({ name: { $in: lastGame.losers }}).toArray()

		const winnerUpdates = winnerDocs.map(doc => {
			return players.update({ _id: mongodb.ObjectID(doc._id) }, {
				$inc: { elo: -lastGame.deltaElo, wins: -1 },
			})
		})

		const loserUpdates = loserDocs.map(doc => {
			return players.update({ _id: mongodb.ObjectID(doc._id) }, {
				$inc: { elo: lastGame.deltaElo, loses: -1 },
			})
		})

		const historyUpdate = history.deleteOne({_id: mongodb.ObjectID(lastGame._id)})

		await Promise.all([
			winnerUpdates,
			loserUpdates,
			historyUpdate,
		])

		return {
			message: 'game was rolled back',
			deltaElo: lastGame.deltaElo,
			winners: winnerDocs.map(doc => ({ name: doc.name, elo: (doc.elo - lastGame.deltaElo)})),
			losers:  loserDocs.map(doc => ({ name: doc.name, elo: (doc.elo + lastGame.deltaElo)})),
		}
	},

	stats: async function() {
		const history = await getCollection('history')
		const allHistory = await history.find().toArray()

		if (allHistory.length === 0) {
			return {
				gamesPlayed: 0
			}
		}

		const upsets = allHistory.map(doc => {
			const winners = doc.winners.map(name => doc.players.find(p => p.name === name))
			const losers = doc.losers.map(name => doc.players.find(p => p.name === name))
			const winnersElo = getAverageElo(winners)
			const losersElo = getAverageElo(losers)
			return {
				winners,
				losers,
				eloDifference: losersElo - winnersElo,
				probability: 1-elo(winnersElo, losersElo, 1),
				time: doc.time
			}
		})
		upsets.sort((a,b) => a.probability - b.probability)

		const eloEntries = allHistory.reduce((acc, doc) => {
			return acc.concat(doc.players.map(player => ({
				name: player.name,
				elo: player.elo,
				time: doc.time,
			})))
		}, [])
		eloEntries.sort((a,b) => b.elo - a.elo)

		return {
			gamesPlayed: allHistory.length,
			biggestUpset: upsets[0],
			highestElo: eloEntries[0],
			lowestElo: eloEntries[eloEntries.length-1],
		}
	},
}

module.exports = api;
