// Speaking and listening.
//
// Speech synthesis is used for the reader, dictation and the speed ladder.
// Recording is used for shadowing — you say the line back and hear yourself
// next to the model. There is deliberately no scoring: browser speech
// recognition is unreliable on iPhone and on regional accents, and shadowing
// gets most of the benefit with none of the false failures.

let voices = [];
let warmed = false;

function refreshVoices() {
  try { voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : []; } catch { voices = []; }
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  refreshVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
}

export const canSpeak = () => typeof window !== 'undefined' && !!window.speechSynthesis;

/**
 * Does a voice actually exist for this language tag?
 * Luzerndütsch has none on any platform, which is exactly why a language must
 * declare the `audio` feature rather than the app assuming it.
 */
export function hasVoiceFor(bcp47) {
  if (!canSpeak()) return false;
  if (!voices.length) refreshVoices();
  const base = String(bcp47 || '').split('-')[0].toLowerCase();
  return voices.some((v) => String(v.lang).toLowerCase().startsWith(base));
}

function bestVoice(bcp47) {
  if (!voices.length) refreshVoices();
  const want = String(bcp47 || 'es-MX').toLowerCase();
  const base = want.split('-')[0];
  return (
    voices.find((v) => v.lang.toLowerCase() === want) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(base)) ||
    null
  );
}

// iOS will not speak until synthesis has been triggered inside a real user
// gesture at least once. Call this from the first tap of the session.
export function warmUp() {
  if (warmed || !canSpeak()) return;
  try {
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    window.speechSynthesis.speak(u);
    warmed = true;
  } catch {}
}

export function stop() {
  try { window.speechSynthesis?.cancel(); } catch {}
}

/**
 * Speak a line. Resolves when it finishes so a speed ladder can chain steps.
 */
export function speak(text, { lang = 'es-MX', rate = 0.45, pitch = 1 } = {}) {
  return new Promise((resolve) => {
    if (!canSpeak() || !text) return resolve(false);
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = Math.max(0.1, Math.min(2, rate));
      u.pitch = pitch;
      const v = bestVoice(lang);
      if (v) u.voice = v;
      u.onend = () => resolve(true);
      u.onerror = () => resolve(false);
      window.speechSynthesis.speak(u);
      // Safari occasionally drops onend; do not hang the caller forever.
      setTimeout(() => resolve(true), Math.max(4000, text.length * 220));
    } catch { resolve(false); }
  });
}

/**
 * The speed ladder: the same sentence from slow to native, so Phase 5's
 * "fast speech" is something you can actually practise.
 */
export const LADDER = [0.5, 0.7, 0.85, 1.0];

export async function speakLadder(text, opts, onStep = () => {}) {
  for (let i = 0; i < LADDER.length; i++) {
    onStep(i, LADDER[i]);
    await speak(text, { ...opts, rate: LADDER[i] });
    await new Promise((r) => setTimeout(r, 350));
  }
  onStep(-1, null);
}

// ── recording, for shadowing ────────────────────────────────
export const canRecord = () =>
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia &&
  typeof MediaRecorder !== 'undefined';

export function createRecorder() {
  let stream = null;
  let recorder = null;
  let chunks = [];
  let url = null;

  return {
    async start() {
      if (!canRecord()) throw new Error('This browser cannot record audio.');
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      // Let the browser choose its own container — Safari and Chrome disagree
      // about what they can produce, and any of them plays back fine.
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.start();
    },

    stop() {
      return new Promise((resolve) => {
        if (!recorder || recorder.state === 'inactive') return resolve(null);
        recorder.onstop = () => {
          stream?.getTracks().forEach((t) => t.stop());
          if (url) URL.revokeObjectURL(url);
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          url = URL.createObjectURL(blob);
          resolve(url);
        };
        recorder.stop();
      });
    },

    release() {
      try { stream?.getTracks().forEach((t) => t.stop()); } catch {}
      if (url) { URL.revokeObjectURL(url); url = null; }
    },
  };
}
