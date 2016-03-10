const RtmClient = require('@slack/client').RtmClient
const CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS
const RTM_EVENTS = require('@slack/client').RTM_EVENTS
const api = require('./api')

const bot = 'U0R76NUHZ'
const channel = 'C0R7DAP5L'

module.exports = {
	init: function() {
		const rtm = new RtmClient(process.env.SLACK_API_TOKEN, {logLevel: 'info'})
		rtm.start()

		rtm.on(RTM_EVENTS.MESSAGE, function (message) {
			console.log('MESSAGE FROM SLACK:', message)

			if (message.text.startsWith('<@' + bot + '>:')) {
				const command = message.text.slice(13).trim().toLowerCase()
				console.log('command=' + command)
				switch (command) {
					case 'rank':
					api.getRankings()
					.then(rankings => {
						rankings = rankings.map(rank => '' + rank.name + ': ' + rank.elo + '\n')
						rtm.sendMessage(rankings.join(''), channel)
						/*rtm.send({
							text: rankings.join(),
							channel: channel,
							type: RTM_API_EVENTS.MESSAGE,
							//mrkdwn: true
						})*/
					})
					break
				}
			}
		})

		rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, function (rtmStartData) {
			console.log('Slack integration online')
		})

		// you need to wait for the client to fully connect before you can send messages
		rtm.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, function () {
			// This will send the message 'this is a test message' to the channel identified by id 'C0CHZA86Q'
			rtm.sendMessage('All systems online!', channel)
		})
	},
}