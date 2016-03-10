const express = require('express')
const bodyParser = require('body-parser')
const elo = require('./elo')
const package = require('./package')
const api = require('./api')
const slackBot = require('./slack-bot')

if (process.env.SLACK_API_TOKEN) {
	slackBot(process.env.SLACK_API_TOKEN)
}

const app = express()
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }));

app.get('/', (req, res) => {
	api.getRankings()
	.then(rankings => res.json(rankings))
	.catch(err => res.status(500).send(err.message))
})

app.get('/players/:playername', (req, res) => {
	api.getPlayerProfile(req.params.playername)
	.then(player => res.json(player))
	.catch(err => res.status(500).send(err.message))
})

app.post('/players', (req, res) => {
	api.newPlayer(req.body)
	.then(player => {
		return res.send('player created')
	})
	.catch(err => res.status(500).send(err.message))
})

app.post('/game', (req, res) => {
	const valid = ajv.validate({
		type: 'object',
		required: ['winner', 'loser'],
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
	.then(col => col.find({ name: { $in: [req.body.winner, req.body.loser] }}).toArray()
		.then(players => {
			const winner = players.find(player => player.name === req.body.winner)
			if (!winner) {
				return res.status(400).send('winner not found')
			}

			const loser = players.find(player => player.name === req.body.loser)
			if (!loser) {
				return res.status(400).send('loser not found')
			}

			const delta = elo(winner.elo, loser.elo)
			const date = new Date()

			return Promise.all([
				col.update({ _id: mongodb.ObjectID(winner._id) }, {
					$inc: { elo: delta, wins: 1 },
					$push: { history: { time: date, elo: winner.elo + delta, result: 'win', against: loser.name}},
				}),
				col.update({ _id: mongodb.ObjectID(loser._id) }, {
					$inc: { elo: -delta, loses: 1 },
					$push: { history: { time: date, elo: loser.elo - delta, result: 'loss', against: winner.name }},
				}),
			])
			.then(() => res.json({
				message: 'game resolved',
				deltaElo: delta,
				newWinnerElo: winner.elo + delta,
				newLoserElo: loser.elo - delta,
			}))
		})
	)
	.catch(err => res.status(500).json(err.stack))
})

app.post('/game/nvn', (req, res) => {
	const valid = ajv.validate({
		type: 'object',
		required: ['winners', 'losers'],
		properties: {
			winners: { type: 'array', items: { type: 'string' } },
			losers: { type: 'array', items: { type: 'string' } },
		},
	}, req.body);

	if (!valid) {
		return res.status(400).send(ajv.errors)
	}

	if (req.body.winners.length !== req.body.losers.length) {
		return res.status(400).send('there must be an equal number of winners and losers')
	}

	const playerNames = [].concat(req.body.winners).concat(req.body.losers)

	connectDb
	.then(db => db.collection('players'))
	.then(col => col.find({ name: { $in: playerNames }}).toArray()
		.then(playerDocs => {

			if (playerDocs.length !== playerNames.length) {
				return res.status(400).send('one or more players could not be found')
			}

			const winnerDocs = req.body.winners
				.map(name => playerDocs.find(doc => doc.name === name))
			const loserDocs = req.body.losers
				.map(name => playerDocs.find(doc => doc.name === name))

			const winnerElo = Math.round(winnerDocs
				.reduce((elo, doc) => (elo + doc.elo), 0) / winnerDocs.length)

			const losersElo = Math.round(loserDocs
				.reduce((elo, doc) => (elo + doc.elo), 0) / loserDocs.length)

			const delta = Math.round(elo(winnerElo, losersElo) / winnerDocs.length)
			const date = new Date()

			const winnerUpdates = winnerDocs.map(doc => {
				return col.update({ _id: mongodb.ObjectID(doc._id) }, {
					$inc: { elo: delta, wins: 1 },
					$push: { history: { time: date, elo: doc.elo + delta, result: 'win', against: req.body.losers}},
				})
			})

			const loserUpdates = loserDocs.map(doc => {
				return col.update({ _id: mongodb.ObjectID(doc._id) }, {
					$inc: { elo: -delta, loses: 1 },
					$push: { history: { time: date, elo: doc.elo - delta, result: 'loss', against: req.body.winners}},
				})
			})

			return Promise.all([
				winnerUpdates,
				loserUpdates
			])
			.then(() => res.json({
				message: 'game resolved',
				deltaElo: delta,
				newWinnerElo: winnerDocs.map(doc => doc.name + ': ' + (doc.elo + delta)),
				newLoserElo: loserDocs.map(doc => doc.name + ': ' + (doc.elo - delta)),
			}))
		})
	)
	.catch(err => res.status(500).send(err.stack))
})

const port = process.env.PORT || 3000
app.listen(port, () => {
	console.log('Listening on', port)
})

console.log('Foosball ranking server %s', package.version)
