// The calendar dresses the village. All of it follows the date alone, so the
// same day always looks the same:
//
//   - From the first of December to Twelfth Night, from dusk until one in the
//     morning, small warm lights are strung along the eaves and gables, a star
//     is lit on the church, and a wreath hangs by the nearest door.
//   - On flag day (25 April) and at Ólavsøka (28 and 29 July) the Faroese flag,
//     Merkið, flies at the nearest houses and at the church from sunrise to
//     sunset, streaming in the real wind and hanging in a calm.
//   - On the night of the 23rd of June, St John's Eve, a bonfire burns on the
//     far shore across the water.
//
// It is drawn with the kite's brush: plain coloured corners, worked out here.
// A colour with 2 added to it is a light: it is drawn as bright as it is,
// whatever the hour.

import type { V3 } from './scene/gl';
import { CHURCH, EYE, HOUSE_SHAPES, land } from './scene/land';

interface Drawn {
  tris: number[];
  lines: number[];
}

interface Now {
  /** How dark it is, 0 (day) to 1 (night), as the lamps reckon it. */
  lamp: number;
  sunUp: boolean;
  /** The wind as it travels in the scene, and its strength 0..1. */
  windX: number;
  windZ: number;
  wind: number;
  /** The page's clock, in milliseconds. */
  time: number;
}

type Shape = (typeof HOUSE_SHAPES)[number];

const glow = (c: V3, k = 1): V3 => [c[0] * k + 2, c[1] * k + 2, c[2] * k + 2];
const AMBER: V3 = [1.0, 0.56, 0.16];
const DEEP_RED: V3 = [0.95, 0.17, 0.1];
const GREEN: V3 = [0.2, 0.72, 0.3];
const WHITE: V3 = [0.95, 0.95, 0.94];
const RED: V3 = [0.83, 0.13, 0.16];
const BLUE: V3 = [0.02, 0.36, 0.72];

const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const UP: V3 = [0, 1, 0];

/** A place on a house, given along it, up, and across it. */
const on = (h: { x: number; z: number; yaw: number }, along: number, y: number, across: number): V3 => [
  h.x + along * Math.cos(h.yaw) + across * Math.sin(h.yaw),
  y,
  h.z - along * Math.sin(h.yaw) + across * Math.cos(h.yaw),
];

/** A small mark facing you: a light, or a berry. */
function dot(into: Drawn, at: V3, size: number, col: V3): void {
  const side = unit(cross([EYE[0] - at[0], 0, EYE[2] - at[2]], UP));
  into.tris.push(...add(at, side, -size), ...col, ...add(at, side, size), ...col, ...add(at, UP, size * 1.7), ...col);
}

// ---- December --------------------------------------------------------------------

/** Where every light hangs, worked out once: its place, its size and which colour it is. */
const strung: { at: V3; size: number; col: V3 }[] = [];
function string(h: Shape): void {
  const far = h.z < -200; // the far village is drawn larger than life, and so are its lights
  const gap = far ? 2.3 : 0.85;
  const size = far ? 0.62 : 0.17;
  // (The turf roofs overhang their walls: the string runs along the edge of the roof, not under it.)
  const out = far ? 1.3 : 0.8;
  let n = strung.length;
  const hang = (at: V3) => {
    strung.push({ at, size, col: n % 7 === 3 ? GREEN : n % 5 === 2 ? DEEP_RED : AMBER });
    n++;
  };
  // Along both eaves, and up the rake of each gable to the ridge.
  for (const side of [1, -1]) {
    for (let a = -h.L; a <= h.L + 0.01; a += gap) hang(on(h, a, h.eave - 0.22, side * (h.W + out)));
  }
  for (const end of [1, -1]) {
    const steps = Math.max(2, Math.round(Math.hypot(h.W, h.top - h.eave) / gap));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      for (const side of [1, -1]) hang(on(h, end * (h.L + out), h.eave + (h.top - h.eave) * t, side * h.W * (1 - t)));
    }
    hang(on(h, end * (h.L + out), h.top + 0.1, 0));
  }
}
for (const h of HOUSE_SHAPES) string(h);

function december(into: Drawn, lit: number, time: number): void {
  // They do not blink; each only wavers a very little, on its own slow beat.
  const beat = Math.floor(time / 500);
  strung.forEach((l, i) => {
    const waver = 0.9 + 0.1 * Math.sin(beat * 0.7 + i * 2.4);
    dot(into, l.at, l.size, glow(l.col, lit * waver));
  });
  // The star on the church: on the face of the bell turret that looks toward you.
  const star = on(CHURCH, CHURCH.L - 2.3, CHURCH.top + 1.2, 2.1);
  const side = unit(cross([EYE[0] - star[0], 0, EYE[2] - star[2]], UP));
  const c = glow([1.0, 0.74, 0.34], lit);
  const r = 2.3;
  into.tris.push(...add(star, UP, r), ...c, ...add(add(star, side, -r * 0.87), UP, -r * 0.5), ...c, ...add(add(star, side, r * 0.87), UP, -r * 0.5), ...c);
  into.tris.push(...add(star, UP, -r), ...c, ...add(add(star, side, r * 0.87), UP, r * 0.5), ...c, ...add(add(star, side, -r * 0.87), UP, r * 0.5), ...c);
}

/** The wreath by the nearest door: a ring of green with red berries in it. (It hangs there all day.) */
function wreath(into: Drawn): void {
  const h = HOUSE_SHAPES[0];
  const centre = on(h, -h.L * 0.38 + 1.25, h.floor + 1.55, h.W + 0.12);
  const along: V3 = [Math.cos(h.yaw), 0, -Math.sin(h.yaw)];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const at = add(add(centre, along, Math.cos(a) * 0.3), UP, Math.sin(a) * 0.3);
    const col: V3 = i % 4 === 1 ? [0.75, 0.12, 0.1] : [0.12, 0.34, 0.14];
    into.tris.push(...add(at, along, -0.13), ...col, ...add(at, along, 0.13), ...col, ...add(at, UP, 0.2), ...col);
  }
}

// ---- flag days --------------------------------------------------------------------

/** How the flag is cut: its stripes along it (of 22) and down it (of 16). 0 white, 1 blue, 2 red. */
const ALONG: [number, number][] = [[0, 0], [6, 1], [7, 2], [9, 1], [10, 0], [14, 0], [18, 0], [22, 0]];
const DOWN: [number, number][] = [[0, 0], [6, 1], [7, 2], [9, 1], [10, 0], [16, 0]];
const CLOTH = [WHITE, BLUE, RED];

function flag(into: Drawn, foot: V3, tall: number, wide: number, now: Now): void {
  const top = add(foot, UP, tall);
  // The pole: white, and thick enough to be seen.
  const toYou = unit(cross([EYE[0] - foot[0], 0, EYE[2] - foot[2]], UP));
  const half = wide * 0.022;
  into.tris.push(...add(foot, toYou, -half), ...WHITE, ...add(foot, toYou, half), ...WHITE, ...add(top, toYou, half), ...WHITE);
  into.tris.push(...add(foot, toYou, -half), ...WHITE, ...add(top, toYou, half), ...WHITE, ...add(top, toYou, -half), ...WHITE);

  const high = (wide * 16) / 22;
  const blows = now.wind > 0.01 ? unit([now.windX, 0, now.windZ]) : ([1, 0, 0] as V3);
  const aside = cross(blows, UP);
  // In a calm it hangs down the pole; the harder it blows the straighter it streams.
  const streams = Math.max(0, Math.min(1, (now.wind - 0.03) / 0.28));
  const t = (Math.floor((now.time / 1000) * 12) / 12) * (3 + 9 * now.wind);
  const at = (u: number, v: number): V3 => {
    const out = u * wide;
    const ripple = Math.sin(u * 7.5 - t + v * 1.4) * high * 0.13 * u * (0.25 + 0.75 * streams);
    const p = add(top, UP, -v * high - out * (1 - streams) * 0.92 - u * u * high * 0.22 * streams);
    return add(add(p, blows, out * (0.12 + 0.88 * streams)), aside, ripple);
  };
  for (let i = 0; i + 1 < ALONG.length; i++) {
    for (let j = 0; j + 1 < DOWN.length; j++) {
      const a = ALONG[i][1];
      const d = DOWN[j][1];
      const col = CLOTH[a === 2 || d === 2 ? 2 : a === 1 || d === 1 ? 1 : 0];
      const [u0, u1, v0, v1] = [ALONG[i][0] / 22, ALONG[i + 1][0] / 22, DOWN[j][0] / 16, DOWN[j + 1][0] / 16];
      const [p, q, r, s] = [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
      // (The far end of the cloth is a touch darker, in its own folds.)
      const shade = 1 - 0.14 * u0;
      const c: V3 = [col[0] * shade, col[1] * shade, col[2] * shade];
      into.tris.push(...p, ...c, ...q, ...c, ...r, ...c, ...p, ...c, ...r, ...c, ...s, ...c);
    }
  }
}

function flags(into: Drawn, now: Now): void {
  for (const h of HOUSE_SHAPES.slice(0, 2)) {
    const foot = on(h, h.L + 1.6, 0, h.W + 1.2);
    foot[1] = land(foot[0], foot[2]);
    flag(into, foot, 7, 2.9, now);
  }
  const foot = on(CHURCH, -CHURCH.L - 4, 0, CHURCH.W + 3);
  foot[1] = land(foot[0], foot[2]);
  flag(into, foot, 20, 11, now);
}

// ---- midsummer night ----------------------------------------------------------------

/** The far shore: the low near tip of the long island across the fjord. */
const SHORE_FIRE: V3 = (() => {
  for (let x = -640; x > -1200; x -= 6) if (land(x, -1880) > 1.5) return [x - 8, land(x - 8, -1880), -1880] as V3;
  return [-760, 4, -1880] as V3;
})();

function bonfire(into: Drawn, lit: number, time: number): void {
  // Stepped six times a second: three tongues that take turns to stand tallest.
  const beat = Math.floor(time / 166);
  const toYou = unit(cross([EYE[0] - SHORE_FIRE[0], 0, EYE[2] - SHORE_FIRE[2]], UP));
  for (let k = 0; k < 3; k++) {
    const tall = (22 + 15 * Math.abs(Math.sin(beat * 1.3 + k * 2.1))) * (k === 1 ? 1.25 : 0.85);
    const base = add(SHORE_FIRE, toYou, (k - 1) * 10);
    const c = glow(k === 1 ? [1.0, 0.62, 0.2] : [1.0, 0.36, 0.1], lit);
    into.tris.push(...add(base, toYou, -8), ...c, ...add(base, toYou, 8), ...c, ...add(base, UP, tall), ...c);
  }
  // Its light on the water, in broken dashes toward you.
  const toward = unit([EYE[0] - SHORE_FIRE[0], 0, EYE[2] - SHORE_FIRE[2]]);
  for (let k = 0; k < 4; k++) {
    if ((beat + k) % 3 === 0) continue;
    const from = add([SHORE_FIRE[0], 0.2, SHORE_FIRE[2]], toward, 26 + k * 34);
    const to = add(from, toward, 20);
    const c = glow([1.0, 0.45, 0.14], lit * (0.7 - 0.14 * k));
    const w = 9 - 1.5 * k;
    into.tris.push(...add(from, toYou, -w), ...c, ...add(from, toYou, w), ...c, ...add(to, toYou, w), ...c, ...add(from, toYou, -w), ...c, ...add(to, toYou, w), ...c, ...add(to, toYou, -w), ...c);
  }
}

// ---- the days themselves ----------------------------------------------------------

/** What the date holds, by the clock given. */
export function dayHolds(ms: number): { december: boolean; evening: boolean; flag: boolean; midsummer: boolean } {
  const d = new Date(ms);
  const month = d.getMonth();
  const day = d.getDate();
  const hour = d.getHours() + d.getMinutes() / 60;
  return {
    december: month === 11 || (month === 0 && day <= 6),
    // (The small hours belong to the evening before.)
    evening: hour >= 12 || hour < 1,
    flag: (month === 3 && day === 25) || (month === 6 && (day === 28 || day === 29)),
    midsummer: month === 5 && ((day === 23 && hour >= 18) || (day === 24 && hour < 6)),
  };
}

/** Add to what is drawn whatever the day calls for. */
export function dressFor(into: Drawn, ms: number, now: Now): void {
  const holds = dayHolds(ms);
  if (holds.december) {
    wreath(into);
    const lit = holds.evening ? Math.max(0, Math.min(1, (now.lamp - 0.25) / 0.4)) : 0;
    if (lit > 0.02) december(into, lit, now.time);
  }
  if (holds.flag && now.sunUp) flags(into, now);
  if (holds.midsummer && now.lamp > 0.15) bonfire(into, Math.min(1, now.lamp * 1.6), now.time);
}
