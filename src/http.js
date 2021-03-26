const express = require('express')
const api = require('./api')

const app = express()
app.use(express.static('public'))
app.use(express.json())
app.use(express.urlencoded({ extended: false }));


app.get('/', (req, res, next) => {
	api.getRankings()
	.then(rankings => res.json(rankings))
	.catch(next)
})

app.get('/players/:playername', (req, res, next) => {
	api.getPlayerProfile(req.params.playername)
	.then(player => res.json(player))
	.catch(next)
})

app.post('/players', (req, res, next) => {
	api.newPlayer(req.body)
	.then(player => res.json({ message: 'player created' }))
	.catch(next)
})

app.post('/game', (req, res, next) => {
	api.resolveGame(req.body)
	.then(result => res.json(result))
	.catch(next)
})

app.post('/game/nvn', (req, res, next) => {
	api.resolveGameNvN(req.body)
	.then(result => res.json(result))
	.catch(next)
})

app.get('/history', (req, res, next) => {
	api.getHistory()
	.then(history => res.json(history))
	.catch(next)
})

app.use((err, req, res, next) => {
	if (err instanceof Error) {
		console.error(err)
		return res.status(500).json({ message: err.message, stack: err.stack })
	}
	return res.status(400).json(err)
})

module.exports = app;
