const fs = require('fs')
const path = require('path')
const config = {
	mongoUrl: process.env.MONGO_URI,
	slackApiToken: process.env.SLACK_API_TOKEN,
	slackChannel: '#foosball',
};

// Overwrite configuration from local file if this exists
if (fs.existsSync(path.join(__dirname, '../config.json'))) {
	Object.assign(config, require('../config'))
}

module.exports = config
