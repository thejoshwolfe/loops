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
  void [event.x, event.y]; // TODO
  drawIt();
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
  console.log(origin_x, origin_y);

  drawIt();
}

function drawIt() {
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (var y = 0; y < tiles_per_column; y++) {
    for (var x = 0; x < tiles_per_row; x++) {
      const tile = tiles[y * tiles_per_row + x];
      context.fillStyle = tile === 0 ? "#888" : "#000";
      context.beginPath();
      context.arc(origin_x + scale*(x + 0.5), origin_y + scale*(y + 0.5), scale/2, 0, 2*pi);
      context.fill();
    }
  }
}

handleResize();
