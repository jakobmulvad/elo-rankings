const { RTMClient, WebClient } = require('@slack/client')
const api = require('./api')
const package = require('../package')
const config = require('./config')
const ONE_MONTH = 1000 * 60 * 60 * 24 * 30

function formatDate(date) {
	return `${date.toJSON().slice(0,10)} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`
}


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
	'h2h': {
		description: 'Gets head to head state',
		usage: '!h2h <name> <name>',
		handler: async (sendMessage, args) => {
			if (!Array.isArray(args) || args.length !== 2) {
				return sendMessage('Missing player name(s)')
			}
			const player1 = args[0];
			const player2 = args[1];
			if (player1 === player2) {
				return sendMessage('Don\'t be cheeky')
			}
			const h2hstats = await api.h2h({player1, player2});
			if (h2hstats.totalGames === 0) {
				return sendMessage(`No games were played between ${player1} and ${player2}?`);
			}
			const { totalGames, p1EloGain, p1WinCount } = h2hstats;
			const winner = p1WinCount >= 0 ? player1 : player2;
			const message = 'total: ' + totalGames + ', ' + player1 + ': ' + p1WinCount
                            + ', ' + player2 + ': ' + (totalGames - p1WinCount)
                            + ' --- ' + winner + ' gained ' + Math.abs(p1EloGain) + ' elo';
			sendMessage(message)
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
				await api.newPlayer({name: args[0]})
				sendMessage('Player created\n```' + JSON.stringify(args[0]) + '```');
			} catch (err) {
				sendMessage('Failed to create player\n```' + err.message + '```')
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

				const heading = 'The rankings as of ' + formatDate(new Date()) + ':\n'
				rankings = rankings.map(rank => {
					const nameEloLength = (rank.name + rank.elo).length
					return rank.name + '.'.repeat(Math.max(1, 11 - nameEloLength)) + rank.elo
				})
				sendMessage(heading + '```' + rankings.join('\n') + '```')
			} catch (err) {
				sendMessage('Failed to get rankings\n```' + err.message + '```')
				console.error(err.stack || err.message || err)
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
				sendMessage('Failed to resolve game\n```' + err.message + '```')
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
				sendMessage('Failed to revert game\n```' + err.message + '```')
				console.error(err.stack || err.message || err)
			}
		},
	},
	'stats': {
		description: 'Displays various stats',
		usage: '!stats',
		handler: async (sendMessage, args) => {
			if (args.length === 0) {
				try {
					const stats = await api.stats()
					const { gamesPlayed, highestElo, lowestElo, biggestUpset } = stats

					const buWinners = biggestUpset.winners.map(winner => `${winner.name} (${winner.elo})`)
					const buLosers = biggestUpset.losers.map(loser => `${loser.name} (${loser.elo})`)
					const lines = [
						`Games played: ${gamesPlayed}`,
						`Highest ELO achieved: :trophy:${highestElo.name} peaked at ${highestElo.elo} on ${formatDate(highestElo.time)}`,
						`Lowest ELO achieved: :poop:${lowestElo.name} hit rock bottom at ${lowestElo.elo} on ${formatDate(lowestElo.time)}`,
						`Biggest upset: ${buWinners.join(',')} won against ${buLosers.join(',')} on ${formatDate(biggestUpset.time)} (probability: ${(stats.biggestUpset.probability * 100).toFixed(1)}%)`,
					]
					sendMessage(lines.join('\n'))
				} catch(err) {
					sendMessage('Failed to retreive stats\n```' + err.message + '```')
					console.error(err.stack || err.message || err)
				}
			}
		}
	}
}

module.exports = async function(apiToken) {
	const web = new WebClient(apiToken)
	const res = await web.conversations.list()
	const channels = res.channels
	const botChannel = channels.find(c => c.name === config.slackChannel)
	if (!botChannel) {
		throw new Error('Cannot find slack channel')
	}

	const rtm = new RTMClient(apiToken)
	rtm.on('message', function(message) {
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
			return command.handler(text => rtm.sendMessage(text, botChannel.id), commandArgs.slice(1))
		}
	})

	let welcome = true
	rtm.on('connected', function () {
		console.log('Slack connected')
		if (welcome) {
			rtm.sendMessage('Elo Rankings v' + package.version + ' online', botChannel.id)
			welcome = false
		}
	})
	rtm.start()


	console.log('Connecting slackbot...')
}
