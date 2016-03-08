# foosball-rankings

A simple webservice to keep track of the Elo rating of the foosball players at work. Read more about Elo rating here: https://en.wikipedia.org/wiki/Elo_rating_system

## Run the server

Run the default script with node 4.x

`node .`

## Todo list
- Add a cli tool to update results
- Add a web UI
- Add IOS app

## Web API

### `GET: /`

Returns the entire list of players sorted by ELO rating

### `POST: /players`

Creates a new player starting at Elo 1000

### `POST: /game`

Calculates and updates the Elo rating of the winner and loser of a game

### `POST: /game/nvn`

Calculates and updates the Elo rating of the winners and losers of a N vs N game. The number of winners and losers must be the same for this calucation to work.
