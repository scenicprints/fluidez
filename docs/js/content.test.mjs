// Checks that a downloaded course actually reaches the app.
//
//   node docs/js/content.test.mjs
//
// This exists because of a real bug. applyPack() copies the pack into the
// live `content` object one named field at a time — it is not a spread — and
// Granada was added to the pack, to the cache and to the features list but not
// to that one function. The result: the tab appeared, the feature said yes,
// the data was sitting in localStorage, and the screen said "the game has not
// been downloaded yet".
//
// Every other test in the repo handed the data straight to the thing under
// test, so none of them could see it. This one goes through the real path.

import assert from 'node:assert/strict';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
};

// ── the little bit of browser content.js touches ────────────
globalThis.localStorage = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
})();
globalThis.document = { documentElement: { dataset: {} } };
globalThis.window = globalThis;

const { content, loadCachedPack, ALL_FEATURES } = await import('./content.js');

// A pack shaped exactly like the one build-pack.py writes, with a sentinel in
// every field that is meant to survive the trip.
const PACK = {
  language: { code: 'es-ni', name: 'Nicaraguan Spanish' },
  manifest: { version: 'test', features: ['reader', 'words', 'game'] },
  dict: { hola: { en: 'hello' } },
  forms: { holas: 'hola' },
  patterns: [{ id: 'p1' }],
  lessons: [{ id: 'l1', sn: [] }],
  scenarios: [{ id: 's1', steps: [] }],
  verbs: { regular: {} },
  game: { missions: [{ id: 'centro-01', beats: [] }], crowd: [{ id: 'c1' }] },
  mascot: 'momo',
  phases: [{ id: 'a0' }],
  ui: { today: 'Hoy' },
  icons: { path: 'ic-volcano' },
  momo: [{ id: 'm1' }],
};

localStorage.setItem('fl:c:pack:es-ni', JSON.stringify(PACK));

test('a cached pack loads', () => {
  assert.equal(loadCachedPack('es-ni'), true);
});

test('EVERY field of the pack reaches the app', () => {
  // Named one by one on purpose. applyPack() names them one by one too, and
  // this is the list that catches the next one somebody forgets.
  const carried = {
    language: 'language', manifest: 'manifest', dict: 'dict', forms: 'forms',
    patterns: 'patterns', lessons: 'lessons', scenarios: 'scenarios',
    verbs: 'verbs', game: 'game', mascot: 'mascot', phases: 'phases',
    ui: 'ui', icons: 'icons', momo: 'momo',
  };
  const missing = [];
  for (const [packField, contentField] of Object.entries(carried)) {
    const want = PACK[packField];
    const got = content[contentField];
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      missing.push(`${packField}: pack has ${JSON.stringify(want).slice(0, 40)}, ` +
                   `content has ${JSON.stringify(got)}`);
    }
  }
  assert.equal(missing.length, 0, '\n      ' + missing.join('\n      '));
});

test('the game arrives with its missions, not just its feature flag', () => {
  assert.ok(content.has('game'), 'feature not declared');
  assert.ok(content.game, 'content.game is null with the feature on — this is ' +
                          'the exact bug: tab shows, screen has nothing');
  assert.equal(content.game.missions.length, 1);
});

test('a course without a game gets no game and no tab', () => {
  localStorage.setItem('fl:c:pack:de-ch', JSON.stringify({
    ...PACK,
    language: { code: 'de-ch', name: 'Schweizer Hochdeutsch' },
    manifest: { version: 'test', features: ['reader', 'words'] },
    game: null,
  }));
  loadCachedPack('de-ch');
  assert.equal(content.game, null);
  assert.equal(content.has('game'), false);
});

test('game is a real feature the app knows about', () => {
  assert.ok(ALL_FEATURES.includes('game'));
});

console.log(`${passed} checks passed`);
