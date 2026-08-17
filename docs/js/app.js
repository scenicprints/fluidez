// Boot.
//
// Order matters here: get something on screen fast, decide whether this is a
// first run or a returning one, and never block the app on the network.

import { $, showScreen, showPane, buildTabs, toast, onScreen } from './ui.js';
import * as store from './store.js';
import * as authLib from './auth.js';
import * as cloud from './cloud.js';
import { content, loadLanguages, findLanguage, loadCachedPack, checkForContentUpdate } from './content.js';
import { MOMO_SVG, createMomo } from './momo.js';
import { startSetup, splashSays, showLanguagePicker, adoptAccount } from './setup.js';
import * as screens from './screens.js';

const session = { userId: null, name: null };
let momo = null;

// ── update pipeline ─────────────────────────────────────────
// One version number, stamped by CI into version.json and the service worker.
// The app polls it; when it moves, a banner appears. Nobody edits a version by
// hand in three places, which is exactly how this went wrong before.

const VERSION_URL = 'version.json';
let knownVersion = null;

async function readVersion() {
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function showUpdateBanner(text, onGo) {
  const b = $('banner');
  $('bannerText').textContent = text;
  $('bannerGo').onclick = onGo;
  b.classList.add('show');
}

const isLocalDev = ['127.0.0.1', 'localhost'].includes(location.hostname);

async function registerWorker() {
  if (!('serviceWorker' in navigator)) return null;
  // Locally the version never changes, so the worker would serve stale code
  // forever and hide every edit. Opt in with ?sw=1 to test offline behaviour.
  if (isLocalDev && !new URLSearchParams(location.search).has('sw')) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register('sw.js', { scope: './' });

    // A worker took over mid-session: something newer is already installed.
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner('A new version is ready', () => {
            sw.postMessage({ type: 'SKIP_WAITING' });
          });
        }
      });
    });

    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });

    return reg;
  } catch (e) {
    console.warn('[sw] registration failed', e.message);
    return null;
  }
}

async function pollVersion() {
  const v = await readVersion();
  if (!v?.version) return;
  if (!knownVersion) {
    knownVersion = v.version;
    window.__FLUIDEZ_VERSION__ = v.version;
    return;
  }
  if (v.version !== knownVersion) {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    showUpdateBanner(`Version ${v.version} is ready`, () => location.reload());
  }
}

// Content updates are separate: a new lesson needs no app release at all.
async function pollContent() {
  if (!content.language) return;
  const r = await checkForContentUpdate(content.language);
  if (r.available) {
    showUpdateBanner('New lessons are available', async () => {
      $('banner').classList.remove('show');
      toast('Downloading new lessons…');
      await switchLanguage(content.language.code, true);
    });
  }
}

// ── language switching ──────────────────────────────────────
async function switchLanguage(code = null, force = false) {
  if (code && !force && loadCachedPack(code)) {
    store.settings.set('language', code);
    enterApp();
    return;
  }
  await showLanguagePicker({ standalone: true });
}

// ── entering the app ────────────────────────────────────────
// Both routes in — a fresh setup and a returning user — land here, so the
// mascot and the tab bar are only ever built one way.
function launch(account, { celebrate = false } = {}) {
  if (account) {
    session.userId = account.userId;
    session.name = account.name || account.userId;
    store.setUser(session.userId);
  }
  if (!momo) {
    $('momo').innerHTML = MOMO_SVG;
    momo = createMomo($('momo'), $('speech'), $('sparks'));
  }
  enterApp();
  if (celebrate) momo.set('cheer', '¡Vamos!');
}

function enterApp() {
  buildTabs((f) => content.has(f), (screen) => {
    showScreen(screen);
    screens.RENDERERS[screen]?.();
  });
  screens.initScreens(momo, session);
  screens.setSettingsHandlers({
    signOut: () => {
      cloud.flushProgress();
      authLib.clearSession();
      store.device.clearLastUser();
      location.reload();
    },
    switchLanguage: (code, force) => switchLanguage(code, force),
  });
  showScreen('today');
  screens.renderToday();
  setTimeout(pollContent, 4000);
}

// ── boot ────────────────────────────────────────────────────
async function boot() {
  showPane('splash');
  $('splashMomo').innerHTML = MOMO_SVG;

  const v = await readVersion();
  knownVersion = v?.version || null;
  window.__FLUIDEZ_VERSION__ = knownVersion || 'dev';

  registerWorker();
  setInterval(pollVersion, 15 * 60 * 1000);
  window.addEventListener('focus', pollVersion);

  startSetup((result) => launch(result?.account, { celebrate: !!result?.fresh }));

  const userId = authLib.loadSession();
  if (!userId) { splashSays('Ready'); return showPane('login'); }

  // Returning user: everything they need is already on the device.
  session.userId = userId;
  store.setUser(userId);
  const local = authLib.localAccount(userId);
  session.name = local?.name || userId;

  splashSays('Loading your course');
  await loadLanguages({ allowNetwork: false });

  const code = store.settings.get('language') || local?.language;
  const lang = code ? findLanguage(code) : null;

  if (lang && loadCachedPack(code)) {
    launch({ userId, name: session.name });
    // Catch up with the cloud quietly, without holding anything up.
    cloud.pullProgress(userId).then((remote) => {
      if (remote && remote.updatedAt > (store.snapshot().updatedAt || 0)) {
        store.restore(remote);
        screens.renderToday();
      }
    });
  } else {
    // Signed in but no course on this device — pick one and download it.
    adoptAccount({ userId, name: session.name, language: code || null });
    await showLanguagePicker({ standalone: true });
  }
}

// Keep the session's name in sync for the board.
store.onStoreChange(() => {});

// Re-render whatever screen the user lands on, so nothing is ever stale.
onScreen((id) => { if (screens.RENDERERS[id] && id !== 'today') screens.RENDERERS[id](); });

boot().catch((e) => {
  console.error(e);
  splashSays('Something went wrong');
  toast(e.message || 'Failed to start');
});

// Expose the session so setup can fill it in after login.
window.__fluidezSession = session;

// A handle for driving the app from the console while developing. Guarded to
// localhost so nothing is reachable in the shipped build.
if (isLocalDev) {
  window.__fluidez = { screens, store, content, session, showScreen };
}
