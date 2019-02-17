let level_number = 1;

const canvas = document.getElementById("canvas")! as HTMLCanvasElement;
const buffer_canvas = document.createElement("canvas");
const sidebar_tray = document.getElementById("sidebar")!;
const sidebar_button = document.getElementById("hamburger")!;
const retry_button = document.getElementById("retryButton")!;
const reset_button = document.getElementById("resetButton")!;

const pi = Math.PI;
const sqrt3 = Math.sqrt(3);

enum GameState {
  Playing,
  FadeOut,
  FadeIn,
}
let game_state = GameState.Playing;

enum ColorRules {
  Single,
  TwoSeparate,
  TwoOverlap,
}

enum EndpointStyle {
  LargeRing,
  SmallRing,
  LargeDot,
}

type Coord = {x:number, y:number};
type Vector = {tile_index:number, direction:number};
type Tile = {colors:number[]};

abstract class Level {
  force_grid_visible: boolean;
  tiles_per_row: number;
  tiles_per_column: number;
  cement_states: {[tile_index:number]: number} | null;
  color_count: number;
  allow_overlap: boolean;
  tiles: Tile[];

  constructor(force_grid_visible: boolean, tiles_per_row: number, tiles_per_column: number, cement_mode: boolean, color_rules: ColorRules, tiles?: Tile[]) {
    this.force_grid_visible = force_grid_visible;
    this.tiles_per_row = tiles_per_row;
    this.tiles_per_column = tiles_per_column;
    this.cement_states = cement_mode ? {} : null;

    switch (color_rules) {
      case ColorRules.Single:
        this.color_count = 1;
        this.allow_overlap = false; // doesn't matter
        break;
      case ColorRules.TwoSeparate:
        this.color_count = 2;
        this.allow_overlap = false;
        break;
      case ColorRules.TwoOverlap:
        this.color_count = 2;
        this.allow_overlap = true;
        break;
      default: throw new AssertionFailure();
    }

    if (tiles) {
      this.tiles = tiles;
    } else {
      this.tiles = [];
      for (let i = 0; i < tiles_per_row * tiles_per_column; i++) {
        let colors = [];
        for (let color_index = 0; color_index < this.color_count; color_index++) {
          colors.push(0);
        }
        this.tiles.push({colors});
      }
    }

    assert(tiles_per_row * tiles_per_column === this.tiles.length);
    for (let tile of this.tiles) {
      assert(tile.colors.length === this.color_count);
    }
  }

  abstract getScaleX(): number;
  abstract getScaleY(): number;
  abstract getTileAnimationTime(): number;

  abstract getTileIndexFromDisplayPoint(display_x: number, display_y: number): number;
  abstract getTileIndexFromCoord(x: number, y: number): number;
  abstract getTileCoordFromIndex(location: number): Coord;
  abstract allTileIndexes(): number[];
  abstract allEdges(): Vector[];
  abstract getTileIndexFromVector(tile_index: number, direction: number): number;
  abstract reverseDirection(direction: number): number;
  abstract rotateTile(tile_index: number): void;
  abstract rotateRandomly(tile_index: number): void;
  abstract renderGridLines(context: CanvasRenderingContext2D): void;
  abstract renderTile(context: CanvasRenderingContext2D, color_value: number, x: number, y: number, animation_progress: number, endpoint_style: EndpointStyle): void;
  abstract renderTileBackground(context: CanvasRenderingContext2D, x: number, y: number): void;

  isInBounds(tile_index: number): boolean {
    const {x, y} = this.getTileCoordFromIndex(tile_index);
    return (
      1 <= x && x < this.tiles_per_row - 1 &&
      1 <= y && y < this.tiles_per_column - 1
    );
  }

  touchCement(tile_index: number): boolean {
    if (this.cement_states == null) return true;
    // cement is enabled
    let age = this.cement_states[tile_index];
    if (age === undefined) {
      this.cement_states[tile_index] = 0;
    } else if (age >= 4) {
      // sry bruh
      return false;
    } else if (age === 1) {
      // allow multiple clicks on the same tile without advancing time.
      return true;
    } else {
      // clicking on drying cement resets it, but everything else still drys.
      this.cement_states[tile_index] = 0;
    }
    for (let k in this.cement_states) {
      if (this.cement_states[k] < 4) {
        this.cement_states[k]++;
      }
    }
    return true;
  }

  countUnsolved(): number {
    // possible optimization: cache this result
    let result = 0;
    for (let {tile_index, direction} of this.allEdges()) {
      for (let color_index = 0; color_index < this.color_count; color_index++) {
        const a = this.getEdgeValue(tile_index, color_index, direction);
        const b = this.getEdgeValue(this.getTileIndexFromVector(tile_index, direction), color_index, this.reverseDirection(direction));
        if (a !== b) result += 1;
      }
    }
    return result;
  }
  getEdgeValue(tile_index: number, color_index: number, direction: number): number {
    return +!!(this.tiles[tile_index].colors[color_index] & direction);
  }

  renderLevel(context: CanvasRenderingContext2D) {
    // grid lines
    const unsolved_count = this.force_grid_visible ? 999 : this.countUnsolved();
    if (unsolved_count > 4) {
      const color = Math.max(0xdd, 0xff - unsolved_count + 4).toString(16);
      context.strokeStyle = "#" + color + color + color;
      context.lineWidth = 0.03;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      this.renderGridLines(context);
      context.stroke();
    }

    // cement background
    if (level.cement_states != null) {
      for (let location of this.allTileIndexes()) {
        let age = level.cement_states[location];
        if (age === undefined) continue;
        switch (age) {
          case undefined:
          case 1:
            continue;
          case 2:
          case 3:
            context.fillStyle = "#eee";
            break;
          case 4:
            context.fillStyle = "#ccc";
            break;
          default: throw new AssertionFailure();
        }
        const {x, y} = this.getTileCoordFromIndex(location);
        this.renderTileBackground(context, x, y);
      }
    }

    for (let color_index = 0; color_index < this.color_count; color_index++) {
      // select an appropriate line style and color
      context.lineCap = "round";
      context.lineJoin = "round";
      let endpoint_style: EndpointStyle;
      if (this.color_count === 1) {
        context.strokeStyle = "#000";
        context.lineWidth = level.getScaleX() * 0.1;
        endpoint_style = EndpointStyle.LargeRing;
      } else if (this.color_count === 2 && !this.allow_overlap) {
        switch (color_index) {
          case 0:
            context.strokeStyle = "#99f";
            context.lineWidth = level.getScaleX() * 0.2;
            endpoint_style = EndpointStyle.LargeDot;
            context.fillStyle = context.strokeStyle;
            break;
          case 1:
            context.strokeStyle = "#c06";
            context.lineWidth = level.getScaleX() * 0.075;
            endpoint_style = EndpointStyle.SmallRing;
            break;
          default: throw new AssertionFailure();
        }
      } else if (this.color_count === 2 && this.allow_overlap) {
        switch (color_index) {
          case 0:
            context.strokeStyle = "#e784e1";
            context.lineWidth = level.getScaleX() * 0.4;
            context.lineCap = "butt";
            context.lineJoin = "miter";
            endpoint_style = EndpointStyle.LargeDot;
            context.fillStyle = context.strokeStyle;
            break;
          case 1:
            context.strokeStyle = "#000caa";
            context.lineWidth = level.getScaleX() * 0.075;
            endpoint_style = EndpointStyle.LargeRing;
            break;
          default: throw new AssertionFailure();
        }
      } else {
        throw new AssertionFailure();
      }

      for (let location of this.allTileIndexes()) {
        const {x, y} = this.getTileCoordFromIndex(location);
        const color_value = this.tiles[location].colors[color_index];
        let tile_rotation_animation = tile_rotation_animations[location];
        let animation_progress = tile_rotation_animation ? tile_rotation_animation.rotation : 0;
        this.renderTile(context, color_value, x, y, animation_progress, endpoint_style);
      }
    }
  }
}

class SquareLevel extends Level {
  // tile values are a bit for each edge:
  //   8
  // 4   1
  //   2
  // the length of each edge is 1 unit.

  getScaleX() { return 1; }
  getScaleY() { return 1; }
  getTileAnimationTime() { return 150; }

  getTileIndexFromDisplayPoint(display_x: number, display_y: number): number {
    return this.getTileIndexFromCoord(Math.floor(display_x), Math.floor(display_y));
  }

  getTileIndexFromCoord(x: number, y: number): number {
    return y * this.tiles_per_row + x;
  }

  getTileCoordFromIndex(location: number): Coord {
    const x = location % this.tiles_per_row;
    const y = (location - x) / this.tiles_per_row;
    return {x, y};
  }

  allTileIndexes(): number[] {
    let result: number[] = [];
    for (let i = 0; i < this.tiles.length; i++) {
      result.push(i);
    }
    return result;
  }
  allEdges(): Vector[] {
    // possible optimization: we don't actually care about *all* of the edges.
    let result: Vector[] = [];
    for (let y = 0; y < this.tiles_per_column - 1; y++) {
      for (let x = 0; x < this.tiles_per_row - 1; x++) {
        result.push({tile_index:this.getTileIndexFromCoord(x, y), direction:1});
        result.push({tile_index:this.getTileIndexFromCoord(x, y), direction:2});
      }
    }
    return result;
  }

  getTileIndexFromVector(tile_index: number, direction: number): number {
    switch (direction) {
      case 1:
        // right
        return tile_index + 1;
      case 2:
        // down
        return tile_index + this.tiles_per_row;
      case 4:
        // left
        return tile_index - 1;
      case 8:
        // up
        return tile_index - this.tiles_per_row;
    }
    throw new AssertionFailure();
  }

  reverseDirection(direction: number): number {
    return 0xf & (
      (direction << 2) |
      (direction >> 2)
    );
  }

  rotateTile(tile_index: number) {
    for (let color_index = 0; color_index < this.color_count; color_index++) {
      let color_value = this.tiles[tile_index].colors[color_index];
      color_value = 0xf & ((color_value << 1) | (color_value >> 3));
      this.tiles[tile_index].colors[color_index] = color_value;
    }
  }

  rotateRandomly(tile_index: number) {
    const rotations = Math.floor(Math.random() * 4);
    if (rotations === 0) return;
    for (let color_index = 0; color_index < this.color_count; color_index++) {
      let color_value = this.tiles[tile_index].colors[color_index];
      color_value = 0xf & ((color_value << rotations) | (color_value >> (4 - rotations)));
      this.tiles[tile_index].colors[color_index] = color_value;
    }
  }

  renderGridLines(context: CanvasRenderingContext2D) {
    // straight shots in both directions
    for (let x = 2; x < this.tiles_per_row - 1; x++) {
      context.moveTo(x, 1);
      context.lineTo(x, this.tiles_per_column - 1);
    }
    for (let y = 2; y < this.tiles_per_column - 1; y++) {
      context.moveTo(1, y);
      context.lineTo(this.tiles_per_row - 1, y);
    }
  }

  renderTile(context: CanvasRenderingContext2D, color_value: number, x: number, y: number, animation_progress: number, endpoint_style: EndpointStyle) {
    if (color_value === 0) return;
    context.save();
    try {
      context.translate(x + 0.5, y + 0.5);
      if (animation_progress !== 0) {
        context.rotate(pi/2 * animation_progress);
      }
      // normalize rotation
      switch (color_value) {
        case 1: break;
        case 2: color_value = 1; context.rotate(pi/2); break;
        case 3: break;
        case 4: color_value = 1; context.rotate(pi); break;
        case 5: break;
        case 6: color_value = 3; context.rotate(pi/2); break;
        case 7: break;
        case 8: color_value = 1; context.rotate(pi*1.5); break;
        case 9: color_value = 3; context.rotate(pi*1.5); break;
        case 10: color_value = 5; context.rotate(pi/2); break;
        case 11: color_value = 7; context.rotate(pi*1.5); break;
        case 12: color_value = 3; context.rotate(pi); break;
        case 13: color_value = 7; context.rotate(pi); break;
        case 14: color_value = 7; context.rotate(pi/2); break;
        case 15: break;
        default: throw new AssertionFailure();
      }

      switch (color_value) {
        case 1:
          switch (endpoint_style) {
            case EndpointStyle.LargeRing:
              context.beginPath();
              context.arc(0, 0, 0.25, 0, 2*pi);
              context.lineTo(0.5, 0);
              context.stroke();
              break;
            case EndpointStyle.SmallRing:
              context.beginPath();
              context.arc(0, 0, 0.15, 0, 2*pi);
              context.lineTo(0.5, 0);
              context.stroke();
              break;
            case EndpointStyle.LargeDot:
              context.beginPath();
              context.arc(0, 0, 0.25, 0, 2*pi);
              context.fill();

              context.beginPath();
              context.moveTo(0, 0);
              context.lineTo(0.5, 0);
              context.stroke();
              break;
            default: throw new AssertionFailure();
          }
          break;
        case 3:
          context.beginPath();
          context.arc(0.5, 0.5, 0.5, pi, pi*1.5);
          context.stroke();
          break;
        case 5:
          context.beginPath();
          context.moveTo(0.5, 0);
          context.lineTo(-0.5, 0);
          context.stroke();
          break;
        case 7:
          context.beginPath();
          context.arc(-0.5, 0.5, 0.5, pi*1.5, 2*pi);
          context.stroke();
          context.beginPath();
          context.arc(0.5, 0.5, 0.5, pi, pi*1.5);
          context.stroke();
          break;
        case 15:
          context.beginPath();
          context.arc(0.5, 0.5, 0.5, pi, pi*1.5);
          context.stroke();
          context.beginPath();
          context.arc(0.5, -0.5, 0.5, pi/2, pi);
          context.stroke();
          context.beginPath();
          context.arc(-0.5, -0.5, 0.5, 0, pi/2);
          context.stroke();
          context.beginPath();
          context.arc(-0.5, 0.5, 0.5, pi*1.5, 2*pi);
          context.stroke();
          break;
        default:
          throw new AssertionFailure();
      }
    } finally {
      context.restore();
    }
  }

  renderTileBackground(context: CanvasRenderingContext2D, x: number, y: number) {
    context.fillRect(x, y, 1, 1);
  }
}

class HexagonLevel extends Level {
  // this is a (5,3) sized hex grid:
  //     0  1  2  3  4
  //    __    __    __
  //   /  \__/  \__/  \
  // 0 \__/  \__/  \__/
  //   /  \__/  \__/  \
  // 1 \__/  \__/  \__/
  //   /  \__/  \__/  \
  // 2 \__/  \__/  \__/
  //      \__/  \__/
  //
  // tile values are a bit for each edge:
  //    16
  // 08    32
  // 04    01
  //    02
  // the length of each edge is 1 unit.
  // the height of a hexagon is sqrt3.

  getScaleX() { return 1.5; }
  getScaleY() { return sqrt3; }
  getTileAnimationTime() { return 120; }

  getTileIndexFromDisplayPoint(display_x: number, display_y: number): number {
    // we could do some fancy math to figure out which space it is.
    // ... or ... we could get close and just do some euclidean distance measurements.
    const general_neighborhood_x = Math.floor(display_x / 1.5);
    const general_neighborhood_y = Math.floor(display_y / sqrt3);

    let closest_distance_squared = Infinity;
    let closest_tile: number = NaN;
    for (let x of [general_neighborhood_x - 1, general_neighborhood_x, general_neighborhood_x + 1]) {
      for (let y of [general_neighborhood_y - 1, general_neighborhood_y, general_neighborhood_y + 1]) {
        const center_x = 1.5 * x + 1;
        const center_y = sqrt3 * (y + ((x & 1) ? 1 : 0.5));
        const distance_squared = (display_y - center_y)**2 + (display_x - center_x)**2;
        if (distance_squared < closest_distance_squared) {
          closest_distance_squared = distance_squared;
          closest_tile = this.getTileIndexFromCoord(x, y);
        }
      }
    }
    assert(!isNaN(closest_tile));
    return closest_tile;
  }

  getTileIndexFromCoord(x: number, y: number): number {
    return y * this.tiles_per_row + x;
  }

  getTileCoordFromIndex(location: number): Coord {
    const x = location % this.tiles_per_row;
    const y = (location - x) / this.tiles_per_row;
    return {x, y};
  }

  allTileIndexes(): number[] {
    let result: number[] = [];
    for (let i = 0; i < this.tiles.length; i++) {
      result.push(i);
    }
    return result;
  }
  allEdges(): Vector[] {
    let result: Vector[] = [];
    for (let y = 0; y < this.tiles_per_column - 1; y++) {
      for (let x = 0; x < this.tiles_per_row; x++) {
        let tile_index = this.getTileIndexFromCoord(x, y);
        if (x < this.tiles_per_row - 1) {
          result.push({tile_index, direction:1});
        }
        result.push({tile_index, direction:2});
        if (x > 0) {
          result.push({tile_index, direction:4});
        }
      }
    }
    // for the last row, only even columns have diagonal-downward edges.
    for (let x = 0; x < this.tiles_per_row; x += 2) {
      let tile_index = this.getTileIndexFromCoord(x, this.tiles_per_column - 1);
      if (x < this.tiles_per_row - 1) {
        result.push({tile_index, direction:1});
      }
      if (x > 0) {
        result.push({tile_index, direction:4});
      }
    }
    return result;
  }

  getTileIndexFromVector(tile_index: number, direction: number): number {
    let {x, y} = this.getTileCoordFromIndex(tile_index);
    const is_offset_down = !!(x & 1);
    switch (direction) {
      case 1:
        // down right
        return this.getTileIndexFromCoord(x + 1, is_offset_down ? y + 1 : y);
      case 2:
        // down
        return this.getTileIndexFromCoord(x, y + 1);
      case 4:
        // down left
        return this.getTileIndexFromCoord(x - 1, is_offset_down ? y + 1 : y);
      case 8:
        // up left
        return this.getTileIndexFromCoord(x - 1, is_offset_down ? y : y - 1);
      case 16:
        // up
        return this.getTileIndexFromCoord(x, y - 1);
      case 32:
        // up right
        return this.getTileIndexFromCoord(x + 1, is_offset_down ? y : y - 1);
    }
    throw new AssertionFailure();
  }

  reverseDirection(direction: number): number {
    return 0x3f & (
      (direction << 3) |
      (direction >> 3)
    );
  }

  rotateTile(tile_index: number) {
    for (let color_index = 0; color_index < this.color_count; color_index++) {
      let color_value = this.tiles[tile_index].colors[color_index];
      color_value = 0x3f & ((color_value << 1) | (color_value >> 5));
      this.tiles[tile_index].colors[color_index] = color_value;
    }
  }

  rotateRandomly(tile_index: number) {
    const rotations = Math.floor(Math.random() * 6);
    if (rotations === 0) return;
    for (let color_index = 0; color_index < this.color_count; color_index++) {
      let color_value = this.tiles[tile_index].colors[color_index];
      color_value = 0x3f & ((color_value << rotations) | (color_value >> (6 - rotations)));
      this.tiles[tile_index].colors[color_index] = color_value;
    }
  }

  renderGridLines(context: CanvasRenderingContext2D) {
    // horizontal squiggles
    for (let y = 0; y <= this.tiles_per_column; y++) {
      // the repeating pattern is:
      //   __
      //  /  \__
      //  \  /
      //
      const high_y = sqrt3 * y;
      const mid_y = sqrt3 * (y + 0.5);
      const low_y = sqrt3 * (y + 1);
      for (let x = 0; x <= this.tiles_per_row; x += 2) {
        const left_x = 1.5 * x;
        context.moveTo(left_x + 0.5, low_y);
        context.lineTo(left_x + 0.0, mid_y);
        context.lineTo(left_x + 0.5, high_y);
        context.lineTo(left_x + 1.5, high_y);
        context.lineTo(left_x + 2.0, mid_y);
        context.lineTo(left_x + 1.5, low_y);
        context.moveTo(left_x + 2.0, mid_y);
        context.lineTo(left_x + 3.0, mid_y);
        // TODO: edge cases
      }
    }
  }

  renderTile(context: CanvasRenderingContext2D, color_value: number, x: number, y: number, animation_progress: number, endpoint_style: EndpointStyle) {
    if (color_value === 0) return;
    context.save();
    try {
      if (x & 1) {
        context.translate(1.5 * x + 1, sqrt3 * (y + 1.0));
      } else {
        context.translate(1.5 * x + 1, sqrt3 * (y + 0.5));
      }
      if (animation_progress !== 0) {
        context.rotate(pi/3 * animation_progress);
      }
      switch (color_value) {
        case 1:  break;
        case 2:  color_value = 1; context.rotate(1/3*pi); break;
        case 4:  color_value = 1; context.rotate(2/3*pi); break;
        case 8:  color_value = 1; context.rotate(pi);     break;
        case 16: color_value = 1; context.rotate(4/3*pi); break;
        case 32: color_value = 1; context.rotate(5/3*pi); break;

        case 3:  break;
        case 6:  color_value = 3; context.rotate(1/3*pi); break;
        case 12: color_value = 3; context.rotate(2/3*pi); break;
        case 24: color_value = 3; context.rotate(pi);     break;
        case 48: color_value = 3; context.rotate(4/3*pi); break;
        case 33: color_value = 3; context.rotate(5/3*pi); break;

        case 5:  break;
        case 10: color_value = 5; context.rotate(1/3*pi); break;
        case 20: color_value = 5; context.rotate(2/3*pi); break;
        case 40: color_value = 5; context.rotate(pi);     break;
        case 17: color_value = 5; context.rotate(4/3*pi); break;
        case 34: color_value = 5; context.rotate(5/3*pi); break;

        case 7:  break;
        case 14: color_value = 7; context.rotate(1/3*pi); break;
        case 28: color_value = 7; context.rotate(2/3*pi); break;
        case 56: color_value = 7; context.rotate(pi);     break;
        case 49: color_value = 7; context.rotate(4/3*pi); break;
        case 35: color_value = 7; context.rotate(5/3*pi); break;

        case 9:  break;
        case 18: color_value = 9; context.rotate(1/3*pi); break;
        case 36: color_value = 9; context.rotate(2/3*pi); break;

        case 11: break;
        case 22: color_value = 11; context.rotate(1/3*pi); break;
        case 44: color_value = 11; context.rotate(2/3*pi); break;
        case 25: color_value = 11; context.rotate(pi);     break;
        case 50: color_value = 11; context.rotate(4/3*pi); break;
        case 37: color_value = 11; context.rotate(5/3*pi); break;

        case 13: break;
        case 26: color_value = 13; context.rotate(1/3*pi); break;
        case 52: color_value = 13; context.rotate(2/3*pi); break;
        case 41: color_value = 13; context.rotate(pi);     break;
        case 19: color_value = 13; context.rotate(4/3*pi); break;
        case 38: color_value = 13; context.rotate(5/3*pi); break;

        case 15: break;
        case 30: color_value = 15; context.rotate(1/3*pi); break;
        case 60: color_value = 15; context.rotate(2/3*pi); break;
        case 57: color_value = 15; context.rotate(pi);     break;
        case 51: color_value = 15; context.rotate(4/3*pi); break;
        case 39: color_value = 15; context.rotate(5/3*pi); break;

        case 21: break;
        case 42: color_value = 21; context.rotate(1/3*pi); break;

        case 23: break;
        case 46: color_value = 23; context.rotate(1/3*pi); break;
        case 29: color_value = 23; context.rotate(2/3*pi); break;
        case 58: color_value = 23; context.rotate(pi);     break;
        case 53: color_value = 23; context.rotate(4/3*pi); break;
        case 43: color_value = 23; context.rotate(5/3*pi); break;

        case 27: break;
        case 54: color_value = 27; context.rotate(1/3*pi); break;
        case 45: color_value = 27; context.rotate(2/3*pi); break;

        case 31: break;
        case 62: color_value = 31; context.rotate(1/3*pi); break;
        case 61: color_value = 31; context.rotate(2/3*pi); break;
        case 59: color_value = 31; context.rotate(pi);     break;
        case 55: color_value = 31; context.rotate(4/3*pi); break;
        case 47: color_value = 31; context.rotate(5/3*pi); break;

        case 63: break;

        default: throw new AssertionFailure();
      }
      switch (color_value) {
        case 1:
          context.rotate(pi/6);
          switch (endpoint_style) {
            case EndpointStyle.LargeRing:
              context.beginPath();
              context.arc(0, 0, 0.5, 0, 2*pi);
              context.lineTo(sqrt3 / 2, 0);
              context.stroke();
              break;
            case EndpointStyle.SmallRing:
              context.beginPath();
              context.arc(0, 0, 0.33, 0, 2*pi);
              context.lineTo(sqrt3 / 2, 0);
              context.stroke();
              break;
            case EndpointStyle.LargeDot:
              context.beginPath();
              context.arc(0, 0, 0.5, 0, 2*pi);
              context.fill();

              context.beginPath();
              context.moveTo(0, 0);
              context.lineTo(sqrt3 / 2, 0);
              context.stroke();
              break;
            default: throw new AssertionFailure();
          }
          break;
        case 3:
          context.beginPath();
          context.arc(0.5, sqrt3/2, 0.5, pi, 5/3*pi);
          context.stroke();
          break;
        case 5:
          context.beginPath();
          context.arc(0, sqrt3, 1.5, 4/3*pi, 5/3*pi);
          context.stroke();
          break;
        case 7:
          context.beginPath();
          context.arc(-0.5, sqrt3/2, 0.5, 4/3*pi, 2*pi);
          context.arc(0.5, sqrt3/2, 0.5, pi, 5/3*pi);
          context.stroke();
          break;
        case 9:
          context.beginPath();
          context.moveTo(0.75, sqrt3 / 4);
          context.lineTo(-0.75, -sqrt3 / 4);
          context.stroke();
          break;
        case 11:
          context.beginPath();
          context.arc(-1.5, sqrt3/2, 1.5, 5/3*pi, 2*pi);
          context.arc(0.5, sqrt3/2, 0.5, pi, 5/3*pi);
          context.stroke();
          break;
        case 13:
          context.beginPath();
          context.arc(-1, 0, 0.5, 5/3*pi, 1/3*pi);
          context.arc(0, sqrt3, 1.5, 4/3*pi, 5/3*pi);
          context.stroke();
          break;
        case 15:
          context.beginPath();
          context.arc(-1, 0, 0.5, 5/3*pi, 1/3*pi);
          context.arc(-0.5, sqrt3/2, 0.5, 4/3*pi, 2*pi);
          context.arc(0.5, sqrt3/2, 0.5, pi, 5/3*pi);
          context.stroke();
          break;
        case 21:
          context.beginPath();
          context.arc(1.5, -sqrt3/2, 1.5, 2/3*pi, pi);
          context.arc(-1.5, -sqrt3/2, 1.5, 0, 1/3*pi);
          context.arc(0, sqrt3, 1.5, 4/3*pi, 5/3*pi);
          context.stroke();
          break;
        case 23:
          context.beginPath();
          context.arc(1.5, -sqrt3/2, 1.5, 2/3*pi, pi);
          context.arc(-1.5, -sqrt3/2, 1.5, 0, 1/3*pi);
          context.arc(-0.5, sqrt3/2, 0.5, 4/3*pi, 2*pi);
          context.arc(0.5, sqrt3/2, 0.5, pi, 5/3*pi);
          context.stroke();
          break;
        case 27:
          context.beginPath();
          context.arc(-0.5, -sqrt3/2, 0.5, 0, 2/3*pi);
          context.stroke();
          context.beginPath();
          context.arc(0.5, sqrt3/2, 0.5, pi, 5/3*pi);
          context.stroke();
          break;
        case 31:
          context.beginPath();
          context.arc(-0.5, -sqrt3/2, 0.5, 0, 2/3*pi);
          context.arc(-1, 0, 0.5, 5/3*pi, 7/3*pi);
          context.arc(-0.5, sqrt3/2, 0.5, 4/3*pi, 2*pi);
          context.arc(0.5, sqrt3/2, 0.5, pi, 5/3*pi);
          context.stroke();
          break;
        case 63:
          context.beginPath();
          context.arc(1, 0, 0.5, 2/3*pi, 4/3*pi);
          context.arc(0.5, -sqrt3/2, 0.5, 1/3*pi, pi);
          context.arc(-0.5, -sqrt3/2, 0.5, 0, 2/3*pi);
          context.arc(-1, 0, 0.5, 5/3*pi, 1/3*pi);
          context.arc(-0.5, sqrt3/2, 0.5, 4/3*pi, 2*pi);
          context.arc(0.5, sqrt3/2, 0.5, pi, 5/3*pi);
          context.stroke();
          break;

        default: throw new AssertionFailure();
      }
    } finally {
      context.restore();
    }
  }

  renderTileBackground(context: CanvasRenderingContext2D, x: number, y: number) {
    context.save();
    try {
      if (x & 1) {
        context.translate(1.5 * x + 1, sqrt3 * (y + 1.0));
      } else {
        context.translate(1.5 * x + 1, sqrt3 * (y + 0.5));
      }
      context.beginPath();
      context.moveTo(-0.5, -sqrt3/2);
      context.lineTo(0.5, -sqrt3/2);
      context.lineTo(1, 0);
      context.lineTo(0.5, sqrt3/2);
      context.lineTo(-0.5, sqrt3/2);
      context.lineTo(-1, 0);
      context.lineTo(-0.5, -sqrt3/2);
      context.fill();
    } finally {
      context.restore();
    }
  }
}

let level: Level;
function loadLevel(new_level: Level) {
  level = new_level;
  handleResize();
}

window.addEventListener("resize", function() {
  handleResize();
});

function isSidebarShowing(): boolean {
  return sidebar_button.classList.contains("active");
}
function showSidebar() {
  sidebar_button.classList.add("active");
  sidebar_tray.classList.add("active");
}
function hideSidebar() {
  sidebar_button.classList.remove("active");
  sidebar_tray.classList.remove("active");
}

sidebar_button.addEventListener("mousedown", function(event: MouseEvent) {
  if (event.altKey || event.ctrlKey || event.shiftKey) return;
  if (event.button !== 0) return;
  if (isSidebarShowing()) {
    hideSidebar();
  } else {
    showSidebar();
  }
});
window.addEventListener("keydown", function(event: KeyboardEvent) {
  if (isSidebarShowing() && event.keyCode === 27) {
    hideSidebar();
  }
});
canvas.addEventListener("mousedown", function(event: MouseEvent) {
  if (event.altKey || event.ctrlKey || event.shiftKey) return;
  if (event.button !== 0) return;
  event.preventDefault();
  if (isSidebarShowing()) {
    hideSidebar();
    return;
  }
  if (!(game_state === GameState.Playing || game_state === GameState.FadeIn)) return;
  const display_x = (event.x - origin_x) / scale;
  const display_y = (event.y - origin_y) / scale;

  const tile_index = level.getTileIndexFromDisplayPoint(display_x, display_y);
  if (!rotateTile(tile_index)) return;
  animateIntoRotation(tile_index);
});

let tile_rotation_animations: {[index:number]:{rotation:number,cancelled:boolean}} = {};
function animateIntoRotation(tile_index: number) {
  const start_time = new Date().getTime();
  const total_time = level.getTileAnimationTime();
  let existing_animation = tile_rotation_animations[tile_index];
  if (existing_animation) existing_animation.cancelled = true;
  let animation = {rotation: -1, cancelled: false};
  tile_rotation_animations[tile_index] = animation;
  requestAnimationFrame(animate);
  function animate() {
    if (animation.cancelled) return;
    const time_progress = (new Date().getTime() - start_time) / total_time;
    if (time_progress >= 1) {
      delete tile_rotation_animations[tile_index];
      renderEverything();
      return;
    }
    animation.rotation = time_progress - 1;

    renderEverything();
    requestAnimationFrame(animate);
  }
}

// these are calculated below
let scale = 100;
// the origin is the upper-left corner of the upper-left-corner border tile.
let origin_x = -50;
let origin_y = -50;
function handleResize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  buffer_canvas.width = canvas.width;
  buffer_canvas.height = canvas.height;

  const display_scale_x = level.getScaleX();
  const display_scale_y = level.getScaleY();
  // cut off half of the border tiles
  const display_width = display_scale_x * (level.tiles_per_row - 1);
  const display_height = display_scale_y * (level.tiles_per_column - 1);

  const level_aspect_ratio = display_height / display_width;
  const canvas_aspect_ratio = canvas.height / canvas.width;
  scale =
    level_aspect_ratio < canvas_aspect_ratio ?
    canvas.width / display_width :
    canvas.height / display_height;

  origin_x = canvas.width / 2 - scale * display_scale_x * level.tiles_per_row / 2;
  origin_y = canvas.height / 2 - scale * display_scale_y * level.tiles_per_column / 2;

  renderEverything();
}

function renderEverything() {
  const use_buffer = game_state !== GameState.Playing;
  const context = (use_buffer ? buffer_canvas : canvas).getContext("2d")!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.save();
  try {
    context.translate(origin_x, origin_y);
    context.scale(scale, scale);
    level.renderLevel(context);

  } finally {
    context.restore();
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
}

const cheatcode_sequence = [
  // sonata of awakening
  6, 5, 6, 5, 9, 10, 9,
];
let cheatcode_index = 0;
function rotateTile(tile_index: number): boolean {
  if (!level.isInBounds(tile_index)) return false;
  if (!level.touchCement(tile_index)) return false;
  level.rotateTile(tile_index);

  renderEverything();

  if (cheatcode_index !== -1) {
    if (cheatcode_sequence[cheatcode_index] === tile_index) {
      cheatcode_index++;
      if (cheatcode_index === cheatcode_sequence.length) {
        // success
        cheatcode_index = -1;
        setTimeout(function() {
          level_number = parseInt("" + prompt("level select"), 10);
          if (!(0 <= level_number && level_number < 100)) {
            // malformed input
            level_number = 0;
          }
          loadNewLevel();
        }, 0);
        return false;
      }
    } else {
      // nope
      cheatcode_index = -1;
    }
  }

  checkForDone();

  return true;
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
        level_number++;
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
  loadLevel(getLevelForNumber(level_number));
  save();
}
function getLevelForNumber(level_number: number): Level {
  switch (level_number) {
    case 1:
      return new SquareLevel(true, 4, 4, false, ColorRules.Single, oneColor([
        0, 0, 0, 0,
        0, 6, 1, 0,
        0, 6, 2, 0,
        0, 0, 0, 0,
      ]));
    case 2:
      return new SquareLevel(true, 5, 4, false, ColorRules.Single, oneColor([
        0, 0, 0, 0, 0,
        0, 6,14,12, 0,
        0, 3, 9, 4, 0,
        0, 0, 0, 0, 0,
      ]));
    case 3:
      return new SquareLevel(true, 5, 5, false, ColorRules.Single, oneColor([
        0, 0, 0, 0, 0,
        0, 2, 3, 4, 0,
        0, 2, 1, 5, 0,
        0,12, 1, 4, 0,
        0, 0, 0, 0, 0,
      ]));
    case 4:
      return generateLevel(new SquareLevel(true, 7, 7, false, ColorRules.Single));
    case 5:
      return generateLevel(new SquareLevel(false, 8, 8, false, ColorRules.Single));
    case 6:
      return generateLevel(new HexagonLevel(true, 5, 5, false, ColorRules.Single));
    case 7:
      return generateLevel(new HexagonLevel(true, 6, 6, false, ColorRules.Single));
    case 8:
      return generateLevel(new HexagonLevel(true, 7, 7, false, ColorRules.Single));
    case 9:
      return generateLevel(new HexagonLevel(false, 8, 8, false, ColorRules.Single));
    case 10:
      return generateLevel(new SquareLevel(true, 7, 7, false, ColorRules.TwoSeparate));
    case 11:
      return generateLevel(new SquareLevel(true, 9, 9, false, ColorRules.TwoSeparate));
    case 12:
      return generateLevel(new HexagonLevel(true, 6, 6, false, ColorRules.TwoSeparate));
    case 13:
      return generateLevel(new HexagonLevel(true, 8, 8, false, ColorRules.TwoSeparate));
    case 14:
      return generateLevel(new SquareLevel(true, 9, 9, false, ColorRules.TwoOverlap));
    case 15:
      return generateLevel(new HexagonLevel(true, 8, 8, false, ColorRules.TwoOverlap));
  }
  // loop
  switch ((level_number - 16) % 6) {
    case 0:
      return generateLevel(new SquareLevel(false, 10, 10, true, ColorRules.Single));
    case 1:
      return generateLevel(new HexagonLevel(false, 9, 9, true, ColorRules.Single));
    case 2:
      return generateLevel(new SquareLevel(false, 10, 10, true, ColorRules.TwoSeparate));
    case 3:
      return generateLevel(new HexagonLevel(false, 9, 9, true, ColorRules.TwoSeparate));
    case 4:
      return generateLevel(new SquareLevel(false, 10, 10, true, ColorRules.TwoOverlap));
    case 5:
      return generateLevel(new HexagonLevel(false, 9, 9, true, ColorRules.TwoOverlap));
    default:
      throw new AssertionFailure();
  }
}

function oneColor(values: number[]): Tile[] {
  let result = [];
  for (let value of values) {
    result.push({colors:[value]});
  }
  return result;
}

function generateLevel(level: Level): Level {
  // generate a solved puzzle
  assert(level.color_count <= 2);
  let possible_edge_values = (
    level.color_count === 1 ? 2 :
    level.allow_overlap     ? 4 : 3
  );
  for (let vector of level.allEdges()) {
    if (!level.isInBounds(vector.tile_index)) continue;
    const other_tile = level.getTileIndexFromVector(vector.tile_index, vector.direction);
    if (!level.isInBounds(other_tile)) continue;
    let edge_value = Math.floor(Math.random() * possible_edge_values);
    for (let color_index = 0; color_index < level.color_count; color_index++) {
      if (edge_value & (1 << color_index)) {
        level.tiles[vector.tile_index].colors[color_index] |= vector.direction;
        level.tiles[other_tile].colors[color_index] |= level.reverseDirection(vector.direction);
      }
    }
  }

  // rotate the tiles randomly
  for (let tile_index of level.allTileIndexes()) {
    if (level.isInBounds(tile_index)) {
      level.rotateRandomly(tile_index);
    }
  }

  return level;
}

class AssertionFailure {}
function assert(b: boolean) {
  if (!b) throw new AssertionFailure();
}

retry_button.addEventListener("click", function() {
  loadNewLevel();
  hideSidebar();
});
reset_button.addEventListener("click", function() {
  if (confirm("Really start back at level 1?")) {
    level_number = 1;
    loadNewLevel();
    hideSidebar();
  }
});

function getSaveObject(): {[key:string]:any} {
  let save_data_str = window.localStorage.getItem('loops');
  return save_data_str ? JSON.parse(save_data_str) : {};
}
function save() {
  // preserve any unknown properties
  let save_data = getSaveObject();
  save_data.level_number = level_number;
  window.localStorage.setItem("loops", JSON.stringify(save_data));
}

(function () {
  let save_data = getSaveObject();
  level_number = save_data.level_number || 1;
  loadNewLevel();
})();

(function() {
  let save_data_str = window.localStorage.getItem("loops");
  if (save_data_str) {
    let save_data = JSON.parse(save_data_str);
    level_number = save_data.level_number;
  }
  loadNewLevel();
})();
