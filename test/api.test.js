const mongodb = require('mongodb')
const api = require('../src/api')
const getDb = require('../src/get-db')
const getPlayers = getDb.then(db => db.collection('players'))
const getHistory = getDb.then(db => db.collection('history'))

describe('api.js', function() {
	beforeEach(async function() {
		await Promise.all([
			getPlayers.then(players => players.deleteMany()),
			getHistory.then(history => history.deleteMany()),
		])
	})

	after(async function() {
		(await getDb).close()
	})

	describe('Calling newPlayer()', function() {
		describe('with a name and a starting elo rating', function() {
			beforeEach(async function() {
				await api.newPlayer({
					name: 'alice',
					elo: 1234,
				})
			})

			it('should create a new document in the players collection with the correct name and elo', async function() {
				const players = await getPlayers
				const playerDocs = await players.find().toArray()

				expect(playerDocs).to.have.length(1)
				expect(playerDocs[0]).to.have.property('name', 'alice')
				expect(playerDocs[0]).to.have.property('elo', 1234)
			})

			it('should fail if you try to create a player with a name that already exists', async function() {
				try {
					await api.newPlayer({ name: 'alice'})
				} catch (e) {
					return
				}
				throw new Error('Second api call did not fail')
			})
		})

		describe('with only a name', function() {
			beforeEach(async function() {
				await api.newPlayer({
					name: 'alice',
				})
			})

			it('should create a new document in the players collection with the correct name and a default elo', async function() {
				const players = await getPlayers
				const playerDocs = await players.find().toArray()

				expect(playerDocs).to.have.length(1)
				expect(playerDocs[0]).to.have.property('name', 'alice')
				expect(playerDocs[0]).to.have.property('elo')
			})
		})
	});

	describe('Calling getRankings()', function() {
		beforeEach(async function() {
			const players = await getPlayers
			await players.insertMany([
				{ name: 'alice', elo: 1000 },
				{ name: 'bob', elo: 900 },
				{ name: 'charlie', elo: 1100 },
			])
			this.rankings = await api.getRankings()
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
		beforeEach(async function() {
			const players = await getPlayers
			await players.insertMany([
				{ name: 'alice', elo: 1000, wins: 5 },
				{ name: 'bob', elo: 900, loses: 3 },
				{ name: 'charlie', elo: 1100 },
			])
			await api.resolveGame({ winner: 'alice', loser: 'bob' })
		})

		it('should update the winner with higher elo', async function() {
			const players = await getPlayers
			const alice = await players.findOne({ name: 'alice'})

			expect(alice)
				.to.have.property('elo')
				.to.be.above(1000)
		})

		it('should update the winner with a win', async function() {
			const players = await getPlayers
			const alice = await players.findOne({ name: 'alice'})

			expect(alice)
				.to.have.property('wins')
				.to.equal(6)
		})

		it('should update the winner with an activity timestamp', async function() {
			const players = await getPlayers
			const alice = await players.findOne({ name: 'alice'})

			expect(alice)
				.to.have.property('lastActivity')
				.to.be.above(new Date(Date.now() - 500))
	  })

		it('should update the loser with lower elo', async function() {
			const players = await getPlayers
			const bob = await players.findOne({ name: 'bob'})

			expect(bob)
				.to.have.property('elo')
				.to.be.below(900)
		})

		it('should update the loser with a loss', async function() {
			const players = await getPlayers
			const bob = await players.findOne({ name: 'bob'})

			expect(bob)
				.to.have.property('loses')
				.to.equal(4)
		})

		it('should update the loser with an activity timestamp', async function() {
			const players = await getPlayers
			const bob = await players.findOne({ name: 'bob'})

			expect(bob)
			  .to.have.property('lastActivity')
			  .to.be.above(new Date(Date.now() - 500))
		})

		it('should update the history with a new game', async function() {
			const history = await getHistory
			const historyDocs = await history.find().toArray()

			expect(historyDocs)
				.to.have.length(1)
			expect(historyDocs[0])
				.to.have.property('winners')
				.to.deep.equal(['alice'])
			expect(historyDocs[0])
				.to.have.property('losers')
				.to.deep.equal(['bob'])
		})
	})

	describe('Calling undoLastGame()', function() {
		beforeEach(async function() {
			const players = await getPlayers
			const history = await getHistory
			await players.insertMany([
				{ name: 'alice', elo: 1000, wins: 5 },
				{ name: 'bob', elo: 900, loses: 3 },
				{ name: 'charlie', elo: 1100 },
			])

			await api.resolveGame({ winner: 'alice', loser: 'bob' })
			this.aliceAfterFirst = await players.findOne({name: 'alice'})
			this.bobAfterFirst = await players.findOne({name: 'bob'})
			this.firstGame = await history.findOne({},{sort: {time: -1}})

			await api.resolveGame({ winner: 'alice', loser: 'bob' })
			this.lastGame = await history.findOne({},{sort: {time: -1}})

			await api.undoLastGame()
		})

		it('should reset the elo of the participants to what it was before the game', async function() {
			const players = await getPlayers
			const alice = await players.findOne({ name: 'alice'})
			const bob = await players.findOne({ name: 'bob'})

			expect(alice)
				.to.have.property('elo')
				.to.be.equal(this.aliceAfterFirst.elo)
			expect(bob)
				.to.have.property('elo')
				.to.be.equal(this.bobAfterFirst.elo)
		})

		it('should reset wins and loses of the participants to what it was before the game', async function() {
			const players = await getPlayers
			const alice = await players.findOne({ name: 'alice'})
			const bob = await players.findOne({ name: 'bob'})

			expect(alice)
				.to.have.property('wins')
				.to.be.equal(6)
			expect(bob)
				.to.have.property('loses')
				.to.be.equal(4)
		})

		it('should remove the last game from history', async function() {
			const history = await getHistory
			const lastGame = await history.findOne({_id: mongodb.ObjectId(this.lastGame._id)})

			expect(lastGame)
				.to.be.null
		})
	})

	describe('Calling stats()', function() {
		beforeEach(async function() {
			const players = await getPlayers
			const history = await getHistory
			await api.newPlayer({name: 'alice'})
			await api.newPlayer({name: 'bob'})
			await api.newPlayer({name: 'charlie'})

			await api.resolveGame({ winner: 'alice', loser: 'bob' })
			await api.resolveGame({ winner: 'alice', loser: 'bob' })
			await api.resolveGame({ winner: 'alice', loser: 'charlie' })
			await api.resolveGame({ winner: 'bob', loser: 'alice' })
			this.stats = await api.stats()
		})

		it('should return the total number of games playes', async function() {
			expect(this.stats)
				.to.have.property('gamesPlayed')
				.to.equal(4)
		})

		it('should return the biggest upset with the correct winner', async function() {
			expect(this.stats)
				.to.have.property('biggestUpset')
				.to.have.property('winners')
				.to.have.property('0')
				.to.have.property('name')
				.to.equal('bob')
		})

		it('should return the biggest upset with the correct loser', async function() {
			expect(this.stats)
				.to.have.property('biggestUpset')
				.to.have.property('losers')
				.to.have.property('0')
				.to.have.property('name')
				.to.equal('alice')
		})

		it('should return the highest ever elo', async function() {
			expect(this.stats)
				.to.have.property('highestElo')
				.to.have.property('name')
				.to.equal('alice')
		})

		it('should return the lowest ever elo', async function() {
			expect(this.stats)
				.to.have.property('lowestElo')
				.to.have.property('name')
				.to.equal('bob')
		})
	})
})
