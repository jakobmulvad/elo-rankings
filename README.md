# foosball-rankings

A simple webservice to keep track of the ELO rating of the foosball players at work.

### `GET: /`

Returns the entire list of players sorted by ELO rating

### `POST: /players`

Creates a new player starting at ELO 1000

### `POST: /game`

Calculates and updates the ELO rating of the winner and loser of a game

### `POST: /game/2v2`

Calculates and updates the ELO rating of the winners and losers of a 2v2 game
