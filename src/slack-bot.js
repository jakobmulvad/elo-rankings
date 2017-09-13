const RtmClient = require('@slack/client').RtmClient
const MemoryDataStore = require('@slack/client').MemoryDataStore;
const RTM_CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS.RTM
const RTM_EVENTS = require('@slack/client').RTM_EVENTS
const api = require('./api')
const package = require('../package')
const config = require('./config')
const ONE_MONTH = 1000 * 60 * 60 * 24 * 30

const commands = {
	'help': {
		description: 'Gets the list of available commands',
		usage: '!help',
		handler: sendMessage => {
			const keys = Object.keys(commands)
			const topics = keys.map(key => commands[key].usage + ' - ' + commands[key].description)
			sendMessage('Foosball Rankings ' + package.version + '\nAvailable commands:\n```' + topics.join('\n') + '```')
		}
	},
	'newplayer': {
		description: 'Creates a new player',
		usage: '!newplayer <name>',
		handler: async (sendMessage, args) => {
			if (!Array.isArray(args) || args.length !== 1) {
				return sendMessage('Missing player name')
			}

			try {
				const player = await api.newPlayer({
					name: args[0]
				})
				sendMessage('Player created\n```' + JSON.stringify(name) + '```');
			} catch (err) {
				sendMessage('Failed to create player\n```' + JSON.stringify(err) + '```')
			}
		}
	},
	'rank': {
		description: 'Gets the current rankings. Defaults to only showing active players.',
		usage: '!rank [all]',
		handler: async (sendMessage, args) => {
			try {
				let rankings = await api.getRankings()				
				if (!args.length || args[0] !== 'all') {
					rankings = rankings.filter(ranking => ranking.lastActivity && Date.now() - ranking.lastActivity.getTime() < ONE_MONTH)
				}
	
				const heading = 'The rankings as of ' + new Date().toJSON() + ':\n'
				rankings = rankings.map(rank => rank.name + '.'.repeat(11 - (rank.name + rank.elo).length) + rank.elo)
				sendMessage(heading + '```' + rankings.join('\n') + '```')
			} catch (err) {
				console.log(err.stack)
				sendMessage('Failed to get rankings\n```' + JSON.stringify(err) + '```')
			}
		}
	},
	'game': {
		description: 'Resolve the outcome of a game',
		usage: '!game <winner> <loser>',
		handler: (sendMessage, args) => {

			if (!Array.isArray(args) || args.length !== 2) {
				return sendMessage('Incorrect number of arguments')
			}

			api.resolveGame({
				winner: args[0],
				loser: args[1],
			})
			.then(res => {
				delete res.message
				const lines = [
					'Game was resolved',
					`Winner: :trophy:${res.winner.name} ${res.winner.elo} (+${res.deltaElo})`,
					`Loser: :poop:${res.loser.name} ${res.loser.elo} (-${res.deltaElo})`,
					`Probability: ${(res.probability * 100).toFixed(1)}%`
				]
				sendMessage(lines.join('\n'))
			})
			.catch(err => {
				sendMessage('Failed to resolve game\n```' + JSON.stringify(err) + '```')
				console.error(err.stack || err.message || err)
			})
		}
	},
	'whoops': {
		description: 'Rolls back the results from the last game and removes it from history',
		usage: '!whoops',
		handler: async (sendMessage, args) => {
			try {
				const undone = await api.undoLastGame()				
				sendMessage('Game was rolled back\n```' + JSON.stringify(undone) + '```')
			} catch (err) {
				sendMessage('Failed to revert game\n```' + JSON.stringify(err) + '```')
			}
		},
	},
	'stats': {
		description: 'Rolls back the results from the last game and removes it from history',
		usage: '!stats',
		handler: async (sendMessage, args) => {
			if (args.length === 0) {
				try {
					const stats = await api.stats()
					const buWinners = stats.biggestUpset.winners.map(winner => `${winner.name} (${winner.elo})`)
					const buLosers = stats.biggestUpset.losers.map(loser => `${loser.name} (${loser.elo})`)
					const lines = [
						`Games played: ${stats.gamesPlayed}`,
						`Biggest upset: ${buWinners.join(',')} won against ${buLosers.join(',')} on ${stats.biggestUpset.time.toJSON().slice(0,10)} (probability: ${(stats.biggestUpset.probability * 100).toFixed(1)}%)`,
					]
					sendMessage(lines.join('\n'))
				} catch(err) {
					sendMessage('Failed to retreive stats')
				}
			}
		}
	}
}

module.exports = function(apiToken) {
	const rtm = new RtmClient(apiToken, {
		logLevel: 'error',
		dataStore: new MemoryDataStore(),
	})

	rtm.start()
	rtm.on(RTM_EVENTS.MESSAGE, function(message) {
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

			const channel = rtm.dataStore.getChannelByName(config.slackChannel).id
			return command.handler(text => rtm.sendMessage(text, channel), commandArgs.slice(1))
		}
	})

	rtm.on(RTM_CLIENT_EVENTS.AUTHENTICATED, function (rtmStartData) {
		console.log('Slack authenticated')
	})

	let welcome = true
	rtm.on(RTM_CLIENT_EVENTS.RTM_CONNECTION_OPENED, function () {
		console.log('Slack connected')
		const channel = rtm.dataStore.getChannelByName(config.slackChannel).id
		if (welcome) {
			rtm.sendMessage('Elo Rankings v' + package.version + ' online', channel)
			welcome = false
		}
	})

	console.log('Connecting slackbot...')
}
