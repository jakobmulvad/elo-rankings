const fs = require('fs')
const path = require('path')
const config = {
	mongoUrl: process.env.MONGO_URI || 'mongodb://localhost:27017/elo-rankings',
	slackApiToken: process.env.SLACK_API_TOKEN,
	slackChannel: process.env.SLACK_CHANNEL || 'elo-rankings',
	slackSigningSecret: process.env.SLACK_SIGNING_SECRET
}

// Overwrite configuration from local file if this exists
if (fs.existsSync(path.join(__dirname, '../config.json'))) {
	Object.assign(config, require('../config'))
}

module.exports = config
