const canvas = document.getElementById("canvas")! as HTMLCanvasElement;
const footer = document.getElementById("footer")!;
const buffer_canvas = document.createElement("canvas");

const pi = Math.PI;

enum GameState {
  Playing,
  FadeOut,
  FadeIn,
}
let game_state = GameState.Playing;

type Coord = {x:number, y:number};
type Vector = {tile:number, direction:number};

class Level {
  tiles_per_row: number;
  tiles_per_column: number;
  // a tile is a bitfield:
  //   8
  // 4   1
  //   2
  tiles: number[];
  constructor(tiles_per_row: number, tiles_per_column: number, tiles?: number[]) {
    this.tiles_per_row = tiles_per_row;
    this.tiles_per_column = tiles_per_column;
    if (tiles) {
      if (tiles_per_row * tiles_per_column !== tiles.length) throw new AssertionFailure();
      this.tiles = tiles;
    } else {
      this.tiles = [];
      for (let i = 0; i < tiles_per_row * tiles_per_column; i++) {
        this.tiles.push(0);
      }
    }
  }

  getTileFromCoord(x: number, y: number): number {
    return y * this.tiles_per_row + x;
  }

  getTileCoords(location: number): Coord {
    const x = location % this.tiles_per_row;
    const y = (location - x) / this.tiles_per_row;
    return {x, y};
  }

  allLocations(): number[] {
    let result: number[] = [];
    for (let i = 0; i < this.tiles.length; i++) {
      result.push(i);
    }
    return result;
  }
  clickableLocations(): number[] {
    let result: number[] = [];
    for (let y = 0; y < level.tiles_per_column - 1; y++) {
      for (let x = 0; x < level.tiles_per_row - 1; x++) {
        result.push(this.getTileFromCoord(x, y));
      }
    }
    return result;
  }

  allEdges(): Vector[] {
    // possible optimization: we don't actually care about *all* of the edges.
    let result: Vector[] = [];
    for (let y = 0; y < this.tiles_per_column - 1; y++) {
      for (let x = 0; x < this.tiles_per_row - 1; x++) {
        result.push({tile:this.getTileFromCoord(x, y), direction:1});
        result.push({tile:this.getTileFromCoord(x, y), direction:2});
      }
    }
    return result;
  }

  countUnsolved(): number {
    // possible optimization: cache this result
    let result = 0;
    for (let {tile, direction} of this.allEdges()) {
      const a = this.getEdgeValue(tile, direction);
      const b = this.getEdgeValue(this.getTileFromDirection(tile, direction), this.reverseDirection(direction));
      if (a !== b) result += 1;
    }
    return result;
  }

  getTileFromDirection(tile: number, direction: number): number {
    switch (direction) {
      case 1:
        // right
        return tile + 1;
      case 2:
        // down
        return tile + this.tiles_per_row;
      case 4:
        // left
        return tile - 1;
      case 8:
        // up
        return tile - this.tiles_per_row;
    }
    throw new AssertionFailure();
  }

  getEdgeValue(tile: number, direction: number): number {
    return +!!(this.tiles[tile] & direction);
  }

  reverseDirection(direction: number): number {
    return 0xf & (
      (direction << 2) |
      (direction >> 2)
    );
  }

  rotateTile(tile: number): boolean {
    const {x, y} = this.getTileCoords(tile);
    if (x <= 0 || x >= this.tiles_per_row - 1 ||
        y <= 0 || y >= this.tiles_per_column - 1) {
      // out of bounds
      return false;
    }
    let tile_value = this.tiles[tile];
    tile_value = 0xf & ((tile_value << 1) | (tile_value >> 3));
    this.tiles[tile] = tile_value;
    return true;
  }
}

let level_number = 0;
// this is set by loadLevel()
let level = new Level(1, 1);
function loadLevel(new_level: Level) {
  level = new_level;
  handleResize();
}

window.addEventListener("resize", function() {
  handleResize();
});
canvas.addEventListener("mousedown", function(event: MouseEvent) {
  if (event.altKey || event.ctrlKey || event.shiftKey) return;
  event.preventDefault();
  if (game_state !== GameState.Playing) return;
  const tile_x = Math.floor((event.x - origin_x) / scale);
  const tile_y = Math.floor((event.y - origin_y) / scale);
  const tile = level.getTileFromCoord(tile_x, tile_y);
  rotateTile(tile);
});

// these are calculated below
let scale = 100;
// the origin is the upper-left corner of the upper-left-corner border tile.
let origin_x = -50;
let origin_y = -50;
function handleResize() {
  canvas.width = document.documentElement.clientWidth;
  canvas.height = document.documentElement.clientHeight - footer.clientHeight;
  buffer_canvas.width = canvas.width;
  buffer_canvas.height = canvas.height;

  // cut off half of the border tiles
  const display_tiles_per_column = level.tiles_per_column - 1;
  const display_tiles_per_row = level.tiles_per_row - 1;

  const tile_aspect_ratio = display_tiles_per_column / display_tiles_per_row;
  const canvas_aspect_ratio = canvas.height / canvas.width;
  scale =
    tile_aspect_ratio < canvas_aspect_ratio ?
    canvas.width / display_tiles_per_row :
    canvas.height / display_tiles_per_column;

  origin_x = canvas.width / 2 - scale * level.tiles_per_row / 2;
  origin_y = canvas.height / 2 - scale * level.tiles_per_column / 2;

  renderEverything();
}

function renderEverything() {
  const use_buffer = game_state !== GameState.Playing;
  const context = (use_buffer ? buffer_canvas : canvas).getContext("2d")!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  // grid lines
  const unsolved_count = level.countUnsolved();
  if (level_number >= 4 && unsolved_count > 4) {
    const color = Math.max(0xdd, 0xff - unsolved_count + 4).toString(16);
    context.strokeStyle = "#" + color + color + color;
    context.lineWidth = 3;
    context.lineCap = "round";
    context.beginPath();
    for (let x = 2; x < level.tiles_per_row - 1; x++) {
      context.moveTo(origin_x + x * scale, origin_y + 1 * scale);
      context.lineTo(origin_x + x * scale, origin_y + (level.tiles_per_column - 1) * scale);
    }
    for (let y = 2; y < level.tiles_per_column - 1; y++) {
      context.moveTo(origin_x + 1 * scale, origin_y + y * scale);
      context.lineTo(origin_x + (level.tiles_per_row - 1) * scale, origin_y + y * scale);
    }
    context.stroke();
  }

  context.strokeStyle = "#000";
  context.lineWidth = scale * 0.1;
  context.lineCap = "round";
  for (let location of level.allLocations()) {
    const {x, y} = level.getTileCoords(location);
    const tile_value = level.tiles[location];
    context.save();
    try {
      renderTile(tile_value, x, y);
    } finally {
      context.restore();
    }
  }

  // render the game into the real canvas with the alpha blend
  if (use_buffer) {
    const real_context = canvas.getContext("2d")!;
    real_context.fillStyle = "#fff";
    real_context.fillRect(0, 0, canvas.width, canvas.height);
    real_context.save();
    real_context.globalAlpha = global_alpha;
    real_context.drawImage(buffer_canvas, 0, 0);
    real_context.restore();
  }

  function renderTile(tile: number, x: number, y: number) {
    context.translate(origin_x + scale*(x + 0.5), origin_y + scale*(y + 0.5));
    // normalize rotation
    switch (tile) {
      case 0: return;
      case 1: break;
      case 2: tile = 1; context.rotate(pi/2); break;
      case 3: break;
      case 4: tile = 1; context.rotate(pi); break;
      case 5: break;
      case 6: tile = 3; context.rotate(pi/2); break;
      case 7: break;
      case 8: tile = 1; context.rotate(pi*1.5); break;
      case 9: tile = 3; context.rotate(pi*1.5); break;
      case 10: tile = 5; context.rotate(pi/2); break;
      case 11: tile = 7; context.rotate(pi*1.5); break;
      case 12: tile = 3; context.rotate(pi); break;
      case 13: tile = 7; context.rotate(pi); break;
      case 14: tile = 7; context.rotate(pi/2); break;
      case 15: break;
      default: throw new AssertionFailure();
    }

    switch (tile) {
      case 1:
        context.beginPath();
        context.arc(0, 0, scale*0.25, 0, 2*pi);
        context.lineTo(scale * 0.5, 0);
        context.stroke();
        break;
      case 3:
        context.beginPath();
        context.arc(scale * 0.5, scale * 0.5, scale * 0.5, pi, pi*1.5);
        context.stroke();
        break;
      case 5:
        context.beginPath();
        context.moveTo(scale * 0.5, 0);
        context.lineTo(scale * -0.5, 0);
        context.stroke();
        break;
      case 7:
        context.beginPath();
        context.arc(scale * -0.5, scale * 0.5, scale * 0.5, pi*1.5, 2*pi);
        context.stroke();
        context.beginPath();
        context.arc(scale * 0.5, scale * 0.5, scale * 0.5, pi, pi*1.5);
        context.stroke();
        break;
      case 15:
        context.beginPath();
        context.arc(scale * 0.5, scale * 0.5, scale * 0.5, pi, pi*1.5);
        context.stroke();
        context.beginPath();
        context.arc(scale * 0.5, scale * -0.5, scale * 0.5, pi/2, pi);
        context.stroke();
        context.beginPath();
        context.arc(scale * -0.5, scale * -0.5, scale * 0.5, 0, pi/2);
        context.stroke();
        context.beginPath();
        context.arc(scale * -0.5, scale * 0.5, scale * 0.5, pi*1.5, 2*pi);
        context.stroke();
        break;
      default:
        throw new AssertionFailure();
    }
  }
}

function rotateTile(tile: number) {
  if (!level.rotateTile(tile)) return;

  renderEverything();

  checkForDone();
}

function checkForDone() {
  const unsolved_count = level.countUnsolved();
  if (unsolved_count === 0) {
    // everything is done
    beginLevelTransition();
  }
}
let global_alpha = 1.0;
function beginLevelTransition() {
  game_state = GameState.FadeOut;
  const start_time = new Date().getTime();
  animate();

  function animate() {
    const progress = (new Date().getTime() - start_time) / 1000;
    if (progress < 1) {
      global_alpha = 1 - progress;
    } else if (progress < 2) {
      if (game_state === GameState.FadeOut) {
        loadNewLevel();
        game_state = GameState.FadeIn;
      }
      global_alpha = progress - 1;
    } else {
      // done
      game_state = GameState.Playing;
      global_alpha = 1.0;
    }
    renderEverything();
    if (game_state !== GameState.Playing) {
      requestAnimationFrame(animate);
    }
  }
}
function loadNewLevel() {
  level_number += 1;
  loadLevel(getLevelNumber(level_number));
}
function getLevelNumber(level_number: number) {
  switch (level_number) {
    case 1:
      return new Level(4, 4, [
        0, 0, 0, 0,
        0, 6, 1, 0,
        0, 6, 2, 0,
        0, 0, 0, 0,
      ]);
    case 2:
      return new Level(5, 4, [
        0, 0, 0, 0, 0,
        0, 6,14,12, 0,
        0, 3, 9, 4, 0,
        0, 0, 0, 0, 0,
      ]);
    case 3:
      return new Level(5, 5, [
        0, 0, 0, 0, 0,
        0, 2, 3, 4, 0,
        0, 2, 1, 5, 0,
        0,12, 1, 4, 0,
        0, 0, 0, 0, 0,
      ]);
    default:
      return generateLevel(level_number + 3, level_number + 3);
  }
}

function generateLevel(tiles_per_row: number, tiles_per_column: number): Level {
  const level = new Level(tiles_per_row, tiles_per_column);

  // generate a solved puzzle
  for (var y = 1; y < tiles_per_column - 1; y++) {
    for (var x = 1; x < tiles_per_row - 1; x++) {
      if (x < tiles_per_row - 2 && Math.random() < 0.5) {
        // connect right
        level.tiles[level.getTileFromCoord(x, y)] |= 1;
        level.tiles[level.getTileFromCoord(x + 1, y)] |= 4;
      }
      if (y < tiles_per_column - 2 && Math.random() < 0.5) {
        // connect down
        level.tiles[level.getTileFromCoord(x, y)] |= 2;
        level.tiles[level.getTileFromCoord(x, y + 1)] |= 8;
      }
    }
  }

  // make sure nothing is too easy
  for (var y = 1; y < tiles_per_column - 1; y++) {
    for (var x = 1; x < tiles_per_row - 1; x++) {
      if (Math.random() < 0.5) {
        checkRight();
        checkDown();
      } else {
        checkDown();
        checkRight();
      }
    }
  }
  function checkRight() {
    if (x < tiles_per_row - 2 && (
        level.tiles[y * tiles_per_row + x] === 0 ||
        level.tiles[y * tiles_per_row + x + 1] === 0)) {
      // connect right
      level.tiles[y * tiles_per_row + x] |= 1;
      level.tiles[y * tiles_per_row + x + 1] |= 4;
    }
  }
  function checkDown() {
    if (y < tiles_per_column - 2 && (
        level.tiles[y * tiles_per_row + x] === 0 ||
        level.tiles[(y + 1) * tiles_per_row + x] === 0)) {
      // connect down
      level.tiles[y * tiles_per_row + x] |= 2;
      level.tiles[(y + 1) * tiles_per_row + x] |= 8;
    }
  }

  // rotate the tiles randomly
  for (let y = 1; y < tiles_per_column - 1; y++) {
    for (let x = 1; x < tiles_per_row - 1; x++) {
      const rotations = Math.floor(Math.random() * 4);
      if (rotations === 0) continue;
      const index = y * tiles_per_row + x;
      let tile_value = level.tiles[index];
      tile_value = 0xf & ((tile_value << rotations) | (tile_value >> (4 - rotations)));
      level.tiles[index] = tile_value;
    }
  }
  return level;
}

class AssertionFailure {}

loadNewLevel();
