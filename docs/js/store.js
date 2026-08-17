// Local storage for everything the app knows about you.
//
// Progress is namespaced by user id, so two people sharing a phone never see
// each other's words. This is the source of truth; the cloud is a mirror that
// gets pushed to when there is a network and pulled from when you sign in
// somewhere new.

const NS = 'fl';
let userId = null;
let onChange = () => {};

export function setUser(id) { userId = id; }
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

function write(name, value) {
  try { localStorage.setItem(key(name), JSON.stringify(value)); } catch {}
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
    updatedAt: Date.now(),
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
}

export function wipeUser(id) {
  const prefix = `${NS}:${id}:`;
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(prefix)) localStorage.removeItem(k);
    }
  } catch {}
}
