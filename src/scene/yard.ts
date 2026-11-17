// Two useful things that stand in the meadow, and say what they have to say
// without a word.
//
// The washing line, down by the wall. Washing hangs on it for as long as the
// next couple of hours are dry, and is taken in, a piece at a time, when rain
// or snow is an hour or two off. If the washing is out, you will not need a coat.
//
// The storm lantern, on a post near you to the left. Its flame is as tall and
// as bright as the battery of this machine is full; under about a seventh it
// gutters; on charge it burns steady and tall. (Where a browser will not say
// how its battery is, the post stands empty.)
//
// They are few and simple, so they are drawn by a little program of their own.

import type { V3 } from './gl';
import { land } from './land';
import { COMMON, HEAD } from './shaders';

/**
 * The line stands on the brow of the meadow to the left, just beyond the wall, where from up here it
 * hangs against the sea and every piece on it can be told apart. It is a good way off, so (like the far
 * village) it is drawn larger than life: BIG times.
 */
const BIG = 1.8;
/** The line: its two posts, how high they stand, and how far it sags between them. */
const LINE = { a: [-46, -46.1] as [number, number], b: [-32.6, -47.7] as [number, number], high: 2.35 * BIG, sag: 0.2 * BIG };
/** How many pieces of washing there are. */
export const WASHING = 6;
/** The lantern's post, and where its flame is. */
const POST: [number, number] = [-5.0, -5.6];
const POST_FOOT = land(POST[0], POST[1]) - 0.05;
export const STORM_FLAME: V3 = [POST[0] + 0.36, POST_FOOT + 1.33, POST[1]];

const MAT = { wood: 0, line: 1, cloth: 2, iron: 3, glass: 4, peg: 5 };

/** Numbers kept for each corner: where it is, the way its face looks, how far it hangs below the line, which piece of washing it is (-1 if none), its material, and a tint. */
export const YARD_FLOATS = 10;

export function buildYard(): Float32Array {
  const out: number[] = [];
  const quad = (a: V3, b: V3, c: V3, d: V3, n: V3, mat: number, tint = 0, item = -1, hang: number[] = [0, 0, 0, 0]) => {
    const put = (p: V3, h: number) => out.push(p[0], p[1], p[2], n[0], n[1], n[2], h, item, mat, tint);
    put(a, hang[0]);
    put(b, hang[1]);
    put(c, hang[2]);
    put(a, hang[0]);
    put(c, hang[2]);
    put(d, hang[3]);
  };
  const box = (lo: V3, hi: V3, mat: number, tint = 0) => {
    const [x0, y0, z0] = lo;
    const [x1, y1, z1] = hi;
    quad([x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [0, 0, 1], mat, tint);
    quad([x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [0, 0, -1], mat, tint);
    quad([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [-1, 0, 0], mat, tint);
    quad([x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [1, 0, 0], mat, tint);
    quad([x0, y1, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [0, 1, 0], mat, tint);
    quad([x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [0, -1, 0], mat, tint);
  };

  // ---- the washing line: two posts, the line between them, and what hangs on it
  const [ax, az] = LINE.a;
  const [bx, bz] = LINE.b;
  const aFoot = land(ax, az) - 0.1;
  const bFoot = land(bx, bz) - 0.1;
  const aTop = aFoot + LINE.high;
  const bTop = bFoot + LINE.high;
  box([ax - 0.1, aFoot, az - 0.1], [ax + 0.1, aTop + 0.12, az + 0.1], MAT.wood);
  box([bx - 0.1, bFoot, bz - 0.1], [bx + 0.1, bTop + 0.12, bz + 0.1], MAT.wood);
  /** A point on the line, a fraction `t` of the way from the first post to the second. */
  const on = (t: number): V3 => [ax + (bx - ax) * t, aTop + (bTop - aTop) * t - LINE.sag * 4 * t * (1 - t), az + (bz - az) * t];
  const span = Math.hypot(bx - ax, bz - az);
  // The way the washing faces: square on to the line, and so more or less toward you.
  const face: V3 = [-(bz - az) / span, 0, (bx - ax) / span];
  for (let i = 0; i < 12; i++) {
    const p = on(i / 12);
    const q = on((i + 1) / 12);
    quad([p[0], p[1] - 0.03, p[2]], [p[0], p[1] + 0.03, p[2]], [q[0], q[1] + 0.03, q[2]], [q[0], q[1] - 0.03, q[2]], face, MAT.line);
  }
  /** A piece of cloth hanging from the line: from `t0` to `t1` along it, from `top` to `drop` below it. */
  const cloth = (item: number, t0: number, t1: number, topAt: number, dropTo: number, tint: number) => {
    const p = on(t0);
    const q = on(t1);
    const top = topAt * BIG;
    const drop = dropTo * BIG;
    quad([p[0], p[1] - drop, p[2]], [p[0], p[1] - top, p[2]], [q[0], q[1] - top, q[2]], [q[0], q[1] - drop, q[2]], face, MAT.cloth, tint, item, [drop, top, top, drop]);
  };
  const peg = (item: number, t: number) => {
    const p = on(t);
    quad([p[0] - 0.05, p[1] - 0.1, p[2] + 0.02], [p[0] - 0.05, p[1] + 0.1, p[2] + 0.02], [p[0] + 0.05, p[1] + 0.1, p[2] + 0.02], [p[0] + 0.05, p[1] - 0.1, p[2] + 0.02], face, MAT.peg, 0, item);
  };
  // (Along the line as fractions of its length; lengths in metres. Drawn a little larger than life, to be read from up here.)
  const w = (metres: number) => (metres * BIG) / span;
  // A white sheet.
  cloth(0, 0.06, 0.06 + w(1.9), 0, 1.5, 0);
  peg(0, 0.07);
  peg(0, 0.05 + w(1.9));
  // A red jersey: its body, and a sleeve out to either side.
  const j = 0.36;
  cloth(1, j, j + w(0.72), 0, 0.95, 1);
  cloth(1, j - w(0.3), j, 0.08, 0.72, 1);
  cloth(1, j + w(0.72), j + w(1.02), 0.08, 0.72, 1);
  peg(1, j + w(0.1));
  peg(1, j + w(0.62));
  // Blue trousers, by the waist: two legs.
  const t = 0.54;
  cloth(2, t, t + w(0.7), 0, 0.3, 2);
  cloth(2, t, t + w(0.32), 0.3, 1.35, 2);
  cloth(2, t + w(0.38), t + w(0.7), 0.3, 1.35, 2);
  peg(2, t + w(0.08));
  peg(2, t + w(0.62));
  // A striped towel.
  cloth(3, 0.68, 0.68 + w(0.75), 0, 1.15, 3);
  peg(3, 0.69);
  peg(3, 0.67 + w(0.75));
  // A pair of socks.
  cloth(4, 0.81, 0.81 + w(0.2), 0, 0.55, 4);
  cloth(4, 0.81 + w(0.3), 0.81 + w(0.5), 0, 0.55, 4);
  peg(4, 0.81 + w(0.1));
  peg(4, 0.81 + w(0.4));
  // A pillowcase.
  cloth(5, 0.89, 0.89 + w(0.7), 0, 0.8, 5);
  peg(5, 0.9);
  peg(5, 0.88 + w(0.7));

  // ---- the storm lantern: a post with an arm, and the lantern hanging from the arm
  const [px, pz] = POST;
  const f = POST_FOOT;
  box([px - 0.045, f, pz - 0.045], [px + 0.045, f + 1.85, pz + 0.045], MAT.wood);
  box([px - 0.045, f + 1.72, pz - 0.035], [px + 0.42, f + 1.79, pz + 0.035], MAT.wood);
  const lx = STORM_FLAME[0];
  const base = f + 1.19; // the foot of the lantern
  // The wire it hangs by, its cap, the font below, and the four wires that guard the glass.
  box([lx - 0.008, f + 1.6, pz - 0.008], [lx + 0.008, f + 1.72, pz + 0.008], MAT.iron);
  box([lx - 0.1, base + 0.36, pz - 0.1], [lx + 0.1, base + 0.41, pz + 0.1], MAT.iron);
  box([lx - 0.06, base + 0.41, pz - 0.06], [lx + 0.06, base + 0.45, pz + 0.06], MAT.iron);
  box([lx - 0.105, base, pz - 0.105], [lx + 0.105, base + 0.1, pz + 0.105], MAT.iron, 1);
  for (const [dx, dz] of [[-0.09, -0.09], [0.09, -0.09], [-0.09, 0.09], [0.09, 0.09]]) box([lx + dx - 0.008, base + 0.1, pz + dz - 0.008], [lx + dx + 0.008, base + 0.36, pz + dz + 0.008], MAT.iron);
  // The glass, with the flame inside it.
  box([lx - 0.075, base + 0.1, pz - 0.075], [lx + 0.075, base + 0.36, pz + 0.075], MAT.glass);
  return new Float32Array(out);
}

export const YARD_VERT = `${HEAD}
${COMMON}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in float aHang; // how far below the line this corner hangs, in metres
layout(location = 3) in float aItem; // which piece of washing it belongs to (-1 for none)
layout(location = 4) in float aMat;
layout(location = 5) in float aTint;
uniform float uOut;   // how many pieces of washing are on the line (the last of them perhaps only partly)
uniform float uYardT; // seconds
out vec3 vWorld;
out vec3 vNormal;
out float vHang;
flat out float vMat;
flat out float vTint;
flat out float vShow;
void main() {
  vec3 p = aPos;
  float show = 1.0;
  if (aItem > -0.5) {
    // A piece being pegged out is let down from the line; one being taken in is gathered up to it.
    show = clamp(uOut - aItem, 0.0, 1.0);
    float top = aPos.y + aHang;
    float hangs = aHang * show * show * (3.0 - 2.0 * show);
    // And what hangs, blows: out along the wind, more the lower it hangs and the harder it blows,
    // never quite still and never two pieces in time with each other.
    float flap = sin(uYardT * (1.7 + 3.2 * uWindAmt) + aItem * 2.3 + aHang * 1.9) * 0.5 + 0.5;
    float swing = hangs * (0.07 + 0.62 * uWindAmt) * (0.45 + 0.55 * flap);
    p.xz += uWindDir * swing;
    p.y = top - hangs * (1.0 - 0.22 * uWindAmt * (0.45 + 0.55 * flap));
  }
  vWorld = p;
  vNormal = aNormal;
  vHang = aHang;
  vMat = aMat;
  vTint = aTint;
  vShow = show;
  gl_Position = uViewProj * vec4(p, 1.0);
}
`;

export const YARD_FRAG = `${HEAD}
${COMMON}
in vec3 vWorld;
in vec3 vNormal;
in float vHang;
flat in float vMat;
flat in float vTint;
flat in float vShow;
out vec4 outColor;
uniform vec4 uStorm;    // the storm lantern: how full the battery is (0..1), whether it is on charge, whether there is a battery to tell of at all, and a number that jumps about for the guttering
uniform vec3 uStormAt;  // where its flame is
uniform float uYardT;

void main() {
  if (vShow < 0.04) discard;
  vec2 fc = gl_FragCoord.xy;
  float grain = bayer(fc);
  int m = int(vMat + 0.5);
  // (Cloth is seen from either side.)
  vec3 N = normalize(vNormal);
  if (dot(N, uCam - vWorld) < 0.0) N = -N;
  vec3 col;
  vec3 glow = vec3(0.0);
  if (m == 0) {
    col = texture(uNoise, vWorld.xy * vec2(3.0, 0.4)).r > 0.55 ? vec3(0.5, 0.39, 0.29) : vec3(0.38, 0.29, 0.22); // weathered posts
  } else if (m == 1) {
    col = vec3(0.72, 0.68, 0.58); // the line
  } else if (m == 5) {
    col = vec3(0.7, 0.55, 0.36); // wooden pegs
  } else if (m == 2) {
    int t = int(vTint + 0.5);
    col = t == 0 ? vec3(0.93, 0.93, 0.9) : t == 1 ? vec3(0.7, 0.2, 0.17) : t == 2 ? vec3(0.24, 0.36, 0.56) : t == 3 ? vec3(0.9, 0.86, 0.74) : t == 4 ? vec3(0.82, 0.8, 0.72) : vec3(0.86, 0.8, 0.62);
    // The towel is striped, the socks ringed, the jersey has a band across the chest.
    float hung = vHang / ${BIG.toFixed(2)}; // (in life-size metres: the line is drawn larger than life)
    if (t == 3 && fract(hung / 0.23) < 0.32) col = vec3(0.3, 0.46, 0.5);
    if (t == 4 && fract(hung / 0.16) < 0.3) col = vec3(0.62, 0.24, 0.2);
    if (t == 1 && hung > 0.3 && hung < 0.42) col = vec3(0.88, 0.84, 0.74);
    // Folds: a soft line of shade every hand's breadth across it.
    if (fract((vWorld.x * 0.9 + vWorld.z * 0.4) / 0.4 + hung * 0.3) < 0.14) col *= 0.88;
  } else if (m == 3) {
    col = vTint > 0.5 ? vec3(0.42, 0.3, 0.14) : vec3(0.12, 0.12, 0.14); // blackened iron; the font below is brass
  } else {
    // The glass, and the flame behind it. The flame is as tall as the battery is full; low, it gutters.
    if (uStorm.z < 0.5) discard;
    float full = clamp(uStorm.x, 0.0, 1.0);
    bool low = full < 0.15 && uStorm.y < 0.5;
    float burns = low ? (uStorm.w > 0.72 ? 0.12 : 0.35 + 0.65 * uStorm.w) : uStorm.y > 0.5 ? 0.94 + 0.06 * sin(uYardT * 1.3) : 1.0;
    float tall = (0.035 + 0.15 * full) * (low ? 0.55 + 0.6 * uStorm.w : 1.0);
    float across = abs(N.x) > 0.5 ? vWorld.z - uStormAt.z : vWorld.x - uStormAt.x;
    float up = vWorld.y - uStormAt.y;
    float lean = 0.012 * sin(uYardT * 2.1 + up * 30.0) * clamp(up / tall, 0.0, 1.0);
    float wide = 0.026 * sqrt(max(1.0 - up / tall, 0.0));
    bool flame = up > 0.0 && up < tall && abs(across - lean) < wide;
    float near = 1.0 - clamp(length(vec2(across, (up - tall * 0.4) * 0.8)) / (0.07 + 0.09 * full), 0.0, 1.0);
    float warm = floor(near * 3.0 + grain) / 3.0;
    col = mix(vec3(0.08, 0.14, 0.22), vec3(0.3, 0.36, 0.42), 0.3) * (1.0 - 0.7 * burns);
    glow = mix(vec3(0.5, 0.16, 0.03), vec3(1.0, 0.5, 0.13), warm) * burns * (0.35 + 0.65 * full);
    if (flame) glow = (up < tall * 0.45 && abs(across - lean) < wide * 0.5 ? vec3(1.0, 0.9, 0.62) : vec3(1.0, 0.66, 0.26)) * (0.6 + 0.4 * burns);
    // (The wick, and the oil that is left, low in the glass.)
    if (up < 0.0 && abs(across) < 0.012) col = vec3(0.2, 0.18, 0.15);
  }
  float amount = sunShade(vWorld.xz) * (0.2 + 0.8 * smoothstep(-0.2, 0.7, dot(N, uLightDir)));
  col = lit(col, clamp(floor(amount * 6.0 + grain) / 6.0, 0.0, 1.0), N, vWorld, grain) * (1.0 - 0.12 * uWet) + glow;
  outColor = vec4(mix(col, uFogCol, stepped(fogAmount(vWorld), 28.0, fc)), IS_OBJECT);
}
`;
