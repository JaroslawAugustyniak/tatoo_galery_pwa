// Generuje ikony PWA (PNG) z prostego SVG. Uruchom: npm run icons
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0a0a0a"/>
  <g transform="translate(256 256) scale(${pad}) translate(-256 -256)" fill="none" stroke="#e5e5e5" stroke-width="22" stroke-linecap="round">
    <circle cx="256" cy="256" r="150"/>
    <path d="M256 140c40 50 40 90 0 130-40-40-40-80 0-130zM256 270v100"/>
  </g>
</svg>`;

mkdirSync("public/icons", { recursive: true });
for (const [name, size, pad] of [
  ["icon-192.png", 192, 1],
  ["icon-512.png", 512, 1],
  ["icon-maskable-512.png", 512, 0.7],
]) {
  await sharp(Buffer.from(svg(pad))).resize(size, size).png().toFile(`public/icons/${name}`);
}
console.log("Icons generated");
