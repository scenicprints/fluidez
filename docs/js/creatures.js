// The mascots, one per language.
//
// A course's mascot is not in its content pack — only the LINES it speaks are.
// The animal itself is artwork plus a rig of CSS animations, so it lives in the
// app, and a new language means a new entry here rather than a new drawing
// pipeline.
//
// Every creature exposes the same rig, so `mascot.js` never has to know what
// species it is driving:
//
//   .m-float   the whole animal, for breathing, hopping, cheering
//   .m-head    turns, tilts, dips
//   .m-limbL   left wing / forepaw / whatever the thing has
//   .m-limbR   right
//   .m-tail    the part that idles on a loop
//   .m-mouth   beak / muzzle, for speaking and yawning
//   .lid       eyelids, for blinking and sleeping
//   .m-glow    the warm halo on a good answer
//   .zzz       the sleep marks
//
// Species-specific behaviour is declared, not hardcoded: `beats` names the idle
// animations that animal actually does, and `leave`/`arrive` name how it gets
// off the screen and back. A bird flies. A marmot goes down a hole.
//
// SVG ids are suffixed per instance because the mascot is on screen more than
// once (splash and home). Sharing ids meant `url(#mBody)` resolved into the
// hidden splash copy and every gradient-filled shape silently painted nothing.
// Animation hooks are classes for the same reason: an id can only drive one.

// ── Momo, the guardabarranco ────────────────────────────────
// Nicaragua's national bird. Real motmots swing that racket-tipped tail like a
// pendulum, so his idle is his actual behaviour rather than an invented
// animation, and every beat below was picked the same way.
function guardabarrancoSvg(uid) {
  const g = (name) => `${name}-${uid}`;
  return `
<svg class="momo-svg" viewBox="0 0 220 214" aria-hidden="true">
  <defs>
    <radialGradient id="${g('mGlow')}" cx="50%" cy="46%" r="50%">
      <stop offset="0%" stop-color="#E8A33D" stop-opacity=".55"/>
      <stop offset="55%" stop-color="#E8A33D" stop-opacity=".16"/>
      <stop offset="100%" stop-color="#E8A33D" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${g('mBody')}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#48B79D"/><stop offset="100%" stop-color="#22685C"/>
    </linearGradient>
    <linearGradient id="${g('mHead')}" x1="0" y1="0" x2=".4" y2="1">
      <stop offset="0%" stop-color="#4FC0A5"/><stop offset="100%" stop-color="#2A7A6B"/>
    </linearGradient>
    <linearGradient id="${g('mBelly')}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#E0975C"/><stop offset="100%" stop-color="#B25E36"/>
    </linearGradient>
    <linearGradient id="${g('mBrow')}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#8FDDEE"/><stop offset="55%" stop-color="#5FB6E0"/>
      <stop offset="100%" stop-color="#3E8FC9"/>
    </linearGradient>
    <linearGradient id="${g('mWing')}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#5FCCB0"/><stop offset="100%" stop-color="#31897A"/>
    </linearGradient>
  </defs>

  <ellipse class="m-glow" cx="110" cy="108" rx="92" ry="94" fill="url(#${g('mGlow')})"/>

  <path d="M14 170 Q110 161 206 172" stroke="#4C3B30" stroke-width="7" fill="none" stroke-linecap="round"/>
  <path d="M170 168 q13 -9 24 -6 q-11 8 -24 6z" fill="#2F6B4E"/>
  <path d="M40 170 q-13 -8 -25 -5 q11 8 25 5z" fill="#2F6B4E"/>

  <g class="m-float">
    <g class="m-tail">
      <path d="M104 146 C99 170 99 182 100 192" stroke="#2A7A6B" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <path d="M117 146 C122 170 122 182 121 192" stroke="#2A7A6B" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <ellipse cx="100" cy="200" rx="7.5" ry="10.5" fill="url(#${g('mBody')})"/>
      <ellipse cx="121" cy="200" rx="7.5" ry="10.5" fill="url(#${g('mBody')})"/>
      <ellipse cx="100" cy="198" rx="3.4" ry="5" fill="#5FB6E0" opacity=".65"/>
      <ellipse cx="121" cy="198" rx="3.4" ry="5" fill="#5FB6E0" opacity=".65"/>
    </g>

    <ellipse class="m-limbL" cx="78" cy="117" rx="16" ry="29" fill="url(#${g('mWing')})"/>
    <ellipse class="m-limbR" cx="142" cy="117" rx="16" ry="29" fill="url(#${g('mWing')})"/>

    <path d="M100 152 L98 168 M100 168 l-6 4 M100 168 l6 4" stroke="#D89A3C" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M121 152 L123 168 M123 168 l-6 4 M123 168 l6 4" stroke="#D89A3C" stroke-width="3" fill="none" stroke-linecap="round"/>

    <ellipse cx="110" cy="118" rx="38" ry="42" fill="url(#${g('mBody')})"/>
    <ellipse cx="110" cy="127" rx="26" ry="31" fill="url(#${g('mBelly')})"/>

    <g class="m-head">
      <circle cx="110" cy="70" r="33" fill="url(#${g('mHead')})"/>
      <path d="M78 62 a33 33 0 0 1 64 0 a46 46 0 0 0 -64 0 z" fill="#63D6B6" opacity=".38"/>
      <path d="M83 88 q27 13 54 0 q-27 10 -54 0 z" fill="#C2703F" opacity=".7"/>
      <path d="M80 64 Q110 54 140 64 Q142 86 110 84 Q78 86 80 64 Z" fill="#1E1512"/>
      <path d="M87 60 Q97 53.5 106 58.5" stroke="url(#${g('mBrow')})" stroke-width="5.4" fill="none" stroke-linecap="round"/>
      <path d="M114 58.5 Q123 53.5 133 60" stroke="url(#${g('mBrow')})" stroke-width="5.4" fill="none" stroke-linecap="round"/>
      <circle cx="98" cy="72" r="8.4" fill="#F6EFE2"/>
      <circle cx="122" cy="72" r="8.4" fill="#F6EFE2"/>
      <circle cx="99.4" cy="73" r="4.4" fill="#14100E"/>
      <circle cx="123.4" cy="73" r="4.4" fill="#14100E"/>
      <circle cx="101.2" cy="70.6" r="1.8" fill="#FFFFFF"/>
      <circle cx="125.2" cy="70.6" r="1.8" fill="#FFFFFF"/>
      <rect class="lid" x="89.6" y="63.6" width="16.8" height="17.2" rx="8.4" fill="#1E1512"/>
      <rect class="lid" x="113.6" y="63.6" width="16.8" height="17.2" rx="8.4" fill="#1E1512"/>
      <path d="M99 83 Q110 78.5 121 83 L110 90.5 Z" fill="#584234"/>
      <path class="m-mouth" d="M100 84.5 L120 84.5 L110 103 Z" fill="#2A1E17"/>
      <g class="zzz">
        <text x="146" y="46" font-size="15" font-weight="700" fill="#A99C8E">z</text>
        <text x="158" y="34" font-size="11" font-weight="700" fill="#6E635A">z</text>
      </g>
    </g>
  </g>
</svg>`;
}

const GUARDABARRANCO_MINI = `
<svg class="mini-momo" viewBox="0 0 60 60" aria-hidden="true">
  <ellipse cx="30" cy="42" rx="4" ry="7" fill="#22685C"/>
  <path d="M28 26 C26 34 26 38 27 42" stroke="#2A7A6B" stroke-width="2" fill="none"/>
  <ellipse cx="30" cy="24" rx="13" ry="14" fill="#2A7A6B"/>
  <ellipse cx="30" cy="27" rx="8" ry="10" fill="#B25E36"/>
  <circle cx="30" cy="12" r="10" fill="#4FC0A5"/>
  <path d="M22 8 Q30 3 38 8" stroke="#5FB6E0" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M20 11 Q30 7 40 11 Q41 19 30 18 Q19 19 20 11 Z" fill="#1E1512"/>
  <circle cx="26" cy="13" r="2.6" fill="#F6EFE2"/><circle cx="34" cy="13" r="2.6" fill="#F6EFE2"/>
  <circle cx="26.6" cy="13.6" r="1.4" fill="#14100E"/><circle cx="34.6" cy="13.6" r="1.4" fill="#14100E"/>
  <path d="M26 18 L34 18 L30 25 Z" fill="#2A1E17"/>
</svg>`;

// ── Mungg, the Alpine marmot ────────────────────────────────
// Mungg is the Swiss German word for a marmot, which is the same trick Momo
// plays: the mascot's name is a word from the language you are learning.
//
// Every behaviour below is a real marmot behaviour, exactly as the motmot's
// tail was. He sits bolt upright on a rock. He whistles as an alarm, standing
// up on his hind legs to do it, and that is his speaking pose. He grooms his
// face with his forepaws. And instead of flying off he drops down a hole,
// which is both funnier and truer than making a ground animal fly.
//
// Sleep is the good one. An alpine marmot hibernates for six to eight months
// of the year, so a mascot who nods off after forty-five idle seconds is, for
// once, being conservative.
function munggSvg(uid) {
  const g = (name) => `${name}-${uid}`;
  return `
<svg class="momo-svg" viewBox="0 0 220 214" aria-hidden="true">
  <defs>
    <radialGradient id="${g('mGlow')}" cx="50%" cy="46%" r="50%">
      <stop offset="0%" stop-color="#E8A33D" stop-opacity=".55"/>
      <stop offset="55%" stop-color="#E8A33D" stop-opacity=".16"/>
      <stop offset="100%" stop-color="#E8A33D" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${g('mBody')}" x1=".2" y1="0" x2=".8" y2="1">
      <stop offset="0%" stop-color="#A08260"/><stop offset="100%" stop-color="#6B5540"/>
    </linearGradient>
    <linearGradient id="${g('mHead')}" x1=".25" y1="0" x2=".75" y2="1">
      <stop offset="0%" stop-color="#AE8F69"/><stop offset="100%" stop-color="#7C6449"/>
    </linearGradient>
    <linearGradient id="${g('mBelly')}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#DCC49A"/><stop offset="100%" stop-color="#B79E76"/>
    </linearGradient>
    <linearGradient id="${g('mLimb')}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#96795A"/><stop offset="100%" stop-color="#6A5540"/>
    </linearGradient>
    <linearGradient id="${g('mRock')}" x1="0" y1="0" x2=".3" y2="1">
      <stop offset="0%" stop-color="#8A8C90"/><stop offset="100%" stop-color="#4E5054"/>
    </linearGradient>
  </defs>

  <ellipse class="m-glow" cx="110" cy="108" rx="92" ry="94" fill="url(#${g('mGlow')})"/>

  <!-- the rock, which is his branch -->
  <path d="M16 196 L34 168 Q110 156 190 170 L206 196 Z" fill="url(#${g('mRock')})"/>
  <path d="M34 168 Q110 156 190 170 Q110 166 34 168 Z" fill="#9FA1A5" opacity=".55"/>
  <path d="M52 196 L62 172 L74 196 Z" fill="#000" opacity=".08"/>
  <path d="M150 196 L162 174 L172 196 Z" fill="#000" opacity=".08"/>

  <g class="m-float">
    <!-- short thick tail, curled out behind him -->
    <g class="m-tail">
      <path d="M132 154 Q160 152 168 168 Q170 178 160 178 Q156 164 130 164 Z" fill="url(#${g('mBody')})"/>
      <path d="M160 168 Q170 170 166 179 Q158 178 158 170 Z" fill="#4A3B2C"/>
    </g>

    <!-- hind feet planted on the rock -->
    <ellipse cx="90" cy="167" rx="13" ry="7" fill="#6A5540"/>
    <ellipse cx="130" cy="167" rx="13" ry="7" fill="#6A5540"/>

    <!-- the sitting-up body -->
    <ellipse cx="110" cy="126" rx="38" ry="44" fill="url(#${g('mBody')})"/>
    <ellipse cx="110" cy="133" rx="25" ry="34" fill="url(#${g('mBelly')})"/>

    <!-- forepaws held at the chest, which is how a marmot sits -->
    <ellipse class="m-limbL" cx="88" cy="130" rx="11" ry="18" fill="url(#${g('mLimb')})"/>
    <ellipse class="m-limbR" cx="132" cy="130" rx="11" ry="18" fill="url(#${g('mLimb')})"/>
    <path d="M84 141 l3 6 M88 142 l2 6 M92 141 l1 6" stroke="#54432F" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    <path d="M128 141 l-1 6 M132 142 l-2 6 M136 141 l-3 6" stroke="#54432F" stroke-width="1.8" stroke-linecap="round" fill="none"/>

    <g class="m-head">
      <!-- small round ears, low on the skull -->
      <ellipse cx="86" cy="52" rx="9" ry="8" fill="#6E5942"/>
      <ellipse cx="134" cy="52" rx="9" ry="8" fill="#6E5942"/>
      <ellipse cx="86" cy="53" rx="4.6" ry="4" fill="#4A3B2C"/>
      <ellipse cx="134" cy="53" rx="4.6" ry="4" fill="#4A3B2C"/>

      <ellipse cx="110" cy="70" rx="34" ry="31" fill="url(#${g('mHead')})"/>
      <!-- pale cheeks and a blunt muzzle -->
      <ellipse cx="110" cy="84" rx="22" ry="16" fill="#CDB289"/>
      <ellipse cx="110" cy="60" rx="26" ry="14" fill="#B99973" opacity=".45"/>

      <circle cx="97" cy="66" r="7.6" fill="#F2E9D9"/>
      <circle cx="123" cy="66" r="7.6" fill="#F2E9D9"/>
      <circle cx="98" cy="67" r="4.6" fill="#14100E"/>
      <circle cx="124" cy="67" r="4.6" fill="#14100E"/>
      <circle cx="99.8" cy="64.8" r="1.8" fill="#FFFFFF"/>
      <circle cx="125.8" cy="64.8" r="1.8" fill="#FFFFFF"/>
      <rect class="lid" x="88.8" y="57.8" width="16.4" height="16.6" rx="8.2" fill="#7C6449"/>
      <rect class="lid" x="114.8" y="57.8" width="16.4" height="16.6" rx="8.2" fill="#7C6449"/>

      <!-- nose, then the mouth that opens for the whistle -->
      <path d="M104 79 Q110 75.5 116 79 Q113 83 110 83 Q107 83 104 79 Z" fill="#3A2C24"/>
      <path d="M110 83 v4" stroke="#7A6249" stroke-width="1.6" stroke-linecap="round"/>
      <path class="m-mouth" d="M101 88 Q110 84 119 88 Q110 98 101 88 Z" fill="#5C4736"/>
      <!-- the two front teeth, which a marmot is mostly made of -->
      <rect x="106.4" y="88" width="3.1" height="5.4" rx="1.1" fill="#F0E6D2"/>
      <rect x="110.5" y="88" width="3.1" height="5.4" rx="1.1" fill="#F0E6D2"/>

      <g class="zzz">
        <text x="150" y="44" font-size="15" font-weight="700" fill="#A99C8E">z</text>
        <text x="162" y="32" font-size="11" font-weight="700" fill="#6E635A">z</text>
      </g>
    </g>
  </g>
</svg>`;
}

const MUNGG_MINI = `
<svg class="mini-momo" viewBox="0 0 60 60" aria-hidden="true">
  <path d="M36 40 Q46 39 48 46 Q48 50 44 50 Q43 43 35 43 Z" fill="#6B5540"/>
  <ellipse cx="30" cy="38" rx="13" ry="15" fill="#8A6F52"/>
  <ellipse cx="30" cy="41" rx="8" ry="11" fill="#C4A87E"/>
  <ellipse cx="22" cy="40" rx="4" ry="6" fill="#6A5540"/>
  <ellipse cx="38" cy="40" rx="4" ry="6" fill="#6A5540"/>
  <ellipse cx="22" cy="13" rx="3.6" ry="3.2" fill="#6E5942"/>
  <ellipse cx="38" cy="13" rx="3.6" ry="3.2" fill="#6E5942"/>
  <ellipse cx="30" cy="19" rx="12" ry="11" fill="#A68863"/>
  <ellipse cx="30" cy="24" rx="8" ry="6" fill="#CDB289"/>
  <circle cx="25" cy="17" r="2.8" fill="#F2E9D9"/><circle cx="35" cy="17" r="2.8" fill="#F2E9D9"/>
  <circle cx="25.5" cy="17.5" r="1.6" fill="#14100E"/><circle cx="35.5" cy="17.5" r="1.6" fill="#14100E"/>
  <path d="M27 22 Q30 20 33 22 Q31 25 30 25 Q29 25 27 22 Z" fill="#3A2C24"/>
  <rect x="28.6" y="26" width="1.4" height="3" rx=".6" fill="#F0E6D2"/>
  <rect x="30.4" y="26" width="1.4" height="3" rx=".6" fill="#F0E6D2"/>
</svg>`;

// ── Blüemli, the Braunvieh ──────────────────────────────────
// Blüemli is a real traditional Swiss cow name, the -li being the diminutive
// that defines the dialect, and it is the sort of thing actually painted on a
// bell strap.
//
// She is a Braunvieh, which is the breed of central Switzerland — warm grey
// brown with a cream ring round the muzzle — rather than the black and white
// Holstein that people abroad picture. Getting the breed right is the same
// discipline as getting the Spanish right.
//
// The bell is the reason she is here. Momo's whole idle is a racket-tipped
// tail swinging like a pendulum, and a bell on a strap IS that motion, except
// a bell is meant to swing. It inherits the best mechanical idea in the app
// for nothing. Everything else is ordinary cow: she chews her cud without
// stopping, her ears flick independently, and she looks at you.
//
// Drawn head-on, because the perch is a tall narrow box and a cow in profile
// will not fit in it. Head-on is also the view that reads as a cow at forty
// pixels: horns and ears spreading wide at the top, a long head narrowing
// through the cheek, and the pale nose pad at the bottom.
//
// The proportions are the thing. A cow's head is tall, roughly half skull and
// half muzzle, and every earlier attempt here failed because it was square.
function braunviehSvg(uid) {
  const g = (name) => `${name}-${uid}`;
  return `
<svg class="momo-svg" viewBox="0 0 220 214" aria-hidden="true">
  <defs>
    <radialGradient id="${g('mGlow')}" cx="50%" cy="46%" r="50%">
      <stop offset="0%" stop-color="#E8A33D" stop-opacity=".55"/>
      <stop offset="55%" stop-color="#E8A33D" stop-opacity=".16"/>
      <stop offset="100%" stop-color="#E8A33D" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${g('mNeck')}" x1=".3" y1="0" x2=".7" y2="1">
      <stop offset="0%" stop-color="#7E6647"/><stop offset="100%" stop-color="#4F3F2C"/>
    </linearGradient>
    <linearGradient id="${g('mHead')}" x1=".22" y1=".05" x2=".78" y2="1">
      <stop offset="0%" stop-color="#B49868"/><stop offset="52%" stop-color="#9C8156"/>
      <stop offset="100%" stop-color="#725B3D"/>
    </linearGradient>
    <linearGradient id="${g('mRing')}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F3E9D3"/><stop offset="100%" stop-color="#D3C1A1"/>
    </linearGradient>
    <linearGradient id="${g('mPad')}" x1=".3" y1="0" x2=".7" y2="1">
      <stop offset="0%" stop-color="#B9997F"/><stop offset="100%" stop-color="#8D7259"/>
    </linearGradient>
    <linearGradient id="${g('mEar')}" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#8A7050"/><stop offset="100%" stop-color="#5E4A34"/>
    </linearGradient>
    <linearGradient id="${g('mHorn')}" x1=".1" y1="0" x2=".9" y2="1">
      <stop offset="0%" stop-color="#F4EAD1"/><stop offset="100%" stop-color="#AE9C79"/>
    </linearGradient>
    <linearGradient id="${g('mBell')}" x1=".1" y1="0" x2=".9" y2="1">
      <stop offset="0%" stop-color="#F7DC8A"/><stop offset="38%" stop-color="#D2A034"/>
      <stop offset="100%" stop-color="#77540F"/>
    </linearGradient>
  </defs>

  <ellipse class="m-glow" cx="110" cy="100" rx="96" ry="98" fill="url(#${g('mGlow')})"/>

  <g class="m-float">
    <!-- neck, running out of the bottom of the frame -->
    <path d="M78 132 L142 132 L164 214 L56 214 Z" fill="url(#${g('mNeck')})"/>
    <path d="M78 132 L142 132 L146 152 L74 152 Z" fill="#000" opacity=".16"/>

    <!-- The collar is static: it is buckled round her neck and does not swing.
         Sagging under the weight is what makes it read as leather. -->
    <path d="M64 140 Q110 163 156 140 L158 157 Q110 180 62 157 Z" fill="#8A3A2C"/>
    <path d="M64 140 Q110 163 156 140 L156.8 146 Q110 169 63 146 Z" fill="#AE4B37" opacity=".75"/>
    <path d="M69 149 Q110 170 151 149" stroke="#E8CFA0" stroke-width="1.8"
          stroke-dasharray="5 6" fill="none" opacity=".75" stroke-linecap="round"/>
    <circle cx="82" cy="151" r="2.4" fill="#D8B45E"/>
    <circle cx="138" cy="151" r="2.4" fill="#D8B45E"/>

    <!-- THE BELL. It hangs where the motmot's tail hangs and swings on the
         same keyframes, which is the whole reason a cow is the mascot. Only
         this group moves. -->
    <g class="m-tail">
      <path d="M103 170 a7 7 0 0 1 14 0" stroke="#9A7A1E" stroke-width="3.6" fill="none"/>
      <rect x="101" y="166" width="18" height="11" rx="3.5" fill="#A98520"/>
      <path d="M99 175 C95 183 89 192 85 198 Q110 207 135 198 C131 192 125 183 121 175 Z"
            fill="url(#${g('mBell')})"/>
      <path d="M101 178 C97 185 93 191 90 196" stroke="#FCEFC0" stroke-width="4.6"
            opacity=".42" fill="none" stroke-linecap="round"/>
      <path d="M121 175 C125 183 131 192 135 198 Q128 202 120 203 C123 193 123 183 121 175 Z"
            fill="#000" opacity=".18"/>
      <path d="M85 198 Q110 207 135 198 L136 203 Q110 212 84 203 Z" fill="#8E6413"/>
      <ellipse cx="110" cy="203" rx="26" ry="5" fill="#4A360A"/>
      <ellipse cx="110" cy="208" rx="5.4" ry="5.8" fill="#3A2C06"/>
    </g>

    <g class="m-head">
      <!-- horns, sweeping up and out with real thickness -->
      <path d="M84 50 C74 38 64 24 54 10 C68 18 84 32 94 46 Z" fill="url(#${g('mHorn')})"/>
      <path d="M136 50 C146 38 156 24 166 10 C152 18 136 32 126 46 Z" fill="url(#${g('mHorn')})"/>
      <path d="M84 50 C76 40 70 32 63 22 C71 32 80 42 88 49 Z" fill="#8E7D5E" opacity=".45"/>
      <path d="M136 50 C144 40 150 32 157 22 C149 32 140 42 132 49 Z" fill="#8E7D5E" opacity=".45"/>

      <!-- ears: out AND down, and nearly as long as the head is wide -->
      <path class="m-limbL" d="M66 78 C46 76 26 88 10 110 C34 118 58 106 70 92 Z" fill="url(#${g('mEar')})"/>
      <path class="m-limbR" d="M154 78 C174 76 194 88 210 110 C186 118 162 106 150 92 Z" fill="url(#${g('mEar')})"/>

      <!-- the head, ONE silhouette rather than a skull plus a blob -->
      <path d="M110 36 C138 36 160 52 160 86 C160 104 152 116 145 128
               C140 142 130 153 110 153 C90 153 80 142 75 128
               C68 116 60 104 60 86 C60 52 82 36 110 36 Z" fill="url(#${g('mHead')})"/>
      <!-- lighter cap and a darker right edge: this is what makes it round -->
      <path d="M110 36 C138 36 160 52 160 86 C150 62 132 48 110 46 C88 48 70 62 60 86
               C60 52 82 36 110 36 Z" fill="#C6AE80" opacity=".38"/>
      <path d="M148 68 C160 84 158 110 143 130 C152 112 154 88 148 68 Z" fill="#5E4A32" opacity=".34"/>
      <!-- the mealy brow band Braunvieh carry -->
      <ellipse cx="110" cy="63" rx="42" ry="13" fill="#CDB489" opacity=".4"/>
      <!-- curly forelock between the horns -->
      <path d="M88 47 C92 34 104 29 110 33 C116 29 128 34 132 47
               C126 56 118 60 110 60 C102 60 94 56 88 47 Z" fill="#54432E"/>
      <path d="M97 44 q5 -6 11 -4 M112 40 q6 -1 9 5" stroke="#6B573C" stroke-width="2.4"
            fill="none" stroke-linecap="round"/>

      <!-- eyes, out at the edges of the skull, each in the pale Braunvieh ring -->
      <ellipse cx="78" cy="85" rx="17" ry="14.5" fill="#DCC79E" opacity=".5"/>
      <ellipse cx="142" cy="85" rx="17" ry="14.5" fill="#DCC79E" opacity=".5"/>
      <ellipse cx="78" cy="85" rx="11.6" ry="10.6" fill="#F7F1E5"/>
      <ellipse cx="142" cy="85" rx="11.6" ry="10.6" fill="#F7F1E5"/>
      <ellipse cx="78" cy="80.5" rx="11.6" ry="4" fill="#000" opacity=".14"/>
      <ellipse cx="142" cy="80.5" rx="11.6" ry="4" fill="#000" opacity=".14"/>
      <ellipse cx="79" cy="86" rx="7.2" ry="7" fill="#1A120E"/>
      <ellipse cx="143" cy="86" rx="7.2" ry="7" fill="#1A120E"/>
      <circle cx="81.6" cy="83.2" r="2.5" fill="#FFFFFF"/>
      <circle cx="145.6" cy="83.2" r="2.5" fill="#FFFFFF"/>
      <circle cx="76.4" cy="89" r="1.2" fill="#FFFFFF" opacity=".55"/>
      <circle cx="140.4" cy="89" r="1.2" fill="#FFFFFF" opacity=".55"/>
      <path d="M65 74 l-6 -6 M77 69 l-1 -7 M89 73 l5 -6"
            stroke="#33261D" stroke-width="2.6" stroke-linecap="round" fill="none"/>
      <path d="M131 73 l-5 -6 M143 69 l1 -7 M155 74 l6 -6"
            stroke="#33261D" stroke-width="2.6" stroke-linecap="round" fill="none"/>
      <rect class="lid" x="66" y="74" width="24" height="22" rx="11" fill="#9C8156"/>
      <rect class="lid" x="130" y="74" width="24" height="22" rx="11" fill="#9C8156"/>

      <!-- the muzzle: pale ring, flared pad, philtrum, kidney nostrils -->
      <g class="m-mouth">
        <path d="M110 104 C133 104 146 113 146 126 C146 143 131 154 110 154
                 C89 154 74 143 74 126 C74 113 87 104 110 104 Z" fill="url(#${g('mRing')})"/>
        <path d="M110 110 C127 110 137 117 137 127 C137 140 125 148 110 148
                 C95 148 83 140 83 127 C83 117 93 110 110 110 Z" fill="url(#${g('mPad')})"/>
        <ellipse cx="99" cy="118" rx="11" ry="5" fill="#FFFFFF" opacity=".14"/>
        <path d="M98 122 C93 124 91 131 95 134 C100 136 104 132 103 127 C102 123 100 121 98 122 Z" fill="#4A382C"/>
        <path d="M122 122 C127 124 129 131 125 134 C120 136 116 132 117 127 C118 123 120 121 122 122 Z" fill="#4A382C"/>
        <path d="M110 126 L110 139" stroke="#7A6350" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M95 141 C102 147 118 147 125 141" stroke="#6E5947" stroke-width="2.8"
              fill="none" stroke-linecap="round"/>
      </g>

      <g class="zzz">
        <text x="170" y="40" font-size="15" font-weight="700" fill="#A99C8E">z</text>
        <text x="182" y="28" font-size="11" font-weight="700" fill="#6E635A">z</text>
      </g>
    </g>
  </g>
</svg>`;
}

const BLUEMLI_MINI = `
<svg class="mini-momo" viewBox="0 0 60 60" aria-hidden="true">
  <path d="M22 32 L38 32 L44 60 L16 60 Z" fill="#6B563C"/>
  <path d="M19 41 h22 l1 8 h-24 z" fill="#A8342C"/>
  <path d="M23 49 q-4 7 -6 10 q13 4 26 0 q-2 -3 -6 -10 z" fill="#D2A034"/>
  <ellipse cx="30" cy="58" rx="13" ry="2.6" fill="#8E6413"/>
  <path d="M22 13 C19 10 16 6 13 2 C17 5 22 9 25 12 Z" fill="#E8DCBE"/>
  <path d="M38 13 C41 10 44 6 47 2 C43 5 38 9 35 12 Z" fill="#E8DCBE"/>
  <path d="M18 20 C12 19 7 22 2 28 C9 31 16 27 20 23 Z" fill="#6B563C"/>
  <path d="M42 20 C48 19 53 22 58 28 C51 31 44 27 40 23 Z" fill="#6B563C"/>
  <path d="M30 8 C38 8 44 13 44 22 C44 28 41 33 39 36 C37 41 34 44 30 44
           C26 44 23 41 21 36 C19 33 16 28 16 22 C16 13 22 8 30 8 Z" fill="#9C8156"/>
  <path d="M30 8 C38 8 44 13 44 22 C41 15 36 11 30 11 C24 11 19 15 16 22 C16 13 22 8 30 8 Z"
        fill="#C6AE80" opacity=".45"/>
  <path d="M25 12 C26 8 29 7 30 9 C31 7 34 8 35 12 C33 15 31 16 30 16 C29 16 27 15 25 12 Z" fill="#54432E"/>
  <ellipse cx="23" cy="22" rx="4.4" ry="4" fill="#F7F1E5"/>
  <ellipse cx="37" cy="22" rx="4.4" ry="4" fill="#F7F1E5"/>
  <circle cx="23.4" cy="22.6" r="2.6" fill="#1A120E"/>
  <circle cx="37.4" cy="22.6" r="2.6" fill="#1A120E"/>
  <circle cx="24.4" cy="21.4" r="1" fill="#FFFFFF"/>
  <circle cx="38.4" cy="21.4" r="1" fill="#FFFFFF"/>
  <path d="M30 28 C37 28 41 31 41 35 C41 40 36 43 30 43 C24 43 19 40 19 35 C19 31 23 28 30 28 Z"
        fill="#EFE4CC"/>
  <path d="M30 31 C35 31 38 33 38 36 C38 39 34 41 30 41 C26 41 22 39 22 36 C22 33 25 31 30 31 Z"
        fill="#A98D74"/>
  <circle cx="26.4" cy="35" r="1.7" fill="#4A382C"/>
  <circle cx="33.6" cy="35" r="1.7" fill="#4A382C"/>
</svg>`;

// ── the registry ────────────────────────────────────────────
// `beats` are the idle animations this animal actually performs, and `leave`
// and `arrive` are how it gets off the perch and back. Both are CSS class
// names, styled per species in app.css.
export const CREATURES = {
  guardabarranco: {
    id: 'guardabarranco',
    name: 'Momo',
    svg: guardabarrancoSvg,
    mini: GUARDABARRANCO_MINI,
    beats: ['preen', 'flick', 'sidehop'],
    leave: 'leave',
    arrive: 'arrive',
    away: 'away',
  },
  mungg: {
    id: 'mungg',
    name: 'Mungg',
    svg: munggSvg,
    mini: MUNGG_MINI,
    // A marmot grooms its face, snaps upright to check for eagles, and shuffles
    // along the rock. No preening, because it has no feathers to preen.
    beats: ['groom', 'alert', 'shuffle'],
    leave: 'leave',
    arrive: 'arrive',
    away: 'away',
  },
  bluemli: {
    id: 'bluemli',
    name: 'Blüemli',
    svg: braunviehSvg,
    mini: BLUEMLI_MINI,
    // Chewing the cud never stops, the ears flick one at a time, and now and
    // then she tosses her head and the bell answers.
    beats: ['chew', 'earflick', 'headtoss'],
    leave: 'leave',
    arrive: 'arrive',
    away: 'away',
  },
};

export const DEFAULT_CREATURE = 'guardabarranco';

// Which animal belongs to which course. A pack can name its own with a
// `mascot` field; this is the fallback so a pack built before mascots existed
// still gets the right animal instead of the default one.
const BY_LANGUAGE = {
  'es-ni': 'guardabarranco',
  'de-ch': 'bluemli',
};

export function creatureFor(code, declared) {
  return CREATURES[declared] || CREATURES[BY_LANGUAGE[code]] || CREATURES[DEFAULT_CREATURE];
}
