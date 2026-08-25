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

/** Tear the loop down so a backgrounded game is not still drawing. */
export function stop() {
  if (!G) return;
  cancelAnimationFrame(G.raf);
  if (G.ro) G.ro.disconnect();
  store.game.where(Math.round(G.world.S.px), Math.round(G.world.S.py));
  G = null;
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
  for (const id of saved.heard) finished[id] = finished[id] || false;

  const world = createWorld({ missions, crowd, finished });
  const painter = createPainter(world);
  const cv = $('gameCanvas');
  const ctx = cv.getContext('2d');

  // Pick up exactly where you left off, if that spot is still walkable.
  if (saved.at && Number.isFinite(saved.at.x)) {
    world.S.px = saved.at.x; world.S.py = saved.at.y;
  }
  for (const id of saved.done) world.S.finished[id] = true;

  G = {
    world, painter, ctx, cv, raf: 0, ro: null,
    held: {}, minHold: {}, talking: false, npc: null, beat: 0, misses: 0,
    built: [], tray: [], track: saved.track || null,
    VW: 0, VH: 0, SCALE: 1.35, t0: 0, lastSave: 0,
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

  if (t - G.lastSave > 8000) {
    G.lastSave = t;
    store.game.where(Math.round(world.S.px), Math.round(world.S.py));
  }
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
  const cx = G.VW / 2, cy = 30;
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

// ── talking ─────────────────────────────────────────────────
function tryTalk() {
  if (!G || G.talking) return;
  const n = G.world.nearest();
  if (!n) return;
  G.npc = n; G.beat = 0; G.misses = 0; G.talking = true;
  for (const k of Object.keys(G.held)) { G.held[k] = false; G.minHold[k] = 0; }
  $('gameTalk').classList.add('on');
  if (n.crowd) crowdLine(n);
  else if (G.world.S.finished[n.id]) idleLine(n);
  else renderBeat();
}

function closeTalk() {
  G.talking = false;
  $('gameTalk').classList.remove('on');
  paintHud();
}

// The whole of the crowd's job: one line, in Spanish, pointing at something.
// Hearing it is what puts a mission in your log.
function crowdLine(n) {
  const { world } = G;
  world.S.finished[n.id] = true;             // heard it; the mark goes out
  const pts = (n.points_at || []).map((id) => world.people.find((x) => x.id === id))
    .filter(Boolean);
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
  const n = G.npc, beat = n.beats[G.beat];
  const lvl = store.game.all().seen[beat.key] || 0;
  G.built = [];
  // The ladder is how much noise is in the tray and whether you are told what
  // you are trying to say. The chunks themselves are always there — you are
  // never stuck, and you are never handed the finished sentence either.
  const noise = lvl === 0 ? 1 : lvl === 1 ? 2 : 4;
  G.tray = shuffled(beat.tiles.concat((beat.extra || []).slice(0, noise)))
    .map((text, i) => ({ text, id: i }));

  const label = lvl === 0 ? 'Build it' : lvl === 1 ? 'You have had this once' : 'On your own';
  const gloss = lvl < 2 ? `<div class="en">You are saying: “${esc(beat.en)}”</div>` : '';

  $('gamePanel').innerHTML =
    `<div class="who">${esc(n.name)}</div>
     <div class="says-es">${esc(beat.es)}</div>
     <div class="objective">${esc(beat.objective)}</div>
     <div class="help${lvl === 2 ? ' cold' : lvl === 1 ? ' hint' : ''}">
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
  $('gamePeek').addEventListener('click', () => {
    $('gamePeek').outerHTML = `<div class="peeked es">${esc(beat.say)}</div>`;
  });
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
  if (send) send.disabled = G.built.length === 0;
}

const MOMO_GOOD = ['¡Eso!', '¡Ideay!', '¡Ya!', '¡Aha!'];

function submit() {
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
  store.game.met(beat.key);
  // Playing feeds the same vocabulary the reader and the drills feed. Order a
  // coffee in Granada and café gets stronger in Words.
  if (beat.teaches && beat.teaches.length) store.recordExposure(beat.teaches, 1);
  $('gameSend').disabled = true;
  $('gameTray').innerHTML = '';
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
    stick.addEventListener('pointerup', (e) => { if (G) stickEnd(e); });
    stick.addEventListener('pointercancel', (e) => { if (G) stickEnd(e); });
    stick.addEventListener('lostpointercapture', (e) => { if (G) stickEnd(e); });
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
}
