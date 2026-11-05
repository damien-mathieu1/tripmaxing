const TILE = 1024;
const STARS = 420;

/** A seamless star tile, drawn once and reused as a CSS background. */
export function starTile() {
  const canvas = document.createElement("canvas");
  canvas.width = TILE;
  canvas.height = TILE;
  const context = canvas.getContext("2d")!;
  for (let i = 0; i < STARS; i++) {
    const big = Math.random() < 0.08;
    context.fillStyle = `rgb(${big ? "210 225 255" : "255 255 255"} / ${0.25 + Math.random() * 0.75})`;
    context.beginPath();
    context.arc(
      Math.random() * TILE,
      Math.random() * TILE,
      big ? 1.1 + Math.random() : 0.35 + Math.random() * 0.55,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  return canvas.toDataURL("image/png");
}
