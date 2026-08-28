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
const asyncTest = async (name, fn) => {
  try { await fn(); passed++; }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
};

// ── the little bit of browser content.js touches ────────────
//
// Stored keys are real enumerable properties, because that is what a browser's
// Storage looks like and content.js walks it with Object.keys — a Map behind
// getItem/setItem would make every key invisible and the eviction below would
// pass by doing nothing at all.
function makeStorage(limitChars = Infinity) {
  const s = {};
  const def = (name, fn) => Object.defineProperty(s, name, { value: fn, enumerable: false });
  const has = (k) => Object.prototype.hasOwnProperty.call(s, k);
  const used = () => Object.keys(s).reduce((n, k) => n + k.length + s[k].length, 0);
  def('getItem', (k) => (has(k) ? s[k] : null));
  def('setItem', (k, v) => {
    v = String(v);
    const after = used() - (has(k) ? k.length + s[k].length : 0) + k.length + v.length;
    if (after > limitChars) {
      const e = new Error('QuotaExceededError');
      e.name = 'QuotaExceededError';
      throw e;
    }
    s[k] = v;
  });
  def('removeItem', (k) => { delete s[k]; });
  return s;
}
globalThis.localStorage = makeStorage();
globalThis.document = { documentElement: { dataset: {} } };
globalThis.window = globalThis;

const { content, loadCachedPack, ALL_FEATURES, downloadPack, packVersion, checkForContentUpdate } =
  await import('./content.js');

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

// ── downloading, and the banner that would not go away ──────
//
// A tester on Chrome reported the "New lessons are available" banner coming
// back on every launch, with a download that never took. Two faults, both of
// which end in the same place: the version on the device never advances, so
// the app offers the same download forever.
//
//   1. The pack was written to local storage TWICE — once as `lessons` and
//      `scenarios`, and again inside `manifest`, which nothing read. 4.34 MB
//      for a 2.42 MB course. On a device already holding the other course it
//      did not fit, the write failed, and nothing was kept.
//   2. The file-by-file fallback cached a pack with no version at all, because
//      it took its manifest from manifest.json and neither course has ever put
//      a version in that file. No version can never equal the live one.

const SENTINEL = 'Der Zug faehrt gleich ab.';
const VERSION = '20260827-1250+a214d2a';
const LANG = {
  code: 'de-ch', name: 'Swiss German',
  user: 'scenicprints', repo: 'fluidez-de-ch', branch: 'main',
};
const LESSON = {
  id: 'p0-01', title: 'Der Zug', desc: 'A train', ph: 0, diff: 1, wu: ['Zug'],
  sn: [{ s: SENTINEL, e: 'The train leaves shortly.' }],
};
const SCENARIO = { id: 'sc01', title: 'Am Schalter', ph: 0, steps: [] };
const BUNDLE = {
  version: VERSION,
  language: 'de-ch',
  features: ['reader', 'words'],
  speech: 'de-CH',
  dictionary: { Zug: { en: 'train' } },
  forms: { Zuege: 'Zug' },
  patterns: [],
  lessons: [LESSON],
  scenarios: [SCENARIO],
  verbs: null,
  mascot: 'bluemli',
  phases: [['Landing', 'Arriving']],
  icons: { path: 'ic-gondola' },
  momo: { lines: [{ id: 'b1' }] },
  emergency: [{ title: 'Notfall', phrases: [{ es: 'Hilfe', en: 'Help' }] }],
};

/** Serve a fixed set of content files, and 404 anything not listed. */
function serve(files) {
  globalThis.fetch = async (url) => {
    const path = String(url).split('/content/')[1];
    const body = files[path];
    if (body === undefined) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body)) };
  };
}
const count = (haystack, needle) => haystack.split(needle).length - 1;

await asyncTest('a downloaded course is stored ONCE, not twice', async () => {
  globalThis.localStorage = makeStorage();
  serve({ 'pack.json': BUNDLE, 'version.json': { version: VERSION } });

  const { stored } = await downloadPack(LANG);
  assert.equal(stored, true, 'the pack was not stored at all');

  const raw = localStorage.getItem('fl:c:pack:de-ch');
  const pack = JSON.parse(raw);
  assert.equal(pack.manifest.lessons, undefined, 'the stories are in the manifest again');
  assert.equal(pack.manifest.scenarios, undefined, 'the scenes are in the manifest again');
  assert.equal(count(raw, SENTINEL), 1,
    `the course is written to local storage ${count(raw, SENTINEL)} times`);

  // What the manifest is actually for.
  assert.equal(pack.manifest.version, VERSION);
  assert.deepEqual(pack.manifest.features, ['reader', 'words']);
  assert.equal(pack.manifest.emergency, true);
  assert.equal(pack.manifest.emergencyData[0].title, 'Notfall');
});

await asyncTest('what is on the device is stamped, and the banner then stops', async () => {
  assert.equal(packVersion('de-ch'), VERSION, 'no version stamp after a good download');
  const r = await checkForContentUpdate(LANG);
  assert.equal(r.available, false, 'still offering a download of what we already have');
});

await asyncTest('no room: the other course is given up rather than this one', async () => {
  // Room for one course and not two, which is exactly the device that reported
  // this. The Spanish pack is re-downloadable; the German one is on screen.
  const bundleSize = JSON.stringify(BUNDLE).length;
  globalThis.localStorage = makeStorage(bundleSize * 3);
  localStorage.setItem('fl:c:pack:es-ni', 'x'.repeat(bundleSize * 2));
  localStorage.setItem('fl:c:ver:es-ni', 'old-spanish-version');
  serve({ 'pack.json': BUNDLE, 'version.json': { version: VERSION } });

  const { stored } = await downloadPack(LANG);
  assert.equal(stored, true, 'gave up instead of making room');
  assert.equal(localStorage.getItem('fl:c:pack:es-ni'), null, 'the other pack is still there');
  assert.equal(localStorage.getItem('fl:c:ver:es-ni'), null,
    'the other course still claims a version it no longer has');
  assert.equal(packVersion('de-ch'), VERSION);
});

await asyncTest('no room at all: say so once, and stop asking', async () => {
  globalThis.localStorage = makeStorage(200);   // nothing of this size fits
  serve({ 'pack.json': BUNDLE, 'version.json': { version: VERSION } });

  const { stored } = await downloadPack(LANG);
  assert.equal(stored, false);
  assert.equal(packVersion('de-ch'), null, 'claims a version it did not manage to keep');

  const r = await checkForContentUpdate(LANG);
  assert.equal(r.available, true, 'there IS an update — the question was answered dishonestly');
  assert.equal(r.willNotFit, true, 'nothing marks this as already tried and impossible');
});

await asyncTest('the file-by-file fallback stamps a version too', async () => {
  globalThis.localStorage = makeStorage();
  serve({
    // No pack.json: this is the path that runs when the bundle will not come
    // down — a 1.7 MB file against a 20 second timeout on a phone.
    'manifest.json': {
      name: 'Swiss German', speech: 'de-CH', features: ['reader', 'words'],
      dictionary: ['dictionary/core.json'], patterns: [], emergency: 'emergency.json',
      lessons: [{ id: 'p0-01', path: 'lessons/p0-01.json' }],
      scenarios: [{ id: 'sc01', path: 'scenarios/sc01.json' }],
    },
    'dictionary/core.json': { Zug: { en: 'train' } },
    'lessons/p0-01.json': LESSON,
    'scenarios/sc01.json': SCENARIO,
    'emergency.json': [{ title: 'Notfall', phrases: [{ es: 'Hilfe', en: 'Help' }] }],
    'version.json': { version: VERSION },
  });

  const { stored, lost } = await downloadPack(LANG);
  assert.equal(stored, true);
  assert.equal(lost, 0);
  assert.equal(packVersion('de-ch'), VERSION,
    'a course assembled file by file can never be up to date');
  assert.equal((await checkForContentUpdate(LANG)).available, false);

  // The phrasebook is data on this path too, not a path to it.
  const pack = JSON.parse(localStorage.getItem('fl:c:pack:de-ch'));
  assert.equal(pack.manifest.emergencyData[0].title, 'Notfall');
  assert.equal(pack.manifest.lessons, undefined);
});

await asyncTest('a download with holes in it is not stamped as complete', async () => {
  globalThis.localStorage = makeStorage();
  serve({
    'manifest.json': {
      features: ['reader'], dictionary: [], patterns: [],
      lessons: [
        { id: 'p0-01', path: 'lessons/p0-01.json' },
        { id: 'p0-02', path: 'lessons/p0-02.json' },   // never served
      ],
      scenarios: [],
    },
    'lessons/p0-01.json': LESSON,
    'version.json': { version: VERSION },
  });

  const { lost } = await downloadPack(LANG);
  assert.equal(lost, 1);
  assert.equal(packVersion('de-ch'), null,
    'a course missing a story would report itself up to date');
  assert.equal((await checkForContentUpdate(LANG)).available, true);
});

console.log(`${passed} checks passed`);
