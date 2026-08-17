// First run: splash, login, pick a language, download the course, get onto the
// home screen, turn on notifications.
//
// The install guide is modelled on Mend's: sniff the device and show only the
// steps that apply, say "done" when already installed, and put notifications
// second because on an iPhone push does not exist until the app is installed.

import { $, el, clear, esc, showPane, toast, platform, isInstalled, deviceLabel } from './ui.js';
import * as store from './store.js';
import * as authLib from './auth.js';
import * as cloud from './cloud.js';
import { content, loadLanguages, findLanguage, loadCachedPack, downloadPack } from './content.js';
import { MOMO_SVG } from './momo.js';

let finish = () => {};
let mode = 'signup';          // or 'signin'
let account = null;           // { userId, name, language }

export function startSetup(onDone) {
  finish = onDone;
  $('splashMomo').innerHTML = MOMO_SVG;
  wireLogin();
  wireInstall();
  wireNotify();
}

// ── splash ──────────────────────────────────────────────────
export function splashSays(text) {
  const t = $('splashTag');
  if (t) t.textContent = text;
}

// ── login ───────────────────────────────────────────────────
function setMode(next) {
  mode = next;
  const signup = mode === 'signup';
  $('loginLede').textContent = signup
    ? 'Pick a user ID and a password. Type the same ID on any phone and your progress follows you.'
    : 'Welcome back. Your user ID and password, and everything comes down from where you left off.';
  $('fName').style.display = signup ? '' : 'none';
  $('loginGo').textContent = signup ? 'Create my account' : 'Sign in';
  $('loginSwitch').textContent = signup ? 'I already have an account' : 'I need to make an account';
  $('inPass').setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
  hideError();
}

function fieldError(fieldId, message) {
  const f = $(fieldId);
  f.classList.toggle('bad', !!message);
  f.querySelector('.err').textContent = message || '';
  return !message;
}

function showError(msg) {
  const box = $('loginError');
  box.textContent = msg;
  box.style.display = 'block';
}
function hideError() { $('loginError').style.display = 'none'; }

function wireLogin() {
  $('loginSwitch').addEventListener('click', () => setMode(mode === 'signup' ? 'signin' : 'signup'));
  $('loginGo').addEventListener('click', submitLogin);
  for (const id of ['inId', 'inName', 'inPass']) {
    $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') submitLogin(); });
  }
  const last = store.device.lastUser();
  if (last) { $('inId').value = last; setMode('signin'); } else { setMode('signup'); }
}

async function submitLogin() {
  hideError();
  const rawId = $('inId').value;
  const name = $('inName').value;
  const password = $('inPass').value;

  let ok = fieldError('fId', authLib.validateId(rawId));
  if (mode === 'signup') ok = fieldError('fName', authLib.validateName(name)) && ok;
  ok = fieldError('fPass', authLib.validatePassword(password)) && ok;
  if (!ok) return;

  const userId = authLib.normalizeId(rawId);
  const btn = $('loginGo');
  btn.disabled = true;
  btn.textContent = mode === 'signup' ? 'Creating…' : 'Signing in…';

  try {
    if (mode === 'signup') {
      const res = await cloud.signUp({ userId, name: name.trim(), password });
      if (!res.ok) {
        if (res.reason === 'taken') return showError('That user ID is already taken. Try another, or sign in instead.');
        if (res.reason === 'offline') return showError('Cannot reach the server, so a new account cannot be created yet. Try again when you have signal.');
        return showError(res.message || 'Could not create the account.');
      }
      account = { userId, name: name.trim(), language: null };
      afterAuth(true);
    } else {
      const res = await cloud.signIn({ userId, password });
      if (!res.ok) {
        if (res.reason === 'bad-password') return showError('That password does not match.');
        if (res.reason === 'no-account') return showError('No account with that user ID. Make one instead?');
        if (res.reason === 'offline-unknown') return showError('No signal, and this device has not signed in as that user before.');
        return showError('Could not sign in.');
      }
      account = { userId, name: res.record.name, language: res.record.language || null };
      afterAuth(false, res.fromCloud);
    }
  } catch (e) {
    showError(e.message || 'Something went wrong.');
  } finally {
    btn.disabled = false;
    setMode(mode);
  }
}

async function afterAuth(isNew, fromCloud = false) {
  store.setUser(account.userId);
  store.device.setLastUser(account.userId);
  authLib.saveSession(account.userId);

  // Signing in somewhere new: take whatever the cloud has.
  if (!isNew && fromCloud) {
    const remote = await cloud.pullProgress(account.userId);
    if (remote) store.restore(remote);
  }

  const saved = account.language || store.settings.get('language');
  if (saved && findLanguage(saved)) {
    store.settings.set('language', saved);
    await ensurePack(findLanguage(saved));
  } else {
    await showLanguagePicker();
  }
}

// ── language ────────────────────────────────────────────────
export async function showLanguagePicker({ standalone = false } = {}) {
  showPane('lang');
  const list = $('langList');
  clear(list);
  list.appendChild(el('div', 'spinner'));

  await loadLanguages();
  clear(list);

  const current = store.settings.get('language');
  for (const lang of content.languages) {
    const row = el('button', 'langrow' + (lang.code === current ? ' sel' : ''));
    row.type = 'button';
    row.innerHTML =
      `<span class="flag">${esc(lang.flag || '🌐')}</span>` +
      `<span><span class="nm">${esc(lang.name || lang.code)}</span>` +
      `<span class="meta">${esc(lang.blurb || lang.code)}</span></span>`;
    row.addEventListener('click', async () => {
      store.settings.set('language', lang.code);
      if (account) {
        account.language = lang.code;
        cloud.updateAccount(account.userId, { language: lang.code });
      }
      await ensurePack(lang, { standalone });
    });
    list.appendChild(row);
  }
}

async function ensurePack(lang, { standalone = false } = {}) {
  // Already downloaded? Straight in.
  if (loadCachedPack(lang.code)) {
    return standalone ? finish({ resumed: true, account }) : afterPack();
  }
  await runDownload(lang, standalone);
}

async function runDownload(lang, standalone) {
  showPane('download');
  const bar = $('dlBar');
  const text = $('dlText');
  const err = $('dlError');
  const retry = $('dlRetry');
  err.style.display = 'none';
  retry.style.display = 'none';
  bar.style.width = '0%';

  try {
    const { stored } = await downloadPack(lang, ({ phase, done, total }) => {
      const pct = total ? Math.round((done / total) * 100) : 0;
      bar.style.width = `${pct}%`;
      text.textContent = phase === 'manifest'
        ? 'Reading the course list…'
        : phase === 'done' ? 'Ready.' : `${done} of ${total} files`;
    });
    if (!stored) {
      toast('Downloaded, but this browser would not keep it offline.');
    }
    return standalone ? finish({ resumed: true, account }) : afterPack();
  } catch (e) {
    err.textContent = navigator.onLine === false
      ? 'No connection. The course has to come down once before it can work offline.'
      : `Could not download the course. ${e.message}`;
    err.style.display = 'block';
    retry.style.display = 'block';
    retry.onclick = () => runDownload(lang, standalone);
  }
}

function afterPack() {
  store.device.markSetupDone();
  if (isInstalled()) {
    // Already an installed app — skip straight to the part that still matters.
    renderNotify();
    showPane('notify');
  } else {
    renderInstall();
    showPane('install');
  }
}

// ── install guide (after Mend) ──────────────────────────────
const STEPS = {
  ios: [
    'Open this page in <b>Safari</b> — it only works from Safari.',
    'Tap the <b>Share</b> button — the square with an arrow, at the bottom of the screen.',
    'Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.',
    'From now on open Fluidez from the new icon. That is the app.',
  ],
  android: [
    'Open this page in <b>Chrome</b>.',
    'Tap the <b>⋮</b> menu in the top-right corner.',
    'Tap <b>Add to Home screen</b> — some phones say <b>Install app</b> — then confirm.',
    'From now on open Fluidez from the new icon. That is the app.',
  ],
};

function renderInstall() {
  const host = $('installBody');
  clear(host);
  const p = platform();

  if (isInstalled()) {
    host.innerHTML = '<div class="notice ok"><b>Done.</b> You are using the installed app right now.</div>';
    $('installLede').textContent = 'Nothing to do here.';
    return;
  }

  if (p === 'desktop') {
    $('installLede').textContent = 'You are on a computer.';
    host.innerHTML =
      '<p class="muted">Installing matters most on your phone — open this same address there and this page will show you the steps for it. ' +
      'In Chrome or Edge here, the install button lives at the right end of the address bar.</p>';
    return;
  }

  $('installLede').textContent = 'Two minutes, once per device.';
  const ol = el('div');
  STEPS[p].forEach((html, i) => {
    const row = el('div', 'guide-step');
    row.innerHTML = `<span class="guide-step-n">${i + 1}</span><span>${html}</span>`;
    ol.appendChild(row);
  });
  host.appendChild(ol);

  if (p === 'ios') {
    const note = el('div', 'notice info');
    note.innerHTML = '<b>Worth doing.</b> On an iPhone, notifications only work once Fluidez is on your Home Screen.';
    host.appendChild(note);
  }
}

function wireInstall() {
  $('installNext').addEventListener('click', () => { renderNotify(); showPane('notify'); });
}

// ── notifications ───────────────────────────────────────────
// One button, exactly like Mend: register the worker, ask permission, and
// arrange the daily reminder — no separate steps for the person to get wrong.

async function enableNotifications(btn) {
  btn.disabled = true;
  btn.textContent = 'Asking…';
  try {
    const reg = await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') { renderNotify(); return; }

    // Where the browser supports it (installed Android PWAs), let the worker
    // wake up daily and check. Elsewhere the app schedules while it is open.
    try {
      if ('periodicSync' in reg) {
        const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
        if (status.state === 'granted') {
          await reg.periodicSync.register('fluidez-reminder', { minInterval: 12 * 3600 * 1000 });
        }
      }
    } catch {}

    store.settings.set('reminder', true);
    await reg.showNotification('Notifications are on', {
      body: 'Momo will nudge you in the evening if your streak is in danger.',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: 'fluidez-welcome',
    });
    renderNotify();
  } catch (e) {
    toast(e.message || 'Could not turn notifications on.');
    renderNotify();
  }
}

function notifyState() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    // iPhone Safari has no Notification API until the site is installed. That
    // is "not yet", not "cannot".
    return platform() === 'ios' && !isInstalled() ? 'needs-install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' ? 'on' : 'off';
}

function renderNotify() {
  const host = $('notifyBody');
  clear(host);
  const state = notifyState();

  if (state === 'needs-install') {
    host.innerHTML =
      '<div class="notice info"><b>One step first.</b> On an iPhone, notifications only work once Fluidez is on your Home Screen. ' +
      'Add it, open it from the new icon, then come back here from Settings.</div>';
    $('notifySkip').textContent = 'Continue';
    return;
  }
  if (state === 'unsupported') {
    host.innerHTML = '<div class="notice warn">This browser cannot show notifications. On a phone, use Safari on iPhone or Chrome on Android.</div>';
    $('notifySkip').textContent = 'Continue';
    return;
  }
  if (state === 'denied') {
    host.innerHTML =
      '<div class="notice warn"><b>Notifications are blocked for this site.</b> Your browser remembers that choice — ' +
      'allow notifications for this site in its settings, then come back.</div>';
    $('notifySkip').textContent = 'Continue';
    return;
  }
  if (state === 'on') {
    host.innerHTML = `<div class="notice ok"><b>On.</b> ${esc(deviceLabel())} will get the evening nudge.</div>`;
    $('notifySkip').textContent = 'Start learning';
    return;
  }

  const btn = el('button', 'go');
  btn.type = 'button';
  btn.textContent = 'Turn on notifications';
  btn.addEventListener('click', () => enableNotifications(btn));
  host.appendChild(btn);
  $('notifySkip').textContent = 'Not now';
}

function wireNotify() {
  $('notifySkip').addEventListener('click', () => finish({ fresh: true, account }));
}

/** Used when the app is resumed without going through login. */
export function adoptAccount(a) { account = a; }

export { renderNotify, renderInstall };
