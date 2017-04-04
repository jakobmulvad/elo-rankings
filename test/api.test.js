const api = require('../src/api')
const getDb = require('../src/get-db')
const getPlayers = getDb.then(db => db.collection('players'))
const getHistory = getDb.then(db => db.collection('history'))

describe('api.js', function() {
	beforeEach(function() {
		return Promise.all([
			getPlayers.then(players => players.deleteMany()),
			getHistory.then(history => history.deleteMany()),
		])
	})

	describe('Calling newPlayer()', function() {
		describe('with a name and a starting elo rating', function() {
			beforeEach(function() {
				return api.newPlayer({
					name: 'alice',
					elo: 1234,
				})
			})

			it('should create a new document in the players collection with the correct name and elo', function(done) {
				getPlayers.then(players => players.find().toArray())
				.then(players => {
					expect(players).to.have.length(1)
					expect(players[0]).to.have.property('name', 'alice')
					expect(players[0]).to.have.property('elo', 1234)
				})
				.then(done,done)
			})
		})

		describe('with only a name', function() {
			beforeEach(function() {
				return api.newPlayer({
					name: 'alice',
				})
			})

			it('should create a new document in the players collection with the correct name and a default elo', function(done) {
				getPlayers.then(players => players.find().toArray())
				.then(players => {
					expect(players).to.have.length(1)
					expect(players[0]).to.have.property('name', 'alice')
					expect(players[0]).to.have.property('elo')
				})
				.then(done,done)
			})
		})
	});

	describe('Calling getRankings()', function() {
		beforeEach(function() {
			return getPlayers.then(players => {
				return players.insertMany([
					{ name: 'alice', elo: 1000 },
					{ name: 'bob', elo: 900 },
					{ name: 'charlie', elo: 1100 },
				])
			})
			.then(() => api.getRankings())
			.then(rankings => this.rankings = rankings)
		})

		it('should return a list that includes all players', function() {
			expect(this.rankings).to.have.length(3)
		})

		it('should return a list of player names and their ratings, sorted by rating', function() {
			expect(this.rankings[0]).to.have.property('name', 'charlie')
			expect(this.rankings[0]).to.have.property('elo', 1100)

			expect(this.rankings[1]).to.have.property('name', 'alice')
			expect(this.rankings[1]).to.have.property('elo', 1000)

			expect(this.rankings[2]).to.have.property('name', 'bob')
			expect(this.rankings[2]).to.have.property('elo', 900)
		})
	})

	describe('Calling resolveGame()', function() {
		beforeEach(function() {
			return getPlayers.then(players => {
				return players.insertMany([
					{ name: 'alice', elo: 1000 },
					{ name: 'bob', elo: 900 },
					{ name: 'charlie', elo: 1100 },
				])
			})
			.then(() => api.resolveGame({ winner: 'alice', loser: 'bob' }))
		})

		it('should update the winner with higher elo', function() {
			return getPlayers
			.then(players => players.findOne({ name: 'alice'}))
			.then(alice => {
				expect(alice)
				.to.have.property('elo')
				.to.be.above(1000)
			})
		})

		it('should update the winner with a win', function() {
			return getPlayers
			.then(players => players.findOne({ name: 'alice'}))
			.then(alice => {
				expect(alice)
				.to.have.property('wins')
				.to.equal(1)
			})
		})

		it('should update the winner with an activity timestamp', function() {
			return getPlayers
			.then(players => players.findOne({ name: 'alice'}))
			.then(alice => {
				expect(alice)
				.to.have.property('lastActivity')
				expect(Date.now() - alice.lastActivity.getTime())
				.to.be.below(100)
			})
		})

		it('should update the loser with lower elo', function() {
			return getPlayers
			.then(players => players.findOne({ name: 'bob'}))
			.then(bob => {
				expect(bob)
				.to.have.property('elo')
				.to.be.below(900)
			})
		})

		it('should update the loser with a loss', function() {
			return getPlayers
			.then(players => players.findOne({ name: 'bob'}))
			.then(bob => {
				expect(bob)
				.to.have.property('loses')
				.to.equal(1)
			})
		})

		it('should update the history with a new game', function() {
			return getHistory
			.then(historyCollection => historyCollection.find().toArray())
			.then(history => {
				expect(history)
				.to.have.length(1)
				expect(history[0])
				.to.have.property('winners')
				.to.deep.equal(['alice'])
				expect(history[0])
				.to.have.property('losers')
				.to.deep.equal(['bob'])
			})
		})
	})
})
