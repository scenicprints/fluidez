// Accounts: a user id, your name, and a password of any length.
//
// Firebase's own email/password auth enforces a six-character minimum that
// cannot be switched off, and the brief was explicitly "as short or long as the
// person wants" — so the account record lives in Firestore and the password is
// checked here instead. Passwords are never stored or transmitted: only a
// PBKDF2-SHA256 hash of a per-account random salt.
//
// This is deliberately modest security for a vocabulary tracker shared between
// friends. It is not a bank.

const ITERATIONS = 150000;
const KEY_BITS = 256;

const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export function randomSalt() {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPassword(password, salt) {
  if (!crypto?.subtle) throw new Error('This browser cannot hash passwords securely.');
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    KEY_BITS,
  );
  return toHex(bits);
}

// Constant-time-ish compare. Both strings are hex of the same length, so this
// mostly guards against accidental early-exit rather than a real timing attack.
export function hashesMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── user ids ────────────────────────────────────────────────
// Lowercased and trimmed so "Kevin" and "kevin" are the same person, and
// restricted to characters that are safe in a document path.
export function normalizeId(raw) {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, '');
}

export function validateId(raw) {
  const id = normalizeId(raw);
  if (!id) return 'Pick a user ID.';
  if (id.length > 32) return 'That user ID is too long.';
  if (!/^[a-z0-9._-]+$/.test(id)) return 'Letters, numbers, dots, dashes and underscores only.';
  return null;
}

export function validateName(raw) {
  const name = String(raw || '').trim();
  if (!name) return 'What should your friends call you?';
  if (name.length > 40) return 'That name is a bit long.';
  return null;
}

// Deliberately no rules: any password, any length, including one character.
export function validatePassword(raw) {
  if (!String(raw ?? '').length) return 'Pick a password — any length.';
  return null;
}

// ── the local account mirror ────────────────────────────────
// Kept so you can sign in on a device you have used before with no network.
// Only the salt and hash are here — the password itself never touches disk.
const LK = (id) => `fl:acct:${id}`;

export function rememberAccount(id, record) {
  try {
    localStorage.setItem(LK(id), JSON.stringify({
      name: record.name, salt: record.salt, hash: record.hash, language: record.language || null,
    }));
  } catch {}
}

export function localAccount(id) {
  try { const s = localStorage.getItem(LK(id)); return s ? JSON.parse(s) : null; } catch { return null; }
}

export function forgetAccount(id) {
  try { localStorage.removeItem(LK(id)); } catch {}
}

export async function verifyAgainst(record, password) {
  if (!record) return false;
  const hash = await hashPassword(password, record.salt);
  return hashesMatch(hash, record.hash);
}

// ── session ─────────────────────────────────────────────────
const SESSION = 'fl:session';

export function saveSession(id) {
  try { localStorage.setItem(SESSION, id); } catch {}
}
export function loadSession() {
  try { return localStorage.getItem(SESSION); } catch { return null; }
}
export function clearSession() {
  try { localStorage.removeItem(SESSION); } catch {}
}
