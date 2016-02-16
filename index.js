const eloRank = require('elo-rank')
const mongodb = require('mongodb')
const MongoClient = mongodb.MongoClient
const express = require('express')
const bodyParser = require('body-parser')
const ajv = require('ajv')()

const app = express()
app.use(bodyParser.json())

const mongoUrl = process.env.MONGOLAB_URI || 'mongodb://localhost:27017/foosball-rankings'
const connectDb = MongoClient.connect(mongoUrl)

app.get('/', (req, res) => {
	connectDb
		.then(db => db.collection('players'))
		.then(players => players.find().sort({elo: -1}).toArray())
		.then(playerList => res.json(playerList))
		.catch(err => console.log(err.stack))
})

app.post('/players', (req, res) => {
	
	const valid = ajv.validate({
		type: 'object',
		required: ['name'],
		properties: {
			name: { type: 'string' },
		},
	}, req.body);

	if (!valid) {
		return res.status(400).send(ajv.errors)
	}

	connectDb
		.then(db => db.collection('players'))
		.then(players => {
			players.findOne({name: req.body.name})
				.then(player => {
					if (player) {
						return res.status(400).send('player already exists')
					}

					return players.insertOne({
							name: req.body.name,
							elo: 1000,
						})
						.then(player => {
							return res.send('player created')
						})
				})
		})
})

app.post('/game', (req, res) => {
	const valid = ajv.validate({
		type: 'object',
		required: ['name'],
		properties: {
			winner: { type: 'string' },
			loser: { type: 'string' },
		},
	}, req.body);

	if (!valid) {
		return res.status(400).send(ajv.errors)
	}

	connectDb
		.then(db => db.collection('players'))
		.then(col => {
			col.find({ name: { $or: [req.body.winner, req.body.looser] }}).toArray()
				.then(players => {
					const winner = players.find(player => player.name === req.body.winner)
					if (!winner) {
						return res.status(400).send('winner not found')
					}

					const loser = players.find(player => player.name === req.body.looser)
					if (!loser) {
						return res.status(400).send('loser not found')
					}

					const winnerExpected = elo.getExpected(winner.elo, loser.elo)
					const loserExpected = elo.getExpected(loser.elo, winner.elo)
					const winnerElo = elo.updateRating(winnerExpected, 1, winner.elo)
					const loserElo = elo.updateRating(loserExpected, 0, loser.elo)

					return Promise.all([
							col.update({ name: winner.name }, { $set: { elo: winnerElo }}),
							col.update({ name: loser.name }, { $set: { elo: loserElo }}),
						])
						.then(() => res.send('match resolved'))
				})
		})
})

const port = process.env.PORT || 3000
app.listen(port, () => {
	console.log('Listening on', port)
})