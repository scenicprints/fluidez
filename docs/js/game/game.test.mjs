// Checks Granada as the app actually runs it.
//
//   node docs/js/game/game.test.mjs
//
// mockups/checkworld.js does this for the mockup, which is a different file
// with a copy of the engine in it. This one loads the REAL modules — world.js,
// draw.js and screen.js — against the REAL mission data out of the content
// pack, behind a stub DOM.
//
// It exists because the game cannot be played from here: no browser tool
// available can deliver a keypress into the app, so the choice is between
// reading the code and hoping, or running the code and knowing.

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS = join(HERE, '..', '..');

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
};

// ── a browser, more or less ─────────────────────────────────
const drew = { fillRect: 0, drawImage: 0, arc: 0, fillText: 0, roundRect: 0 };
const ctx2d = () => new Proxy({}, {
  get(t, k) {
    if (k in drew) return () => { drew[k]++; };
    if (k === 'measureText') return () => ({ width: 10 });
    return t[k] === undefined ? () => {} : t[k];
  },
  set(t, k, v) { t[k] = v; return true; },
});
const nodes = new Map();
const makeEl = (id) => {
  const listeners = {};
  const node = {
    id, width: 0, height: 0, textContent: '', innerHTML: '', style: {},
    dataset: {}, disabled: false,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    // left/top matter: the stick works out its centre from this, and without
    // them every pointer position came out NaN and the knob never moved.
    getBoundingClientRect: () => (id === 'gameStick'
      ? { left: 20, top: 600, width: 132, height: 132, right: 152, bottom: 732 }
      : { left: 0, top: 0, width: 390, height: 560, right: 390, bottom: 560 }),
    getContext: () => ctx2d(),
    addEventListener: (ev, fn) => { (listeners[ev] || (listeners[ev] = [])).push(fn); },
    querySelectorAll: () => [],
    appendChild() {}, removeChild() {}, focus() {},
    fire: (ev, extra) => {
      let prevented = false;
      const e = { preventDefault() { prevented = true; }, ...(extra || {}) };
      (listeners[ev] || []).forEach((f) => f(e));
      return prevented;
    },
    setPointerCapture() {}, releasePointerCapture() {},
    listenerCount: (ev) => (listeners[ev] || []).length,
    get firstChild() { return null; },
  };
  return node;
};
globalThis.document = {
  getElementById: (id) => nodes.get(id) || (nodes.set(id, makeEl(id)), nodes.get(id)),
  createElement: () => makeEl('canvas'),
  querySelectorAll: () => [],
  addEventListener() {},
};
globalThis.window = globalThis;
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.addEventListener = () => {};
globalThis.cancelAnimationFrame = () => {};
globalThis.requestAnimationFrame = () => 0;      // the loop is driven by hand
globalThis.performance = { now: () => Date.now() };
globalThis.devicePixelRatio = 2;
globalThis.localStorage = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    get length() { return m.size; },
    key: (i) => [...m.keys()][i],
    [Symbol.iterator]() { return m.keys(); },
  };
})();
Object.defineProperty(globalThis.localStorage, 'length', { get: () => 0 });

const { createWorld, TS, SOLID, KINDS } = await import('./world.js');
const { createPainter } = await import('./draw.js');

// ── the real missions, out of the content repo ──────────────
// Read straight out of the sibling checkout, so this tests the actual
// missions rather than a fixture that could drift from them. With no content
// repo beside this one it skips rather than failing, so a fresh clone of just
// the app still passes CI.
const { readdirSync } = await import('node:fs');
const CONTENT = join(DOCS, '..', '..', 'fluidez-es-ni', 'content', 'game');
let missions = [], crowd = [];
if (existsSync(CONTENT)) {
  for (const f of readdirSync(CONTENT)) {
    if (f.endsWith('.json')) {
      const m = JSON.parse(readFileSync(join(CONTENT, f), 'utf8'));
      if (m.beats) missions.push(m);
    }
  }
  const cdir = join(CONTENT, 'crowd');
  if (existsSync(cdir)) {
    for (const f of readdirSync(cdir)) {
      if (!f.endsWith('.json')) continue;
      JSON.parse(readFileSync(join(cdir, f), 'utf8'))
        .forEach((row, i) => crowd.push({ ...row, id: `crowd-${f.slice(0, -5)}-${i}` }));
    }
  }
}

if (!missions.length) {
  console.log('no content checkout beside this repo — skipping');
  process.exit(0);
}

// ── the world ───────────────────────────────────────────────
const world = createWorld({ missions, crowd });
const painter = createPainter(world);

test('the whole city decoded', () => {
  assert.equal(world.W, 1089);
  assert.equal(world.H, 885);
  assert.equal(world.grid.length, world.W * world.H);
});

test('every mission and every crowd line is standing in it', () => {
  const m = world.people.filter((p) => !p.crowd);
  const c = world.people.filter((p) => p.crowd);
  assert.equal(m.length, missions.length, `${m.length} of ${missions.length} missions`);
  assert.equal(c.length, crowd.length);
});

test('nobody is inside a wall', () => {
  for (const p of world.people) {
    assert.ok(!SOLID.has(world.at(p.x, p.y)),
      `${p.id} is standing on tile ${world.at(p.x, p.y)}`);
  }
});

test('nobody is standing on anybody', () => {
  const seat = new Map();
  for (const p of world.people) {
    const k = p.x + ',' + p.y;
    assert.ok(!seat.has(k), `${p.id} is on top of ${seat.get(k)}`);
    seat.set(k, p.id);
  }
});

test('you can walk to every single one of them', () => {
  // The blocks here enclose their yards, so a tile that is not solid is not
  // necessarily a tile you can reach. Flood the city from the spawn.
  const { W, H, grid, S } = world;
  const seen = new Uint8Array(W * H);
  const st = [Math.floor(S.py / TS) * W + Math.floor(S.px / TS)];
  seen[st[0]] = 1;
  while (st.length) {
    const i = st.pop(), x = i % W, y = (i / W) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1,
                     y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
      if (j < 0 || seen[j] || SOLID.has(grid[j])) continue;
      seen[j] = 1; st.push(j);
    }
  }
  for (const p of world.people) {
    assert.equal(seen[p.y * W + p.x], 1, `${p.id} (${p.name}) is walled in`);
  }
});

test('every district has a centre and a sane radius', () => {
  const keys = Object.keys(world.districts);
  assert.equal(keys.length, 12, `${keys.length} districts`);
  for (const k of keys) {
    const d = world.districts[k];
    assert.ok(Number.isFinite(d.x) && Number.isFinite(d.y), `${k} has no centre`);
    // The arrow switches off inside the radius, so a district the size of the
    // city would switch it off everywhere.
    assert.ok(d.r > 10 && d.r < 260, `${k} radius is ${d.r.toFixed(0)} tiles`);
  }
});

test('the district you are standing in is the one you are standing in', () => {
  for (const key of Object.keys(world.districts)) {
    const d = world.districts[key];
    world.S.px = d.x * TS; world.S.py = d.y * TS;
    assert.equal(world.districtNow(), key, `stood at the middle of ${key}`);
  }
  // Out in the lake you are in no district at all, which is what makes the
  // arrow come back.
  world.S.px = 1050 * TS; world.S.py = 300 * TS;
  assert.equal(world.districtNow(), null);
});

test('a thousand frames of traffic stays on the road', () => {
  const start = world.spot('Parque Central');
  world.S.px = start.x * TS; world.S.py = (start.y + 9) * TS;
  const DRIVEABLE = new Set([0, 1, 2, 8, 9, 13, 15, 18, 19, 20, 22]);
  let offroad = 0, nan = 0;
  for (let f = 0; f < 1000; f++) {
    world.traffic(16);
    for (const v of world.S.traffic) {
      if (v.x === undefined) continue;
      if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) nan++;
      const t = world.at(Math.floor(v.x / TS), Math.floor(v.y / TS));
      if (!DRIVEABLE.has(t)) offroad++;
    }
  }
  assert.equal(nan, 0);
  assert.ok(world.S.traffic.length > 8, `${world.S.traffic.length} vehicles`);
  assert.ok(offroad < 40, `${offroad} vehicle-frames off the road`);
});

const PUSH = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
               left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

test('walls stop you, from anywhere you can legitimately stand', () => {
  // Start where the player really starts and walk hard in each direction for
  // a few seconds. Wherever you end up must be somewhere you could stand.
  const start = world.spot('Parque Central');
  for (const dir of Object.keys(PUSH)) {
    world.S.px = start.x * TS + 8; world.S.py = (start.y + 9) * TS + 8;
    for (let i = 0; i < 200; i++) world.move(16, PUSH[dir]);
    const tile = world.at(Math.floor(world.S.px / TS), Math.floor(world.S.py / TS));
    assert.ok(!SOLID.has(tile), `walking ${dir} ended on a solid tile (${tile})`);
  }
});

test('the stick is analog — half a push walks half as far', () => {
  // Somewhere with real room to walk, found rather than assumed: measuring a
  // pace against a wall measures the wall.
  const open = (() => {
    const pc = world.spot('Parque Central');
    for (let r = 0; r < 200; r++) {
      for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
        const x = pc.x + dx, y = pc.y + dy;
        let clear = true;
        for (let j = -3; j <= 3 && clear; j++)
          for (let i = -3; i <= 3 && clear; i++)
            if (SOLID.has(world.at(x + i, y + j))) clear = false;
        if (clear) return { x, y };
      }
    }
    return pc;
  })();
  const walk = (mag) => {
    world.S.px = open.x * TS + 8; world.S.py = open.y * TS + 8;
    const from = world.S.px;
    for (let i = 0; i < 20; i++) world.move(16, { x: mag, y: 0 });
    return Math.abs(world.S.px - from);
  };
  const full = walk(1), half = walk(0.5);
  assert.ok(full > 0, 'a full push moved nowhere');
  assert.ok(Math.abs(half - full / 2) < full * 0.15,
    `half a push went ${half.toFixed(1)}px against a full ${full.toFixed(1)}px`);
  // And a stick at rest is a person at rest.
  world.move(16, { x: 0, y: 0 });
  assert.equal(world.S.moving, false);
});

test('the painter paints', () => {
  const n = drew.fillRect;
  painter.frame(ctx2d(), 0, 390, 560, 1.35);
  assert.ok(drew.fillRect - n > 200, `${drew.fillRect - n} fills in a frame`);
});

// ── the beats, as the app will grade them ───────────────────
const norm = (s) => String(s || '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[¿?¡!.,;:"'()«»]/g, ' ').replace(/\s+/g, ' ').trim();

test('every beat is winnable with the app\'s own grader', () => {
  for (const m of missions) {
    for (let i = 0; i < m.beats.length; i++) {
      const b = m.beats[i], where = `${m.id} beat ${i + 1}`;
      const said = norm(b.tiles.join(' '));
      assert.ok(b.ok.some((a) => norm(a) === said), `${where}: "${said}" is refused`);
      const pool = new Set(norm(b.tiles.concat(b.extra || []).join(' ')).split(' '));
      for (const a of b.ok) {
        for (const w of norm(a).split(' ')) {
          assert.ok(pool.has(w), `${where}: "${a}" needs "${w}", not in the tray`);
        }
      }
      // The give-up path finds each chunk in the tray by its text.
      const texts = b.tiles.concat(b.extra || []);
      assert.equal(new Set(texts).size, texts.length, `${where} has a chunk twice`);
    }
  }
});

test('every mission is pointed at by somebody in the street', () => {
  const pointed = new Set();
  for (const c of crowd) for (const id of c.points_at || []) pointed.add(id);
  for (const m of missions) assert.ok(pointed.has(m.id), `${m.id} is unfindable`);
});

// ── the screen, HUD and quest log ───────────────────────────
const screen = await import('./screen.js');
const store = await import('../store.js');

test('the screen starts, runs and stops without a browser', () => {
  store.setUser('test');
  screen.start({ missions, crowd });
  assert.ok(screen.isRunning(), 'did not start');
  screen.stop();
  assert.ok(!screen.isRunning(), 'did not stop');
});

test('leaving and coming back does not stack a second set of listeners', () => {
  // Every handler used to be added on each start, so opening the game twice
  // gave the A button two click handlers and the HUD two openLog calls.
  store.setUser('twice');
  screen.start({ missions, crowd });
  screen.stop();
  screen.start({ missions, crowd });
  screen.stop();
  const a = document.getElementById('gameA');
  assert.equal(a.listenerCount('click'), 1,
    `A button has ${a.listenerCount('click')} click handlers`);
  assert.equal(document.getElementById('gameHud').listenerCount('click'), 1);
});

test('a long press on the controls is refused, not offered as Copy', () => {
  // Three separate things had to be true to stop the phone buzzing at you.
  // iOS is handled by -webkit-touch-callout in the stylesheet, which cannot be
  // tested from here; these are the two that can.
  const sec = document.getElementById('sc-game');
  assert.equal(sec.listenerCount('contextmenu'), 1, 'nothing suppresses contextmenu');
  assert.equal(sec.fire('contextmenu'), true, 'contextmenu was not prevented');

  // preventDefault on touchstart is the one that actually stops Android
  // starting a selection, and the haptic that comes with it.
  for (const id of ['gameStick', 'gameA']) {
    const node = document.getElementById(id);
    assert.equal(node.listenerCount('touchstart'), 1, `${id} does not eat touchstart`);
    assert.equal(node.fire('touchstart'), true, `${id} did not prevent touchstart`);
  }
});

test('the stick pushes, springs back, and ignores a resting thumb', () => {
  store.setUser('stick');
  screen.start({ missions, crowd });
  const stick = document.getElementById('gameStick');
  const knob = document.getElementById('gameKnob');

  // dead centre: a thumb resting on it must not walk you anywhere
  stick.fire('pointerdown', { pointerId: 1, clientX: 86, clientY: 666 });
  assert.equal(knob.style.transform, 'translate(0px, 0px)');

  // pushed right: the knob follows and the world is told to walk
  stick.fire('pointermove', { pointerId: 1, clientX: 86 + 60, clientY: 666 });
  assert.ok(/translate\([1-9]/.test(knob.style.transform),
    `knob did not move: ${knob.style.transform}`);

  // let go and it springs back to the middle
  stick.fire('pointerup', { pointerId: 1 });
  assert.equal(knob.style.transform, 'translate(0px, 0px)');
  screen.stop();
});

test('the HUD counts the missions, not the crowd', () => {
  const el = document.getElementById('gameCount');
  store.setUser('test2');
  screen.start({ missions, crowd });
  assert.equal(el.textContent, `0/${missions.length}`);
  screen.stop();
});

test('the quest log holds only what the street has told you', () => {
  store.setUser('test3');
  const g = store.game.all();
  assert.deepEqual(g.heard, []);
  store.game.hear(['centro-01', 'centro-02']);
  assert.deepEqual(store.game.all().heard, ['centro-01', 'centro-02']);
  store.game.finish('centro-01');
  assert.deepEqual(store.game.all().done, ['centro-01']);
  // and the help ladder counts phrases, which is what fades it
  assert.equal(store.game.met('Buenas'), 1);
  assert.equal(store.game.met('Buenas'), 2);
});

test('game progress rides along with the cloud snapshot', () => {
  store.setUser('test4');
  store.game.finish('mercado-01');
  const snap = store.snapshot();
  assert.ok(snap.game, 'snapshot has no game');
  assert.deepEqual(snap.game.done, ['mercado-01']);
  store.setUser('test5');
  assert.deepEqual(store.game.all().done, []);
  store.restore(snap);
  assert.deepEqual(store.game.all().done, ['mercado-01']);
});

console.log(`${passed} checks passed`);
console.log(`city      ${world.W} x ${world.H} tiles`);
console.log(`people    ${world.people.filter((p) => !p.crowd).length} missions, ` +
            `${world.people.filter((p) => p.crowd).length} crowd`);
console.log(`districts ${Object.keys(world.districts).length}`);
