// Render the pop-up map the way screen.js draws it, and write a PNG you can
// look at.
//
//   node mockups/mappng.mjs out/map.png
//
// The game map is a canvas inside the app, and there is no browser tool here
// that can open the running app and photograph it — so the only way to SEE
// whether the map is legible is to draw it again outside the browser. This
// caught the first design, where the district circles covered half the city and
// six of the twelve labels landed on top of each other.
//
// The colour table is READ OUT OF screen.js rather than copied into here, so
// what this shows cannot drift from what the game actually draws. The label
// placement below is a copy and CAN drift — if you change it in screen.js,
// change it here too, or this stops being evidence.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(APP, 'docs/js/game/screen.js'), 'utf8');
const table = src.match(/const MAP_COLOUR = \{([\s\S]*?)\n\};/)[1];
const MAP_COLOUR = Function(`return {${table.replace(/\/\/.*$/gm, '')}}`)();
console.log('colours read from screen.js:', Object.keys(MAP_COLOUR).length);

// the world
const CONTENT = join(APP, '..', 'fluidez-es-ni', 'content', 'game');
if (!existsSync(CONTENT)) {
  console.log('no content checkout beside this repo — nothing to draw');
  process.exit(0);
}
let missions = [], crowd = [];
for (const f of readdirSync(CONTENT)) {
  if (f.endsWith('.json')) {
    const m = JSON.parse(readFileSync(join(CONTENT, f), 'utf8'));
    if (m.beats) missions.push(m);
  }
}
for (const f of readdirSync(join(CONTENT, 'crowd'))) {
  if (!f.endsWith('.json')) continue;
  JSON.parse(readFileSync(join(CONTENT, 'crowd', f), 'utf8'))
    .forEach((row, i) => crowd.push({ ...row, id: `crowd-${f.slice(0, -5)}-${i}` }));
}
const { createWorld, TS } = await import(new URL('../docs/js/game/world.js', import.meta.url));
const world = createWorld({ missions, crowd });
const { W, H, grid, districts, S } = world;

// The panel is about 360 px wide on a phone; the canvas fits inside it.
const OUT_W = 360, k = OUT_W / W, OUT_H = Math.round(H * k);
const px = new Uint8Array(OUT_W * OUT_H * 3).fill(20);
const hex = (h) => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
const CACHE = {};
for (const key of Object.keys(MAP_COLOUR)) CACHE[key] = hex(MAP_COLOUR[key]);
const FALLBACK = hex('#2A241F');

// Area-average the tiles that fall in each output pixel — which is what the
// browser's smoothed drawImage does when it shrinks the city.
for (let oy = 0; oy < OUT_H; oy++) {
  const y0 = Math.floor(oy / k), y1 = Math.min(H, Math.floor((oy + 1) / k));
  for (let ox = 0; ox < OUT_W; ox++) {
    const x0 = Math.floor(ox / k), x1 = Math.min(W, Math.floor((ox + 1) / k));
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < Math.max(y1, y0 + 1); y++) {
      for (let x = x0; x < Math.max(x1, x0 + 1); x++) {
        const c = CACHE[grid[y * W + x]] || FALLBACK;
        r += c[0]; g += c[1]; b += c[2]; n++;
      }
    }
    const i = (oy * OUT_W + ox) * 3;
    px[i] = r / n; px[i+1] = g / n; px[i+2] = b / n;
  }
}

const put = (x, y, c, a = 1) => {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= OUT_W || y >= OUT_H) return;
  const i = (y * OUT_W + x) * 3;
  px[i] = px[i] * (1 - a) + c[0] * a;
  px[i+1] = px[i+1] * (1 - a) + c[1] * a;
  px[i+2] = px[i+2] * (1 - a) + c[2] * a;
};
const ring = (cx, cy, rad, c) => {
  for (let a = 0; a < 360; a++) {
    const t = a * Math.PI / 180;
    put(cx + Math.cos(t) * rad, cy + Math.sin(t) * rad, c);
  }
};
const disc = (cx, cy, rad, c, a) => {
  for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++)
    if (x*x + y*y <= rad*rad) put(cx + x, cy + y, c, a);
};

const GOLD = hex('#E8A33D'), CREAM = hex('#F4E9D6'), JADE = hex('#34B396');
const NAME = {
  centro: 'El Centro', mercado: 'El Mercado', xalteva: 'Xalteva',
  guadalupe: 'Guadalupe', pantanal: 'Pantanal', terminal: 'La Terminal',
  trabajo: 'El trabajo', tramites: 'Trámites', malecon: 'El Malecón',
  fiestas: 'Las fiestas', afuera: 'Afuera', barrio: 'Tu barrio',
};
// Mirrors the label placement in openMap so the collisions are visible here.
const CHAR = 5.4;   // ~10px semibold sans, average advance
const pins = Object.keys(districts).map((key) => ({
  key, name: NAME[key] || key, x: districts[key].x * k, y: districts[key].y * k,
})).sort((a, b) => a.y - b.y);
const placed = [];
for (const p of pins) {
  const half = (p.name.length * CHAR) / 2 + 3;
  let ly = p.y - 9;
  for (let i = 0; i < 40; i++) {
    if (!placed.some((q) => Math.abs(q.y - ly) < 11 && Math.abs(q.x - p.x) < q.half + half)) break;
    ly += (i % 2 ? -1 : 1) * (11 + Math.floor(i / 2) * 2);
  }
  p.ly = ly; p.half = half;
  placed.push({ x: p.x, y: ly, half });
}
for (const p of pins) {
  // the label box, so overlap is obvious to the eye
  for (let y = -5; y <= 5; y++) for (let x = -p.half; x <= p.half; x++) put(p.x + x, p.ly + y, CREAM, 0.55);
  disc(p.x, p.y, 3, GOLD, 1);
  console.log(`  ${p.key.padEnd(10)} pin ${p.x.toFixed(0).padStart(3)},${p.y.toFixed(0).padStart(3)}  label y ${p.ly.toFixed(0)} (moved ${(p.ly - (p.y - 9)).toFixed(0)})`);
}
disc((S.px / TS) * k, (S.py / TS) * k, 3, CREAM, 1);

// PNG
const raw = Buffer.alloc((OUT_W * 3 + 1) * OUT_H);
for (let y = 0; y < OUT_H; y++) {
  raw[y * (OUT_W * 3 + 1)] = 0;
  Buffer.from(px.buffer, y * OUT_W * 3, OUT_W * 3).copy(raw, y * (OUT_W * 3 + 1) + 1);
}
const crcT = [];
for (let n = 0; n < 256; n++) { let c = n; for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
const crc = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, cc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(OUT_W, 0); ihdr.writeUInt32BE(OUT_H, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
]);
const dest = process.argv[2];
writeFileSync(dest, png);
console.log(`\nwrote ${dest}  ${OUT_W} x ${OUT_H}`);
