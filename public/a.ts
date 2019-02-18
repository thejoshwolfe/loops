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

enum Shape {
  // for Square, tile values are a bit for each edge:
  //   8
  // 4   1
  //   2
  // the length of each edge is 1 unit.
  Square,

  // for Hexagon, this is a (5,3) sized hex grid:
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
  Hexagon,
}

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

interface LevelParameters {
  size: number[],
  shape: Shape,
  colors: ColorRules,
  cement_mode?: boolean,
  toroidal?: boolean,
};

class Level {
  tiles_per_row: number;
  tiles_per_column: number;
  shape: Shape;
  frozen_tiles: {[tile_index:number]: boolean};
  recent_touch_queue: number[];
  cement_mode: boolean;
  color_count: number;
  allow_overlap: boolean;
  toroidal: boolean;
  tiles: Tile[];

  scale_x: number;
  scale_y: number;
  offset_x: number;
  offset_y: number;
  tile_animation_time: number;
  edges_per_tile: number;

  constructor(parameters: LevelParameters) {
    this.tiles_per_row = parameters.size[0];
    this.tiles_per_column = parameters.size[1];
    this.shape = parameters.shape;
    this.cement_mode = !!parameters.cement_mode;
    this.recent_touch_queue = [];
    this.frozen_tiles = {};
    this.toroidal = parameters.toroidal || false;

    switch (parameters.colors) {
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

    // all tiles start empty
    this.tiles = [];
    for (let i = 0; i < this.tiles_per_row * this.tiles_per_column; i++) {
      let colors = [];
      for (let color_index = 0; color_index < this.color_count; color_index++) {
        colors.push(0);
      }
      this.tiles.push({colors});
    }

    switch (this.shape) {
      case Shape.Square:
        this.scale_x = 1;
        this.scale_y = 1;
        this.offset_x = 0;
        this.offset_y = 0;
        this.tile_animation_time = 150;
        this.edges_per_tile = 4;
        break;
      case Shape.Hexagon:
        this.scale_x = 1.5;
        this.scale_y = sqrt3;
        this.offset_x = -0.5;
        this.offset_y = 0;
        this.tile_animation_time = 120;
        this.edges_per_tile = 6;
        break;
      default: throw new AssertionFailure();
    }
  }

  getTileIndexFromDisplayPoint(display_x: number, display_y: number): number {
    switch (this.shape) {
      case Shape.Square: {
        return this.getTileIndexFromCoord(Math.floor(display_x), Math.floor(display_y));
      }
      case Shape.Hexagon: {
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
              closest_tile = this.getTileIndexFromCoord(euclideanMod(x, this.tiles_per_row), euclideanMod(y, this.tiles_per_column));
            }
          }
        }
        assert(!isNaN(closest_tile));
        return closest_tile;
      }
      default: throw new AssertionFailure();
    }
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
    switch (this.shape) {
      case Shape.Square: {
        let result: Vector[] = [];
        for (let y = 0; y < this.tiles_per_column; y++) {
          for (let x = 0; x < this.tiles_per_row; x++) {
            result.push({tile_index:this.getTileIndexFromCoord(x, y), direction:1});
            result.push({tile_index:this.getTileIndexFromCoord(x, y), direction:2});
          }
        }
        return result;
      }
      case Shape.Hexagon: {
        let result: Vector[] = [];
        for (let y = 0; y < this.tiles_per_column; y++) {
          for (let x = 0; x < this.tiles_per_row; x++) {
            let tile_index = this.getTileIndexFromCoord(x, y);
            result.push({tile_index, direction:1});
            result.push({tile_index, direction:2});
            result.push({tile_index, direction:4});
          }
        }

        let debug_no_dups: {[hash: string]: boolean} = {};
        for (let vector of result) {
          let hash = "" + vector.tile_index + "," + vector.direction;
          if (debug_no_dups[hash]) throw new AssertionFailure();
          debug_no_dups[hash] = true;
        }
        return result;
      }
      default: throw new AssertionFailure();
    }
  }

  getTileIndexFromVector(tile_index: number, direction: number): number {
    switch (this.shape) {
      case Shape.Square: {
        let {x, y} = this.getTileCoordFromIndex(tile_index);
        switch (direction) {
          case 1: x = euclideanMod(x + 1, this.tiles_per_row   ); break; // right
          case 2: y = euclideanMod(y + 1, this.tiles_per_column); break; // down
          case 4: x = euclideanMod(x - 1, this.tiles_per_row   ); break; // left
          case 8: y = euclideanMod(y - 1, this.tiles_per_column); break; // up
          default: throw new AssertionFailure();
        }
        return this.getTileIndexFromCoord(x, y);
      }
      case Shape.Hexagon: {
        let {x, y} = this.getTileCoordFromIndex(tile_index);
        const is_offset_down = !!(x & 1);
        switch (direction) {
          case 1: // down right
            x = euclideanMod(x + 1, this.tiles_per_row);
            if (is_offset_down) y = euclideanMod(y + 1, this.tiles_per_column);
            break;
          case 2: // down
            y = euclideanMod(y + 1, this.tiles_per_column);
            break;
          case 4: // down left
            x = euclideanMod(x - 1, this.tiles_per_row);
            if (is_offset_down) y = euclideanMod(y + 1, this.tiles_per_column);
            break;
          case 8: // up left
            x = euclideanMod(x - 1, this.tiles_per_row);
            if (!is_offset_down) y = euclideanMod(y - 1, this.tiles_per_column);
            break;
          case 16: // up
            y = euclideanMod(y - 1, this.tiles_per_column);
            break;
          case 32: // up right
            x = euclideanMod(x + 1, this.tiles_per_row);
            if (!is_offset_down) y = euclideanMod(y - 1, this.tiles_per_column);
            break;
          default: throw new AssertionFailure();
        }
        return this.getTileIndexFromCoord(x, y);
      }
      default: throw new AssertionFailure();
    }
  }

  reverseDirection(direction: number): number {
    const times = this.edges_per_tile / 2;
    return this.rotateValue(direction, times);
  }

  rotateValue(value: number, times: number): number {
    times = euclideanMod(times, this.edges_per_tile);
    const mask = (1 << this.edges_per_tile) - 1;
    return mask & (
      (value << times) |
      (value >> (this.edges_per_tile - times))
    );
  }

  rotateTile(tile_index: number, times: number): void {
    for (let color_index = 0; color_index < this.color_count; color_index++) {
      let color_value = this.tiles[tile_index].colors[color_index];
      color_value = this.rotateValue(color_value, times);
      this.tiles[tile_index].colors[color_index] = color_value;
    }
  }

  rotateRandomly(tile_index: number): void {
    this.rotateTile(tile_index, Math.floor(Math.random() * this.edges_per_tile));
  }

  renderGridLines(context: CanvasRenderingContext2D): void {
    switch (this.shape) {
      case Shape.Square: {
        // straight shots in both directions
        if (this.toroidal) {
          for (let x = -this.tiles_per_row; x < 2 * this.tiles_per_row; x++) {
            context.moveTo(x, -this.tiles_per_column);
            context.lineTo(x, 2 * this.tiles_per_column);
          }
          for (let y = -this.tiles_per_column; y < 2 * this.tiles_per_column; y++) {
            context.moveTo(-this.tiles_per_row, y);
            context.lineTo(2 * this.tiles_per_row, y);
          }
        } else {
          for (let x = 2; x < this.tiles_per_row - 1; x++) {
            context.moveTo(x, 1);
            context.lineTo(x, this.tiles_per_column - 1);
          }
          for (let y = 2; y < this.tiles_per_column - 1; y++) {
            context.moveTo(1, y);
            context.lineTo(this.tiles_per_row - 1, y);
          }
        }
        break;
      }
      case Shape.Hexagon: {
        if (this.toroidal) {
          var top = -this.tiles_per_column;
          var bottom = 2 * this.tiles_per_column;
          var left = -(this.tiles_per_row & ~1);
          var right = 2 * this.tiles_per_row;
        } else {
          top = 0;
          bottom = this.tiles_per_column;
          left = 0;
          right = this.tiles_per_row;
        }
        for (let y = top; y <= bottom; y++) {
          // the repeating pattern is:
          //   __
          //  /  \__
          //  \  /
          //
          const high_y = sqrt3 * y;
          const mid_y = sqrt3 * (y + 0.5);
          const low_y = sqrt3 * (y + 1);
          for (let x = left; x <= right; x += 2) {
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
        break;
      }
      default: throw new AssertionFailure();
    }
  }

  renderTile(context: CanvasRenderingContext2D, color_value: number, x: number, y: number, animation_progress: number, endpoint_style: EndpointStyle): void {
    switch (this.shape) {
      case Shape.Square: {
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
        break;
      }
      case Shape.Hexagon: {
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
        break;
      }
      default: throw new AssertionFailure();
    }
  }

  renderTileBackground(context: CanvasRenderingContext2D, x: number, y: number): void {
    switch (this.shape) {
      case Shape.Square: {
        context.fillRect(x, y, 1, 1);
        break;
      }
      case Shape.Hexagon: {
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
        break;
      }
      default: throw new AssertionFailure();
    }
  }

  getDisplayTileCountX(): number { return this.toroidal ? this.tiles_per_row    + 3 : this.tiles_per_row    - 1; }
  getDisplayTileCountY(): number { return this.toroidal ? this.tiles_per_column + 3 : this.tiles_per_column - 1; }

  isInBounds(tile_index: number): boolean {
    if (this.toroidal) return true;

    const {x, y} = this.getTileCoordFromIndex(tile_index);
    return (
      1 <= x && x < this.tiles_per_row - 1 &&
      1 <= y && y < this.tiles_per_column - 1
    );
  }

  touchTile(tile_index: number): void {
    if (!this.cement_mode) return;
    let index = this.recent_touch_queue.indexOf(tile_index);
    if (index !== -1) {
      // bring it to the front
      this.recent_touch_queue.splice(index, 1);
      this.recent_touch_queue.unshift(tile_index);
    } else {
      // newly clicked
      this.recent_touch_queue.unshift(tile_index);
      if (this.recent_touch_queue.length > 3) {
        // something's getting frozen
        let freezing_tile = this.recent_touch_queue.pop()!;
        this.frozen_tiles[freezing_tile] = true;
      }
    }
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
    context.strokeStyle = "#ddd";
    context.lineWidth = 0.03;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    this.renderGridLines(context);
    context.stroke();

    // tile background
    for (let location of this.allTileIndexes()) {
      if (level.frozen_tiles[location]) {
        context.fillStyle = "#ccc";
      } else {
        let age = level.recent_touch_queue.indexOf(location);
        if (age === -1) continue;
        switch (age) {
          case 0:
            context.fillStyle = "#eee";
            break;
          case 1:
          case 2:
            context.fillStyle = "#eee";
            break;
          default: throw new AssertionFailure();
        }
      }
      const {x, y} = this.getTileCoordFromIndex(location);
      this.renderTileBackgrounds(context, x, y);
    }

    // tiles
    for (let color_index = 0; color_index < this.color_count; color_index++) {
      // select an appropriate line style and color
      context.lineCap = "round";
      context.lineJoin = "round";
      let endpoint_style: EndpointStyle;
      if (this.color_count === 1) {
        context.strokeStyle = "#000";
        context.lineWidth = level.scale_x * 0.1;
        endpoint_style = EndpointStyle.LargeRing;
      } else if (this.color_count === 2 && !this.allow_overlap) {
        switch (color_index) {
          case 0:
            context.strokeStyle = "#99f";
            context.lineWidth = level.scale_x * 0.2;
            endpoint_style = EndpointStyle.LargeDot;
            context.fillStyle = context.strokeStyle;
            break;
          case 1:
            context.strokeStyle = "#c06";
            context.lineWidth = level.scale_x * 0.075;
            endpoint_style = EndpointStyle.SmallRing;
            break;
          default: throw new AssertionFailure();
        }
      } else if (this.color_count === 2 && this.allow_overlap) {
        switch (color_index) {
          case 0:
            context.strokeStyle = "#e784e1";
            context.lineWidth = level.scale_x * 0.4;
            context.lineCap = "butt";
            context.lineJoin = "miter";
            endpoint_style = EndpointStyle.LargeDot;
            context.fillStyle = context.strokeStyle;
            break;
          case 1:
            context.strokeStyle = "#000caa";
            context.lineWidth = level.scale_x * 0.075;
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
        this.renderTiles(context, color_value, x, y, animation_progress, endpoint_style);
      }
    }

    // toroidal guide
    if (this.toroidal) {
      let left = this.offset_x;
      let right = left + this.tiles_per_row * this.scale_x;
      let top = this.offset_y;
      let bottom = top + this.tiles_per_column * this.scale_y;
      context.strokeStyle = "rgba(0,0,0,0.5)";
      context.lineWidth = 0.05;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      context.moveTo(left, top);
      context.lineTo(right, top);
      context.lineTo(right, bottom);
      context.lineTo(left, bottom);
      context.lineTo(left, top);
      context.stroke();
    }
  }

  renderTiles(context: CanvasRenderingContext2D, color_value: number, x: number, y: number, animation_progress: number, endpoint_style: EndpointStyle): void {
    if (!this.toroidal) return this.renderTile(context, color_value, x, y, animation_progress, endpoint_style);
    for (let dy of [-1, 0, 1]) {
      for (let dx of [-1, 0, 1]) {
        this.renderTile(context, color_value, x + dx * this.tiles_per_row, y + dy * this.tiles_per_column, animation_progress, endpoint_style);
      }
    }
  }
  renderTileBackgrounds(context: CanvasRenderingContext2D, x: number, y: number): void {
    if (!this.toroidal) return this.renderTileBackground(context, x, y);
    for (let dy of [-1, 0, 1]) {
      for (let dx of [-1, 0, 1]) {
        this.renderTileBackground(context, x + dx * this.tiles_per_row, y + dy * this.tiles_per_column);
      }
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

  const wrapped_display_x = euclideanMod(display_x, level.tiles_per_row * level.scale_x);
  const wrapped_display_y = euclideanMod(display_y, level.tiles_per_column * level.scale_y);
  if (!level.toroidal) {
    // make sure the click is in bounds
    if (display_x !== wrapped_display_x || display_y !== wrapped_display_y) return;
  }

  const tile_index = level.getTileIndexFromDisplayPoint(wrapped_display_x, wrapped_display_y);
  if (!clickTile(tile_index)) return;
  animateIntoRotation(tile_index);
});

let tile_rotation_animations: {[index:number]:{rotation:number,cancelled:boolean}} = {};
function animateIntoRotation(tile_index: number) {
  const start_time = new Date().getTime();
  const total_time = level.tile_animation_time;
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

  const level_scale_x = level.scale_x;
  const level_scale_y = level.scale_y;
  // cut off half of the border tiles
  const display_width = level_scale_x * level.getDisplayTileCountX();
  const display_height = level_scale_y * level.getDisplayTileCountY();

  const level_aspect_ratio = display_height / display_width;
  const canvas_aspect_ratio = canvas.height / canvas.width;
  scale =
    level_aspect_ratio < canvas_aspect_ratio ?
    canvas.width / display_width :
    canvas.height / display_height;

  let center_x = level_scale_x * level.tiles_per_row / 2;
  let center_y = level_scale_y * level.tiles_per_column / 2;
  if (level.shape === Shape.Hexagon && level.toroidal) {
    // the coordinate system works well in the code,
    // but it looks slightly off to the human eye.
    center_x += level.offset_x;
    center_y += level.offset_y;
  }

  origin_x = canvas.width / 2 - scale * center_x;
  origin_y = canvas.height / 2 - scale * center_y;

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
function clickTile(tile_index: number): boolean {
  if (level.frozen_tiles[tile_index]) return false;
  level.touchTile(tile_index);
  level.rotateTile(tile_index, 1);

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
      return generateLevel({size:[4, 4], shape: Shape.Square, colors: ColorRules.Single}, oneColor([
        0, 0, 0, 0,
        0, 6, 1, 0,
        0, 6, 2, 0,
        0, 0, 0, 0,
      ]));
    case 2:
      return generateLevel({size:[5, 4], shape: Shape.Square, colors: ColorRules.Single}, oneColor([
        0, 0, 0, 0, 0,
        0, 6,14,12, 0,
        0, 3, 9, 4, 0,
        0, 0, 0, 0, 0,
      ]));
    case 3:
      return generateLevel({size:[5, 5], shape: Shape.Square, colors: ColorRules.Single}, oneColor([
        0, 0, 0, 0, 0,
        0, 2, 3, 4, 0,
        0, 2, 1, 5, 0,
        0,12, 1, 4, 0,
        0, 0, 0, 0, 0,
      ]));
    case 4:
      return generateLevel({size:[7, 7], shape: Shape.Square, colors: ColorRules.Single});
    case 5:
      return generateLevel({size:[8, 8], shape: Shape.Square, colors: ColorRules.Single});
    case 6:
      return generateLevel({size:[5, 5], shape: Shape.Hexagon, colors: ColorRules.Single});
    case 7:
      return generateLevel({size:[6, 6], shape: Shape.Hexagon, colors: ColorRules.Single});
    case 8:
      return generateLevel({size:[7, 7], shape: Shape.Hexagon, colors: ColorRules.Single});
    case 9:
      return generateLevel({size:[8, 8], shape: Shape.Hexagon, colors: ColorRules.Single});
    case 10:
      return generateLevel({size:[7, 7], shape: Shape.Square, colors: ColorRules.TwoSeparate});
    case 11:
      return generateLevel({size:[9, 9], shape: Shape.Square, colors: ColorRules.TwoSeparate});
    case 12:
      return generateLevel({size:[6, 6], shape: Shape.Hexagon, colors: ColorRules.TwoSeparate});
    case 13:
      return generateLevel({size:[8, 8], shape: Shape.Hexagon, colors: ColorRules.TwoSeparate});
    case 14:
      return generateLevel({size:[9, 9], shape: Shape.Square, colors: ColorRules.TwoOverlap});
    case 15:
      return generateLevel({size:[8, 8], shape: Shape.Hexagon, colors: ColorRules.TwoOverlap});
  }
  // loop
  switch ((level_number - 16) % 12) {
    case 0:
      return generateLevel({size:[10, 10], shape: Shape.Square, colors: ColorRules.TwoOverlap, cement_mode: true});
    case 1:
      return generateLevel({size:[9, 9], shape: Shape.Hexagon, colors: ColorRules.TwoOverlap, cement_mode: true});
    case 2:
      return generateLevel({size:[10, 10], shape: Shape.Square, colors: ColorRules.TwoSeparate, cement_mode: true});
    case 3:
      return generateLevel({size:[9, 9], shape: Shape.Hexagon, colors: ColorRules.TwoSeparate, cement_mode: true});
    case 4:
      return generateLevel({size:[10, 10], shape: Shape.Square, colors: ColorRules.Single, cement_mode: true});
    case 5:
      return generateLevel({size:[9, 9], shape: Shape.Hexagon, colors: ColorRules.Single, cement_mode: true});
    case 6:
      return generateLevel({size:[6, 6], shape: Shape.Square, colors: ColorRules.TwoOverlap, toroidal: true});
    case 7:
      return generateLevel({size:[6, 6], shape: Shape.Hexagon, colors: ColorRules.TwoOverlap, toroidal: true});
    case 8:
      return generateLevel({size:[6, 6], shape: Shape.Square, colors: ColorRules.TwoSeparate, toroidal: true});
    case 9:
      return generateLevel({size:[6, 6], shape: Shape.Hexagon, colors: ColorRules.TwoSeparate, toroidal: true});
    case 10:
      return generateLevel({size:[6, 6], shape: Shape.Square, colors: ColorRules.Single, toroidal: true});
    case 11:
      return generateLevel({size:[6, 6], shape: Shape.Hexagon, colors: ColorRules.Single, toroidal: true});
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

function generateLevel(parameters: LevelParameters, tiles?: Tile[]): Level {
  let level = new Level(parameters);
  // mark out of bounds tiles as already frozen
  for (let tile_index of level.allTileIndexes()) {
    if (!level.isInBounds(tile_index)) {
      level.frozen_tiles[tile_index] = true;
    }
  }

  if (tiles) {
    // tiles already ready to use
    assert(level.tiles_per_row * level.tiles_per_column === tiles.length);
    for (let tile of tiles) {
      assert(tile.colors.length === level.color_count);
    }
    level.tiles = tiles;

  } else {
    // generate a solved puzzle
    assert(level.color_count <= 2);
    let possible_edge_values = (
      level.color_count === 1 ? 2 :
      level.allow_overlap     ? 4 : 3
    );
    for (let vector of level.allEdges()) {
      const other_tile = level.getTileIndexFromVector(vector.tile_index, vector.direction);
      const out_of_bounds = level.frozen_tiles[vector.tile_index] || level.frozen_tiles[other_tile];
      if (out_of_bounds) continue;
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
      if (!level.frozen_tiles[tile_index]) {
        level.rotateRandomly(tile_index);
      }
    }
  }

  return level;
}

class AssertionFailure {}
function assert(b: boolean) {
  if (!b) throw new AssertionFailure();
}
function euclideanMod(numerator: number, denominator: number): number {
  if (numerator < 0) return denominator + (numerator % denominator);
  return numerator % denominator;
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
