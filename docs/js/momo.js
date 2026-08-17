// Momo — a guardabarranco, Nicaragua's national bird.
//
// Real motmots swing that racket-tipped tail like a pendulum, so his idle is
// his actual behaviour rather than an invented animation.
//
// The SVG appears more than once (splash and home), so every internal id is
// suffixed per instance. Sharing ids meant `url(#mBody)` resolved into the
// hidden splash copy and every gradient-filled shape — body, belly, wings,
// head — silently painted nothing. Animation hooks are classes for the same
// reason: an id can only ever drive one of them.

import { content } from './content.js';
import * as store from './store.js';

export function momoSvg(uid = 'a') {
  const g = (name) => `${name}-${uid}`;
  return `
<svg class="momo-svg" viewBox="0 0 220 214" aria-hidden="true">
  <defs>
    <radialGradient id="${g('mGlow')}" cx="50%" cy="46%" r="50%">
      <stop offset="0%" stop-color="#E8A33D" stop-opacity=".55"/>
      <stop offset="55%" stop-color="#E8A33D" stop-opacity=".16"/>
      <stop offset="100%" stop-color="#E8A33D" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${g('mBody')}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#48B79D"/><stop offset="100%" stop-color="#22685C"/>
    </linearGradient>
    <linearGradient id="${g('mHead')}" x1="0" y1="0" x2=".4" y2="1">
      <stop offset="0%" stop-color="#4FC0A5"/><stop offset="100%" stop-color="#2A7A6B"/>
    </linearGradient>
    <linearGradient id="${g('mBelly')}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#E0975C"/><stop offset="100%" stop-color="#B25E36"/>
    </linearGradient>
    <linearGradient id="${g('mBrow')}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#8FDDEE"/><stop offset="55%" stop-color="#5FB6E0"/>
      <stop offset="100%" stop-color="#3E8FC9"/>
    </linearGradient>
    <linearGradient id="${g('mWing')}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#5FCCB0"/><stop offset="100%" stop-color="#31897A"/>
    </linearGradient>
  </defs>

  <ellipse class="m-glow" cx="110" cy="108" rx="92" ry="94" fill="url(#${g('mGlow')})"/>

  <path d="M14 170 Q110 161 206 172" stroke="#4C3B30" stroke-width="7" fill="none" stroke-linecap="round"/>
  <path d="M170 168 q13 -9 24 -6 q-11 8 -24 6z" fill="#2F6B4E"/>
  <path d="M40 170 q-13 -8 -25 -5 q11 8 25 5z" fill="#2F6B4E"/>

  <g class="m-float">
    <g class="m-tail">
      <path d="M104 146 C99 170 99 182 100 192" stroke="#2A7A6B" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <path d="M117 146 C122 170 122 182 121 192" stroke="#2A7A6B" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <ellipse cx="100" cy="200" rx="7.5" ry="10.5" fill="url(#${g('mBody')})"/>
      <ellipse cx="121" cy="200" rx="7.5" ry="10.5" fill="url(#${g('mBody')})"/>
      <ellipse cx="100" cy="198" rx="3.4" ry="5" fill="#5FB6E0" opacity=".65"/>
      <ellipse cx="121" cy="198" rx="3.4" ry="5" fill="#5FB6E0" opacity=".65"/>
    </g>

    <ellipse class="m-wingL" cx="78" cy="117" rx="16" ry="29" fill="url(#${g('mWing')})"/>
    <ellipse class="m-wingR" cx="142" cy="117" rx="16" ry="29" fill="url(#${g('mWing')})"/>

    <path d="M100 152 L98 168 M100 168 l-6 4 M100 168 l6 4" stroke="#D89A3C" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M121 152 L123 168 M123 168 l-6 4 M123 168 l6 4" stroke="#D89A3C" stroke-width="3" fill="none" stroke-linecap="round"/>

    <ellipse cx="110" cy="118" rx="38" ry="42" fill="url(#${g('mBody')})"/>
    <ellipse cx="110" cy="127" rx="26" ry="31" fill="url(#${g('mBelly')})"/>

    <g class="m-head">
      <circle cx="110" cy="70" r="33" fill="url(#${g('mHead')})"/>
      <path d="M78 62 a33 33 0 0 1 64 0 a46 46 0 0 0 -64 0 z" fill="#63D6B6" opacity=".38"/>
      <path d="M83 88 q27 13 54 0 q-27 10 -54 0 z" fill="#C2703F" opacity=".7"/>
      <path d="M80 64 Q110 54 140 64 Q142 86 110 84 Q78 86 80 64 Z" fill="#1E1512"/>
      <path d="M87 60 Q97 53.5 106 58.5" stroke="url(#${g('mBrow')})" stroke-width="5.4" fill="none" stroke-linecap="round"/>
      <path d="M114 58.5 Q123 53.5 133 60" stroke="url(#${g('mBrow')})" stroke-width="5.4" fill="none" stroke-linecap="round"/>
      <circle cx="98" cy="72" r="8.4" fill="#F6EFE2"/>
      <circle cx="122" cy="72" r="8.4" fill="#F6EFE2"/>
      <circle cx="99.4" cy="73" r="4.4" fill="#14100E"/>
      <circle cx="123.4" cy="73" r="4.4" fill="#14100E"/>
      <circle cx="101.2" cy="70.6" r="1.8" fill="#FFFFFF"/>
      <circle cx="125.2" cy="70.6" r="1.8" fill="#FFFFFF"/>
      <rect class="lid" x="89.6" y="63.6" width="16.8" height="17.2" rx="8.4" fill="#1E1512"/>
      <rect class="lid" x="113.6" y="63.6" width="16.8" height="17.2" rx="8.4" fill="#1E1512"/>
      <path d="M99 83 Q110 78.5 121 83 L110 90.5 Z" fill="#584234"/>
      <path class="m-beak" d="M100 84.5 L120 84.5 L110 103 Z" fill="#2A1E17"/>
      <g class="zzz">
        <text x="146" y="46" font-size="15" font-weight="700" fill="#A99C8E">z</text>
        <text x="158" y="34" font-size="11" font-weight="700" fill="#6E635A">z</text>
      </g>
    </g>
  </g>
</svg>`;
}

// A smaller, still Momo, for marking where you are on the path. Flat colours
// only, so it needs no ids at all and can repeat freely.
export const MOMO_MINI = `
<svg class="mini-momo" viewBox="0 0 60 60" aria-hidden="true">
  <ellipse cx="30" cy="42" rx="4" ry="7" fill="#22685C"/>
  <path d="M28 26 C26 34 26 38 27 42" stroke="#2A7A6B" stroke-width="2" fill="none"/>
  <ellipse cx="30" cy="24" rx="13" ry="14" fill="#2A7A6B"/>
  <ellipse cx="30" cy="27" rx="8" ry="10" fill="#B25E36"/>
  <circle cx="30" cy="12" r="10" fill="#4FC0A5"/>
  <path d="M22 8 Q30 3 38 8" stroke="#5FB6E0" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M20 11 Q30 7 40 11 Q41 19 30 18 Q19 19 20 11 Z" fill="#1E1512"/>
  <circle cx="26" cy="13" r="2.6" fill="#F6EFE2"/><circle cx="34" cy="13" r="2.6" fill="#F6EFE2"/>
  <circle cx="26.6" cy="13.6" r="1.4" fill="#14100E"/><circle cx="34.6" cy="13.6" r="1.4" fill="#14100E"/>
  <path d="M26 18 L34 18 L30 25 Z" fill="#2A1E17"/>
</svg>`;

const IDLE_AFTER_MS = 45000;
const STRETCH_BEFORE_MS = 9000;    // yawn this long before actually dozing off
const BEAT_MIN_MS = 12000;         // a small idle movement every 12–20s
const BEAT_MAX_MS = 20000;
const IDLE_BEATS = ['preen', 'flick', 'sidehop'];
const LONG_PRESS_MS = 550;
const FLY_OFF_MS = 1000;           // leaving
const AWAY_MS = 2600;              // the branch is genuinely empty for this long
const FLY_IN_MS = 1150;            // coming back
const FLY_CHANCE = 0.14;           // of any given idle beat — rare on purpose
const LONG_ABSENCE_DAYS = 7;       // gone this long and the perch is empty when you return

// Time of day, in the learner's own clock. Night makes him drowsy and slow,
// morning makes him quick; the middle of the day is the baseline he has
// always had. Opening the app at 11pm should not feel like opening it at 7am.
export function partOfDay(now = new Date()) {
  const h = now.getHours();
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 21 || h < 5) return 'night';
  return 'day';
}

/** Whole days between two YYYY-MM-DD stamps. */
export function daysBetween(stamp, now = new Date()) {
  if (!stamp) return 0;
  const then = new Date(`${stamp}T00:00:00`);
  if (Number.isNaN(then.getTime())) return 0;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((today - then) / 86400000));
}

// ── what he is allowed to say ───────────────────────────────
// Momo's lines live in the language pack, gated on vocabulary you have
// actually met — so he only ever speaks words you would understand, and he
// grows more idiomatic exactly as you do. He used to be hard-coded Nicaraguan
// Spanish at full slang, which meant the Luzerndütsch course had a bird
// shouting "¡Qué tuani!" at it, and a day-one beginner was greeted in phase-5
// street slang.
//
// These built-in lines are the floor, used only when a pack ships none. They
// are English on purpose: a language added to the registry tomorrow gets a
// mascot who says nothing wrong, rather than one who reverts to Spanish.
const DEFAULT_LINES = [
  { id: 'd-welcome', when: 'welcome', state: 'happy', say: "Let's go" },
  { id: 'd-back',    when: 'back',    state: 'cheer', say: "You're back!" },
  { id: 'd-poke1',   when: 'poke',    state: 'happy', say: 'Hey — how goes it?' },
  { id: 'd-poke2',   when: 'poke',    state: 'speak', say: 'Say it out loud' },
  { id: 'd-poke3',   when: 'poke',    state: 'happy', say: 'Go on then' },
  { id: 'd-great',   when: 'great',   state: 'cheer', say: 'Nicely done' },
  { id: 'd-ok',      when: 'ok',      state: 'happy', say: 'Not bad' },
  { id: 'd-poor',    when: 'poor',    state: 'wrong', say: 'Again?' },
  { id: 'd-goal',    when: 'goal',    state: 'cheer', say: 'Goal met!' },
  { id: 'd-pattern', when: 'pattern', state: 'cheer', say: 'New pattern!' },
  { id: 'd-sleep',   when: 'sleep',   state: 'sleep', say: 'Zzz… tap me' },
];

const allLines = () => (content.momo && content.momo.length ? content.momo : DEFAULT_LINES);

// Lower-cased because the two paths that record a word disagree: the reader
// stores cleanWord(...) ("grüezi") while the warm-up stores the raw headword
// ("Grüezi"). Matching either way means a line unlocks whichever way you met
// the word.
function metWords() {
  const v = store.vocab.all();
  const met = new Set();
  for (const w of Object.keys(v)) {
    if ((v[w]?.exposures || 0) >= 1) met.add(w.toLowerCase());
  }
  return met;
}

// Same trigger/min semantics as patterns: you need `min` of the trigger words.
function isEarned(line, met) {
  const trigger = line.trigger || [];
  if (!trigger.length) return true;
  const min = line.min == null ? 1 : line.min;
  return trigger.filter((w) => met.has(String(w).toLowerCase())).length >= min;
}

/** Every line for a moment that the learner has earned. */
export function earnedLines(when) {
  const met = metWords();
  return allLines().filter((l) => l.when === when && isEarned(l, met));
}

/**
 * Pick what he says. A line he has never been able to say before wins, so the
 * moment you meet the word that unlocks it, that is the line you hear — him
 * learning alongside you rather than shuffling a fixed deck.
 */
export function pickLine(when) {
  const pool = earnedLines(when);
  if (!pool.length) return null;
  const heard = store.momoLines.heard();
  const fresh = pool.filter((l) => l.id && !heard.includes(l.id));
  const chosen = fresh.length
    ? fresh[fresh.length - 1]
    : pool[Math.floor(Math.random() * pool.length)];
  if (chosen.id) store.momoLines.learn(chosen.id);
  return { ...chosen, isNew: fresh.length > 0 };
}


/**
 * Bring a Momo to life inside `hostEl`.
 *
 * `ambient` must be false for any Momo that is not the one on Today. Each
 * ambient instance arms its own sleep timer and listens on `document` for
 * activity, so two of them race: whichever fires last wins, both re-arm on
 * every tap anywhere, and the off-screen one falls asleep on its own schedule.
 * The wrap-up bird only ever reacts to a score, so it takes ambient: false.
 */
export function createMomo(hostEl, speechEl, sparksEl,
  { ambient = true, poke = true, onLongPress = null, onPoke = null } = {}) {
  let revert = null;
  let hush = null;
  let idle = null;
  let stretch = null;
  let beat = null;
  let flight = null;
  let flying = false;

  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const asleep = () => hostEl.classList.contains('sleep');

  // The time of day is a lasting property of the bird, not a reaction, so it
  // has to survive set() — which rebuilds className from scratch every time.
  // Everything that clears state goes back to base(), never to 'momo'.
  const base = () => `momo ${partOfDay()}`;
  const resting = () => hostEl.className === base();

  function toRest() { hostEl.className = base(); }

  function armIdle() {
    if (!ambient || flying) return;
    clearTimeout(idle);
    clearTimeout(stretch);
    // A stretch and a yawn first, so nodding off reads as getting sleepy
    // rather than cutting to a different picture.
    const sleepAfter = IDLE_AFTER_MS * (partOfDay() === 'night' ? 0.55 : partOfDay() === 'morning' ? 1.5 : 1);
    stretch = setTimeout(() => { if (!asleep() && resting()) flash('stretch', 1600); },
      Math.max(2000, sleepAfter - STRETCH_BEFORE_MS));
    idle = setTimeout(() => { if (!asleep()) speak('sleep'); }, sleepAfter);
    armBeat();
  }

  // The tail swinging on a fixed loop forever is what made him read as a
  // metronome. A random small beat now and then is most of what makes him
  // look alive, and it costs nothing but a class.
  function armBeat() {
    if (!ambient || reduced()) return;
    clearTimeout(beat);
    // Livelier in the morning, sluggish at night.
    const pace = partOfDay() === 'night' ? 1.6 : partOfDay() === 'morning' ? 0.75 : 1;
    beat = setTimeout(() => {
      if (!asleep() && resting()) {
        // Now and then he simply leaves. Rare on purpose: it is a surprise the
        // first few times and an irritation if it happens every minute.
        if (Math.random() < FLY_CHANCE) flyAway();
        else flash(IDLE_BEATS[Math.floor(Math.random() * IDLE_BEATS.length)], 1200);
      }
      armBeat();
    }, (BEAT_MIN_MS + Math.random() * (BEAT_MAX_MS - BEAT_MIN_MS)) * pace);
  }

  /**
   * Off the branch, gone a few seconds, back again.
   *
   * The return is scheduled as one chain from the moment he leaves, so there
   * is no path where the branch stays empty — an empty perch with no bird is
   * the one outcome that would read as broken rather than alive.
   */
  function flyAway(awayMs = AWAY_MS) {
    if (reduced() || flying || !ambient) return;
    flying = true;
    clearTimeout(idle); clearTimeout(stretch); clearTimeout(flight);
    hostEl.className = `${base()} flyoff`;
    flight = setTimeout(() => {
      hostEl.className = `${base()} flyin`;
      flight = setTimeout(() => { flying = false; toRest(); armIdle(); }, FLY_IN_MS);
    }, FLY_OFF_MS + awayMs);
  }

  /** Arrive from off-screen — for when you have been away and the perch is bare. */
  function flyIn(msg = null) {
    clearTimeout(flight);
    if (reduced()) { flying = false; toRest(); if (msg) speak(msg); armIdle(); return; }
    flying = true;
    hostEl.className = `${base()} flyin`;
    flight = setTimeout(() => {
      flying = false;
      toRest();
      if (msg) speak(msg);
      armIdle();
    }, FLY_IN_MS);
  }

  function flash(name, ms) {
    if (reduced()) return;
    hostEl.classList.add(name);
    setTimeout(() => hostEl.classList.remove(name), ms);
  }

  function burst(n) {
    if (!sparksEl) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('div');
      s.className = 'spark';
      const a = Math.random() * Math.PI * 2;
      const d = 44 + Math.random() * 66;
      s.style.setProperty('--sx', `${Math.cos(a) * d}px`);
      s.style.setProperty('--sy', `${Math.sin(a) * d - 26}px`);
      s.style.background = Math.random() > 0.5 ? 'var(--oro)' : 'var(--jade)';
      s.style.animationDelay = `${Math.random() * 0.14}s`;
      sparksEl.appendChild(s);
      void s.offsetWidth;
      s.classList.add('go');
      setTimeout(() => s.remove(), 1100);
    }
  }

  function say(msg, ms = 2400, isNew = false) {
    if (!speechEl || !msg) return;
    speechEl.innerHTML = msg;
    speechEl.classList.add('show');
    speechEl.classList.toggle('fresh', !!isNew);
    clearTimeout(hush);
    hush = setTimeout(() => {
      speechEl.classList.remove('show');
      speechEl.classList.remove('fresh');
    }, ms);
  }

  function set(state, msg, isNew = false) {
    if (flying) return;                    // he is not here to react
    toRest();
    void hostEl.offsetWidth;               // restart the animation
    if (state && state !== 'idle') hostEl.classList.add(state);
    if (isNew) hostEl.classList.add('learned');
    if (msg) say(msg, state === 'sleep' ? 4200 : isNew ? 3600 : 2600, isNew);
    if (state === 'happy') burst(9);
    if (state === 'cheer') burst(isNew ? 20 : 16);

    clearTimeout(revert);
    if (state && state !== 'sleep' && state !== 'idle') {
      revert = setTimeout(() => { if (!flying) toRest(); }, state === 'cheer' ? 1300 : 1100);
    }
    armIdle();
  }

  /** Say something he has earned for this moment. Returns the line, or null. */
  function speak(when) {
    const line = pickLine(when);
    if (!line) return null;
    set(line.state, line.say, line.isNew);
    return line;
  }

  function wake() {
    hostEl.className = `${base()} startle`;
    setTimeout(() => { if (hostEl.classList.contains('startle')) toRest(); }, 700);
    armIdle();
  }

  const perch = poke ? hostEl.closest('.perch') : null;
  if (perch) {
    let press = null;
    let longFired = false;
    const cancel = () => clearTimeout(press);

    perch.addEventListener('pointerdown', () => {
      longFired = false;
      if (!onLongPress) return;
      press = setTimeout(() => { longFired = true; onLongPress(api); }, LONG_PRESS_MS);
    }, { passive: true });
    perch.addEventListener('pointerup', cancel, { passive: true });
    perch.addEventListener('pointerleave', cancel, { passive: true });
    perch.addEventListener('pointercancel', cancel, { passive: true });

    perch.addEventListener('click', () => {
      if (longFired) { longFired = false; return; }   // the long press already answered
      if (flying) return;                             // there is no bird to poke
      if (asleep()) return wake();                    // startle him first, poke next tap
      if (onPoke && onPoke(api)) return;              // a quiz answer was owed
      speak('poke');
    });
  }

  if (ambient) document.addEventListener('pointerdown', armIdle, { passive: true });
  armIdle();

  const api = {
    set,
    say,
    speak,
    flash,
    flyAway,
    react: (correct, msg) => set(correct ? 'happy' : 'wrong', msg),
    celebrate: (msg) => set('cheer', msg),
    /** Score out of 100 → the matching bucket of earned lines. */
    reactToScore(pct) {
      return speak(pct >= 80 ? 'great' : pct >= 50 ? 'ok' : 'poor');
    },

    /**
     * Opening Today after being away. Same day or yesterday is just a normal
     * visit. A few days and he says so. A week or more and the branch is bare
     * when the screen appears — he arrives after you do, which is the whole
     * point: coming back should not look identical to never having left.
     */
    arrive(daysAway = 0) {
      if (daysAway < 2) return null;
      if (daysAway >= LONG_ABSENCE_DAYS) {
        hostEl.className = `${base()} offstage`;
        setTimeout(() => flyIn('back'), 420);
        return 'flew-in';
      }
      speak('back');
      return 'greeted';
    },
  };
  return api;
}
