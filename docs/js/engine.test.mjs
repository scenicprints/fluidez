// Checks the JS engine against values computed by hand from the original
// Dart, so a fluency score means the same thing after the move.
//
//   node docs/js/engine.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  memoryStrength, evidence, dueAt, dueWords, dueCount, band, tokenize, cleanWord, conjugate, calcFluency,
  fadingWords, leeches, gradeTyped, normalizeAnswer, orderCandidates,
  scramble, generateExercises, phaseName, phaseDesc, setPhases,
  verbPartItems, PART_MODES, dictKey, bareWord, separableBindings,
} from './engine.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
};

const HOUR = 3600000;
const NOW = 1_700_000_000_000;

// ── decay ───────────────────────────────────────────────────
test('unseen words have no strength', () => {
  assert.equal(memoryStrength({}, NOW), 0);
  assert.equal(memoryStrength({ exposures: 0, lastSeen: NOW }, NOW), 0);
});

test('one sighting is barely anything', () => {
  // min(1, 1/5) = 0.2, times 2^0 = 1
  assert.equal(memoryStrength({ exposures: 1, lastSeen: NOW }, NOW).toFixed(4), '0.2000');
});

test('one sighting halves after exactly one half-life (24h)', () => {
  assert.equal(memoryStrength({ exposures: 1, lastSeen: NOW - 24 * HOUR }, NOW).toFixed(4), '0.1000');
});

test('the half-life stretches with sqrt(evidence)', () => {
  // Evidence 4 -> half-life 48h. After 48h: min(1,4/5)=0.8, halved = 0.4.
  // One sighting plus one recall is evidence 4, and having a recall behind it
  // is also what lets the ceiling reach 0.8 in the first place.
  assert.equal(memoryStrength({ exposures: 1, hits: 1, lastSeen: NOW - 48 * HOUR }, NOW).toFixed(4), '0.4000');
  // Read four times and never recalled, the same word is held under the
  // "Locked in" line, so it decays from 0.79 instead.
  assert.equal(memoryStrength({ exposures: 4, lastSeen: NOW - 48 * HOUR }, NOW).toFixed(4), '0.3950');
});

test('reading alone can never lock a word in', () => {
  // This is the whole point of separating the two. However much text has gone
  // past your eyes, without one recall it stops at the top of "Growing".
  for (const n of [5, 20, 500]) {
    const m = memoryStrength({ exposures: n, lastSeen: NOW }, NOW);
    assert.ok(m < 0.8, `${n} sightings reached ${m}`);
    assert.equal(band(m).key, 'growing');
  }
});

test('one recall is what locks it in', () => {
  const read = memoryStrength({ exposures: 5, lastSeen: NOW }, NOW);
  const recalled = memoryStrength({ exposures: 5, hits: 1, lastSeen: NOW }, NOW);
  assert.ok(recalled > read);
  assert.equal(band(recalled).key, 'strong');
});

test('a recall is worth three sightings, and then some', () => {
  // The weight itself: one recall carries as much as three sightings.
  assert.equal(evidence({ exposures: 0, hits: 1 }), 3);
  assert.equal(evidence({ exposures: 3 }), 3);
  assert.equal(evidence({ exposures: 6, hits: 1 }), evidence({ exposures: 9 }));

  // Equal weight means an equal half-life — but the recalled word is also the
  // only one of the two allowed past the "Locked in" line, so it ends higher.
  // That gap is the testing effect, and it is meant to be there.
  const read = memoryStrength({ exposures: 9, lastSeen: NOW - 100 * HOUR }, NOW);
  const recalled = memoryStrength({ exposures: 6, hits: 1, lastSeen: NOW - 100 * HOUR }, NOW);
  assert.ok(recalled > read, `${recalled} should beat ${read} on equal weight`);
});

test('a miss costs more than a sighting is worth', () => {
  // Otherwise reading drowns out being wrong, which is how a word missed five
  // times could still read "Locked in".
  assert.equal(evidence({ exposures: 10, misses: 1 }), 8);
  assert.ok(evidence({ exposures: 10, misses: 5 }) < evidence({ exposures: 10 }));
  assert.equal(evidence({ exposures: 2, misses: 9 }), 0);
});

test('being wrong never refreshes the clock', () => {
  // A miss must not be able to RAISE strength by making an old word look
  // recently met. Same lastSeen, more misses, strictly weaker.
  const seen = NOW - 200 * HOUR;
  const clean = memoryStrength({ exposures: 12, lastSeen: seen }, NOW);
  const missed = memoryStrength({ exposures: 12, misses: 3, lastSeen: seen }, NOW);
  assert.ok(missed < clean, `${missed} should be below ${clean}`);
});

test('looking a word up counts against you, but only so far', () => {
  const known = { exposures: 12, hits: 2, lastSeen: NOW };
  const tapped = { ...known, lookups: 1 };
  assert.ok(memoryStrength(tapped, NOW) <= memoryStrength(known, NOW));
  assert.ok(evidence(tapped) < evidence(known));
  // The word sheet is also how you hear a word said aloud, so curiosity is
  // capped: past three taps it costs nothing more.
  assert.equal(evidence({ ...known, lookups: 3 }), evidence({ ...known, lookups: 40 }));
});

test('strength stays inside 0..1 and decays to nothing', () => {
  const ancient = memoryStrength({ exposures: 9, lastSeen: NOW - 10000 * HOUR }, NOW);
  assert.ok(ancient >= 0 && ancient < 1e-9, `expected ~0, got ${ancient}`);
  assert.ok(band(ancient).key === 'new');
  assert.ok(memoryStrength({ exposures: 50, hits: 20, lastSeen: NOW }, NOW) <= 1);
});

// ── bands ───────────────────────────────────────────────────
test('band boundaries sit exactly where the Dart put them', () => {
  assert.equal(band(0.8).key, 'strong');
  assert.equal(band(0.79).key, 'growing');
  assert.equal(band(0.5).key, 'growing');
  assert.equal(band(0.49).key, 'fading');
  assert.equal(band(0.2).key, 'fading');
  assert.equal(band(0.19).key, 'new');
});

// ── text ────────────────────────────────────────────────────
test('cleanWord strips Spanish punctuation but keeps accents', () => {
  assert.equal(cleanWord('¿Cómo?'), 'cómo');
  assert.equal(cleanWord('"Ideay!"'), 'ideay');
});

test('tokenize keeps punctuation as its own non-word token', () => {
  const t = tokenize('Hola, vos');
  assert.deepEqual(t.map((x) => x.raw), ['Hola', ', ', 'vos']);
  assert.deepEqual(t.map((x) => x.isWord), [true, false, true]);
});

test('tokenize keeps non-Spanish letters whole', () => {
  // A Spanish-only character class split these mid-word and cost Luzerndütsch
  // most of its vocabulary tracking.
  assert.deepEqual(tokenize('Märt').map((x) => x.raw), ['Märt']);
  assert.deepEqual(tokenize('dänke schöö').map((x) => x.raw), ['dänke', ' ', 'schöö']);
  assert.equal(cleanWord('Gmües'), 'gmües');
});

test('tokenize is reentrant — a global regex must not carry lastIndex', () => {
  assert.equal(tokenize('uno dos').length, tokenize('uno dos').length);
});

// ── conjugation ─────────────────────────────────────────────
const verbs = JSON.parse(readFileSync(new URL('../../build/verbs.json', import.meta.url)));

test('verbs.json carries the voseo forms', () => {
  assert.equal(verbs.subjects[1], 'vos');
  assert.equal(verbs.irregular.poder.present[1], 'podés');
});

test('irregular verbs come straight from the table', () => {
  assert.equal(conjugate(verbs, 'ser', 'present', 1), 'sos');
  assert.equal(conjugate(verbs, 'tener', 'present', 1), 'tenés');
  assert.equal(conjugate(verbs, 'ir', 'past', 0), 'fui');
});

test('regular verbs take the voseo ending on the stem', () => {
  assert.equal(conjugate(verbs, 'hablar', 'present', 1), 'hablás');
  assert.equal(conjugate(verbs, 'comer', 'present', 1), 'comés');
  assert.equal(conjugate(verbs, 'vivir', 'present', 1), 'vivís');
});

test('future tense builds on the infinitive, not the stem', () => {
  assert.equal(conjugate(verbs, 'hablar', 'future', 0), 'hablaré');
  assert.equal(conjugate(verbs, 'comer', 'future', 4), 'comerán');
  assert.equal(conjugate(verbs, 'vivir', 'future', 1), 'vivirás');
});

test('every drillable verb conjugates in every tense without blowing up', () => {
  for (const v of verbs.drill) {
    for (const t of verbs.tenses) {
      for (let s = 0; s < verbs.subjects.length; s++) {
        const form = conjugate(verbs, v, t, s);
        assert.ok(form && typeof form === 'string' && form.length > 1, `${v}/${t}/${s} -> ${form}`);
      }
    }
  }
});

// ── fluency ─────────────────────────────────────────────────
const totals = { lessons: 81, patterns: 9 };

test('a blank slate is A0 at 0%', () => {
  const f = calcFluency({}, {}, [], totals);
  assert.equal(f.overall, 0);
  assert.equal(f.level, 'A0');
  assert.equal(f.known, 0);
});

test('the five components are weighted .35/.2/.15/.15/.15', () => {
  // 300 known words alone = vocabScore 1 = 35%
  const vocab = {};
  for (let i = 0; i < 300; i++) vocab['w' + i] = { exposures: 5, lastSeen: Date.now() };
  const f = calcFluency(vocab, {}, [], totals);
  assert.equal(f.vocabScore, 1);
  assert.equal(f.overall, 35);
});

test('a perfect score on everything is 100% and B1', () => {
  const vocab = {};
  for (let i = 0; i < 300; i++) vocab['w' + i] = { exposures: 5, lastSeen: Date.now() };
  const f = calcFluency(
    vocab,
    { practiceScore: 10, practiceTotal: 10, storiesRead: Array.from({ length: 81 }, (_, i) => 's' + i), verbsCorrect: 50 },
    Array.from({ length: 9 }, (_, i) => 'p' + i),
    totals,
  );
  assert.equal(f.overall, 100);
  assert.equal(f.level, 'B1');
});

test('milestones fire on the thresholds they claim', () => {
  const vocab = {};
  for (let i = 0; i < 50; i++) vocab['w' + i] = { exposures: 5, hits: 1, lastSeen: Date.now() };
  const f = calcFluency(vocab, {}, [], totals);
  const titles = f.milestones.map((m) => m.title);
  assert.ok(titles.includes('First 10 words'));
  assert.ok(titles.includes('50 words'));
  assert.ok(!titles.includes('100 words'));
  assert.equal(f.next[0].title, '100 words');
});

test('faded words stop counting as known', () => {
  const old = Date.now() - 5000 * HOUR;
  const vocab = { uno: { exposures: 1, lastSeen: old } };
  assert.equal(calcFluency(vocab, {}, [], totals).known, 0);
});

test('a word met once is due immediately', () => {
  // One sighting caps strength at 0.2, which is below the review line, so it
  // can never be above it. Seeing a word once is not knowing it.
  assert.equal(dueAt({ exposures: 1, lastSeen: NOW }), NOW);
});

test('a well-held word is not due for days', () => {
  const strong = { exposures: 4, hits: 3, lastSeen: NOW };
  const hours = (dueAt(strong) - NOW) / HOUR;
  assert.ok(hours > 48, `expected days, got ${hours.toFixed(1)}h`);
});

test('recalling a word pushes its due date out', () => {
  const read = { exposures: 8, lastSeen: NOW };
  const recalled = { exposures: 5, hits: 1, lastSeen: NOW };
  assert.ok(dueAt(recalled) > dueAt(read), 'a recall must buy more time than a sighting');
});

test('missing a word brings it forward', () => {
  const clean = { exposures: 6, hits: 2, lastSeen: NOW };
  const missed = { ...clean, misses: 2 };
  assert.ok(dueAt(missed) < dueAt(clean));
});

test('the queue is most overdue first, and only what is actually owed', () => {
  const d = { uno: { en: 'one' }, dos: { en: 'two' }, tres: { en: 'three' } };
  const v = {
    uno: { exposures: 1, lastSeen: NOW - 100 * HOUR },        // long overdue
    dos: { exposures: 1, lastSeen: NOW - 2 * HOUR },           // overdue
    tres: { exposures: 4, hits: 4, lastSeen: NOW },            // held, not due
  };
  assert.deepEqual(dueWords(v, d, NOW).map((x) => x.word), ['uno', 'dos']);
  assert.equal(dueCount(v, d, NOW), 2);
});

test('a word never met is not in the queue', () => {
  const d = { uno: { en: 'one' } };
  assert.deepEqual(dueWords({ uno: { exposures: 0, lastSeen: 0 } }, d, NOW), []);
});

// ── review queues ───────────────────────────────────────────
const dict = { uno: { en: 'one', pos: 'num' }, dos: { en: 'two', pos: 'num' }, tres: { en: 'three', pos: 'num' } };

test('fading words come back weakest first', () => {
  const now = Date.now();
  const vocab = {
    uno: { exposures: 5, lastSeen: now },
    dos: { exposures: 1, lastSeen: now - 20 * HOUR },
    tres: { exposures: 3, lastSeen: now - 2 * HOUR },
  };
  assert.deepEqual(fadingWords(vocab, dict).map((x) => x.word), ['dos', 'tres', 'uno']);
});

test('words never met are not review candidates', () => {
  assert.deepEqual(fadingWords({ uno: { exposures: 0, lastSeen: 0 } }, dict), []);
});

test('leeches are the ones missed more than hit', () => {
  const vocab = {
    uno: { misses: 6, hits: 1 },
    dos: { misses: 5, hits: 9 },   // plenty of misses but mostly right
    tres: { misses: 1, hits: 0 },  // not enough misses yet
  };
  assert.deepEqual(leeches(vocab).map((x) => x.word), ['uno']);
});

// ── grading ─────────────────────────────────────────────────
test('typed answers forgive case, accents and punctuation', () => {
  assert.ok(gradeTyped('como estas', '¿Cómo estás?').correct);
  assert.ok(gradeTyped('  ¿CÓMO ESTÁS?  ', '¿cómo estás?').correct);
});

test('the right words in the wrong order is not correct, but says so', () => {
  const r = gradeTyped('calle la En hay una fritanga', 'En la calle hay una fritanga.');
  assert.equal(r.correct, false);
  assert.equal(r.hint, 'Right words, wrong order');
});

test('a genuinely wrong answer gets no hint', () => {
  assert.deepEqual(gradeTyped('necesito un taxi', 'quiero comida'), { correct: false, exact: false });
});

test('normalizeAnswer collapses whitespace', () => {
  assert.equal(normalizeAnswer('  hola   vos  '), 'hola vos');
});

// ── word order ──────────────────────────────────────────────
const lessons = [{
  id: 's01', title: 'La fritanga', phase: 0,
  sentences: [
    { es: 'En la calle hay una fritanga.', en: "On the street there's a fritanga." },
    { es: 'Un día, un hombre me habla. "Vos no sos de aquí."', en: 'Long one with quotes.' },
    { es: 'Hola.', en: 'Hi.' },
  ],
}];

test('word order only takes short, quote-free sentences', () => {
  const c = orderCandidates(lessons, ['s01']);
  assert.equal(c.length, 1);
  assert.equal(c[0].words.length, 6);
});

test('word order falls back to all lessons when nothing is read yet', () => {
  assert.equal(orderCandidates(lessons, []).length, 1);
});

test('scramble never returns the sentence already in order', () => {
  const words = ['En', 'la', 'calle'];
  for (let i = 0; i < 50; i++) {
    assert.notEqual(scramble(words).join(' '), words.join(' '));
  }
});

// ── exercises ───────────────────────────────────────────────
test('exercise generation always yields something usable', () => {
  const vocab = { uno: { exposures: 2, lastSeen: Date.now() }, dos: { exposures: 1, lastSeen: Date.now() } };
  const ex = generateExercises(vocab, dict, lessons, 8);
  assert.ok(ex.length > 0);
  for (const e of ex) assert.ok(e.kind && e.correct !== undefined);
});

test('multiple-choice exercises always include the right answer', () => {
  const vocab = {};
  for (const w of Object.keys(dict)) vocab[w] = { exposures: 2, lastSeen: Date.now() };
  for (const e of generateExercises(vocab, dict, lessons, 20)) {
    if (e.options) assert.ok(e.options.includes(e.correct), `${e.kind} lost its answer`);
  }
});

test('a gap blank replaces the whole token, never a substring of another word', () => {
  // "que" lives inside "querés", and "y" inside "Hay". The old code blanked the
  // first substring match, so the wrong word was gutted: "¿Qué __ rés comer?".
  const d = { que: { en: 'that', pos: 'conj' }, comer: { en: 'to eat', pos: 'verb' },
              hay: { en: 'there is', pos: 'verb' }, y: { en: 'and', pos: 'conj' },
              gente: { en: 'people', pos: 'noun' }, ruido: { en: 'noise', pos: 'noun' } };
  const ls = [{ id: 'g1', title: 'G', phase: 0, sentences: [
    { es: '¿Qué querés comer que hay?', en: 'What is there that you want to eat?' },
    { es: 'Hay gente y ruido.', en: 'There are people and noise.' },
  ] }];
  const v = {}; for (const w of Object.keys(d)) v[w] = { exposures: 2, lastSeen: Date.now() };
  const BLANK = ' ______ ';
  for (let i = 0; i < 200; i++) {
    for (const e of generateExercises(v, d, ls, 6, ['gap'])) {
      const at = e.sentence.indexOf(BLANK);
      assert.ok(at !== -1, `gap item lost its blank: ${e.sentence}`);
      const before = e.sentence.slice(0, at);
      const after = e.sentence.slice(at + BLANK.length);
      // A blank standing where a whole word stood never touches a letter.
      assert.ok(!/\p{L}$/u.test(before), `blank cut into a word: ${e.sentence}`);
      assert.ok(!/^\p{L}/u.test(after), `blank cut into a word: ${e.sentence}`);
      // And the answer must be the word that was actually taken out.
      const restored = e.sentence.replace(BLANK, e.correct).toLowerCase();
      assert.ok(ls[0].sentences.some((x) => x.es.toLowerCase() === restored),
        `restoring the answer did not rebuild the sentence: ${restored}`);
    }
  }
});

test('an empty library produces nothing, not a sentence in another language', () => {
  // It used to return one hardcoded Spanish item so the drill was never empty.
  // In a German course that is the app teaching the wrong language, so it
  // returns nothing now and startReview() says so.
  assert.deepEqual(generateExercises({}, {}, [], 5), []);
});

test('a language can restrict which exercise kinds it uses', () => {
  const vocab = {};
  for (const w of Object.keys(dict)) vocab[w] = { exposures: 2, lastSeen: Date.now() };
  const ex = generateExercises(vocab, dict, lessons, 10, ['es_en']);
  assert.ok(ex.every((e) => e.kind === 'es_en'));
});

// ── phases ──────────────────────────────────────────────────
test('all eight phases are named', () => {
  assert.equal(phaseName(0), 'Survival');
  assert.equal(phaseName(7), 'Native-Like');
  assert.equal(phaseName(99), 'Phase 99');

  // A pack may ship its own ladder; anything malformed falls back rather than
  // throwing, because a broken phase list must not take the whole course down.
  setPhases([['Ankommen', 'der/die/das'], ['Einleben', 'Modalverben']]);
  assert.equal(phaseName(0), 'Ankommen');
  assert.equal(phaseDesc(1), 'Modalverben');
  assert.equal(phaseName(7), 'Phase 7');
  setPhases([{ name: 'Landing', desc: 'first words' }]);
  assert.equal(phaseName(0), 'Landing');
  setPhases([]);
  assert.equal(phaseName(0), 'Survival');
  setPhases([{ nope: 1 }, null]);
  assert.equal(phaseName(0), 'Survival');
  setPhases(null);
  assert.equal(phaseName(7), 'Native-Like');
});

// ── looking a written word up ───────────────────────────────
// German capitalises every noun. Lower-casing before the lookup lost all of
// them, and answered the two pairs where the capital IS the word backwards.
const DE = {
  Mann: { en: 'man', pos: 'n', g: 'der' },
  Morgen: { en: 'morning', pos: 'n', g: 'der' },
  morgen: { en: 'tomorrow', pos: 'adv' },
  Weg: { en: 'way', pos: 'n', g: 'der' },
  weg: { en: 'gone', pos: 'adv' },
  ich: { en: 'I', pos: 'pron' },
  der: { en: 'the', pos: 'art' },
  sagen: { en: 'to say', pos: 'v' },
};
const ES = { llego: { en: 'I arrive', pos: 'v' }, calor: { en: 'heat', pos: 'n' } };

test('a capitalised noun finds its own entry', () => {
  assert.equal(dictKey(DE, 'Mann'), 'Mann');
  assert.equal(dictKey(DE, 'Mann,'), 'Mann');
});

test('the capital is the difference, and it decides', () => {
  assert.equal(dictKey(DE, 'Morgen'), 'Morgen');   // der Morgen, the morning
  assert.equal(dictKey(DE, 'morgen'), 'morgen');   // morgen, tomorrow
  assert.equal(dictKey(DE, 'Weg'), 'Weg');
  assert.equal(dictKey(DE, 'weg'), 'weg');
});

test('a word capitalised only because it starts a sentence still lands', () => {
  assert.equal(dictKey(DE, 'Ich'), 'ich');
});

test('a lower-case dictionary behaves exactly as it always did', () => {
  // Spanish keys are lower case, so the exact-spelling try always misses and
  // every lookup falls through to where it used to land.
  assert.equal(dictKey(ES, 'Llego'), 'llego');
  assert.equal(dictKey(ES, 'llego'), 'llego');
  assert.equal(dictKey(ES, '¡Calor!'), 'calor');
  assert.equal(dictKey(ES, 'nada'), null);
});

test('bareWord keeps capitals and drops punctuation', () => {
  assert.equal(bareWord('Grüezi,'), 'Grüezi');
  assert.equal(bareWord('¿Qué'), 'Qué');
  assert.equal(bareWord(null), '');
});

test('gap items can blank a German noun', () => {
  // The old lower-cased filter found no noun in a German sentence at all, so
  // every gap would have been built out of the function words.
  const lessons = [{ id: 'p0-01', sentences: [{ es: 'Der Mann geht weg.', en: 'The man walks off.' }] }];
  // 200, not 8: the target is picked at random from the candidates, so a small
  // sample misses the noun by luck often enough to make the test flap.
  const items = generateExercises({}, DE, lessons, 200, ['gap']);
  assert.ok(items.length);
  for (const it of items) {
    assert.ok(DE[it.correct], `${it.correct} is not a dictionary key`);
    assert.ok(it.sentence.includes('______'));
  }
  assert.ok(items.some((i) => i.correct === 'Mann'), 'the noun was never the target');
  // "Der" at the front of the sentence resolves down to the article, not to
  // some capitalised key that does not exist.
  assert.ok(!items.some((i) => i.correct === 'Der'));
});

// ── separable verbs ─────────────────────────────────────────
// A form-to-lemma map cannot join "steige" to the "um" four words later. This
// does, using German's own bracket: the stranded prefix ends its clause.
const SEPV = { verbs: {
  ankommen: { pre: 'an', sep: true }, aussteigen: { pre: 'aus', sep: true },
  aufstehen: { pre: 'auf', sep: true }, anschauen: { pre: 'an', sep: true },
  umsteigen: { pre: 'um', sep: true }, mitkommen: { pre: 'mit', sep: true },
  vorbeikommen: { pre: 'vorbei', sep: true }, weitergehen: { pre: 'weiter', sep: true },
  umarmen: { pre: 'um', sep: false },
} };
const LEMMAS = {
  kommt: 'kommen', komme: 'kommen', kommen: 'kommen',
  steige: 'steigen', steigt: 'steigen', steigen: 'steigen',
  stehe: 'stehen', steht: 'stehen', schaut: 'schauen', geht: 'gehen',
  mann: 'Mann', perron: 'Perron', boden: 'Boden', pass: 'Pass', zug: 'Zug',
};
const fakeResolve = (raw) => LEMMAS[String(raw).replace(/[.,!?]/g, '').toLowerCase()] || null;
const bind = (text) => {
  const toks = tokenize(text);
  const m = separableBindings(toks, fakeResolve, SEPV);
  return [...m.entries()].map(([i, l]) => [toks[i].raw, l]);
};

test('the prefix at the end of the clause joins the verb at the front', () => {
  assert.deepEqual(bind('Der Zug kommt in Luzern an.'), [['kommt', 'ankommen'], ['an', 'ankommen']]);
  assert.deepEqual(bind('Ich steige in Zürich um.'), [['steige', 'umsteigen'], ['um', 'umsteigen']]);
  assert.deepEqual(bind('Die Frau schaut meinen Pass an.'), [['schaut', 'anschauen'], ['an', 'anschauen']]);
  assert.deepEqual(bind('Ich stehe auf.'), [['stehe', 'aufstehen'], ['auf', 'aufstehen']]);
});

test('a preposition that merely looks like a prefix is left alone', () => {
  // This is the case the naive "any prefix after a verb" rule gets wrong, and
  // it is why the rule is end-of-clause instead.
  assert.deepEqual(bind('Ich stehe auf dem Perron.'), []);
  assert.deepEqual(bind('Ich schaue auf den Boden.'), []);
});

test('the LAST prefix wins, not the first thing that looks like one', () => {
  // "Ein Mann kommt an mir vorbei" is vorbeikommen. Binding to the an would
  // name the wrong verb, and forms.py's own report makes exactly that mistake.
  assert.deepEqual(bind('Ein Mann kommt an mir vorbei.'),
    [['kommt', 'vorbeikommen'], ['vorbei', 'vorbeikommen']]);
});

test('the bracket closes at the clause, not at the sentence', () => {
  const got = bind('Ich steige aus, und er geht weiter.');
  assert.deepEqual(got, [['steige', 'aussteigen'], ['aus', 'aussteigen'],
                         ['geht', 'weitergehen'], ['weiter', 'weitergehen']]);
});

test('an inseparable prefix verb never binds', () => {
  // umarmen has a prefix and it does not come off, so a stray "um" at the end
  // of a clause must not drag it in.
  assert.deepEqual(bind('Er kommt um.'), []);
});

test('nothing to bind is not an error', () => {
  assert.deepEqual(bind('Der Zug ist gross.'), []);
  assert.deepEqual(bind(''), []);
  assert.deepEqual([...separableBindings(tokenize('Ich stehe auf.'), fakeResolve, null).entries()], []);
});

// ── principal parts ─────────────────────────────────────────
// The second verb-drill shape, for languages a conjugation table cannot hold.
// Every assertion here is about a form being STATED: nothing in this path may
// derive a verb form, because a plausible guess is the learner's own mistake
// handed back as the right answer.
const PARTS = {
  kind: 'principal-parts',
  verbs: {
    sprechen: { en: 'to speak', pres3: 'spricht', pres2: 'sprichst', past3: 'sprach', pp: 'gesprochen', aux: 'hat', imp: 'sprich' },
    fahren: { en: 'to go', pres3: 'fährt', pres2: 'fährst', past3: 'fuhr', pp: 'gefahren', aux: 'ist', imp: 'fahr' },
    nehmen: { en: 'to take', pres3: 'nimmt', pres2: 'nimmst', past3: 'nahm', pp: 'genommen', aux: 'hat', imp: 'nimm' },
    machen: { en: 'to do', pres3: 'macht', pres2: 'machst', past3: 'machte', pp: 'gemacht', aux: 'hat', imp: 'mach' },
    kommen: { en: 'to come', pres3: 'kommt', pres2: 'kommst', past3: 'kam', pp: 'gekommen', aux: 'ist', imp: 'komm' },
    umsteigen: { en: 'to change trains', pres3: 'steigt um', pres2: 'steigst um', past3: 'stieg um', pp: 'umgestiegen', aux: 'ist', imp: 'steig um', pre: 'um', sep: true },
    umarmen: { en: 'to hug', pres3: 'umarmt', pres2: 'umarmst', past3: 'umarmte', pp: 'umarmt', aux: 'hat', imp: 'umarme', pre: 'um', sep: false },
  },
};
const onlyMode = (m, n = 6) => verbPartItems(PARTS, n, [m]);

test('a course with the file but no verbs drills nothing rather than breaking', () => {
  assert.deepEqual(verbPartItems({ kind: 'principal-parts', verbs: {} }, 10), []);
  assert.deepEqual(verbPartItems(null, 10), []);
  assert.deepEqual(verbPartItems({ kind: 'principal-parts', verbs: PARTS.verbs, drill: ['nichtda'] }, 10), []);
});

test('every answer is a stated form, never a derived one', () => {
  for (const it of verbPartItems(PARTS, 60)) {
    const v = PARTS.verbs[it.verb];
    const stated = [v.pres3, v.pres2, v.past3, v.pp, v.aux, v.imp, it.verb,
      `${v.aux} ${v.pp}`, `er ${v.pres3}`];
    assert.ok(stated.includes(it.correct), `${it.mode} produced ${it.correct}`);
    assert.ok(it.options.includes(it.correct));
  }
});

test('the perfect carries its own auxiliary', () => {
  for (const it of onlyMode('perfect')) {
    const v = PARTS.verbs[it.verb];
    assert.equal(it.correct, `${v.aux} ${v.pp}`);
  }
  // haben and sein are both real answers, so the choice is two, not four.
  for (const it of onlyMode('aux')) {
    assert.deepEqual(it.options.slice().sort(), ['hat', 'ist']);
    assert.equal(it.correct, PARTS.verbs[it.verb].aux);
  }
});

test('the reading direction asks a form and answers the lemma', () => {
  for (const it of onlyMode('infinitive')) {
    const v = PARTS.verbs[it.verb];
    assert.equal(it.correct, it.verb);
    assert.ok([v.pres3, v.past3, v.pp].includes(it.prompt));
    assert.equal(it.options.length, 4);
  }
});

test('the prefix question is asked of separable AND inseparable verbs', () => {
  // um- comes off umsteigen and does not come off umarmen. If the mode only
  // ever ran on separable verbs the answer would always be the split one and
  // it could be played without reading the card.
  const seen = new Set(onlyMode('separable', 24).map((i) => i.verb));
  assert.ok(seen.has('umsteigen'));
  assert.ok(seen.has('umarmen'));
  for (const it of onlyMode('separable', 24)) {
    const v = PARTS.verbs[it.verb];
    assert.equal(it.correct, `er ${v.pres3}`);
    assert.equal(it.options.length, 2);
  }
  // A verb with no prefix has no question here.
  assert.deepEqual(verbPartItems({ kind: 'principal-parts', verbs: { machen: PARTS.verbs.machen } }, 4, ['separable']), []);
});

test('distractors come from the same slot, so nothing is spottable', () => {
  for (const it of onlyMode('past', 12)) {
    for (const o of it.options) {
      assert.ok(Object.values(PARTS.verbs).some((v) => v.past3 === o), `${o} is not a past form`);
    }
    assert.equal(new Set(it.options).size, it.options.length);
  }
});

test('a mode whose field is missing is skipped, never guessed', () => {
  const thin = { kind: 'principal-parts', verbs: { gehen: { en: 'to go', pres3: 'geht', past3: 'ging', pp: 'gegangen', aux: 'ist' } } };
  assert.deepEqual(verbPartItems(thin, 4, ['imperative']), []);
  assert.deepEqual(verbPartItems(thin, 4, ['present2']), []);
});

test('every mode either builds a whole item or none at all', () => {
  for (const m of PART_MODES) {
    for (const it of onlyMode(m, 8)) {
      assert.equal(it.mode, m);
      assert.ok(it.verb && it.prompt && it.correct);
      assert.ok(it.options.length >= 2);
    }
  }
});

console.log(`${passed} passed${process.exitCode ? ', SOME FAILED' : ''}`);
