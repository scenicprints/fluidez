// Firebase: the mirror, never the master.
//
// The app is fully usable with no network and no Firebase at all — progress
// lives in local storage and this module only pushes it up and pulls it down.
// Every function here fails soft, because "no signal in Nicaragua" is the
// normal case, not the exception.

import { firebaseConfig } from './config.js';
import * as auth from './auth.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.5';

let app = null;
let db = null;
let fs = null;            // the firestore module namespace
let ready = null;         // in-flight init promise
let failed = false;

export const isConfigured = () => !!(firebaseConfig && firebaseConfig.projectId);
export const isOnline = () => navigator.onLine !== false;

async function init() {
  if (db) return db;
  if (failed || !isConfigured() || !isOnline()) return null;
  if (ready) return ready;

  ready = (async () => {
    try {
      const [{ initializeApp }, authMod, firestore] = await Promise.all([
        import(`${SDK}/firebase-app.js`),
        import(`${SDK}/firebase-auth.js`),
        import(`${SDK}/firebase-firestore.js`),
      ]);
      app = initializeApp(firebaseConfig);
      fs = firestore;
      db = firestore.getFirestore(app);
      // Anonymous auth exists purely so the security rules can require a signed
      // in caller; the real identity is the user id typed on the login screen.
      const a = authMod.getAuth(app);
      if (!a.currentUser) await authMod.signInAnonymously(a);
      return db;
    } catch (e) {
      console.warn('[cloud] unavailable:', e.message);
      failed = true;
      return null;
    } finally {
      ready = null;
    }
  })();

  return ready;
}

// Give up rather than hang a login screen on a dead connection.
function withTimeout(promise, ms, fallback = null) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

// ── accounts ────────────────────────────────────────────────
export async function fetchAccount(userId) {
  const d = await withTimeout(init(), 6000);
  if (!d) return { offline: true, record: null };
  try {
    const snap = await withTimeout(fs.getDoc(fs.doc(d, 'accounts', userId)), 8000, 'timeout');
    if (snap === 'timeout') return { offline: true, record: null };
    return { offline: false, record: snap.exists() ? snap.data() : null };
  } catch (e) {
    return { offline: true, record: null, error: e.message };
  }
}

export async function createAccount(userId, record) {
  const d = await withTimeout(init(), 6000);
  if (!d) return { ok: false, offline: true };
  try {
    // Refuse to clobber someone else's account if two people race the same id.
    const ref = fs.doc(d, 'accounts', userId);
    const existing = await fs.getDoc(ref);
    if (existing.exists()) return { ok: false, taken: true };
    await fs.setDoc(ref, { ...record, createdAt: Date.now() });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function updateAccount(userId, patch) {
  const d = await init();
  if (!d) return false;
  try {
    await fs.setDoc(fs.doc(d, 'accounts', userId), patch, { merge: true });
    return true;
  } catch { return false; }
}

// ── progress ────────────────────────────────────────────────
export async function pullProgress(userId) {
  const d = await withTimeout(init(), 6000);
  if (!d) return null;
  try {
    const snap = await withTimeout(fs.getDoc(fs.doc(d, 'progress', userId)), 8000, 'timeout');
    if (snap === 'timeout' || !snap.exists()) return null;
    return snap.data();
  } catch { return null; }
}

let pushTimer = null;
let pending = null;

/** Debounced — a reading session fires this on every sentence. */
export function pushProgress(userId, snapshot, { immediate = false } = {}) {
  pending = { userId, snapshot };
  if (pushTimer) clearTimeout(pushTimer);
  if (immediate) return flushProgress();
  pushTimer = setTimeout(flushProgress, 4000);
  return Promise.resolve(true);
}

export async function flushProgress() {
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  const job = pending;
  if (!job) return true;
  pending = null;
  const d = await init();
  if (!d) { pending = job; return false; }   // keep it for the next attempt
  try {
    await fs.setDoc(fs.doc(d, 'progress', job.userId), job.snapshot);
    return true;
  } catch {
    pending = job;
    return false;
  }
}

// Best-effort flush when the tab goes away, so a session is not lost.
if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushProgress();
  });
  window.addEventListener('online', () => flushProgress());
}

// ── the friends board ───────────────────────────────────────
// A tiny public row per person. Kept separate from progress so reading the
// board never means reading anybody's whole vocabulary.
export async function publishBoardRow(userId, row) {
  const d = await init();
  if (!d) return false;
  try {
    await fs.setDoc(fs.doc(d, 'board', userId), { ...row, updatedAt: Date.now() });
    return true;
  } catch { return false; }
}

export async function removeBoardRow(userId) {
  const d = await init();
  if (!d) return false;
  try { await fs.deleteDoc(fs.doc(d, 'board', userId)); return true; } catch { return false; }
}

export async function fetchBoard(limit = 25) {
  const d = await withTimeout(init(), 6000);
  if (!d) return [];
  try {
    const q = fs.query(fs.collection(d, 'board'), fs.orderBy('streak', 'desc'), fs.limit(limit));
    const snap = await withTimeout(fs.getDocs(q), 8000, 'timeout');
    if (snap === 'timeout') return [];
    const rows = [];
    snap.forEach((doc) => rows.push({ id: doc.id, ...doc.data() }));
    return rows;
  } catch { return []; }
}

// ── sign up / sign in ───────────────────────────────────────
// The two flows the login screen actually calls. Both fall back to the local
// account mirror so a device you have used before still works with no signal.

export async function signUp({ userId, name, password, language }) {
  const salt = auth.randomSalt();
  const hash = await auth.hashPassword(password, salt);
  const record = { name, salt, hash, language: language || null };

  const res = await createAccount(userId, record);
  if (res.taken) return { ok: false, reason: 'taken' };
  if (!res.ok && res.offline) return { ok: false, reason: 'offline' };
  if (!res.ok) return { ok: false, reason: 'error', message: res.error };

  auth.rememberAccount(userId, record);
  return { ok: true, record };
}

export async function signIn({ userId, password }) {
  const { offline, record } = await fetchAccount(userId);

  if (record) {
    const good = await auth.verifyAgainst(record, password);
    if (!good) return { ok: false, reason: 'bad-password' };
    auth.rememberAccount(userId, record);
    return { ok: true, record, fromCloud: true };
  }

  if (offline) {
    // No network — fall back to a device we have signed in on before.
    const local = auth.localAccount(userId);
    if (!local) return { ok: false, reason: 'offline-unknown' };
    const good = await auth.verifyAgainst(local, password);
    if (!good) return { ok: false, reason: 'bad-password' };
    return { ok: true, record: local, fromCloud: false };
  }

  return { ok: false, reason: 'no-account' };
}
