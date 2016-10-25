const app = require('./app')
const slackBot = require('./slack-bot')

if (process.env.SLACK_API_TOKEN) {
	slackBot(process.env.SLACK_API_TOKEN)
}

const port = process.env.PORT || 3000
app.listen(port, () => {
	console.log('Listening on', port)
})

console.log('Foosball ranking server %s', package.version)
