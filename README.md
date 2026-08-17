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

## Checks

    node docs/js/engine.test.mjs

CI runs this on every push; a broken engine never reaches Pages.
