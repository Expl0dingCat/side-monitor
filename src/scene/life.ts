// The shapes of the things that come and go with the clock and the calendar:
// the fishing boat that goes out at dawn and comes home at dusk, and the
// puffins that are about from May to August. Where they are at any moment is
// worked out elsewhere (boat.ts, puffins.ts); this is only how they are built.

import type { V3 } from './gl';

/** What is needed of the builder that the rest of the place is made with (see PropBuilder in land.ts). */
export interface Builder {
  data: number[];
  place(x: number, y: number, z: number, yaw: number): void;
  quad(a: V3, b: V3, c: V3, d: V3, n: V3, mat: number, plain?: boolean): void;
  tri(a: V3, b: V3, c: V3, n: V3, mat: number): void;
  box(lo: V3, hi: V3, mat: number, top?: number): void;
  lump(c: V3, r: V3, mat: number, rough: number, seed: number, fine?: boolean, flatBase?: boolean): void;
}

/** The materials used here, by the names land.ts gives them. */
type Mats = Record<'redPaint' | 'white' | 'whitewash' | 'slate' | 'glass' | 'boards' | 'walnut' | 'bark' | 'ochre' | 'dark' | 'rock' | 'stone' | 'puffin', number>;

const count = (b: Builder) => b.data.length / 9;

// ---- the fishing boat ----------------------------------------------------------------

/**
 * Where the boat lies at anchor in the bay, and the way it points when nothing swings it:
 * broadside to the meadow and the beach, its bow to the left, toward the open sea.
 */
export const ANCHORAGE = { x: -100, z: -292, yaw: 3.48 };

/**
 * A small wooden fishing cutter, built at the origin with its bow toward +x and
 * the waterline at zero, so that it can be turned and moved. A red hull that
 * rises to the bow, a white rail, a wheelhouse aft with windows all round, a
 * mast and its crosstree, and a rust-brown riding sail on a short mizzen at
 * the stern, which is what keeps such a boat lying quietly at anchor.
 * (Larger than life, like the far village, so that it can be made out from the meadow.)
 */
export function buildBoat(b: Builder, M: Mats): void {
  b.place(0, 0, 0, 0);
  const K = 1.8;
  // Along the hull from stern to bow: how far along, half the breadth there, and the height of the rail.
  const ribs = ([
    [-5.5, 0.62, 1.42], [-4.8, 1.28, 1.26], [-3.3, 1.64, 1.1], [-1.2, 1.76, 1.02], [0.8, 1.72, 1.05],
    [2.6, 1.46, 1.2], [4.0, 1.02, 1.42], [5.0, 0.52, 1.66], [5.65, 0.07, 1.88],
  ] as V3[]).map(([x, half, rail]): V3 => [x * K, half * K, rail * K]);
  const keel = -1.6 * K; // deep enough that it never shows when the boat lifts to a swell
  const strake = 0.3 * K; // the white rail's depth
  const unit = (v: V3): V3 => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  for (let i = 0; i + 1 < ribs.length; i++) {
    const [x0, w0, r0] = ribs[i];
    const [x1, w1, r1] = ribs[i + 1];
    for (const side of [1, -1]) {
      // The planking leans out from the keel to the rail.
      const a: V3 = [x0, keel, side * w0 * 0.5];
      const c: V3 = [x1, keel, side * w1 * 0.5];
      const d: V3 = [x1, r1 - strake, side * w1];
      const e: V3 = [x0, r0 - strake, side * w0];
      const u: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const v: V3 = [e[0] - a[0], e[1] - a[1], e[2] - a[2]];
      let n = unit([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
      if (n[2] * side < 0) n = [-n[0], -n[1], -n[2]];
      b.quad(a, c, d, e, n, M.redPaint, true);
      b.quad(e, d, [x1, r1, side * w1], [x0, r0, side * w0], unit([n[0], 0, n[2]]), M.white, true);
    }
    // The deck, a little below the rail.
    b.quad([x0, r0 - strake, w0], [x1, r1 - strake, w1], [x1, r1 - strake, -w1], [x0, r0 - strake, -w0], [0, 1, 0], M.walnut, true);
  }
  // The flat of the stern.
  const [sx, sw, sr] = ribs[0];
  b.quad([sx, keel, sw * 0.5], [sx, keel, -sw * 0.5], [sx, sr - strake, -sw], [sx, sr - strake, sw], [-1, 0, 0], M.redPaint, true);
  b.quad([sx, sr - strake, sw], [sx, sr - strake, -sw], [sx, sr, -sw], [sx, sr, sw], [-1, 0, 0], M.white, true);

  // The wheelhouse, with a slate-dark roof that overhangs, glass on three sides and a stovepipe.
  const deck = 0.8 * K;
  const x0 = -3.4 * K;
  const x1 = -0.9 * K;
  const half = 1.02 * K;
  const roof = 3.05 * K;
  b.box([x0, deck, -half], [x1, roof, half], M.whitewash, M.slate);
  b.box([x0 - 0.14 * K, roof, -half - 0.12 * K], [x1 + 0.22 * K, roof + 0.16 * K, half + 0.12 * K], M.slate);
  const sill = 2.02 * K;
  const lintel = 2.72 * K;
  for (const side of [1, -1]) {
    const z = side * (half + 0.03);
    for (const [from, to] of [[x0 + 0.3 * K, x0 + 1.15 * K], [x0 + 1.35 * K, x1 - 0.25 * K]]) {
      b.quad([from, sill, z], [to, sill, z], [to, lintel, z], [from, lintel, z], [0, 0, side], M.glass, true);
    }
  }
  for (const [from, to] of [[-0.82, -0.3], [-0.22, 0.22], [0.3, 0.82]]) {
    b.quad([x1 + 0.03, sill, from * K], [x1 + 0.03, sill, to * K], [x1 + 0.03, lintel, to * K], [x1 + 0.03, lintel, from * K], [1, 0, 0], M.glass, true);
  }
  b.quad([x0 - 0.03, deck, -0.35 * K], [x0 - 0.03, deck, 0.35 * K], [x0 - 0.03, 2.6 * K, 0.35 * K], [x0 - 0.03, 2.6 * K, -0.35 * K], [-1, 0, 0], M.boards, true); // its door
  b.box([x0 + 0.25 * K, roof + 0.16 * K, 0.45 * K], [x0 + 0.55 * K, roof + 0.95 * K, 0.75 * K], M.dark);

  // The mast, stepped forward of the wheelhouse, with a crosstree and a lamp at its head.
  const mast = 1.5 * K;
  b.box([mast - 0.24 * K, deck, -0.24 * K], [mast + 0.24 * K, 7.0 * K, 0.24 * K], M.bark);
  b.box([mast - 0.18 * K, 5.3 * K, -0.85 * K], [mast + 0.18 * K, 5.55 * K, 0.85 * K], M.bark);
  b.box([mast - 0.27 * K, 7.0 * K, -0.27 * K], [mast + 0.27 * K, 7.5 * K, 0.27 * K], M.glass, M.boards);
  // A hatch, a winch and a heap of net floats on the foredeck.
  b.box([2.3 * K, 1.0 * K, -0.6 * K], [3.3 * K, 1.3 * K, 0.6 * K], M.boards, M.walnut);
  b.lump([0.3 * K, 1.12 * K, 0.85 * K], [0.5 * K, 0.34 * K, 0.42 * K], M.ochre, 0.2, 811, false, true);
  b.lump([0.2 * K, 1.1 * K, -0.9 * K], [0.36 * K, 0.3 * K, 0.34 * K], M.puffin, 0.2, 812, false, true);

  // The mizzen at the stern, and its little riding sail.
  const miz = -4.7 * K;
  b.box([miz - 0.2 * K, deck, -0.2 * K], [miz + 0.2 * K, 5.0 * K, 0.2 * K], M.bark);
  for (const z of [0.09, -0.09]) {
    b.tri([miz - 0.18 * K, 4.8 * K, z], [miz - 0.18 * K, 2.15 * K, z], [miz - 2.5 * K, 2.3 * K, z], [0, 0, Math.sign(z)], M.bark);
  }
}

// ---- puffins ------------------------------------------------------------------------

/**
 * A puffin, standing at the origin and facing +x, life size (it is drawn a
 * little larger): a black back, cap and collar, a white face and breast, the
 * great orange bill with its slate-blue root, and orange feet. Its head is
 * built after the rest so that it can turn by itself. Returns where the two
 * parts are among the builder's vertices, each as [first, how many].
 */
export function buildPuffin(b: Builder, M: Mats): { body: [number, number]; head: [number, number] } {
  b.place(0, 0, 0, 0);
  const first = count(b);
  // Its legs are set well back, which is why it stands so upright; its webbed feet turn out a little.
  for (const side of [1, -1]) {
    b.box([-0.022, 0, side * 0.03 - 0.011], [0.0, 0.065, side * 0.03 + 0.011], M.puffin);
    b.box([-0.02, 0, side * 0.034 - 0.024], [0.062, 0.013, side * 0.034 + 0.024], M.puffin);
  }
  b.lump([-0.024, 0.168, 0], [0.08, 0.118, 0.078], M.dark, 0.04, 701); // its back
  b.lump([0.024, 0.15, 0], [0.066, 0.106, 0.069], M.white, 0.03, 702); // breast and belly
  for (const side of [1, -1]) b.lump([-0.034, 0.158, side * 0.066], [0.072, 0.082, 0.022], M.dark, 0.04, 703, false); // a folded wing
  b.lump([-0.098, 0.078, 0], [0.052, 0.022, 0.04], M.dark, 0.03, 705, false); // tail
  b.lump([-0.002, 0.264, 0], [0.057, 0.034, 0.057], M.dark, 0.03, 706, false); // the black collar
  const middle = count(b);
  b.lump([0.008, 0.322, 0], [0.058, 0.05, 0.053], M.dark, 0.03, 707); // cap and nape
  for (const side of [1, -1]) {
    b.lump([0.03, 0.302, side * 0.03], [0.043, 0.041, 0.034], M.white, 0.02, 708, false); // its pale cheek
    b.lump([0.05, 0.314, side * 0.056], [0.011, 0.014, 0.008], M.dark, 0.0, 709, false); // and a small dark eye
  }
  // The bill: deep, and narrow from side to side.
  b.lump([0.079, 0.293, 0], [0.023, 0.042, 0.018], M.slate, 0.02, 710, false);
  b.lump([0.11, 0.285, 0], [0.037, 0.038, 0.015], M.puffin, 0.02, 711, false);
  return { body: [first, middle - first], head: [middle, count(b) - middle] };
}

/** The joint a puffin's head turns on: the middle of its neck. */
export const PUFFIN_NECK: V3 = [0.0, 0.27, 0];

/** The rocks put down for puffins to stand on, as [x, z, how far each reaches]: no grass grows on them. */
export const PERCH_ROCKS: [number, number, number][] = [];

/** A place where a puffin stands: its feet, the way it faces, how big it is drawn, and whether it is down by the beach. */
export interface Perch {
  x: number;
  y: number;
  z: number;
  yaw: number;
  size: number;
  beach: boolean;
}

/**
 * The places puffins stand, with the few rocks added for them to stand on. In
 * the meadow: two on a low mossy rock in the near grass to the right, one on
 * the little cairn beside the old stone, one on the worn turf at the path's
 * edge, and one far down on a coping stone of the wall. By the beach: two on
 * rocks at the water's edge, to the left. `ground` gives the height of the
 * land; `cairn` is the top of the cairn by the stone; `shore` turns a place on
 * the beach (metres ahead of you, metres to your right) into a place in the scene.
 */
export function buildPerches(
  b: Builder,
  M: Mats,
  ground: (x: number, z: number) => number,
  cairn: V3,
  shore: (ahead: number, aside: number) => [number, number],
): Perch[] {
  const perches: Perch[] = [];
  /** A rock, and a puffin standing on the highest point of it. */
  const rock = (x: number, z: number, r: V3, seed: number, yaw: number, size: number, beach: boolean, sink = 0.2) => {
    const from = b.data.length;
    b.place(x, ground(x, z) - sink * r[1], z, seed * 1.7);
    b.lump([0, 0.2 * r[1], 0], r, M.rock, 0.2, seed, r[0] > 0.5, true);
    PERCH_ROCKS.push([x, z, Math.max(r[0], r[2])]);
    let top = from;
    for (let i = from; i < b.data.length; i += 9) if (b.data[i + 1] > b.data[top + 1]) top = i;
    perches.push({ x: b.data[top], y: b.data[top + 1] - 0.025, z: b.data[top + 2], yaw, size, beach });
  };

  // In the near grass, right of the path: a rock in two humps, half sunk in the turf.
  rock(2.25, -5.9, [0.62, 0.42, 0.5], 371, 3.05, 1.25, false);
  rock(2.95, -6.25, [0.44, 0.3, 0.4], 372, 3.95, 1.2, false);
  b.place(2.6, ground(2.6, -5.7) - 0.05, -5.7, 0.4);
  b.lump([0, 0.05, 0], [0.3, 0.16, 0.24], M.rock, 0.2, 373, false, true);
  // On the cairn beside the stone, and on the bare turf at the edge of the path.
  perches.push({ x: cairn[0], y: cairn[1], z: cairn[2], yaw: 4.4, size: 1.25, beach: false });
  perches.push({ x: -1.5, y: ground(-1.5, -9.6) - 0.01, z: -9.6, yaw: 5.1, size: 1.25, beach: false });
  // A broad coping stone on the wall by the gap, larger than life at that distance, as the bird on it is.
  // (Where the bay is behind it, so that the bird stands out against the water.)
  b.place(-14.5, ground(-14.5, -42.58), -42.58, 0.05);
  b.lump([0, 0.86, 0], [0.75, 0.42, 0.42], M.stone, 0.1, 374, false, true);
  perches.push({ x: -14.5, y: ground(-14.5, -42.58) + 1.25, z: -42.58, yaw: 3.4, size: 2.3, beach: false });

  // By the beach: two rocks in the wash at the water's edge.
  const [ax, az] = shore(6.4, -3.0);
  rock(ax, az, [0.7, 0.5, 0.56], 381, 5.3, 1.25, true, 0.35);
  const [bx, bz] = shore(7.0, -3.9);
  rock(bx, bz, [0.52, 0.36, 0.46], 382, 3.3, 1.2, true, 0.35);
  const [cx, cz] = shore(6.0, -3.8);
  b.place(cx, ground(cx, cz) - 0.08, cz, 1.1);
  b.lump([0, 0.05, 0], [0.34, 0.18, 0.28], M.rock, 0.2, 383, false, true);
  return perches;
}

// ---- puffins on the wing -----------------------------------------------------------
// Drawn like the gulls, as a few pixels each; but where a gull wheels high and
// lazily, a puffin goes low and straight over the water, fast, its short wings
// whirring.

export const PUFFIN_FLIGHT_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aSeed;
uniform mat4 uViewProj;
uniform float uTime;   // seconds since midnight
uniform float uWing;   // which of four frames the wings are on
out float vWing;
out float vWay;
void main() {
  // Each makes a pass across the bay every minute or so, one way and then the other, and is away in between.
  float every = 46.0 + 37.0 * aSeed.x;
  float turn = uTime / every + aSeed.y;
  float pass = floor(turn);
  float along = fract(turn) * every / (15.0 + 5.0 * aSeed.z); // 0..1 while it is crossing
  float way = mod(pass, 2.0) < 1.0 ? 1.0 : -1.0;
  float lane = fract(aSeed.w * 7.0 + pass * 0.37);
  // Out over the open water in front of the meadow and the beach alike, clear of the cliff.
  vec3 from = vec3(-70.0 + 170.0 * way, 0.0, -205.0 - 105.0 * lane);
  vec3 to = vec3(-70.0 - 170.0 * way, 0.0, -205.0 - 105.0 * fract(lane + 0.4));
  vec3 p = mix(from, to, along);
  p.y = 2.2 + 2.5 * aSeed.z + 0.7 * sin(along * 19.0 + aSeed.x * 40.0);
  gl_Position = along < 1.0 ? uViewProj * vec4(p, 1.0) : vec4(0.0, 0.0, 2.0, 1.0);
  // A few pixels at any distance, as the gulls are.
  gl_PointSize = 7.0;
  vWing = mod(uWing + floor(aSeed.y * 4.0), 4.0);
  // Which way it is going across the picture: to the left, or (below zero) to the right.
  vWay = way;
}
`;

export const PUFFIN_FLIGHT_FRAG = `#version 300 es
precision highp float;
in float vWing;
in float vWay;
out vec4 outColor;
uniform vec3 uTint;   // white, as the light of the hour has it
void main() {
  // A sprite seven pixels by five, flying to the left (or mirrored): a dark
  // body, a white belly, an orange bill before and orange feet behind.
  ivec2 q = ivec2(gl_PointCoord * 7.0);
  if (vWay < 0.0) q.x = 6 - q.x;
  q.y -= 1;
  vec3 col = vec3(-1.0);
  vec3 dark = uTint * 0.13;
  if (q.y == 2) {
    if (q.x == 0) col = uTint * vec3(1.0, 0.47, 0.14);
    else if (q.x >= 1 && q.x <= 4) col = dark;
  } else if (q.y == 3) {
    if (q.x == 1 || q.x == 2) col = uTint;
    else if (q.x == 3) col = dark;
    else if (q.x == 5) col = uTint * vec3(1.0, 0.47, 0.14);
  }
  // The wings: up, level, down, level.
  int wing = int(vWing + 0.5);
  if (q.x == 2 || q.x == 3) {
    if (wing == 0 && q.y == 1) col = dark;
    if (wing == 2 && q.y == 4) col = dark;
    if ((wing == 1 || wing == 3) && q.y == 2) col = dark;
  }
  if (col.r < 0.0) discard;
  outColor = vec4(col, 0.4);
}
`;
