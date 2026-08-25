// Every mascot must expose a working rig, or a course silently ships a bird
// with no wings. Runs in CI beside the engine test.
// This is the check that would have caught the gradient-id bug the comments in
// that file warn about, and it runs without a browser.
import { CREATURES, creatureFor } from './creatures.js';

const RIG = ['m-float', 'm-head', 'm-tail', 'm-limbL', 'm-limbR', 'm-mouth', 'lid', 'm-glow', 'zzz'];
let bad = 0;

for (const [key, c] of Object.entries(CREATURES)) {
  const a = c.svg('one');
  const b = c.svg('two');
  const ids = [...a.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  const refs = [...new Set([...a.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]))];
  const missing = refs.filter((r) => !ids.includes(r));
  const absent = RIG.filter((k) => !new RegExp(`class="[^"]*\\b${k}\\b`).test(a));
  // Two instances must not share a single id, or one steals the other's paint.
  const shared = ids.filter((id) => b.includes(`id="${id}"`));
  const shapes = (a.match(/<(path|ellipse|circle|rect|text)\b/g) || []).length;
  const miniShapes = (c.mini.match(/<(path|ellipse|circle|rect)\b/g) || []).length;
  const beats = c.beats.length;

  const problems = [];
  if (missing.length) problems.push(`undefined gradients ${missing}`);
  if (absent.length) problems.push(`rig missing ${absent}`);
  if (shared.length) problems.push(`ids shared between instances ${shared}`);
  if (!beats) problems.push('no idle beats');
  if (miniShapes < 8) problems.push(`mini is only ${miniShapes} shapes`);
  if (!/viewBox="0 0 220 214"/.test(a)) problems.push('wrong viewBox');

  console.log(
    `${key.padEnd(16)} ${String(c.name).padEnd(10)} shapes=${String(shapes).padStart(3)}` +
    ` mini=${String(miniShapes).padStart(2)} beats=${beats} ${problems.length ? 'FAIL' : 'ok'}`);
  for (const p of problems) { console.log(`    PROBLEM: ${p}`); bad++; }
}

// The language mapping has to resolve, or a course silently gets the wrong animal.
for (const [code, want] of [['es-ni', 'guardabarranco'], ['de-ch', 'bluemli'], ['xx-yy', 'guardabarranco']]) {
  const got = creatureFor(code, null).id;
  const ok = got === want;
  console.log(`${code.padEnd(16)} -> ${got.padEnd(16)} ${ok ? 'ok' : `FAIL, wanted ${want}`}`);
  if (!ok) bad++;
}
// An explicit declaration in the pack must beat the code mapping.
const declared = creatureFor('de-ch', 'mungg').id;
console.log(`de-ch + declared mungg -> ${declared} ${declared === 'mungg' ? 'ok' : 'FAIL'}`);
if (declared !== 'mungg') bad++;

console.log(bad ? `\n${bad} problem(s)` : '\nall clean');
process.exit(bad ? 1 : 0);
