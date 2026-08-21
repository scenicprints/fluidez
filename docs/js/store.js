// Local storage for everything the app knows about you.
//
// Progress is namespaced by user id, so two people sharing a phone never see
// each other's words. This is the source of truth; the cloud is a mirror that
// gets pushed to when there is a network and pulled from when you sign in
// somewhere new.

const NS = 'fl';
let userId = null;
let onChange = () => {};

export function setUser(id) { userId = id; adoptStamp(); }
export function currentUser() { return userId; }
export function onStoreChange(fn) { onChange = fn; }

const key = (name) => `${NS}:${userId || '_'}:${name}`;
const globalKey = (name) => `${NS}:${name}`;

function read(name, fallback) {
  try {
    const raw = localStorage.getItem(key(name));
    return raw === null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
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
  'streak', 'longest', 'lastActive', 'todayCount',
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
  try { localStorage.setItem(key(name), JSON.stringify(value)); } catch {}
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
    const e = v[w] || { exposures: 0, lastSeen: 0, hits: 0, misses: 0 };
    e.exposures = (e.exposures || 0) + times;
    e.lastSeen = now;
    v[w] = e;
  }
  vocab.save(v);
}

// Answering about a word — right answers strengthen, wrong ones mark a leech.
export function recordAnswer(word, correct) {
  if (!word) return;
  const v = vocab.all();
  const e = v[word] || { exposures: 0, lastSeen: 0, hits: 0, misses: 0 };
  if (correct) { e.hits = (e.hits || 0) + 1; e.exposures = (e.exposures || 0) + 1; e.lastSeen = Date.now(); }
  else { e.misses = (e.misses || 0) + 1; }
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

export const progress = {
  all: () => ({ ...BLANK_PROGRESS, ...read('progress', {}) }),
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

// ── the whole picture, for syncing ──────────────────────────
export function snapshot() {
  return {
    vocab: vocab.all(),
    progress: progress.all(),
    patterns: patterns.unlocked(),
    settings: settings.all(),
    streak: daily.streak(),
    longest: daily.longest(),
    lastActive: daily.lastActive(),
    todayCount: read('todayCount', 0),
    updatedAt: lastChanged(),
  };
}

// Used when signing in on a new device: whatever the cloud has, take it.
export function restore(snap) {
  if (!snap) return;
  if (snap.vocab) write('vocab', snap.vocab);
  if (snap.progress) write('progress', snap.progress);
  if (snap.patterns) write('patterns', snap.patterns);
  if (snap.settings) write('settings', snap.settings);
  if (typeof snap.streak === 'number') write('streak', snap.streak);
  if (typeof snap.longest === 'number') write('longest', snap.longest);
  if (snap.lastActive) write('lastActive', snap.lastActive);
  if (typeof snap.todayCount === 'number') write('todayCount', snap.todayCount);
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
