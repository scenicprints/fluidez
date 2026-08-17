// Momo — a guardabarranco, Nicaragua's national bird.
//
// Real motmots swing that racket-tipped tail like a pendulum, so his idle is
// his actual behaviour rather than an invented animation. Every state is a
// class on the wrapper; the CSS does the moving.

export const MOMO_SVG = `
<svg class="momo-svg" viewBox="0 0 220 214" aria-hidden="true">
  <defs>
    <radialGradient id="mGlow" cx="50%" cy="46%" r="50%">
      <stop offset="0%" stop-color="#E8A33D" stop-opacity=".55"/>
      <stop offset="55%" stop-color="#E8A33D" stop-opacity=".16"/>
      <stop offset="100%" stop-color="#E8A33D" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="mBody" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#48B79D"/><stop offset="100%" stop-color="#22685C"/>
    </linearGradient>
    <linearGradient id="mHead" x1="0" y1="0" x2=".4" y2="1">
      <stop offset="0%" stop-color="#4FC0A5"/><stop offset="100%" stop-color="#2A7A6B"/>
    </linearGradient>
    <linearGradient id="mBelly" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#E0975C"/><stop offset="100%" stop-color="#B25E36"/>
    </linearGradient>
    <linearGradient id="mBrow" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#8FDDEE"/><stop offset="55%" stop-color="#5FB6E0"/>
      <stop offset="100%" stop-color="#3E8FC9"/>
    </linearGradient>
    <linearGradient id="mWing" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#5FCCB0"/><stop offset="100%" stop-color="#31897A"/>
    </linearGradient>
  </defs>

  <ellipse id="glow" cx="110" cy="108" rx="92" ry="94" fill="url(#mGlow)"/>

  <path d="M14 170 Q110 161 206 172" stroke="#4C3B30" stroke-width="7" fill="none" stroke-linecap="round"/>
  <path d="M170 168 q13 -9 24 -6 q-11 8 -24 6z" fill="#2F6B4E"/>
  <path d="M40 170 q-13 -8 -25 -5 q11 8 25 5z" fill="#2F6B4E"/>

  <g id="float">
    <g id="tail-grp">
      <path d="M104 146 C99 170 99 182 100 192" stroke="#2A7A6B" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <path d="M117 146 C122 170 122 182 121 192" stroke="#2A7A6B" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <ellipse cx="100" cy="200" rx="7.5" ry="10.5" fill="url(#mBody)"/>
      <ellipse cx="121" cy="200" rx="7.5" ry="10.5" fill="url(#mBody)"/>
      <ellipse cx="100" cy="198" rx="3.4" ry="5" fill="#5FB6E0" opacity=".65"/>
      <ellipse cx="121" cy="198" rx="3.4" ry="5" fill="#5FB6E0" opacity=".65"/>
    </g>

    <ellipse id="wingL" cx="78" cy="117" rx="16" ry="29" fill="url(#mWing)"/>
    <ellipse id="wingR" cx="142" cy="117" rx="16" ry="29" fill="url(#mWing)"/>

    <path d="M100 152 L98 168 M100 168 l-6 4 M100 168 l6 4" stroke="#D89A3C" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M121 152 L123 168 M123 168 l-6 4 M123 168 l6 4" stroke="#D89A3C" stroke-width="3" fill="none" stroke-linecap="round"/>

    <ellipse cx="110" cy="118" rx="38" ry="42" fill="url(#mBody)"/>
    <ellipse cx="110" cy="127" rx="26" ry="31" fill="url(#mBelly)"/>

    <g id="head">
      <circle cx="110" cy="70" r="33" fill="url(#mHead)"/>
      <path d="M78 62 a33 33 0 0 1 64 0 a46 46 0 0 0 -64 0 z" fill="#63D6B6" opacity=".38"/>
      <path d="M83 88 q27 13 54 0 q-27 10 -54 0 z" fill="#C2703F" opacity=".7"/>
      <path d="M85 66 Q110 59 135 66 Q136 81 110 79 Q84 81 85 66 Z" fill="#1E1512"/>
      <path d="M87 60 Q97 53.5 106 58.5" stroke="url(#mBrow)" stroke-width="5.4" fill="none" stroke-linecap="round"/>
      <path d="M114 58.5 Q123 53.5 133 60" stroke="url(#mBrow)" stroke-width="5.4" fill="none" stroke-linecap="round"/>
      <circle cx="98" cy="70" r="8.6" fill="#F6EFE2"/>
      <circle cx="122" cy="70" r="8.6" fill="#F6EFE2"/>
      <circle cx="99.4" cy="71" r="4.5" fill="#14100E"/>
      <circle cx="123.4" cy="71" r="4.5" fill="#14100E"/>
      <circle cx="101.2" cy="68.6" r="1.8" fill="#FFFFFF"/>
      <circle cx="125.2" cy="68.6" r="1.8" fill="#FFFFFF"/>
      <rect class="lid" x="89.4" y="61.3" width="17.2" height="17.6" rx="8.6" fill="#1E1512"/>
      <rect class="lid" x="113.4" y="61.3" width="17.2" height="17.6" rx="8.6" fill="#1E1512"/>
      <path d="M99 83 Q110 78.5 121 83 L110 90.5 Z" fill="#584234"/>
      <path id="beak" d="M100 84.5 L120 84.5 L110 103 Z" fill="#2A1E17"/>
      <g class="zzz">
        <text x="146" y="46" font-size="15" font-weight="700" fill="#A99C8E">z</text>
        <text x="158" y="34" font-size="11" font-weight="700" fill="#6E635A">z</text>
      </g>
    </g>
  </g>
</svg>`;

// A smaller, still Momo, for marking where you are on the path.
export const MOMO_MINI = `
<svg class="mini-momo" viewBox="0 0 60 60" aria-hidden="true">
  <ellipse cx="30" cy="42" rx="4" ry="7" fill="#22685C"/>
  <path d="M28 26 C26 34 26 38 27 42" stroke="#2A7A6B" stroke-width="2" fill="none"/>
  <ellipse cx="30" cy="24" rx="13" ry="14" fill="#2A7A6B"/>
  <ellipse cx="30" cy="27" rx="8" ry="10" fill="#B25E36"/>
  <circle cx="30" cy="12" r="10" fill="#4FC0A5"/>
  <path d="M22 8 Q30 3 38 8" stroke="#5FB6E0" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M21 12 Q30 9 39 12 Q39 18 30 17 Q21 18 21 12 Z" fill="#1E1512"/>
  <circle cx="26" cy="13" r="2.6" fill="#F6EFE2"/><circle cx="34" cy="13" r="2.6" fill="#F6EFE2"/>
  <circle cx="26.6" cy="13.6" r="1.4" fill="#14100E"/><circle cx="34.6" cy="13.6" r="1.4" fill="#14100E"/>
  <path d="M26 18 L34 18 L30 25 Z" fill="#2A1E17"/>
</svg>`;

const STATES = ['happy', 'wrong', 'cheer', 'speak', 'sleep'];
const IDLE_AFTER_MS = 45000;

export function createMomo(hostEl, speechEl, sparksEl) {
  let revert = null;
  let hush = null;
  let idle = null;

  function armIdle() {
    clearTimeout(idle);
    idle = setTimeout(() => {
      if (!hostEl.classList.contains('sleep')) set('sleep', 'Zzz… tap me');
    }, IDLE_AFTER_MS);
  }

  function burst(n) {
    if (!sparksEl) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('div');
      s.className = 'spark';
      const a = Math.random() * Math.PI * 2;
      const d = 44 + Math.random() * 66;
      s.style.setProperty('--sx', `${Math.cos(a) * d}px`);
      s.style.setProperty('--sy', `${Math.sin(a) * d - 26}px`);
      s.style.background = Math.random() > 0.5 ? 'var(--oro)' : 'var(--jade)';
      s.style.animationDelay = `${Math.random() * 0.14}s`;
      sparksEl.appendChild(s);
      void s.offsetWidth;
      s.classList.add('go');
      setTimeout(() => s.remove(), 1100);
    }
  }

  function say(msg, ms = 2400) {
    if (!speechEl || !msg) return;
    speechEl.innerHTML = msg;
    speechEl.classList.add('show');
    clearTimeout(hush);
    hush = setTimeout(() => speechEl.classList.remove('show'), ms);
  }

  function set(state, msg) {
    hostEl.className = 'momo';
    void hostEl.offsetWidth;               // restart the animation
    if (state && state !== 'idle') hostEl.classList.add(state);
    if (msg) say(msg, state === 'sleep' ? 4200 : 2600);
    if (state === 'happy') burst(9);
    if (state === 'cheer') burst(16);

    clearTimeout(revert);
    if (state && state !== 'sleep' && state !== 'idle') {
      revert = setTimeout(() => { hostEl.className = 'momo'; }, state === 'cheer' ? 1300 : 1100);
    }
    armIdle();
  }

  // Tapping him should always do something, and not the same thing twice.
  const POKES = [
    ['happy', '¡Ideay! ¿Qué tal?'],
    ['speak', 'Escuchá bien'],
    ['happy', 'Dale pues'],
    ['cheer', '¡Qué tuani!'],
    ['speak', 'Say it out loud'],
    ['happy', 'Vamos, chele'],
  ];
  let pokeIndex = 0;

  hostEl.closest('.perch')?.addEventListener('click', () => {
    const [state, msg] = POKES[pokeIndex++ % POKES.length];
    set(state, msg);
  });

  document.addEventListener('pointerdown', armIdle, { passive: true });
  armIdle();

  return {
    set,
    say,
    react: (correct, msg) => set(correct ? 'happy' : 'wrong', msg),
    celebrate: (msg) => set('cheer', msg),
    states: STATES,
  };
}
