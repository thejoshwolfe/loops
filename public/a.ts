const canvas = document.getElementById("canvas")! as HTMLCanvasElement;
const footer = document.getElementById("footer")!;

const pi = Math.PI;

var tiles = [
  0,0,0,0,
  0,9,4,0,
  0,3,4,0,
  0,0,0,0,
];
var tiles_per_row = 4;
var tiles_per_column = tiles.length / tiles_per_row;

window.addEventListener("resize", function() {
  handleResize();
});
canvas.addEventListener("mousedown", function(event: MouseEvent) {
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

  for (var y = 0; y < tiles_per_column; y++) {
    for (var x = 0; x < tiles_per_row; x++) {
      const tile = tiles[tileIndex(x, y)];
      context.fillStyle = "#000";
      context.lineWidth = scale * 0.1;
      context.lineCap = "round";
      if (tile & 1) {
        context.beginPath();
        context.moveTo(origin_x + scale*(x + 0.5), origin_y + scale*(y + 0.5));
        context.lineTo(origin_x + scale*(x + 1.0), origin_y + scale*(y + 0.5));
        context.stroke();
      }
      if (tile & 2) {
        context.beginPath();
        context.moveTo(origin_x + scale*(x + 0.5), origin_y + scale*(y + 0.5));
        context.lineTo(origin_x + scale*(x + 0.5), origin_y + scale*(y + 1.0));
        context.stroke();
      }
      if (tile & 4) {
        context.beginPath();
        context.moveTo(origin_x + scale*(x + 0.5), origin_y + scale*(y + 0.5));
        context.lineTo(origin_x + scale*(x + 0.0), origin_y + scale*(y + 0.5));
        context.stroke();
      }
      if (tile & 8) {
        context.beginPath();
        context.moveTo(origin_x + scale*(x + 0.5), origin_y + scale*(y + 0.5));
        context.lineTo(origin_x + scale*(x + 0.5), origin_y + scale*(y + 0.0));
        context.stroke();
      }
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

handleResize();
