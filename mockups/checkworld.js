// Runs the real Granada out of granada.html in Node and checks it holds up.
//
//     node mockups/checkworld.js
//
// checkbeats.py checks the Spanish in the mockup. This checks the city: that
// the map data survived being packed and injected, that the street graph the
// traffic drives on is connected to itself, that a thousand frames of traffic
// leaves no vehicle in a wall or off the map, and that nobody -- player or
// NPC -- has been placed inside a building.
//
// It exists because the mockup cannot be played from here. No browser tool
// available can deliver a keypress into a sandboxed artifact, so the choice
// is between reading the code and hoping, or running the code and knowing.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const HTML = path.join(__dirname, 'granada.html');
const src = fs.readFileSync(HTML, 'utf8');

// ── pull the script out and give it a browser to run in ──────────────────
const m = src.match(/<script>([\s\S]*)<\/script>/);
if (!m) fail('no <script> in granada.html');
let js = m[1];

// The mockup is one IIFE and exports nothing, which is right for a mockup and
// useless for a test, so the harness adds a hatch just before it closes.
const HOOK = `
globalThis.__probe = { MAP, TRAFFIC, KINDS, traffic, S, NPCS, W, H, grid, tint,
  SOLID, at, walkable, spot, MAPDATA, chunk, paintChunk, CH, CHX, CHY,
  vehicleAt, blocked, pointOn };
`;
const close = js.lastIndexOf('})();');
if (close < 0) fail('cannot find the end of the IIFE');
js = js.slice(0, close) + HOOK + js.slice(close);

const noop = () => {};
const el = () => new Proxy({}, {
  get(t, k) {
    if (k === 'classList') return { add: noop, remove: noop, toggle: noop };
    if (k === 'querySelectorAll') return () => [];
    if (k === 'getBoundingClientRect') return () => ({ width: 420, height: 300 });
    if (k === 'getContext') return () => ctx2d();
    if (k === 'style') return {};
    if (k === 'addEventListener') return noop;
    if (k === 'focus') return noop;
    if (k === 'dataset') return {};
    return t[k] === undefined ? noop : t[k];
  },
  set(t, k, v) { t[k] = v; return true; },
});
// A canvas context that counts what it is asked to draw and swallows the rest.
const drew = { fillRect: 0, drawImage: 0, arc: 0, fillText: 0 };
function ctx2d() {
  return new Proxy({}, {
    get(t, k) {
      if (k in drew) return () => { drew[k]++; };
      if (k === 'measureText') return () => ({ width: 10 });
      return t[k] === undefined ? noop : t[k];
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
globalThis.document = {
  getElementById: el, createElement: el, querySelectorAll: () => [],
  addEventListener: noop,
};
globalThis.window = globalThis;
globalThis.ResizeObserver = class { observe() {} };
globalThis.addEventListener = noop;
globalThis.requestAnimationFrame = noop;   // the loop is driven by hand below
globalThis.performance = { now: () => Date.now() };
globalThis.devicePixelRatio = 2;

const problems = [];
function check(ok, what, detail) {
  if (!ok) problems.push(detail ? `${what} -- ${detail}` : what);
  return ok;
}
function fail(msg) { console.log('PROBLEM: ' + msg); process.exit(1); }

try {
  new Function(js)();
} catch (e) {
  fail('granada.html threw while loading: ' + e.message + '\n' + (e.stack || ''));
}
const P = globalThis.__probe;
if (!P) fail('the probe hook did not run');

// ── 1. the map data survived packing and injection ───────────────────────
const lines = P.MAPDATA.trim().split('\n');
check(lines.length === 7, 'map data has seven lines', `got ${lines.length}`);
const sig = JSON.parse(lines[6]);
check(P.W === sig.w && P.H === sig.h, 'grid is the size the generator says',
      `${P.W}x${P.H} vs ${sig.w}x${sig.h}`);
check(P.grid.length === sig.w * sig.h, 'every tile decoded',
      `${P.grid.length} of ${sig.w * sig.h}`);
const crcTiles = zlib.crc32 ? zlib.crc32(Buffer.from(P.grid)) : null;
if (crcTiles !== null) {
  check(crcTiles === sig.tiles, 'terrain decodes to exactly what was packed',
        `crc ${crcTiles} vs ${sig.tiles}`);
  check(zlib.crc32(Buffer.from(P.tint)) === sig.tint, 'facade colours decode');
}
let solid = 0;
for (let i = 0; i < P.grid.length; i++) if (P.SOLID.has(P.grid[i])) solid++;
check(solid === sig.solid, 'the same tiles are solid on both sides',
      `${solid} vs ${sig.solid}`);
check(P.MAP.nodes.length / 2 === sig.nodes, 'every street node decoded');
check(P.MAP.edges.length > sig.edges * 0.95, 'the street graph is all there',
      `${P.MAP.edges.length} of ${sig.edges}`);
check(P.MAP.spots.length === sig.spots, 'the named places are all there');

// ── 2. the city is the real one ──────────────────────────────────────────
for (const name of ['Parque Central', 'Catedral', 'Mercado Municipal',
                    'Iglesia de Xalteva', 'Fortaleza La Polvora']) {
  check(!!P.spot(name), `${name} is on the map`);
}
let water = 0;
for (let i = 0; i < P.grid.length; i++) if (P.grid[i] === 4) water++;
check(water > 50000, 'Cocibolca is there', `${water} tiles of water`);
const pc = P.spot('Parque Central');
if (pc) {
  // the lake is east of the city, so the shore must be east of the plaza
  let eastWater = 0, westWater = 0;
  for (let y = 0; y < P.H; y += 4) for (let x = 0; x < P.W; x += 4)
    if (P.grid[y * P.W + x] === 4) (x > pc.x ? eastWater++ : westWater++);
  check(eastWater > westWater * 20, 'the lake is east of Parque Central',
        `${eastWater} east / ${westWater} west`);
}

// ── 3. nobody is standing inside a building ──────────────────────────────
const tileAt = (px, py) => P.at(Math.floor(px / 16), Math.floor(py / 16));
check(!P.SOLID.has(tileAt(P.S.px, P.S.py)), 'you do not start inside a wall',
      `tile ${tileAt(P.S.px, P.S.py)}`);
for (const n of P.NPCS) {
  check(n.x > 0 && n.y > 0 && n.x < P.W && n.y < P.H, `${n.id} is on the map`);
  check(!P.SOLID.has(P.at(n.x, n.y)), `${n.id} is standing somewhere you can reach`,
        `tile ${P.at(n.x, n.y)} at ${n.x},${n.y}`);
  const d = Math.hypot(n.x * 16 - P.S.px, n.y * 16 - P.S.py);
  check(d < 4000, `${n.id} is not on the other side of the city`, `${d | 0}px`);
}

// ── 4. the street graph joins up ─────────────────────────────────────────
let dead = 0, orphan = 0;
for (const e of P.MAP.edges) {
  if (!P.MAP.at[e.a] || !P.MAP.at[e.b]) { orphan++; continue; }
  if (P.MAP.at[e.a].length < 2 && P.MAP.at[e.b].length < 2) dead++;
}
check(orphan === 0, 'every street edge has both its ends', `${orphan} orphaned`);
check(dead < P.MAP.edges.length * 0.12, 'streets mostly join other streets',
      `${dead} of ${P.MAP.edges.length} join nothing`);

// ── 5. a thousand frames of traffic ──────────────────────────────────────
let offmap = 0, nan = 0, moved = 0, honks = 0;
const start = new Map();
for (let f = 0; f < 1000; f++) {
  P.traffic(16);
  for (const v of P.TRAFFIC) {
    if (v.x === undefined) continue;
    if (!isFinite(v.x) || !isFinite(v.y) || !isFinite(v.ang)) nan++;
    if (v.x < 0 || v.y < 0 || v.x > P.W * 16 || v.y > P.H * 16) offmap++;
    if (v.honk > 0) honks++;
    if (!start.has(v)) start.set(v, [v.x, v.y]);
  }
}
check(P.TRAFFIC.length > 10, 'the streets have traffic on them',
      `${P.TRAFFIC.length} vehicles`);
check(nan === 0, 'no vehicle went to NaN', `${nan} frames`);
check(offmap === 0, 'no vehicle drove off the map', `${offmap} frames`);
for (const [v, p0] of start) {
  if (Math.hypot(v.x - p0[0], v.y - p0[1]) > 8) moved++;
}
check(moved > P.TRAFFIC.length * 0.6, 'the traffic actually moves',
      `${moved} of ${P.TRAFFIC.length} got anywhere`);
// every vehicle should be on something you could drive on
const DRIVEABLE = new Set([1, 9, 13, 18, 19, 0, 15, 2, 20, 22, 8]);
let offroad = 0;
for (const v of P.TRAFFIC) {
  if (v.x === undefined) continue;
  if (!DRIVEABLE.has(tileAt(v.x, v.y))) offroad++;
}
check(offroad <= 2, 'the traffic is on the streets, not through the houses',
      `${offroad} of ${P.TRAFFIC.length} off road`);
const kinds = new Set(P.TRAFFIC.map((v) => v.kind.id));
check(kinds.size >= 3, 'more than one kind of thing is driving about',
      [...kinds].join(', '));

// Stand in the road and they should brake for you rather than drive through
// you, and sooner or later one of them leans on the horn.
let braked = 0;
const wasX = P.S.px, wasY = P.S.py;
for (let f = 0; f < 1500 && !honks; f++) {
  // park the player on top of whichever vehicle is nearest, in its way
  const v = P.TRAFFIC.find((x) => x.x !== undefined);
  if (!v) break;
  P.S.px = v.x + Math.cos(v.ang) * 12; P.S.py = v.y + Math.sin(v.ang) * 12;
  P.traffic(16);
  if (v.stopped > 0) braked++;
  if (v.honk > 0) honks++;
}
P.S.px = wasX; P.S.py = wasY;
check(braked > 0, 'traffic brakes for somebody standing in the road', `${braked} frames`);
check(honks > 0, 'and eventually honks at them');

// ── 6. the renderer draws something for every chunk it is asked for ──────
const before = drew.fillRect;
for (let i = 0; i < 6; i++) P.chunk(i * 7 % P.CHX, i * 5 % P.CHY);
check(drew.fillRect - before > 3000, 'chunks paint tiles',
      `${drew.fillRect - before} fills for six chunks`);

// ── 7. the player cannot walk into the lake or a house ───────────────────
let blockedWater = 0, samples = 0;
for (let y = 0; y < P.H; y += 37) for (let x = 0; x < P.W; x += 37) {
  if (P.grid[y * P.W + x] === 4) { samples++; if (P.blocked(x * 16 + 8, y * 16 + 8)) blockedWater++; }
}
check(samples === 0 || blockedWater === samples, 'the lake is not walkable',
      `${blockedWater} of ${samples}`);

// ── say how it went ──────────────────────────────────────────────────────
const facts = [
  `city      ${P.W} x ${P.H} tiles, ${(P.W * 5 / 1000).toFixed(2)} x ${(P.H * 5 / 1000).toFixed(2)} km`,
  `streets   ${P.MAP.nodes.length / 2} junctions, ${P.MAP.edges.length} stretches of road`,
  `traffic   ${P.TRAFFIC.length} vehicles, ${[...kinds].join(', ')}`,
  `honks     ${honks} frames of somebody leaning on the horn at you`,
  `places    ${P.MAP.spots.length} named, e.g. ${P.MAP.spots.slice(0, 3).map((s) => s.n).join('; ')}`,
  `data      ${(P.MAPDATA.length / 1024) | 0} KB packed`,
];
console.log(facts.join('\n'));
if (problems.length) {
  for (const p of problems) console.log('PROBLEM: ' + p);
  process.exit(1);
}
console.log(`checks    ${problems.length ? '' : 'all clean'}`);
