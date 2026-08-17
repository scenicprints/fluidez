// Small shared helpers. No app logic lives here — just the boring parts every
// screen needs, kept in one place so nothing imports a screen from a screen.

export const $ = (id) => document.getElementById(id);
export const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

/** Escape anything that came from content JSON before it goes near innerHTML. */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Content authors write **bold**; nothing else is allowed through. */
export function md(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

// ── panes (setup) vs screens (the app) ──────────────────────
export function showPane(id) {
  document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.id === `pane-${id}`));
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('on'));
}

let currentScreen = null;
const screenListeners = [];
export const onScreen = (fn) => screenListeners.push(fn);

export function showScreen(id) {
  document.querySelectorAll('.pane').forEach((p) => p.classList.remove('on'));
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('on', s.id === `sc-${id}`));
  currentScreen = id;
  document.querySelectorAll('.body, .paper-body').forEach((b) => { b.scrollTop = 0; });
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.screen === id));
  screenListeners.forEach((fn) => fn(id));
}
export const screenNow = () => currentScreen;

// ── toast ───────────────────────────────────────────────────
let toastTimer = null;
export function toast(msg, ms = 2600) {
  const t = $('toast');
  if (!t) return;
  t.innerHTML = md(msg);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ── tab bar ─────────────────────────────────────────────────
// Built from whatever the language actually supports, so a course with no
// scenes simply has no Scenes tab rather than an empty one.
const TAB_DEFS = [
  { screen: 'today', icon: 'ic-today', label: 'Today', feature: null },
  { screen: 'path', icon: 'ic-path', label: 'Path', feature: 'reader' },
  { screen: 'scenes', icon: 'ic-scenes', label: 'Scenes', feature: 'scenes' },
  { screen: 'words', icon: 'ic-words', label: 'Words', feature: 'words' },
];

export function buildTabs(hasFeature, go) {
  const tabs = TAB_DEFS.filter((t) => !t.feature || hasFeature(t.feature));
  for (const nav of document.querySelectorAll('nav.tabs')) {
    clear(nav);
    nav.style.setProperty('--tabs', tabs.length);
    for (const t of tabs) {
      const b = el('button', 'tab');
      b.type = 'button';
      b.dataset.screen = t.screen;
      b.innerHTML = `<svg class="ti"><use href="#${t.icon}"/></svg>`;
      b.appendChild(document.createTextNode(t.label));
      b.addEventListener('click', () => go(t.screen));
      nav.appendChild(b);
    }
  }
}

// ── platform ────────────────────────────────────────────────
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = () => /android/i.test(navigator.userAgent);

export function platform() {
  if (isIos()) return 'ios';
  if (isAndroid()) return 'android';
  return 'desktop';
}

export function isInstalled() {
  return window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.navigator.standalone === true;
}

export function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iphone/i.test(ua)) return 'iPhone';
  if (/ipad/i.test(ua)) return 'iPad';
  if (/android/i.test(ua)) return 'Android';
  if (/windows/i.test(ua)) return 'Windows PC';
  if (/macintosh/i.test(ua)) return 'Mac';
  return 'Browser';
}

// ── misc ────────────────────────────────────────────────────
export const initials = (name) => String(name || '?').trim().charAt(0).toUpperCase() || '?';

export function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function ago(ts) {
  if (!ts) return 'never';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
