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
// Set once the screen module is loaded. A test that throws part-way used to
// leave the game running, so the NEXT start() returned early and every check
// after it was quietly measuring the wrong world — three cascading failures
// from one real bug. Each test now begins from a torn-down screen.
let cleanup = null;
const test = (name, fn) => {
  try { fn(); passed++; }
  catch (e) { console.error(`FAIL  ${name}\n      ${String(e.message).split('\n')[0]}`); process.exitCode = 1; }
  finally { if (cleanup) cleanup(); }
};

// ── a browser, more or less ─────────────────────────────────
const drew = { fillRect: 0, drawImage: 0, arc: 0, fillText: 0, roundRect: 0 };
// Every colour the code paints with, in order. Checking that two things are
// drawn in two different colours is otherwise impossible from here.
const ctx2d = (paints) => new Proxy({}, {
  get(t, k) {
    if (k in drew) return () => { drew[k]++; };
    if (k === 'measureText') return () => ({ width: 10 });
    // The map paints the whole city one tile at a time into an ImageData, so
    // this has to be real storage rather than a shrug.
    if (k === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
    if (k === 'getImageData') return (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
    return t[k] === undefined ? () => {} : t[k];
  },
  set(t, k, v) {
    if ((k === 'fillStyle' || k === 'strokeStyle') && paints) paints.push(String(v));
    t[k] = v;
    return true;
  },
});
const nodes = new Map();

// Enough of a DOM to play a beat. The chunk tray is painted as innerHTML and
// then queried for its buttons, so a stub that answers querySelectorAll with an
// empty list can start a conversation but can never finish one — which is how a
// broken land() sat behind twenty passing checks. These children are parsed out
// of whatever innerHTML the code last wrote and cached until it writes again,
// so the handlers the code attaches are still on them when a test clicks.
const TILE = /<button[^>]*data-id="(\d+)"[^>]*>([\s\S]*?)<\/button>/g;
const makeEl = (id) => {
  const listeners = {};
  const paints = [];
  let html = '', kids = null, ctx = null;
  const children = () => {
    if (kids) return kids;
    kids = [];
    TILE.lastIndex = 0;
    let m;
    while ((m = TILE.exec(html)) !== null) kids.push(makeTile(m[1], m[2]));
    return kids;
  };
  const node = {
    id, width: 0, height: 0, textContent: '', style: {},
    get innerHTML() { return html; },
    set innerHTML(v) { html = String(v); kids = null; },
    dataset: {}, disabled: false,
    // A real one: whether an overlay is still up after you leave the screen is
    // exactly the kind of thing this file exists to catch.
    classList: (() => {
      const set = new Set();
      return {
        add: (...c) => c.forEach((x) => set.add(x)),
        remove: (...c) => c.forEach((x) => set.delete(x)),
        toggle: (c, on) => (on === undefined ? (set.has(c) ? set.delete(c) : set.add(c)) : (on ? set.add(c) : set.delete(c))),
        contains: (c) => set.has(c),
      };
    })(),
    // left/top matter: the stick works out its centre from this, and without
    // them every pointer position came out NaN and the knob never moved.
    getBoundingClientRect: () => (id === 'gameStick'
      ? { left: 20, top: 600, width: 132, height: 132, right: 152, bottom: 732 }
      : { left: 0, top: 0, width: 390, height: 560, right: 390, bottom: 560 }),
    // One context per element, kept — the code holds on to the one it is given,
    // so handing out a fresh proxy each call would lose everything it painted.
    paints,
    getContext: () => (ctx || (ctx = ctx2d(paints))),
    addEventListener: (ev, fn) => { (listeners[ev] || (listeners[ev] = [])).push(fn); },
    querySelectorAll: () => children(),
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
    // The map sizes itself against the box it is dropped into.
    parentNode: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 460, right: 360, bottom: 460 }) },
  };
  return node;
};
// One chunk button in the tray or in the answer being built.
function makeTile(dataId, text) {
  const listeners = {};
  return {
    dataset: { id: dataId },
    textContent: text,
    addEventListener: (ev, fn) => { (listeners[ev] || (listeners[ev] = [])).push(fn); },
    fire: (ev) => { (listeners[ev] || []).forEach((f) => f({ preventDefault() {} })); },
  };
}

// Ids that are to behave as if they are not in the page at all. The stub
// conjures any element you ask it for, which is convenient and also means it
// can never notice a control that index.html does not actually have — the one
// class of bug that bricks the whole screen.
const absent = new Set();

globalThis.document = {
  getElementById: (id) => (absent.has(id) ? null
    : nodes.get(id) || (nodes.set(id, makeEl(id)), nodes.get(id))),
  createElement: () => makeEl('canvas'),
  querySelectorAll: () => [],
  addEventListener() {},
  visibilityState: 'visible',
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
const { PLACE, DISTRICT } = await import('./place.js');

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

// ── where everybody stands ──────────────────────────────────
test('every named place the bake asks for is really on the map', () => {
  // `Isla El Castillo` and `Barrio Posintepe` were not in the OSM extract at
  // all. spot() found nothing, the anchor fell back to Parque Central, and the
  // street crowd for Afuera and Pantanal ended up in the middle of town
  // pointing at missions a kilometre away. Nothing said a word about it.
  const missing = [];
  for (const key of Object.keys(DISTRICT)) {
    if (!world.spot(DISTRICT[key])) missing.push(`district ${key} -> "${DISTRICT[key]}"`);
  }
  for (const id of Object.keys(PLACE)) {
    if (!world.spot(PLACE[id].at)) missing.push(`${id} -> "${PLACE[id].at}"`);
  }
  assert.deepEqual(missing, [], `named places that do not exist:\n      ${missing.join('\n      ')}`);
});

test('a district crowd stands where that district is', () => {
  // The crowd is placed round the district anchor and the missions round their
  // own named places, so the two can drift apart without anything failing.
  // Malecon's hint-givers were 1.1 km from every Malecon mission.
  for (const key of Object.keys(world.districts)) {
    const mis = world.people.filter((p) => !p.crowd && p.district === key);
    const cro = world.people.filter((p) => p.crowd && p.district === key);
    if (!cro.length || !mis.length) continue;
    const mid = (l, f) => l.reduce((a, p) => a + f(p), 0) / l.length;
    const gap = Math.hypot(mid(mis, (p) => p.x) - mid(cro, (p) => p.x),
                           mid(mis, (p) => p.y) - mid(cro, (p) => p.y)) * 5;
    assert.ok(gap < 400, `${key}: its crowd is ${Math.round(gap)} m from its missions`);
  }
});

test('a district is a few blocks, not one tile and not half the city', () => {
  // Too tight and you meet everybody at once and then walk through nothing;
  // too loose and the arrow switches off while you are still miles away.
  for (const key of Object.keys(world.districts)) {
    const d = world.districts[key];
    const m = d.r * 5;
    assert.ok(m > 100 && m < 500, `${key} has a radius of ${Math.round(m)} m`);
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
cleanup = () => { try { screen.stop(); } catch {} };

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

// ── playing a beat, from the outside ────────────────────────
// Walk onto somebody, press A, lay the chunks down in their written order —
// which the grader accepts — and send it. Everything the dialogue does wrong
// is only reachable this way, which is why the stub DOM parses the tray.
const { esc } = await import('../ui.js');

/** The world the SCREEN is running, which is not the bare one built above. */
const W2 = () => screen.__test.world();

function standOn(id) {
  const seat = world.people.find((p) => p.id === id);
  store.game.where(seat.x * TS + 8, seat.y * TS + 8);
}
function tapChunk(text) {
  const tile = document.getElementById('gameTray').querySelectorAll('.gtile')
    .find((t) => t.textContent === esc(text));
  assert.ok(tile, `"${text}" is not in the tray`);
  tile.fire('click');
}
function answer(beat) {
  for (const chunk of beat.tiles) tapChunk(chunk);
  document.getElementById('gameSend').fire('click');
}

// ── leaving, and coming back ────────────────────────────────
const withBeats = missions.find((m) => m.beats && m.beats.length);

test('walking out mid-conversation does not leave a dead panel over the world', () => {
  // The panel is DOM and outlives G. Leaving used to keep it up with a fresh
  // empty G behind it: Say it threw on a null npc, tapping a chunk wiped the
  // tray, and the beat panel has no Leave button — so only a reload cleared it.
  store.setUser('softlock');
  standOn(withBeats.id);
  screen.start({ missions, crowd });
  document.getElementById('gameA').fire('click');
  assert.ok(document.getElementById('gameTalk').classList.contains('on'), 'never opened');

  screen.stop();
  assert.ok(!document.getElementById('gameTalk').classList.contains('on'),
    'the dialogue is still up over the world');
  assert.equal(document.getElementById('gamePanel').innerHTML, '', 'the panel still holds a beat');

  // And coming back must be a clean world, not a trap.
  screen.start({ missions, crowd });
  assert.ok(!document.getElementById('gameTalk').classList.contains('on'));
  screen.stop();
});

test('you can walk away from a conversation without leaving the screen', () => {
  store.setUser('walkaway');
  standOn(withBeats.id);
  screen.start({ missions, crowd });
  document.getElementById('gameA').fire('click');
  assert.ok(document.getElementById('gameTalk').classList.contains('on'));
  // getElementById here conjures anything you ask it for, so the button has to
  // be found in the panel's own markup before firing it proves anything.
  assert.ok(/id="gameAway"/.test(document.getElementById('gamePanel').innerHTML),
    'the beat panel has no way out of it');
  document.getElementById('gameAway').fire('click');
  assert.ok(!document.getElementById('gameTalk').classList.contains('on'), 'walking away did nothing');
});

test('a thumb still on the stick when you leave does not walk you afterwards', () => {
  store.setUser('stuckstick');
  screen.start({ missions, crowd });
  const stick = document.getElementById('gameStick');
  stick.fire('pointerdown', { pointerId: 7, clientX: 86, clientY: 666 });
  stick.fire('pointermove', { pointerId: 7, clientX: 86 + 60, clientY: 666 });
  screen.stop();                       // tab switch with the thumb still down

  screen.start({ missions, crowd });
  const before = { x: W2().S.px, y: W2().S.py };
  for (let i = 0; i < 30; i++) screen.__test.frame(i * 16);
  const after = { x: W2().S.px, y: W2().S.py };
  assert.equal(after.x, before.x, 'walked off on its own');
  assert.equal(after.y, before.y, 'walked off on its own');
  screen.stop();
});

test('somebody you have already asked in the street stays asked', () => {
  // Only what they pointed AT used to be saved, so all 126 crowd bubbles came
  // back every time you opened the screen and you could not tell who you had
  // already stopped. A crowd line pointing at nothing was forgotten entirely.
  const quiet = crowd.find((c) => !(c.points_at || []).length) || crowd[0];
  store.setUser('spoke');
  standOn(quiet.id);
  screen.start({ missions, crowd });
  document.getElementById('gameA').fire('click');
  document.getElementById('gameBye').fire('click');
  screen.stop();

  assert.ok(store.game.all().spoke.includes(quiet.id), 'the speaker was not remembered');
  screen.start({ missions, crowd });
  assert.equal(W2().S.finished[quiet.id], true, 'their bubble came back');
  screen.stop();
});

test('a saved position inside a wall does not freeze you there for good', () => {
  store.setUser('walled');
  // A spot that is solid, and a half-written one out of a truncated restore.
  for (const bad of [{ x: 0, y: 0 }, { x: 100 }, { x: 1e9, y: 1e9 }]) {
    store.game.where(bad.x, bad.y);
    screen.start({ missions, crowd });
    const { S } = W2();
    assert.ok(Number.isFinite(S.px) && Number.isFinite(S.py), `NaN from ${JSON.stringify(bad)}`);
    assert.ok(W2().canStand(S.px, S.py), `dropped into a wall from ${JSON.stringify(bad)}`);
    screen.stop();
  }
});

test('a beat you have already won cannot be sent a second time', () => {
  // land() left the placed chunks as live buttons, so tapping one rebuilt the
  // tray and re-enabled Say it — two rungs up the help ladder for one beat.
  const m = missions.find((x) => x.beats[0] && x.beats[0].key);
  const beat = m.beats[0];
  store.setUser('twice-beat');
  standOn(m.id);
  screen.start({ missions, crowd });
  document.getElementById('gameA').fire('click');
  answer(beat);
  const once = store.game.all().seen[beat.key];
  assert.equal(once, 1, `winning it once counted ${once}`);

  // Whatever is still on screen, none of it may bank the beat again.
  document.getElementById('gameBuilt').querySelectorAll('.gtile').forEach((t) => t.fire('click'));
  document.getElementById('gameSend').fire('click');
  assert.equal(store.game.all().seen[beat.key], 1, 'the same beat counted twice');
  screen.stop();
});

// ── the street ──────────────────────────────────────────────
test('there are people on the street, and none of them is on a roof or in the lake', () => {
  // This check is deliberately NOT world.canStand or world.bodyFits. Asserting
  // the same function the movement code guards itself with proves only that it
  // called itself, and that is what the first version of this test did — it
  // passed happily while people walked with half their body over a roof and out
  // across the water, because only the single point under their feet was ever
  // tested. Here the tiles a drawn person actually covers are read straight off
  // the grid.
  store.setUser('folk');
  screen.start({ missions, crowd });
  const w = W2();
  const bad = [];
  for (let i = 0; i < 900; i++) {
    screen.__test.frame(i * 16);
    if (i % 25) continue;
    for (const p of w.S.walkers) {
      if (p.px === undefined) continue;
      assert.ok(Number.isFinite(p.px) && Number.isFinite(p.py), 'a walker went to NaN');
      // The sprite: ten px across, head fourteen up, feet four down.
      for (const [dx, dy] of [[-4, 4], [4, 4], [-4, -12], [4, -12], [0, 0]]) {
        const t = w.at(Math.floor((p.px + dx) / TS), Math.floor((p.py + dy) / TS));
        if (SOLID.has(t)) bad.push(`tile ${t} at ${Math.round(p.px)},${Math.round(p.py)}`);
      }
    }
  }
  assert.ok(w.S.walkers.length >= 6, `only ${w.S.walkers.length} people about`);
  assert.deepEqual(bad.slice(0, 4), [], `${bad.length} sightings of somebody inside solid ground`);
});

test('the street is populated, but it is not a rush hour', () => {
  // Kevin, on the first attempt: "I think there are too many to be honest."
  // Granada is a quiet provincial city. This is the number he sees, so it is
  // worth pinning rather than leaving to drift.
  store.setUser('howmany');
  screen.start({ missions, crowd });
  const w = W2();
  const SCALE = 1.35, hw = 390 / SCALE / 2, hh = 560 / SCALE / 2;
  let seen = 0, samples = 0;
  for (let i = 0; i < 900; i++) {
    screen.__test.frame(i * 16);
    if (i % 25) continue;
    samples++;
    seen += w.S.walkers.filter((p) => p.px !== undefined &&
      Math.abs(p.px - w.S.px) < hw && Math.abs(p.py - w.S.py) < hh).length;
  }
  // Measured standing at the spawn, which is Parque Central — the busiest
  // square in Granada and the most crowded reading you can get. Walking the
  // ordinary streets is about three. The band is wide on purpose: this is here
  // to catch a deserted city or a rush hour, not to pin a number.
  const avg = seen / samples;
  assert.ok(avg >= 1 && avg <= 8, `${avg.toFixed(1)} passers-by on screen at a time`);
});

test('a passer-by is never mistaken for somebody you can talk to', () => {
  // They carry no bubble and nearest() only ever looks at `people`, so standing
  // on one has to do nothing at all rather than open an empty panel.
  store.setUser('folk2');
  screen.start({ missions, crowd });
  const w = W2();
  for (let i = 0; i < 60; i++) screen.__test.frame(i * 16);
  // One who is not also standing next to somebody real, or this proves nothing.
  const alone = w.S.walkers.find((p) => p.px !== undefined && w.people.every((n) =>
    Math.hypot(n.x * TS + 8 - p.px, n.y * TS + 8 - p.py) > 60));
  assert.ok(alone, 'no passer-by was out on their own to test with');
  w.S.px = alone.px; w.S.py = alone.py;
  const near = w.nearest();
  assert.ok(!near, `a passer-by answered as "${near && near.name}"`);
  document.getElementById('gameA').fire('click');
  assert.ok(!document.getElementById('gameTalk').classList.contains('on'));
});

// ── the map ─────────────────────────────────────────────────
test('the map opens, draws the city and knows where you are', () => {
  store.setUser('map');
  screen.start({ missions, crowd });
  const before = drew.fillRect + drew.arc + drew.drawImage;
  document.getElementById('gameMapBtn').fire('click');
  assert.ok(document.getElementById('gameMap').classList.contains('on'), 'the map did not open');
  assert.ok(drew.drawImage > 0, 'the city was never drawn');
  assert.ok(drew.arc > 0, 'no districts and no you');
  assert.ok(drew.fillRect + drew.arc + drew.drawImage > before);
  const sub = document.getElementById('gameMapSub').textContent;
  assert.ok(/You are/.test(sub), `the map says "${sub}"`);

  document.getElementById('gameMapClose').fire('click');
  assert.ok(!document.getElementById('gameMap').classList.contains('on'));
  screen.stop();
});

test('the map does not survive leaving the screen either', () => {
  store.setUser('map2');
  screen.start({ missions, crowd });
  document.getElementById('gameMapBtn').fire('click');
  screen.stop();
  assert.ok(!document.getElementById('gameMap').classList.contains('on'));
});

test('a missing control does not take the whole game down with it', () => {
  // Every one of these is bound in wireControls, which used to do
  // `$(id).addEventListener` with no guard and set `wired` before it started —
  // so ONE absent button threw, the stick and the keyboard were never wired,
  // and it never tried again. You could not walk and you could not talk.
  //
  // A stale cached index.html against fresh JavaScript is exactly how that
  // happens in the wild, and the service worker was matching cached assets with
  // `ignoreSearch: true`, which threw away the ?v= that made a build unique.
  const CONTROLS = ['gameMapClear', 'gameMapIn', 'gameMapOut', 'gameMapBtn',
                    'gameMapClose', 'gameHud', 'gameLogClose', 'gameMapCanvas'];
  for (const id of CONTROLS) {
    screen.__test.unwire();
    nodes.clear();
    absent.add(id);
    try {
      store.setUser('missing-' + id);
      standOn(withBeats.id);
      screen.start({ missions, crowd });
      assert.ok(screen.isRunning(), `#${id} missing stopped the game starting`);
      document.getElementById('gameA').fire('click');
      assert.ok(document.getElementById('gameTalk').classList.contains('on'),
        `with #${id} missing, the A button is dead`);
      screen.stop();
    } finally {
      absent.delete(id);
      nodes.clear();
      screen.__test.unwire();
    }
  }
});

// ── zoom, pan and the pin ───────────────────────────────────
const mapCv = () => document.getElementById('gameMapCanvas');
const openTheMap = (user) => {
  store.setUser(user);
  screen.start({ missions, crowd });
  document.getElementById('gameMapBtn').fire('click');
};

test('the map zooms in and back out again, and stops at the whole city', () => {
  openTheMap('zoom');
  const label = document.getElementById('gameMapZoom');
  assert.equal(label.textContent, 'Granada', 'did not open showing the whole city');

  document.getElementById('gameMapIn').fire('click');
  assert.notEqual(label.textContent, 'Granada', 'zooming in did nothing');
  const zoomed = label.textContent;

  for (let i = 0; i < 12; i++) document.getElementById('gameMapOut').fire('click');
  assert.equal(label.textContent, 'Granada', 'zoomed out past the whole city');
  // And it really stopped at 1, rather than shrinking away below it: one step
  // back in from a properly clamped view is exactly 1.6x. If zooming out had
  // been allowed to run down to a fraction, this would still read "Granada".
  document.getElementById('gameMapIn').fire('click');
  assert.equal(label.textContent, '1.6x',
    `zoom-out ran past the whole city — one step back in gave ${label.textContent}`);
  document.getElementById('gameMapOut').fire('click');

  for (let i = 0; i < 30; i++) document.getElementById('gameMapIn').fire('click');
  const max = parseFloat(label.textContent);
  assert.ok(max <= 14.001, `zoomed to ${max}x, past the limit`);
  assert.ok(max > parseFloat(zoomed), 'zoom did not keep going in');
});

test('dragging the map moves it and does NOT drop a pin', () => {
  openTheMap('pan');
  document.getElementById('gameMapIn').fire('click');   // zoomed in, so panning has room
  const cv = mapCv();
  const before = store.game.all().pin;
  cv.fire('pointerdown', { pointerId: 1, clientX: 200, clientY: 200 });
  cv.fire('pointermove', { pointerId: 1, clientX: 140, clientY: 160 });
  cv.fire('pointermove', { pointerId: 1, clientX: 90, clientY: 120 });
  cv.fire('pointerup', { pointerId: 1, clientX: 90, clientY: 120 });
  assert.deepEqual(store.game.all().pin, before, 'a drag dropped a pin');
});

test('a tap drops a pin, and the pin survives leaving and coming back', () => {
  openTheMap('pin');
  const cv = mapCv();
  cv.fire('pointerdown', { pointerId: 1, clientX: 150, clientY: 180 });
  cv.fire('pointerup', { pointerId: 1, clientX: 150, clientY: 180 });

  const pin = store.game.all().pin;
  assert.ok(pin, 'tapping the map dropped nothing');
  assert.ok(Number.isFinite(pin.x) && Number.isFinite(pin.y), `pin is ${JSON.stringify(pin)}`);
  assert.ok(pin.x >= 0 && pin.x < world.W && pin.y >= 0 && pin.y < world.H, 'pin is off the map');

  screen.stop();
  screen.start({ missions, crowd });
  assert.deepEqual(store.game.all().pin, pin, 'the pin did not survive');
});

test('the pin can be cleared', () => {
  openTheMap('unpin');
  const cv = mapCv();
  cv.fire('pointerdown', { pointerId: 1, clientX: 120, clientY: 140 });
  cv.fire('pointerup', { pointerId: 1, clientX: 120, clientY: 140 });
  assert.ok(store.game.all().pin, 'no pin to clear');
  document.getElementById('gameMapClear').fire('click');
  assert.equal(store.game.all().pin, null, 'Clear pin left it there');
});

// The banner outline, which only an arrow banner ever paints. The flat colours
// are no good for this: the player's own shirt is jade, so looking for #34B396
// on the game canvas finds him standing there whether or not a pin exists.
const QUEST_GOLD = '#E8A33D', PIN_JADE = '#34B396';
const QUEST_BANNER = QUEST_GOLD + '80', PIN_BANNER = PIN_JADE + '80';

test('the quest arrow is gold and your pin arrow is not', () => {
  // Kevin asked for the pin arrow "in a different color than the quest gps".
  // Both are the same banner drawn twice, so getting this wrong is one edit
  // away at all times.
  store.setUser('arrows');
  const far = missions.find((m) => m.district === 'malecon') || missions[0];
  store.game.hear([far.id]);
  store.game.tracking(far.id);
  store.game.setPin(300, 300);
  screen.start({ missions, crowd });

  const w = screen.__test.world();
  assert.ok(Math.hypot(w.S.px / TS - 300, w.S.py / TS - 300) > 4,
    'standing on the pin, so its arrow would be hidden');

  const paints = document.getElementById('gameCanvas').paints;
  paints.length = 0;
  screen.__test.frame(16);

  assert.ok(paints.includes(QUEST_BANNER), 'no gold quest arrow was drawn');
  assert.ok(paints.includes(PIN_BANNER), 'no pin arrow was drawn');
  assert.notEqual(QUEST_BANNER, PIN_BANNER, 'the two arrows are the same colour');
});

test('the pin arrow goes out once you are standing on it', () => {
  store.setUser('arrived');
  screen.start({ missions, crowd });
  const w = screen.__test.world();
  store.game.setPin(Math.round(w.S.px / TS), Math.round(w.S.py / TS));
  screen.stop();
  screen.start({ missions, crowd });

  const paints = document.getElementById('gameCanvas').paints;
  paints.length = 0;
  screen.__test.frame(16);
  assert.ok(!paints.includes(PIN_BANNER), 'the pin arrow is still pointing at your feet');
});

test('the map shows a dot for every quest giver', () => {
  store.setUser('dots');
  screen.start({ missions, crowd });
  const paints = document.getElementById('gameMapCanvas').paints;
  paints.length = 0;
  document.getElementById('gameMapBtn').fire('click');
  // Gold for a mission you have been told about, faded gold for one you have
  // not, jade for one already done.
  const gold = paints.filter((c) => c === QUEST_GOLD || c === 'rgba(232,163,61,.5)').length;
  assert.ok(gold >= missions.length,
    `${gold} quest dots drawn for ${missions.length} missions`);
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
