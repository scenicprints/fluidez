// The learning engine, ported from the original Flutter app.
//
// Every constant here matches lib/main.dart exactly, so a fluency score means
// the same thing before and after the move to the web. Pure logic — no DOM, no
// storage, no network — so it can be reasoned about and tested on its own.

// MEMORY
//
// A word's strength halves every HL hours, and the half-life stretches with
// the square root of how much evidence there is that you hold it.
//
// The original model counted one thing: exposures. Meeting a word in a story,
// tapping it because you did NOT know it, and pulling it out of your head cold
// in a drill all scored +1 and were indistinguishable. Getting it wrong scored
// nothing at all, so a word missed five times could still read "Locked in".
// The app was measuring how much text had gone past your eyes.
//
// Four events, weighed by what each is actually evidence of:
//
//   exposure  +1   you met it in a story or a warm-up. Familiarity.
//   recall    +3   you produced it from memory. This is the one that builds
//                  memory rather than merely refreshing it, and it is worth
//                  about three sightings.
//   miss      -2   you were asked and could not. Evidence against, and it has
//                  to cost more than a sighting is worth, or reading drowns it.
//   lookup    -1   you tapped it for the meaning, which is you telling the app
//                  you do not know it. Capped, because the word sheet is also
//                  how you hear a word said aloud, and curiosity must not be
//                  able to bury a word you genuinely know.
//
// And the ceiling: reading alone cannot lock a word in. With no recall behind
// it, strength tops out just below the "Locked in" band however often you have
// seen it. That makes the green on the Words screen mean "I have produced
// this", not "I have seen this go past".
const HALF_LIFE_HOURS = 24;
const RECALL_WORTH = 3;
const MISS_COST = 2;
const LOOKUP_COST = 1;
const LOOKUP_PENALTY_CAP = 3;
const READING_CEILING = 0.79;   // the top of the "Growing" band

/**
 * How much evidence there is that you hold this word.
 * Takes a vocabulary record: { exposures, lastSeen, hits, misses, lookups }.
 */
export function evidence(v = {}) {
  return Math.max(0,
    (v.exposures || 0)
    + RECALL_WORTH * (v.hits || 0)
    - MISS_COST * (v.misses || 0)
    - Math.min(v.lookups || 0, LOOKUP_PENALTY_CAP) * LOOKUP_COST);
}

export function memoryStrength(v = {}, nowMs = Date.now()) {
  const weight = evidence(v);
  if (!weight) return 0;
  const hours = (nowMs - (v.lastSeen || 0)) / 3600000;
  const halfLife = HALF_LIFE_HOURS * Math.sqrt(weight);
  let ceiling = Math.min(1, weight / 5);
  if (!(v.hits > 0)) ceiling = Math.min(ceiling, READING_CEILING);
  const m = Math.pow(2, -hours / halfLife) * ceiling;
  return Math.min(1, Math.max(0, m));
}

// The three bands the whole interface is coloured by.
export const BAND = {
  strong: { min: 0.8, label: 'Locked in', key: 'strong' },
  growing: { min: 0.5, label: 'Growing', key: 'growing' },
  fading: { min: 0.2, label: 'Fading', key: 'fading' },
  none: { min: 0, label: 'New', key: 'new' },
};

export function band(m) {
  if (m >= 0.8) return BAND.strong;
  if (m >= 0.5) return BAND.growing;
  if (m >= 0.2) return BAND.fading;
  return BAND.none;
}

// A word counts as "known" once it is at least faintly held (>= .2).
export const isKnown = (m) => m >= 0.2;

// ── TEXT ────────────────────────────────────────────────────
const PUNCT = /[¿¡.,;:!?"'()«»‘’“”\-]/g;
export const cleanWord = (w) => w.toLowerCase().replace(PUNCT, '');
/** The same word with its punctuation gone but its capitals intact. */
export const bareWord = (w) => String(w ?? '').replace(PUNCT, '');

/**
 * Which key in `dict` this written word is, exact spelling first and
 * lower-cased second.
 *
 * German capitalises every noun, so a lower-cased-only lookup misses all of
 * them — 217 of the 635 words in the Swiss course, including Mann, Frau and
 * Bahnhof. Worse, for the pairs where the capital IS the word it answered the
 * wrong one: der Morgen is the morning and morgen is tomorrow, der Weg is the
 * way and weg means gone.
 *
 * Trying the exact spelling first fixes both and changes nothing for a
 * dictionary written in lower case, as the Spanish one is: "Llego" misses
 * `Llego`, falls to `llego`, and lands exactly where it always did.
 */
export const dictKey = (dict, raw) => {
  if (!dict || !raw) return null;
  const bare = bareWord(raw);
  if (dict[bare]) return bare;
  const low = bare.toLowerCase();
  return dict[low] ? low : null;
};

// Any Unicode letter, not a hand-listed Spanish alphabet. The original class
// was [a-záéíóúüñ], which has no ä or ö — so every Luzerndütsch word carrying
// one shattered: "Märt" tokenized as "M" + "rt", "dänke" as "d" + "nke". The
// halves matched nothing in the dictionary, which cost Swiss German three
// quarters of its exposures, its word-tap lookups and part of its fluency
// score. \p{L} means the next language added never hits this.
// ¿¡ stay inside the word class so "¿Qué" survives as one token, exactly as
// before; cleanWord strips them afterwards.
const TOKEN = /([\p{L}¿¡]+|[^\p{L}¿¡]+)/gu;
const HAS_LETTER = /\p{L}/u;

export function tokenize(text) {
  const out = [];
  let m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(text)) !== null) {
    const raw = m[1];
    out.push({ raw, isWord: HAS_LETTER.test(raw), lower: raw.toLowerCase() });
  }
  return out;
}

// ── SEPARABLE VERBS ─────────────────────────────────────────
/**
 * Which tokens of a sentence are the two halves of one separable verb.
 *
 *     Ich steige in Zürich um.
 *
 * *steige* and *um* are one word, `umsteigen`, and they are four tokens apart.
 * A form-to-lemma map is a dictionary of single words and cannot join them —
 * so this joins them here, where the whole sentence is in hand.
 *
 * The rule is German's own bracket: **a stranded prefix sits at the end of its
 * clause.** So look at the last word of each clause, and if it is a prefix that
 * would build a real separable verb out of some earlier verb in the same
 * clause, the two belong together.
 *
 * That end-of-clause rule is what makes it safe. The naive version — any
 * prefix-looking word anywhere after a verb — gets "Ein Mann kommt an mir
 * vorbei" wrong, binding *kommt* to the preposition *an* when the verb is
 * vorbeikommen. Here the last word is *vorbei*, the *an* is left alone, and
 * the answer is right. "Ich stehe auf dem Perron" ends in *Perron*, so nothing
 * binds and *auf* stays a preposition; "Ich stehe auf" ends in *auf*, so it
 * does.
 *
 * Returns a Map of token index -> the separable lemma, covering both halves.
 */
export function separableBindings(tokens_, resolveFn, verbs) {
  const table = (verbs && verbs.verbs) || {};
  const out = new Map();
  if (!tokens_ || !tokens_.length) return out;

  const isSeparable = (lemma) => {
    const v = table[lemma];
    return !!(v && v.sep);
  };

  // Clauses, because the bracket closes at the end of the clause and not at
  // the end of the sentence: "Ich steige aus, und er bleibt sitzen."
  let start = 0;
  const clauses = [];
  tokens_.forEach((t, i) => {
    if (!t.isWord && /[,;:.!?]/.test(t.raw)) {
      if (i > start) clauses.push([start, i]);
      start = i + 1;
    }
  });
  if (start < tokens_.length) clauses.push([start, tokens_.length]);

  for (const [from, to] of clauses) {
    let last = -1;
    for (let i = to - 1; i >= from; i--) {
      if (tokens_[i].isWord) { last = i; break; }
    }
    if (last <= from) continue;
    const prefix = tokens_[last].lower;
    for (let i = from; i < last; i++) {
      if (!tokens_[i].isWord) continue;
      const lemma = resolveFn(tokens_[i].raw);
      if (!lemma) continue;
      const joined = prefix + lemma;
      if (!isSeparable(joined)) continue;
      out.set(i, joined);
      out.set(last, joined);
      break;                       // the finite verb is the first one that fits
    }
  }
  return out;
}

// ── PHASES ──────────────────────────────────────────────────
// The ladder a course climbs. These used to be hardcoded, which was fine while
// there was one language and wrong the moment there were two: "Markets, taxis,
// directions" is Nicaragua, and a course set in Switzerland climbs a different
// ladder in a different order. A pack declares its own; this is the fallback
// for content old enough not to.
const DEFAULT_PHASES = [
  ['Survival', 'Greetings, numbers, basic needs'],
  ['Getting Around', 'Markets, taxis, directions, transactions'],
  ['Connecting', 'Small talk, friends, talking about yourself'],
  ['Holding Your Own', 'Opinions, problems, plans, disagreements'],
  ['Close to the Heart', 'Your partner, family, affection, conflict'],
  ['Fitting In', 'Humor, fast speech, idioms, slang in the wild'],
  ['Sounding Local', 'Nuance, double meanings, abstract talk'],
  ['Native-Like', 'Wordplay, in-jokes, the long tail'],
];

let phases = DEFAULT_PHASES;

/**
 * Take the phase ladder from a language pack. Accepts either
 * `[["Landing","der/die/das…"], …]` or `[{name, desc}, …]`, because the pack
 * is JSON written by hand and both shapes are natural to write.
 *
 * Anything empty or malformed falls back rather than throwing: a course with a
 * broken phase list should still be readable, just with generic headings.
 */
export function setPhases(list) {
  if (!Array.isArray(list) || !list.length) { phases = DEFAULT_PHASES; return phases; }
  const clean = list
    .map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p?.name, p?.desc]))
    .filter((p) => typeof p[0] === 'string' && p[0]);
  phases = clean.length ? clean.map((p) => [p[0], p[1] || '']) : DEFAULT_PHASES;
  return phases;
}

export const phaseName = (p) => (phases[p] ? phases[p][0] : `Phase ${p}`);
export const phaseDesc = (p) => (phases[p] ? phases[p][1] : '');

// ── CONJUGATION ─────────────────────────────────────────────
// Driven entirely by the language's verbs.json, so a language without one
// simply has no verb trainer rather than a broken Spanish one.
export function conjugate(verbs, verb, tense, subjectIndex) {
  const irr = verbs.irregular && verbs.irregular[verb];
  if (irr && irr[tense]) return irr[tense][subjectIndex];

  const kind = verb.endsWith('ar') ? 'ar' : verb.endsWith('er') ? 'er' : 'ir';
  const table = verbs.regular[kind];
  if (!table || !table[tense]) return verb;
  const ending = table[tense][subjectIndex];

  // Future tense builds on the whole infinitive, not the stem.
  if (tense === 'future') return verb + ending.slice(kind.length);
  return verb.slice(0, -2) + ending;
}

// ── PRINCIPAL PARTS ─────────────────────────────────────────
// A second shape of verb drill, for languages a conjugation table cannot hold.
//
// German is the case it was built for. Three of its five useful tenses are not
// conjugations at all — Perfekt is an auxiliary plus a participle, Futur and
// Konjunktiv II are an auxiliary plus an infinitive — and in a real clause the
// two halves sit apart with everything else between them. A card offering four
// single-word buttons cannot show that without lying about word order, and
// word order is the thing that matters. Präteritum fits on a button but Swiss
// speakers write it and do not say it. What is left is the present, where the
// endings arrive free from reading and only the strong-verb stem changes are
// hard.
//
// So the drill asks for the principal parts instead: sprechen, spricht,
// sprach, hat gesprochen. Every one of those is STATED in verbs.json. Nothing
// here derives a form, because ablaut has no rule and a plausible guess
// (er sprecht) is exactly the mistake the learner already makes — teaching it
// back to them is worse than having no trainer. conjugate() is never called on
// this path, so the regular-table fallback that once produced "cerro" cannot
// happen by construction.
export const PART_MODES = [
  'present3', 'present2', 'past', 'perfect',
  'aux', 'infinitive', 'imperative', 'separable',
];

// Which stated field each mode asks for. A mode whose field is missing on a
// verb is skipped rather than guessed.
const PART_SLOT = {
  present3: (v) => v.pres3,
  present2: (v) => v.pres2,
  past: (v) => v.past3,
  perfect: (v) => (v.aux && v.pp ? `${v.aux} ${v.pp}` : null),
  imperative: (v) => v.imp,
};

// These two build DISTRACTORS and nothing else. The right answer is always the
// stated pres3, so a prefix rule being wrong costs a bad wrong-option and can
// never teach a bad right one.
const joinPrefix = (pre, separated) => {
  const parts = String(separated).split(' ');
  return parts.length === 2 && parts[1] === pre ? pre + parts[0] : null;
};
const splitPrefix = (pre, joined) =>
  String(joined).startsWith(pre) && joined.length > pre.length
    ? `${joined.slice(pre.length)} ${pre}`
    : null;

function buildPart(mode, names, table) {
  const name = pick(names);
  const v = table[name];
  if (!v) return null;
  const en = v.en || '';

  // haben or sein. Two options, because there are two answers in the language.
  if (mode === 'aux') {
    if (!v.pp || !v.aux) return null;
    return { mode, verb: name, en, prompt: v.pp, correct: v.aux, options: ['hat', 'ist'] };
  }

  // The reading direction: you met sprach on the page, which verb was that?
  // The English gloss is withheld by the renderer here or it gives the answer.
  if (mode === 'infinitive') {
    const shown = [v.pres3, v.past3, v.pp].filter(Boolean);
    const wrongs = shuffle(names.filter((n) => n !== name)).slice(0, 3);
    if (!shown.length || wrongs.length < 3) return null;
    return { mode, verb: name, en, prompt: pick(shown), correct: name, options: shuffle([name, ...wrongs]) };
  }

  // Does the prefix come off? um- does in umsteigen and does not in umarmen,
  // so it is a fact per verb and no prefix list settles it. Asked of any verb
  // that HAS a prefix, separable or not, or the mode would always have the
  // same answer and could be played without reading it.
  if (mode === 'separable') {
    if (!v.pre || !v.pres3) return null;
    const right = v.pres3;
    const other = v.sep ? joinPrefix(v.pre, right) : splitPrefix(v.pre, right);
    if (!other || other === right) return null;
    return {
      mode, verb: name, en, prompt: name,
      correct: `er ${right}`, options: shuffle([`er ${right}`, `er ${other}`]),
    };
  }

  const slot = PART_SLOT[mode];
  const correct = slot && slot(v);
  if (!correct) return null;
  // Distractors are the SAME slot from other verbs, so every option is shaped
  // like a real answer and the odd one out cannot be spotted without knowing.
  const seen = new Set([correct]);
  const wrongs = [];
  for (const other of shuffle(names)) {
    if (wrongs.length >= 3) break;
    const alt = slot(table[other]);
    if (alt && !seen.has(alt)) { seen.add(alt); wrongs.push(alt); }
  }
  if (wrongs.length < 3) return null;
  return { mode, verb: name, en, prompt: name, correct, options: shuffle([correct, ...wrongs]) };
}

/**
 * Draw `count` principal-parts items from a `kind: "principal-parts"` file.
 * Returns [] when there is nothing drillable, so a course can ship the file
 * before it ships the verbs and the tile says so instead of breaking.
 */
export function verbPartItems(verbs, count = 10, modes = null) {
  const table = (verbs && verbs.verbs) || {};
  const listed = verbs && Array.isArray(verbs.drill) && verbs.drill.length
    ? verbs.drill : Object.keys(table);
  const names = listed.filter((n) => table[n]);
  if (!names.length) return [];

  const kinds = (modes && modes.length) ? modes : PART_MODES;
  const out = [];
  for (let i = 0; out.length < count && i < count * 8; i++) {
    const item = buildPart(kinds[i % kinds.length], names, table);
    if (item) out.push(item);
  }
  return out;
}

// ── FLUENCY ─────────────────────────────────────────────────
const LEVELS = [
  [0.85, 'B1', 'Intermediate — can handle daily life'],
  [0.65, 'A2+', 'Strong beginner — surviving independently'],
  [0.45, 'A2', 'Basic — can handle simple situations'],
  [0.25, 'A1+', 'Building — recognizing patterns'],
  [0.1, 'A1', 'Starter — learning core words'],
];

// The same ladder, ascending, so two people's levels can be ranked against
// each other. A0 is the implicit floor below the first threshold, and anything
// unrecognised sorts there too rather than throwing.
export const LEVEL_ORDER = ['A0', 'A1', 'A1+', 'A2', 'A2+', 'B1'];
export const levelRank = (name) => Math.max(0, LEVEL_ORDER.indexOf(name));

export function calcFluency(vocab, progress, unlockedPatterns, totals) {
  const now = Date.now();
  let known = 0;
  let strong = 0;
  for (const key of Object.keys(vocab)) {
    const v = vocab[key];
    const m = memoryStrength(v, now);
    if (m >= 0.2) known++;
    if (m >= 0.8) strong++;
  }

  const practiceTotal = progress.practiceTotal || 0;
  const storiesRead = (progress.storiesRead || []).length;

  const vocabScore = Math.min(1, known / 300);
  const practiceAcc = practiceTotal > 0 ? (progress.practiceScore || 0) / practiceTotal : 0;
  const storyScore = totals.lessons ? Math.min(1, storiesRead / totals.lessons) : 0;
  const patternScore = totals.patterns ? Math.min(1, unlockedPatterns.length / totals.patterns) : 0;
  const verbScore = Math.min(1, (progress.verbsCorrect || 0) / 50);

  const overall =
    vocabScore * 0.35 +
    practiceAcc * 0.2 +
    storyScore * 0.15 +
    patternScore * 0.15 +
    verbScore * 0.15;

  let level = 'A0';
  let levelDesc = 'Absolute beginner';
  for (const [threshold, name, desc] of LEVELS) {
    if (overall >= threshold) {
      level = name;
      levelDesc = desc;
      break;
    }
  }

  const milestones = [];
  const ms = (cond, title, detail) => { if (cond) milestones.push({ title, detail }); };
  ms(known >= 10, 'First 10 words', 'You know 10 Spanish words');
  ms(known >= 50, '50 words', 'You cover about 30% of basic conversation');
  ms(known >= 100, '100 words', 'You can handle simple situations');
  ms(known >= 200, '200 words', 'You understand most everyday speech');
  ms(known >= 300, '300 words', 'You can survive independently');
  ms(strong >= 50, '50 words locked in', "These aren't going anywhere");
  ms(storiesRead >= 6, 'Phase 0 complete', 'All the beginner lessons read');
  ms(totals.lessons > 0 && storiesRead >= totals.lessons, 'Every lesson read', 'You finished the course');
  ms(unlockedPatterns.length >= 3, 'Pattern spotter', '3 grammar patterns found');
  ms((progress.verbsCorrect || 0) >= 20, 'Verb master', '20 conjugations nailed');

  const next = [];
  for (const target of [50, 100, 200, 300]) {
    if (known < target) {
      next.push({ title: `${target} words`, detail: `${target - known} to go`, pct: known / target });
      break;
    }
  }

  return {
    overall: Math.round(overall * 100),
    level, levelDesc,
    known, strong,
    vocabScore, practiceAcc, storyScore, patternScore, verbScore,
    milestones, next,
  };
}

// SCHEDULING
//
// The decay curve already knew exactly when a word would slip. Nothing ever
// asked it. The app estimated strength continuously, sorted the Review screen
// weakest-first, and then waited for you to go looking - so the model was a
// dashboard rather than a teacher, and a word could rot for a month as long as
// you never opened the right screen.
//
// This turns the curve into a date. Solve the decay for the moment strength
// falls to REVIEW_AT and that is when the word is due:
//
//     strength(h) = 2^(-h/halfLife) * ceiling = REVIEW_AT
//     h = halfLife * log2(ceiling / REVIEW_AT)
//
// REVIEW_AT is the bottom of "Growing", so a word is caught on its way down
// rather than after it has already faded. A word whose ceiling is at or below
// that line can never be above it - one sighting caps at 0.2 - so it is due
// the moment it is met, which is correct: seeing a word once is not knowing it.
const REVIEW_AT = 0.5;

/** When this word next needs pulling out of your head. */
export function dueAt(v = {}) {
  const weight = evidence(v);
  const seen = v.lastSeen || 0;
  if (!weight) return seen;
  let ceiling = Math.min(1, weight / 5);
  if (!(v.hits > 0)) ceiling = Math.min(ceiling, READING_CEILING);
  if (ceiling <= REVIEW_AT) return seen;
  const halfLife = HALF_LIFE_HOURS * Math.sqrt(weight);
  return seen + halfLife * Math.log2(ceiling / REVIEW_AT) * 3600000;
}

/** Everything owed right now, most overdue first. */
export function dueWords(vocab, dict, nowMs = Date.now(), limit = 40) {
  return Object.keys(vocab)
    .filter((w) => dict[w] && (vocab[w].exposures || 0) >= 1)
    .map((w) => ({ word: w, due: dueAt(vocab[w]), m: memoryStrength(vocab[w], nowMs) }))
    .filter((x) => x.due <= nowMs)
    .sort((a, b) => a.due - b.due)
    .slice(0, limit);
}

/** How many words are owed, for the number on the Today screen. */
export function dueCount(vocab, dict, nowMs = Date.now()) {
  let n = 0;
  for (const w of Object.keys(vocab)) {
    if (!dict[w] || !(vocab[w].exposures || 0)) continue;
    if (dueAt(vocab[w]) <= nowMs) n++;
  }
  return n;
}

// ── REVIEW QUEUE ────────────────────────────────────────────
// The decay model already knows exactly what is slipping; this surfaces it.
// Weakest first, but only words actually met at least once.
export function fadingWords(vocab, dict, limit = 30) {
  const now = Date.now();
  return Object.keys(vocab)
    .filter((w) => dict[w] && (vocab[w].exposures || 0) >= 1)
    .map((w) => ({ word: w, m: memoryStrength(vocab[w], now) }))
    .sort((a, b) => a.m - b.m)
    .slice(0, limit);
}

// A leech is a word you keep getting wrong despite plenty of exposure —
// repetition clearly isn't working, so it deserves different treatment.
export function leeches(vocab, minMisses = 4) {
  return Object.keys(vocab)
    .map((w) => ({ word: w, misses: vocab[w].misses || 0, hits: vocab[w].hits || 0 }))
    .filter((x) => x.misses >= minMisses && x.misses > x.hits)
    .sort((a, b) => b.misses - a.misses);
}

// ── EXERCISE GENERATION ─────────────────────────────────────
const SKIP_POS = ['prep', 'art', 'conj', 'contr', 'pron'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
export { shuffle, pick };

const firstSense = (en) => String(en).split('/')[0].trim();

export function generateExercises(vocab, dict, lessons, count = 12, modes = null, queue = null) {
  const distractorPool = Object.keys(dict).filter((k) => !SKIP_POS.includes(dict[k].pos));
  // The scheduler's queue when there is one, weakest-first as the fallback for
  // a learner with nothing due yet.
  const review = (queue && queue.length) ? queue : fadingWords(vocab, dict, 30);
  const sentences = lessons.flatMap((l) => l.sentences || []);

  // Which exercise kinds this language can actually support.
  const kinds = modes || ['es_en', 'en_es', 'gap', 'type_es'];
  const out = [];

  const wrongMeanings = (target, n = 3) =>
    shuffle(distractorPool.filter((k) => k !== target)).slice(0, n).map((k) => firstSense(dict[k].en));
  const wrongWords = (target, n = 3) =>
    shuffle(distractorPool.filter((k) => k !== target)).slice(0, n);

  for (let i = 0; out.length < count && i < count * 4; i++) {
    const kind = kinds[i % kinds.length];

    if (kind === 'es_en' && review.length) {
      const word = review[i % review.length].word;
      const correct = firstSense(dict[word].en);
      out.push({ kind, word, correct, options: shuffle([correct, ...wrongMeanings(word)]) });

    } else if (kind === 'en_es' && review.length) {
      const word = review[(i + 3) % review.length].word;
      const english = firstSense(dict[word].en);
      out.push({ kind, english, correct: word, options: shuffle([word, ...wrongWords(word)]) });

    } else if (kind === 'gap' && sentences.length) {
      const sn = pick(sentences);
      const toks = tokenize(sn.es);
      // dictKey, not dict[t.lower]: a lower-cased lookup finds no German noun
      // at all, so every gap item in the Swiss course would have been built
      // out of the function words.
      const candidates = toks
        .map((t, at) => ({ ...t, at, key: dictKey(dict, t.raw) }))
        .filter((t) => t.isWord && t.key);
      if (candidates.length < 2) continue;
      const target = pick(candidates);
      // Blank the token that was actually chosen, by position.
      //
      // This used to be sn.es.replace(target.raw, ...), which replaces the
      // first SUBSTRING match anywhere in the sentence — so picking "que"
      // gutted the "que" inside "querés", and picking "y" hollowed out
      // "Hay". 310 of 6304 possible items on the Nicaraguan course came out
      // mangled that way. tokenize() covers the whole string with no gaps,
      // so joining the tokens back rebuilds the sentence exactly.
      out.push({
        kind,
        sentence: toks.map((t, at) => (at === target.at ? ' ______ ' : t.raw)).join(''),
        translation: sn.en,
        correct: target.key,
        options: shuffle([target.key, ...wrongWords(target.key)]),
      });

    } else if (kind === 'type_es' && sentences.length) {
      // Free text, graded against the sentence you actually read — no AI needed.
      const sn = pick(sentences);
      out.push({ kind, english: sn.en, correct: sn.es });

    } else if (kind === 'dictation' && sentences.length) {
      const sn = pick(sentences);
      out.push({ kind, correct: sn.es, translation: sn.en });
    }
  }

  // No fallback item. This used to return a hardcoded Spanish sentence when it
  // could build nothing from the course, which in any other language is the
  // app teaching the wrong one. An empty list is the honest answer and the
  // caller says so.
  return out;
}

// ── ANSWER GRADING ──────────────────────────────────────────
// Typed answers are compared forgivingly: case, punctuation and accents are
// not what is being tested here, word choice and order are.
const stripAccents = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function normalizeAnswer(s) {
  return stripAccents(String(s).toLowerCase())
    .replace(PUNCT, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function gradeTyped(given, expected) {
  const a = normalizeAnswer(given);
  const b = normalizeAnswer(expected);
  if (a === b) return { correct: true, exact: true };
  // Right words, wrong accents/punctuation only — still correct, worth a nudge.
  if (a.split(' ').sort().join(' ') === b.split(' ').sort().join(' ')) {
    return { correct: false, exact: false, hint: 'Right words, wrong order' };
  }
  return { correct: false, exact: false };
}

// ── WORD ORDER ──────────────────────────────────────────────
// Only short, quote-free sentences from lessons already read, matching the
// original trainer's rule.
export function orderCandidates(lessons, readIds) {
  const source = lessons.filter((l) => readIds.includes(l.id));
  const pool = [];
  for (const lesson of (source.length ? source : lessons)) {
    for (const sn of lesson.sentences || []) {
      const words = sn.es.split(/\s+/).filter(Boolean);
      if (words.length >= 3 && words.length <= 7 && !/["“”]/.test(sn.es)) {
        pool.push({ ...sn, lessonId: lesson.id, lessonTitle: lesson.title, words });
      }
    }
  }
  return pool;
}

export function scramble(words) {
  if (words.length < 2) return words.slice();
  let s = shuffle(words);
  if (s.join(' ') === words.join(' ')) s = s.slice().reverse();
  return s;
}
