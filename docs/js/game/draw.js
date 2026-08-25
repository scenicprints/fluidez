// Drawing Granada: the tile art, the people and the traffic.
//
// The city is 1089 x 885 tiles, which is a seventeen-thousand-pixel canvas —
// past what a phone browser will allocate and well past what it should. So the
// map is painted in chunks of 24 tiles, each one drawn the first time you see
// it and kept until the cache is full.

import {
  TS, GROUND, COBBLE, GRASS, TREE, WATER, SHORE, ROOF, WALL, DOOR, PLAZA,
  FOUNT, AWNING, TABLE, KERB, TOWER, SAND, PATIO, PALM, ASPHALT, DIRT, SCRUB,
  PITCH, GRAVE, CHURCH, CWALL, WALLTOP, KINDS,
} from './world.js';

const CH = 24;
const CAP = 110;

export function createPainter(world) {
  const { W, H, grid, tint, at, FACES, ROOFS } = world;
  const CHX = Math.ceil(W / CH), CHY = Math.ceil(H / CH);
  const chunks = new Map();

  function paintChunk(g, tx0, ty0) {
    const n = (x, y, s) => ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 + 1) % 1 * s;
    for (let dy = 0; dy < CH; dy++) for (let dx = 0; dx < CH; dx++) {
      const x = tx0 + dx, y = ty0 + dy;
      if (x >= W || y >= H) continue;
      const t = grid[y * W + x], X = dx * TS, Y = dy * TS, c = FACES[tint[y * W + x]];
      switch (t) {
        case WATER:
          g.fillStyle = '#2B6C86'; g.fillRect(X, Y, TS, TS);
          g.fillStyle = '#3E8AA6'; g.fillRect(X, Y + ((x + y) % 3) * 5, TS, 2); break;
        case SAND: case SHORE:
          g.fillStyle = '#C2A97C'; g.fillRect(X, Y, TS, TS);
          g.fillStyle = '#B39C71'; g.fillRect(X + ((x * 5) % 12), Y + ((y * 7) % 12), 3, 2); break;
        case GRASS:
          g.fillStyle = '#5F8A4A'; g.fillRect(X, Y, TS, TS);
          g.fillStyle = '#6D9954'; g.fillRect(X + 2 + n(x, y, 8), Y + 3 + n(y, x, 8), 3, 2); break;
        case SCRUB:
          g.fillStyle = '#7A8C5C'; g.fillRect(X, Y, TS, TS);
          g.fillStyle = '#8B9C68'; g.fillRect(X + 1 + n(x, y, 10), Y + 2 + n(y, x, 10), 4, 2);
          g.fillStyle = '#6B7C4E'; g.fillRect(X + 3 + n(y, x, 8), Y + 9 + n(x, y, 5), 3, 2); break;
        case PITCH:
          g.fillStyle = '#6A9852'; g.fillRect(X, Y, TS, TS);
          g.fillStyle = 'rgba(255,255,255,.07)'; if (x % 6 < 3) g.fillRect(X, Y, TS, TS); break;
        case GRAVE:
          g.fillStyle = '#8E9A76'; g.fillRect(X, Y, TS, TS);
          if ((x * 3 + y * 7) % 5 === 0) {
            g.fillStyle = '#D8D2C0'; g.fillRect(X + 5, Y + 6, 6, 8);
            g.fillStyle = '#B8B2A0'; g.fillRect(X + 5, Y + 6, 6, 2);
          } break;
        case TREE:
          g.fillStyle = '#5F8A4A'; g.fillRect(X, Y, TS, TS);
          g.fillStyle = '#6B4A2E'; g.fillRect(X + 7, Y + 9, 3, 6);
          g.fillStyle = '#3E6B33'; g.beginPath(); g.arc(X + 8, Y + 7, 6.5, 0, 7); g.fill();
          g.fillStyle = '#4C7F3E'; g.beginPath(); g.arc(X + 6, Y + 5, 4, 0, 7); g.fill(); break;
        case PLAZA:
          g.fillStyle = '#C9B896'; g.fillRect(X, Y, TS, TS);
          g.fillStyle = '#BCAA88'; g.fillRect(X, Y, TS, 1); g.fillRect(X, Y, 1, TS); break;
        case FOUNT:
          g.fillStyle = '#C9B896'; g.fillRect(X, Y, TS, TS);
          g.fillStyle = '#9E8D6E'; g.fillRect(X + 1, Y + 1, 14, 14);
          g.fillStyle = '#3E8AA6'; g.fillRect(X + 3, Y + 3, 10, 10); break;
        case KERB:
          g.fillStyle = '#9C8B72'; g.fillRect(X, Y, TS, TS);
          g.fillStyle = '#AD9C82'; g.fillRect(X, Y + 1, TS, 2); break;
        case ASPHALT:
          g.fillStyle = '#5E5A58'; g.fillRect(X, Y, TS, TS);
          g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(X, Y + 7, TS, 1); break;
        case DIRT:
          g.fillStyle = '#A6926F'; g.fillRect(X, Y, TS, TS);
          g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect(X, Y + 3, TS, 2); g.fillRect(X, Y + 11, TS, 2); break;
        case ROOF:
          g.fillStyle = ROOFS[(x * 3 + y * 5) % ROOFS.length]; g.fillRect(X, Y, TS, TS);
          g.fillStyle = 'rgba(0,0,0,.13)';
          for (let i = 0; i < TS; i += 4) g.fillRect(X, Y + i, TS, 1);
          if (at(x - 1, y) !== ROOF || tint[y * W + x - 1] !== tint[y * W + x]) {
            g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(X, Y, 1, TS);
          }
          if (at(x, y - 1) !== ROOF && at(x, y - 1) !== PATIO) {
            g.fillStyle = 'rgba(255,255,255,.13)'; g.fillRect(X, Y, TS, 2);
          }
          break;
        case CHURCH:
          g.fillStyle = '#8E4030'; g.fillRect(X, Y, TS, TS);
          g.fillStyle = 'rgba(0,0,0,.16)';
          for (let i = 0; i < TS; i += 3) g.fillRect(X, Y + i, TS, 1);
          if (at(x, y - 1) !== CHURCH) { g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(X, Y, TS, 2); }
          break;
        case PATIO:
          g.fillStyle = '#C9B896'; g.fillRect(X, Y, TS, TS);
          g.fillStyle = '#BCAA88'; g.fillRect(X, Y, TS, 1); g.fillRect(X, Y, 1, TS);
          g.fillStyle = 'rgba(0,0,0,.20)';
          if (at(x, y - 1) === ROOF) g.fillRect(X, Y, TS, 3);
          if (at(x - 1, y) === ROOF) g.fillRect(X, Y, 3, TS);
          if (at(x + 1, y) === ROOF) g.fillRect(X + TS - 3, Y, 3, TS);
          break;
        case PALM:
          g.fillStyle = '#C9B896'; g.fillRect(X, Y, TS, TS);
          g.fillStyle = '#6B4A2E'; g.fillRect(X + 7, Y + 8, 2, 7);
          g.fillStyle = '#3E6B33'; g.beginPath(); g.arc(X + 8, Y + 6, 5, 0, 7); g.fill();
          g.fillStyle = '#C4548F'; g.fillRect(X + 4, Y + 3, 2, 2); g.fillRect(X + 11, Y + 7, 2, 2); break;
        case TOWER:
          g.fillStyle = '#E3CFA3'; g.fillRect(X, Y, TS, TS);
          g.fillStyle = '#A8503A'; g.fillRect(X + 2, Y, 12, 4);
          g.fillStyle = '#8A7A63'; g.fillRect(X + 5, Y + 7, 6, 9); break;
        case WALL: case WALLTOP:
          g.fillStyle = c; g.fillRect(X, Y, TS, TS);
          g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(X, Y, TS, 3);
          g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(X + 3, Y + 6, 4, 6); g.fillRect(X + 9, Y + 6, 4, 6);
          g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(X, Y + TS - 2, TS, 2); break;
        case CWALL:
          g.fillStyle = '#E3CFA3'; g.fillRect(X, Y, TS, TS);
          g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(X, Y, TS, 3);
          g.fillStyle = 'rgba(0,0,0,.30)'; g.beginPath(); g.arc(X + 8, Y + 10, 4, Math.PI, 0); g.fill();
          g.fillRect(X + 4, Y + 10, 8, 6); break;
        case DOOR:
          g.fillStyle = c; g.fillRect(X, Y, TS, TS);
          g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(X, Y, TS, 3);
          g.fillStyle = '#5A3A24'; g.fillRect(X + 4, Y + 4, 8, 12);
          g.fillStyle = '#C9A24B'; g.fillRect(X + 10, Y + 10, 2, 2); break;
        case AWNING:
          g.fillStyle = '#8A7A63'; g.fillRect(X, Y, TS, TS);
          g.fillStyle = (x + y) % 2 ? '#C4685F' : '#E3CFA3'; g.fillRect(X, Y + 2, TS, 11);
          g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(X, Y + 13, TS, 3); break;
        case TABLE:
          g.fillStyle = '#8A7A63'; g.fillRect(X, Y, TS, TS);
          g.fillStyle = '#3E8E8A'; g.beginPath(); g.arc(X + 8, Y + 8, 5.5, 0, 7); g.fill();
          g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(X + 7, Y + 12, 2, 4); break;
        case COBBLE:
          g.fillStyle = '#8A7A63'; g.fillRect(X, Y, TS, TS);
          g.fillStyle = 'rgba(0,0,0,.09)';
          g.fillRect(X + ((y % 2) * 8), Y + 4, 7, 3); g.fillRect(X + ((y % 2) * 8) + 4, Y + 11, 7, 3); break;
        default:
          g.fillStyle = '#A6926F'; g.fillRect(X, Y, TS, TS);
          g.fillStyle = 'rgba(0,0,0,.05)'; g.fillRect(X + ((x * 7) % 11), Y + ((y * 5) % 12), 4, 2);
      }
    }
  }

  function chunk(cx, cy) {
    const key = cy * CHX + cx;
    let c = chunks.get(key);
    if (c) { chunks.delete(key); chunks.set(key, c); return c; }   // keep it warm
    c = document.createElement('canvas');
    c.width = CH * TS; c.height = CH * TS;
    paintChunk(c.getContext('2d'), cx * CH, cy * CH);
    chunks.set(key, c);
    if (chunks.size > CAP) chunks.delete(chunks.keys().next().value);
    return c;
  }

  function person(g, x, y, skin, shirt, dir, walk) {
    const sway = walk ? (Math.floor(walk / 8) % 2 ? 1 : -1) : 0;
    g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(x, y + 7, 6, 2.6, 0, 0, 7); g.fill();
    g.fillStyle = '#2E2A38'; g.fillRect(x - 4, y + 1, 3, 6 + (sway > 0 ? -1 : 0));
    g.fillRect(x + 1, y + 1, 3, 6 + (sway < 0 ? -1 : 0));
    g.fillStyle = shirt; g.fillRect(x - 5, y - 6, 10, 8);
    g.fillStyle = skin; g.fillRect(x - 5, y - 5, 2, 5); g.fillRect(x + 3, y - 5, 2, 5);
    g.fillRect(x - 4, y - 13, 8, 8);
    g.fillStyle = '#2A1D14'; g.fillRect(x - 5, y - 14, 10, 4);
    if (dir === 0) { g.fillStyle = '#1A1512'; g.fillRect(x - 3, y - 10, 2, 2); g.fillRect(x + 1, y - 10, 2, 2); }
    else if (dir === 2) { g.fillStyle = '#1A1512'; g.fillRect(x - 3, y - 10, 2, 2); }
    else if (dir === 3) { g.fillStyle = '#1A1512'; g.fillRect(x + 1, y - 10, 2, 2); }
  }

  function vehicle(g, v) {
    const k = v.kind;
    g.save(); g.translate(v.x, v.y); g.rotate(v.ang);
    g.fillStyle = 'rgba(0,0,0,.22)';
    g.fillRect(-k.l / 2 + 1, -k.w / 2 + 2, k.l, k.w);
    g.fillStyle = '#1E1A18';
    for (let i = 0; i < k.wheels; i += 2) {
      const wx = k.l / 2 - 3 - (i / 2) * (k.l - 7);
      g.fillRect(wx - 2, -k.w / 2 - 1, 4, 2); g.fillRect(wx - 2, k.w / 2 - 1, 4, 2);
    }
    g.fillStyle = k.body; g.fillRect(-k.l / 2, -k.w / 2, k.l, k.w);
    g.fillStyle = k.top;
    if (k.id === 'caponera' || k.id === 'coche') g.fillRect(-k.l / 2 + 2, -k.w / 2, k.l - 6, k.w);
    else if (k.id === 'bus') {
      g.fillRect(-k.l / 2 + 3, -k.w / 2 + 1, k.l - 6, k.w - 2);
      g.fillStyle = '#2B2B2B';
      for (let i = -k.l / 2 + 5; i < k.l / 2 - 4; i += 5) g.fillRect(i, -k.w / 2, 3, 1);
    } else g.fillRect(-k.l / 2 + 3, -k.w / 2 + 1, k.l * .45, k.w - 2);
    if (k.id === 'coche') {
      g.fillStyle = '#8A6A48'; g.fillRect(k.l / 2, -2, 9, 4);
      g.fillStyle = '#6B4A2E'; g.fillRect(k.l / 2 + 7, -2, 3, 4);
    }
    if (k.id === 'lancha') {
      g.fillStyle = k.body;
      g.beginPath(); g.moveTo(k.l / 2, -k.w / 2); g.lineTo(k.l / 2 + 7, 0);
      g.lineTo(k.l / 2, k.w / 2); g.closePath(); g.fill();
      g.fillStyle = '#2E2A38'; g.fillRect(-k.l / 2 - 4, -2, 5, 4);
      g.fillStyle = '#8A7A63';
      for (let i = -k.l / 2 + 4; i < k.l / 2 - 2; i += 6) g.fillRect(i, -k.w / 2 + 1, 2, k.w - 2);
    }
    g.fillStyle = 'rgba(255,255,255,.5)';
    g.fillRect(k.l / 2 - 3, -k.w / 2 + 1, 2, k.w - 2);
    g.restore();
    if (v.honk > 0) {
      g.fillStyle = 'rgba(232,163,61,.95)';
      g.beginPath(); g.roundRect(v.x - 13, v.y - 22, 26, 13, 4); g.fill();
      g.fillStyle = '#2B1A06'; g.font = 'bold 9px system-ui'; g.textAlign = 'center';
      g.fillText('¡pip!', v.x, v.y - 12); g.textAlign = 'left';
    }
  }

  function parked(g, n) {
    const k = KINDS.find((v) => v.id === n.vehicle) || KINDS[0];
    vehicle(g, { x: n.x * TS + 8, y: n.y * TS + 8, ang: n.ang || 0, kind: k, honk: 0 });
    if (n.driver) person(g, n.x * TS + 8, n.y * TS + 8 + (k.w / 2 + 7), n.skin, n.shirt, 0, 0);
  }

  /** One frame. Returns the viewport origin so the screen can place overlays. */
  function frame(ctx, t, VW, VH, SCALE) {
    const S = world.S;
    const cx = Math.max(VW / 2 / SCALE, Math.min(W * TS - VW / 2 / SCALE, S.px));
    const cy = Math.max(VH / 2 / SCALE, Math.min(H * TS - VH / 2 / SCALE, S.py));
    const ox = Math.round(cx - VW / 2 / SCALE), oy = Math.round(cy - VH / 2 / SCALE);

    ctx.fillStyle = '#6E5B45'; ctx.fillRect(0, 0, VW, VH);
    ctx.save(); ctx.scale(SCALE, SCALE); ctx.translate(-ox, -oy);

    const px0 = Math.max(0, (ox / (CH * TS)) | 0), py0 = Math.max(0, (oy / (CH * TS)) | 0);
    const px1 = Math.min(CHX - 1, ((ox + VW / SCALE) / (CH * TS)) | 0);
    const py1 = Math.min(CHY - 1, ((oy + VH / SCALE) / (CH * TS)) | 0);
    for (let cy2 = py0; cy2 <= py1; cy2++) for (let cx2 = px0; cx2 <= px1; cx2++)
      ctx.drawImage(chunk(cx2, cy2), cx2 * CH * TS, cy2 * CH * TS);

    for (const v of S.traffic) if (v.x !== undefined) vehicle(ctx, v);

    // The people just going somewhere. Drawn before the ones with something to
    // say, so a bubble is never hidden behind a passer-by's head.
    for (const w of S.walkers) {
      if (w.px === undefined) continue;
      if (Math.abs(w.px - S.px) > VW / SCALE / 2 + 30 ||
          Math.abs(w.py - S.py) > VH / SCALE / 2 + 30) continue;
      const c = Math.cos(w.ang), s2 = Math.sin(w.ang);
      const dir = Math.abs(c) > Math.abs(s2) ? (c > 0 ? 3 : 2) : (s2 > 0 ? 0 : 1);
      person(ctx, w.px, w.py, w.skin, w.shirt, w.sp ? dir : 0, w.sp ? w.step : 0);
    }

    // Only the ones you can see. There are 248 people in this city and drawing
    // all of them every frame to put 240 of them off screen would be the most
    // expensive thing the game does.
    const seen = world.people.filter((n) =>
      Math.abs(n.x * TS - S.px) < VW / SCALE / 2 + 40 &&
      Math.abs(n.y * TS - S.py) < VH / SCALE / 2 + 40);
    for (const n of seen) {
      if (n.vehicle) parked(ctx, n);
      else person(ctx, n.x * TS + 8, n.y * TS + 8, n.skin, n.shirt, 0, 0);
      const done = S.finished[n.id];
      const bob = Math.sin(t / 260) * 1.6;
      const mx = n.x * TS + 8, my = n.y * TS - (n.vehicle ? 20 : 15) + bob;
      if (n.crowd) {
        // A quieter mark than a mission: they always have something to say,
        // and a gold bubble over 126 heads would read as 126 quests.
        if (done) continue;
        ctx.fillStyle = 'rgba(233,226,212,.82)';
        ctx.beginPath(); ctx.roundRect(mx - 5, my - 4, 10, 8, 3); ctx.fill();
        ctx.beginPath(); ctx.moveTo(mx - 2, my + 3); ctx.lineTo(mx + 2, my + 3); ctx.lineTo(mx, my + 7); ctx.fill();
        ctx.fillStyle = '#5A4A38'; ctx.fillRect(mx - 2, my - 1, 4, 2);
        continue;
      }
      ctx.fillStyle = done ? '#1C5F50' : '#E8A33D';
      ctx.beginPath(); ctx.roundRect(mx - 7, my - 6, 14, 12, 3); ctx.fill();
      ctx.beginPath(); ctx.moveTo(mx - 3, my + 5); ctx.lineTo(mx + 2, my + 5); ctx.lineTo(mx, my + 9); ctx.fill();
      ctx.fillStyle = done ? '#34B396' : '#2B1A06';
      if (done) { ctx.fillRect(mx - 4, my - 1, 3, 4); ctx.fillRect(mx - 3, my + 1, 7, 2); }
      else { ctx.fillRect(mx - 1, my - 4, 2, 6); ctx.fillRect(mx - 1, my + 3, 2, 2); }
    }
    person(ctx, S.px, S.py, '#D8A87C', '#34B396', S.dir, S.moving ? S.step : 0);
    ctx.restore();
    return { ox, oy };
  }

  return { frame, chunk, person, vehicle };
}
