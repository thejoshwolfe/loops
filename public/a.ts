const canvas = document.getElementById("canvas")! as HTMLCanvasElement;
const footer = document.getElementById("footer")!;

const pi = Math.PI;

// a tile is a bitfield:
//   8
// 4   1
//   2

var tiles = [
  0,0,0,0,
  0,3,4,0,
  0,9,4,0,
  0,0,0,0,
];
var tiles_per_row = 4;
var tiles_per_column = tiles.length / tiles_per_row;

window.addEventListener("resize", function() {
  handleResize();
});
canvas.addEventListener("mousedown", function(event: MouseEvent) {
  if (event.altKey || event.ctrlKey || event.shiftKey) {
    return;
  }
  event.preventDefault();
  const tile_x = Math.floor((event.x - origin_x) / scale);
  const tile_y = Math.floor((event.y - origin_y) / scale);
  rotateTile(tile_x, tile_y);
});

// these are calculated below
var scale = 100;
var origin_x = -50;
var origin_y = -50;
function handleResize() {
  canvas.width = document.documentElement.clientWidth;
  canvas.height = document.documentElement.clientHeight - footer.clientHeight;

  // cut off half of the border tiles
  const display_tiles_per_column = tiles_per_column - 1;
  const display_tiles_per_row = tiles_per_row - 1;

  const tile_aspect_ratio = display_tiles_per_column / display_tiles_per_row;
  const canvas_aspect_ratio = canvas.height / canvas.width;
  scale =
    tile_aspect_ratio < canvas_aspect_ratio ?
    canvas.width / display_tiles_per_row :
    canvas.height / display_tiles_per_column;

  origin_x = canvas.width / 2 - scale * tiles_per_row / 2;
  origin_y = canvas.height / 2 - scale * tiles_per_column / 2;

  drawIt();
}

function drawIt() {
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "#000";
  context.lineWidth = scale * 0.1;
  context.lineCap = "round";
  for (var y = 0; y < tiles_per_column; y++) {
    for (var x = 0; x < tiles_per_row; x++) {
      const tile = tiles[tileIndex(x, y)];
      context.save();
      try {
        renderTile(tile, x, y);
      } finally {
        context.restore();
      }
    }
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
      case 5: throw new AssertionFailure(); // TODO
      case 6: tile = 3; context.rotate(pi/2); break;
      case 7: throw new AssertionFailure(); // TODO
      case 8: tile = 1; context.rotate(pi*1.5); break;
      case 9: tile = 3; context.rotate(pi*1.5); break;
      case 10: throw new AssertionFailure(); // TODO
      case 11: throw new AssertionFailure(); // TODO
      case 12: tile = 3; context.rotate(pi); break;
      case 13: throw new AssertionFailure(); // TODO
      case 14: throw new AssertionFailure(); // TODO
      case 15: throw new AssertionFailure(); // TODO
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
      default:
        throw new AssertionFailure(); // TODO
    }
  }
}

function tileIndex(x: number, y: number): number {
  return y * tiles_per_row + x;
}

function rotateTile(x: number, y: number) {
  if (x <= 0 || x >= tiles_per_row - 1 ||
      y <= 0 || y >= tiles_per_column - 1) {
    // out of bounds
    return;
  }
  const index = tileIndex(x, y);
  var tile = tiles[index];
  tile = 0xf & ((tile << 1) | (tile >> 3));
  tiles[index] = tile;
  drawIt();
}
class AssertionFailure {}

handleResize();
