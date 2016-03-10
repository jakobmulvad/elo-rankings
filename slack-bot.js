const RtmClient = require('@slack/client').RtmClient
const CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS
const RTM_EVENTS = require('@slack/client').RTM_EVENTS
const api = require('./api')

const bot = 'U0R76NUHZ'
const channel = 'C0R7DAP5L'

const commands = {
	'help': {
		description: 'Gets the list of available commands',
		usage: '!help',
		handler: rtm => {
			const keys = Object.keys(commands)
			const topics = keys.map(key => commands[key].usage + ' - ' + commands[key].description)
			rtm.sendMessage('Available commands:\n```' + topics.join('\n') + '```', channel)
		}
	},
	'rank': {
		description: 'Get the current rankings',
		usage: '!rank',
		handler: rtm => {
			api.getRankings()
			.then(rankings => {
				const heading = 'The rankings as of ' + new Date().toJSON() + ':\n'
				rankings = rankings.map(rank => rank.name + '.'.repeat(10 - (rank.name + rank.elo).length) + rank.elo)
				rtm.sendMessage(heading + '```' + rankings.join('\n') + '```', channel)
			})
			.catch(err => console.error(err.stack))
		}
	}
}


module.exports = function(apiToken) {
	const rtm = new RtmClient(apiToken, {logLevel: 'error'})
	rtm.start()
	rtm.on(RTM_EVENTS.MESSAGE, function (message) {
		console.log(message)
		if (!message.text) {
			return
		}

		if (message.text.startsWith('!')) {
			const key = message.text.slice(1).trim().toLowerCase()
			const command = commands[key]
			if (!command) {
				return
			}

			console.log('Executing command from slack:', key)

			return command.handler(rtm)
		}
	})

	rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, function (rtmStartData) {
		console.log('Slack authenticated')
		// authenticated but rtm client is not connected
	})

	rtm.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, function () {
		console.log('Slack connected')
		// rtm client can now be used
	})
}