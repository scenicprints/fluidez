// Progress is stored PER COURSE. This checks that it is, and that a device
// which predates the split keeps what it had.
//
//   node docs/js/store.test.mjs
//
// Before the split, everything was keyed on the user alone — and because both
// courses number their stories p0-01..p7-18, sharing was not a leak, it was an
// ALIAS: fifteen Spanish stories read made the German Path show fifteen read.

import assert from 'node:assert/strict';

// A localStorage that behaves like the real one, defined before the module is
// imported because store.js reads it at call time.
const mem = new Map();
globalThis.localStorage = {
  get length() { return mem.size; },
  key: (i) => [...mem.keys()][i] ?? null,
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  clear: () => mem.clear(),
};
// Object.keys(localStorage) is what wipeUser and courseCodes walk.
globalThis.localStorage = new Proxy(globalThis.localStorage, {
  ownKeys: () => [...mem.keys()],
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});

const store = await import('./store.js');

let passed = 0;
const test = (name, fn) => {
  try { mem.clear(); fn(); passed++; }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
};

const seed = (k, v) => mem.set(k, JSON.stringify(v));

test('two courses do not share their stories', () => {
  seed('fl:kev:settings', { language: 'es-ni' });
  store.setUser('kev');
  store.progress.markRead('p0-01');
  store.progress.markRead('p0-02');
  assert.deepEqual(store.progress.all().storiesRead, ['p0-01', 'p0-02']);

  store.setCourse('de-ch');
  // The same ids exist in the German course. Before the split this read
  // ['p0-01','p0-02'] and the Path showed two stories already done.
  assert.deepEqual(store.progress.all().storiesRead, []);
  store.progress.markRead('p0-01');
  assert.deepEqual(store.progress.all().storiesRead, ['p0-01']);

  store.setCourse('es-ni');
  assert.deepEqual(store.progress.all().storiesRead, ['p0-01', 'p0-02']);
});

test('vocabulary does not pile up across courses', () => {
  seed('fl:kev:settings', { language: 'es-ni' });
  store.setUser('kev');
  store.recordExposure(['calor']);
  store.setCourse('de-ch');
  store.recordExposure(['Koffer']);
  assert.deepEqual(Object.keys(store.vocab.all()), ['Koffer']);
  store.setCourse('es-ni');
  assert.deepEqual(Object.keys(store.vocab.all()), ['calor']);
});

test('the streak, the goal and the settings are the READER, not the course', () => {
  // Doing a German lesson today has to keep yesterday's streak alive.
  seed('fl:kev:settings', { language: 'es-ni' });
  store.setUser('kev');
  store.daily.setGoal(30);
  store.daily.record(5);
  const streak = store.daily.streak();
  const today = store.daily.todayCount();
  assert.ok(streak >= 1);

  store.setCourse('de-ch');
  assert.equal(store.daily.streak(), streak);
  assert.equal(store.daily.todayCount(), today);
  assert.equal(store.daily.goal(), 30);
  assert.equal(store.settings.get('language'), 'es-ni');
});

test('patterns unlock per course', () => {
  seed('fl:kev:settings', { language: 'es-ni' });
  store.setUser('kev');
  store.patterns.unlock('saludos');
  store.setCourse('de-ch');
  assert.deepEqual(store.patterns.unlocked(), []);
  store.patterns.unlock('gruezi');
  store.setCourse('es-ni');
  assert.deepEqual(store.patterns.unlocked(), ['saludos']);
});

test('a device from before the split keeps what it had, filed under es-ni', () => {
  // Everything flat was Spanish: de-ch shipped with no lessons until the day
  // the split landed, so there was no German progress to lose.
  seed('fl:kev:settings', { language: 'de-ch' });
  seed('fl:kev:vocab', { calor: { exposures: 9 } });
  seed('fl:kev:progress', { storiesRead: ['p0-01', 'p0-02', 'p0-03'] });
  seed('fl:kev:patterns', ['saludos']);

  store.setUser('kev');

  // It did NOT land on de-ch just because that is the course now open.
  store.setCourse('de-ch');
  assert.deepEqual(store.progress.all().storiesRead, []);
  assert.deepEqual(store.vocab.all(), {});

  store.setCourse('es-ni');
  assert.deepEqual(store.progress.all().storiesRead, ['p0-01', 'p0-02', 'p0-03']);
  assert.equal(store.vocab.all().calor.exposures, 9);
  assert.deepEqual(store.patterns.unlocked(), ['saludos']);

  // And the flat keys are gone, so it cannot run twice.
  assert.equal(mem.get('fl:kev:vocab'), undefined);
  assert.equal(mem.get('fl:kev:progress'), undefined);
});

test('migration never overwrites a course that already has progress', () => {
  seed('fl:kev:settings', { language: 'es-ni' });
  seed('fl:kev:progress', { storiesRead: ['stale'] });
  seed('fl:kev:es-ni:progress', { storiesRead: ['real'] });
  store.setUser('kev');
  store.setCourse('es-ni');
  assert.deepEqual(store.progress.all().storiesRead, ['real']);
});

test('the snapshot carries EVERY course, not just the open one', () => {
  seed('fl:kev:settings', { language: 'es-ni' });
  store.setUser('kev');
  store.progress.markRead('p0-01');
  store.setCourse('de-ch');
  store.progress.markRead('p0-09');

  const snap = store.snapshot();
  // A phone that pushed only the course it happened to have open would wipe
  // the other one's progress off every other device.
  assert.deepEqual(Object.keys(snap.courses).sort(), ['de-ch', 'es-ni']);
  assert.deepEqual(snap.courses['es-ni'].progress.storiesRead, ['p0-01']);
  assert.deepEqual(snap.courses['de-ch'].progress.storiesRead, ['p0-09']);
  // And the flat names are GONE. Publishing the open course under them would
  // make a device on the previous build pull German progress and restore it as
  // Spanish; leaving them out makes it skip progress and keep its own.
  assert.equal(snap.vocab, undefined);
  assert.equal(snap.progress, undefined);
  assert.equal(snap.patterns, undefined);
});

test('restoring the new shape puts each course back where it belongs', () => {
  seed('fl:kev:settings', { language: 'es-ni' });
  store.setUser('kev');
  store.restore({
    courses: {
      'es-ni': { vocab: { calor: { exposures: 3 } }, progress: { storiesRead: ['p0-01'] }, patterns: ['saludos'] },
      'de-ch': { vocab: { Koffer: { exposures: 1 } }, progress: { storiesRead: ['p0-04'] }, patterns: [] },
    },
    settings: { language: 'es-ni' },
    streak: 4,
  });
  store.setCourse('es-ni');
  assert.deepEqual(store.progress.all().storiesRead, ['p0-01']);
  store.setCourse('de-ch');
  assert.deepEqual(store.progress.all().storiesRead, ['p0-04']);
  assert.equal(store.daily.streak(), 4);
});

test('restoring an OLD cloud document does not land on the open course', () => {
  seed('fl:kev:settings', { language: 'de-ch' });
  store.setUser('kev');
  store.setCourse('de-ch');
  store.restore({
    vocab: { calor: { exposures: 5 } },
    progress: { storiesRead: ['p0-01', 'p0-02'] },
    patterns: ['saludos'],
    streak: 2,
  });
  assert.deepEqual(store.progress.all().storiesRead, [], 'Spanish landed on German');
  store.setCourse('es-ni');
  assert.deepEqual(store.progress.all().storiesRead, ['p0-01', 'p0-02']);
  assert.equal(store.daily.streak(), 2);
});

test('wiping a user takes every course with it', () => {
  seed('fl:kev:settings', { language: 'es-ni' });
  store.setUser('kev');
  store.progress.markRead('p0-01');
  store.setCourse('de-ch');
  store.progress.markRead('p0-01');
  store.wipeUser('kev');
  assert.equal([...mem.keys()].filter((k) => k.startsWith('fl:kev:')).length, 0);
});

console.log(`${passed} passed${process.exitCode ? ', SOME FAILED' : ''}`);
