// Renders the app icons (PNG) from an inline SVG with the preinstalled Playwright Chromium.
// Usage: node tools/make_icons.cjs
const { chromium } = require("playwright");
const path = require("path");
const out = path.join(__dirname, "..", "icons");

const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  <rect width="100" height="100" fill="#ffd60a"/>
  <g transform="translate(${pad} ${pad}) scale(${(100 - 2 * pad) / 100})">
    <polygon points="29,1 71,1 99,29 99,71 71,99 29,99 1,71 1,29" fill="#0b0b0b"/>
    <polygon points="32,7 68,7 93,32 93,68 68,93 32,93 7,68 7,32" fill="none" stroke="#ffffff" stroke-width="3"/>
    <rect x="30" y="34" width="5" height="32" fill="#fff"/><rect x="39" y="34" width="2.5" height="32" fill="#fff"/>
    <rect x="45" y="34" width="6" height="32" fill="#fff"/><rect x="55" y="34" width="2.5" height="32" fill="#fff"/>
    <rect x="61" y="34" width="4" height="32" fill="#fff"/><rect x="68" y="34" width="2.5" height="32" fill="#fff"/>
  </g></svg>`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const [name, size, pad] of [["icon-192.png", 192, 12], ["icon-512.png", 512, 12], ["apple-touch-icon.png", 180, 14], ["maskable-512.png", 512, 22]]) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0">${svg(pad)}</body></html>`);
    await p.screenshot({ path: path.join(out, name), clip: { x: 0, y: 0, width: size, height: size } });
  }
  await b.close();
  console.log("icons written");
})();
