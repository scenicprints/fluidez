// Local storage for everything the app knows about you.
//
// Progress is namespaced by user id, so two people sharing a phone never see
// each other's words. This is the source of truth; the cloud is a mirror that
// gets pushed to when there is a network and pulled from when you sign in
// somewhere new.

const NS = 'fl';
let userId = null;
let course = null;
let onChange = () => {};

export function setUser(id) {
  userId = id;
  // The course has to be known before anything is read, and settings is where
  // it lives — so derive it here rather than waiting for the pack to load.
  course = settings.get('language') || null;
  migrateToPerCourse();
  adoptStamp();
}
export function currentUser() { return userId; }
export function onStoreChange(fn) { onChange = fn; }

/**
 * Which course the reader is on. Everything about a course is stored under it.
 *
 * Progress used to be keyed on the user alone, so it was SHARED between
 * courses — and because both courses number their stories p0-01..p7-18, it did
 * not merely leak, it ALIASED: fifteen Spanish stories read made the German
 * Path show fifteen read, and the vocabulary of both languages piled into one
 * map. Called by applyPack(), so it follows the pack rather than being set by
 * hand anywhere.
 */
export function setCourse(code) {
  if (!code || code === course) return;
  course = code;
  onChange('course', code);
}
export function currentCourse() { return course; }

const key = (name) => `${NS}:${userId || '_'}:${name}`;
// A course's own key. Falls back to the flat one when no course is known yet,
// so a read before the pack loads still finds something rather than nothing.
const scoped = (name) => (course ? `${NS}:${userId || '_'}:${course}:${name}` : key(name));

// What belongs to a COURSE rather than to the person. Everything else —
// settings, the daily streak, the goal, the game — is about the reader and
// stays whole across a switch: doing a German lesson today has to keep
// yesterday's streak alive.
const PER_COURSE = new Set(['vocab', 'progress', 'patterns']);
const keyFor = (name) => (PER_COURSE.has(name) ? scoped(name) : key(name));

function read(name, fallback) {
  try {
    const raw = localStorage.getItem(keyFor(name));
    return raw === null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}

/**
 * Move a pre-split device's progress under the course it was really for.
 *
 * Everything before this was flat, and it was all Spanish: de-ch shipped with
 * zero lessons until the day this landed, so there was no German progress that
 * could be worth keeping. Anything found is filed under es-ni. Runs once —
 * afterwards the flat keys are gone and there is nothing left to move.
 */
function migrateToPerCourse() {
  if (!userId) return;
  try {
    for (const name of PER_COURSE) {
      const flat = key(name);
      const raw = localStorage.getItem(flat);
      if (raw === null) continue;
      const target = `${NS}:${userId}:es-ni:${name}`;
      if (localStorage.getItem(target) === null) localStorage.setItem(target, raw);
      localStorage.removeItem(flat);
    }
  } catch {}
}

// Which fields make up the snapshot the cloud mirrors. Writing one of them
// stamps `updatedAt`, and that stamp is the only honest answer to "is this
// device's copy newer than the cloud's?".
//
// It must be persisted, not computed. snapshot() used to report Date.now(),
// which made every comparison against it read "local is newer" — so the
// returning-user pull in app.js could never fire, and a second device would
// quietly push its stale progress over the first one's.
//
// Only synced fields touch it. Momo remembering a line he has said is not a
// change worth blocking a pull over.
const SYNCED = new Set([
  'vocab', 'progress', 'patterns', 'settings',
  'streak', 'longest', 'lastActive', 'todayCount', 'game',
]);

function stamp(ms = Date.now()) {
  try { localStorage.setItem(key('updatedAt'), JSON.stringify(ms)); } catch {}
}

/** When this device's synced state last changed. 0 means "never touched". */
export function lastChanged() { return read('updatedAt', 0) || 0; }

/**
 * Devices that predate the stamp have no `updatedAt` at all, which reads as
 * "never changed" — and that would let the very first launch after this
 * upgrade pull an older cloud copy over a session this phone did offline and
 * never managed to push. So a device that already has progress on it counts
 * as having changed now; only a genuinely empty one stays at zero.
 */
function adoptStamp() {
  if (!userId) return;
  if (read('updatedAt', null) !== null) return;
  const used = Object.keys(vocab.all()).length > 0 ||
    (progress.all().storiesRead || []).length > 0;
  stamp(used ? Date.now() : 0);
}

function write(name, value) {
  try { localStorage.setItem(keyFor(name), JSON.stringify(value)); } catch {}
  if (SYNCED.has(name)) stamp();
  onChange(name, value);
}

// ── device-wide (not per user) ──────────────────────────────
export const device = {
  lastUser: () => { try { return localStorage.getItem(globalKey('lastUser')); } catch { return null; } },
  setLastUser: (id) => { try { localStorage.setItem(globalKey('lastUser'), id); } catch {} },
  clearLastUser: () => { try { localStorage.removeItem(globalKey('lastUser')); } catch {} },
  setupDone: () => { try { return localStorage.getItem(globalKey('setupDone')) === '1'; } catch { return false; } },
  markSetupDone: () => { try { localStorage.setItem(globalKey('setupDone'), '1'); } catch {} },
};

// ── vocabulary ──────────────────────────────────────────────
// { word: { exposures, lastSeen, hits, misses } }
export const vocab = {
  all: () => read('vocab', {}),
  save: (v) => write('vocab', v),
};

// Meeting a word in the wild — reading it, seeing it in a drill.
export function recordExposure(words, times = 1) {
  const v = vocab.all();
  const now = Date.now();
  for (const w of [].concat(words)) {
    if (!w) continue;
    const e = v[w] || { exposures: 0, lastSeen: 0, hits: 0, misses: 0, lookups: 0 };
    e.exposures = (e.exposures || 0) + times;
    e.lastSeen = now;
    v[w] = e;
  }
  vocab.save(v);
}

// Answering about a word. A recall is its own event, worth three sightings in
// the engine, so it does NOT also count as an exposure — that would make it
// worth four and quietly re-merge the two things we just separated.
//
// A miss deliberately leaves `lastSeen` alone. Refreshing the clock on a wrong
// answer would make being wrong about an old word RAISE its strength, which is
// the opposite of what happened.
export function recordAnswer(word, correct) {
  if (!word) return;
  const v = vocab.all();
  const e = v[word] || { exposures: 0, lastSeen: 0, hits: 0, misses: 0, lookups: 0 };
  if (correct) { e.hits = (e.hits || 0) + 1; e.lastSeen = Date.now(); }
  else { e.misses = (e.misses || 0) + 1; }
  v[word] = e;
  vocab.save(v);
}

// Tapping a word for its meaning. This is the clearest signal in the app that
// you do NOT know a word, and it used to be recorded as evidence that you did.
// Like a miss it leaves `lastSeen` alone: looking a word up is not a reason for
// it to look fresher than it is.
export function recordLookup(word) {
  if (!word) return;
  const v = vocab.all();
  const e = v[word] || { exposures: 0, lastSeen: 0, hits: 0, misses: 0, lookups: 0 };
  e.lookups = (e.lookups || 0) + 1;
  v[word] = e;
  vocab.save(v);
}

// ── progress ────────────────────────────────────────────────
const BLANK_PROGRESS = {
  storiesRead: [], scenariosDone: [],
  practiceScore: 0, practiceTotal: 0,
  verbsCorrect: 0, verbsTotal: 0,
  orderCorrect: 0, orderTotal: 0,
  dictationCorrect: 0, dictationTotal: 0,
};

// Spreading a constant that holds arrays hands out the SAME array to
// everybody, and markRead() then pushes into it. On a shared phone the second
// user inherited the first one's stories until the page was reloaded, which is
// exactly what namespacing by user id is supposed to prevent. Clone it.
const blank = (o) => JSON.parse(JSON.stringify(o));

export const progress = {
  all: () => ({ ...blank(BLANK_PROGRESS), ...read('progress', {}) }),
  save: (p) => write('progress', p),
  bump(field, by = 1) {
    const p = this.all();
    p[field] = (p[field] || 0) + by;
    this.save(p);
    return p;
  },
  markRead(id) {
    const p = this.all();
    if (!p.storiesRead.includes(id)) { p.storiesRead.push(id); this.save(p); }
  },
  markScenario(id) {
    const p = this.all();
    if (!p.scenariosDone.includes(id)) { p.scenariosDone.push(id); this.save(p); }
  },
};

// Which of Momo's lines you have already heard him say. Kept so that the
// first time a line becomes available — because you finally met the word that
// unlocks it — he uses that one, and it lands as him having learnt something.
export const momoLines = {
  heard: () => read('momoLines', []),
  save: (list) => write('momoLines', list),
  learn(id) {
    const list = this.heard();
    if (!list.includes(id)) { list.push(id); this.save(list); }
  },
};

// One-off things Momo has already remarked on — a friend overtaking your
// streak, say. Separate from momoLines so it cannot muddle which of his lines
// count as newly learnt.
export const momoSeen = {
  all: () => read('momoSeen', []),
  /** Records `key` and returns true only the first time it is seen. */
  mark(key) {
    const list = this.all();
    if (list.includes(key)) return false;
    list.push(key);
    write('momoSeen', list);
    return true;
  },
};

export const patterns = {
  unlocked: () => read('patterns', []),
  save: (list) => write('patterns', list),
  unlock(id) {
    const list = this.unlocked();
    if (!list.includes(id)) { list.push(id); this.save(list); }
  },
};

// ── streak and daily goal ───────────────────────────────────
const dayStamp = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const daily = {
  goal: () => read('goal', 20),
  setGoal: (n) => write('goal', n),
  streak: () => read('streak', 0),
  longest: () => read('longest', 0),
  lastActive: () => read('lastActive', null),
  todayCount() {
    return this.lastActive() === dayStamp() ? read('todayCount', 0) : 0;
  },
  metToday() { return this.todayCount() >= this.goal(); },

  // Called whenever you actually do something — read a line, answer a drill.
  record(reps = 1) {
    const today = dayStamp();
    const last = this.lastActive();
    if (last === today) {
      write('todayCount', this.todayCount() + reps);
      return { streak: this.streak(), newDay: false };
    }
    const yesterday = dayStamp(new Date(Date.now() - 86400000));
    const next = last === yesterday ? this.streak() + 1 : 1;
    write('streak', next);
    write('longest', Math.max(next, this.longest()));
    write('lastActive', today);
    write('todayCount', reps);
    return { streak: next, newDay: true };
  },
};

// ── settings ────────────────────────────────────────────────
const BLANK_SETTINGS = {
  language: null,
  speechRate: 0.45,
  autoplay: false,
  reminder: true,
  shareStreak: true,
};

export const settings = {
  all: () => ({ ...BLANK_SETTINGS, ...read('settings', {}) }),
  save: (s) => write('settings', s),
  set(k, v) { const s = this.all(); s[k] = v; this.save(s); return s; },
  get(k) { return this.all()[k]; },
};

// ── the game ────────────────────────────────────────────────
// What Granada remembers about you: which missions you have finished, which
// ones the street has told you about, how many times you have met each phrase
// (that is what fades the help), and where you were standing.
//
// `heard` is the whole quest log. There are no map markers by design, so a
// mission you have not been pointed at does not appear in the log at all —
// you can still walk into it, it is simply not something you know about yet.
const BLANK_GAME = { done: [], heard: [], spoke: [], seen: {}, at: null, track: null, pin: null };

export const game = {
  all: () => ({ ...blank(BLANK_GAME), ...read('game', {}) }),
  save: (g) => write('game', g),
  finish(id) {
    const g = this.all();
    if (!g.done.includes(id)) { g.done.push(id); this.save(g); }
    return g;
  },
  hear(ids) {
    const g = this.all();
    let any = false;
    for (const id of ids || []) if (!g.heard.includes(id)) { g.heard.push(id); any = true; }
    if (any) this.save(g);
    return g;
  },
  /**
   * Somebody in the street you have already stopped and asked. Their mark stays
   * out across sessions — `heard` records what they pointed AT, which is not the
   * same thing and says nothing at all about a crowd line that points nowhere.
   */
  spokeTo(id) {
    const g = this.all();
    if (!g.spoke.includes(id)) { g.spoke.push(id); this.save(g); }
    return g;
  },
  /** One more meeting with a phrase. The help ladder reads this. */
  met(keyPhrase) {
    const g = this.all();
    g.seen[keyPhrase] = (g.seen[keyPhrase] || 0) + 1;
    this.save(g);
    return g.seen[keyPhrase];
  },
  where(x, y) { const g = this.all(); g.at = { x, y }; this.save(g); },
  tracking(id) { const g = this.all(); g.track = id || null; this.save(g); },
  /** A place on the map you dropped a pin on, in TILES. Null clears it. */
  setPin(x, y) {
    const g = this.all();
    g.pin = (x === null || x === undefined) ? null : { x, y };
    this.save(g);
    return g.pin;
  },
};

// ── the whole picture, for syncing ──────────────────────────
function courseCodes() {
  // Every course this device has anything for, read off the keys themselves so
  // a new one needs no list kept in step.
  const out = new Set(course ? [course] : []);
  try {
    const prefix = `${NS}:${userId || '_'}:`;
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length).split(':');
      if (rest.length === 2 && PER_COURSE.has(rest[1])) out.add(rest[0]);
    }
  } catch {}
  return [...out];
}

function courseBlob(code) {
  const at = (name) => {
    try {
      const raw = localStorage.getItem(`${NS}:${userId || '_'}:${code}:${name}`);
      return raw === null ? null : JSON.parse(raw);
    } catch { return null; }
  };
  return {
    vocab: at('vocab') || {},
    progress: at('progress') || {},
    patterns: at('patterns') || [],
  };
}

export function snapshot() {
  const courses = {};
  for (const code of courseCodes()) courses[code] = courseBlob(code);
  return {
    // Per course, and ALL of them — a phone that syncs only the course it
    // happens to have open would push the other one's progress away.
    courses,
    // vocab, progress and patterns are DELIBERATELY not at the top level any
    // more. Leaving them there for backwards compatibility would have meant
    // publishing whichever course happened to be open under the old flat
    // names — so a device still on the previous build would pull German
    // progress and restore it as Spanish. Omitting them makes that same
    // device skip progress entirely and keep its own, which is the safe
    // failure. It picks the new shape up as soon as it updates, and the app
    // updates itself from Pages.
    settings: settings.all(),
    streak: daily.streak(),
    longest: daily.longest(),
    lastActive: daily.lastActive(),
    todayCount: read('todayCount', 0),
    game: game.all(),
    updatedAt: lastChanged(),
  };
}

// Used when signing in on a new device: whatever the cloud has, take it.
export function restore(snap) {
  if (!snap) return;
  if (snap.courses && typeof snap.courses === 'object') {
    // The current shape: every course restored under its own keys.
    for (const [code, blob] of Object.entries(snap.courses)) {
      if (!blob) continue;
      const put = (name, value) => {
        if (value === undefined || value === null) return;
        try {
          localStorage.setItem(`${NS}:${userId || '_'}:${code}:${name}`, JSON.stringify(value));
        } catch {}
      };
      put('vocab', blob.vocab);
      put('progress', blob.progress);
      put('patterns', blob.patterns);
    }
  } else {
    // A document written before progress was split. It is all Spanish — de-ch
    // had no lessons until the split shipped — so it lands under es-ni rather
    // than over whichever course this device happens to have open.
    const legacy = (name, value) => {
      if (!value) return;
      try {
        localStorage.setItem(`${NS}:${userId || '_'}:es-ni:${name}`, JSON.stringify(value));
      } catch {}
    };
    legacy('vocab', snap.vocab);
    legacy('progress', snap.progress);
    legacy('patterns', snap.patterns);
  }
  if (snap.settings) write('settings', snap.settings);
  if (typeof snap.streak === 'number') write('streak', snap.streak);
  if (typeof snap.longest === 'number') write('longest', snap.longest);
  if (snap.lastActive) write('lastActive', snap.lastActive);
  if (typeof snap.todayCount === 'number') write('todayCount', snap.todayCount);
  if (snap.game) write('game', snap.game);
  // Adopt the cloud's own stamp, not "now". The device has not changed
  // anything, it has caught up — so the next comparison must still be able to
  // tell that a third device pushing later is newer than this.
  if (typeof snap.updatedAt === 'number') stamp(snap.updatedAt);
}

export function wipeUser(id) {
  const prefix = `${NS}:${id}:`;
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(prefix)) localStorage.removeItem(k);
    }
  } catch {}
}
