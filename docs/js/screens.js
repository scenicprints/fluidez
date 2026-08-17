// Every screen of the app proper.
//
// Rendering is deliberately dumb: each screen redraws from the store whenever
// it is shown, so there is no view state to get out of sync with progress.

import { $, el, clear, esc, md, showScreen, toast, initials, ago, bytes } from './ui.js';
import * as store from './store.js';
import * as cloud from './cloud.js';
import * as speech from './speech.js';
import { content, lessonsByPhase, checkForContentUpdate, cacheSize, packVersion } from './content.js';
import { MOMO_MINI, momoSvg, createMomo, daysBetween } from './momo.js';
import {
  memoryStrength, band, calcFluency, fadingWords, leeches, tokenize, cleanWord,
  conjugate, generateExercises, gradeTyped, orderCandidates, scramble, shuffle, pick,
  phaseName, phaseDesc,
} from './engine.js';

let momo = null;
let session = { userId: null, name: null };
let openLesson = null;

export function initScreens(m, s) { momo = m; session = s; wire(); }

const speakOpts = () => ({
  lang: content.language?.speech || 'es-MX',
  rate: store.settings.get('speechRate') || 0.45,
});
const canAudio = () => content.has('audio') && speech.canSpeak();

function sync() {
  if (!session.userId) return;
  cloud.pushProgress(session.userId, store.snapshot());
  if (store.settings.get('shareStreak')) {
    const f = fluency();
    cloud.publishBoardRow(session.userId, {
      name: session.name,
      streak: store.daily.streak(),
      level: f.level,
      known: f.known,
      language: content.language?.code || null,
      lastActive: store.daily.lastActive(),
    });
  }
}

function fluency() {
  return calcFluency(store.vocab.all(), store.progress.all(), store.patterns.unlocked(), {
    lessons: content.lessons.length,
    patterns: content.patterns.length,
  });
}

// Things worth a reaction that happen while Momo is nowhere to be seen —
// mid-drill, mid-lesson. Held until the next screen he is actually on, which
// is the wrap-up or Today, rather than fired into an empty room.
let pending = { goal: false, streak: 0, patterns: [] };
let greeted = false;

function activity(reps = 1) {
  const before = store.daily.metToday();
  const { streak, newDay } = store.daily.record(reps);
  if (!before && store.daily.metToday()) {
    pending.goal = true;
    pending.streak = streak;
  }
  return newDay;
}

/** Drain the queue into a list of moments, newest reason first. */
function takePending() {
  const out = [];
  if (pending.goal) {
    out.push({ when: 'goal', label: `Goal met — <b>${pending.streak}</b> day${pending.streak === 1 ? '' : 's'}` });
  }
  for (const title of pending.patterns) {
    out.push({ when: 'pattern', label: `Pattern found — <b>${esc(title)}</b>` });
  }
  pending = { goal: false, streak: 0, patterns: [] };
  return out;
}

/** Let a visible Momo work through the queue, one beat at a time. */
function playPending(m, events, startAfter = 2600) {
  if (!m || !events.length) return;
  events.forEach((e, i) => setTimeout(() => m.speak(e.when), startAfter + i * 2800));
}

// ── header bits shared by several screens ───────────────────
function paintLevel() {
  const f = fluency();
  for (const id of ['levelChip', 'levelChip2', 'levelChip3', 'levelChip4']) {
    const n = $(id);
    if (n) n.textContent = `${f.level} · ${f.overall}%`;
  }
  const chip = $('langChip');
  if (chip && content.language) {
    chip.innerHTML = `${esc(content.language.flag || '🌐')} ${esc(String(content.language.name || '').toUpperCase())} ▾`;
  }
}

// ══ TODAY ═══════════════════════════════════════════════════
export function renderToday() {
  paintLevel();
  const pad = $('todayPad');
  clear(pad);

  // Coming back after a gap is the moment that decides whether a lapsed streak
  // turns into a dead app, so it gets its own reaction — read once per app run,
  // because store.daily.record() overwrites lastActive the second you do
  // anything, and re-rendering Today would then look like you had never left.
  if (!greeted) {
    greeted = true;
    momo?.arrive(daysBetween(store.daily.lastActive()));
  }

  // Anything that happened while he was off-screen — a goal crossed mid-lesson,
  // a pattern unlocked while reading — gets said now that he is here to say it.
  playPending(momo, takePending(), 900);

  const f = fluency();
  const prog = store.progress.all();
  const read = prog.storiesRead || [];
  const goal = store.daily.goal();
  const today = store.daily.todayCount();
  const streak = store.daily.streak();
  const pct = goal ? Math.min(1, today / goal) : 0;

  // streak + goal
  const card = el('div', 'card');
  card.innerHTML = `
    <div class="row">
      <div class="streak">
        <span class="flame">${streak > 0 ? '🔥' : '☀️'}</span>
        <div>
          <div class="big">${streak} day${streak === 1 ? '' : 's'}</div>
          <div class="sub">${streak > 0 ? (store.daily.longest() > streak ? `Best is ${store.daily.longest()}` : 'Longest yet — keep it') : 'Do anything today to start one'}</div>
        </div>
      </div>
      <svg class="ring" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r="18" fill="none" stroke="#382E2A" stroke-width="4"/>
        <circle cx="22" cy="22" r="18" fill="none" stroke="${today >= goal ? '#34B396' : '#E8A33D'}" stroke-width="4"
          stroke-linecap="round" stroke-dasharray="113" stroke-dashoffset="${113 - 113 * pct}"
          transform="rotate(-90 22 22)"/>
        <text x="22" y="27" text-anchor="middle">${today}</text>
      </svg>
    </div>`;
  pad.appendChild(card);

  // continue
  if (content.has('reader') && content.lessons.length) {
    const next = content.lessons.find((l) => !read.includes(l.id)) || content.lessons[0];
    const done = read.includes(next.id);
    const cont = el('div', 'card cont tap');
    cont.innerHTML = `
      <p class="label">${done ? 'Read it again' : 'Pick up where you left off'}</p>
      <div class="cont-title es">${esc(next.title)}</div>
      <div class="sub">${esc(next.desc)} · Phase ${next.phase} · ${esc(phaseName(next.phase))}</div>
      <div class="bar"><i style="width:${Math.round((read.length / Math.max(1, content.lessons.length)) * 100)}%"></i></div>
      <button class="go" type="button">${done ? 'Open' : 'Start reading'}</button>`;
    cont.addEventListener('click', () => openLesson_(next));
    pad.appendChild(cont);
  }

  // the tiles this language actually supports
  const fadingCount = fadingWords(store.vocab.all(), content.dict, 500).filter((x) => x.m < 0.5).length;
  const tiles = [];
  const add = (feature, icon, name, count, fn) => {
    if (feature && !content.has(feature)) return;
    tiles.push({ icon, name, count, fn });
  };
  add('scenes', 'ic-scenes', 'Scenes', `${content.scenarios.length} · ${(prog.scenariosDone || []).length} done`, () => showScreen('scenes'));
  add('review', 'ic-target', 'Review', fadingCount ? `${fadingCount} fading` : 'all fresh', () => startReview());
  add('verbs', 'ic-verb', 'Verbs', content.verbs ? 'conjugation' : '—', () => startVerbs());
  add('order', 'ic-order', 'Word order', 'build it', () => startOrder());
  add('audio', 'ic-ear', 'Listening', 'dictation', () => startDictation());
  add('audio', 'ic-mic', 'Shadowing', 'say it back', () => startShadow());
  add('words', 'ic-words', 'Words', `${f.known} known`, () => showScreen('words'));
  add('patterns', 'ic-pattern', 'Patterns', `${store.patterns.unlocked().length} of ${content.patterns.length}`, () => showScreen('patterns'));
  if (content.manifest?.emergency) {
    add(null, 'ic-life', 'Emergency', 'offline', () => openPhrases());
  }

  const grid = el('div', 'tiles');
  for (const t of tiles) {
    const b = el('button', 'tile');
    b.type = 'button';
    b.innerHTML = `<svg class="ic"><use href="#${t.icon}"/></svg><span class="nm">${esc(t.name)}</span><span class="ct">${esc(t.count)}</span>`;
    b.addEventListener('click', t.fn);
    grid.appendChild(b);
  }
  pad.appendChild(grid);

  // friends
  const friends = el('div', 'card');
  friends.innerHTML = '<p class="label">Learning alongside you</p><div class="amigos" id="amigos"></div>';
  pad.appendChild(friends);
  paintBoard();
}

async function paintBoard() {
  const host = $('amigos');
  if (!host) return;
  clear(host);
  const rows = await cloud.fetchBoard();
  if (!rows.length) {
    host.innerHTML = '<p class="muted" style="margin:0">Nobody else yet. Send a friend the link and they pick their own user ID.</p>';
    return;
  }
  // Somebody overtaking you is worth hearing about once — not on every render,
  // and not again tomorrow for the same person at the same streak.
  const myStreak = store.daily.streak();
  const ahead = rows
    .filter((r) => r.id !== session.userId && Number(r.streak || 0) > myStreak)
    .sort((a, b) => Number(b.streak || 0) - Number(a.streak || 0))[0];
  // A name, a flame and a number — no sentence. Momo does not speak English,
  // and "is ahead — 1 days" was both wrong grammar and the wrong language.
  // The dismayed pose carries the meaning; the numbers carry the rest.
  if (ahead && store.momoSeen.mark(`ahead:${ahead.id}:${Number(ahead.streak || 0)}`)) {
    const name = esc(ahead.name || ahead.id);
    const days = Number(ahead.streak || 0);
    setTimeout(() => momo?.set('wrong', `<b>${name}</b> · 🔥 ${days}`), 1400);
  }

  for (const r of rows) {
    const mine = r.id === session.userId;
    const fresh = r.lastActive === new Date().toISOString().slice(0, 10);
    const a = el('div', 'amigo' + (mine ? ' me' : fresh ? ' live' : ''));
    a.innerHTML =
      `<div class="av">${esc(initials(r.name))}</div>` +
      `<div class="an">${esc(mine ? 'You' : (r.name || r.id))}</div>` +
      `<div class="as">🔥 ${Number(r.streak || 0)}</div>`;
    a.addEventListener('click', () =>
      momo?.say(`<b>${esc(r.name || r.id)}</b> · 🔥 ${Number(r.streak || 0)} · ${esc(r.level || 'A0')}`));
    host.appendChild(a);
  }
}

// ══ PATH ════════════════════════════════════════════════════
export function renderPath() {
  paintLevel();
  const read = store.progress.all().storiesRead || [];
  $('pathSub').textContent = `${read.length} of ${content.lessons.length} read`;
  const trail = $('trail');
  clear(trail);

  const byPhase = lessonsByPhase();
  if (!byPhase.length) {
    trail.innerHTML = '<p class="empty">No lessons in this course yet.</p>';
    return;
  }

  // A phase opens once the one before it is finished.
  let unlocked = true;
  for (const [phase, lessons] of byPhase) {
    const head = el('div', 'phase-h' + (unlocked ? '' : ' locked'));
    head.innerHTML = `<span class="phase-n">${phase}</span><span class="phase-t">${esc(phaseName(phase))}</span>`;
    trail.appendChild(head);
    const d = el('p', 'phase-d', phaseDesc(phase));
    trail.appendChild(d);

    let markedCurrent = false;
    lessons.forEach((lesson, i) => {
      const done = read.includes(lesson.id);
      const isNow = unlocked && !done && !markedCurrent;
      if (isNow) markedCurrent = true;
      const locked = !unlocked;

      const node = el('div', 'node' + (i === 0 ? ' first' : '') + (i === lessons.length - 1 ? ' last' : '') +
        (locked ? ' lock' : done ? ' done' : isNow ? ' now' : ''));
      node.innerHTML =
        `<div class="dot">${locked ? '🔒' : done ? '✓' : isNow ? '▶' : '·'}</div>` +
        `<div><span class="node-t es">${esc(lesson.title)}</span>` +
        `<span class="node-d">${esc(isNow ? 'You are here' : lesson.desc)}</span></div>` +
        (isNow ? MOMO_MINI : '');
      if (!locked) node.addEventListener('click', () => openLesson_(lesson));
      trail.appendChild(node);
    });

    unlocked = lessons.every((l) => read.includes(l.id));
  }
}

// ══ WARM-UP ═════════════════════════════════════════════════
// Before a lesson, meet the words you are about to trip over. Each card is
// tap-to-reveal so you get a beat to guess first, and advancing logs a real
// exposure, so the warm-up genuinely feeds the memory model.
let warm = null;

export function openLesson_(lesson) {
  const words = (lesson.warmup || []).filter((w) => content.dict[w]);
  if (!words.length) return openReader(lesson);
  warm = { lesson, words, i: 0 };
  $('wuTitle').textContent = lesson.title;
  showScreen('warmup');
  paintWarmup();
}

function paintWarmup() {
  const { words, i } = warm;
  const word = words[i];
  const d = content.dict[word] || {};
  $('wuCount').textContent = `${i + 1} / ${words.length}`;
  $('wuWord').textContent = word;
  $('wuPos').textContent = [d.pos, d.g].filter(Boolean).join(' · ');
  $('wuMean').textContent = d.en || '—';
  const note = $('wuNote');
  note.textContent = d.note || '';
  note.classList.toggle('has', !!d.note);
  $('wuCard').classList.remove('open');
  $('wuNext').style.visibility = 'hidden';
  $('wuNext').textContent = i < words.length - 1 ? 'Next word' : 'Start reading';

  const dots = $('wuDots');
  clear(dots);
  words.forEach((_, j) => {
    const dot = el('i');
    if (j < i) dot.className = 'done';
    else if (j === i) dot.className = 'now';
    dots.appendChild(dot);
  });
}

function revealWarmup() {
  $('wuCard').classList.add('open');
  $('wuNext').style.visibility = 'visible';
  if (canAudio()) { speech.warmUp(); speech.speak(warm.words[warm.i], speakOpts()); }
}

function advanceWarmup() {
  store.recordExposure(warm.words[warm.i]);
  if (warm.i < warm.words.length - 1) {
    warm.i++;
    paintWarmup();
  } else {
    openReader(warm.lesson);
  }
}

// ══ READER ══════════════════════════════════════════════════
export function openReader(lesson) {
  openLesson = lesson;
  $('readTitle').textContent = lesson.title;
  const host = $('readBody');
  clear(host);

  const hint = el('p', 'hint',
    'Tap a sentence for the English. Tap any word for its meaning — the underline shows how well you know it.');
  host.appendChild(hint);

  const vocab = store.vocab.all();
  const strengthClass = (w) => {
    const v = vocab[w];
    if (!v) return '';
    const m = memoryStrength(v.exposures || 0, v.lastSeen || 0);
    return m >= 0.8 ? ' s3' : m >= 0.5 ? ' s2' : m >= 0.2 ? ' s1' : '';
  };

  for (const sn of lesson.sentences) {
    const p = el('p', 'line');
    const s = el('span', 's');
    for (const tok of tokenize(sn.es)) {
      if (tok.isWord && content.dict[cleanWord(tok.raw)]) {
        const key = cleanWord(tok.raw);
        const w = el('span', 'w' + strengthClass(key), tok.raw);
        w.addEventListener('click', () => openWord(key));
        s.appendChild(w);
      } else {
        s.appendChild(document.createTextNode(tok.raw));
      }
    }
    if (canAudio()) {
      const b = el('button', 'spk', '🔊');
      b.type = 'button';
      b.setAttribute('aria-label', 'Read this line');
      b.addEventListener('click', () => { speech.warmUp(); speech.speak(sn.es, speakOpts()); });
      s.appendChild(b);
    }
    // The translation stays hidden until asked for — reading it for free is
    // not reading. Tapping the Spanish reveals just that line.
    s.addEventListener('click', (ev) => {
      if (ev.target.closest('.w, .spk')) return;   // word lookups and audio win
      p.classList.toggle('shown');
    });
    const e = el('span', 'e', sn.en);
    p.appendChild(s); p.appendChild(e);
    host.appendChild(p);
  }

  const both = el('div', 'reveal-all');
  const showAll = el('button', null, 'Show all');
  showAll.type = 'button';
  showAll.addEventListener('click', () =>
    host.querySelectorAll('.line').forEach((l) => l.classList.add('shown')));
  const hideAll = el('button', null, 'Hide all');
  hideAll.type = 'button';
  hideAll.addEventListener('click', () =>
    host.querySelectorAll('.line').forEach((l) => l.classList.remove('shown')));
  both.appendChild(showAll); both.appendChild(hideAll);
  host.appendChild(both);

  // Reading it counts: every dictionary word in the lesson is an exposure.
  const seen = new Set();
  for (const sn of lesson.sentences) {
    for (const tok of tokenize(sn.es)) {
      const key = cleanWord(tok.raw);
      if (tok.isWord && content.dict[key]) seen.add(key);
    }
  }
  store.recordExposure([...seen]);
  store.progress.markRead(lesson.id);
  activity(Math.max(1, Math.round(lesson.sentences.length / 2)));
  checkPatterns();
  sync();

  const done = el('button', 'go');
  done.type = 'button';
  done.textContent = 'Done — back to the path';
  done.style.marginTop = '10px';
  done.addEventListener('click', () => { showScreen('path'); renderPath(); });
  host.appendChild(done);

  showScreen('read');
  if (store.settings.get('autoplay') && canAudio()) {
    speech.warmUp();
    speech.speak(lesson.sentences[0]?.es, speakOpts());
  }
}

function openWord(key) {
  const d = content.dict[key];
  if (!d) return;
  const v = store.vocab.all()[key];
  const m = v ? memoryStrength(v.exposures || 0, v.lastSeen || 0) : 0;
  const b = band(m);
  const colour = b.key === 'strong' ? 'var(--jade)' : b.key === 'growing' ? 'var(--oro)' : b.key === 'fading' ? 'var(--barro)' : 'var(--txt3)';

  $('shWord').textContent = key;
  $('shPos').textContent = [d.pos, d.g].filter(Boolean).join(' · ');
  $('shMean').textContent = d.en;
  const note = $('shNote');
  note.style.display = d.note ? 'block' : 'none';
  note.textContent = d.note || '';
  const lab = $('shLab');
  lab.textContent = b.label.toUpperCase();
  lab.style.color = colour;
  const bar = $('shBar');
  bar.style.width = `${Math.round(Math.max(0.04, m) * 100)}%`;
  bar.style.background = colour;
  $('shSpeak').style.display = canAudio() ? '' : 'none';
  $('shSpeak').onclick = () => { speech.warmUp(); speech.speak(key, speakOpts()); };

  store.recordExposure(key);
  $('sheet').classList.add('up');
}

const closeSheet = () => $('sheet').classList.remove('up');

function checkPatterns() {
  const vocab = store.vocab.all();
  for (const p of content.patterns) {
    if (store.patterns.unlocked().includes(p.id)) continue;
    const met = (p.trigger || []).filter((w) => (vocab[w]?.exposures || 0) >= 1).length;
    if (met >= (p.min || 3)) {
      store.patterns.unlock(p.id);
      pending.patterns.push(p.title);
    }
  }
}

// ══ SCENES ══════════════════════════════════════════════════
export function renderScenes() {
  paintLevel();
  const done = store.progress.all().scenariosDone || [];
  $('scenesSub').textContent = `${done.length} of ${content.scenarios.length} played`;
  const pad = $('scenesList');
  clear(pad);
  if (!content.scenarios.length) {
    pad.innerHTML = '<p class="empty">This course has no scenes.</p>';
    return;
  }
  for (const s of content.scenarios) {
    const c = el('div', 'card tap');
    c.innerHTML =
      `<p class="label">Phase ${s.phase} · ${esc(phaseName(s.phase))}${done.includes(s.id) ? ' · played' : ''}</p>` +
      `<div class="cont-title es" style="font-size:19px">${esc(s.title)}</div>` +
      `<div class="sub">${esc(s.desc)}</div>`;
    c.addEventListener('click', () => openScene(s));
    pad.appendChild(c);
  }
}

let scene = null;
let sceneStep = 0;

export function openScene(s) {
  scene = s;
  sceneStep = 0;
  $('sceneTitle').textContent = s.title;
  showScreen('scene');
  paintScene();
}

function paintScene() {
  const pad = $('scenePad');
  clear(pad);
  const step = scene.steps[sceneStep];
  $('sceneSub').textContent = `Step ${sceneStep + 1} of ${scene.steps.length}`;

  const steps = el('div', 'steps');
  scene.steps.forEach((_, i) => {
    const i2 = el('i');
    if (i <= sceneStep) i2.className = 'on';
    steps.appendChild(i2);
  });
  pad.appendChild(steps);

  if (sceneStep === 0 && scene.setting) {
    pad.appendChild(el('p', 'setting', scene.setting));
  }

  const listenFirst = canAudio() && store.settings.get('listenFirst') !== false;
  const said = el('div', 'said');
  said.innerHTML =
    `<div class="face">🗣️</div>` +
    `<div class="bubble"><div class="who">${esc(step.speaker || 'They say')}</div>` +
    `<span class="s">${esc(step.es)}</span>` +
    `<span class="e${listenFirst ? ' hidden' : ''}">${esc(step.en)}</span></div>`;
  pad.appendChild(said);

  if (listenFirst) {
    const reveal = el('button', 'go ghost');
    reveal.type = 'button';
    reveal.textContent = 'Show the English';
    reveal.addEventListener('click', () => {
      said.querySelector('.e').classList.remove('hidden');
      reveal.remove();
    });
    pad.appendChild(reveal);
    speech.warmUp();
    speech.speak(step.es, speakOpts());
  }

  const opts = el('div', 'opts');
  for (const o of step.options) {
    const b = el('button', 'opt');
    b.type = 'button';
    b.innerHTML = `<span class="s">${esc(o.es)}</span><span class="e">${esc(o.en)}</span>`;
    b.addEventListener('click', () => answerScene(b, o, opts, pad));
    opts.appendChild(b);
  }
  pad.appendChild(opts);
}

function answerScene(btn, option, opts, pad) {
  opts.querySelectorAll('.opt').forEach((o) => { o.disabled = true; });
  btn.classList.add(option.verdict === 'good' ? 'good' : option.verdict === 'bad' ? 'bad' : 'ok');

  const fb = el('div', `fb show ${option.verdict === 'good' ? 'good' : option.verdict === 'bad' ? 'bad' : 'ok'}`);
  fb.innerHTML = `<b>${option.verdict === 'good' ? 'Perfect' : option.verdict === 'bad' ? 'Not that' : 'Understandable'}</b><span>${md(option.feedback)}</span>`;
  pad.appendChild(fb);

  store.recordExposure([...new Set(tokenize(option.es).filter((t) => t.isWord).map((t) => cleanWord(t.raw)).filter((w) => content.dict[w]))]);
  activity();

  const next = el('button', 'go');
  next.type = 'button';
  next.style.marginTop = '12px';
  const last = sceneStep >= scene.steps.length - 1;
  next.textContent = last ? 'Finish' : 'Next';
  next.addEventListener('click', () => {
    if (last) {
      store.progress.markScenario(scene.id);
      sync();
      showScreen('scenes');
      renderScenes();
    } else {
      sceneStep++;
      paintScene();
    }
  });
  pad.appendChild(next);
}

// ══ WORDS ═══════════════════════════════════════════════════
export function renderWords() {
  paintLevel();
  const query = ($('wordSearch')?.value || '').trim().toLowerCase();
  if (query) return renderSearch(query);

  const pad = $('wordsPad');
  clear(pad);
  const vocab = store.vocab.all();
  const entries = Object.keys(vocab)
    .filter((w) => content.dict[w])
    .map((w) => ({ w, m: memoryStrength(vocab[w].exposures || 0, vocab[w].lastSeen || 0) }))
    .filter((x) => x.m > 0)
    .sort((a, b) => a.m - b.m);

  // These three must add up to the chips below, or the counts look broken.
  // A word met once sits a hair under .2 the instant it starts decaying, so
  // "fading" has to mean everything below growing, not a band with a floor.
  const strong = entries.filter((x) => x.m >= 0.8).length;
  const growing = entries.filter((x) => x.m >= 0.5 && x.m < 0.8).length;
  const fading = entries.filter((x) => x.m < 0.5).length;

  const stats = el('div', 'stats3');
  stats.innerHTML =
    `<div class="stat"><div class="v" style="color:var(--jade)">${strong}</div><div class="k">Locked in</div></div>` +
    `<div class="stat"><div class="v" style="color:var(--oro)">${growing}</div><div class="k">Growing</div></div>` +
    `<div class="stat"><div class="v" style="color:var(--barro)">${fading}</div><div class="k">Fading</div></div>`;
  pad.appendChild(stats);

  const legend = el('div', 'legend');
  legend.innerHTML =
    '<span class="lg"><i style="background:var(--jade)"></i>Locked in</span>' +
    '<span class="lg"><i style="background:var(--oro)"></i>Growing</span>' +
    '<span class="lg"><i style="background:var(--barro)"></i>Fading — review soon</span>';
  pad.appendChild(legend);

  const stuck = leeches(vocab);
  if (stuck.length) {
    const c = el('div', 'card');
    c.innerHTML = `<p class="label">Not sticking</p><p class="muted" style="margin:0 0 10px">` +
      `${stuck.length} word${stuck.length === 1 ? '' : 's'} you keep missing. Repetition is not working — meet ${stuck.length === 1 ? 'it' : 'them'} in a sentence instead.</p>`;
    const chips = el('div', 'chips');
    for (const s of stuck.slice(0, 12)) {
      const b = el('button', 'chip s1', s.word);
      b.type = 'button';
      b.addEventListener('click', () => openWordFromList(s.word));
      chips.appendChild(b);
    }
    c.appendChild(chips);
    pad.appendChild(c);
  }

  if (!entries.length) {
    pad.appendChild(el('p', 'empty', 'No words yet. Read a lesson and they will collect here.'));
    return;
  }

  const chips = el('div', 'chips');
  for (const e of entries) {
    const b = band(e.m);
    const cls = b.key === 'strong' ? 's3' : b.key === 'growing' ? 's2' : 's1';
    const c = el('button', `chip ${cls}`, e.w);
    c.type = 'button';
    c.addEventListener('click', () => openWordFromList(e.w));
    chips.appendChild(c);
  }
  pad.appendChild(chips);
}

// Search your own words first, then fall through to the rest of the
// dictionary — the original did the same, and it is how you look up a word you
// half-heard in the street.
function renderSearch(query) {
  const pad = $('wordsPad');
  clear(pad);
  const vocab = store.vocab.all();
  const matches = (w) => w.includes(query) || String(content.dict[w].en).toLowerCase().includes(query);

  const mine = Object.keys(vocab).filter((w) => content.dict[w] && matches(w));
  const rest = Object.keys(content.dict).filter((w) => !vocab[w] && matches(w)).slice(0, 60);
  $('wordsSub').textContent = `${mine.length + rest.length} match${mine.length + rest.length === 1 ? '' : 'es'}`;

  const section = (title, words) => {
    if (!words.length) return;
    const card = el('div', 'card');
    card.innerHTML = `<p class="label">${esc(title)}</p>`;
    for (const w of words) {
      const d = content.dict[w];
      const row = el('button', 'hit');
      row.type = 'button';
      row.innerHTML = `<span class="w es">${esc(w)}</span><span class="m">${esc(d.en)}</span>`;
      row.addEventListener('click', () => openWordFromList(w));
      card.appendChild(row);
    }
    pad.appendChild(card);
  };

  section('Your words', mine);
  section('Rest of the dictionary', rest);
  if (!mine.length && !rest.length) {
    pad.appendChild(el('p', 'empty', `No matches for “${query}”.`));
  }
}

function openWordFromList(w) {
  const d = content.dict[w];
  if (!d) return;
  toast(`<b>${esc(w)}</b> — ${esc(d.en)}${d.note ? '. ' + esc(d.note) : ''}`, 4200);
  if (canAudio()) { speech.warmUp(); speech.speak(w, speakOpts()); }
}

// ══ FLUENCY ═════════════════════════════════════════════════
// The engine already works all of this out; this is the screen that finally
// shows it — where the score comes from, what you have passed, what is next.
export function renderFluency() {
  const f = fluency();
  const pad = $('fluencyPad');
  clear(pad);
  $('fluencySub').textContent = f.levelDesc;

  const head = el('div', 'card center');
  head.innerHTML =
    `<div class="big-score">${f.overall}%</div>` +
    `<div class="level-name es">${esc(f.level)}</div>` +
    `<p class="sub">${esc(f.known)} words known · ${esc(f.strong)} locked in</p>`;
  pad.appendChild(head);

  if (f.next.length) {
    const n = f.next[0];
    const card = el('div', 'card');
    card.innerHTML =
      `<p class="label">Next goal</p><div class="row"><div class="big" style="font-size:19px">${esc(n.title)}</div>` +
      `<div class="sub">${esc(n.detail)}</div></div>` +
      `<div class="bar"><i style="width:${Math.round(n.pct * 100)}%"></i></div>`;
    pad.appendChild(card);
  }

  const parts = [
    ['Words you know', f.vocabScore, 35],
    ['Practice accuracy', f.practiceAcc, 20],
    ['Lessons read', f.storyScore, 15],
    ['Patterns found', f.patternScore, 15],
    ['Verbs nailed', f.verbScore, 15],
  ];
  const bd = el('div', 'card');
  bd.innerHTML = '<p class="label">Score breakdown</p>';
  const list = el('div', 'bd');
  for (const [name, score, weight] of parts) {
    const row = el('div', 'bd-row');
    row.innerHTML =
      `<span class="k">${esc(name)}</span>` +
      `<span class="v">${Math.round(score * 100)}% of ${weight}</span>` +
      `<span class="track"><i style="width:${Math.round(score * 100)}%"></i></span>`;
    list.appendChild(row);
  }
  bd.appendChild(list);
  pad.appendChild(bd);

  const ms = el('div', 'card');
  ms.innerHTML = `<p class="label">Milestones earned · ${f.milestones.length}</p>`;
  if (!f.milestones.length) {
    ms.appendChild(el('p', 'muted', 'None yet. Read a lesson and the first one arrives quickly.'));
  }
  for (const m of f.milestones) {
    const row = el('div', 'ms');
    row.innerHTML = `<span class="tick">✓</span><span><span class="t">${esc(m.title)}</span>` +
      `<span class="d">${esc(m.detail)}</span></span>`;
    ms.appendChild(row);
  }
  pad.appendChild(ms);
}

// ══ FLUENCY MAP ═════════════════════════════════════════════
// Every word in the language as one tile, so you can see the whole mountain
// and how much of it you have coloured in.
export function renderMap() {
  const pad = $('mapPad');
  clear(pad);
  const vocab = store.vocab.all();
  const all = Object.keys(content.dict);
  let seen = 0;

  const grid = el('div', 'map-grid');
  for (const w of all) {
    const v = vocab[w];
    const m = v ? memoryStrength(v.exposures || 0, v.lastSeen || 0) : 0;
    const tile = el('i');
    if (m >= 0.8) tile.className = 's3';
    else if (m >= 0.5) tile.className = 's2';
    else if (m > 0) tile.className = 's1';
    if (m > 0) seen++;
    tile.title = w;
    grid.appendChild(tile);
  }

  const pct = all.length ? Math.round((seen / all.length) * 100) : 0;
  $('mapSub').textContent = `${seen} of ${all.length} · ${pct}%`;

  const head = el('div', 'card');
  head.innerHTML =
    `<div class="row"><div><div class="big">${pct}%</div>` +
    `<div class="sub">${seen} of ${all.length} words met</div></div></div>` +
    `<div class="bar"><i style="width:${pct}%"></i></div>`;
  pad.appendChild(head);

  const legend = el('div', 'legend');
  legend.innerHTML =
    '<span class="lg"><i style="background:var(--ceniza3)"></i>Unseen</span>' +
    '<span class="lg"><i style="background:var(--barro)"></i>Fading</span>' +
    '<span class="lg"><i style="background:var(--oro)"></i>Growing</span>' +
    '<span class="lg"><i style="background:var(--jade)"></i>Locked in</span>';
  pad.appendChild(legend);

  const wrap = el('div', 'card');
  wrap.appendChild(grid);
  pad.appendChild(wrap);
}

// ══ DRILLS ══════════════════════════════════════════════════
// One screen, several kinds. Each drill supplies a render function and a way
// to score itself; everything else (progress bar, score, next) is shared.

let drill = null;

function startDrill({ title, sub, items, render }) {
  drill = { title, sub, items, render, index: 0, correct: 0, answered: 0, words: [] };
  $('drillTitle').textContent = title;
  showScreen('drill');
  paintDrill();
}

function paintDrill() {
  const d = drill;
  $('drillSub').textContent = `${d.sub} · ${d.index + 1} of ${d.items.length}`;
  $('drillScore').textContent = `${d.correct} / ${d.answered}`;
  $('drillProg').style.width = `${Math.round((d.index / d.items.length) * 100)}%`;
  const pad = $('drillPad');
  clear(pad);
  d.render(pad, d.items[d.index], finishItem);
}

function finishItem(correct, word) {
  drill.answered++;
  if (correct) drill.correct++;
  if (word) {
    store.recordAnswer(word, correct);
    drill.words.push({ word, correct });
  }
  // Repaint the score now, not on the next question — otherwise you answer
  // and the counter still reads 0 / 0.
  $('drillScore').textContent = `${drill.correct} / ${drill.answered}`;
  activity();
}

function nextButton(pad, label = 'Next') {
  const b = el('button', 'go');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', () => {
    drill.index++;
    if (drill.index >= drill.items.length) return endDrill();
    paintDrill();
  });
  pad.appendChild(b);
  return b;
}

function endDrill() {
  $('drillProg').style.width = '100%';
  sync();
  renderWrap();
}

// ══ MOMO'S OWN QUIZ ═════════════════════════════════════════
// Hold him down and he asks you a word you already know. Two beats and no new
// screen: he says the word, you tap him for the answer. He only ever asks
// about words you have met at least twice, so it stays a memory test rather
// than a guess.
let quizWord = null;

export function momoQuiz() {
  if (!momo) return;
  const vocab = store.vocab.all();
  const pool = Object.keys(vocab).filter((w) => content.dict[w] && (vocab[w].exposures || 0) >= 2);
  if (!pool.length) {
    // Guidance is the app talking, not the bird. His bubble stays in the
    // language you are learning.
    toast('Read a lesson first — then he can test you on it.');
    return;
  }
  quizWord = pool[Math.floor(Math.random() * pool.length)];
  momo.set('speak', `<b>${esc(quizWord)}</b> &nbsp;…?`);
  if (canAudio()) { speech.warmUp(); speech.speak(quizWord, speakOpts()); }
}

/** Consume the next poke as the answer, if one is owed. */
function momoAnswer(m) {
  if (!quizWord) return false;
  const w = quizWord;
  quizWord = null;
  const en = String(content.dict[w]?.en || '').split('/')[0].trim();
  m.set('happy', `<b>${esc(w)}</b> — ${esc(en)}`);
  store.recordExposure(w);
  sync();
  return true;
}

export const momoHooks = { onLongPress: momoQuiz, onPoke: momoAnswer };

// ══ WRAP-UP ═════════════════════════════════════════════════
// A session used to end with a percentage painted into the drill screen,
// where Momo does not live. It ends here now, on the one screen besides Today
// that he is actually on, so a score is something he answers rather than a
// number that appears in an empty room.
let wrapMomo = null;

function wrapBird() {
  if (!wrapMomo) {
    $('wrapMomo').innerHTML = momoSvg('wrap');
    // ambient: false — a second self-arming sleep timer and a second
    // document-wide activity listener would fight the one on Today.
    // poke: false — here he answers your score and nothing else. Poking him
    // belongs on Today; on this screen it would talk over the result.
    wrapMomo = createMomo($('wrapMomo'), $('wrapSpeech'), $('wrapSparks'),
      { ambient: false, poke: false });
  }
  return wrapMomo;
}

function renderWrap() {
  const pct = drill.answered ? Math.round((drill.correct / drill.answered) * 100) : 0;
  const tone = pct >= 80 ? 'var(--jade)' : pct >= 50 ? 'var(--oro)' : 'var(--barro)';

  $('wrapTitle').textContent = `${drill.title} finished`;
  $('wrapSub').textContent = `${drill.correct} of ${drill.answered} right`;
  showScreen('wrap');

  const pad = $('wrapPad');
  clear(pad);

  const score = el('div', 'card center');
  score.innerHTML =
    `<p class="label">${esc(drill.title)}</p>` +
    `<div class="big" style="font-size:42px;color:${tone}">${pct}%</div>` +
    `<p class="sub">${drill.correct} of ${drill.answered} right</p>`;
  pad.appendChild(score);

  // Only the multiple-choice kinds carry a single word — typing, dictation,
  // word order and shadowing are graded against a whole sentence, so there is
  // nothing honest to list for them.
  if (drill.words.length) {
    // A word can come round twice in one drill. Show it once, and if it went
    // wrong on any pass it counts as slipped — colour means memory strength,
    // and getting it right once does not mean it held.
    const seen = new Map();
    for (const { word, correct } of drill.words) {
      seen.set(word, (seen.get(word) ?? true) && correct);
    }
    const got = [...seen].filter(([, ok]) => ok).map(([w]) => w);
    const lost = [...seen].filter(([, ok]) => !ok).map(([w]) => w);
    const tags = (words, cls) => words.map((w) => `<span class="wtag ${cls}">${esc(w)}</span>`).join('');
    const c = el('div', 'card');
    c.innerHTML =
      '<p class="label">Words you met</p>' +
      `<div class="wtags">${tags(got, 'strong')}${tags(lost, 'weak')}</div>`;
    pad.appendChild(c);
  }

  const events = takePending();
  for (const e of events) {
    const c = el('div', 'card center');
    c.innerHTML = `<p class="moment">${e.label}</p>`;
    pad.appendChild(c);
  }

  const again = el('button', 'go');
  again.type = 'button';
  again.textContent = 'Go again';
  again.addEventListener('click', () => {
    drill.index = 0; drill.correct = 0; drill.answered = 0; drill.words = [];
    showScreen('drill');
    paintDrill();
  });
  pad.appendChild(again);

  const home = el('button', 'go ghost');
  home.type = 'button';
  home.textContent = 'Back to today';
  home.addEventListener('click', () => { showScreen('today'); renderToday(); });
  pad.appendChild(home);

  const m = wrapBird();
  m.reactToScore(pct);
  playPending(m, events);
}

// ── review (multiple choice + typing) ───────────────────────
export function startReview() {
  const kinds = ['es_en', 'en_es', 'gap'];
  if (content.lessons.length) kinds.push('type_es');
  const items = generateExercises(store.vocab.all(), content.dict, content.lessons, 12, kinds);
  startDrill({
    title: 'Review', sub: 'Weakest words first', items,
    render: (pad, item, done) => renderExercise(pad, item, done),
  });
}

function renderExercise(pad, item, done) {
  if (item.kind === 'type_es') return renderTyped(pad, item, done);

  const prompt = el('div', 'gap-s');
  if (item.kind === 'es_en') prompt.innerHTML = `<span class="es">${esc(item.word)}</span>`;
  else if (item.kind === 'en_es') prompt.innerHTML = `<span class="en" style="font-size:20px">${esc(item.english)}</span>`;
  else prompt.innerHTML = `<span class="es">${esc(item.sentence)}</span>`;
  pad.appendChild(prompt);

  if (item.translation) pad.appendChild(el('p', 'gap-e en', item.translation));

  const choices = el('div', 'choices');
  for (const opt of item.options) {
    const b = el('button', 'ch', opt);
    b.type = 'button';
    if (item.kind === 'es_en') b.classList.add('en'), b.style.fontFamily = 'var(--sans)', b.style.fontSize = '15px';
    b.addEventListener('click', () => {
      const right = opt === item.correct;
      choices.querySelectorAll('.ch').forEach((c) => {
        c.disabled = true;
        if (c.textContent === item.correct && !right) c.classList.add('right');
        else if (c !== b) c.classList.add('dim');
      });
      b.classList.add(right ? 'right' : 'wrongc');
      done(right, item.word || item.correct);
      const fb = el('div', `fb show ${right ? 'good' : 'bad'}`);
      fb.innerHTML = `<b>${right ? 'Correct' : 'Not that one'}</b><span>${right ? '' : `It was <b>${esc(item.correct)}</b>.`}</span>`;
      pad.appendChild(fb);
      nextButton(pad);
    });
    choices.appendChild(b);
  }
  pad.appendChild(choices);
}

function renderTyped(pad, item, done) {
  pad.appendChild(el('p', 'label', 'Write this in Spanish'));
  pad.appendChild(el('p', 'prompt-en en', item.english));
  const input = el('input', 'typebox');
  input.type = 'text';
  input.autocapitalize = 'none';
  input.autocorrect = 'off';
  input.spellcheck = false;
  input.placeholder = 'Type it…';
  pad.appendChild(input);

  const check = el('button', 'go');
  check.type = 'button';
  check.textContent = 'Check';
  const submit = () => {
    const r = gradeTyped(input.value, item.correct);
    input.disabled = true;
    input.classList.add(r.correct ? 'right' : 'wrongc');
    check.remove();
    done(r.correct, null);
    const fb = el('div', `fb show ${r.correct ? 'good' : 'bad'}`);
    fb.innerHTML = `<b>${r.correct ? 'That is it' : (r.hint || 'Not quite')}</b><span>It reads <b>${esc(item.correct)}</b>.</span>`;
    pad.appendChild(fb);
    nextButton(pad);
  };
  check.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  pad.appendChild(check);
  setTimeout(() => input.focus(), 60);
}

// ── verbs ───────────────────────────────────────────────────
export function startVerbs() {
  const v = content.verbs;
  if (!v) return toast('This course has no verb trainer.');
  const items = [];
  for (let i = 0; i < 10; i++) {
    const verb = pick(v.drill);
    const subj = Math.floor(Math.random() * v.subjects.length);
    const tense = pick(v.tenses);
    const correct = conjugate(v, verb, tense, subj);
    const wrongs = new Set();
    let guard = 0;
    while (wrongs.size < 3 && guard++ < 80) {
      const other = conjugate(v, pick(v.drill), tense, subj);
      if (other !== correct) wrongs.add(other);
    }
    items.push({ verb, subject: v.subjects[subj], tense, correct, options: shuffle([correct, ...wrongs]) });
  }
  startDrill({ title: 'Verb Trainer', sub: 'Conjugation', items, render: renderVerb });
}

function renderVerb(pad, item, done) {
  const card = el('div', 'vcard');
  card.innerHTML =
    `<p class="label" style="margin-bottom:12px">${esc(item.tense)} tense · conjugate for</p>` +
    `<div class="subjpill es">${esc(item.subject)}</div>` +
    `<div class="inf es">${esc(item.verb)}</div>`;
  pad.appendChild(card);

  const choices = el('div', 'choices');
  for (const opt of item.options) {
    const b = el('button', 'ch', opt);
    b.type = 'button';
    b.addEventListener('click', () => {
      const right = opt === item.correct;
      choices.querySelectorAll('.ch').forEach((c) => {
        c.disabled = true;
        if (c.textContent === item.correct && !right) c.classList.add('right');
        else if (c !== b) c.classList.add('dim');
      });
      b.classList.add(right ? 'right' : 'wrongc');
      done(right, null);
      store.progress.bump('verbsTotal');
      if (right) store.progress.bump('verbsCorrect');
      const fb = el('div', `fb show ${right ? 'good' : 'bad'}`);
      fb.innerHTML = `<b>${right ? 'Correct' : 'Not that one'}</b><span>${esc(item.subject)} <b>${esc(item.correct)}</b>.</span>`;
      pad.appendChild(fb);
      nextButton(pad, 'Next verb');
    });
    choices.appendChild(b);
  }
  pad.appendChild(choices);
}

// ── word order ──────────────────────────────────────────────
export function startOrder() {
  const pool = orderCandidates(content.lessons, store.progress.all().storiesRead || []);
  if (!pool.length) return toast('Read a lesson first — this builds sentences from what you have read.');
  const items = shuffle(pool).slice(0, 10);
  startDrill({ title: 'Word Order', sub: 'From what you have read', items, render: renderOrder });
}

function renderOrder(pad, item, done) {
  pad.appendChild(el('p', 'label', 'Build this sentence'));
  pad.appendChild(el('p', 'prompt-en en', item.en));

  const build = el('div', 'build');
  const bank = el('div', 'bank');
  pad.appendChild(build);
  pad.appendChild(bank);

  for (const word of scramble(item.words)) {
    const b = el('button', 'wchip', word);
    b.type = 'button';
    b.addEventListener('click', () => {
      if (build.classList.contains('ok')) return;
      b.classList.add('used');
      const c = el('button', 'wchip', word);
      c.type = 'button';
      c.addEventListener('click', () => {
        if (build.classList.contains('ok')) return;
        c.remove(); b.classList.remove('used'); build.className = 'build';
      });
      build.appendChild(c);
    });
    bank.appendChild(b);
  }

  const check = el('button', 'go');
  check.type = 'button';
  check.textContent = 'Check';
  check.addEventListener('click', () => {
    const got = [...build.querySelectorAll('.wchip')].map((c) => c.textContent);
    if (!got.length) return toast('Tap the words to build it');
    const right = got.join(' ') === item.words.join(' ');
    build.className = `build ${right ? 'ok' : 'no'}`;
    done(right, null);
    store.progress.bump('orderTotal');
    if (right) store.progress.bump('orderCorrect');
    const fb = el('div', `fb show ${right ? 'good' : 'bad'}`);
    fb.innerHTML = `<b>${right ? 'That is it' : 'Not the order'}</b><span>It reads <b>${esc(item.es)}</b> — from ${esc(item.lessonTitle)}.</span>`;
    pad.appendChild(fb);
    check.remove();
    nextButton(pad, 'Next sentence');
  });
  pad.appendChild(check);
}

// ── dictation ───────────────────────────────────────────────
export function startDictation() {
  if (!canAudio()) return toast('This course has no voice.');
  const sentences = content.lessons.flatMap((l) => l.sentences || []);
  if (!sentences.length) return toast('No lessons to listen to yet.');
  const items = shuffle(sentences).slice(0, 8);
  speech.warmUp();
  startDrill({ title: 'Dictation', sub: 'Type what you hear', items, render: renderDictation });
}

function renderDictation(pad, item, done) {
  const card = el('div', 'card center');
  card.innerHTML = '<p class="label" style="margin-bottom:14px">Listen, then write it</p>';
  const play = el('button', 'go');
  play.type = 'button';
  play.textContent = '🔊 Play again';
  play.addEventListener('click', () => { speech.speak(item.es, speakOpts()); });
  card.appendChild(play);

  const ladder = el('div', 'ladder');
  ladder.style.marginTop = '12px';
  speech.LADDER.forEach(() => ladder.appendChild(el('div', 'rung')));
  card.appendChild(ladder);

  const slow = el('button', 'go ghost');
  slow.type = 'button';
  slow.textContent = 'Speed ladder — slow to native';
  slow.style.marginTop = '10px';
  slow.addEventListener('click', async () => {
    const rungs = [...ladder.children];
    await speech.speakLadder(item.es, speakOpts(), (i) => {
      rungs.forEach((r, j) => { r.className = 'rung' + (j < i ? ' done' : j === i ? ' on' : ''); });
    });
    rungs.forEach((r) => { r.className = 'rung done'; });
  });
  card.appendChild(slow);
  pad.appendChild(card);

  const input = el('input', 'typebox');
  input.type = 'text';
  input.autocapitalize = 'none';
  input.autocorrect = 'off';
  input.spellcheck = false;
  input.placeholder = 'What did you hear?';
  pad.appendChild(input);

  const check = el('button', 'go');
  check.type = 'button';
  check.textContent = 'Check';
  const submit = () => {
    const r = gradeTyped(input.value, item.es);
    input.disabled = true;
    input.classList.add(r.correct ? 'right' : 'wrongc');
    check.remove();
    done(r.correct, null);
    store.progress.bump('dictationTotal');
    if (r.correct) store.progress.bump('dictationCorrect');
    const fb = el('div', `fb show ${r.correct ? 'good' : 'bad'}`);
    fb.innerHTML = `<b>${r.correct ? 'Heard it' : (r.hint || 'Not quite')}</b><span>It was <b>${esc(item.es)}</b> — ${esc(item.en)}</span>`;
    pad.appendChild(fb);
    nextButton(pad);
  };
  check.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  pad.appendChild(check);

  speech.speak(item.es, speakOpts());
}

// ── shadowing ───────────────────────────────────────────────
export function startShadow() {
  if (!canAudio()) return toast('This course has no voice.');
  if (!speech.canRecord()) return toast('This browser cannot record audio.');
  const sentences = content.lessons.flatMap((l) => l.sentences || []);
  if (!sentences.length) return toast('No lessons to shadow yet.');
  speech.warmUp();
  startDrill({
    title: 'Shadowing', sub: 'Hear it, say it, compare', items: shuffle(sentences).slice(0, 6),
    render: renderShadow,
  });
}

function renderShadow(pad, item, done) {
  const card = el('div', 'card center');
  card.innerHTML =
    `<p class="label">Say this back</p><div class="es" style="font-size:22px;line-height:1.4">${esc(item.es)}</div>` +
    `<p class="sub" style="margin-top:8px">${esc(item.en)}</p>`;
  pad.appendChild(card);

  const listen = el('button', 'go ghost');
  listen.type = 'button';
  listen.textContent = '🔊 Hear it';
  listen.addEventListener('click', () => { speech.speak(item.es, speakOpts()); });
  pad.appendChild(listen);

  const rec = el('button', 'recbtn', '●');
  rec.type = 'button';
  rec.setAttribute('aria-label', 'Record yourself');
  pad.appendChild(rec);

  const player = el('audio');
  player.controls = true;
  player.style.width = '100%';
  player.style.display = 'none';
  pad.appendChild(player);

  const recorder = speech.createRecorder();
  let recording = false;
  rec.addEventListener('click', async () => {
    try {
      if (!recording) {
        await recorder.start();
        recording = true;
        rec.classList.add('recording');
        rec.textContent = '■';
      } else {
        const url = await recorder.stop();
        recording = false;
        rec.classList.remove('recording');
        rec.textContent = '●';
        if (url) { player.src = url; player.style.display = 'block'; }
        done(true, null);   // nothing to fail — the point is hearing yourself
        if (!pad.querySelector('.go:last-of-type[data-next]')) {
          const b = nextButton(pad, 'Next line');
          b.dataset.next = '1';
        }
      }
    } catch (e) {
      toast(e.message || 'Could not use the microphone.');
    }
  });
}

// ══ PATTERNS ════════════════════════════════════════════════
export function renderPatterns() {
  const pad = $('patternsPad');
  clear(pad);
  const unlocked = store.patterns.unlocked();
  $('patCount').textContent = `${unlocked.length} of ${content.patterns.length}`;
  if (!content.patterns.length) {
    pad.innerHTML = '<p class="empty">This course has no patterns.</p>';
    return;
  }
  const vocab = store.vocab.all();
  for (const p of content.patterns) {
    const open = unlocked.includes(p.id);
    const met = (p.trigger || []).filter((w) => (vocab[w]?.exposures || 0) >= 1).length;
    const need = Math.max(0, (p.min || 3) - met);

    const box = el('div', 'pat' + (open ? '' : ' lock'));
    const head = el('button', 'pat-h');
    head.type = 'button';
    head.innerHTML =
      `<span><span class="pat-t">${esc(p.title)}</span>` +
      `<span class="pat-s">${open ? 'Unlocked as you read' : `Keep reading — ${need} more word${need === 1 ? '' : 's'} to go`}</span></span>` +
      `<span class="caret">${open ? '›' : '🔒'}</span>`;
    box.appendChild(head);

    if (open) {
      const body = el('div', 'pat-c');
      body.innerHTML = md(p.text || '');
      box.appendChild(body);
      head.addEventListener('click', () => {
        const was = box.classList.contains('open');
        pad.querySelectorAll('.pat').forEach((x) => x.classList.remove('open'));
        if (!was) box.classList.add('open');
      });
    }
    pad.appendChild(box);
  }
}

// ══ EMERGENCY PHRASEBOOK ════════════════════════════════════
export function openPhrases() {
  const pad = $('phrasesPad');
  clear(pad);
  const groups = content.manifest?.emergencyData || [];
  if (!groups.length) {
    pad.innerHTML = '<p class="empty">This course has no emergency phrases.</p>';
  }
  for (const g of groups) {
    const c = el('div', 'card');
    c.innerHTML = `<p class="label">${esc(g.title)}</p>`;
    for (const ph of g.phrases || []) {
      const row = el('div', 'line');
      row.style.margin = '0 0 14px';
      row.innerHTML = `<span class="s es" style="font-size:17px;color:var(--txt)">${esc(ph.es)}</span>` +
        `<span class="e" style="color:var(--txt3)">${esc(ph.en)}</span>`;
      if (canAudio()) {
        const b = el('button', 'spk', '🔊');
        b.type = 'button';
        b.style.color = 'var(--oro)';
        b.addEventListener('click', () => { speech.warmUp(); speech.speak(ph.es, speakOpts()); });
        row.querySelector('.s').appendChild(b);
      }
      c.appendChild(row);
    }
    pad.appendChild(c);
  }
  showScreen('phrases');
}

// ══ SETTINGS ════════════════════════════════════════════════
let onSignOut = () => {};
let onSwitchLanguage = () => {};
export function setSettingsHandlers(h) { onSignOut = h.signOut; onSwitchLanguage = h.switchLanguage; }

export function renderSettings() {
  const pad = $('settingsPad');
  clear(pad);
  $('settingsSub').textContent = `${session.name} · ${session.userId}`;
  const s = store.settings.all();

  const group = (title) => { pad.appendChild(el('h4', null, title)); };
  const row = (k, kd, valueHtml, onClick) => {
    const n = el(onClick ? 'button' : 'div', 'setrow');
    if (onClick) { n.type = 'button'; n.addEventListener('click', onClick); }
    n.innerHTML = `<span><span class="k">${esc(k)}</span><span class="kd">${esc(kd)}</span></span><span class="v">${valueHtml}</span>`;
    pad.appendChild(n);
    return n;
  };
  const toggle = (k, kd, on, onChange) => {
    const n = el('div', 'setrow');
    n.innerHTML = `<span><span class="k">${esc(k)}</span><span class="kd">${esc(kd)}</span></span>`;
    const t = el('button', 'tog' + (on ? ' on' : ''));
    t.type = 'button';
    t.setAttribute('aria-label', k);
    t.addEventListener('click', () => { t.classList.toggle('on'); onChange(t.classList.contains('on')); });
    n.appendChild(t);
    pad.appendChild(n);
  };

  group('Learning');
  row('Language', 'Switches lessons, words and voice',
    `${esc(content.language?.flag || '')} ${esc(content.language?.name || '')} ›`, () => onSwitchLanguage());

  const goalRow = el('div', 'setrow');
  goalRow.innerHTML = '<span><span class="k">Daily goal</span><span class="kd">Reps to keep the streak alive</span></span>';
  const seg = el('span', 'seg');
  for (const n of [10, 20, 40]) {
    const b = el('button', store.daily.goal() === n ? 'on' : '', String(n));
    b.type = 'button';
    b.addEventListener('click', () => {
      store.daily.setGoal(n);
      seg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      toast(`Daily goal set to <b>${n}</b>`);
    });
    seg.appendChild(b);
  }
  const segWrap = el('span', 'v');
  segWrap.appendChild(seg);
  goalRow.appendChild(segWrap);
  pad.appendChild(goalRow);

  toggle('Remind me each evening', 'A nudge if you have not practised', s.reminder, (v) => store.settings.set('reminder', v));

  if (content.has('audio')) {
    group('Voice');
    const rateRow = el('div', 'setrow');
    rateRow.innerHTML = '<span><span class="k">Speaking speed</span><span class="kd">Slower while you are starting out</span></span>';
    const slider = el('input', 'slider');
    slider.type = 'range'; slider.min = '20'; slider.max = '100';
    slider.value = String(Math.round((s.speechRate || 0.45) * 100));
    slider.setAttribute('aria-label', 'Speaking speed');
    slider.addEventListener('change', () => {
      store.settings.set('speechRate', Number(slider.value) / 100);
      speech.speak('Así de rápido', speakOpts());
    });
    const w = el('span', 'v'); w.appendChild(slider);
    rateRow.appendChild(w);
    pad.appendChild(rateRow);

    toggle('Read lines aloud automatically', 'Plays the first line when a lesson opens', s.autoplay, (v) => store.settings.set('autoplay', v));
    toggle('Scenes play before showing English', 'Listen first, then reveal', s.listenFirst !== false, (v) => store.settings.set('listenFirst', v));
  }

  group('Friends');
  row('Invite a friend', 'They open the link and pick their own user ID', '›', async () => {
    const url = location.href.split('#')[0];
    try {
      if (navigator.share) await navigator.share({ title: 'Fluidez', text: 'Learn Nicaraguan Spanish with me', url });
      else { await navigator.clipboard.writeText(url); toast('Link copied'); }
    } catch {}
  });
  toggle('Show me on the streak board', 'Friends see your streak and level', s.shareStreak, (v) => {
    store.settings.set('shareStreak', v);
    if (!v) cloud.removeBoardRow(session.userId);
    else sync();
  });

  group('Content');
  const upd = row('Check for new lessons', `Version ${packVersion(content.language?.code) ?? '—'}`, '›', async () => {
    upd.querySelector('.v').textContent = 'checking…';
    const r = await checkForContentUpdate(content.language);
    if (r.offline) return toast('No connection right now.');
    if (!r.available) { upd.querySelector('.v').textContent = '✓ up to date'; return toast('Already up to date.'); }
    toast('New lessons found — downloading');
    onSwitchLanguage(content.language.code, true);
  });
  row('Downloaded', 'Everything works with no signal',
    `${content.lessons.length} lessons · ${content.scenarios.length} scenes`, null);
  row('Storage used', `Cached ${ago(content.manifest ? undefined : undefined)}`.replace('Cached never', 'On this device'),
    esc(bytes(cacheSize())), null);

  group('Account');
  row('Signed in as', session.userId, esc(session.name), null);
  row('Sign out', 'Your progress stays safe in the cloud', '›', () => onSignOut());

  group('About');
  row('Version', window.__FLUIDEZ_VERSION__ || 'dev', '', null);
  const reset = row('Reset my progress', 'Clears every word, streak and lesson', '›', () => {
    if (!confirm('Reset everything? Your words, streak and lessons all go back to zero.')) return;
    if (!confirm('Really? This cannot be undone.')) return;
    store.wipeUser(session.userId);
    location.reload();
  });
  reset.classList.add('danger');
}

// ── wiring ──────────────────────────────────────────────────
function wire() {
  $('readBack').addEventListener('click', () => { closeSheet(); showScreen('path'); renderPath(); });
  $('shClose').addEventListener('click', closeSheet);
  $('readSpeak').addEventListener('click', () => {
    if (!openLesson || !canAudio()) return;
    speech.warmUp();
    (async () => {
      for (const sn of openLesson.sentences) {
        await speech.speak(sn.es, speakOpts());
      }
    })();
  });
  $('sceneClose').addEventListener('click', () => { showScreen('scenes'); renderScenes(); });
  $('drillClose').addEventListener('click', () => { speech.stop(); showScreen('today'); renderToday(); });
  $('wrapClose').addEventListener('click', () => { showScreen('today'); renderToday(); });
  $('patClose').addEventListener('click', () => { showScreen('today'); renderToday(); });
  $('phrasesClose').addEventListener('click', () => { showScreen('today'); renderToday(); });
  $('settingsClose').addEventListener('click', () => { showScreen('today'); renderToday(); });
  $('gearBtn').addEventListener('click', () => { showScreen('settings'); renderSettings(); });
  $('wuCard').addEventListener('click', revealWarmup);
  $('wuNext').addEventListener('click', advanceWarmup);
  $('wuClose').addEventListener('click', () => openReader(warm.lesson));
  $('fluencyClose').addEventListener('click', () => { showScreen('today'); renderToday(); });
  $('mapBtn').addEventListener('click', () => { showScreen('map'); renderMap(); });
  $('mapClose').addEventListener('click', () => { showScreen('fluency'); renderFluency(); });
  let searchTimer = null;
  $('wordSearch').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderWords, 120);
  });
  $('langChip').addEventListener('click', () => onSwitchLanguage());
  for (const id of ['levelChip', 'levelChip2', 'levelChip3', 'levelChip4']) {
    $(id)?.addEventListener('click', () => { showScreen('fluency'); renderFluency(); });
  }
}

export const RENDERERS = {
  today: renderToday, path: renderPath, scenes: renderScenes,
  words: renderWords, patterns: renderPatterns, settings: renderSettings,
  fluency: renderFluency, map: renderMap,
};
