# Fluidez

Nicaraguan Spanish, learned the way you'll actually use it.

A web app (`docs/`, served by GitHub Pages) plus a thin Android WebView shell
(`shell/`). The course itself lives in separate content repos, so new lessons
and new languages ship without touching this repo.

## How updates reach everyone

| What changed | What you do | App release needed? |
|---|---|---|
| Bug fix or new feature | push to `main` | no — CI stamps a version, apps show an update banner |
| New or edited lesson | push JSON to the language's content repo | **no** |
| A whole new language | new content repo + one line in `fluidez-languages` | **no** |

The Android shell only ever needs rebuilding if the shell itself changes, which
is almost never.

## Layout

    docs/           the web app (GitHub Pages)
      js/engine.js  the learning engine, ported from the original Flutter app
      sw.js         offline + update handling
    shell/          Flutter WebView wrapper for Android
    reference/      the original single-file Flutter app, kept for reference
    scripts/        one-off build helpers

## Before you read

Today carries a card above the story card that owns the gap between you and the
next story: every dictionary word that story uses which you are not holding
yet, and a session that closes it.

Each word gets four rungs — meet it, recognise it (Spanish → English), produce
it (English → Spanish), then fill it into the line the story actually uses it
in. The last one is the point: it is not a specimen sentence, it is the sentence
you hit two minutes later. A wrong answer drops the word one rung, so a slip on
the last rung costs one question rather than the whole ladder, and dropping off
the first drill rung means being shown the word again.

Six words at a time, met together and then told apart, because that is what has
to happen anyway when they turn up in one paragraph. The card recomputes from
the vocabulary on every render, so walking out halfway and coming back resumes
by arithmetic — there is no session saved anywhere and none to go stale.

`storyWords`, `unknownStoryWords`, `storyGap` and `prepLadder` in `engine.js`
are the whole of it and are covered by the engine tests; `screens.js` only
turns the ladder into screens. "Not holding yet" is `isKnown()` unchanged —
the app's own bar, not a second one, because two screens disagreeing about
what *known* means is worse than either answer.

Labels come from the pack like every other one (`prepLabel`, `prepGap`,
`prepGo`, …), so a course that ships none of them gets the English in
`js/ui.js`.

## Checks

    node docs/js/engine.test.mjs

CI runs this on every push; a broken engine never reaches Pages.

## Adding a language

Four things are per-course and all four come out of the content pack, so a new
language is a content repo plus a line in the registry. Only artwork needs an
app release.

| What | Where it lives | Fallback if the pack says nothing |
|---|---|---|
| Phase ladder | `pack.phases` | the original eight |
| Interface labels | `pack.ui` | English (`EN` in `js/ui.js`) |
| Tab icons | `pack.icons`, e.g. `{"path": "ic-gondola"}` | the default sprite |
| Mascot | `pack.mascot`, an id from `js/creatures.js` | mapped by language code, else Momo |
| Palette | `[data-course="<code>"]` in `css/app.css` | the shipping one |

`data-course` is stamped onto `<html>` when the pack loads, which is what lets
the stylesheet repaint the whole app without any screen knowing the language.

**The one rule for a new palette.** Colour means memory strength and never
decoration, so `--jade`, `--oro` and `--barro` are **the same in every course**:
a locked-in word looks identical whatever you are learning. Repaint `--accent`,
`--chrome-grad`, the grounds and the text instead. `--accent` is deliberately
separate from `--oro` — before the split they were one token doing both jobs,
and no second course could look different without changing what a colour meant.

**A course with no lessons yet** shows its tiles but routes all of them to the
`Im Bau` screen. That is `underConstruction()` in `js/content.js`, which is
`content.lessons.length === 0`, so it switches itself off when content lands.

### Mascots

`js/creatures.js` holds one entry per animal. Each exposes the same rig, so
`js/mascot.js` drives behaviour without knowing the species:

    .m-float  whole body     .m-head   turns and tilts
    .m-limbL  wing/paw/ear   .m-limbR  the other one
    .m-tail   the idle loop  .m-mouth  beak/muzzle
    .lid      eyelids        .m-glow   the good-answer halo
    .zzz      sleep marks

`beats` names the idle animations that animal actually does, and `leave` /
`arrive` name how it gets off screen and back. SVG ids **must** be suffixed per
instance: the mascot is on screen more than once, and shared ids resolved into
the hidden splash copy and silently painted every gradient shape as nothing.

    node docs/js/creatures.test.mjs

CI runs it. A broken rig paints nothing and throws nothing, so it has to be
asserted rather than looked at.
