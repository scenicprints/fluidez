# El juego — Granada

**Status: design agreed, mockup playable, nothing built into the app yet.**

Read this before touching the game. It carries every decision made so far and
why, so a fresh agent on a different machine can pick it up cold.

- **Play the mockup:** https://claude.ai/code/artifact/52e5240b-857b-4ad1-853b-b6cc1e0040fa
- **Its source:** `mockups/granada.html` in this repo — one self-contained HTML
  file, no build, no dependencies. Open it in a browser and it runs.

---

## What it is

You land in Granada with a backpack and no Spanish. You walk the city top-down,
Zelda-style, find people with a gold speech bubble over their head, and talk to
them by **typing Spanish**. Missions are the ordinary business of a first week:
check into a hostel, order breakfast, get a taxi without paying the chele price.

It goes in the **Scenes slot on the bottom tab bar** — Scenes is already a tile
on Today, so the tab is redundant. `TAB_DEFS` in `docs/js/ui.js` is where the
tab bar is built.

---

## Decisions, and why

**Top-down tile world, not isometric and not 3D.** Kevin asked for "almost 3D,
or isometric, or I'd even settle for top down like classic Zelda". Three.js
cannot be CDN-loaded inside an artifact and hand-written WebGL is a poor bet
for a mockup, so top-down came first. The engine is tile-based, so isometric is
a re-skin of the renderer, not a rewrite, if he wants it later.

**Nothing is locked behind vocabulary.** The first design gated dialogue lines
on words you had already learned elsewhere. Kevin killed it: *"I dont like that
you have to go grind to play the game. What if you want to mainly use the game
to learn?"* He is right. So instead **the help fades**:

| times you have met the phrase | what you get |
|---|---|
| 0 | the **ingredients**, shuffled — `quiero` (I want), `un cuarto` (a room) — and the English of what you are trying to say |
| 1 | the English only |
| 2+ | nothing but the situation |

Get it wrong and the help comes back. Miss twice and three options appear, so
you are never stuck. That means the game can be somebody's *only* way in.

**Never show the finished sentence.** The first version of this handed you the
whole line to copy and Kevin caught it immediately: *"It doesnt make sense that
the answer is right there though. I dont even have to try."* He is right —
copying a line you can see is transcription, not recall, and there is no
learning in it. Giving the ingredients instead means a total beginner can still
attempt it with no prior Spanish, but they have to **assemble** it, which is
the actual skill. There is always an "I am stuck — show me the line" link, so
the finished sentence is a choice you make rather than the default state.

**You BUILD the answer from chunks. You do not type it.** Typing was tried and
Kevin killed it: *"We cant be doing typed answers. Because you have to type
exactly how it is programmed. And the user may type something, and technically
it is correct, but the program does know."* That is the real failure of free
text and no amount of fuzzy matching closes it — a learner who is right and
gets marked wrong stops playing.

So the answer is assembled from a tray of chunks: `Buenas` `quiero`
`un cuarto` `mañana`. Tap to place, tap again to take back. This is **not**
multiple choice — you are not picking one of three finished sentences, you are
composing one, which is the skill. It also means accents cost nothing and there
is no phone keyboard to fight.

**No speech recognition, and NO SPEECH AT ALL.** Two separate calls:
- Recognition was never on the table. `docs/js/speech.js` already says why:
  *"browser speech recognition is unreliable on iPhone and on regional
  accents"*, which is why Shadowing records and plays back but never scores.
  An es-MX recognizer would mark him **wrong for pronouncing things
  Nicaraguan** — aspirated s, *vamoh*, *pueh*.
- Synthesis was in the first mockup and **Kevin cut it: "We need to drop the
  vocal completely. It is terrible. The game will be reading only."** The only
  voice available is es-MX reading Nicaraguan Spanish in a Mexican accent. All
  `speechSynthesis` code is out of the mockup. Do not put it back.

**Real geography, drawn by us — not Google Maps.** Granada's actual colonial
grid: Parque Central, the cathedral on its east side, Calle La Calzada running
from the cathedral down to Lake Cocibolca, the mercado in the southwest,
Mombacho to the south. Houses are built around **patios**, which is both true
and what stops a block reading as one slab of terracotta.

Google Maps was considered and rejected: it needs billing on file, it costs
past a free tier, its terms are awkward about games (they killed their gaming
SDK in 2021), and a Google Maps embed would look like a Google Map dropped into
the app. OpenStreetMap is the fallback if we ever want survey-accurate streets.

**It stays inside Fluidez, on the phone.** Kevin asked whether it should be a
standalone desktop app. No: a separate app cannot see your vocabulary, streak
or fluency, which all live in Fluidez already — and that link is the best thing
the game has. It is also a ten-minutes-in-a-queue game, not a sit-at-a-desk
one. "Too big" gets solved by shipping one district, not by changing platform.

**Granada, even though the course is Managua barrio Spanish.** Granada is where
a learner actually lands, it is walkable and legible, and the fact that people
there will answer a chele in English is not a problem — it is a mission.

---

## How answers are graded

**Exact match, and that is the whole grader.** Because the tray is authored,
the set of sentences a player can produce is finite and known, so every correct
assembly can simply be listed. Nothing a player can build is
correct-but-refused. That is the entire reason for the chunk tray.

The comparison still normalises first — lowercase, accents stripped,
punctuation stripped — so the `ok` lists can be written in plain ASCII.

Two invariants, both checked by `mockups/checkbeats.py`, and both worth
re-running whenever a beat is written or edited:

1. The tiles laid down **in their written order** must be one of the accepted
   answers, or the beat is unwinnable.
2. Every accepted answer must be **buildable from the chunks the tray offers**,
   or it is dead data pretending to be a second right answer.

Each beat carries `tiles` (the chunks that build the answer), `extra` (chunks
that do not), and `ok` (every assembly that counts). The **help ladder is now
noise**, not the answer:

| times you have met the phrase | tray | told what you are saying? |
|---|---|---|
| 0 | tiles + 1 distractor | yes |
| 1 | tiles + 2 distractors | yes |
| 2+ | tiles + 4 distractors | no |

Miss twice and it lays the right answer out in the tray for you, so a beat can
never dead-end. There is also an always-available "I am stuck — show me the
line".

---

## What is left

**The mockup was never driven end to end.** It renders, the loop runs (the
markers bob), and the code has been read line by line — but no keypress or
click could be delivered into it. The artifact iframe is cross-origin and
refuses scripted input; the in-app browser pane will not run a live local page
either. **First job for whoever picks this up: play it and confirm the d-pad
moves you and the A button opens a conversation.**

Known rough edges in the mockup:
- Roofs are still a big field of terracotta. Buildings are 2–3 tiles wide;
  widening them to 3–5 with bigger patios would break it up.
- No street life. People wandering, a dog, washing on a line.
- The `!` bubble is good; the "done" bubble could read better.

Then, in order:
1. **Scope decision.** Three missions in one district is a demo. A real Granada
   is a dozen locations and ~40 missions. Kevin has already been told that, and
   that it is the 185-story job again — he chose **all hand-written**
   encounters, so the writing is the cost, not the code.
2. **Switch grading to the rule shape above** before writing content.
3. **Where the content lives.** Encounters are Nicaraguan Spanish gated on
   vocabulary, so they belong in `scenicprints/fluidez-es-ni` under `content/`
   and ship with no app release. Old clients ignore an unknown manifest key —
   that is how `momo.json` shipped. Push content FIRST, then the app.
4. **The engine and the map go here**, in `docs/js/`, as a new screen.

---

## Other open threads, unrelated to the game

- **`scenicprints/fluidez-gsw-lu`** — Kevin chose "delete it permanently" and
  was asked to confirm once, since GitHub cannot undo it. **Not yet
  confirmed, not yet deleted.** The languages registry already lists only
  `es-ni`, so nothing in the app can reach it either way.
- **The voseo imperative is not drillable.** `startVerbs()` in
  `docs/js/screens.js` draws a random subject index 0–4 for whatever tense it
  picks, and the imperative has one form and no subject, so it would hand the
  drill an `undefined`. `verbs.json` already carries an `imperative` key per
  irregular verb. Approved, not started. Note `engine.js conjugate()` falls
  back to the regular table when a tense is missing, so `verbs.regular` needs
  an `imperative` row or regular verbs will silently conjugate wrong — that is
  exactly the bug that had the trainer teaching "cerro" and "perdo" for years.
- **The course itself is done and published** — 185 stories, 95 scenes, 52
  patterns, 97.9% of words on the page tappable. See `NEXT.md` in
  `scenicprints/fluidez-es-ni`.
