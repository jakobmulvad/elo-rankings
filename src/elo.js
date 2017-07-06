const EloRank = require('elo-rank')
const elo = new EloRank()

module.exports = (winnerElo, loserElo, kFactor) => {
	const expected = elo.getExpected(winnerElo, loserElo)
	return (kFactor || 32) * (1-expected)
}
