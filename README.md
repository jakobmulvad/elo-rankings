# foosball-rankings

A simple webservice to keep track of the elo rating of our foosball players at work.

### `GET: /`

Returns the entire list of players sorted by ELO rating

### `POST: /players`

Creates a new player starting at elo 1000

### `POST: /game`

Calculates and updates the elo rating of the winner and loser of a game
