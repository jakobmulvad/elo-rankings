const eloRank = require('elo-rank')()

module.exports = (winnerElo, loserElo, kFactor) => {
	const expected = eloRank.getExpected(winnerElo, loserElo)
	return (kFactor || 32) * (1-expected)
}