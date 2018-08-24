const canvas = document.getElementById("canvas")! as HTMLCanvasElement;
const pi = Math.PI;

canvas.addEventListener("mousedown", function(event: MouseEvent) {
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, 500, 500);

  context.fillStyle = "#000";
  context.beginPath();
  context.arc(event.x, event.y, 20, 0, 2*pi);
  context.fill();
});

