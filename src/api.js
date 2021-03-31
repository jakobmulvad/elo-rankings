const mongodb = require('mongodb');
const getDb = require('./get-db')
const http = require('http');
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

function makeSafeHttpCall(url) {
	http.get(url, () => undefined).on('error', console.log);
}

const api = {
	getRankings: async function() {
		const players = await getCollection('players')
		return players.find().sort({elo: -1}).toArray()
	},

	getHistory: async function() {
		const history = await getCollection('history')
		const documents = await history.find().toArray()
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

		let red = 255;
		let green = 0;
		if (gameResult.probability >= 0.5) {
			red = 0;
			green = 255;
		}
		const lightUrl = 'http://carlpi:5000/color?red='+ red + '&blue=0&green=' + green;
		makeSafeHttpCall(lightUrl);

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

		const joinString = '-=-|-=-'
		const matchups = {};
		allHistory.forEach(doc => {
			console.log(doc)
			const winner = doc.winners[0];
			const loser = doc.losers[0];
			let delta = doc.deltaElo;
			let combinedName = loser + joinString + winner;
			if (winner < loser) {
				delta *= -1;
				combinedName = winner + joinString + loser;
			}
			if (combinedName in matchups) {
				matchups[combinedName] += delta;
			} else {
				matchups[combinedName] = delta;
			}
		});
		const largest = Object.entries(matchups).reduce((current, biggest) => {
			return Math.abs(current[1]) > Math.abs(biggest[1]) ? current : biggest;
		}, ['fake', 0]);
		const feed = largest[0].split(joinString);
		feed.push(largest[1]);
		if (largest[1] < 0) {
			feed[2] *= -1;
		} else {
			const temp = feed[0];
			feed[0] = feed[1];
			feed[1] = temp;
		}

		return {
			gamesPlayed: allHistory.length,
			biggestUpset: upsets[0],
			highestElo: eloEntries[0],
			lowestElo: eloEntries[eloEntries.length-1],
			feed,
		}
	},


   h2h: async function(query) {
		const valid = ajv.validate({
			type: 'object',
			required: ['player1', 'player2'],
			properties: {
				player1: { type: 'string' },
				player2: { type: 'string' },
			},
		}, query);

		if (!valid) {
			throw new Error(ajv.errors)
		}

		const p1 = query.player1
	   	const p2 = query.player2

		let totalGames = 0;
		let p1WinCount = 0;
		let p1EloGain = 0;

		const history = await api.getHistory();
		history.forEach(pastGame => {
			const bothPlayersInvolved =
				[p1, p2].includes(pastGame.players[0].name) && [p1, p2].includes(pastGame.players[1].name)
			if (bothPlayersInvolved) {
				totalGames += 1;
				const p1Won = pastGame.winners[0] === p1;
				if (p1Won) {
					p1WinCount += 1;
					p1EloGain += pastGame.deltaElo;
				} else {
					p1EloGain -= pastGame.deltaElo;
				}
			}
		});
		return {totalGames, p1WinCount, p1EloGain}
	}
}

module.exports = api;
