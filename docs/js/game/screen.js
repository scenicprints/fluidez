// Granada, on a phone. The screen around the world: the HUD, the quest log,
// the arrow that points at a district, the controls and the dialogue.
//
// Everything about HOW you answer is settled and is not to be changed without
// asking: you BUILD the answer from a tray of chunks rather than typing it, the
// finished sentence is never shown unless you ask for it, the help fades as a
// phrase comes back, and there is no audio at all. See GAME.md.

import { $, el, esc, clear, toast } from '../ui.js';
import * as store from '../store.js';
import { createWorld, TS } from './world.js';
import { createPainter } from './draw.js';

const DISTRICT_NAME = {
  centro: 'El Centro', mercado: 'El Mercado', xalteva: 'Xalteva',
  guadalupe: 'Guadalupe', pantanal: 'Pantanal', terminal: 'La Terminal',
  trabajo: 'El trabajo', tramites: 'Trámites', malecon: 'El Malecón',
  fiestas: 'Las fiestas', afuera: 'Afuera', barrio: 'Tu barrio',
};

// The grader. Because the tray is authored, the set of sentences you can
// produce is finite and known, so an EXACT match is the whole of it: nothing
// you can assemble is correct-but-refused, which is the failure free text
// could never rule out.
const norm = (s) => String(s || '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[¿?¡!.,;:"'()«»]/g, ' ').replace(/\s+/g, ' ').trim();

const shuffled = (xs) => xs.slice().sort(() => Math.random() - 0.5);

let G = null;   // the running game, or null when the screen is closed

export function isRunning() { return !!G; }

// Test hook, and only that. game.test.mjs has to drive the loop by hand
// because there is no requestAnimationFrame in Node, and it has to be able to
// see the running world to check that nobody is walking through a building.
// Nothing in the app calls either of these.
export const __test = {
  world: () => G && G.world,
  frame: (t) => { if (G) frame(t); },
};

/**
 * Tear the loop down so a backgrounded game is not still drawing.
 *
 * This also has to put the SCREEN back, not just the loop. `G` is rebuilt on
 * the way in, but the overlays are DOM and outlive it: leaving mid-conversation
 * used to strand the beat panel over the world with a fresh `G` behind it whose
 * `npc` is null, so Say it threw, tapping a chunk wiped the tray, and — because
 * the beat panel is the one panel with no way out — the only cure was reloading
 * the page.
 */
export function stop() {
  if (!G) return;
  cancelAnimationFrame(G.raf);
  if (G.ro) G.ro.disconnect();
  saveWhere(true);
  G = null;
  shutOverlays();
  // The stick is module state, not part of G, and its pointerup may never
  // arrive once the screen is gone — a thumb still on it when you switch tabs
  // left STICK.on true, so you came back walking by yourself with the keyboard
  // ignored (stickVector returns early while the stick is "held").
  stickEnd();
}

function shutOverlays() {
  const talk = $('gameTalk'), panel = $('gamePanel'), log = $('gameLog'), map = $('gameMap');
  if (talk) talk.classList.remove('on');
  if (panel) panel.innerHTML = '';
  if (log) log.classList.remove('on');
  if (map) map.classList.remove('on');
}

/**
 * Remember where you are standing.
 *
 * Only when it has actually changed: `game` is a synced field, so the old
 * unconditional autosave re-stamped the device's `updatedAt` every eight
 * seconds merely for having the screen open, which makes standing still look
 * like progress to the sync.
 */
function saveWhere(force) {
  if (!G) return;
  const x = Math.round(G.world.S.px), y = Math.round(G.world.S.py);
  const was = G.savedAt;
  if (!force && was && Math.abs(x - was.x) < TS && Math.abs(y - was.y) < TS) return;
  G.savedAt = { x, y };
  store.game.where(x, y);
}

/**
 * Start (or resume) Granada inside #sc-game.
 * @param pack  content.game — { missions, crowd } out of the content pack
 */
export function start(pack) {
  if (G) return;
  const missions = (pack && pack.missions) || [];
  const crowd = (pack && pack.crowd) || [];
  if (!missions.length) { toast('The game has not been downloaded yet.'); return; }

  const saved = store.game.all();
  const finished = {};
  for (const id of saved.done) finished[id] = true;
  // Somebody in the street you have already stopped and asked. Their mark goes
  // out and stays out: without this every one of the 126 crowd bubbles came
  // back the moment you left the screen, so you could never tell who you had
  // already spoken to — and the crowd IS the quest system.
  for (const id of saved.spoke) finished[id] = true;

  const world = createWorld({ missions, crowd, finished });
  const painter = createPainter(world);
  const cv = $('gameCanvas');
  const ctx = cv.getContext('2d');

  // Pick up exactly where you left off, if that spot is still walkable — and
  // this now actually checks, which the comment has always claimed. The city is
  // regenerated whenever the map is rebuilt, so a spot you logged off in can
  // come back as the inside of a block; every direction then fails and you are
  // frozen for good with no way to reset. A half-written `at` out of a
  // truncated cloud restore used to put NaN through the whole simulation.
  if (saved.at && world.canStand(saved.at.x, saved.at.y)) {
    world.S.px = saved.at.x; world.S.py = saved.at.y;
  }
  for (const id of saved.done) world.S.finished[id] = true;

  G = {
    world, painter, ctx, cv, raf: 0, ro: null,
    held: {}, minHold: {}, talking: false, npc: null, beat: 0, misses: 0,
    built: [], tray: [], track: saved.track || null, landed: false,
    VW: 0, VH: 0, SCALE: 1.35, t0: 0, lastSave: 0,
    savedAt: { x: Math.round(world.S.px), y: Math.round(world.S.py) },
  };

  // ── sizing ────────────────────────────────────────────
  const resize = () => {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    G.VW = r.width; G.VH = r.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  };
  G.ro = new ResizeObserver(resize);
  G.ro.observe(cv);
  resize();

  wireControls();
  paintHud();
  G.raf = requestAnimationFrame(frame);
}

// ── the loop ────────────────────────────────────────────────
function frame(t) {
  if (!G) return;
  const dt = Math.min(34, t - G.t0); G.t0 = t;
  const { world, painter, ctx } = G;

  if (!G.talking) {
    world.move(dt, stickVector());
    world.traffic(dt);
    world.folk(dt);
  }
  painter.frame(ctx, t, G.VW, G.VH, G.SCALE);
  drawArrow(ctx);

  const near = world.nearest();
  const prompt = $('gamePrompt'), a = $('gameA');
  if (near && !G.talking) {
    prompt.textContent = `A — ${near.name}`;
    prompt.classList.add('on'); a.classList.add('live');
  } else { prompt.classList.remove('on'); a.classList.remove('live'); }

  // The HUD only changes when the district does, so it is not rebuilt 60x a
  // second for the pleasure of it.
  const here = world.districtNow();
  if (here !== G.here) { G.here = here; paintHud(); }

  if (t - G.lastSave > 8000) { G.lastSave = t; saveWhere(false); }
  G.raf = requestAnimationFrame(frame);
}

// ── the arrow ───────────────────────────────────────────────
// It points at the DISTRICT and goes out once you are inside it, because
// finding the actual person is meant to be done by asking somebody. Kevin:
// "you need to talk to people to find the precise place. You dont want the gps
// to solve the puzzle for you. And when you exit the district that arrow pops
// up again."
function drawArrow(ctx) {
  if (!G.track || G.talking) return;
  const { world } = G;
  const target = world.people.find((p) => p.id === G.track);
  if (!target) return;
  const d = world.districts[target.district];
  if (!d) return;

  const px = world.S.px / TS, py = world.S.py / TS;
  const away = Math.hypot(px - d.x, py - d.y);
  if (away < d.r) return;                       // you are in it; find them yourself

  const ang = Math.atan2(d.y - py, d.x - px);
  // Below the HUD chip, not level with it. Centred at y 30 the banner ran from
  // x 121 on a 390-wide phone and the HUD reaches 150, so the district name sat
  // behind it — at the exact moment the arrow is the thing you are reading.
  const cx = G.VW / 2, cy = 62;
  const metres = Math.round(away * 5 / 10) * 10;
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(20,16,14,.82)';
  ctx.beginPath(); ctx.roundRect(-74, -15, 148, 30, 15); ctx.fill();
  ctx.strokeStyle = 'rgba(232,163,61,.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(-74, -15, 148, 30, 15); ctx.stroke();
  ctx.save();
  ctx.translate(-52, 0); ctx.rotate(ang);
  ctx.fillStyle = '#E8A33D';
  ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -6); ctx.lineTo(-3, 0);
  ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#EFE7DC';
  ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(DISTRICT_NAME[target.district] || target.district, -38, -4);
  ctx.fillStyle = '#A99C8E'; ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(metres >= 1000 ? (metres / 1000).toFixed(1) + ' km' : metres + ' m', -38, 8);
  ctx.restore();
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

// ── the HUD ─────────────────────────────────────────────────
// One quiet line: where you are and how far you have got. Everything else
// lives behind the tap, because a permanent quest strip over the world is
// chrome you would stop reading by the second day.
function paintHud() {
  if (!G) return;
  const { world } = G;
  const done = world.people.filter((p) => !p.crowd && world.S.finished[p.id]).length;
  const total = world.people.filter((p) => !p.crowd).length;
  const here = G.here ? (DISTRICT_NAME[G.here] || G.here) : 'Granada';
  $('gameWhere').textContent = here;
  $('gameCount').textContent = `${done}/${total}`;
}

// ── the quest log ───────────────────────────────────────────
// Only what the street has actually told you about. A mission nobody has
// pointed you at is not in here — you can still walk into it, you just do not
// know it exists yet, which is the whole reason the crowd exists.
function openLog() {
  const { world } = G;
  const saved = store.game.all();
  const wrap = $('gameLog');
  const body = $('gameLogBody');
  clear(body);

  const heard = new Set(saved.heard);
  const missions = world.people.filter((p) => !p.crowd);
  const known = missions.filter((m) => heard.has(m.id) || world.S.finished[m.id]);

  if (!known.length) {
    const empty = el('div', 'log-empty');
    empty.innerHTML = '<b>Nobody has told you about anything yet.</b>' +
      '<span>Granada has no street signs and this game has no map markers. ' +
      'Talk to people in the street — the ones with a pale bubble — and what ' +
      'they point you at turns up here.</span>';
    body.appendChild(empty);
  } else {
    const byDistrict = {};
    for (const m of known) (byDistrict[m.district] || (byDistrict[m.district] = [])).push(m);
    for (const key of Object.keys(byDistrict)) {
      const head = el('div', 'log-district', DISTRICT_NAME[key] || key);
      body.appendChild(head);
      for (const m of byDistrict[key]) {
        const done = !!world.S.finished[m.id];
        const row = el('button', 'log-row' + (done ? ' done' : '') +
                                (G.track === m.id ? ' tracked' : ''));
        row.type = 'button';
        const hint = (world.people.find((p) => p.crowd &&
          (p.points_at || []).includes(m.id)) || {});
        row.innerHTML =
          `<div class="log-who">${esc(m.name)}</div>` +
          `<div class="log-goal">${esc(m.goal)}</div>` +
          (hint.says ? `<div class="log-said">“${esc(hint.says)}”</div>` : '') +
          `<div class="log-tag">${done ? 'done' :
            (G.track === m.id ? 'following' : 'tap to follow')}</div>`;
        row.addEventListener('click', () => {
          if (done) return;
          G.track = (G.track === m.id) ? null : m.id;
          store.game.tracking(G.track);
          openLog();
          if (G.track) {
            toast(`Following · **${DISTRICT_NAME[m.district] || m.district}**. ` +
                  `Ask somebody when you get there.`);
            closeLog();
          }
        });
        body.appendChild(row);
      }
    }
  }
  wrap.classList.add('on');
}
function closeLog() { $('gameLog').classList.remove('on'); }

// ── the map ─────────────────────────────────────────────────
// Granada is 5.4 x 4.4 km and you see about ninety metres of it at a time, so
// without this the only way to know the shape of the city is to have walked it.
//
// It shows the CITY and the DISTRICTS and where you are standing, and nothing
// else. No mission pins: "you dont want the gps to solve the puzzle for you" —
// the arrow already stops at the edge of a district for the same reason, and
// finding the actual person is what the crowd is for. Knowing that Xalteva is
// west of you is geography, not an answer.
const MAP_COLOUR = {
  4: '#2C4A63', 5: '#6E6647',                                  // water, shore
  2: '#3B4A32', 3: '#2F3D28', 21: '#3B4A32', 17: '#2F3D28',    // green
  1: '#4A4038', 9: '#544738', 18: '#3E3833', 13: '#4A4038', 19: '#453A30',
  15: '#5B5140', 20: '#39402F', 22: '#3A4231',
  6: '#6B3A2C', 7: '#57493E', 23: '#7A5240', 14: '#7A5240', 24: '#57493E',
  25: '#57493E', 8: '#8A6A4A', 11: '#6B3A2C', 12: '#57493E', 16: '#453A30',
  10: '#544738', 0: '#2A241F',
};
let mapPic = null;      // the city, rendered once and kept

/** The whole city as one small image, painted a tile at a time. */
function cityPicture(world) {
  if (mapPic) return mapPic;
  const { W, H, grid } = world;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const px = img.data;
  for (let i = 0; i < W * H; i++) {
    const hex = MAP_COLOUR[grid[i]] || '#2A241F';
    px[i * 4] = parseInt(hex.slice(1, 3), 16);
    px[i * 4 + 1] = parseInt(hex.slice(3, 5), 16);
    px[i * 4 + 2] = parseInt(hex.slice(5, 7), 16);
    px[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  mapPic = cv;
  return cv;
}

function openMap() {
  if (!G) return;
  const { world } = G;
  const wrap = $('gameMap'), cv = $('gameMapCanvas');
  wrap.classList.add('on');

  const hold = cv.parentNode.getBoundingClientRect();
  const scale = Math.min(hold.width / world.W, hold.height / world.H);
  const w = Math.max(1, Math.round(world.W * scale));
  const h = Math.max(1, Math.round(world.H * scale));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';

  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.imageSmoothingEnabled = true;
  g.clearRect(0, 0, w, h);
  g.drawImage(cityPicture(world), 0, 0, w, h);

  const k = w / world.W;                    // tiles -> map pixels
  const here = world.districtNow();

  // A pin and a name for each district, not a circle round it.
  //
  // The circles were tried first and they are the wrong drawing: a district's
  // radius is measured from how far apart its missions ended up, so Xalteva and
  // La Terminal came out big enough to cover half of Granada while six others
  // piled up on the same spot in the middle. What you want off this map is
  // "Xalteva is west of me", and a dot says that better than a blob does.
  const pins = Object.keys(world.districts).map((key) => {
    const d = world.districts[key];
    return { key, name: DISTRICT_NAME[key] || key, x: d.x * k, y: d.y * k, mine: key === here };
  }).sort((a, b) => a.y - b.y);

  // Twelve names on a phone-sized city will collide, so each label is nudged
  // clear of the ones already placed instead of being drawn on top of them.
  g.font = '600 10px ui-sans-serif, system-ui, sans-serif';
  const placed = [];
  for (const p of pins) {
    const half = g.measureText(p.name).width / 2 + 3;
    let ly = p.y - 9;
    for (let i = 0; i < 40; i++) {
      const clash = placed.some((q) => Math.abs(q.y - ly) < 11 && Math.abs(q.x - p.x) < q.half + half);
      if (!clash) break;
      ly += (i % 2 ? -1 : 1) * (11 + Math.floor(i / 2) * 2);
    }
    p.ly = ly;
    placed.push({ x: p.x, y: ly, half });
  }

  // The district you are standing in gets its actual extent drawn, because
  // "am I there yet" is the one question the shape genuinely answers — it is
  // the same radius the arrow switches off inside.
  if (here && world.districts[here]) {
    const d = world.districts[here];
    g.beginPath(); g.arc(d.x * k, d.y * k, Math.max(9, d.r * k), 0, 7);
    g.fillStyle = 'rgba(52,179,150,.13)'; g.fill();
    g.strokeStyle = 'rgba(52,179,150,.6)'; g.lineWidth = 1.2; g.stroke();
  }

  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const p of pins) {
    g.beginPath(); g.arc(p.x, p.y, p.mine ? 4 : 3, 0, 7);
    g.fillStyle = p.mine ? '#34B396' : '#E8A33D';
    g.fill();
    g.lineWidth = 1.4; g.strokeStyle = 'rgba(16,13,11,.85)'; g.stroke();
    // A dark rim under the text: the city beneath it is every colour, and a
    // plain label disappears over the roofs.
    g.lineWidth = 3; g.strokeStyle = 'rgba(16,13,11,.92)';
    g.strokeText(p.name, p.x, p.ly);
    g.fillStyle = p.mine ? '#7FE0C6' : '#F0D9A8';
    g.fillText(p.name, p.x, p.ly);
  }

  // You.
  const px = (world.S.px / TS) * k, py = (world.S.py / TS) * k;
  g.beginPath(); g.arc(px, py, 5.5, 0, 7);
  g.fillStyle = 'rgba(244,233,214,.35)'; g.fill();
  g.beginPath(); g.arc(px, py, 2.8, 0, 7);
  g.fillStyle = '#F4E9D6'; g.fill();
  g.lineWidth = 1.4; g.strokeStyle = '#14100E'; g.stroke();
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';

  $('gameMapSub').textContent = here
    ? `You are in ${DISTRICT_NAME[here] || here}.`
    : 'You are out between the districts.';
}
function closeMap() { $('gameMap').classList.remove('on'); }

// ── talking ─────────────────────────────────────────────────
function tryTalk() {
  if (!G || G.talking) return;
  const n = G.world.nearest();
  if (!n) return;
  G.npc = n; G.beat = 0; G.misses = 0; G.talking = true; G.landed = false;
  for (const k of Object.keys(G.held)) { G.held[k] = false; G.minHold[k] = 0; }
  $('gameTalk').classList.add('on');
  if (n.crowd) crowdLine(n);
  else if (G.world.S.finished[n.id]) idleLine(n);
  else renderBeat();
}

function closeTalk() {
  if (!G) { shutOverlays(); return; }
  G.talking = false; G.npc = null; G.landed = false;
  $('gameTalk').classList.remove('on');
  $('gamePanel').innerHTML = '';
  paintHud();
}

// The whole of the crowd's job: one line, in Spanish, pointing at something.
// Hearing it is what puts a mission in your log.
function crowdLine(n) {
  const { world } = G;
  world.S.finished[n.id] = true;             // heard it; the mark goes out
  const pts = (n.points_at || []).map((id) => world.people.find((x) => x.id === id))
    .filter(Boolean);
  // Remember the SPEAKER as well as what they pointed at. Only the latter used
  // to be saved, so somebody who points at nothing was forgotten entirely and
  // everyone else's bubble came back next time you opened the screen.
  store.game.spokeTo(n.id);
  if (n.points_at && n.points_at.length) store.game.hear(n.points_at);
  $('gamePanel').innerHTML =
    `<div class="who">${esc(n.name)}</div>
     <div class="says-es">${esc(n.says)}</div>
     <div class="en">${esc(n.en)}</div>
     ${pts.length ? `<div class="objective">Worth finding: ${
        pts.map((p) => esc(p.name)).join(', ')}</div>` : ''}
     <button class="go jade" id="gameBye" type="button">Gracias</button>`;
  $('gameBye').addEventListener('click', closeTalk);
}

function idleLine(n) {
  $('gamePanel').innerHTML =
    `<div class="who">${esc(n.name)}</div><div class="says-es">${esc(n.idle)}</div>
     <button class="go jade" id="gameBye" type="button">Leave</button>`;
  $('gameBye').addEventListener('click', closeTalk);
}

function renderBeat() {
  const n = G.npc, beat = (n.beats || [])[G.beat];
  // A beat that is missing its tray or its answers cannot be played, and
  // throwing in here is the worst place to throw: the overlay is already up, so
  // a content update with one bad file would strand you in a dead panel. Say so
  // and let them walk away instead.
  if (!beat || !Array.isArray(beat.tiles) || !beat.tiles.length || !Array.isArray(beat.ok)) {
    return brokenBeat(n);
  }
  // A beat with no key would share one counter with every other keyless beat,
  // so the help ladder would go cold for all of them at once.
  const beatKey = beat.key || `${n.id}#${G.beat}`;
  G.beatKey = beatKey;
  const lvl = store.game.all().seen[beatKey] || 0;
  G.built = [];
  G.landed = false;
  // The ladder is how much noise is in the tray and whether you are told what
  // you are trying to say. The chunks themselves are always there — you are
  // never stuck, and you are never handed the finished sentence either.
  const noise = lvl === 0 ? 1 : lvl === 1 ? 2 : 4;
  G.tray = shuffled(beat.tiles.concat((beat.extra || []).slice(0, noise)))
    .map((text, i) => ({ text, id: i }));

  const label = lvl === 0 ? 'Build it' : lvl === 1 ? 'You have had this once' : 'On your own';
  const gloss = lvl < 2 ? `<div class="en">You are saying: “${esc(beat.en)}”</div>` : '';

  $('gamePanel').innerHTML =
    `<button class="talkaway" id="gameAway" type="button" aria-label="Walk away">✕</button>
     <div class="who">${esc(n.name)}</div>
     <div class="says-es">${esc(beat.es)}</div>
     <div class="objective">${esc(beat.objective)}</div>
     <div class="help${lvl >= 2 ? ' cold' : lvl === 1 ? ' hint' : ''}">
       <div class="lab">${label}</div>${gloss}
     </div>
     <div class="built" id="gameBuilt"></div>
     <div class="tray" id="gameTray"></div>
     <div class="row">
       <button class="peek" id="gamePeek" type="button">I am stuck — show me the line</button>
       <button class="go" id="gameSend" type="button" disabled>Say it</button>
     </div>
     <div id="gameAfter"></div>`;
  paintTiles();
  $('gameSend').addEventListener('click', submit);
  $('gameAway').addEventListener('click', closeTalk);
  $('gamePeek').addEventListener('click', () => {
    $('gamePeek').outerHTML = `<div class="peeked es">${esc(beat.say)}</div>`;
  });
}

// A mission whose data cannot be played. Never reached by today's content —
// game.test.mjs checks every beat — but the alternative to saying so is a
// silent throw underneath an overlay you cannot close.
function brokenBeat(n) {
  $('gamePanel').innerHTML =
    `<div class="who">${esc(n.name)}</div>
     <div class="objective">This conversation did not download properly. Try again after the next content update.</div>
     <button class="go jade" id="gameBye" type="button">Leave</button>`;
  $('gameBye').addEventListener('click', closeTalk);
}

function paintTiles() {
  const built = $('gameBuilt'), tray = $('gameTray');
  if (!built) return;
  built.innerHTML = G.built.length
    ? G.built.map((t) => `<button class="gtile placed es" type="button" data-id="${t.id}">${esc(t.text)}</button>`).join('')
    : '<span class="ghost">Tap the chunks below to build your answer</span>';
  tray.innerHTML = G.tray
    .filter((t) => !G.built.some((b) => b.id === t.id))
    .map((t) => `<button class="gtile es" type="button" data-id="${t.id}">${esc(t.text)}</button>`).join('');

  built.querySelectorAll('.gtile').forEach((b) => b.addEventListener('click', () => {
    G.built = G.built.filter((t) => t.id !== Number(b.dataset.id));
    paintTiles();
  }));
  tray.querySelectorAll('.gtile').forEach((b) => b.addEventListener('click', () => {
    const t = G.tray.find((x) => x.id === Number(b.dataset.id));
    if (t) G.built.push(t);
    paintTiles();
  }));
  const send = $('gameSend');
  if (send) send.disabled = G.landed || G.built.length === 0;
}

const MOMO_GOOD = ['¡Eso!', '¡Ideay!', '¡Ya!', '¡Aha!'];

function submit() {
  // Already banked. Tapping a placed chunk after a win used to rebuild the
  // tray and re-enable Say it, so the same beat could be sent twice — two
  // steps up the help ladder for one conversation — or turned into a miss
  // after the fact, which took the Next button away and left no way on.
  if (!G || G.landed) return;
  const beat = G.npc.beats[G.beat];
  if (!G.built.length) return;
  const said = norm(G.built.map((t) => t.text).join(' '));
  if (said && beat.ok.some((a) => norm(a) === said)) return land(beat);
  G.misses++;
  const after = $('gameAfter');
  if (G.misses < 2) {
    after.innerHTML = '<div class="fb bad"><b>Mmm… not quite</b>Read it back to yourself. Tap a chunk to take it out again.</div>';
    return;
  }
  // Never stuck: lay the right answer out and let them see the shape of it.
  G.built = beat.tiles.map((text) => G.tray.find((t) => t.text === text)).filter(Boolean);
  paintTiles();
  after.innerHTML = '<div class="fb bad"><b>Here it is</b>This is the one. Send it and keep going.</div>';
}

function land(beat) {
  G.landed = true;
  store.game.met(G.beatKey || beat.key);
  // Playing feeds the same vocabulary the reader and the drills feed. Order a
  // coffee in Granada and café gets stronger in Words.
  if (beat.teaches && beat.teaches.length) store.recordExposure(beat.teaches, 1);
  $('gameSend').disabled = true;
  $('gameTray').innerHTML = '';
  // The answer stays on screen but stops being buttons — the click handlers on
  // the placed chunks were the way back into a beat you had already won.
  $('gameBuilt').innerHTML = G.built
    .map((t) => `<span class="gtile placed es">${esc(t.text)}</span>`).join('');
  $('gameAfter').innerHTML =
    `<div class="fb good"><b>${MOMO_GOOD[Math.floor(Math.random() * MOMO_GOOD.length)]} that works</b>${esc(beat.good)}</div>
     <div class="chips">${(beat.teaches || []).map((w) => `<span class="chip">${esc(w)}</span>`).join('')}</div>
     <button class="go jade" id="gameNext" type="button">Next</button>`;
  $('gameNext').addEventListener('click', () => {
    G.beat++; G.misses = 0;
    if (G.beat >= G.npc.beats.length) finish(); else renderBeat();
  });
  $('gameNext').focus();
}

function finish() {
  const n = G.npc;
  G.world.S.finished[n.id] = true;
  store.game.finish(n.id);
  store.progress.markScenario('game:' + n.id);
  if (G.track === n.id) { G.track = null; store.game.tracking(null); }
  $('gamePanel').innerHTML =
    `<div style="text-align:center">
       <div class="es" style="font-size:24px;color:var(--jade);margin:6px 0">¡Listo!</div>
       <p class="log-said" style="margin:0 auto;max-width:30ch">${esc(n.culture || '')}</p>
       <button class="go jade" id="gameBye" type="button">Back to Granada</button>
     </div>`;
  $('gameBye').addEventListener('click', closeTalk);
  $('gameBye').focus();
}

// ── controls ────────────────────────────────────────────────
// A thumbstick rather than a d-pad. You walk in any direction and as slowly as
// you like, and — the reason it went in when it did — there is no text
// anywhere in it, so Android has nothing to try to select when you hold it
// down. That was the buzzing.
const STICK = { on: false, id: null, cx: 0, cy: 0, r: 52, x: 0, y: 0 };
const DEAD = 0.12;          // ignore the first tenth, so resting a thumb drifts nowhere

// The keyboard still works, and it pushes the same stick.
const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
               w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
const IMPULSE = 130;   // ms of travel a single tap of a key is worth
function press(dir) { G.held[dir] = true; G.minHold[dir] = performance.now() + IMPULSE; }
function release(dir) { G.held[dir] = false; }
function isHeld(dir) { return G.held[dir] || (G.minHold[dir] || 0) > performance.now(); }

function stickVector() {
  if (STICK.on) return { x: STICK.x, y: STICK.y };
  let x = 0, y = 0;
  if (isHeld('left')) x -= 1;
  if (isHeld('right')) x += 1;
  if (isHeld('up')) y -= 1;
  if (isHeld('down')) y += 1;
  if (x && y) { x *= 0.7071; y *= 0.7071; }      // a key is full push, not 1.41x
  return { x, y };
}

function knobTo(x, y) {
  const k = $('gameKnob');
  if (k && k.style) k.style.transform = `translate(${x * STICK.r}px, ${y * STICK.r}px)`;
}

function stickStart(e) {
  const stick = $('gameStick');
  const r = stick.getBoundingClientRect();
  STICK.on = true; STICK.id = e.pointerId;
  STICK.cx = r.left + r.width / 2; STICK.cy = r.top + r.height / 2;
  STICK.r = Math.max(28, r.width / 2 - 14);
  stick.classList.add('live');
  if (stick.setPointerCapture) { try { stick.setPointerCapture(e.pointerId); } catch {} }
  stickMove(e);
}

function stickMove(e) {
  if (!STICK.on || (STICK.id !== null && e.pointerId !== STICK.id)) return;
  const dx = e.clientX - STICK.cx, dy = e.clientY - STICK.cy;
  const len = Math.hypot(dx, dy);
  const mag = Math.min(1, len / STICK.r);
  if (mag < DEAD || !len) { STICK.x = 0; STICK.y = 0; knobTo(0, 0); return; }
  // Rescale past the dead zone so the very first millimetre of real movement
  // is a crawl rather than a jump.
  const push = (mag - DEAD) / (1 - DEAD);
  STICK.x = (dx / len) * push;
  STICK.y = (dy / len) * push;
  knobTo((dx / len) * mag, (dy / len) * mag);
}

function stickEnd(e) {
  if (STICK.id !== null && e && e.pointerId !== undefined && e.pointerId !== STICK.id) return;
  STICK.on = false; STICK.id = null; STICK.x = 0; STICK.y = 0;
  const stick = $('gameStick');
  if (stick) stick.classList.remove('live');
  knobTo(0, 0);
}

let wired = false;
function wireControls() {
  // Wired ONCE, not once per start. Every handler reads G at the moment it
  // fires rather than closing over it, so they stay correct across leaving the
  // screen and coming back — and re-wiring on each start would stack a second
  // copy of every listener, which is how one tap starts opening the quest log
  // twice.
  if (wired) return;
  wired = true;

  $('gameA').addEventListener('click', tryTalk);
  $('gameHud').addEventListener('click', openLog);
  $('gameLogClose').addEventListener('click', closeLog);
  $('gameMapBtn').addEventListener('click', openMap);
  $('gameMapClose').addEventListener('click', closeMap);

  // Long-pressing a d-pad button offered to copy the arrow out of it. The CSS
  // stops iOS showing its callout; this stops Android and desktop raising a
  // context menu over the controls. Nothing in this screen is text you would
  // ever want to select.
  const sec = document.getElementById('sc-game');
  if (sec) sec.addEventListener('contextmenu', (e) => e.preventDefault());

  const stick = $('gameStick');
  if (stick) {
    stick.addEventListener('pointerdown', (e) => { e.preventDefault(); if (G) stickStart(e); });
    stick.addEventListener('pointermove', (e) => { if (G) stickMove(e); });
    // NOT gated on G: letting go has to be honoured even if the screen went
    // away while your thumb was down, or the stick stays pushed and you come
    // back walking on your own with the keyboard ignored.
    stick.addEventListener('pointerup', stickEnd);
    stick.addEventListener('pointercancel', stickEnd);
    stick.addEventListener('lostpointercapture', stickEnd);
    // preventDefault on touchstart is the one that actually stops Android
    // starting a long-press selection — and the haptic that comes with it.
    // Doing it on pointerdown alone was not enough.
    stick.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  }
  const abtn = $('gameA');
  if (abtn) abtn.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

  addEventListener('keydown', (e) => {
    if (!G || G.talking) return;
    const k = KEYS[e.key];
    if (k) { press(k); e.preventDefault(); }
    if (e.key === 'e' || e.key === 'E' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); tryTalk();
    }
  });
  addEventListener('keyup', (e) => { if (G) { const k = KEYS[e.key]; if (k) release(k); } });

  // Position is otherwise only written by the eight-second timer inside the
  // frame loop — and requestAnimationFrame stops the instant the tab is
  // hidden, so a phone reclaiming the app in the background lost up to eight
  // seconds of walking. Both events fire where rAF cannot help.
  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { saveWhere(true); stickEnd(); }
  });
  addEventListener('pagehide', () => { saveWhere(true); stickEnd(); });
}
