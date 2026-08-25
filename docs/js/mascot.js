// The mascot: what it does, when, and what it is allowed to say.
//
// This file is the behaviour. The animal itself lives in `creatures.js`, one
// per language, and every one of them exposes the same rig — so nothing here
// knows whether it is driving a bird or a marmot. Swapping the course swaps
// the creature and the timers carry on unchanged.
//
// The two halves are deliberately separate: a new language needs new artwork
// and a handful of CSS keyframes, never a new state machine.

import { content } from './content.js';
import * as store from './store.js';
import { CREATURES, DEFAULT_CREATURE, creatureFor } from './creatures.js';

let creature = CREATURES[DEFAULT_CREATURE];

/** Choose the animal. Called once the language pack is known. */
export function setCreature(code, declared) {
  creature = creatureFor(code, declared);
  return creature;
}
export const currentCreature = () => creature;

/** The mascot as SVG. `uid` suffixes every internal id — see creatures.js. */
export const mascotSvg = (uid = 'a') => creature.svg(uid);

/** The small one that marks where you are on the Path. */
export const mascotMini = () => creature.mini;

const IDLE_AFTER_MS = 45000;
const STRETCH_BEFORE_MS = 9000;    // yawn this long before actually dozing off
const BEAT_MIN_MS = 12000;         // a small idle movement every 12–20s
const BEAT_MAX_MS = 20000;
const LONG_PRESS_MS = 550;
const LEAVE_MS = 1000;             // going
const AWAY_MS = 2600;              // the perch is genuinely empty for this long
const ARRIVE_MS = 1150;            // coming back
const LEAVE_CHANCE = 0.14;         // of any given idle beat — rare on purpose
const LONG_ABSENCE_DAYS = 7;       // gone this long and the perch is bare when you return

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
// The lines live in the language pack, gated on vocabulary you have actually
// met — so he only ever speaks words you would understand, and he grows more
// idiomatic exactly as you do. He used to be hard-coded Nicaraguan Spanish at
// full slang, which meant a day-one beginner was greeted in phase-5 street
// slang and a Swiss German course would have a bird shouting "¡Qué tuani!".
//
// A pack that ships no lines gets a mascot who reacts and says nothing. He
// used to fall back to a set of English ones, which is indefensible in a
// language app: the whole point is that you hear the language, and English
// coming out of him is worse than silence.
const SILENT_STATES = {
  welcome: 'happy', back: 'cheer', poke: 'happy', great: 'cheer',
  ok: 'happy', poor: 'wrong', goal: 'cheer', pattern: 'cheer', sleep: 'sleep',
};

const allLines = () => (content.momo && content.momo.length ? content.momo : []);

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
 * Bring a mascot to life inside `hostEl`.
 *
 * `ambient` must be false for any mascot that is not the one on Today. Each
 * ambient instance arms its own sleep timer and listens on `document` for
 * activity, so two of them race: whichever fires last wins, both re-arm on
 * every tap anywhere, and the off-screen one falls asleep on its own schedule.
 * The wrap-up mascot only ever reacts to a score, so it takes ambient: false.
 */
export function createMascot(hostEl, speechEl, sparksEl,
  { ambient = true, poke = true, onLongPress = null, onPoke = null } = {}) {
  let revert = null;
  let hush = null;
  let idle = null;
  let stretch = null;
  let beat = null;
  let trip = null;
  let gone = false;

  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const asleep = () => hostEl.classList.contains('sleep');

  // The species and the time of day are lasting properties, not reactions, so
  // they have to survive set() — which rebuilds className from scratch every
  // time. Everything that clears state goes back to base(), never to 'momo'.
  const base = () => `momo ${creature.id} ${partOfDay()}`;
  const resting = () => hostEl.className === base();

  function toRest() { hostEl.className = base(); }

  function armIdle() {
    if (!ambient || gone) return;
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

  // A fixed animation loop forever is what made the first version read as a
  // metronome. A random small beat now and then is most of what makes him look
  // alive, and it costs nothing but a class. Which beats exist is the
  // creature's business: a bird preens, a marmot grooms and checks the sky.
  function armBeat() {
    if (!ambient || reduced()) return;
    clearTimeout(beat);
    // Livelier in the morning, sluggish at night.
    const pace = partOfDay() === 'night' ? 1.6 : partOfDay() === 'morning' ? 0.75 : 1;
    beat = setTimeout(() => {
      if (!asleep() && resting()) {
        // Now and then he simply goes. Rare on purpose: it is a surprise the
        // first few times and an irritation if it happens every minute.
        if (Math.random() < LEAVE_CHANCE) depart();
        else flash(creature.beats[Math.floor(Math.random() * creature.beats.length)], 1200);
      }
      armBeat();
    }, (BEAT_MIN_MS + Math.random() * (BEAT_MAX_MS - BEAT_MIN_MS)) * pace);
  }

  /**
   * Off the perch, gone a few seconds, back again. A bird flies; a marmot goes
   * down a hole. Which one is the creature's own `leave` and `arrive` classes.
   *
   * The return is scheduled as one chain from the moment he goes, so there is
   * no path where the perch stays empty — an empty perch with nothing on it is
   * the one outcome that would read as broken rather than alive.
   */
  function depart(awayMs = AWAY_MS) {
    if (reduced() || gone || !ambient) return;
    gone = true;
    clearTimeout(idle); clearTimeout(stretch); clearTimeout(trip);
    hostEl.className = `${base()} ${creature.leave}`;
    trip = setTimeout(() => {
      hostEl.className = `${base()} ${creature.arrive}`;
      trip = setTimeout(() => { gone = false; toRest(); armIdle(); }, ARRIVE_MS);
    }, LEAVE_MS + awayMs);
  }

  /** Arrive from nowhere — for when you have been away and the perch is bare. */
  function returnTo(msg = null) {
    clearTimeout(trip);
    if (reduced()) { gone = false; toRest(); if (msg) speak(msg); armIdle(); return; }
    gone = true;
    hostEl.className = `${base()} ${creature.arrive}`;
    trip = setTimeout(() => {
      gone = false;
      toRest();
      if (msg) speak(msg);
      armIdle();
    }, ARRIVE_MS);
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
    if (gone) return;                      // he is not here to react
    toRest();
    void hostEl.offsetWidth;               // restart the animation
    if (state && state !== 'idle') hostEl.classList.add(state);
    if (isNew) hostEl.classList.add('learned');
    if (msg) say(msg, state === 'sleep' ? 4200 : isNew ? 3600 : 2600, isNew);
    if (state === 'happy') burst(9);
    if (state === 'cheer') burst(isNew ? 20 : 16);

    clearTimeout(revert);
    if (state && state !== 'sleep' && state !== 'idle') {
      revert = setTimeout(() => { if (!gone) toRest(); }, state === 'cheer' ? 1300 : 1100);
    }
    armIdle();
  }

  /**
   * React to a moment, in the language being learnt. With no line earned yet
   * he still moves — the reaction is the point, the words are the reward.
   */
  function speak(when) {
    const line = pickLine(when);
    if (!line) {
      const state = SILENT_STATES[when];
      if (state) set(state, null);
      return null;
    }
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
      if (gone) return;                               // there is nothing there to poke
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
    depart,
    react: (correct, msg) => set(correct ? 'happy' : 'wrong', msg),
    celebrate: (msg) => set('cheer', msg),
    /** Score out of 100 → the matching bucket of earned lines. */
    reactToScore(pct) {
      return speak(pct >= 80 ? 'great' : pct >= 50 ? 'ok' : 'poor');
    },

    /**
     * Opening Today after being away. Same day or yesterday is just a normal
     * visit. A few days and he says so. A week or more and the perch is bare
     * when the screen appears — he arrives after you do, which is the whole
     * point: coming back should not look identical to never having left.
     */
    arrive(daysAway = 0) {
      if (daysAway < 2) return null;
      if (daysAway >= LONG_ABSENCE_DAYS) {
        hostEl.className = `${base()} ${creature.away}`;
        setTimeout(() => returnTo('back'), 420);
        return 'returned';
      }
      speak('back');
      return 'greeted';
    },
  };
  return api;
}
