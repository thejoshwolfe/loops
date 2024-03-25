import { solveLevel } from "./solver.js";

let level_number = 1;
let is_custom_level = false;
let unlocked_level_number = 1;

const canvas = document.getElementById("canvas")! as HTMLCanvasElement;
const sidebar_tray = document.getElementById("sidebar") as HTMLDivElement;
const sidebar_button = document.getElementById("hamburger") as HTMLDivElement;
const retry_button = document.getElementById("retryButton") as HTMLButtonElement;
const reset_button = document.getElementById("resetButton") as HTMLButtonElement;
const tile_set_div = document.getElementById("tileSetDiv") as HTMLDivElement;
const tile_set_select = document.getElementById("tileSetSelect") as HTMLSelectElement;
const level_number_span = document.getElementById("level_number_span") as HTMLSpanElement;
const level_down_button = document.getElementById("level_down_button") as HTMLButtonElement;
const level_up_button = document.getElementById("level_up_button") as HTMLButtonElement;
const show_custom_level_button = document.getElementById("show_custom_level_button") as HTMLButtonElement;
const level_settings_div = document.getElementById("level_settings_div") as HTMLDivElement;
const custom_colors_select = document.getElementById("custom_colors_select") as HTMLSelectElement;
const custom_colors_div = document.getElementById("custom_colors_div") as HTMLDivElement;
const custom_color_two_overlap_option = document.getElementById("custom_color_two_overlap_option") as HTMLOptionElement;
const custom_shape_select = document.getElementById("custom_shape_select") as HTMLSelectElement;
const custom_shape_div = document.getElementById("custom_shape_div") as HTMLDivElement;
const custom_toroidal_checkbox = document.getElementById("custom_toroidal_checkbox") as HTMLInputElement;
const custom_toroidal_div = document.getElementById("custom_toroidal_div") as HTMLDivElement;
const custom_rough_checkbox = document.getElementById("custom_rough_checkbox") as HTMLInputElement;
const custom_rough_div = document.getElementById("custom_rough_div") as HTMLDivElement;
const rough_label_span = document.getElementById("rough_label_span") as HTMLSpanElement;
const custom_cement_mode_checkbox = document.getElementById("custom_cement_mode_checkbox") as HTMLInputElement;
const custom_cement_mode_div = document.getElementById("custom_cement_mode_div") as HTMLDivElement;
const custom_width_spinner = document.getElementById("custom_width_spinner") as HTMLInputElement;
const custom_height_spinner = document.getElementById("custom_height_spinner") as HTMLInputElement;

const pi = Math.PI;
const sqrt3 = Math.sqrt(3);

let global_alpha = 1.0;
const buffer_canvas = document.createElement("canvas");
let asdf_alpha = 1.0;
let line_width_multiplier = 1.0;
const line_width_multiplier_factor = 0.4;
const asdf_background_canvas = document.createElement("canvas");
const tile_canvas = document.createElement("canvas");
const asdf_foreground_canvas = document.createElement("canvas");

const all_canvases = [
  canvas,
  buffer_canvas,
  asdf_background_canvas,
  tile_canvas,
  asdf_foreground_canvas,
];

const render_target_canvases = [
  asdf_background_canvas,
  tile_canvas,
  asdf_foreground_canvas,
];

enum GameState {
  Playing,
  FadeOut, // auto transition
  FadeToRoses,
  SmellTheRoses, // need to tap to advance
  FadeIn,
}
let game_state = GameState.Playing;

// Aesthetics
enum TileSet {
  Trypo,
  Ribbon,
  Iso,
  Chaos,
}
let tile_set: TileSet = TileSet.Trypo;

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

interface LevelParameters {
  size: number[],
  shape: Shape,
  colors: ColorRules,
  cement_mode?: boolean,
  toroidal?: boolean,
  rough?: boolean,
  perfectable?: boolean,
  shuffle_tiles?: boolean,
};

export class Level {
  // LevelParameters
  tiles_per_row: number;
  tiles_per_column: number;
  shape: Shape;
  cement_mode: boolean;
  colors: ColorRules;
  toroidal: boolean;
  rough: boolean;

  // cached calculations
  units_per_tile_x: number;
  units_per_tile_y: number;
  tile_animation_time: number;
  edges_per_tile: number;
  color_count: number;
  allow_overlap: boolean;

  display_offset_x: number;
  display_offset_y: number;
  display_tiles_x: number;
  display_tiles_y: number;

  // game state that needs to be saved
  tiles: number[][];
  frozen_tiles: {[tile_index:number]: boolean};
  recent_touch_queue: number[];
  original_tiles?: number[][];
  perfect_so_far: boolean;

  constructor(parameters: LevelParameters) {
    this.tiles_per_row = parameters.size[0];
    this.tiles_per_column = parameters.size[1];
    this.shape = parameters.shape;
    this.cement_mode = parameters.cement_mode || false;
    this.toroidal = parameters.toroidal || false;
    this.rough = parameters.rough || false;
    this.perfect_so_far = false;

    this.colors = parameters.colors;
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
    this.frozen_tiles = {};
    this.recent_touch_queue = [];
    for (let i = 0; i < this.tiles_per_row * this.tiles_per_column; i++) {
      let colors = [];
      for (let color_index = 0; color_index < this.color_count; color_index++) {
        colors.push(0);
      }
      this.tiles.push(colors);
    }

    // calculate a bunch of derived constants
    switch (this.shape) {
      case Shape.Square:
        this.units_per_tile_x = 1;
        this.units_per_tile_y = 1;
        this.tile_animation_time = 150;
        this.edges_per_tile = 4;

        this.display_offset_x = 0;
        this.display_offset_y = 0;
        if (this.toroidal) {
          // show 1.5 extra tiles on the sides
          this.display_tiles_x = this.tiles_per_row + 3;
          this.display_tiles_y = this.tiles_per_column + 3;
        } else {
          // cut off half of each border tile.
          this.display_tiles_x = this.tiles_per_row - 1;
          this.display_tiles_y = this.tiles_per_column - 1;
        }
        break;

      case Shape.Hexagon:
        this.units_per_tile_x = 1.5;
        this.units_per_tile_y = sqrt3;
        this.tile_animation_time = 120;
        this.edges_per_tile = 6;

        if (this.toroidal) {
          // show some extra tiles on the sides
          this.display_offset_x = -0.5;
          this.display_offset_y = 0;
          this.display_tiles_x = this.tiles_per_row + 3;
          this.display_tiles_y = this.tiles_per_column + 3;
        } else {
          // show an extra half tile beyond the extreme squiggling ones
          this.display_offset_x = 0.25;
          this.display_offset_y = sqrt3 / 4;
          this.display_tiles_x = this.tiles_per_row - 1;
          this.display_tiles_y = this.tiles_per_column - 0.5;
        }
        break;
      default: throw new AssertionFailure();
    }

    // TODO: odd width wrapping for hexagons is not trivial, and doesn't work yet.
    assert(!(this.shape == Shape.Hexagon && (this.tiles_per_row & 1) && this.toroidal));
  }

  initializePossibilityForPerfect(): void {
    this.original_tiles = JSON.parse(JSON.stringify(this.tiles));
    this.perfect_so_far = true;
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
    let all_back_to_original_values = true;
    for (let color_index = 0; color_index < this.color_count; color_index++) {
      let color_value = this.tiles[tile_index][color_index];
      color_value = this.rotateValue(color_value, times);
      this.tiles[tile_index][color_index] = color_value;

      if (this.perfect_so_far && this.original_tiles != null) {
        if (this.original_tiles[tile_index][color_index] !== color_value) {
          all_back_to_original_values = false;
        }
      }
    }

    if (all_back_to_original_values) {
      // you rotated a tile all the way around.
      this.perfect_so_far = false;
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

  renderTile(context: CanvasRenderingContext2D, color_value: number, x: number, y: number, animation_progress: number, endpoint_style: EndpointStyle, tile_set: TileSet): void {
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
                  context.arc(0, 0, line_width_multiplier * 0.25, 0, 2*pi);
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

          if (tile_set === TileSet.Iso) {
            for (let i = 0; i < 6; i++) {
              if (color_value & (1 << i)) {
                context.beginPath();
                context.moveTo(0, 0);
                context.lineTo(0.75, sqrt3/4);
                context.stroke();
              }
              context.rotate(pi/3);
            }
            break;
          }

          // normalize rotation
          switch (color_value) {
            // hoop
            case 1:  break;
            case 2:  color_value = 1; context.rotate(1/3*pi); break;
            case 4:  color_value = 1; context.rotate(2/3*pi); break;
            case 8:  color_value = 1; context.rotate(pi);     break;
            case 16: color_value = 1; context.rotate(4/3*pi); break;
            case 32: color_value = 1; context.rotate(5/3*pi); break;

            // hook
            case 3:  break;
            case 6:  color_value = 3; context.rotate(1/3*pi); break;
            case 12: color_value = 3; context.rotate(2/3*pi); break;
            case 24: color_value = 3; context.rotate(pi);     break;
            case 48: color_value = 3; context.rotate(4/3*pi); break;
            case 33: color_value = 3; context.rotate(5/3*pi); break;

            // noodle
            case 5:  break;
            case 10: color_value = 5; context.rotate(1/3*pi); break;
            case 20: color_value = 5; context.rotate(2/3*pi); break;
            case 40: color_value = 5; context.rotate(pi);     break;
            case 17: color_value = 5; context.rotate(4/3*pi); break;
            case 34: color_value = 5; context.rotate(5/3*pi); break;

            // bird
            case 7:  break;
            case 14: color_value = 7; context.rotate(1/3*pi); break;
            case 28: color_value = 7; context.rotate(2/3*pi); break;
            case 56: color_value = 7; context.rotate(pi);     break;
            case 49: color_value = 7; context.rotate(4/3*pi); break;
            case 35: color_value = 7; context.rotate(5/3*pi); break;

            // stick
            case 9:  break;
            case 18: color_value = 9; context.rotate(1/3*pi); break;
            case 36: color_value = 9; context.rotate(2/3*pi); break;

            // right shoe
            case 11: break;
            case 22: color_value = 11; context.rotate(1/3*pi); break;
            case 44: color_value = 11; context.rotate(2/3*pi); break;
            case 25: color_value = 11; context.rotate(pi);     break;
            case 50: color_value = 11; context.rotate(4/3*pi); break;
            case 37: color_value = 11; context.rotate(5/3*pi); break;

            // left shoe
            case 13: break;
            case 26: color_value = 13; context.rotate(1/3*pi); break;
            case 52: color_value = 13; context.rotate(2/3*pi); break;
            case 41: color_value = 13; context.rotate(pi);     break;
            case 19: color_value = 13; context.rotate(4/3*pi); break;
            case 38: color_value = 13; context.rotate(5/3*pi); break;

            // comb
            case 15: break;
            case 30: color_value = 15; context.rotate(1/3*pi); break;
            case 60: color_value = 15; context.rotate(2/3*pi); break;
            case 57: color_value = 15; context.rotate(pi);     break;
            case 51: color_value = 15; context.rotate(4/3*pi); break;
            case 39: color_value = 15; context.rotate(5/3*pi); break;

            // triangle
            case 21: break;
            case 42: color_value = 21; context.rotate(1/3*pi); break;

            // space ship
            case 23: break;
            case 46: color_value = 23; context.rotate(1/3*pi); break;
            case 29: color_value = 23; context.rotate(2/3*pi); break;
            case 58: color_value = 23; context.rotate(pi);     break;
            case 53: color_value = 23; context.rotate(4/3*pi); break;
            case 43: color_value = 23; context.rotate(5/3*pi); break;

            // pisces
            case 27: break;
            case 54: color_value = 27; context.rotate(1/3*pi); break;
            case 45: color_value = 27; context.rotate(2/3*pi); break;

            // dragon
            case 31: break;
            case 62: color_value = 31; context.rotate(1/3*pi); break;
            case 61: color_value = 31; context.rotate(2/3*pi); break;
            case 59: color_value = 31; context.rotate(pi);     break;
            case 55: color_value = 31; context.rotate(4/3*pi); break;
            case 47: color_value = 31; context.rotate(5/3*pi); break;

            // shuriken
            case 63: break;

            default: throw new AssertionFailure();
          }
          // render normalized value
          switch (color_value) {
            case 1: // hoop
              switch (tile_set) {
                case TileSet.Ribbon:
                case TileSet.Trypo:
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
              }
              break;
            case 3: // hook
              switch (tile_set) {
                case TileSet.Ribbon:
                case TileSet.Trypo:
                  context.beginPath();
                  context.arc(0.5, sqrt3/2, 0.5, pi, 5/3*pi);
                  context.stroke();
                  break;
              }
              break;
            case 5: // noodle
              switch (tile_set) {
                case TileSet.Ribbon:
                case TileSet.Trypo:
                  context.beginPath();
                  context.arc(0, sqrt3, 1.5, 4/3*pi, 5/3*pi);
                  context.stroke();
                  break;
              }
              break;
            case 7: // bird
              switch (tile_set) {
                case TileSet.Ribbon:
                case TileSet.Trypo:
                  context.beginPath();
                  context.arc(-0.5, sqrt3/2, 0.5, 4/3*pi, 2*pi);
                  context.arc(0.5, sqrt3/2, 0.5, pi, 5/3*pi);
                  context.stroke();
                  break;
              }
              break;
            case 9: // stick
              switch (tile_set) {
                case TileSet.Ribbon:
                case TileSet.Trypo:
                  context.beginPath();
                  context.moveTo(0.75, sqrt3 / 4);
                  context.lineTo(-0.75, -sqrt3 / 4);
                  context.stroke();
                  break;
              }
              break;
            case 11: // right shoe
              switch (tile_set) {
                case TileSet.Ribbon:
                  context.beginPath();
                  context.arc(0.5, sqrt3/2, 0.5, pi, 5/3*pi);
                  context.lineTo(-0.75, -sqrt3 / 4);
                  context.stroke();
                  break;
                case TileSet.Trypo:
                  context.beginPath();
                  context.arc(-1.5, sqrt3/2, 1.5, 5/3*pi, 2*pi);
                  context.arc(0.5, sqrt3/2, 0.5, pi, 5/3*pi);
                  context.stroke();
                  break;
              }
              break;
            case 13: // left shoe
              switch (tile_set) {
                case TileSet.Ribbon:
                  context.beginPath();
                  context.moveTo(0.75, sqrt3 / 4);
                  context.arc(-1, 0, 0.5, 5/3*pi, 1/3*pi);
                  context.stroke();
                  break;
                case TileSet.Trypo:
                  context.beginPath();
                  context.arc(-1, 0, 0.5, 5/3*pi, 1/3*pi);
                  context.arc(0, sqrt3, 1.5, 4/3*pi, 5/3*pi);
                  context.stroke();
                  break;
              }
              break;
            case 15: // comb
              switch (tile_set) {
                case TileSet.Ribbon:
                  context.beginPath();
                  context.arc(0, sqrt3, 1.5, 4/3*pi, 5/3*pi);
                  context.stroke();
                  context.rotate(pi/3);
                  context.beginPath();
                  context.arc(0, sqrt3, 1.5, 4/3*pi, 5/3*pi);
                  context.stroke();
                  break;
                case TileSet.Trypo:
                  context.beginPath();
                  context.arc(-1, 0, 0.5, 5/3*pi, 1/3*pi);
                  context.arc(-0.5, sqrt3/2, 0.5, 4/3*pi, 2*pi);
                  context.arc(0.5, sqrt3/2, 0.5, pi, 5/3*pi);
                  context.stroke();
                  break;
              }
              break;
            case 21: // triangle
              switch (tile_set) {
                case TileSet.Ribbon:
                case TileSet.Trypo:
                  context.beginPath();
                  context.arc(1.5, -sqrt3/2, 1.5, 2/3*pi, pi);
                  context.arc(-1.5, -sqrt3/2, 1.5, 0, 1/3*pi);
                  context.arc(0, sqrt3, 1.5, 4/3*pi, 5/3*pi);
                  context.stroke();
                  break;
              }
              break;
            case 23: // space ship
              switch (tile_set) {
                case TileSet.Ribbon:
                  context.beginPath();
                  context.arc(0, sqrt3, 1.5, 4/3*pi, 5/3*pi);
                  context.stroke();
                  context.beginPath();
                  context.moveTo(0, sqrt3/2);
                  context.lineTo(0, -sqrt3/2);
                  context.stroke();
                  break;
                case TileSet.Trypo:
                  context.beginPath();
                  context.arc(1.5, -sqrt3/2, 1.5, 2/3*pi, pi);
                  context.arc(-1.5, -sqrt3/2, 1.5, 0, 1/3*pi);
                  context.arc(-0.5, sqrt3/2, 0.5, 4/3*pi, 2*pi);
                  context.arc(0.5, sqrt3/2, 0.5, pi, 5/3*pi);
                  context.stroke();
                  break;
              }
              break;
            case 27: // pisces
              switch (tile_set) {
                case TileSet.Ribbon:
                  context.beginPath();
                  context.moveTo(0.75, sqrt3 / 4);
                  context.lineTo(-0.75, -sqrt3 / 4);
                  context.stroke();
                  context.beginPath();
                  context.moveTo(0, sqrt3/2);
                  context.lineTo(0, -sqrt3/2);
                  context.stroke();
                  break;
                case TileSet.Trypo:
                  context.beginPath();
                  context.arc(-0.5, -sqrt3/2, 0.5, 0, 2/3*pi);
                  context.stroke();
                  context.beginPath();
                  context.arc(0.5, sqrt3/2, 0.5, pi, 5/3*pi);
                  context.stroke();
                  break;
              }
              break;
            case 31: // dragon
              switch (tile_set) {
                case TileSet.Ribbon:
                  context.beginPath();
                  context.arc(0, sqrt3, 1.5, 4/3*pi, 5/3*pi);
                  context.stroke();
                  context.rotate(pi/3);
                  context.beginPath();
                  context.arc(0.5, sqrt3/2, 0.5, pi, 5/3*pi);
                  context.stroke();
                  context.rotate(pi/3);
                  context.beginPath();
                  context.arc(0.5, sqrt3/2, 0.5, pi, 5/3*pi);
                  context.stroke();
                  context.beginPath();
                  context.arc(0, sqrt3, 1.5, 4/3*pi, 5/3*pi);
                  context.stroke();
                  break;
                case TileSet.Trypo:
                  context.beginPath();
                  context.arc(-0.5, -sqrt3/2, 0.5, 0, 2/3*pi);
                  context.arc(-1, 0, 0.5, 5/3*pi, 7/3*pi);
                  context.arc(-0.5, sqrt3/2, 0.5, 4/3*pi, 2*pi);
                  context.arc(0.5, sqrt3/2, 0.5, pi, 5/3*pi);
                  context.stroke();
                  break;
              }
              break;
            case 63: // shuriken
              switch (tile_set) {
                case TileSet.Ribbon:
                  context.beginPath();
                  context.moveTo(0.75, sqrt3 / 4);
                  context.lineTo(-0.75, -sqrt3 / 4);
                  context.stroke();
                  context.beginPath();
                  context.moveTo(0, sqrt3/2);
                  context.lineTo(0, -sqrt3/2);
                  context.stroke();
                  context.beginPath();
                  context.moveTo(0.75, -sqrt3 / 4);
                  context.lineTo(-0.75, sqrt3 / 4);
                  context.stroke();
                  break;
                case TileSet.Trypo:
                  context.beginPath();
                  context.arc(1, 0, 0.5, 2/3*pi, 4/3*pi);
                  context.arc(0.5, -sqrt3/2, 0.5, 1/3*pi, pi);
                  context.arc(-0.5, -sqrt3/2, 0.5, 0, 2/3*pi);
                  context.arc(-1, 0, 0.5, 5/3*pi, 1/3*pi);
                  context.arc(-0.5, sqrt3/2, 0.5, 4/3*pi, 2*pi);
                  context.arc(0.5, sqrt3/2, 0.5, pi, 5/3*pi);
                  context.stroke();
                  break;
              }
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
    return +!!(this.tiles[tile_index][color_index] & direction);
  }

  renderLevel(context: CanvasRenderingContext2D) {
    // tiles
    for (let color_index = 0; color_index < this.color_count; color_index++) {
      // select an appropriate line style and color
      context.lineCap = "round";
      context.lineJoin = "round";
      let endpoint_style: EndpointStyle;
      if (this.color_count === 1) {
        context.strokeStyle = "#000";
        context.lineWidth = line_width_multiplier * level.units_per_tile_x * 0.1;
        endpoint_style = EndpointStyle.LargeRing;
      } else if (this.color_count === 2 && !this.allow_overlap) {
        switch (color_index) {
          case 0:
            context.strokeStyle = "#99f";
            context.lineWidth = line_width_multiplier * level.units_per_tile_x * 0.2;
            endpoint_style = EndpointStyle.LargeDot;
            context.fillStyle = context.strokeStyle;
            break;
          case 1:
            context.strokeStyle = "#c06";
            context.lineWidth = line_width_multiplier * level.units_per_tile_x * 0.075;
            endpoint_style = EndpointStyle.SmallRing;
            break;
          default: throw new AssertionFailure();
        }
      } else if (this.color_count === 2 && this.allow_overlap) {
        switch (color_index) {
          case 0:
            context.strokeStyle = "#e784e1";
            context.lineWidth = line_width_multiplier * level.units_per_tile_x * 0.4;
            context.lineCap = "butt";
            context.lineJoin = "miter";
            endpoint_style = EndpointStyle.LargeDot;
            context.fillStyle = context.strokeStyle;
            break;
          case 1:
            context.strokeStyle = "#000caa";
            context.lineWidth = line_width_multiplier * level.units_per_tile_x * 0.075;
            endpoint_style = EndpointStyle.LargeRing;
            break;
          default: throw new AssertionFailure();
        }
      } else {
        throw new AssertionFailure();
      }

      for (let location of this.allTileIndexes()) {
        const {x, y} = this.getTileCoordFromIndex(location);
        const color_value = this.tiles[location][color_index];
        let tile_rotation_animation = tile_rotation_animations[location];
        let animation_progress = tile_rotation_animation ? tile_rotation_animation.rotation : 0;
        this.renderTiles(context, color_value, x, y, animation_progress, endpoint_style);
      }
    }
  }

  renderAsdfBackground(context: CanvasRenderingContext2D): void {
    // grid lines
    if (game_state !== GameState.SmellTheRoses) {
      context.strokeStyle = "#ddd";
      context.lineWidth = 0.03;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      this.renderGridLines(context);
      context.stroke();
    }

    // tile background
    if (this.cement_mode || this.rough) {
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
    }

  }

  renderAsdfForeground(context: CanvasRenderingContext2D): void {
    // toroidal guide
    if (this.toroidal) {
      let left = this.display_offset_x;
      let right = left + this.tiles_per_row * this.units_per_tile_x;
      let top = this.display_offset_y;
      let bottom = top + this.tiles_per_column * this.units_per_tile_y;
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
    let _tile_set = tile_set;
    if (_tile_set === TileSet.Chaos) {
      _tile_set = [
        TileSet.Trypo,
        TileSet.Ribbon,
        TileSet.Iso,
      ][(hashU32(x) ^ hashU32(y) ^ hashU32(level_number)) % 3];
    }

    if (!this.toroidal) return this.renderTile(context, color_value, x, y, animation_progress, endpoint_style, _tile_set);
    for (let dy of [-1, 0, 1]) {
      for (let dx of [-1, 0, 1]) {
        this.renderTile(context, color_value, x + dx * this.tiles_per_row, y + dy * this.tiles_per_column, animation_progress, endpoint_style, _tile_set);
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
  if (event.altKey || event.ctrlKey) return;
  switch (event.code) {
    case "Escape":
      if (isSidebarShowing()) hideSidebar();
      break;

    // cheatcodes to navigate levels
    case "BracketRight":
      if (event.shiftKey) {
        loadNewLevel({delta: 6});
      } else {
        loadNewLevel({delta: 1});
      }
      break;
    case "BracketLeft":
      if (event.shiftKey) {
        loadNewLevel({delta: -6});
      } else {
        loadNewLevel({delta: -1});
      }
      break;

    // Cheatcode to generate a finished level.
    case "KeyR":
      if (event.shiftKey) {
        loadNewLevel({shuffle_tiles: false});
        checkForDone();
      }
      break;

    case "KeyS":
      if (event.shiftKey) {
        solveLevel(level);
      }
      break;
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

  switch (game_state) {
    case GameState.Playing:
    case GameState.FadeIn:
      // continue
      break;
    case GameState.FadeOut:
    case GameState.FadeToRoses:
      // you can't do anything
      return;
    case GameState.SmellTheRoses:
      // alright, time to move on.
      doFadeOut();
      return;
  }

  const display_x = (event.x - origin_pixel_x) / units_to_pixels;
  const display_y = (event.y - origin_pixel_y) / units_to_pixels;

  const wrapped_display_x = euclideanMod(display_x, level.tiles_per_row * level.units_per_tile_x);
  const wrapped_display_y = euclideanMod(display_y, level.tiles_per_column * level.units_per_tile_y);
  if (!level.toroidal) {
    // make sure the click is in bounds
    if (display_x !== wrapped_display_x || display_y !== wrapped_display_y) return;
  }

  const tile_index = level.getTileIndexFromDisplayPoint(wrapped_display_x, wrapped_display_y);
  if (!clickTile(tile_index)) return;
  animateIntoRotation(tile_index);
});

let tile_rotation_animations: {[index:number]:{rotation:number,handle:number}} = {};
function animateIntoRotation(tile_index: number) {
  const start_time = new Date().getTime();
  const total_time = level.tile_animation_time;
  let existing_animation = tile_rotation_animations[tile_index];
  if (existing_animation) cancelAnimationFrame(existing_animation.handle);
  let animation = {rotation: -1, handle: 0};
  tile_rotation_animations[tile_index] = animation;
  animate();

  function animate() {
    const time_progress = (new Date().getTime() - start_time) / total_time;
    if (time_progress >= 1) {
      delete tile_rotation_animations[tile_index];
      renderEverything();
      return;
    }
    animation.rotation = time_progress - 1;

    renderEverything();
    animation.handle = requestAnimationFrame(animate);
  }
}

// these are calculated below
let units_to_pixels = 100;
// For non-toroidal Square: the origin is the upper-left corner of the upper-left-corner border tile.
let origin_pixel_x = -50;
let origin_pixel_y = -50;
function handleResize() {
  for (let c of all_canvases) {
    c.width = window.innerWidth;
    c.height = window.innerHeight;
  }

  const display_width = level.units_per_tile_x * level.display_tiles_x;
  const display_height = level.units_per_tile_y * level.display_tiles_y;

  const level_aspect_ratio = display_height / display_width;
  const canvas_aspect_ratio = canvas.height / canvas.width;
  units_to_pixels =
    level_aspect_ratio < canvas_aspect_ratio ?
    canvas.width / display_width :
    canvas.height / display_height;

  let center_x = level.units_per_tile_x * level.tiles_per_row / 2;
  let center_y = level.units_per_tile_y * level.tiles_per_column / 2;
  center_x += level.display_offset_x;
  center_y += level.display_offset_y;

  origin_pixel_x = canvas.width / 2 - units_to_pixels * center_x;
  origin_pixel_y = canvas.height / 2 - units_to_pixels * center_y;

  renderEverything();
}

let render_enabled = true;
function renderEverything() {
  if (!render_enabled) return;

  // clear all buffers
  for (let c of all_canvases) {
    let ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
  }

  // transform and render to each buffer
  for (let c of render_target_canvases) {
    let ctx = c.getContext("2d")!;
    ctx.save();
    ctx.translate(origin_pixel_x, origin_pixel_y);
    ctx.scale(units_to_pixels, units_to_pixels);
  }
  try {

    level.renderAsdfBackground(asdf_background_canvas.getContext("2d")!);
    level.renderLevel(tile_canvas.getContext("2d")!);
    level.renderAsdfForeground(asdf_foreground_canvas.getContext("2d")!);

  } finally {
    for (let c of render_target_canvases) {
      let ctx = c.getContext("2d")!;
      ctx.restore();
    }
  }

  // composite
  let composite_context = buffer_canvas.getContext("2d")!;
  composite_context.save();
  try {
    composite_context.globalAlpha = asdf_alpha;
    composite_context.drawImage(asdf_background_canvas, 0, 0);

    composite_context.globalAlpha = 1;
    composite_context.drawImage(tile_canvas, 0, 0);

    composite_context.globalAlpha = asdf_alpha;
    composite_context.drawImage(asdf_foreground_canvas, 0, 0);
  } finally {
    composite_context.restore();
  }

  // render the game into the real canvas with the alpha blend
  const final_context = canvas.getContext("2d")!;
  final_context.save();
  try {
    // gotta fill the background with white using the context
    // instead of css because dark mode makes everything goofy.
    final_context.fillStyle = "#fff";
    final_context.fillRect(0, 0, canvas.width, canvas.height);
    final_context.globalAlpha = global_alpha;
    final_context.drawImage(buffer_canvas, 0, 0);
  } finally {
    final_context.restore();
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

  save();

  return true;
}

function checkForDone() {
  const unsolved_count = level.countUnsolved();
  if (unsolved_count > 0) return;

  if (!is_custom_level && unlocked_level_number <= level_number) {
    // Unlock the next level (in case you want to hit the next level button
    // in the menu instead of smelling the roses).
    unlocked_level_number = level_number + 1;
  }

  // everything is done
  doFadeToRoses();
}

let cancel_state_animation: null | (() => void) = null;
function stopStateAnimation() {
  if (cancel_state_animation) cancel_state_animation();
  cancel_state_animation = null;
}
function setGameState(new_state: GameState) {
  stopStateAnimation();
  global_alpha = 1.0;
  asdf_alpha = 1.0;
  game_state = new_state;

  if (unlocked_level_number < level_number) {
    // Cheatcodes can get us here.
    unlocked_level_number = level_number;
  }
  renderLevelInfoInSidebar();
}

function renderLevelInfoInSidebar() {
  level_down_button.disabled = level_number <= 1;
  if (level_number >= last_level_number) {
    level_number_span.innerText = last_level_number + "+";
    tile_set_div.classList.remove("hidden");
    level_up_button.disabled = true;
  } else if (level_number >= unlocked_level_number) {
    level_number_span.innerText = level_number.toString();
    level_up_button.disabled = true;
  } else {
    level_number_span.innerText = level_number.toString();
    level_up_button.disabled = false;
  }

  custom_colors_select.value = ColorRules[level.colors];
  setElementVisible(custom_colors_div, unlocked_level_number >= 10);
  setElementVisible(custom_color_two_overlap_option, unlocked_level_number >= 14);
  custom_shape_select.value = Shape[level.shape];
  setElementVisible(custom_shape_div, unlocked_level_number >= 6);
  custom_toroidal_checkbox.checked = level.toroidal;
  setElementVisible(custom_toroidal_div, unlocked_level_number >= 16);
  custom_rough_checkbox.checked = level.rough;
  setElementVisible(custom_rough_div, unlocked_level_number >= 11);
  custom_cement_mode_checkbox.checked = level.cement_mode;
  setElementVisible(custom_cement_mode_div, unlocked_level_number >= 22);
  let width = level.tiles_per_row;
  let height = level.tiles_per_column;
  if (!level.toroidal) {
    // Present the size without the border of padding.
    width -= 2;
    height -= 2;
  }
  custom_width_spinner.value = width.toString();
  custom_height_spinner.value = height.toString();
  adjustSpinnerRules();
}
function handleCustomLevelEdited() {
  is_custom_level = true;
  loadNewLevel();
  adjustSpinnerRules();
}
function adjustSpinnerRules() {
  if (is_custom_level) {
    level_number_span.innerText = "Custom";
  }
  setElementVisible(level_up_button, !is_custom_level);
  setElementVisible(level_down_button, !is_custom_level);

  if (level.shape === Shape.Hexagon && level.toroidal) {
    // Prevent the user from getting into the broken combination.
    custom_width_spinner.min = "2";
    custom_width_spinner.step = "2";
    custom_height_spinner.min = "2";
    custom_height_spinner.step = "2";
  } else {
    custom_width_spinner.step = "1";
    custom_width_spinner.min = "1";
    custom_height_spinner.step = "1";
    custom_height_spinner.min = "1";
  }
  rough_label_span.innerText = level.toroidal ? "Locked Island" : "Rough Edges";
}
function setCustomLevelSettingsVisible(visible: boolean) {
  show_custom_level_button.innerText = (visible ? "v" : ">") + " Custom Level";
  setElementVisible(level_settings_div, visible);
}

function doFadeOut() {
  setGameState(GameState.FadeOut);
  const start_time = new Date().getTime();
  animate();

  function animate() {
    assert(game_state === GameState.FadeOut);
    const progress = (new Date().getTime() - start_time) / 1000;
    if (progress < 1) {
      global_alpha = 1 - progress;
      asdf_alpha = 0;
      let handle = requestAnimationFrame(animate);
      cancel_state_animation = function() {
        cancelAnimationFrame(handle);
      };
    } else {
      // done
      advanceToNextLevel();
      doFadeIn();
    }
    renderEverything();
  }
}

function doFadeIn() {
  setGameState(GameState.FadeIn);
  line_width_multiplier = 1.0;
  const start_time = new Date().getTime();
  animate();

  function animate() {
    assert(game_state === GameState.FadeIn);
    const progress = (new Date().getTime() - start_time) / 1000;
    if (progress < 1) {
      global_alpha = progress;
      let handle = requestAnimationFrame(animate);
      cancel_state_animation = function() {
        cancelAnimationFrame(handle);
      };
    } else {
      // done
      setGameState(GameState.Playing);
    }
    renderEverything();
  }
}

function doFadeToRoses() {
  setGameState(GameState.FadeToRoses);
  const start_time = new Date().getTime();
  animate();

  function animate() {
    assert(game_state === GameState.FadeToRoses);
    const progress = (new Date().getTime() - start_time) / 1000;
    if (progress < 1) {
      asdf_alpha = 1 - progress;
      line_width_multiplier = 1.0 + progress * line_width_multiplier_factor * +level.perfect_so_far;
      let handle = requestAnimationFrame(animate);
      cancel_state_animation = function() {
        cancelAnimationFrame(handle);
      };
    } else {
      // done
      setGameState(GameState.SmellTheRoses);
      asdf_alpha = 0;
      line_width_multiplier = 1.0 + line_width_multiplier_factor * +level.perfect_so_far;
    }
    renderEverything();
  }
}

function advanceToNextLevel() {
  render_enabled = false;
  try {
    if (is_custom_level) {
      loadNewLevel();
    } else {
      loadNewLevel({delta: 1});
    }
  } finally {
    render_enabled = true;
  }
  doFadeIn();
}

let level: Level;
function loadNewLevel(opts?: {delta?: number, shuffle_tiles?: boolean}) {
  if (opts?.delta != null) {
    level_number += opts.delta;
    is_custom_level = false;
  } else if (is_custom_level) {
    const parameters: LevelParameters = {
      size: [
        clamp(1, parseInt(custom_width_spinner.value, 10), 20),
        clamp(1, parseInt(custom_height_spinner.value, 10), 20),
      ],
      shape: Shape[custom_shape_select.value as keyof typeof Shape],
      colors: ColorRules[custom_colors_select.value as keyof typeof ColorRules],
      toroidal: custom_toroidal_checkbox.checked,
      cement_mode: custom_cement_mode_checkbox.checked,
      rough: custom_rough_checkbox.checked,
    };

    if (parameters.shape === Shape.Hexagon && parameters.toroidal) {
      // Only even sizes work for this.
      if (parameters.size[0] % 2 === 1) {
        parameters.size[0] += 1;
      }
      if (parameters.size[1] % 2 === 1) {
        parameters.size[1] += 1;
      }
    }

    if (!parameters.toroidal) {
      // UI shows non-padding size
      parameters.size[0] += 2;
      parameters.size[1] += 2;
    }

    parameters.shuffle_tiles = opts?.shuffle_tiles ?? true;

    // Allow perfectable custom levels if they're ... idk ... sufficiently hard enough?
    if (parameters.size[0] >= 6 && parameters.size[1] >= 6 && parameters.toroidal && parameters.cement_mode && (
      // the final level has the hardest color and shape:
      parameters.colors == ColorRules.Single && parameters.shape == Shape.Hexagon ||
      // but we'll allow easier color and shape if you turn off the starter island:
      !parameters.rough
    )) {
      parameters.perfectable = true;
    }

    setCurrentLevel(generateLevel(parameters));
    return;
  }
  setCurrentLevel(getLevelForCurrentLevelNumber(opts?.shuffle_tiles ?? true));
}
function setCurrentLevel(new_level: Level) {
  level = new_level;
  line_width_multiplier = 1.0;
  save();

  // callers can set the state to something else after this.
  setGameState(GameState.Playing);
  handleResize();
}
function getLevelForCurrentLevelNumber(shuffle_tiles: boolean): Level {
  if (level_number < 1) level_number = 1;
  if (level_number > last_level_number) level_number = last_level_number;
  if (!Number.isInteger(level_number)) level_number = 1;

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
  }
  let params = function(): LevelParameters {
    switch (level_number) {
      case 4:
        return {size:[7, 7], shape: Shape.Square, colors: ColorRules.Single};
      case 5:
        return {size:[8, 8], shape: Shape.Square, colors: ColorRules.Single};
      case 6:
        return {size:[5, 5], shape: Shape.Hexagon, colors: ColorRules.Single};
      case 7:
        return {size:[6, 6], shape: Shape.Hexagon, colors: ColorRules.Single};
      case 8:
        return {size:[7, 7], shape: Shape.Hexagon, colors: ColorRules.Single};
      case 9:
        return {size:[8, 8], shape: Shape.Hexagon, colors: ColorRules.Single};
      case 10:
        return {size:[7, 7], shape: Shape.Square, colors: ColorRules.TwoSeparate};
      case 11:
        return {size:[9, 9], shape: Shape.Square, colors: ColorRules.TwoSeparate, rough: true};
      case 12:
        return {size:[6, 6], shape: Shape.Hexagon, colors: ColorRules.TwoSeparate};
      case 13:
        return {size:[8, 8], shape: Shape.Hexagon, colors: ColorRules.TwoSeparate, rough: true};
      case 14:
        return {size:[9, 9], shape: Shape.Square, colors: ColorRules.TwoOverlap};
      case 15:
        return {size:[8, 8], shape: Shape.Hexagon, colors: ColorRules.TwoOverlap, rough: true};

      case 16:
        return {size:[6, 6], shape: Shape.Square, colors: ColorRules.TwoOverlap, toroidal: true, rough: true};
      case 17:
        return {size:[6, 6], shape: Shape.Square, colors: ColorRules.TwoSeparate, toroidal: true, rough: true};
      case 18:
        return {size:[6, 6], shape: Shape.Square, colors: ColorRules.Single, toroidal: true, rough: true};
      case 19:
        return {size:[6, 6], shape: Shape.Hexagon, colors: ColorRules.TwoOverlap, toroidal: true, rough: true};
      case 20:
        return {size:[6, 6], shape: Shape.Hexagon, colors: ColorRules.TwoSeparate, toroidal: true, rough: true};
      case 21:
        return {size:[6, 6], shape: Shape.Hexagon, colors: ColorRules.Single, toroidal: true, rough: true};

      case 22:
        return {size:[10, 10], shape: Shape.Square, colors: ColorRules.TwoOverlap, cement_mode: true, rough: true};
      case 23:
        return {size:[9, 9], shape: Shape.Hexagon, colors: ColorRules.TwoOverlap, cement_mode: true, rough: true};
      case 24:
        return {size:[10, 10], shape: Shape.Square, colors: ColorRules.TwoSeparate, cement_mode: true, rough: true};
      case 25:
        return {size:[9, 9], shape: Shape.Hexagon, colors: ColorRules.TwoSeparate, cement_mode: true, rough: true};
      case 26:
        return {size:[10, 10], shape: Shape.Square, colors: ColorRules.Single, cement_mode: true, rough: true};
      case 27:
        return {size:[9, 9], shape: Shape.Hexagon, colors: ColorRules.Single, cement_mode: true, rough: true};

      case last_level_number:
        // the final challenge
        return {size:[6, 6], shape: Shape.Hexagon, colors: ColorRules.Single, cement_mode: true, toroidal: true, rough: true, perfectable: true};
      default: throw new AssertionFailure();
    }
  }();

  params.shuffle_tiles = shuffle_tiles;
  return generateLevel(params);
}
const last_level_number = 28;

function oneColor(values: number[]): number[][] {
  let result = [];
  for (let value of values) {
    result.push([value]);
  }
  return result;
}

function generateLevel(parameters: LevelParameters, tiles?: number[][]): Level {
  let level = new Level(parameters);
  // mark out of bounds tiles as already frozen
  for (let tile_index of level.allTileIndexes()) {
    if (!level.isInBounds(tile_index)) {
      level.frozen_tiles[tile_index] = true;
    }
  }

  if (level.rough && level.toroidal) {
    // there are no border tiles for rough edges,
    // so freeze some tiles in the center.
    switch (level.shape) {
      case Shape.Square: {
        // 1 tile for odd and 2 for even.
        for (let y = Math.floor((level.tiles_per_column - 1) / 2); y <= Math.floor(level.tiles_per_column / 2); y++) {
          for (let x = Math.floor((level.tiles_per_row - 1) / 2); x <= Math.floor(level.tiles_per_row / 2); x++) {
            const tile_index = level.getTileIndexFromCoord(x, y);
            level.frozen_tiles[tile_index] = true;
          }
        }
        break;
      }
      case Shape.Hexagon: {
        if (level.tiles_per_row & 1) {
          throw new AssertionFailure(); // TODO: odd width hex toroid
        } else {
          if (level.tiles_per_column & 1) {
            throw new AssertionFailure(); // TODO: decide what to do here
          } else {
            level.frozen_tiles[level.getTileIndexFromCoord(level.tiles_per_row / 2 - 1, level.tiles_per_column / 2 - 1)] = true;
            level.frozen_tiles[level.getTileIndexFromCoord(level.tiles_per_row / 2 - 2, level.tiles_per_column / 2 - 1)] = true;
            level.frozen_tiles[level.getTileIndexFromCoord(level.tiles_per_row / 2 - 0, level.tiles_per_column / 2 - 1)] = true;
            level.frozen_tiles[level.getTileIndexFromCoord(level.tiles_per_row / 2 - 1, level.tiles_per_column / 2 - 0)] = true;
          }
        }
        break;
      }
    }
  }

  if (tiles) {
    // tiles already ready to use
    assert(level.tiles_per_row * level.tiles_per_column === tiles.length);
    for (let tile of tiles) {
      assert(tile.length === level.color_count);
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
      const out_of_bounds_count = +!level.isInBounds(vector.tile_index) + +!level.isInBounds(other_tile);
      if (level.rough) {
        if (out_of_bounds_count >= 2) continue;
      } else {
        if (out_of_bounds_count >= 1) continue;
      }
      let edge_value = Math.floor(Math.random() * possible_edge_values);
      for (let color_index = 0; color_index < level.color_count; color_index++) {
        if (edge_value & (1 << color_index)) {
          level.tiles[vector.tile_index][color_index] |= vector.direction;
          level.tiles[other_tile][color_index] |= level.reverseDirection(vector.direction);
        }
      }
    }

    // rotate the tiles randomly
    if (parameters.shuffle_tiles ?? true) {
      for (let tile_index of level.allTileIndexes()) {
        if (!level.frozen_tiles[tile_index]) {
          level.rotateRandomly(tile_index);
        }
      }
    }
  }

  if (parameters.perfectable) {
    level.initializePossibilityForPerfect();
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
function hashU32(input: number): number {
  // https://nullprogram.com/blog/2018/07/31/
  var x = input;
  x ^= x >> 17;
  x *= 0xed5ad4bb;
  x ^= x >> 11;
  x *= 0xac4c1b51;
  x ^= x >> 15;
  x *= 0x31848bab;
  x ^= x >> 14;
  return x;
}
function clamp(min: number, x: number, max: number): number {
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

function setElementVisible(element: HTMLElement, isVisible: boolean) {
  if (isVisible) {
    element.classList.remove("hidden");
  } else {
    element.classList.add("hidden");
  }
}

retry_button.addEventListener("click", function() {
  loadNewLevel();
  hideSidebar();
});
reset_button.addEventListener("click", function() {
  if (confirm("Really start back at level 1?")) {
    level_number = 1;
    is_custom_level = false;
    unlocked_level_number = 1;
    loadNewLevel();
    hideSidebar();
  }
});
tile_set_select.addEventListener("input", function() {
  tile_set = TileSet[tile_set_select.value as keyof typeof TileSet];
  renderEverything();
  save();
});

level_down_button.addEventListener("click", function() {
  loadNewLevel({delta: -1});
});
level_up_button.addEventListener("click", function() {
  loadNewLevel({delta: 1});
});
show_custom_level_button.addEventListener("click", function() {
  if (level_settings_div.classList.contains("hidden")) {
    // Show custom settings.
    setCustomLevelSettingsVisible(true);
    // Don't actually load a custom level until the player touches the controls.
  } else {
    // Back to linear levels.
    setCustomLevelSettingsVisible(false);
    // Immediately load linear levels
    is_custom_level = false;
    loadNewLevel();
  }
});
custom_colors_select.addEventListener("input", handleCustomLevelEdited);
custom_shape_select.addEventListener("input", handleCustomLevelEdited);
custom_toroidal_checkbox.addEventListener("change", handleCustomLevelEdited);
custom_rough_checkbox.addEventListener("change", handleCustomLevelEdited);
custom_cement_mode_checkbox.addEventListener("change", handleCustomLevelEdited);
custom_width_spinner.addEventListener("input", handleCustomLevelEdited);
custom_height_spinner.addEventListener("input", handleCustomLevelEdited);

function getSaveObject(): {[key:string]:any} {
  let save_data_str = window.localStorage.getItem("loops");
  return save_data_str ? JSON.parse(save_data_str) : {};
}
function save() {
  // preserve any unknown properties
  let save_data = getSaveObject();
  save_data.level_number = level_number;
  save_data.is_custom_level = is_custom_level;
  save_data.unlocked_level_number = unlocked_level_number;
  save_data.level = {
    // level parameters
    size: [level.tiles_per_row, level.tiles_per_column],
    shape: level.shape,
    colors: level.colors,
    cement_mode: level.cement_mode,
    toroidal: level.toroidal,
    rough: level.rough,
    // we don't care about perfectable when we're loading state.
    // game state
    tiles: level.tiles,
    frozen_tiles: level.frozen_tiles,
    recent_touch_queue: level.recent_touch_queue,
    original_tiles: level.original_tiles,
    perfect_so_far: level.perfect_so_far,
  };
  save_data.tile_set = tile_set_select.value;
  window.localStorage.setItem("loops", JSON.stringify(save_data));
}

// restore state from localStorage
(function () {
  let save_data = getSaveObject();
  level_number = save_data.level_number || 1;
  is_custom_level = save_data.is_custom_level || false;
  if (save_data.unlocked_level_number != null) {
    // Version 1.5+
    unlocked_level_number = save_data.unlocked_level_number;
  } else {
    // The upgrade to version 1.5 swapped levels 16-21 with levels 22-27
    // to introduce toroidal topology before cement mode.
    if (16 <= level_number && level_number <= 27) {
      // Sorry buddy.
      alert(
        `New version of Loops released! Levels 16-27 have been updated, ` +
        `so your progress through level ${level_number} unfortunately cannot be loaded. :( ` +
        `You've been set back to level 16. Please enjoy the new sequence of levels! ` +
        `(And don't forget to check the sidebar for cool new stuff!) :)`
      );
      level_number = 16;
      delete save_data.level;
    }
    unlocked_level_number = level_number;
  }

  tile_set = TileSet[save_data.tile_set as keyof typeof TileSet] ?? TileSet.Trypo;
  tile_set_select.value = TileSet[tile_set];

  function loadLevelData(): Level | null {
    // the validation in this function is limited to preserving the invariants in our code.
    // this does not check to see if the level is beatable.
    if (typeof save_data.level !== 'object') return null;

    // LevelParameters
    let size = save_data.level.size;
    if (!Array.isArray(size)) return null;
    if (size.length !== 2) return null;
    for (let x of size) {
      if (!Number.isInteger(x)) return null;
      if (!(2 <= x && x <= 20)) return null;
    }

    let shape = save_data.level.shape as Shape;
    if (typeof Shape[shape] !== 'string') return null;

    let colors = save_data.level.colors as ColorRules;
    if (typeof ColorRules[colors] !== 'string') return null;

    let cement_mode = save_data.level.cement_mode;
    if (typeof cement_mode !== 'boolean') return null;

    let toroidal = save_data.level.toroidal;
    if (typeof toroidal !== 'boolean') return null;

    let rough = save_data.level.rough;
    if (typeof rough !== 'boolean') return null;

    // we don't care about perfectable if we're loading state.

    let level_parameters: LevelParameters = {
      size, shape, colors, cement_mode, toroidal, rough,
    };

    // game state
    let tiles = save_data.level.tiles;
    if (!Array.isArray(tiles)) return null;
    if (tiles.length !== size[0] * size[1]) return null;
    let color_count = (function(): number {
      switch (colors) {
        case ColorRules.Single: return 1;
        case ColorRules.TwoSeparate: return 2;
        case ColorRules.TwoOverlap: return 2;
        default: throw new AssertionFailure();
      }
    })();
    let color_mask = (function(): number {
      switch (shape) {
        case Shape.Square: return (1 << 4) - 1;
        case Shape.Hexagon: return (1 << 6) - 1;
        default: throw new AssertionFailure();
      }
    })();
    for (let x of tiles) {
      if (!Array.isArray(x)) return null;
      if (x.length !== color_count) return null;
      for (let i = 0; i < x.length; i++) {
        let c = x[i];
        if (!Number.isInteger(c)) return null;
        // rather than checking the value, just clamp it into validity.
        x[i] = c & color_mask;
      }
    }

    let frozen_tiles = save_data.level.frozen_tiles;
    if (typeof frozen_tiles !== 'object') return null;
    // don't need to type check anything else about frozen_tiles

    let recent_touch_queue = save_data.level.recent_touch_queue;
    if (!Array.isArray(recent_touch_queue)) return null;
    if (recent_touch_queue.length > 3) return null;
    // don't need to be careful about what's in the queue.

    let perfect_so_far = false;
    let original_tiles = save_data.level.original_tiles;
    if (original_tiles != null) {
      if (!Array.isArray(original_tiles)) return null;
      if (original_tiles.length !== size[0] * size[1]) return null;
      for (let x of original_tiles) {
        if (!Array.isArray(x)) return null;
        // not much checking we have to do beyond that.
      }

      perfect_so_far = save_data.level.perfect_so_far;
      if (typeof perfect_so_far !== "boolean") return null;
    }

    // json reading complete. everything looks good.
    let loaded_level = new Level(level_parameters);
    loaded_level.tiles = tiles;
    loaded_level.frozen_tiles = frozen_tiles;
    loaded_level.recent_touch_queue = recent_touch_queue;
    loaded_level.original_tiles = original_tiles;
    loaded_level.perfect_so_far = perfect_so_far;

    return loaded_level;
  }

  let loaded_level = loadLevelData();
  if (loaded_level != null) {
    level = loaded_level;
    setGameState(GameState.Playing);
    handleResize();
    checkForDone();
    setCustomLevelSettingsVisible(is_custom_level);
  } else {
    loadNewLevel();
  }
})();
