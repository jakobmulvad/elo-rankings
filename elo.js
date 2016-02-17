const eloRank = require('elo-rank')()

module.exports = (winnerElo, loserElo, kFactor) => {
	const expected = eloRank.getExpected(winnerElo, loserElo)
	return Math.round((kFactor || 32) * (1-expected))
}