// Fetching and caching the course.
//
// Everything comes from GitHub: a registry repo listing the languages, and one
// repo per language holding its manifest, dictionary, patterns, lessons and
// scenarios. Nothing about the course lives in this app, which is what lets a
// new lesson — or a whole new language — appear without an app release.
//
// The entire pack is downloaded once and kept in local storage, so the app
// works with no signal at all. That is the point: this gets used in Nicaragua.

const REGISTRY = {
  user: 'scenicprints',
  repo: 'fluidez-languages',
  branch: 'main',
};

const FALLBACK_LANGUAGE = {
  code: 'es-ni',
  name: 'Nicaraguan Spanish',
  flag: '🇳🇮',
  user: 'scenicprints',
  repo: 'fluidez-es-ni',
  branch: 'main',
};

const registryUrls = () => [
  `https://raw.githubusercontent.com/${REGISTRY.user}/${REGISTRY.repo}/${REGISTRY.branch}/languages.json`,
  `https://cdn.jsdelivr.net/gh/${REGISTRY.user}/${REGISTRY.repo}@${REGISTRY.branch}/languages.json`,
];

// Two ways to reach the same files. raw.githubusercontent is always current,
// which is what makes "push a lesson and it appears" true — but it rate-limits
// by IP and answers 429, which would strand a whole household on one wifi.
// jsDelivr mirrors the same repo with no such limit, at the cost of caching a
// branch for a few hours. So: raw first for freshness, CDN as the safety net.
const contentBases = (lang) => {
  const { user, repo } = lang;
  const branch = lang.branch || 'main';
  return [
    `https://raw.githubusercontent.com/${user}/${repo}/${branch}/content`,
    `https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/content`,
  ];
};

const rawBase = (lang) => contentBases(lang)[0];

// Every feature the app can offer. A language's manifest lists the ones it
// actually supports; anything not listed simply never appears. That is how
// Swiss German ends up with no verb trainer instead of a broken Spanish one.
export const ALL_FEATURES = [
  'reader', 'scenes', 'review', 'verbs', 'order', 'words', 'patterns', 'audio',
];

const CK = {
  languages: 'fl:c:languages',
  pack: (code) => `fl:c:pack:${code}`,
};

// Every request is bounded. On a bad connection a hung fetch is far worse
// than a failed one: the app has good cached answers and can carry on, but
// only if it is ever told the network is not coming.
async function getJson(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Same file, whichever host will serve it. */
async function getContent(lang, path, timeoutMs = 20000) {
  let lastError;
  for (const base of contentBases(lang)) {
    try {
      return await getJson(`${base}/${path}`, timeoutMs);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error(`could not fetch ${path}`);
}

function cacheRead(k) {
  try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch { return null; }
}
function cacheWrite(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; }
  catch { return false; } // quota — the app still works, it just refetches
}

// ── languages ───────────────────────────────────────────────
export const content = {
  languages: [FALLBACK_LANGUAGE],
  language: null,     // the active language descriptor
  manifest: null,
  dict: {},
  forms: {},          // inflected form -> the dictionary entry it belongs to
  patterns: [],
  lessons: [],
  scenarios: [],
  verbs: null,
  momo: [],           // what the mascot may say, gated on vocabulary

  features() {
    const declared = this.manifest && this.manifest.features;
    if (Array.isArray(declared) && declared.length) return declared;
    // No declaration (older content): infer from what actually arrived, and
    // never assume audio — a language with no speech voice must opt in.
    const f = ['words'];
    if (this.lessons.length) f.push('reader', 'review', 'order');
    if (this.scenarios.length) f.push('scenes');
    if (this.patterns.length) f.push('patterns');
    if (this.verbs) f.push('verbs');
    return f;
  },

  has(feature) { return this.features().includes(feature); },
};

export async function loadLanguages({ allowNetwork = true, timeoutMs = 6000 } = {}) {
  const cached = cacheRead(CK.languages);
  if (cached) content.languages = cached;
  if (!allowNetwork) return content.languages;
  try {
    let doc = null;
    for (const url of registryUrls()) {
      try { doc = await getJson(url, timeoutMs); break; } catch {}
    }
    const list = Array.isArray(doc) ? doc : doc && doc.languages;
    if (Array.isArray(list) && list.length) {
      content.languages = list;
      cacheWrite(CK.languages, list);
    }
  } catch {
    // Offline, rate limited, or the registry moved. The cached list — or at
    // worst the built-in fallback — stands, and the picker still works.
  }
  return content.languages;
}

export function findLanguage(code) {
  return content.languages.find((l) => l.code === code) ||
    (code === FALLBACK_LANGUAGE.code ? FALLBACK_LANGUAGE : null);
}

// ── shaping raw JSON into what the app uses ─────────────────
const asLesson = (j) => ({
  id: j.id,
  title: j.title || 'Untitled',
  desc: j.desc || '',
  phase: Number(j.ph ?? j.phase ?? 0),
  diff: Number(j.diff ?? 1),
  warmup: j.wu || j.warmup || [],
  sentences: (j.sn || j.sentences || []).map((s) => ({ es: s.s ?? s.es, en: s.e ?? s.en })),
});

const asScenario = (j) => ({
  id: j.id,
  title: j.title || 'Untitled',
  desc: j.desc || '',
  setting: j.setting || '',
  phase: Number(j.ph ?? j.phase ?? 0),
  steps: (j.steps || []).map((st) => ({
    speaker: st.speaker || '',
    es: st.es ?? st.promptEs,
    en: st.en ?? st.promptEn,
    options: (st.options || []).map((o) => ({
      es: o.es, en: o.en, verdict: o.verdict || 'ok', feedback: o.feedback || '',
    })),
  })),
});

// ── the language pack ───────────────────────────────────────
// One object holding the whole course for a language, cached as a unit so a
// cold start with no network is just a local-storage read.

export function loadCachedPack(code) {
  const pack = cacheRead(CK.pack(code));
  if (!pack) return false;
  applyPack(pack);
  return true;
}

function applyPack(pack) {
  content.language = pack.language;
  content.manifest = pack.manifest;
  content.dict = pack.dict || {};
  content.forms = pack.forms || {};
  content.patterns = pack.patterns || [];
  content.lessons = pack.lessons || [];
  content.scenarios = pack.scenarios || [];
  content.verbs = pack.verbs || null;
  content.momo = pack.momo || [];
}

export function packVersion(code) {
  const pack = cacheRead(CK.pack(code));
  return pack ? (pack.manifest?.version ?? null) : null;
}

/**
 * Download an entire language. Reports progress so the setup screen can show
 * something honest rather than an indeterminate spinner.
 */
export async function downloadPack(lang, onProgress = () => {}) {
  // Fast path: the content repo's CI bundles the whole course into one file.
  // Fetching it as 123 separate files took over two minutes on a good
  // connection, which is not a first run anyone should have on mobile data.
  try {
    onProgress({ phase: 'manifest', done: 0, total: 1 });
    const bundle = await getContent(lang, 'pack.json');
    if (bundle && bundle.lessons) return applyBundle(lang, bundle, onProgress);
  } catch {
    // No pack.json yet — fall through and assemble it file by file.
  }
  return downloadPackFileByFile(lang, onProgress);
}

/** The bundled course: one request, then straight into local storage. */
function applyBundle(lang, bundle, onProgress) {
  const manifest = {
    version: bundle.version ?? null,
    features: bundle.features || null,
    emergency: bundle.emergency ? true : null,
    emergencyData: bundle.emergency || null,
    lessons: bundle.lessons,
    scenarios: bundle.scenarios,
  };
  const pack = {
    language: { ...lang, speech: bundle.speech || lang.speech || null },
    manifest,
    dict: bundle.dictionary || {},
    forms: bundle.forms || {},
    patterns: bundle.patterns || [],
    lessons: (bundle.lessons || []).map(asLesson),
    scenarios: (bundle.scenarios || []).map(asScenario),
    verbs: bundle.verbs || null,
    // A pack built before Momo had lines simply has none, and the app falls
    // back to its built-in English set rather than showing a mute bird.
    momo: (bundle.momo && bundle.momo.lines) || bundle.momo || [],
    fetchedAt: Date.now(),
  };
  applyPack(pack);
  const stored = cacheWrite(CK.pack(lang.code), pack);
  const total = pack.lessons.length + pack.scenarios.length;
  onProgress({ phase: 'done', done: total, total, stored });
  return { pack, stored };
}

async function downloadPackFileByFile(lang, onProgress = () => {}) {
  const base = rawBase(lang);
  onProgress({ phase: 'manifest', done: 0, total: 1 });
  const manifest = await getContent(lang, 'manifest.json');

  const dictFiles = manifest.dictionary || [];
  const patternFiles = manifest.patterns || [];
  const lessonEntries = manifest.lessons || [];
  const scenarioEntries = manifest.scenarios || [];
  const wantsVerbs = !!manifest.verbs;

  const total = dictFiles.length + patternFiles.length + lessonEntries.length +
    scenarioEntries.length + (wantsVerbs ? 1 : 0);
  let done = 0;
  const step = () => onProgress({ phase: 'content', done: ++done, total });

  // Fetch in batches — a phone on a Nicaraguan connection should not open 130
  // sockets at once, but one-at-a-time would take forever.
  async function batched(items, fn, size = 6) {
    const out = [];
    for (let i = 0; i < items.length; i += size) {
      const slice = items.slice(i, i + size);
      out.push(...await Promise.all(slice.map(fn)));
    }
    return out;
  }

  const dict = {};
  for (const f of dictFiles) {
    try {
      const part = await getContent(lang, f);
      Object.assign(dict, part);
    } catch {}
    step();
  }

  const patterns = [];
  for (const f of patternFiles) {
    try {
      const part = await getContent(lang, f);
      patterns.push(...(Array.isArray(part) ? part : [part]));
    } catch {}
    step();
  }

  const lessons = (await batched(lessonEntries, async (entry) => {
    try {
      const j = await getContent(lang, entry.path);
      return asLesson({ ...entry, ...j });
    } catch { return null; }
    finally { step(); }
  })).filter(Boolean);

  const scenarios = (await batched(scenarioEntries, async (entry) => {
    try {
      const j = await getContent(lang, entry.path);
      return asScenario({ ...entry, ...j });
    } catch { return null; }
    finally { step(); }
  })).filter(Boolean);

  let verbs = null;
  if (wantsVerbs) {
    try { verbs = await getContent(lang, manifest.verbs); } catch {}
    step();
  }

  let momo = [];
  if (manifest.momo) {
    try {
      const doc = await getContent(lang, manifest.momo);
      momo = (doc && doc.lines) || doc || [];
    } catch {}
  }

  // No forms map on this path: it is built by the content repo's CI alongside
  // pack.json, and this branch only runs for content old enough not to have
  // one. Lookups fall back to exact matches, exactly as they used to.
  const pack = { language: lang, manifest, dict, forms: {}, patterns, lessons, scenarios, verbs, momo, fetchedAt: Date.now() };
  applyPack(pack);
  const stored = cacheWrite(CK.pack(lang.code), pack);
  onProgress({ phase: 'done', done: total, total, stored });
  return { pack, stored };
}

/**
 * Is there newer content on GitHub than what we have cached?
 * Compares the manifest's own version, so publishing a lesson never requires
 * touching the app.
 */
export async function checkForContentUpdate(lang) {
  const have = packVersion(lang.code);
  // A ~60 byte sidecar, so this can run on every launch without costing data.
  try {
    const v = await getContent(lang, 'version.json', 8000);
    const remote = v.version ?? null;
    return { available: remote !== null && remote !== have, have, remote };
  } catch { /* older content — fall back to the manifest */ }
  try {
    const manifest = await getContent(lang, 'manifest.json', 8000);
    const remote = manifest.version ?? null;
    return { available: remote !== null && remote !== have, have, remote };
  } catch {
    return { available: false, offline: true };
  }
}

export function lessonsByPhase() {
  const map = new Map();
  for (const l of content.lessons) {
    if (!map.has(l.phase)) map.set(l.phase, []);
    map.get(l.phase).push(l);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

export function scenariosByPhase() {
  const map = new Map();
  for (const s of content.scenarios) {
    if (!map.has(s.phase)) map.set(s.phase, []);
    map.get(s.phase).push(s);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

export function lookup(word) {
  return content.dict[word] || null;
}

/**
 * The dictionary entry a word on the page belongs to, or null.
 *
 * Spanish inflects hard, and the dictionary is keyed on lemmas. Matching only
 * exact keys meant "hablas", "pregunto" and "palabras" were dead on the page —
 * no meaning, no exposure, no colour — and worse, "cosa" and "cosas" were two
 * unrelated memories that decayed separately, so knowing one earned you
 * nothing for the other. Resolving through the forms map makes a word one
 * word, however it is spelt on the day.
 */
export function resolve(word) {
  if (!word) return null;
  if (content.dict[word]) return word;
  const lemma = content.forms[word];
  return lemma && content.dict[lemma] ? lemma : null;
}

export function cacheSize() {
  let bytes = 0;
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('fl:c:')) bytes += (localStorage.getItem(k) || '').length;
    }
  } catch {}
  return bytes;
}
