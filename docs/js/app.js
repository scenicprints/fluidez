// Boot.
//
// Order matters here: get something on screen fast, decide whether this is a
// first run or a returning one, and never block the app on the network.

import { $, showScreen, showPane, buildTabs, toast, onScreen } from './ui.js';
import * as store from './store.js';
import * as authLib from './auth.js';
import * as cloud from './cloud.js';
import { content, loadLanguages, findLanguage, loadCachedPack, checkForContentUpdate, underConstruction } from './content.js';
import { mascotSvg, createMascot, setCreature } from './mascot.js';
import { startSetup, splashSays, showLanguagePicker, adoptAccount } from './setup.js';
import * as screens from './screens.js';

const session = { userId: null, name: null };
let momo = null;
let onScreenCreature = null;   // which animal is actually drawn right now

// ── update pipeline ─────────────────────────────────────────
// One version number, stamped by CI into version.json and the service worker.
// The app polls it; when it moves, a banner appears. Nobody edits a version by
// hand in three places, which is exactly how this went wrong before.

const VERSION_URL = 'version.json';

// The version of the code ACTUALLY RUNNING, stamped in by CI.
//
// This used to be read from import.meta.url, which cannot work: the service
// worker precaches js/app.js without its query string and serves it with
// ignoreSearch, so the response URL — and therefore import.meta.url — has no
// ?v= on it at all. The version must be baked into the file itself.
//
// version.json reports what the SERVER has, a different question. When a stale
// worker is serving old JavaScript the two disagree, which is the point.
const STAMPED_VERSION = '__VERSION__';
const RUNNING_VERSION = STAMPED_VERSION.includes('VERSION__') ? 'dev' : STAMPED_VERSION;

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
  $('bannerGo').onclick = onGo || applyUpdate;
  b.classList.add('show');
}

/**
 * Actually take the new version.
 *
 * Reloading is NOT enough: a newly installed worker sits in "waiting" while
 * the old one still controls the page, so a reload just re-serves the old
 * cached JavaScript — you get an update banner and the same app. The waiting
 * worker has to be told to take over, and the reload happens on
 * controllerchange once it has.
 */
async function applyUpdate() {
  $('bannerGo').textContent = 'Updating…';

  // If we cannot tell which version is running, the page itself is stale — a
  // cached index.html pointing at unstamped assets. Skipping the waiting
  // worker will not help, so tear the caches down and start clean. Progress
  // is safe: it lives in local storage and in Firestore, not in these caches.
  if (RUNNING_VERSION === 'dev') {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {}
    return location.replace(location.pathname);
  }

  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.update();

      // reg.update() resolves once the update job is queued, NOT once the new
      // worker is ready to take over. The usual state right here is
      // `installing`, so reading reg.waiting finds nothing, and falling
      // through to a reload just re-serves the old cached JavaScript from the
      // worker still in charge — the banner comes back and the button looks
      // broken. Wait for the new worker to finish installing first.
      const fresh = reg.waiting || reg.installing;
      if (fresh && fresh.state !== 'installed') await settled(fresh, 10000);
      const ready = reg.waiting || (fresh?.state === 'installed' ? fresh : null);
      if (ready) {
        ready.postMessage({ type: 'SKIP_WAITING' });
        return;                     // controllerchange reloads us
      }
    }
  } catch {}

  // Nothing to hand over to, yet we know we are behind. Rather than reload
  // into the same stale worker forever, tear it down and start clean. Progress
  // lives in local storage and Firestore, never in these caches.
  if (knownVersion && knownVersion !== RUNNING_VERSION) return hardRepair();
  location.reload();
}

/** Resolve when a worker stops installing, or when we have waited long enough. */
function settled(worker, ms) {
  return new Promise((resolve) => {
    const done = () => {
      if (worker.state === 'installed' || worker.state === 'activated' || worker.state === 'redundant') {
        worker.removeEventListener('statechange', done);
        resolve();
      }
    };
    worker.addEventListener('statechange', done);
    setTimeout(() => { worker.removeEventListener('statechange', done); resolve(); }, ms);
  });
}

/** Unregister everything and drop every cache, then reload from the network. */
async function hardRepair() {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {}
  location.replace(location.pathname);
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
    // updateViaCache:'none' keeps sw.js itself out of the HTTP cache. Without
    // it the browser can serve a stale worker script for as long as Pages'
    // max-age lasts, so a deploy sits unnoticed behind the old worker.
    const reg = await navigator.serviceWorker.register('sw.js', {
      scope: './',
      updateViaCache: 'none',
    });

    // A newer worker may already be sitting there from a previous visit —
    // without this it waits forever and the app never actually updates.
    if (reg.waiting && navigator.serviceWorker.controller) {
      showUpdateBanner('A new version is ready');
    }
    reg.update().catch(() => {});

    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner('A new version is ready');
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
  knownVersion = v.version;
  if (v.version !== RUNNING_VERSION) {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    showUpdateBanner(`Version ${v.version} is ready`);
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
  // Pass the code through. Dropping it here is what turned "get the new
  // lessons" into "choose a language", and the picker then loaded the cached
  // pack anyway, so the update could never actually land.
  await showLanguagePicker({ standalone: true, code, force });
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
  // The course decides which animal this is, so it has to be chosen before
  // anything is drawn. A pack that names no mascot falls back to the one
  // mapped to its language code, and failing that to the original bird.
  const creature = setCreature(content.language?.code || null, content.mascot);

  // Switching course has to actually change the animal. This used to be
  // `if (!momo)`, so the second language chose its creature and then left the
  // first one's on the branch — the whole app went German and Momo stayed.
  if (momo && creature.id !== onScreenCreature) {
    momo.destroy();
    momo = null;
    screens.resetWrapMascot();
  }
  if (!momo) {
    onScreenCreature = creature.id;
    $('momo').innerHTML = mascotSvg('home');
    momo = createMascot($('momo'), $('speech'), $('sparks'), screens.momoHooks);
  }
  enterApp();
  if (celebrate) momo.speak('welcome');
}

function enterApp() {
  buildTabs((f) => content.has(f), (screen) => {
    // Today always works — it is the streak, the mascot and the board, none of
    // which need a lesson. Everything else waits for content.
    if (screen !== 'today' && underConstruction()) return screens.openBau();
    showScreen(screen);
    screens.RENDERERS[screen]?.();
  }, content.icons);
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
  // The splash is painted before any pack exists, so the creature comes from
  // whichever course this device last used. If that guess is wrong the pack
  // corrects it a second later, which nobody will ever see.
  const lastId = authLib.loadSession() || store.device.lastUser();
  if (lastId) setCreature(authLib.localAccount(lastId)?.language || null, null);
  $('splashMomo').innerHTML = mascotSvg('splash');

  const v = await readVersion();
  knownVersion = v?.version || null;
  window.__FLUIDEZ_VERSION__ = RUNNING_VERSION;
  // On screen, so "it updated but looks the same" is answerable at a glance.
  const stale = RUNNING_VERSION === 'dev' || (knownVersion && knownVersion !== RUNNING_VERSION);
  if (stale) {
    showUpdateBanner(RUNNING_VERSION === 'dev'
      ? 'This copy is out of date — tap to repair'
      : `Version ${knownVersion} is ready`);
  }
  for (const id of ['splashVer', 'loginVer']) {
    const n = $(id);
    if (n) n.textContent = stale ? `v${RUNNING_VERSION} · update ready` : `v${RUNNING_VERSION}`;
  }

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
    // The registry was read from CACHE ONLY above, for offline speed — which
    // deadlocked every existing install: the switchers hide themselves while
    // the cached list holds one language, and the only path that refetched
    // the list with network was behind those switchers. So a new language
    // could never reach a device that had already booted once. Refresh it in
    // the background and repaint the chip when it lands.
    loadLanguages().then(() => screens.paintChrome());
    // Catch up with the cloud quietly, without holding anything up.
    // Compare against the PERSISTED stamp of the last local change, never a
    // freshly minted Date.now() — that comparison is always false, which is
    // how this pull sat dead while the push kept running, and a second device
    // could overwrite the first one's progress with an older copy.
    cloud.pullProgress(userId).then((remote) => {
      if (remote && (remote.updatedAt || 0) > store.lastChanged()) {
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

// ── Granada ─────────────────────────────────────────────────
// The world is a requestAnimationFrame loop and half a megabyte of map, so it
// is imported the first time you open it and torn down the moment you leave.
// A course without the `game` feature never loads a byte of it.
let gameMod = null;
onScreen(async (id) => {
  if (id === 'game') {
    if (!content.has('game')) return;
    try {
      if (!gameMod) gameMod = await import('./game/screen.js');
      gameMod.start(content.game);
    } catch (e) {
      console.error(e);
      toast('Granada could not start on this device.');
    }
  } else if (gameMod) {
    gameMod.stop();
  }
});

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
  // momo is a getter because it does not exist until launch(), and the
  // ambient behaviours (flight, the comeback greeting, time of day) are
  // otherwise unobservable without waiting minutes or changing the clock.
  window.__fluidez = { screens, store, content, session, showScreen, get momo() { return momo; } };
}
