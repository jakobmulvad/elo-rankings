const api = require('../src/api')
const getDb = require('../src/get-db')

describe('api.js', function() {
	describe('Calling getRankings()', function() {
		beforeEach(function() {
			return getDb.then(db => db.dropDatabase())
			.then(() => api.newPlayer({
				name: 'alice',
				elo: 1000
			}))
			.then(() => api.newPlayer({
				name: 'bob',
				elo: 900
			}))
			.then(() => api.newPlayer({
				name: 'charlie',
				elo: 1100
			}))
			.then(() => api.getRankings())
			.then(rankings => this.rankings = rankings);
		})

		it('should return a list of players and their ratings, sorted by rating', function() {
			expect(this.rankings).to.have.length(3)
			expect(this.rankings[0]).to.deep.equal({
				name: 'charlie',
				elo: 1100,
			})
			expect(this.rankings[1]).to.deep.equal({
				name: 'alice',
				elo: 1000,
			})
			expect(this.rankings[2]).to.deep.equal({
				name: 'bob',
				elo: 900,
			})
		})
	})
})
