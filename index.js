const express = require('express')
const bodyParser = require('body-parser')
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
	.then(player => res.send('player created'))
	.catch(err => res.status(500).send(err.message))
})

app.post('/game', (req, res) => {
	api.resolveGame(req.body)
	.then(result => res.json(result))
	.catch(err => res.status(500).json(err.stack))
})

app.post('/game/nvn', (req, res) => {
	api.resolveGameNvN(req.body)
	.then(result => res.json(result))
	.catch(err => res.status(500).json(err.stack))
})

const port = process.env.PORT || 3000
app.listen(port, () => {
	console.log('Listening on', port)
})

console.log('Foosball ranking server %s', package.version)
