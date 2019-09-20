# Loops

yet another rotate-tiles-to-connect-loops game.

Inspired by:

 * [Loops of Zen](https://www.kongregate.com/games/ahnt/loops-of-zen) (flash)
 * [Curvy in HTML5](http://www.flaminglunchbox.net/curvy)

## Live Demo

https://wolfesoftware.com/loops/

## Version History

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

## Build

```
./build.sh
```
