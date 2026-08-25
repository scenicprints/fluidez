// Granada — the world itself: the map, the people in it and the traffic.
//
// This is the mockup's engine (mockups/granada.html) lifted into the app with
// the DOM taken out. Nothing here touches an element: it decodes the map,
// places everybody, moves the player, drives the traffic and paints tiles into
// whatever 2D context it is handed. The screen around it lives in screen.js.
//
// The map and the placement table are GENERATED — see scripts/osm_granada.py
// and scripts/game_bake.py. The missions and the street crowd arrive in the
// content pack like every other bit of course content.

import { MAPDATA } from './map.js';
import { PLACE, DISTRICT } from './place.js';

export const TS = 16;

// Tile ids are the contract with the generator: add at the end, never renumber.
export const GROUND = 0, COBBLE = 1, GRASS = 2, TREE = 3, WATER = 4, SHORE = 5,
  ROOF = 6, WALL = 7, DOOR = 8, PLAZA = 9, FOUNT = 10, AWNING = 11, TABLE = 12,
  KERB = 13, TOWER = 14, SAND = 15, PATIO = 16, PALM = 17, ASPHALT = 18,
  DIRT = 19, SCRUB = 20, PITCH = 21, GRAVE = 22, CHURCH = 23, CWALL = 24,
  WALLTOP = 25;

// A grave is a stone in the grass, not a wall: you can walk through the
// cemetery, which is just as well because a mission is buried in it.
export const SOLID = new Set([TREE, WATER, ROOF, WALL, FOUNT, AWNING, TABLE,
  TOWER, PATIO, PALM, CHURCH, CWALL, WALLTOP]);

// Granada's painted facades. Ochre, teal, rose, indigo, cream — the real thing.
const FACES = ['#D89A4E', '#3E8E8A', '#C4685F', '#5B6BA8', '#E3CFA3', '#B98F5A', '#7FA05C'];
const ROOFS = ['#A8503A', '#96462F', '#B25C40', '#8E4030'];

// ── decoding ────────────────────────────────────────────────
const COD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const VAL = new Int16Array(128).fill(-1);
for (let i = 0; i < 64; i++) VAL[COD.charCodeAt(i)] = i;

// Five bits to a character, top bit says another follows. The city is half a
// megabyte packed like this and would be four as JSON.
function reader(s) {
  let i = 0;
  return () => {
    let n = 0, sh = 1, c;
    do { c = VAL[s.charCodeAt(i++)]; n += (c & 31) * sh; sh *= 32; } while (c & 32);
    return n;
  };
}
const unzig = (n) => (n & 1) ? -((n + 1) / 2) : n / 2;

function inflate(str, len) {
  const out = new Uint8Array(len), rd = reader(str);
  for (let i = 0; i < len;) { const v = rd(), n = rd(); out.fill(v, i, i + n); i += n; }
  return out;
}

let MAP = null;

/** Decoded once per session and kept — it is half a megabyte of city. */
export function loadMap() {
  if (MAP) return MAP;
  const L = MAPDATA.trim().split('\n');
  const [W, H] = L[0].split(',').map(Number);
  const grid = inflate(L[1], W * H), tint = inflate(L[2], W * H);

  let rd = reader(L[3]);
  const nn = rd(), nodes = new Int32Array(nn * 2);
  for (let i = 0, px = 0, py = 0; i < nn; i++) {
    px += unzig(rd()); py += unzig(rd());
    nodes[i * 2] = px; nodes[i * 2 + 1] = py;
  }

  const [clsNames, edgeBlob] = L[4].split('|');
  const cls = clsNames.split(',');
  rd = reader(edgeBlob);
  const ne = rd(), edges = [], at = [];
  for (let i = 0; i < nn; i++) at.push([]);
  for (let e = 0; e < ne; e++) {
    const a = rd(), b = rd(), c = cls[rd()], np = rd();
    const pts = new Int16Array(np * 2);
    for (let i = 0, px = 0, py = 0; i < np; i++) {
      px = i ? px + unzig(rd()) : unzig(rd());
      py = i ? py + unzig(rd()) : unzig(rd());
      pts[i * 2] = px; pts[i * 2 + 1] = py;
    }
    let len = 0;
    for (let i = 1; i < np; i++)
      len += Math.hypot((pts[i*2] - pts[i*2-2]) * TS, (pts[i*2+1] - pts[i*2-1]) * TS);
    if (len < 1) continue;
    at[a].push(edges.length); at[b].push(edges.length);
    edges.push({ a, b, cls: c, pts, np, len, mx: pts[0] * TS, my: pts[1] * TS });
  }
  MAP = { W, H, grid, tint, nodes, edges, at, spots: JSON.parse(L[5]) };
  return MAP;
}

// ── traffic ─────────────────────────────────────────────────
// Granada moves, and a city that does not is a diorama. The traffic drives the
// real street graph the tiles were painted from, so a caponera turns where
// there is really a corner. It brakes for you and honks and it never hits you:
// a language game with a fail state teaches you to avoid the street where all
// the people are.
export const KINDS = [
  { id: 'caponera', l: 13, w: 8,  body: '#C7382C', top: '#EFC24C', wheels: 3, sp: .042, main: false, weight: 32 },
  { id: 'moto',     l: 10, w: 5,  body: '#2E2A38', top: '#8FA9C9', wheels: 2, sp: .055, main: false, weight: 26 },
  { id: 'bici',     l: 9,  w: 4,  body: '#3E8E8A', top: '#D8A87C', wheels: 2, sp: .026, main: false, weight: 13 },
  { id: 'taxi',     l: 17, w: 9,  body: '#E0A32E', top: '#2B2B2B', wheels: 4, sp: .050, main: false, weight: 11 },
  { id: 'camioneta',l: 19, w: 9,  body: '#5B6BA8', top: '#46527F', wheels: 4, sp: .046, main: false, weight: 8 },
  { id: 'bus',      l: 34, w: 12, body: '#C4685F', top: '#E3CFA3', wheels: 6, sp: .038, main: true,  weight: 6 },
  { id: 'coche',    l: 18, w: 8,  body: '#6B4A2E', top: '#E8D9B5', wheels: 2, sp: .018, main: false, weight: 4 },
  // Weight 0: never joins the traffic, because there is no road graph on the
  // water. It is here so a mission can be AT one.
  { id: 'lancha',   l: 22, w: 8,  body: '#7A6A52', top: '#C9B896', wheels: 0, sp: .020, main: false, weight: 0 },
];
const MAIN = { trunk: 1, trunk_link: 1, primary: 1, secondary: 1, secondary_link: 1, tertiary: 1 };
const KIND_BAG = [];
for (const k of KINDS) for (let i = 0; i < k.weight; i++) KIND_BAG.push(k);

const FLEET = 22;      // simulated at once, near you
const KEEP = 1400;     // px from the player before one is recycled

// ── the world ───────────────────────────────────────────────

/**
 * @param missions  the mission list out of the content pack
 * @param crowd     the street crowd out of the content pack
 * @param finished  ids already done, so their bubbles start jade
 */
export function createWorld({ missions = [], crowd = [], finished = {} } = {}) {
  const map = loadMap();
  const { W, H, grid, tint } = map;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? WALL : grid[y * W + x];
  // An empty name used to match the FIRST spot in the list, so a mission with a
  // district nobody recognises was silently placed at whatever spot 0 happened
  // to be instead of falling through to the fallback below it.
  const spot = (name) => (name ? map.spots.find((s) => s.n.indexOf(name) === 0) : null);

  function walkable(tx, ty) {
    for (let r = 0; r < 60; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = tx + dx, y = ty + dy;
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
        if (!SOLID.has(at(x, y))) return { x, y };
      }
    }
    return { x: tx, y: ty };
  }

  // You start on the south side of Parque Central looking at the cathedral,
  // which is where anybody who has just arrived in Granada ends up standing.
  const pc = spot('Parque Central') || { x: 565, y: 506 };
  const START = walkable(pc.x, pc.y + 9);

  // The city you can actually get to, flooded once from where you start.
  //
  // A tile that is merely not solid is not good enough: the blocks here
  // enclose their yards, so the nearest standable tile to a doorway is often
  // inside the block, and somebody placed there can be seen and never reached.
  const REACH = (() => {
    const seen = new Uint8Array(W * H), st = [START.y * W + START.x];
    seen[st[0]] = 1;
    while (st.length) {
      const i = st.pop(), x = i % W, y = (i / W) | 0;
      if (x > 0     && !seen[i-1] && !SOLID.has(grid[i-1])) { seen[i-1] = 1; st.push(i-1); }
      if (x < W - 1 && !seen[i+1] && !SOLID.has(grid[i+1])) { seen[i+1] = 1; st.push(i+1); }
      if (y > 0     && !seen[i-W] && !SOLID.has(grid[i-W])) { seen[i-W] = 1; st.push(i-W); }
      if (y < H - 1 && !seen[i+W] && !SOLID.has(grid[i+W])) { seen[i+W] = 1; st.push(i+W); }
    }
    return seen;
  })();

  /**
   * Is this pixel position somewhere you could actually be standing?
   *
   * The saved position is handed straight back to you on resume, and the map is
   * regenerated whenever the city is rebuilt — so the spot you logged off in can
   * come back as the inside of a wall. Every direction then fails `canGo` and
   * you are frozen for good, with a stick that still works. The screen checks
   * this and drops you back at the start rather than into a wall.
   */
  function canStand(px, py) {
    if (!Number.isFinite(px) || !Number.isFinite(py)) return false;
    const tx = Math.floor(px / TS), ty = Math.floor(py / TS);
    if (tx < 1 || ty < 1 || tx >= W - 1 || ty >= H - 1) return false;
    return !!REACH[ty * W + tx];
  }

  /**
   * Is a whole PERSON clear here, not just the point they stand on?
   *
   * A person is about ten pixels across and their head is fourteen above their
   * feet, on sixteen-pixel tiles. Testing the middle point alone let a walker
   * stand with their centre legally on the last strip of a pavement and their
   * body over the roof next door or out across the water — which is exactly
   * what it looked like. The player has always been tested at four corners;
   * so is everybody else now.
   */
  function bodyFits(px, py) {
    if (!canStand(px, py)) return false;
    const solidAt = (x, y) => SOLID.has(at(Math.floor(x / TS), Math.floor(y / TS)));
    return !solidAt(px - 4, py + 4) && !solidAt(px + 4, py + 4) &&
           !solidAt(px - 4, py - 12) && !solidAt(px + 4, py - 12);
  }

  const taken = new Set([START.x + ',' + START.y]);
  function standing(tx, ty) {
    for (let r = 0; r < 70; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = tx + dx, y = ty + dy;
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
        if (!REACH[y * W + x] || taken.has(x + ',' + y)) continue;
        taken.add(x + ',' + y);
        return { x, y };
      }
    }
    return { x: tx, y: ty };
  }

  // Skin and shirt drawn from the id, so a face never changes between sessions.
  const SKIN = ['#B9825A', '#8A5C3A', '#D8A87C', '#A06E48', '#6E4A30', '#C08E63'];
  const SHIRT = ['#4C7FB5', '#C4685F', '#3E8E8A', '#E3CFA3', '#5B6BA8', '#D89A4E',
                 '#7FA05C', '#B0554E'];
  const hash = (s) => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h;
  };
  const pick = (arr, key) => arr[hash(key) % arr.length];

  // ── everybody in the city ───────────────────────────────
  const people = [];
  for (const m of missions) {
    const p = PLACE[m.id] || { at: DISTRICT[m.district], dx: 0, dy: 0 };
    const anchor = spot(p.at) || spot(DISTRICT[m.district] || '') || pc;
    const w = standing(anchor.x + (p.dx || 0), anchor.y + (p.dy || 0));
    people.push({
      id: m.id, crowd: false, district: m.district, mission: m,
      name: m.who, goal: m.goal, culture: m.culture, beats: m.beats,
      idle: (m.beats[0] || {}).es || '',
      vehicle: p.vehicle || null, driver: !!p.vehicle,
      skin: pick(SKIN, m.id), shirt: pick(SHIRT, m.who),
      x: w.x, y: w.y,
    });
  }
  // The crowd. There are no map markers and Granada has no usable street
  // names, so these ARE the quest system.
  // Spread as wide as the missions are. A district's people are placed a few
  // hundred metres across now, so a crowd huddled inside seventy metres of the
  // anchor would be a knot of hint-givers in the middle of an area with nobody
  // in the rest of it — you would get every direction in one spot and then walk
  // the district alone.
  const ring = [[13,9],[-15,11],[11,-13],[-13,-11],[21,0],[0,19],[-23,2],[4,-23],
                [25,15],[-25,-15],[17,-19],[-19,17]];
  crowd.forEach((h, j) => {
    const anchor = spot(DISTRICT[h.district] || '') || pc;
    const [ox, oy] = ring[j % ring.length];
    const w = standing(anchor.x + ox + (j % 5) * 6 - 12, anchor.y + oy + (j % 3) * 8 - 8);
    people.push({
      id: h.id || ('crowd-' + j), crowd: true, district: h.district,
      name: h.kind, says: h.says, en: h.en, points_at: h.points_at || [],
      skin: pick(SKIN, h.says), shirt: pick(SHIRT, h.kind),
      x: w.x, y: w.y,
    });
  });

  // ── districts, for the arrow ────────────────────────────
  // The arrow points at the DISTRICT and stops once you are inside it, because
  // finding the actual person is meant to be done by asking somebody. So a
  // district needs a centre and a radius, and both are computed from where its
  // missions actually ended up rather than guessed.
  const districts = {};
  for (const p of people) {
    if (p.crowd || !p.district) continue;
    (districts[p.district] || (districts[p.district] = { list: [] })).list.push(p);
  }
  for (const key of Object.keys(districts)) {
    const d = districts[key], n = d.list.length;
    d.x = d.list.reduce((a, p) => a + p.x, 0) / n;
    d.y = d.list.reduce((a, p) => a + p.y, 0) / n;
    // The radius covers MOST of the district, not its furthest straggler.
    //
    // Taking the maximum let one outlier set it for everybody: the man who
    // looks after the cemetery is a kilometre west of the church, and he has
    // to be, so Xalteva's radius came out at 185 tiles — nearly a mile — and
    // the arrow switched off while you were still in the middle of town. The
    // third quartile is the district as it actually is, and the straggler is
    // then found the way everything else is, by asking somebody.
    const away = d.list.map((p) => Math.hypot(p.x - d.x, p.y - d.y)).sort((a, b) => a - b);
    const q3 = away[Math.min(away.length - 1, Math.floor(away.length * 0.75))];
    d.r = Math.max(28, Math.min(q3 + 14, 120));
  }

  // ── state ───────────────────────────────────────────────
  const S = {
    px: START.x * TS + 8, py: START.y * TS + 8, dir: 0, step: 0, moving: false,
    finished: { ...finished },
    traffic: [], walkers: [],
  };

  // ── street life ─────────────────────────────────────────
  // Granada is 1089 x 885 tiles and the 248 people who have something to say
  // stand in twelve tight knots inside it. Walk out of one and the city is
  // 2,000 screenfuls of empty street with cars on it — which is exactly what it
  // felt like. These are the people who are just going somewhere.
  //
  // They are deliberately NOT talkable, and they carry no bubble. The rule the
  // game already teaches is "a bubble means somebody has something to say", so
  // a passer-by without one is unambiguous rather than a disappointment. They
  // do not block you either: being body-checked by scenery is worse than empty
  // streets. `nearest()` only ever looks at `people`, so pressing A near one
  // does nothing at all.
  // The numbers matter more than they look. A phone shows about 290 x 416 px of
  // city, which is 2.5% of a disc 1250 px across — so the first attempt, with
  // eighteen people spread over that disc, put 0.4 of a person on screen and
  // the street still read as deserted.
  //
  // Then forty was too many: Kevin, "I think there are too many to be honest."
  // Granada is a quiet provincial city, not a rush hour. Sixteen puts two or
  // three in view at a time — enough that the street is never dead, few enough
  // that the ones with something to say still stand out.
  const FOLK = 16;          // simulated at once, near you
  const FOLK_KEEP = 520;    // px from the player before one is recycled
  const FOLK_NEAR = 300;    // a recycled one comes back from off screen

  /**
   * @param anywhere  true only for the first fill. You should arrive to a
   *   street that already has people on it, so the opening crop is seeded
   *   across the whole disc — including the part you can see. After that they
   *   always come back from off screen, because somebody blinking into
   *   existence in front of you is worse than an empty pavement.
   */
  function seedWalker(w, anywhere) {
    for (let tries = 0; tries < 30; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = anywhere
        ? Math.sqrt(Math.random()) * (FOLK_KEEP - 40)     // sqrt: evenly by AREA
        : FOLK_NEAR + Math.random() * (FOLK_KEEP - FOLK_NEAR - 40);
      const px = S.px + Math.cos(ang) * rad, py = S.py + Math.sin(ang) * rad;
      if (!bodyFits(px, py)) continue;
      w.px = px; w.py = py;
      w.skin = SKIN[(Math.random() * SKIN.length) | 0];
      w.shirt = SHIRT[(Math.random() * SHIRT.length) | 0];
      // Most people are walking; a few are standing about, which is also true.
      w.sp = Math.random() < 0.18 ? 0 : 0.020 + Math.random() * 0.022;
      w.ang = Math.random() * Math.PI * 2;
      w.turn = 600 + Math.random() * 2200;
      w.step = Math.random() * 6;
      return true;
    }
    return false;
  }

  function folk(dt) {
    const first = S.walkers.length === 0;
    while (S.walkers.length < FOLK) {
      const w = {};
      if (!seedWalker(w, first)) break;
      S.walkers.push(w);
    }
    for (const w of S.walkers) {
      if (Math.hypot(w.px - S.px, w.py - S.py) > FOLK_KEEP) { seedWalker(w, false); continue; }
      if (!w.sp) continue;
      w.turn -= dt;
      if (w.turn <= 0) { w.ang += (Math.random() - 0.5) * 1.6; w.turn = 700 + Math.random() * 2400; }
      const nx = w.px + Math.cos(w.ang) * w.sp * dt;
      const ny = w.py + Math.sin(w.ang) * w.sp * dt;
      // Corners are turned, not walked through. Try the whole step, then each
      // axis on its own, so a wall makes somebody slide along it like a person
      // rather than stop dead against it.
      if (bodyFits(nx, ny)) {
        w.px = nx; w.py = ny;
      } else if (bodyFits(nx, w.py)) {
        w.px = nx;
        w.ang = Math.cos(w.ang) > 0 ? 0 : Math.PI;          // slide along the wall
      } else if (bodyFits(w.px, ny)) {
        w.py = ny;
        w.ang = Math.sin(w.ang) > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        w.ang += 1.4 + Math.random();                        // cornered: turn away
      }
      w.step += dt * 0.012;
    }
  }

  // ── traffic simulation ──────────────────────────────────
  function pointOn(e, d) {
    let acc = 0;
    for (let i = 1; i < e.np; i++) {
      const x0 = e.pts[i*2-2] * TS + 8, y0 = e.pts[i*2-1] * TS + 8;
      const x1 = e.pts[i*2] * TS + 8,   y1 = e.pts[i*2+1] * TS + 8;
      const seg = Math.hypot(x1 - x0, y1 - y0);
      if (acc + seg >= d || i === e.np - 1) {
        const f = seg ? Math.max(0, Math.min(1, (d - acc) / seg)) : 0;
        return { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f,
                 ang: Math.atan2(y1 - y0, x1 - x0) };
      }
      acc += seg;
    }
    return { x: e.pts[0]*TS+8, y: e.pts[1]*TS+8, ang: 0 };
  }

  function seed(v, near) {
    for (let tries = 0; tries < 40; tries++) {
      const e = map.edges[(Math.random() * map.edges.length) | 0];
      if (!e) break;
      if (v.kind.main && !MAIN[e.cls]) continue;
      if (!v.kind.main && e.cls === 'service') continue;
      const d = Math.hypot(e.mx - S.px, e.my - S.py);
      if (near && (d < 260 || d > 1150)) continue;
      v.e = e; v.d = Math.random() * e.len; v.way = Math.random() < .5 ? 1 : -1;
      v.stopped = 0; v.honk = 0;
      return true;
    }
    return false;
  }

  function traffic(dt) {
    while (S.traffic.length < FLEET) {
      const v = { kind: KIND_BAG[(Math.random() * KIND_BAG.length) | 0] };
      if (!seed(v, S.traffic.length > 2)) break;
      S.traffic.push(v);
    }
    for (const v of S.traffic) {
      if (!v.e) { seed(v, true); continue; }
      const p = pointOn(v.e, v.d);
      v.x = p.x; v.y = p.y; v.ang = v.way > 0 ? p.ang : p.ang + Math.PI;
      if (Math.hypot(v.x - S.px, v.y - S.py) > KEEP) { seed(v, true); continue; }

      const ahead = 10 + v.kind.l * .6;
      const ax = v.x + Math.cos(v.ang) * ahead, ay = v.y + Math.sin(v.ang) * ahead;
      let blocked = Math.hypot(ax - S.px, ay - S.py) < 13;
      if (blocked && v.honk <= 0 && Math.random() < .04) v.honk = 900;
      if (!blocked) for (const o of S.traffic) {
        if (o !== v && o.x !== undefined &&
            Math.hypot(ax - o.x, ay - o.y) < 11 + o.kind.w * .5) { blocked = true; break; }
      }
      if (v.honk > 0) v.honk -= dt;
      if (blocked) { v.stopped += dt; continue; }
      v.stopped = 0;

      v.d += v.kind.sp * dt * v.way;
      if (v.d > v.e.len || v.d < 0) {
        const node = v.d < 0 ? v.e.a : v.e.b;
        const outs = map.at[node] || [];
        const pickable = outs.filter((i) => map.edges[i] !== v.e);
        const next = map.edges[pickable.length
          ? pickable[(Math.random() * pickable.length) | 0] : outs[0]];
        if (!next) { seed(v, true); continue; }
        v.way = (next.a === node) ? 1 : -1;
        v.d = v.way > 0 ? 0 : next.len;
        v.e = next;
      }
    }
  }

  // You cannot walk through a bus. It stops for you, so this is a nudge rather
  // than a wall, but walking through one would look ridiculous.
  function vehicleAt(x, y) {
    for (const v of S.traffic) {
      if (v.x === undefined) continue;
      const dx = x - v.x, dy = y - v.y;
      if (Math.abs(dx) + Math.abs(dy) > 40) continue;
      const c = Math.cos(-v.ang), s2 = Math.sin(-v.ang);
      const lx = dx * c - dy * s2, ly = dx * s2 + dy * c;
      if (Math.abs(lx) < v.kind.l / 2 + 2 && Math.abs(ly) < v.kind.w / 2 + 2) return true;
    }
    return false;
  }

  // ── movement ────────────────────────────────────────────
  const blocked = (x, y) =>
    SOLID.has(at(Math.floor(x / TS), Math.floor(y / TS))) || vehicleAt(x, y);
  const canGo = (x, y) =>
    !blocked(x - 4, y + 4) && !blocked(x + 4, y + 4) &&
    !blocked(x - 4, y - 2) && !blocked(x + 4, y - 2);

  /**
   * @param vec  where the stick is pushed: x and y each -1..1, already
   *             scaled by how far it is pushed. A keyboard hands over a
   *             normalised (±1, ±1); a thumb hands over anything in between,
   *             which is what lets you walk slowly along a pavement instead of
   *             barrelling everywhere at one speed.
   */
  function move(dt, vec) {
    // The city is five and a half kilometres across at five metres to a tile,
    // so full push is about twenty times real walking — the usual lie a
    // top-down game tells, and the alternative is a six-minute walk to the
    // market.
    const sp = dt * 0.105;
    const vx = Math.max(-1, Math.min(1, (vec && vec.x) || 0));
    const vy = Math.max(-1, Math.min(1, (vec && vec.y) || 0));
    const dx = vx * sp, dy = vy * sp;
    if (Math.abs(vx) > Math.abs(vy)) S.dir = vx < 0 ? 2 : 3;
    else if (vy) S.dir = vy < 0 ? 1 : 0;
    S.moving = !!(dx || dy);
    if (!S.moving) { S.step = 0; return; }
    // Feet keep up with the pace, so a slow walk is not a sprint animation.
    S.step += dt * 0.35 * Math.min(1, Math.hypot(vx, vy));
    if (canGo(S.px + dx, S.py)) S.px += dx;
    if (canGo(S.px, S.py + dy)) S.py += dy;
    S.px = Math.max(6, Math.min(W * TS - 6, S.px));
    S.py = Math.max(10, Math.min(H * TS - 4, S.py));
  }

  function nearest() {
    let best = null, bd = 26;
    for (const n of people) {
      const d = Math.hypot(n.x * TS + 8 - S.px, n.y * TS + 8 - S.py);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  /** Which district you are standing in, or null out between them. */
  function districtNow() {
    let best = null, bd = Infinity;
    for (const key of Object.keys(districts)) {
      const d = districts[key];
      const dist = Math.hypot(S.px / TS - d.x, S.py / TS - d.y);
      if (dist < d.r && dist < bd) { bd = dist; best = key; }
    }
    return best;
  }

  return {
    map, S, people, districts, TS, W, H, at, spot,
    move, traffic, folk, nearest, districtNow, pointOn, canStand, bodyFits, START,
    tint, grid, FACES, ROOFS,
  };
}
