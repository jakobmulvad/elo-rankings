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
	.catch(handleError(res))
})

app.get('/players/:playername', (req, res) => {
	api.getPlayerProfile(req.params.playername)
	.then(player => res.json(player))
	.catch(handleError(res))
})

app.post('/players', (req, res) => {
	api.newPlayer(req.body)
	.then(player => res.json({ message: 'player created' }))
	.catch(handleError(res))
})

app.post('/game', (req, res) => {
	api.resolveGame(req.body)
	.then(result => res.json(result))
	.catch(handleError(res))
})

app.post('/game/nvn', (req, res) => {
	api.resolveGameNvN(req.body)
	.then(result => res.json(result))
	.catch(handleError(res))
})

app.get('/history', (req, res) => {
	api.getHistory()
	.then(history => res.json(history))
	.catch(handleError(res))
})

const port = process.env.PORT || 3000
app.listen(port, () => {
	console.log('Listening on', port)
})

function handleError(res) {
	return function(err) {
		console.error(err)

		if (err instanceof Error) {
			return res.status(500).json({ message: err.message, stack: err.stack })
		}

		return res.status(400).json(err)
	} 
}

console.log('Foosball ranking server %s', package.version)
