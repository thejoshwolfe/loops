# Loops

yet another rotate-tiles-to-connect-loops game.

Inspired by:

 * [Loops of Zen](https://www.kongregate.com/games/ahnt/loops-of-zen) (flash)
 * [Curvy in HTML5](http://www.flaminglunchbox.net/curvy)

## Live Demo

https://wolfesoftware.com/loops/

## Version History

#### 1.3.0:
 * The final level gives a hint that you didn't
   obviously waste clicks.

#### 1.2.0:
 * The game state now saves and loads on page refresh,
   not just the level number (using `localStorage`).

#### 1.1.0:
 * The end game now stays on cement-mode, single-color (2 state), hexagonal, toroidal, rough island,
   instead of looping through a tour of all the settings.

#### 1.0.2:
 * Fix background of main game when the browser is in dark mode.
   The game always has a light-mode theme for now.

#### 1.0.0:
 * Use version numbers

#### before 1.0.0
 * Square tiling
 * Hex tiling
 * One color (2 possible states per edge)
 * Two color without overlap (3 states)
 * Two color with overlap (4 states)
 * Cement mode (tiles lock after you touch them)
 * Rough edges (the edge can be locked tiles instead of always blank)
 * Toroidal topoly (loops left/right and up/down)
 * Island of locked tiles in the middle of toroidal levels
 * "Smell the roses" after completing a level before the transition to the next level

## Development

Dependencies:

* npm (for development and building) (or any other way to run the TypeScript compiler)
* python3 (for http server on localhost) (or anything else that does this)
* s3cmd (for deployment to S3)

In NixOS:

* `nix-shell --pure --pure -p nodejs -p python3 -p s3cmd`

To build:

```
./build.sh

# alternatively:
npm install
./node_modules/.bin/tsc
```

To serve on http://localhost:8000/ :

```
(cd public && python3 -m http.server)
```
