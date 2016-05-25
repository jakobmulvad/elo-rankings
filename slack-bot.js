const RtmClient = require('@slack/client').RtmClient
const CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS
const RTM_EVENTS = require('@slack/client').RTM_EVENTS
const api = require('./api')
const package = require('./package')

const bot = 'U0R76NUHZ'
const channel = 'C0R7DAP5L'

const commands = {
	'help': {
		description: 'Gets the list of available commands',
		usage: '!help',
		handler: rtm => {
			const keys = Object.keys(commands)
			const topics = keys.map(key => commands[key].usage + ' - ' + commands[key].description)
			rtm.sendMessage('Foosball Rankings ' + package.version + '\nAvailable commands:\n```' + topics.join('\n') + '```', channel)
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
			.catch(err => console.error(err.stack || err.message || err))
		}
	},
	'game': {
		description: 'Resolve the outcome of a game',
		usage: '!game <winner> <loser>',
		handler: (rtm, args) => {

			if (!Array.isArray(args) || args.length !== 2) {
				return rtm.sendMessage('Incorrect number of arguments', channel)
			}

			api.resolveGame({
				winner: args[0],
				loser: args[1],
			})
			.then(res => {
				delete res.message
				rtm.sendMessage('Game was resolved\n```' + JSON.stringify(res) + '```', channel)
			})
			.catch(err => {
				rtm.sendMessage('Failed to resolve game\n```' + JSON.stringify(err) + '```', channel)
				console.error(err.stack || err.message || err)
			})
		}
	}
}

module.exports = function(apiToken) {
	const rtm = new RtmClient(apiToken, {logLevel: 'error'})
	rtm.start()
	rtm.on(RTM_EVENTS.MESSAGE, function (message) {
		if (!message.text) {
			return
		}

		if (message.text.startsWith('!')) {
			const commandText = message.text.slice(1).toLowerCase()
			const commandArgs = commandText.split(' ')
			const command = commands[commandArgs[0]]
			if (!command) {
				return
			}

			console.log('Executing command from slack:', commandText)

			return command.handler(rtm, commandArgs.slice(1))
		}
	})

	rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, function (rtmStartData) {
		console.log('Slack authenticated')
		// authenticated but rtm client is not connected
	})

	rtm.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, function () {
		console.log('Slack connected')
		// rtm client can now be used
		rtm.sendMessage('Foosball Rankings v' + package.version + ' online')
	})
}