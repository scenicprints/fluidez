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

// ── interface language ──────────────────────────────────────
// The labels used to be English constants, which was fine while there was one
// course and wrong the moment there were two. A pack ships its own `ui` block;
// anything it does not name falls back to the English below, so a course that
// declares nothing behaves exactly as it always did.
const EN = {
  today: 'Today', path: 'Path', scenes: 'Scenes', words: 'Words',
  game: 'Granada',
  review: 'Review', verbs: 'Verbs', order: 'Word order',
  listening: 'Listening', shadowing: 'Shadowing', patterns: 'Patterns',
  emergency: 'Emergency',
  conjugation: 'conjugation', buildIt: 'build it', dictation: 'dictation',
  writeIn: 'Write this in {lang}',
  nothingToReview: 'Read a lesson first — Review is built from words you have met.',
  // verb trainer, principal-parts shape
  principalParts: 'principal parts',
  verbsNone: 'This course has no verb trainer.',
  verbsEmpty: 'No verbs in this course yet.',
  vpPresent3: 'he / she', vpPresent2: 'you (du)',
  vpPast: 'he / she, past', vpPerfect: 'the perfect',
  vpAux: 'which auxiliary', vpInfinitive: 'which verb is this',
  vpImperative: 'telling somebody to do it',
  vpSeparable: 'where does the prefix go',
  vpNext: 'Next verb', vpRight: 'Correct', vpWrong: 'Not that one',
  sayItBack: 'say it back', nothingDue: 'nothing due', due: '{n} due',
  known: '{n} known', scenesCount: '{a} · {b} done', patternsCount: '{a} of {b}',
  streakDays: '{n} days', streakDay: '{n} day',
  streakStart: 'Do anything today to start one',
  streakBest: 'Best is {n}', streakLongest: 'Longest yet — keep it',
  contResume: 'Pick up where you left off', contAgain: 'Read it again',
  contStart: 'Start reading', contOpen: 'Open',
  friends: 'Learning alongside you',
  friendsNone: 'Nobody else yet. Send a friend the link and they pick their own user ID.',
  // settings
  setLearning: 'Learning', setVoice: 'Voice', setFriends: 'Friends',
  setContent: 'Content', setAccount: 'Account', setAbout: 'About',
  setLanguage: 'Language',
  setLanguageOn: 'Switches lessons, words and voice',
  setLanguageOff: 'The course you are learning',
  setGoal: 'Daily goal', setGoalSub: 'Reps to keep the streak alive',
  setRemind: 'Remind me each evening',
  setRemindSub: 'A nudge if you have not practised',
  setSpeed: 'Speaking speed', setSpeedSub: 'Slower while you are starting out',
  setAutoplay: 'Read lines aloud automatically',
  setAutoplaySub: 'Plays the first line when a lesson opens',
  setListenFirst: 'Scenes play before showing English',
  setListenFirstSub: 'Listen first, then reveal',
  setInvite: 'Invite a friend',
  setInviteSub: 'They open the link and pick their own user ID',
  setBoard: 'Show me on the streak board',
  setBoardSub: 'Friends see your streak and level',
  setCheck: 'Check for new lessons', setChecking: 'checking…',
  setUpToDate: '✓ up to date',
  setDownloaded: 'Downloaded', setDownloadedSub: 'Everything works with no signal',
  setDownloadedVal: '{a} lessons · {b} scenes',
  setStorage: 'Storage used', setStorageSub: 'On this device',
  setSignedIn: 'Signed in as', setSignOut: 'Sign out',
  setSignOutSub: 'Your progress stays safe in the cloud',
  setVersion: 'Version', setReset: 'Reset my progress',
  setResetSub: 'Clears every word, streak and lesson',
  bauTitle: 'Under construction', bauSub: 'not built yet',
  bauWhy: 'This part of the course has not been written yet. It is coming.',
  bauBack: 'Back to today',
};

let strings = {};

/** Take the interface strings a pack ships. Anything missing stays English. */
export function setStrings(ui) { strings = (ui && typeof ui === 'object') ? ui : {}; }

/** A label, with {placeholders} filled in. */
export function t(key, vars) {
  let out = strings[key] != null ? String(strings[key]) : (EN[key] != null ? EN[key] : key);
  if (vars) for (const k of Object.keys(vars)) out = out.split('{' + k + '}').join(vars[k]);
  return out;
}

// ── tab bar ─────────────────────────────────────────────────
// Built from whatever the language actually supports, so a course with no
// scenes simply has no Scenes tab rather than an empty one. The icon is part
// of the course too: Nicaragua's Path is a volcano, Switzerland's is a gondola.
const TAB_DEFS = [
  { screen: 'today', icon: 'ic-today', label: 'today', feature: null },
  { screen: 'path', icon: 'ic-path', label: 'path', feature: 'reader' },
  { screen: 'scenes', icon: 'ic-scenes', label: 'scenes', feature: 'scenes' },
  { screen: 'game', icon: 'ic-game', label: 'game', feature: 'game' },
  { screen: 'words', icon: 'ic-words', label: 'words', feature: 'words' },
];

export function buildTabs(hasFeature, go, icons) {
  // Granada takes the Scenes slot rather than adding a fifth tab: Scenes is
  // already a tile on Today, so the tab was redundant the moment there was
  // something better to put there. A course with scenes and no game keeps its
  // Scenes tab exactly as before.
  const swallowScenes = hasFeature('game');
  const tabs = TAB_DEFS
    .filter((t2) => !(swallowScenes && t2.screen === 'scenes'))
    .filter((t2) => !t2.feature || hasFeature(t2.feature))
    .map((t2) => ({ ...t2, icon: (icons && icons[t2.screen]) || t2.icon }));
  for (const nav of document.querySelectorAll('nav.tabs')) {
    clear(nav);
    nav.style.setProperty('--tabs', tabs.length);
    for (const tab of tabs) {
      const b = el('button', 'tab');
      b.type = 'button';
      b.dataset.screen = tab.screen;
      b.innerHTML = `<svg class="ti"><use href="#${tab.icon}"/></svg>`;
      b.appendChild(document.createTextNode(t(tab.label)));
      b.addEventListener('click', () => go(tab.screen));
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
