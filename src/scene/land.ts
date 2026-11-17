// The shape of the place, generated once at start-up. Distances are in metres.
//
// You stand on a grassy slope above a bay. Below you are a few turf-roofed
// houses. Across the water to the right a sea cliff runs away into the
// distance; a waterfall drops from it, a village sits on its rim, and a stepped
// mountain rises behind. To the left a long island lies across the fjord, and
// on the horizon between them are a toothed islet and two sea stacks, where the
// sun goes down.

import { cross, dot, norm, type V3 } from './gl';
import { buildBoat, buildPerches, buildPuffin, PERCH_ROCKS, type Perch } from './life';

// ---- noise -------------------------------------------------------------------

function hash2(ix: number, iz: number): number {
  const s = Math.sin(ix * 127.1 + iz * 311.7 + 17.3) * 43758.5453;
  return s - Math.floor(s);
}

function noise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Layered noise, roughly -1..1. */
function fbm(x: number, z: number): number {
  return (noise(x, z) * 0.55 + noise(x * 2.1 + 5.2, z * 2.1 + 1.3) * 0.3 + noise(x * 4.3 + 9.1, z * 4.3 + 7.7) * 0.15) * 2 - 1;
}

/**
 * Ridged noise, 0..1: sharp crests with smooth hollows between them. Mountains
 * shaped with it get ridgelines, spurs and corries instead of a smooth dome.
 */
function ridged(x: number, z: number): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  let weight = 1;
  for (let o = 0; o < 4; o++) {
    let n = 1 - Math.abs(noise(x * f + o * 17.1, z * f + o * 9.7) * 2 - 1);
    n = n * n * weight;
    weight = Math.min(1, n * 2.2);
    sum += n * amp;
    f *= 2.07;
    amp *= 0.5;
  }
  return Math.min(1, sum / 0.75);
}

/** 0 at `a`, 1 at `b`, eased. Works with a > b too. */
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Basalt country is stepped: flat treads and short steep risers. */
function terraced(h: number, step: number, amount: number, from: number): number {
  const k = h / step;
  const stepped = step * (Math.floor(k) + smooth(0.3, 0.85, k - Math.floor(k)));
  return h + (stepped - h) * amount * smooth(from, from + 60, h);
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- height of the land ----------------------------------------------------------
// You stand at x = 0, z = 0 looking toward -z (west, out to sea). +x is to your right.

/** Direction you face, as an angle from -z toward +x. Slightly left, along the shore. */
const FACING_AT_START = -0.19;

/** The waterfall: where it leaves the cliff. */
export const FALL = { x: 62, z: -327 };

/** The x at which the far cliff meets the sea, for a given z. */
function cliffLine(z: number): number {
  // Near you the headland is set back to the right; beyond z = -326 it steps
  // out to the left, and that step is the face the waterfall drops down.
  return 15 + 100 * smooth(-332, -320, z) + 14 * Math.sin(z / 170 + 0.6) * smooth(-380, -520, z) + 9 * fbm(z / 60, 2.5) * smooth(-360, -460, z);
}

/** The z beyond which the meadow falls away to the shore. */
function meadowEdge(x: number): number {
  return -150 - 0.3 * x + 14 * fbm(x / 50, 7.3);
}

/**
 * Buttresses and gullies down the faces of the near cliff: a few metres in
 * and out. (They fade away further along, where the cliff is far enough off
 * to be drawn more coarsely.)
 */
function cragged(along: number, seed: number, z: number): number {
  return 3.6 * fbm(along / 15, seed) * smooth(-520, -440, z);
}

function headland(x: number, z: number): number {
  if (z > -228 || x < -40) return -30;
  const cx = cliffLine(z + cragged(x, 5.5, z)) + cragged(z, 1.7, z);
  const edge = smooth(cx - 2, cx + 9, x) * smooth(-236, -256, z + cragged(x, 9.1, z)) * smooth(-2500, -2200, z);
  if (edge <= 0) return -30;
  // Behind the rim the ground climbs, so the village on it can be seen from below.
  const rim = -246 - 82 * smooth(125, 105, x);
  let top = 74 + 0.05 * Math.min(x - cx, 600) + 7 * fbm(x / 90, z / 90) + 0.36 * Math.min(Math.max(rim - z, 0), 95);
  // The stream has cut a notch where it goes over.
  top -= 5 * Math.exp(-(((x - FALL.x) / 6) ** 2)) * smooth(-365, -330, z);

  // The mountain behind: a pyramid worn into ridges and corries, stepped all
  // the way up, with a lower shoulder toward the sea.
  const md = Math.hypot(x - 380, z + 1500) / 880;
  if (md < 1) {
    const cone = 1 - md;
    const spur = ridged(x / 430 + 3, z / 430 + 8);
    let peak = 330 * (0.28 * cone + 0.72 * cone * cone) * (0.58 + 0.6 * spur) + 50 * cone * cone;
    const sd = Math.hypot(x - 150, z + 1230) / 430;
    if (sd < 1) peak = Math.max(peak, 240 * (1 - sd) ** 1.3 * (0.65 + 0.5 * spur));
    // Crags break the skyline on the steeper, higher ground.
    peak += 22 * cone * ridged(x / 85, z / 85);
    top += terraced(peak, 46, 0.72, 25);
  }
  return edge * top - (1 - edge) * 4;
}

/**
 * A small shingle beach at the foot of the meadow's bank, where you go down to
 * skip stones. (It cannot be seen from the meadow: the brow of the slope hides
 * it.) `x`, `z` is where you stand on it; the water's edge is `toWater` metres
 * in front of you, and the shingle climbs gently behind.
 */
export const BEACH = { x: -30, z: -161, r: 18, toWater: 6.5, slope: 0.13 };

/** Height above sea level. Below zero is under water. */
export function land(x: number, z: number): number {
  // The meadow you stand at the back of. It tips gently toward the sea, rolls a
  // little, and then drops away steeply at its far edge.
  const near = 1 / (1 + (Math.hypot(x, z) / 260) ** 2);
  let h = 34 + 0.1 * z + 0.1 * x + near * (2.2 * fbm(x / 34 + 3, z / 34) + 0.75 * fbm(x / 11, z / 11 + 5) + 0.16 * fbm(x / 3.1, z / 3.1));
  const past = meadowEdge(x) - z;
  if (past > 0) h -= (0.75 * past * past) / (past + 5);
  h = Math.min(h, 120);

  // The beach: a level shelf let into the bank, tipping into the water the way you face.
  const fromBeach = Math.hypot(x - BEACH.x, z - BEACH.z) / BEACH.r;
  if (fromBeach < 1) {
    const ahead = (x - BEACH.x) * Math.sin(FACING_AT_START) - (z - BEACH.z) * Math.cos(FACING_AT_START);
    const side = (x - BEACH.x) * Math.cos(FACING_AT_START) + (z - BEACH.z) * Math.sin(FACING_AT_START);
    // Shingle is never a plain ramp. The water's edge is scalloped into cusps;
    // the foreshore climbs to a ridge the last rough sea threw up, with a hollow
    // behind it where you stand, and an older, higher bank at the back; and all
    // of it is lumpy underfoot.
    const up = BEACH.toWater - ahead + 0.55 * Math.sin(side / 1.9 + 0.7) * smooth(-1, 3, BEACH.toWater - ahead); // metres up from the water's edge
    const hump = (t: number) => Math.exp(-t * t);
    let shelf = up * BEACH.slope;
    shelf += 0.19 * hump((up - 4.1) / 1.2) - 0.08 * hump((up - 6.7) / 1.5) + 0.34 * smooth(8.2, 12, up);
    if (up > 0) shelf += (0.05 * fbm(x / 1.4, z / 1.4) + 0.03 * fbm(x / 0.5, z / 0.5)) * smooth(0, 1.5, up);
    h += (shelf - h) * smooth(1, 0.6, fromBeach);
  }

  h = Math.max(h, headland(x, z));

  // A second peak, further off, behind the mountain's shoulder.
  const pr = Math.hypot(x - 900, z + 3300) / 900;
  if (pr < 1) {
    const cone = 1 - pr;
    const spur = ridged(x / 460 + 1, z / 460 + 5);
    h = Math.max(h, terraced(470 * (0.3 * cone + 0.7 * cone * cone) * (0.58 + 0.6 * spur), 50, 0.65, 40) - 8);
  }

  // The island across the fjord to the left. Like many here it is a wedge: it
  // climbs steadily from its low right-hand tip to a summit, then drops sheer
  // into the sea on the far side.
  const iu = (x + 1750) / 1050; // -1 at its far left, +1 at its right tip
  const iv = (z + 2000) / 1500;
  const inside = 1 - (iu * iu + iv * iv);
  if (inside > 0) {
    const climb = iu > -0.35 ? smooth(1.0, -0.35, iu) ** 1.25 : 1 - 0.9 * smooth(-0.35, -0.72, iu);
    const coast = Math.min(1, inside * 4.5) ** 0.6; // cliffs all the way round
    const spur = ridged(x / 390 + 7, z / 390 + 2);
    const isle = 30 + 300 * climb * (0.62 + 0.5 * spur) + 16 * climb * ridged(x / 80, z / 80);
    h = Math.max(h, terraced(isle * coast, 44, 0.7, 20) - 8);
  }

  // A toothed islet on the horizon, sheer on its far side.
  const tx = x + 520;
  const tz = z + 3100;
  if (Math.abs(tx) < 330 && Math.abs(tz) < 150) {
    let ridge = 70 * Math.max(0, 1 - (tx / 300) ** 2);
    for (const [cx, top] of [[-200, 95], [-110, 150], [-20, 190], [70, 160], [160, 120]]) {
      ridge = Math.max(ridge, top * Math.max(0, 1 - Math.abs(tx - cx) / 75));
    }
    const across = tz > 0 ? Math.max(0, 1 - tz / 130) : Math.max(0, 1 + tz / 24);
    h = Math.max(h, ridge * across - 2);
  }

  // Two sea stacks beside it.
  for (const [sx, sz, r, top] of [[-250, -2900, 34, 78], [-178, -2905, 24, 62]]) {
    const d = Math.hypot(x - sx, z - sz) / r;
    if (d < 1) h = Math.max(h, top * (1 - d ** 4));
  }

  // And, very far off, the next island.
  const fx = (x + 4500) / 2800;
  const fz = (z + 9000) / 900;
  const fr = fx * fx + fz * fz;
  if (fr < 1) h = Math.max(h, 430 * (1 - fr) ** 0.9 * (0.4 + 0.75 * ridged(x / 850, z / 850 + 3)) - 5);

  return h;
}

function normalAt(x: number, z: number, e: number): V3 {
  const gx = (land(x + e, z) - land(x - e, z)) / (2 * e);
  const gz = (land(x, z + e) - land(x, z - e)) / (2 * e);
  const l = Math.hypot(gx, 1, gz);
  return [-gx / l, 1 / l, -gz / l];
}

// ---- where you stand -----------------------------------------------------------

export const EYE: V3 = [0, land(0, 0) + 2.3, 0];
/** Direction you face, as an angle from -z toward +x. Slightly left, along the shore. */
export const FACING = FACING_AT_START;
export const PITCH = -0.09;
/** Where your eyes are when you have gone down to the beach: you face the same way, from the water's edge. */
export const SHORE_EYE: V3 = [BEACH.x, land(BEACH.x, BEACH.z) + 1.6, BEACH.z];

// ---- terrain meshes --------------------------------------------------------------

export interface Mesh {
  vertices: Float32Array;
  indices: Uint32Array;
}

/** Fine ground around you. Coarser grids further out leave this rectangle to it. */
const NEAR = { x0: -150, x1: 160, z0: -160, z1: 16 };
/** And fine ground along the water's edge below the meadow, for when you stand on the beach. */
const STRAND = { x0: -150, x1: 100, z0: -210, z1: -160 };
/** The beach itself, finer still: its ridges and lumps are a pace or two across. */
const SHINGLE = { x0: BEACH.x - 21, x1: BEACH.x + 21, z0: BEACH.z - 23, z1: -160 };
/** The part of the sea cliff that is close enough to the beach to want its crags drawn. */
const CRAGS = { x0: -30, x1: 200, z0: -476, z1: -226 };
type Patch = typeof NEAR;

export function buildLand(): Mesh {
  const verts: number[] = [];
  const idx: number[] = [];

  const grid = (x0: number, x1: number, z0: number, z1: number, cell: number, lower = 0, leave: Patch[] = []) => {
    const nx = Math.ceil((x1 - x0) / cell) + 1;
    const nz = Math.ceil((z1 - z0) / cell) + 1;
    const base = verts.length / 6;
    const heights = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * cell;
        const z = z0 + j * cell;
        const h = land(x, z);
        heights[j * nx + i] = h;
        const n = normalAt(x, z, Math.max(0.5, cell * 0.5));
        verts.push(x, h - lower, z, n[0], n[1], n[2]);
      }
    }
    // (Ground that a finer patch covers is left to it, all but a cell's width of overlap round the edge.)
    const inside = (r: Patch, x: number, z: number) => x > r.x0 + cell && x < r.x1 - cell && z > r.z0 + cell && z < r.z1 - cell;
    const left = (x: number, z: number) => leave.some((r) => inside(r, x, z) && inside(r, x + cell, z) && inside(r, x, z + cell) && inside(r, x + cell, z + cell));
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        const b = a + 1;
        const c = a + nx;
        const d = c + 1;
        if (Math.max(heights[a], heights[b], heights[c], heights[d]) < -0.5) continue; // all under water
        if (leave.length && left(x0 + i * cell, z0 + j * cell)) continue;
        idx.push(base + a, base + c, base + b, base + b, base + c, base + d);
      }
    }
  };

  grid(NEAR.x0, NEAR.x1, NEAR.z0, NEAR.z1, 1.6);
  grid(STRAND.x0, STRAND.x1, STRAND.z0, STRAND.z1, 1.25, 0, [SHINGLE]);
  grid(SHINGLE.x0, SHINGLE.x1, SHINGLE.z0, SHINGLE.z1, 0.4);
  grid(-420, 420, -232, 80, 8, 1.0, [NEAR, STRAND]); // the rest of your own meadow
  grid(CRAGS.x0, CRAGS.x1, CRAGS.z0, CRAGS.z1, 2); // the near end of the cliff, crag by crag
  grid(-30, 200, -2400, -470, 6); // the rest of the cliff and its rim, finely
  grid(150, 1700, -2420, -220, 12, 1.5); // the headland and the mountain
  grid(-40, 1840, -4230, -2400, 22); // the second peak
  grid(-2850, -650, -3560, -440, 14); // the wedge island
  grid(-860, -120, -3260, -2840, 6); // islet and stacks
  grid(-7500, -1500, -10000, -8000, 50); // the far island

  return { vertices: new Float32Array(verts), indices: new Uint32Array(idx) };
}

// ---- houses, sheep and boulders ---------------------------------------------------

interface House {
  x: number;
  z: number;
  /** Which way the ridge runs. */
  yaw: number;
  len: number;
  wid: number;
  wall: number;
  ridge: number;
  /** What the gable ends and the long walls are made of. */
  gable: 'tar' | 'red' | 'white' | 'ochre' | 'blue';
  side: 'stone' | 'white';
  /** Whether it has the things a lived-in house gathers: lantern, woodpile, bench. */
  home?: boolean;
  /** Whether a ladder has been left lying on its roof, up to the chimney. */
  ladder?: boolean;
}

const HOUSES: House[] = [
  // In the meadow below you. The first three have a fire lit.
  { x: 9, z: -53, yaw: 0.64, len: 9.5, wid: 5.6, wall: 2.3, ridge: 2.7, gable: 'tar', side: 'stone', home: true },
  { x: -11, z: -60, yaw: 0.72, len: 7.2, wid: 4.6, wall: 2.0, ridge: 2.2, gable: 'red', side: 'stone', home: true },
  { x: -2, z: -76, yaw: 0.6, len: 7.0, wid: 4.6, wall: 2.0, ridge: 2.2, gable: 'tar', side: 'white', home: true, ladder: true },
  { x: -44, z: -92, yaw: 0.9, len: 6.5, wid: 4.4, wall: 1.9, ridge: 2.1, gable: 'tar', side: 'stone', home: true },
  // The village on the slope above the far cliff, either side of the stream.
  // (Drawn larger than life, so they still read as houses from here.)
  { x: 28, z: -343, yaw: 0.05, len: 14, wid: 8, wall: 3.4, ridge: 3.8, gable: 'tar', side: 'stone' },
  { x: 44, z: -362, yaw: -0.1, len: 12, wid: 7.5, wall: 3.2, ridge: 3.6, gable: 'red', side: 'white' },
  { x: 84, z: -342, yaw: 0.08, len: 15, wid: 8, wall: 3.4, ridge: 4.0, gable: 'white', side: 'white' },
  { x: 100, z: -361, yaw: -0.05, len: 12, wid: 7.5, wall: 3.2, ridge: 3.6, gable: 'tar', side: 'stone' },
  { x: 98, z: -384, yaw: 0.12, len: 13, wid: 7.5, wall: 3.3, ridge: 3.8, gable: 'red', side: 'stone' },
  { x: 30, z: -388, yaw: 0.0, len: 12, wid: 7.5, wall: 3.2, ridge: 3.6, gable: 'tar', side: 'white' },
  { x: 120, z: -347, yaw: -0.08, len: 12, wid: 7.5, wall: 3.2, ridge: 3.6, gable: 'ochre', side: 'white' },
  { x: 76, z: -366, yaw: 0.1, len: 11, wid: 7, wall: 3.1, ridge: 3.4, gable: 'blue', side: 'stone' },
  { x: 124, z: -372, yaw: 0.04, len: 13, wid: 7.5, wall: 3.3, ridge: 3.8, gable: 'tar', side: 'stone' },
  { x: 118, z: -398, yaw: -0.12, len: 12, wid: 7.5, wall: 3.2, ridge: 3.6, gable: 'red', side: 'white' },
  { x: 136, z: -420, yaw: 0.06, len: 12, wid: 7, wall: 3.1, ridge: 3.5, gable: 'white', side: 'stone' },
  { x: 22, z: -414, yaw: 0.1, len: 12, wid: 7.5, wall: 3.2, ridge: 3.6, gable: 'ochre', side: 'stone' },
];

/**
 * Each household, for telling whose window is whose: where it stands (x, z),
 * the way its ridge runs, and half its length. The church comes last.
 */
/**
 * Each house as the calendar needs it, to hang lights along its eaves and stand a flag by it: where it
 * is and which way its ridge runs, half its length and width, and the heights of its floor, eaves and ridge.
 */
export const HOUSE_SHAPES = HOUSES.map((h) => {
  const L = h.len / 2;
  const W = h.wid / 2;
  const corner = (lx: number, lz: number) => land(h.x + lx * Math.cos(h.yaw) + lz * Math.sin(h.yaw), h.z - lx * Math.sin(h.yaw) + lz * Math.cos(h.yaw));
  const floor = Math.max(corner(-L, -W), corner(L, -W), corner(L, W), corner(-L, W)) + 0.1;
  return { x: h.x, z: h.z, yaw: h.yaw, L, W, floor, eave: floor + h.wall, top: floor + h.wall + h.ridge };
});
/**
 * Where your eyes are when you have gone indoors: at the seaward window of the nearest house, as high
 * as someone standing at its sill, and just clear of the wall and the turf that overhangs it (so that
 * nothing of the house itself is in the way). You face the same way as from the meadow.
 */
export const ROOM_EYE: V3 = (() => {
  const h = HOUSE_SHAPES[0];
  const along = 1.0;
  const out = -(h.W + 0.6);
  return [h.x + along * Math.cos(h.yaw) + out * Math.sin(h.yaw), h.floor + 1.45, h.z - along * Math.sin(h.yaw) + out * Math.cos(h.yaw)];
})();
/** The corners of that house, for telling when the pointer is on it. */
export const homeFrame: V3[] = (() => {
  const h = HOUSE_SHAPES[0];
  const corners: V3[] = [];
  for (const lx of [-h.L, h.L]) for (const lz of [-h.W, h.W]) for (const y of [h.floor, h.top - 0.6]) corners.push([h.x + lx * Math.cos(h.yaw) + lz * Math.sin(h.yaw), y, h.z - lx * Math.sin(h.yaw) + lz * Math.cos(h.yaw)]);
  return corners;
})();
/** And the church, the same way. */
export const CHURCH = (() => {
  const [x, z, L, W] = [64, -404, 10, 5];
  const eave = Math.max(land(x - L, z + W), land(x + L, z + W), land(x - L, z - W), land(x + L, z - W)) + 6;
  return { x, z, yaw: 0.04, L, W, eave, top: eave + 5 };
})();
export const HOMES: [number, number, number, number][] = [...HOUSES.map((h): [number, number, number, number] => [h.x, h.z, h.yaw, h.len / 2]), [64, -404, 0.04, 10]];

const MAT = {
  boards: 0, stone: 1, soil: 2, white: 3, glass: 4, turf: 5, wool: 6, dark: 7, rock: 8, runes: 9,
  woolBrown: 10, woolGrey: 11, redBoards: 12, whitewash: 13, logs: 14, slate: 15, beacon: 16, redPaint: 17, char: 18, bark: 19, cut: 20, ochre: 21, blue: 22,
  brass: 23, hornThroat: 24, hornBell: 25, walnut: 26,
  seaGlass: 61, cork: 62,
  lanternIron: 40, lanternGlass: 41, lanternPaper: 42, lanternStake: 43, token: 44,
  lantern: 47, puffin: 48,
};

/** A patch of roof that grass grows on: a corner and two edges, in world space. */
interface RoofPatch {
  origin: V3;
  along: V3;
  up: V3;
  /** A strip of it (as fractions of the way along) where the grass is pressed flat. */
  flat?: [number, number];
}

class PropBuilder {
  data: number[] = [];
  private cos = 1;
  private sin = 0;
  private ox = 0;
  private oy = 0;
  private oz = 0;

  place(x: number, y: number, z: number, yaw: number): void {
    this.cos = Math.cos(yaw);
    this.sin = Math.sin(yaw);
    this.ox = x;
    this.oy = y;
    this.oz = z;
  }

  world(p: V3): V3 {
    return [this.ox + p[0] * this.cos + p[2] * this.sin, this.oy + p[1], this.oz - p[0] * this.sin + p[2] * this.cos];
  }

  private dir(n: V3): V3 {
    return [n[0] * this.cos + n[2] * this.sin, n[1], -n[0] * this.sin + n[2] * this.cos];
  }

  private vertex(p: V3, n: V3, u: number, v: number, mat: number): void {
    const w = this.world(p);
    const d = this.dir(n);
    this.data.push(w[0], w[1], w[2], d[0], d[1], d[2], u, v, mat);
  }

  /**
   * A flat four-sided face. Texture coordinates are in metres along its first
   * and last edges, starting from zero if `plain`.
   */
  quad(a: V3, b: V3, c: V3, d: V3, n: V3, mat: number, plain = false): void {
    const u = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const v = Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
    // Shift each face's pattern so neighbouring walls do not repeat each other.
    const su = plain ? 0 : a[0] * 3.1 + a[2] * 1.7;
    const sv = plain ? 0 : a[1] * 2.3;
    this.vertex(a, n, su, sv, mat);
    this.vertex(b, n, su + u, sv, mat);
    this.vertex(c, n, su + u, sv + v, mat);
    this.vertex(a, n, su, sv, mat);
    this.vertex(c, n, su + u, sv + v, mat);
    this.vertex(d, n, su, sv + v, mat);
  }

  tri(a: V3, b: V3, c: V3, n: V3, mat: number): void {
    const su = a[0] * 3.1 + a[2] * 1.7;
    this.vertex(a, n, su, a[1], mat);
    this.vertex(b, n, su + Math.hypot(b[0] - a[0], b[2] - a[2]), b[1], mat);
    this.vertex(c, n, su + Math.hypot(c[0] - a[0], c[2] - a[2]), c[1], mat);
  }

  /** A straight-sided box between two opposite corners. */
  box(lo: V3, hi: V3, mat: number, top = mat): void {
    const [x0, y0, z0] = lo;
    const [x1, y1, z1] = hi;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], mat);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], mat);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], mat);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], mat);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], top);
  }

  /**
   * A faceted lump: a rounded shape made of flat faces, each catching the light
   * differently, which is what makes a rock (or a sheep) read well in pixel art.
   */
  lump(c: V3, r: V3, mat: number, rough: number, seed: number, fine = true, flatBase = false): void {
    const shape = fine ? LUMP_FINE : LUMP_COARSE;
    for (const face of shape.faces) {
      const pts = face.map((i) => {
        const d = shape.points[i];
        const k = 1 + rough * (hash2(i * 3 + seed * 17, seed * 5 + i) - 0.5) * 2;
        let y = d[1] * r[1] * k;
        if (flatBase && y < -0.2 * r[1]) y = -0.2 * r[1];
        return [c[0] + d[0] * r[0] * k, c[1] + y, c[2] + d[2] * r[2] * k] as V3;
      });
      let n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
      if (dot(n, sub(pts[0], c)) < 0) n = [-n[0], -n[1], -n[2]];
      for (const q of pts) this.vertex(q, n, q[0] * 1.3 + q[2] * 0.7, q[1] * 1.3, mat);
    }
  }

  /**
   * A rounded standing stone: a soft-cornered column that narrows as it rises
   * and domes over at the top. Its surface is shaded smoothly, so light wraps
   * round it. The part that faces forward takes `front` (the carved face).
   */
  stele(width: number, depth: number, height: number, front: number, rest: number): void {
    const rings = 10;
    const segs = 18;
    const at = (j: number, i: number): V3 => {
      const t = Math.max(0, Math.min(1, j / rings)); // 0 at the foot, 1 at the crown
      const dome = t < 0.78 ? 0 : (t - 0.78) / 0.22;
      const y = height * (t < 0.78 ? (t / 0.78) * 0.84 : 0.84 + 0.16 * Math.sin((dome * Math.PI) / 2));
      const girth = (1 - 0.2 * t) * (dome > 0 ? Math.cos((dome * Math.PI) / 2) ** 0.55 : 1);
      const a = (i / segs) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const soft = 0.6; // 1 would be a plain oval; less is boxier
      // Weathering: every stone is a little uneven.
      const worn = 1 + 0.035 * (hash2(((i % segs) + segs) % segs, j * 7 + 3) - 0.5);
      return [
        Math.sign(c) * Math.abs(c) ** soft * (width / 2) * girth * worn + 0.035 * y,
        y,
        Math.sign(sn) * Math.abs(sn) ** soft * (depth / 2) * girth * worn,
      ];
    };
    const normalAt = (j: number, i: number): V3 => {
      const across = sub(at(j, i + 1), at(j, i - 1));
      const upward = sub(at(Math.min(rings, j + 1), i), at(Math.max(0, j - 1), i));
      let n = norm(cross(across, upward));
      const p = at(j, i);
      if (n[0] * p[0] + n[2] * p[2] < 0) n = [-n[0], -n[1], -n[2]];
      return j === rings ? [0, 1, 0] : n;
    };
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < segs; i++) {
        const corners: [number, number][] = [[j, i], [j, i + 1], [j + 1, i + 1], [j, i], [j + 1, i + 1], [j + 1, i]];
        const facing = normalAt(j, i + 0.5)[2];
        const mat = facing > 0.5 ? front : rest;
        for (const [cj, ci] of corners) {
          const p = at(cj, ci);
          this.vertex(p, normalAt(cj, ci), p[0] + width / 2, p[1], mat);
        }
      }
    }
  }

  /** A tapering many-sided tower from height y0 to y1. */
  prism(sides: number, r0: number, r1: number, y0: number, y1: number, mat: number, cap = -1): void {
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const at = (a: number, r: number, y: number): V3 => [Math.cos(a) * r, y, Math.sin(a) * r];
      this.quad(at(a0, r0, y0), at(a1, r0, y0), at(a1, r1, y1), at(a0, r1, y1), [Math.cos(am), 0.1, Math.sin(am)], mat);
      if (cap >= 0) this.tri(at(a0, r1, y1), at(a1, r1, y1), [0, y1, 0], [0, 1, 0], cap);
    }
  }

  ellipsoid(c: V3, r: V3, mat: number, lumpy = 0): void {
    const rings = 6;
    const segs = 10;
    const at = (i: number, j: number): { p: V3; n: V3 } => {
      const th = (i / rings) * Math.PI;
      const ph = ((j % segs) / segs) * Math.PI * 2;
      const d: V3 = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
      const k = 1 + lumpy * (hash2(i * 7 + (j % segs) * 13, Math.round(c[0] * 10)) - 0.5);
      const n: V3 = [d[0] / r[0], d[1] / r[1], d[2] / r[2]];
      const l = Math.hypot(n[0], n[1], n[2]);
      return { p: [c[0] + d[0] * r[0] * k, c[1] + d[1] * r[1] * k, c[2] + d[2] * r[2] * k], n: [n[0] / l, n[1] / l, n[2] / l] };
    };
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < segs; j++) {
        const a = at(i, j);
        const b = at(i + 1, j);
        const cc = at(i + 1, j + 1);
        const d = at(i, j + 1);
        for (const v of [a, b, cc, a, cc, d]) this.vertex(v.p, v.n, v.p[0], v.p[1], mat);
      }
    }
  }

  /**
   * A shape turned on a lathe and laid on its side, like a bottle: rings of
   * the given radii at the given places along an axis that runs along x and
   * tips up by `tip`, the whole lifted by `lift`. Each stretch between two
   * rings takes its own material, and the surface is shaded smoothly, round
   * it and along it. (Across a face, u is how far along the axis it is, in
   * metres, and v goes once round.)
   */
  turned(rings: [number, number][], mats: number[], sides: number, tip: number, lift: number): void {
    const c = Math.cos(tip);
    const s = Math.sin(tip);
    const at = (k: number, i: number): { p: V3; n: V3 } => {
      const [x, r] = rings[k];
      // The way the surface leans here: outward, and back or forward where it narrows or widens.
      const before = rings[Math.max(0, k - 1)];
      const after = rings[Math.min(rings.length - 1, k + 1)];
      const l = Math.hypot(after[0] - before[0], after[1] - before[1]) || 1;
      const along = -(after[1] - before[1]) / l;
      const out = (after[0] - before[0]) / l;
      const a = (i / sides) * Math.PI * 2;
      const y = r * Math.cos(a);
      const ny = out * Math.cos(a);
      return { p: [x * c - y * s, x * s + y * c + lift, r * Math.sin(a)], n: [along * c - ny * s, along * s + ny * c, out * Math.sin(a)] };
    };
    for (let k = 0; k + 1 < rings.length; k++) {
      for (let i = 0; i < sides; i++) {
        for (const [dk, di] of [[0, 0], [0, 1], [1, 1], [0, 0], [1, 1], [1, 0]]) {
          const v = at(k + dk, i + di);
          this.vertex(v.p, v.n, rings[k + dk][0], (i + di) / sides, mats[k]);
        }
      }
    }
  }
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** A twenty-sided ball, optionally with each face split in four. */
function ball(split: boolean): { points: V3[]; faces: number[][] } {
  const t = (1 + Math.sqrt(5)) / 2;
  const points: V3[] = ([
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t],
    [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ] as V3[]).map(norm);
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  if (!split) return { points, faces };
  const mids = new Map<string, number>();
  const mid = (a: number, b: number): number => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    let i = mids.get(key);
    if (i === undefined) {
      i = points.length;
      points.push(norm([(points[a][0] + points[b][0]) / 2, (points[a][1] + points[b][1]) / 2, (points[a][2] + points[b][2]) / 2]));
      mids.set(key, i);
    }
    return i;
  };
  const out: number[][] = [];
  for (const [a, b, c] of faces) {
    const ab = mid(a, b);
    const bc = mid(b, c);
    const ca = mid(c, a);
    out.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
  }
  return { points, faces: out };
}
const LUMP_COARSE = ball(false);
const LUMP_FINE = ball(true);

/**
 * Simple stand-ins for the things in the meadow: each is a box or a rounded lump.
 * (They were what the light was traced against. It is now traced against the things'
 * own triangles, see rays.ts and PATH-TRACE, and nothing reads these any more.)
 * [centre x, y, z, yaw] then [half-size x, y, z, kind + colour / 10], where
 * kind is 0 for a box and 1 for a lump.
 */
export const occluders: number[] = [];
const SHADE = { turf: 0, dark: 1, red: 2, white: 3, rock: 4, wool: 5 };
function casts(kind: 0 | 1, x: number, y: number, z: number, yaw: number, hx: number, hy: number, hz: number, shade: number): void {
  if (occluders.length / 8 < 64) occluders.push(x, y, z, yaw, hx, hy, hz, kind + shade / 10);
}

/** The part of the meadow whose shape is given to the light tracer: [x0, z0, x1, z1]. */
export const FIELD = [-170, -190, 180, 30];

/** Heights of the ground over FIELD, as a square grid, for rays to be marched against. */
export function buildHeightField(size: number): Float32Array {
  const out = new Float32Array(size * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = FIELD[0] + ((i + 0.5) / size) * (FIELD[2] - FIELD[0]);
      const z = FIELD[1] + ((j + 0.5) / size) * (FIELD[3] - FIELD[1]);
      out[j * size + i] = Math.max(-1, land(x, z));
    }
  }
  return out;
}

/** Lanterns by the doors of the meadow houses: they light the grass round them at night. */
export const lampSpots: V3[] = [];

function buildHouse(b: PropBuilder, h: House, roofs: RoofPatch[]): void {
  const L = h.len / 2;
  const W = h.wid / 2;
  b.place(h.x, 0, h.z, h.yaw);

  // The house sits level; stone footings make up the slope beneath it.
  const corners = ([[-L, -W], [L, -W], [L, W], [-L, W]] as const).map(([lx, lz]) => {
    const w = b.world([lx, 0, lz]);
    return land(w[0], w[2]);
  });
  const floor = Math.max(...corners) + 0.1;
  const foot = Math.min(...corners) - 0.6;
  const eave = floor + h.wall;
  const top = eave + h.ridge;

  // Long walls: dry stone from the ground to the eaves.
  const gable = { tar: MAT.boards, red: MAT.redBoards, white: MAT.whitewash, ochre: MAT.ochre, blue: MAT.blue }[h.gable];
  const side = h.side === 'stone' ? MAT.stone : MAT.whitewash;
  b.quad([-L, foot, W], [L, foot, W], [L, eave, W], [-L, eave, W], [0, 0, 1], side);
  b.quad([L, foot, -W], [-L, foot, -W], [-L, eave, -W], [L, eave, -W], [0, 0, -1], side);
  if (h.z > -200) {
    // For tracing light: the body of the house, and a narrower block for its roof.
    const body = h.gable === 'red' ? SHADE.red : h.side === 'white' ? SHADE.white : SHADE.dark;
    casts(0, h.x, (foot + eave) / 2, h.z, h.yaw, L, (eave - foot) / 2, W, body);
    casts(0, h.x, eave + h.ridge * 0.45, h.z, h.yaw, L + 0.3, h.ridge * 0.45, W * 0.55, SHADE.turf);
  }
  // A plinth of footing stones, standing slightly proud of the walls.
  b.box([-L - 0.09, foot, -W - 0.09], [L + 0.09, floor + 0.3, W + 0.09], MAT.stone);

  // Gable ends: stone footing, then black tarred boards up to the ridge.
  for (const s of [1, -1]) {
    const x = s * L;
    const n: V3 = [s, 0, 0];
    b.quad([x, foot, -s * W], [x, foot, s * W], [x, floor, s * W], [x, floor, -s * W], n, MAT.stone);
    b.quad([x, floor, -s * W], [x, floor, s * W], [x, eave, s * W], [x, eave, -s * W], n, gable);
    b.tri([x, eave, -s * W], [x, eave, s * W], [x, top, 0], n, gable);
    // White corner boards, a sill under the window, and a little hatch to the loft.
    const out = x + s * 0.06;
    for (const e of [1, -1]) {
      b.quad([out, floor + 0.3, e * W], [out, floor + 0.3, e * (W - 0.16)], [out, eave, e * (W - 0.16)], [out, eave, e * W], n, MAT.white);
    }
    const hy = eave + h.ridge * 0.3;
    b.quad([out, hy, -0.3], [out, hy, 0.3], [out, hy + 0.6, 0.3], [out, hy + 0.6, -0.3], n, MAT.white);
    b.quad([out + s * 0.03, hy + 0.09, -0.21], [out + s * 0.03, hy + 0.09, 0.21], [out + s * 0.03, hy + 0.51, 0.21], [out + s * 0.03, hy + 0.51, -0.21], n, MAT.boards);

    // A white-framed window with six panes.
    const ww = Math.min(1.3, h.wid * 0.25);
    const wh = ww * 1.25;
    const wy = floor + h.wall * 0.42;
    const fx = x + s * 0.05;
    b.quad([fx, wy, (-s * ww) / 2], [fx, wy, (s * ww) / 2], [fx, wy + wh, (s * ww) / 2], [fx, wy + wh, (-s * ww) / 2], n, MAT.white);
    const gx = x + s * 0.09;
    const bar = 0.09;
    for (let col = 0; col < 2; col++) {
      for (let row = 0; row < 3; row++) {
        const z0 = -ww / 2 + bar + (col * (ww - bar)) / 2;
        const z1 = z0 + (ww - bar) / 2 - bar;
        const y0 = wy + bar + (row * (wh - bar)) / 3;
        const y1 = y0 + (wh - bar) / 3 - bar;
        b.quad([gx, y0, s * z0], [gx, y0, s * z1], [gx, y1, s * z1], [gx, y1, s * z0], n, MAT.glass);
      }
    }
  }

  // A door in the long wall that faces up the hill, and a chimney on the ridge.
  {
    const z = W + 0.05;
    const cx = -L * 0.38;
    b.quad([cx - 0.62, floor - 0.05, z], [cx + 0.62, floor - 0.05, z], [cx + 0.62, floor + 1.95, z], [cx - 0.62, floor + 1.95, z], [0, 0, 1], MAT.white);
    b.quad([cx - 0.46, floor - 0.05, z + 0.04], [cx + 0.46, floor - 0.05, z + 0.04], [cx + 0.46, floor + 1.8, z + 0.04], [cx - 0.46, floor + 1.8, z + 0.04], [0, 0, 1], MAT.boards);
    const c = L * 0.5;
    const y0 = top - 0.5;
    const y1 = top + 1.25;
    const q = 0.42;
    b.quad([c - q, y0, q], [c + q, y0, q], [c + q, y1, q], [c - q, y1, q], [0, 0, 1], MAT.stone);
    b.quad([c + q, y0, -q], [c - q, y0, -q], [c - q, y1, -q], [c + q, y1, -q], [0, 0, -1], MAT.stone);
    b.quad([c + q, y0, q], [c + q, y0, -q], [c + q, y1, -q], [c + q, y1, q], [1, 0, 0], MAT.stone);
    b.quad([c - q, y0, -q], [c - q, y0, q], [c - q, y1, q], [c - q, y1, -q], [-1, 0, 0], MAT.stone);
    b.quad([c - q, y1, q], [c + q, y1, q], [c + q, y1, -q], [c - q, y1, -q], [0, 1, 0], MAT.boards);
    if (smokeSources.length < 3) smokeSources.push(b.world([c, y1 + 0.2, 0]));
    else if (h.z < -300 && villageSmoke.length < 3 && h.gable !== 'tar') villageSmoke.push(b.world([c, y1 + 0.5, 0]));

    if (h.home) {
      // A lantern by the door, firewood stacked under the eaves, and a bench to sit on.
      b.box([cx + 0.78, floor + 1.25, z], [cx + 0.98, floor + 1.55, z + 0.16], MAT.lantern, MAT.boards);
      lampSpots.push(b.world([cx + 0.88, floor + 1.2, z + 0.8]));
      b.box([L * 0.12, floor - 0.1, z], [L * 0.12 + 1.9, floor + 1.0, z + 0.5], MAT.logs);
      b.box([cx - 2.3, floor + 0.36, z + 0.05], [cx - 0.95, floor + 0.48, z + 0.5], MAT.boards);
      b.box([cx - 2.25, floor - 0.1, z + 0.1], [cx - 2.12, floor + 0.36, z + 0.45], MAT.boards);
      b.box([cx - 1.13, floor - 0.1, z + 0.1], [cx - 1.0, floor + 0.36, z + 0.45], MAT.boards);
    }
  }

  // A small window beside the door.
  for (const cx of [L * 0.4]) {
    const z = W + 0.06;
    const y = floor + h.wall * 0.42;
    b.quad([cx - 0.55, y, z], [cx + 0.55, y, z], [cx + 0.55, y + 0.9, z], [cx - 0.55, y + 0.9, z], [0, 0, 1], MAT.white);
    b.quad([cx - 0.44, y + 0.1, z + 0.04], [cx - 0.05, y + 0.1, z + 0.04], [cx - 0.05, y + 0.8, z + 0.04], [cx - 0.44, y + 0.8, z + 0.04], [0, 0, 1], MAT.glass);
    b.quad([cx + 0.05, y + 0.1, z + 0.04], [cx + 0.44, y + 0.1, z + 0.04], [cx + 0.44, y + 0.8, z + 0.04], [cx + 0.05, y + 0.8, z + 0.04], [0, 0, 1], MAT.glass);
  }
  // In the far village the windows of the front wall are larger than life, as the houses are, so that
  // a lamp lit behind one can be seen from the meadow: one beside the door, and one at the end of the best room.
  if (h.z < -200) {
    const z = W + 0.12;
    const y = floor + 0.95;
    for (const cx of [L * 0.4, -L * 0.82]) {
      b.quad([cx - 1.08, y - 0.14, z], [cx + 1.08, y - 0.14, z], [cx + 1.08, y + 1.64, z], [cx - 1.08, y + 1.64, z], [0, 0, 1], MAT.white);
      b.quad([cx - 0.95, y, z + 0.04], [cx - 0.07, y, z + 0.04], [cx - 0.07, y + 1.5, z + 0.04], [cx - 0.95, y + 1.5, z + 0.04], [0, 0, 1], MAT.glass);
      b.quad([cx + 0.07, y, z + 0.04], [cx + 0.95, y, z + 0.04], [cx + 0.95, y + 1.5, z + 0.04], [cx + 0.07, y + 1.5, z + 0.04], [0, 0, 1], MAT.glass);
    }
  }

  // Turf roof: thick, overhanging, with a white board under its edge.
  const over = 0.35; // overhang past the walls
  const turf = 0.32; // thickness
  const board = 0.2;
  const pitch = h.ridge / W;
  const X = L + over;
  const eaveY = eave - over * pitch;
  for (const s of [1, -1]) {
    const ze = s * (W + over);
    const nl = Math.hypot(1, pitch);
    const n: V3 = [0, 1 / nl, (s * pitch) / nl];
    b.quad([-X, eaveY + turf, ze], [X, eaveY + turf, ze], [X, top + turf, 0], [-X, top + turf, 0], n, MAT.turf);
    roofs.push({
      origin: b.world([-X, eaveY + turf, ze]),
      along: sub(b.world([X, eaveY + turf, ze]), b.world([-X, eaveY + turf, ze])),
      up: sub(b.world([-X, top + turf, 0]), b.world([-X, eaveY + turf, ze])),
      // (Where the ladder lies, the grass is pressed flat under it: see ROOF-FURNITURE below.)
      flat: h.ladder && s === 1 ? [(L * 0.5 - 1.05 - 0.36 + X) / (2 * X), (L * 0.5 - 1.05 + 0.36 + X) / (2 * X)] : undefined,
    });
    // Along the eaves: cut turf above, white board below.
    const out: V3 = [0, 0, s];
    b.quad([-X, eaveY, ze], [X, eaveY, ze], [X, eaveY + turf, ze], [-X, eaveY + turf, ze], out, MAT.soil);
    b.quad([-X, eaveY - board, ze], [X, eaveY - board, ze], [X, eaveY, ze], [-X, eaveY, ze], out, MAT.white);
    // Underside, so the overhang is not see-through.
    b.quad([-X, eaveY - board, ze], [X, eaveY - board, ze], [X, top - board, 0], [-X, top - board, 0], [0, -1, 0], MAT.boards);
    // Up the gables.
    for (const e of [1, -1]) {
      const x = e * X;
      const side: V3 = [e, 0, 0];
      b.quad([x, eaveY, ze], [x, top, 0], [x, top + turf, 0], [x, eaveY + turf, ze], side, MAT.soil);
      b.quad([x, eaveY - board, ze], [x, top - board, 0], [x, top, 0], [x, eaveY, ze], side, MAT.white);
    }
  }

  // ROOF-FURNITURE: what makes a turf roof read as a roof from behind and above, where none of its walls
  // show (the seaward window of the nearest house looks straight onto its neighbour's): white boards
  // standing proud of the turf up each gable edge and crossing at the peak, a log pegged along each
  // eave to keep the turf from sliding, and on one house a ladder left lying up to the chimney.
  if (h.z > -200) {
    const nl = Math.hypot(1, pitch);
    const run = Math.hypot(top - eaveY, W + over); // the length of a slope, eave to ridge
    for (const s of [1, -1]) {
      const ze = s * (W + over);
      const n: V3 = [0, 1 / nl, (s * pitch) / nl];
      const up: V3 = [0, (top - eaveY) / run, -ze / run];
      const down: V3 = [0, -up[1], -up[2]];
      // A place on this slope: x along the house, v metres up it from the eave, lifted off the turf.
      const on = (x: number, v: number, lift: number): V3 => [x, eaveY + turf + up[1] * v + n[1] * lift, ze + up[2] * v + n[2] * lift];
      // A squared timber lying on the slope: from x0 to x1 along the house and v0 to v1 up it, its faces from `low` to `high` off the turf.
      const timber = (x0: number, x1: number, v0: number, v1: number, low: number, high: number, mat: number) => {
        b.quad(on(x0, v0, high), on(x1, v0, high), on(x1, v1, high), on(x0, v1, high), n, mat);
        b.quad(on(x0, v0, low), on(x0, v1, low), on(x0, v1, high), on(x0, v0, high), [-1, 0, 0], mat);
        b.quad(on(x1, v0, low), on(x1, v1, low), on(x1, v1, high), on(x1, v0, high), [1, 0, 0], mat);
        b.quad(on(x0, v0, low), on(x1, v0, low), on(x1, v0, high), on(x0, v0, high), down, mat);
        b.quad(on(x0, v1, low), on(x1, v1, low), on(x1, v1, high), on(x0, v1, high), up, mat);
      };
      // The gable boards, running a little past the ridge so that the two of each end cross.
      for (const e of [1, -1]) timber(e * X - 0.1, e * X + 0.03, -0.04, run + 0.42, -0.06, 0.14, MAT.white);
      // The eave log, and the pegs that hold it.
      timber(-X + 0.14, X - 0.14, 0.02, 0.21, -0.02, 0.17, MAT.bark);
      for (let px = -X + 0.7; px < X - 0.5; px += 1.45) timber(px - 0.045, px + 0.045, -0.03, 0.05, -0.04, 0.24, MAT.boards);
      // The ladder, on the slope that faces up the hill: two rails and its rungs, of pale weathered wood.
      if (h.ladder && s === 1) {
        const lx = L * 0.5 - 1.05;
        for (const rail of [-0.23, 0.23]) timber(lx + rail - 0.04, lx + rail + 0.04, 0.3, run - 0.12, 0.0, 0.1, MAT.cut);
        for (let v = 0.5; v < run - 0.25; v += 0.34) timber(lx - 0.23, lx + 0.23, v, v + 0.07, 0.02, 0.08, MAT.cut);
      }
    }
  }
}

/** A Faroese sheep: shaggy, short-legged, and any colour from white to peat brown. */
/**
 * The woolly part of a sheep, standing at the builder's origin and facing +x:
 * three rounded masses of fleece along its back (so its outline is lumpy, not
 * an egg), a ruff of wool at the neck, a little hanging tail, and four thin
 * dark legs showing below. Lying, it is folded down onto the ground with its
 * legs tucked out of sight.
 */
function sheepBody(b: PropBuilder, s: number, wool: number, lying: boolean, seed: number, legs = true): void {
  const lift = (lying ? 0.33 : 0.62) * s; // height of the middle of its body
  b.lump([0, lift, 0], [0.48 * s, 0.35 * s, 0.36 * s], wool, 0.16, seed);
  b.lump([0.33 * s, lift + 0.03 * s, 0], [0.3 * s, 0.33 * s, 0.33 * s], wool, 0.18, seed + 1, false); // shoulders
  b.lump([-0.35 * s, lift + 0.01 * s, 0], [0.3 * s, 0.32 * s, 0.34 * s], wool, 0.18, seed + 2, false); // rump
  b.lump([0.5 * s, lift + 0.16 * s, 0], [0.17 * s, 0.2 * s, 0.2 * s], wool, 0.14, seed + 3, false); // the ruff at its neck
  b.lump([-0.66 * s, lift - 0.02 * s, 0], [0.07 * s, 0.14 * s, 0.08 * s], wool, 0.1, seed + 4, false); // tail
  if (!lying && legs) for (let i = 0; i < 4; i++) sheepLeg(b, s, i);
}

/** One of a standing sheep's legs: 0 front left, 1 front right, 2 back left, 3 back right. */
function sheepLeg(b: PropBuilder, s: number, which: number): void {
  const lx = which < 2 ? 0.3 : -0.32;
  const lz = which % 2 === 0 ? 0.16 : -0.16;
  b.box([(lx - 0.04) * s, -0.05, (lz - 0.04) * s], [(lx + 0.04) * s, 0.42 * s, (lz + 0.04) * s], MAT.dark);
}

/**
 * A sheep's head, for a body built by sheepBody: a dark face longer than it is
 * wide, a narrower muzzle, two ears standing out sideways, and a cap of wool
 * between them. Held up, or (grazing) lowered to the grass on a neck stretched
 * down.
 */
function sheepHead(b: PropBuilder, s: number, wool: number, face: number, lying: boolean, grazing: boolean, seed: number, big = 1): void {
  const lift = (lying ? 0.33 : 0.62) * s;
  const k = s * big;
  // Where its skull is, and which way its muzzle points from there.
  const skull: V3 = grazing ? [0.7 * s, lift - 0.3 * s, 0] : [0.7 * s, lift + 0.3 * s, 0];
  const nose: V3 = grazing ? [0.07 * k, -0.15 * k, 0] : [0.15 * k, -0.07 * k, 0];
  if (grazing) b.lump([0.6 * s, lift - 0.08 * s, 0], [0.14 * s, 0.22 * s, 0.17 * s], wool, 0.12, seed + 5, false); // its neck, stretched down
  b.lump(skull, [0.15 * k, 0.14 * k, 0.12 * k], face, 0.05, seed + 6, false);
  b.lump([skull[0] + nose[0], skull[1] + nose[1], 0], [0.11 * k, 0.1 * k, 0.085 * k], face, 0.04, seed + 7, false);
  for (const side of [1, -1]) {
    b.lump([skull[0] - 0.06 * k, skull[1] + 0.03 * k, side * 0.17 * k], [0.055 * k, 0.035 * k, 0.1 * k], face, 0.03, seed + 8, false); // ears
  }
  b.lump([skull[0] - 0.06 * k, skull[1] + 0.11 * k, 0], [0.11 * k, 0.07 * k, 0.1 * k], wool, 0.12, seed + 9, false); // the cap of wool on its head
}

function buildSheep(b: PropBuilder, x: number, z: number, yaw: number, s: number, index: number): void {
  b.place(x, land(x, z), z, yaw);
  const wool = index % 5 === 1 ? MAT.woolBrown : index % 7 === 3 ? MAT.woolGrey : MAT.wool;
  // Dark faces on the white ones mostly; the dark-fleeced ones are dark all over.
  const face = wool === MAT.wool && index % 3 === 0 ? MAT.wool : MAT.dark;
  const lying = index % 4 === 2;
  const grazing = !lying && index % 3 !== 1; // most sheep, most of the time, are eating
  sheepBody(b, s, wool, lying, index * 11 + 1);
  sheepHead(b, s, wool, face, lying, grazing, index * 11 + 1);
  casts(1, x, land(x, z) + (lying ? 0.33 : 0.62) * s, z, yaw, 0.7 * s, 0.46 * s, 0.4 * s, wool === MAT.wool ? SHADE.wool : SHADE.dark);
}

/** How far the lamb's body comes down when it lies, and its head with it. */
export const LAMB = { size: 0.76, bodyDrop: 0.76 * 0.29, headDrop: 0.76 * 0.08, stride: 0.76 * 0.11, lift: 0.76 * 0.07 };

/**
 * The lamb that keeps you company by the fire, built standing at the origin
 * and facing +x so that it can be turned and moved as it walks. Its head is
 * built after the rest, so the two can be drawn apart: the head is lowered
 * when it lies down and raised when it looks at you. Each leg is built by
 * itself too, so that they can step as it walks. It is small, with a head a
 * little big for it as lambs have, and it wears a red ribbon so you know it
 * from the flock.
 */
function buildLamb(b: PropBuilder): { bodyEnd: number; legEnds: number[] } {
  const s = LAMB.size;
  b.place(0, 0, 0, 0);
  sheepBody(b, s, MAT.wool, false, 901, false);
  b.lump([0.5 * s, 0.76 * s, 0], [0.06 * s, 0.22 * s, 0.22 * s], MAT.redPaint, 0.02, 920, false); // its ribbon
  const bodyEnd = b.data.length / 9;
  const legEnds: number[] = [];
  for (let i = 0; i < 4; i++) {
    sheepLeg(b, s, i);
    legEnds.push(b.data.length / 9);
  }
  sheepHead(b, s, MAT.wool, MAT.dark, false, false, 901, 1.18);
  return { bodyEnd, legEnds };
}

/** A small lighthouse on the far cliff. Its lamp turns after dark. */
function buildLighthouse(b: PropBuilder): void {
  const z = -640;
  const x = cliffLine(z) + 26;
  b.place(x, land(x, z) - 0.5, z, 0);
  b.prism(8, 4.2, 3.2, 0, 9, MAT.whitewash);
  b.prism(8, 3.2, 2.9, 9, 12.5, MAT.redPaint);
  b.prism(8, 2.9, 2.6, 12.5, 18, MAT.whitewash);
  b.prism(8, 3.6, 3.6, 18, 19, MAT.boards, MAT.boards); // the gallery
  b.prism(8, 2.1, 2.1, 19, 22.5, MAT.beacon);
  b.prism(8, 2.7, 0.2, 22.5, 26, MAT.redPaint);
}

/** The village church: whitewashed, with a dark roof and a small spire. */
function buildChurch(b: PropBuilder, x: number, z: number): void {
  const L = 10;
  const W = 5;
  const wall = 6;
  const ridge = 5;
  b.place(x, 0, z, 0.04);
  const ground = Math.max(land(x - L, z + W), land(x + L, z + W), land(x - L, z - W), land(x + L, z - W));
  const foot = Math.min(land(x - L, z + W), land(x + L, z + W)) - 1;
  const eave = ground + wall;
  const top = eave + ridge;
  b.box([-L, foot, -W], [L, eave, W], MAT.whitewash);
  for (const s of [1, -1]) {
    b.tri([s * L, eave, -W], [s * L, eave, W], [s * L, top, 0], [s, 0, 0], MAT.whitewash);
    const nl = Math.hypot(1, ridge / W);
    b.quad([-L - 0.5, eave - 0.3, s * (W + 0.6)], [L + 0.5, eave - 0.3, s * (W + 0.6)], [L + 0.5, top + 0.2, 0], [-L - 0.5, top + 0.2, 0], [0, 1 / nl, (s * ridge) / W / nl], MAT.slate);
  }
  // Tall windows down the side that faces you.
  for (const cx of [-5.5, -1.5, 2.5]) {
    b.quad([cx - 0.8, ground + 1.6, W + 0.08], [cx + 0.8, ground + 1.6, W + 0.08], [cx + 0.8, ground + 4.8, W + 0.08], [cx - 0.8, ground + 4.8, W + 0.08], [0, 0, 1], MAT.glass);
  }
  // The bell turret and its spire.
  b.box([L - 4.2, top - 2.5, -1.9], [L - 0.4, top + 4, 1.9], MAT.whitewash);
  b.place(x + (L - 2.3) * Math.cos(0.04), 0, z - (L - 2.3) * Math.sin(0.04), 0.04 + Math.PI / 4);
  b.prism(4, 3.1, 0.15, top + 4, top + 10, MAT.slate);
  b.box([-0.25, top + 9.6, -0.25], [0.25, top + 13, 0.25], MAT.white);
  b.box([-1.1, top + 11.3, -0.25], [1.1, top + 11.9, 0.25], MAT.white);
}

const FLOCK: [number, number, number, number][] = [
  [-24, -24, 0.4, 1], [-29, -27, 2.6, 0.9], [-21, -30, 4.4, 0.8], [17, -22, 3.4, 1], [30, -30, 1.1, 1.05], [34, -27, 2.0, 0.85],
  [-52, -60, 5.0, 1], [-58, -66, 0.9, 0.95], [44, -66, 2.2, 0.95], [52, -84, 0.2, 1], [-30, -108, 4.1, 0.9],
  [16, -100, 1.2, 0.9], [24, -112, 3.0, 1], [-76, -98, 2.4, 0.9], [70, -110, 0.6, 0.95],
];

const BOULDERS: [number, number, number][] = [
  [-20, -14, 1.0], [11, -12, 0.7], [13.5, -13, 0.4], [24, -25, 1.3], [-36, -33, 1.1], [-4, -21, 0.55], [-38.5, -35, 0.5],
  [40, -58, 1.2], [-26, -82, 1.5], [-24, -85, 0.7], [58, -40, 0.9], [-70, -52, 1.4], [28, -92, 1.0], [-8, -118, 1.6],
  [-5, -121, 0.8], [66, -96, 1.3], [-56, -122, 1.1], [86, -70, 1.0], [-98, -74, 1.5], [4, -134, 1.2], [44, -130, 0.9],
];

/**
 * Stones on the beach and in the shallows off it: metres in front of where you
 * stand there, metres to your right, and size. Boulders at either end of the
 * shingle, rocks standing in the water, and loose cobbles lying about near you.
 */
const SHORE_STONES: [number, number, number][] = [
  [3.6, -8.4, 1.25], [1.2, -10.8, 1.7], [5.6, -11.6, 0.9], [2.8, 8.8, 1.4], [0.4, 11.4, 1.9], [5.3, 10.2, 0.8], [7.6, -9.6, 1.0], [8.0, 8.4, 1.15],
  [12.5, -5.5, 1.3], [16.5, 6.8, 1.8], [25, -13, 2.5], [10.8, 12.5, 1.1], [31, 4, 1.6], [20, -3.5, 0.8],
  [2.3, -2.7, 0.34], [3.2, 1.9, 0.28], [1.6, 3.5, 0.42], [4.4, -4.5, 0.38], [5.0, 3.7, 0.3], [3.0, -5.8, 0.5], [3.9, 6.0, 0.46], [5.7, -1.3, 0.26], [5.9, 1.5, 0.33],
  [2.0, 0.7, 0.22], [2.7, 5.1, 0.3], [4.7, 0.4, 0.24], [3.5, -1.0, 0.18], [4.1, 2.6, 0.2], [2.6, -4.2, 0.24], [6.3, -3.4, 0.3], [6.6, 4.8, 0.36],
];
/** Where each of those stands in the scene, and how big it is: for the shadow it lays on the shingle. */
export const shoreStones: [number, number, number][] = SHORE_STONES.map(([ahead, side, size]) => [
  BEACH.x + ahead * Math.sin(FACING_AT_START) + side * Math.cos(FACING_AT_START),
  BEACH.z - ahead * Math.cos(FACING_AT_START) + side * Math.sin(FACING_AT_START),
  size,
]);

// ---- the shingle: every stone of the beach, as a stone -----------------------------
// The beach is not painted to look stony: it is made of stones. Thousands of
// them, each a small faceted lump lying where the sea would leave it (cobbles
// thrown up on the ridge and in the hollow behind it, finer shingle down the
// foreshore, a few standing in the edge of the water), half sunk in the grit
// under them and lying over one another.

/** Numbers kept for each stone: where it lies and its size; then how it is turned, how flat it is, its tone, and a number of its own. */
export const STONE_FLOATS = 8;

/** One stone's shape, as flat faces: a point on a ball and the way its face looks, for each corner of each face. */
export function buildStoneShape(): Float32Array {
  const out: number[] = [];
  for (const face of LUMP_COARSE.faces) {
    const [a, b, c] = face.map((i) => LUMP_COARSE.points[i]);
    let n = norm(cross(sub(b, a), sub(c, a)));
    const outward = dot(n, a) > 0;
    if (!outward) n = [-n[0], -n[1], -n[2]];
    for (const q of outward ? [a, b, c] : [a, c, b]) out.push(q[0], q[1], q[2], n[0], n[1], n[2]);
  }
  return new Float32Array(out);
}

export function buildShingle(): Float32Array {
  const r = rng(4107);
  const out: number[] = [];
  const fx = Math.sin(FACING_AT_START);
  const fz = -Math.cos(FACING_AT_START);
  /** Lay stones on a jostled grid `gap` apart over the beach; `kind` says how big one at a given place is (0 for none). */
  const lay = (gap: number, kind: (up: number, far: number) => number, lift = 0) => {
    for (let ahead = 0.6; ahead < BEACH.toWater + 3.2; ahead += gap) {
      for (let side = -17; side < 17; side += gap) {
        const a = ahead + (r() - 0.5) * gap * 0.9;
        const sd = side + (r() - 0.5) * gap * 0.9;
        const x = BEACH.x + a * fx - sd * fz;
        const z = BEACH.z + a * fz + sd * fx;
        if (Math.hypot(x - BEACH.x, z - BEACH.z) > BEACH.r * 0.82) continue;
        const h = land(x, z);
        const size = kind(BEACH.toWater - a, Math.hypot(a, sd));
        if (size <= 0 || h < -0.14) continue;
        const flat = 0.36 + 0.34 * r();
        out.push(x, h + size * flat * (0.28 + lift), z, size, r() * 6.283, flat, r(), r());
      }
    }
  };
  // Further from where you stand a stone covers fewer pixels, so there they are laid bigger and wider apart.
  const thin = (far: number) => 1 + 0.9 * smooth(7, 15, far);
  // Fine shingle down the foreshore, and filling in everywhere else.
  lay(0.105, (up, far) => (r() < 1 / thin(far) ** 2 ? (0.036 + 0.05 * r() * r()) * thin(far) * (up < 2.6 ? 1 : 0.8) : 0));
  // Cobbles: thick on the ridge and behind it, thinning toward the water.
  lay(0.2, (up, far) => (r() < (0.16 + 0.78 * smooth(2.2, 3.8, up)) / thin(far) ? (0.075 + 0.085 * r()) * (1 + 0.35 * smooth(7, 15, far)) : 0));
  // A scatter of bigger ones lying on top of the rest.
  lay(0.55, (up) => (r() < 0.3 + 0.4 * smooth(2.5, 4.5, up) ? 0.13 + 0.1 * r() : 0), 0.3);
  return new Float32Array(out);
}

/**
 * The beach's own ground again, as a sheet to carry the water that each wave
 * runs up it: corners (x, the ground's height, z), in triangles.
 */
export function buildBeachSheet(): Float32Array {
  const cell = 0.3;
  const out: number[] = [];
  const x0 = BEACH.x - 19;
  const z0 = BEACH.z - 12;
  const nx = Math.round(38 / cell);
  const nz = Math.round(13 / cell);
  const at = (i: number, j: number): V3 => {
    const x = x0 + i * cell;
    const z = z0 + j * cell;
    return [x, land(x, z), z];
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i, j + 1);
      const d = at(i + 1, j + 1);
      if (Math.min(a[1], b[1], c[1], d[1]) > 0.8 || Math.max(a[1], b[1], c[1], d[1]) < -0.3) continue;
      for (const q of [a, c, b, b, c, d]) out.push(q[0], q[1], q[2]);
    }
  }
  return new Float32Array(out);
}

/** The footpath from where you stand, through the gap in the wall, to the nearest door. */
export const PATH: [number, number][] = [[0.6, -1.5], [-1.6, -13], [1.6, -26], [-0.8, -38], [1.2, -45.5], [6.2, -50.2]];

/** The dry-stone wall that crosses the meadow, in two runs with a gap for the path. */
const WALLS: [number, number][][] = [
  [[-118, -44], [-84, -40], [-52, -45], [-24, -43], [-1.6, -42]],
  [[3.4, -42.2], [26, -40], [54, -46], [84, -58], [112, -76]],
];

/** Where chimney smoke rises from: the meadow houses, then some of the village's. */
export const smokeSources: V3[] = [];
export const villageSmoke: V3[] = [];

function buildWall(b: PropBuilder, run: [number, number][]): void {
  b.place(0, 0, 0, 0);
  const half = 0.3;
  for (let i = 0; i < run.length - 1; i++) {
    const [x0, z0] = run[i];
    const [x1, z1] = run[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const pieces = Math.ceil(len / 2.2);
    const dx = (x1 - x0) / len;
    const dz = (z1 - z0) / len;
    casts(0, (x0 + x1) / 2, land((x0 + x1) / 2, (z0 + z1) / 2) + 0.3, (z0 + z1) / 2, Math.atan2(-dz, dx), len / 2, 0.75, 0.32, SHADE.rock);
    const n: V3 = [-dz, 0, dx]; // the face toward you
    for (let k = 0; k < pieces; k++) {
      const a = k / pieces;
      const c = (k + 1) / pieces;
      const ax = x0 + (x1 - x0) * a;
      const az = z0 + (z1 - z0) * a;
      const cx = x0 + (x1 - x0) * c;
      const cz = z0 + (z1 - z0) * c;
      // Each stretch is a slightly different height: it has stood a long time.
      const high = 0.85 + 0.3 * hash2(Math.round(ax * 3), Math.round(az * 3));
      const ga = land(ax, az);
      const gc = land(cx, cz);
      const p = (x: number, y: number, z: number, side: number): V3 => [x + n[0] * half * side, y, z + n[2] * half * side];
      b.quad(p(ax, ga - 0.3, az, 1), p(cx, gc - 0.3, cz, 1), p(cx, gc + high, cz, 1), p(ax, ga + high, az, 1), n, MAT.stone);
      b.quad(p(cx, gc - 0.3, cz, -1), p(ax, ga - 0.3, az, -1), p(ax, ga + high, az, -1), p(cx, gc + high, cz, -1), [-n[0], 0, -n[2]], MAT.stone);
      b.quad(p(ax, ga + high, az, 1), p(cx, gc + high, cz, 1), p(cx, gc + high, cz, -1), p(ax, ga + high, az, -1), [0, 1, 0], MAT.stone);
      b.quad(p(ax, ga - 0.3, az, -1), p(ax, ga - 0.3, az, 1), p(ax, ga + high, az, 1), p(ax, ga + high, az, -1), [-dx, 0, -dz], MAT.stone);
      b.quad(p(cx, gc - 0.3, cz, 1), p(cx, gc - 0.3, cz, -1), p(cx, gc + high, cz, -1), p(cx, gc + high, cz, 1), [dx, 0, dz], MAT.stone);
    }
  }
}

function distanceToPath(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i];
    const [bx, bz] = PATH[i + 1];
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)));
    best = Math.min(best, Math.hypot(x - ax - (bx - ax) * t, z - az - (bz - az) * t));
  }
  return best;
}

// ---- the old stone ---------------------------------------------------------------

/**
 * An old wayside shrine a few paces down the meadow, to your left: a rounded
 * standing stone on a stepped plinth, under a capstone, carved on the side that faces you.
 */
export const STONE = { x: -6.6, z: -10.2, yaw: 0.57, width: 1.62, height: 2.05 };

/** The four corners of its carved face, in world space: for telling when the pointer is on it. */
export let stoneFace: V3[] = [];

function buildStone(b: PropBuilder): void {
  const { x, z, yaw, width, height } = STONE;
  const foot = land(x, z) - 0.2;

  // A plinth of two worn slabs.
  b.place(x, foot, z, yaw);
  b.lump([0, 0.16, 0.05], [1.32, 0.3, 0.98], MAT.rock, 0.1, 31, true, true);
  b.lump([0.03, 0.42, 0.03], [1.02, 0.24, 0.74], MAT.rock, 0.1, 32, true, true);

  // The stone: rounded, leaning a little, carved on the side that faces you.
  const base = 0.5;
  const depth = 0.95;
  b.place(x, foot + base, z, yaw);
  b.stele(width, depth, height, MAT.runes, MAT.rock);
  casts(0, x, foot + base + height / 2, z, yaw, width / 2, height / 2 + 0.5, depth / 2, SHADE.rock);
  // A capstone laid over its crown like a small roof, and a pebble someone balanced on top.
  b.lump([0.07, height - 0.02, 0], [0.9, 0.3, 0.7], MAT.rock, 0.1, 33, true, true);
  b.lump([0.1, height + 0.3, 0], [0.25, 0.16, 0.21], MAT.rock, 0.2, 34, false);

  // A niche cut near its foot, with a candle in it that is lit after dark.
  const zf = depth / 2 + 0.02;
  b.quad([-0.22, 0.1, zf], [0.22, 0.1, zf], [0.22, 0.5, zf], [-0.22, 0.5, zf], [0, 0, 1], MAT.dark);
  b.quad([-0.05, 0.12, zf + 0.02], [0.05, 0.12, zf + 0.02], [0.05, 0.3, zf + 0.02], [-0.05, 0.3, zf + 0.02], [0, 0, 1], MAT.white);
  b.quad([-0.04, 0.3, zf + 0.03], [0.04, 0.3, zf + 0.03], [0.04, 0.41, zf + 0.03], [-0.04, 0.41, zf + 0.03], [0, 0, 1], MAT.glass);

  const w = width / 2;
  stoneFace = ([[-w, -base, zf], [w, -base, zf], [w, height + 0.2, zf], [-w, height + 0.2, zf]] as V3[]).map((p) => b.world(p));

  // A small cairn someone built beside it.
  b.place(x, foot, z, yaw);
  let y = 0.25;
  [0.5, 0.4, 0.31, 0.22].forEach((size, i) => {
    b.lump([w + 1.6 + 0.05 * (i % 2), y + size * 0.3, -0.3], [size, size * 0.42, size * 0.85], MAT.rock, 0.2, 40 + i, false, true);
    y += size * 0.55;
  });
}

// ---- the campfire ------------------------------------------------------------------
// The fire is how you keep time. Lighting it starts a spell of work; the logs
// stacked beside it are fed in one by one, so the pile shows how long is left;
// and each time it burns out, a stone goes on the cairn.

/** Where the fire is: a few paces down the meadow, just right of the path. */
export const FIRE = { x: 1.9, z: -12.4 };
/** The heart of the fire, in world space (set when it is built). */
export let fireHeart: V3 = [0, 0, 0];
export const PILE_LOGS = 5;
export const CAIRN_STONES = 12;

function buildFirePit(b: PropBuilder): void {
  const ground = land(FIRE.x, FIRE.z);
  b.place(FIRE.x, ground, FIRE.z, 0.4);
  fireHeart = b.world([0, 0.25, 0]);
  // A ring of stones round a bed of ash.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const size = 0.19 + 0.07 * hash2(i, 71);
    b.lump([Math.cos(a) * 0.82, 0.1, Math.sin(a) * 0.82], [size * 1.25, size * 0.95, size * 1.1], MAT.rock, 0.28, 100 + i, false, true);
  }
  b.lump([0, 0.0, 0], [0.7, 0.08, 0.7], MAT.char, 0.08, 120, true, true);
  // The fire is laid as a tepee: five logs standing in a ring and leaning
  // together at the top, so the flames climb up between them and the logs
  // stand dark against the fire behind.
  const unit = (v: V3): V3 => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const crossed = (p: V3, q: V3): V3 => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  /** A round log from one point to another, a little thinner at its far end. */
  const log = (from: V3, to: V3, thick: number) => {
    const along = unit([to[0] - from[0], to[1] - from[1], to[2] - from[2]]);
    const side = unit(crossed(along, [0.2, 0, 1]));
    const over = crossed(along, side);
    const SIDES = 6;
    const at = (end: V3, r: number, i: number): { p: V3; n: V3 } => {
      const a = (i / SIDES) * Math.PI * 2;
      const n: V3 = [side[0] * Math.cos(a) + over[0] * Math.sin(a), side[1] * Math.cos(a) + over[1] * Math.sin(a), side[2] * Math.cos(a) + over[2] * Math.sin(a)];
      return { p: [end[0] + n[0] * r, end[1] + n[1] * r, end[2] + n[2] * r], n };
    };
    for (let i = 0; i < SIDES; i++) {
      const a0 = at(from, thick, i);
      const a1 = at(from, thick, i + 1);
      const b0 = at(to, thick * 0.8, i);
      const b1 = at(to, thick * 0.8, i + 1);
      b.quad(a0.p, a1.p, b1.p, b0.p, unit([a0.n[0] + a1.n[0], a0.n[1] + a1.n[1], a0.n[2] + a1.n[2]]), MAT.char, true);
      b.tri(b0.p, b1.p, to, along, MAT.char); // its sawn end
    }
  };
  for (let i = 0; i < 5; i++) {
    const a = 0.5 + (i / 5) * Math.PI * 2;
    const h = hash2(i, 133);
    log([Math.cos(a) * 0.46, 0.03, Math.sin(a) * 0.46], [-Math.cos(a) * 0.1 + (h - 0.5) * 0.08, 0.72 + 0.1 * h, -Math.sin(a) * 0.1], 0.08);
  }
  // And one burnt through, lying in the ash.
  log([-0.42, 0.1, 0.2], [0.4, 0.12, -0.16], 0.075);
}

/**
 * Where the snow is gone, by the same rule the picture is drawn with (see
 * "thaw" in the shaders): 0 where it lies as deep as anywhere, 1 where there
 * is none. `melt` is how warm the ground round the fire is, 0..1.
 */
export function thawAt(x: number, z: number, melt: number): number {
  const step = (lo: number, hi: number, v: number) => {
    const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    return t * t * (3 - 2 * t);
  };
  const dx = x - FIRE.x;
  const dz = z - FIRE.z;
  const bare = 1 - step(0.45, 1.0, Math.hypot(dx, dz) / (1.1 + 2.5 * melt));
  const ax = -2.8;
  const az = 0.3;
  const bx = 3.8 - ax;
  const bz = -1.2 - az;
  const along = Math.max(0, Math.min(1, ((dx - ax) * bx + (dz - az) * bz) / (bx * bx + bz * bz)));
  const swept = 1 - step(0.75, 1.3, Math.hypot(dx - ax - bx * along, dz - az - bz * along));
  return Math.max(bare, 0.9 * swept);
}

/** The gramophone stands on a stump left of the path, side-on to you, its horn opening toward the middle of the view. */
export const MUSIC = { x: -2.6, z: -8.6, yaw: 1.5 };
/** Corners of a box round it, for telling when the pointer is on it. */
export let musicFrame: V3[] = [];
/** The mouth of its horn, where the notes come out, and the way the horn points. */
export let hornMouth: V3 = [0, 0, 0];
export let hornWay: V3 = [0, 0, 1];
/** The air just above the whole of it, where the name of the tune hangs. */
export let musicTop: V3 = [0, 0, 0];

/**
 * A wind-up gramophone: a tree stump, a walnut cabinet with a crank, a record
 * on its turntable, and a brass horn that rises from the back corner and
 * opens out to one side like a great flower. (Turned as it is here, -x is
 * toward you and +z is to your right.)
 */
function buildGramophone(b: PropBuilder): void {
  const ground = land(MUSIC.x, MUSIC.z) - 0.04;
  b.place(MUSIC.x, ground, MUSIC.z, MUSIC.yaw);
  b.prism(10, 0.34, 0.3, 0, 0.44, MAT.bark, MAT.cut);
  // The cabinet, on a dark plinth, with a crank on the side facing you.
  b.box([-0.27, 0.44, -0.27], [0.27, 0.48, 0.27], MAT.dark);
  b.box([-0.24, 0.48, -0.24], [0.24, 0.68, 0.24], MAT.walnut);
  b.box([-0.34, 0.56, -0.1], [-0.24, 0.6, -0.06], MAT.brass);
  b.box([-0.35, 0.5, -0.11], [-0.31, 0.62, -0.05], MAT.dark);
  // The record, with its red label.
  b.prism(12, 0.21, 0.21, 0.68, 0.7, MAT.dark, MAT.dark);
  b.prism(8, 0.07, 0.07, 0.7, 0.71, MAT.redPaint, MAT.redPaint);

  // The horn: rings of growing size along a curve that climbs from the back
  // corner, bends over, and flares into a wide bell with a curled lip.
  const spine: [V3, number][] = [
    [[0.12, 0.7, -0.16], 0.025],
    [[0.13, 0.98, -0.24], 0.034],
    [[0.1, 1.2, -0.17], 0.052],
    [[0.05, 1.34, 0.02], 0.09],
    [[0.0, 1.41, 0.26], 0.16],
    [[-0.04, 1.45, 0.5], 0.26],
    [[-0.06, 1.47, 0.64], 0.35],
    [[-0.07, 1.47, 0.69], 0.41],
  ];
  const SIDES = 12;
  const unit = (v: V3): V3 => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const crossed = (a: V3, c: V3): V3 => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]];
  /** The ring of points round one place on the spine, and which way the horn runs there. */
  const ring = (k: number, scale = 1): { points: V3[]; out: V3[]; way: V3; centre: V3 } => {
    const [c, r] = spine[k];
    const before = spine[Math.max(0, k - 1)][0];
    const after = spine[Math.min(spine.length - 1, k + 1)][0];
    const way = unit([after[0] - before[0], after[1] - before[1], after[2] - before[2]]);
    const side = unit(crossed(way, [0.3, 1, 0]));
    const over = crossed(way, side);
    const points: V3[] = [];
    const out: V3[] = [];
    for (let i = 0; i < SIDES; i++) {
      const a = (i / SIDES) * Math.PI * 2;
      const d: V3 = [side[0] * Math.cos(a) + over[0] * Math.sin(a), side[1] * Math.cos(a) + over[1] * Math.sin(a), side[2] * Math.cos(a) + over[2] * Math.sin(a)];
      out.push(d);
      points.push([c[0] + d[0] * r * scale, c[1] + d[1] * r * scale, c[2] + d[2] * r * scale]);
    }
    return { points, out, way, centre: c };
  };
  const mid = (a: V3, c: V3): V3 => unit([a[0] + c[0], a[1] + c[1], a[2] + c[2]]);
  for (let k = 0; k + 1 < spine.length; k++) {
    const lower = ring(k);
    const upper = ring(k + 1);
    for (let i = 0; i < SIDES; i++) {
      const j = (i + 1) % SIDES;
      b.quad(lower.points[i], lower.points[j], upper.points[j], upper.points[i], mid(lower.out[i], lower.out[j]), MAT.brass, true);
    }
  }
  // Looking into it: the inside of the bell is polished brass, darkening down the throat.
  const lip = ring(spine.length - 1);
  const within = ring(spine.length - 3, 0.9);
  const throat = ring(spine.length - 4, 0.8);
  for (let i = 0; i < SIDES; i++) {
    const j = (i + 1) % SIDES;
    const inward = mid(lip.out[i], lip.out[j]);
    const facing = unit([lip.way[0] * 0.6 - inward[0], lip.way[1] * 0.6 - inward[1], lip.way[2] * 0.6 - inward[2]]);
    b.quad(lip.points[j], lip.points[i], within.points[i], within.points[j], facing, MAT.hornBell, true);
    b.quad(within.points[j], within.points[i], throat.points[i], throat.points[j], facing, MAT.hornThroat, true);
    b.tri(throat.points[i], throat.points[j], throat.centre, lip.way, MAT.hornThroat);
  }

  hornMouth = b.world([lip.centre[0] + lip.way[0] * 0.1, lip.centre[1] + lip.way[1] * 0.1, lip.centre[2] + lip.way[2] * 0.1]);
  const tip = b.world([lip.centre[0] + lip.way[0], lip.centre[1] + lip.way[1], lip.centre[2] + lip.way[2]]);
  const from = b.world(lip.centre);
  hornWay = [tip[0] - from[0], tip[1] - from[1], tip[2] - from[2]];
  musicTop = b.world([0, 2.0, 0.28]);
  musicFrame = [];
  for (const x of [-0.42, 0.42]) for (const y of [0, 1.9]) for (const z of [-0.42, 1.0]) musicFrame.push(b.world([x, y, z]));
  // What it does to the light: the stump and cabinet stand in for it as a box. (The horn is
  // a thin shell; a solid stand-in for it would leave the horn itself in the dark.)
  casts(0, MUSIC.x, ground + 0.34, MUSIC.z, MUSIC.yaw, 0.3, 0.34, 0.3, SHADE.dark);
}

/**
 * The logs waiting beside the fire: five rounds stood on end in a row, with
 * grass showing between them, so they can be counted at a glance. Built from
 * the far end inward, so drawing fewer takes them from the end nearest the fire.
 */
function buildPileLog(b: PropBuilder, i: number): void {
  b.place(FIRE.x, 0, FIRE.z, 0.32);
  const [x, , z] = b.world([3.6 - i * 0.48, 0, 0.15 + 0.05 * (i % 2)]);
  b.place(x, land(x, z) - 0.05, z, i * 0.7);
  const high = 0.46 + 0.07 * ((i * 3) % 2);
  b.prism(8, 0.18, 0.175, 0, high - 0.08, MAT.bark);
  b.prism(8, 0.175, 0.17, high - 0.08, high, MAT.cut, MAT.cut);
}

/** One stone of the cairn that grows with each spell of work finished. Two stacks of six. */
function buildCairnStone(b: PropBuilder, i: number): void {
  const stack = Math.floor(i / 6);
  const level = i % 6;
  const sx = FIRE.x - 1.75 - stack * 0.95;
  const sz = FIRE.z + 0.55 - stack * 0.5;
  b.place(sx, land(sx, sz), sz, i * 1.7);
  const sizes = [0.36, 0.31, 0.27, 0.23, 0.19, 0.15];
  let y = 0.02;
  for (let k = 0; k < level; k++) y += sizes[k] * 0.5;
  const size = sizes[level];
  b.lump([0.03 * (level % 2 ? 1 : -1), y + size * 0.26, 0], [size, size * 0.42, size * 0.86], MAT.rock, 0.2, 200 + i, false, true);
}

/** The bottle on the beach, among the parts that come and go: [first vertex, how many]. */
export let bottleRange: [number, number] = [0, 0];

/**
 * A corked bottle of sea-green glass, built lying on its side at the origin
 * with its neck toward +x and tipped up a little, as a bottle lies on stones,
 * so that it can be turned and moved: it lies on the shingle, is thrown, and
 * floats. (Larger than life, like the stones it lies on, so that it can be
 * made out.)
 */
function buildBottle(b: PropBuilder): void {
  const first = b.data.length / 9;
  const tip = 0.09;
  b.place(-0.23, 0, 0, 0);
  // From the middle of its base: the heel, the straight body, the shoulder, the neck, and the ring round its mouth.
  const glass: [number, number][] = [
    [0, 0], [0, 0.052], [0.014, 0.062], [0.127, 0.062], [0.244, 0.062], [0.276, 0.0575], [0.306, 0.044],
    [0.331, 0.03], [0.354, 0.023], [0.428, 0.02], [0.428, 0.027], [0.448, 0.027], [0.448, 0.016],
  ];
  b.turned(glass, glass.map(() => MAT.seaGlass), 12, tip, 0.058);
  b.turned([[0.448, 0.02], [0.49, 0.0215], [0.497, 0.015], [0.497, 0]], [MAT.cork, MAT.cork, MAT.cork], 8, tip, 0.058);
  bottleRange = [first, b.data.length / 9 - first];
}

// ---- the lanterns by the path ---------------------------------------------------------
// Every task written on the stone (a line that begins "- ") stands beside the
// footpath as a small lantern of iron and glass on a wooden stake. It is lit
// after dark, and when the task is done its light is let go as a paper lantern.

/**
 * Where the lanterns stand, in the order they are taken up: x, z, the way each
 * is turned, and how tall its stake is. They line the path on both sides, the
 * nearest first: two at your feet and one before the fire, then (past the
 * gramophone, the fire and its cairn, which have that stretch to themselves)
 * on down toward the houses, on taller stakes there to stand clear of the grass.
 */
const LANTERN_SPOTS: [number, number, number, number][] = [
  [0.75, -5.8, 0.3, 0.44],
  [-1.25, -5.7, -0.25, 0.38],
  [0.45, -7.9, 0.55, 0.5],
  [-1.95, -15.0, 0.1, 0.6],
  [0.1, -16.6, -0.4, 0.66],
  [-1.05, -18.8, 0.35, 0.6],
  [1.3, -21.5, -0.15, 0.7],
];
export const LANTERNS = LANTERN_SPOTS.length;
/** For each lantern: the corners of a box round it (for the pointer), the air just above it (where its words hang), and where its flame is. */
export const lanternFrames: V3[][] = [];
export const lanternTops: V3[] = [];
export const lanternFlames: V3[] = [];
/** Where each lantern lies in the mesh, as [first vertex, how many]; and the paper lantern, which is built after them. */
export const lanternParts: [number, number][] = [];
export let paperPart: [number, number] = [0, 0];

/** One lantern, standing in its place. */
function buildLantern(b: PropBuilder, i: number): void {
  const [x, z, yaw, stake] = LANTERN_SPOTS[i];
  b.place(x, land(x, z) - 0.02, z, yaw);
  const iron = MAT.lanternIron;
  // The stake, driven into the turf, and a plate on top of it for the lantern to sit on.
  b.box([-0.03, -0.3, -0.03], [0.03, stake, 0.03], MAT.lanternStake);
  b.box([-0.125, stake, -0.125], [0.125, stake + 0.035, 0.125], iron);
  // Four panes of glass. (Each is measured from its own lower corner, so that the candle can be drawn in the middle of it.)
  const foot = stake + 0.035;
  const head = foot + 0.27;
  const g = 0.085;
  b.quad([-g, foot, g], [g, foot, g], [g, head, g], [-g, head, g], [0, 0, 1], MAT.lanternGlass, true);
  b.quad([g, foot, -g], [-g, foot, -g], [-g, head, -g], [g, head, -g], [0, 0, -1], MAT.lanternGlass, true);
  b.quad([g, foot, g], [g, foot, -g], [g, head, -g], [g, head, g], [1, 0, 0], MAT.lanternGlass, true);
  b.quad([-g, foot, -g], [-g, foot, g], [-g, head, g], [-g, head, -g], [-1, 0, 0], MAT.lanternGlass, true);
  // An iron bar up each corner, and a rim round the top of the glass.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([sx * 0.094 - 0.017, foot, sz * 0.094 - 0.017], [sx * 0.094 + 0.017, head, sz * 0.094 + 0.017], iron);
  b.box([-0.12, head, -0.12], [0.12, head + 0.03, 0.12], iron);
  // Its roof: four plates sloping in to a vent, steep enough to shed rain and flat enough for snow to sit on.
  const eave = head + 0.03;
  const peak = eave + 0.11;
  for (let k = 0; k < 4; k++) {
    const dx = Math.round(Math.sin((k * Math.PI) / 2));
    const dz = Math.round(Math.cos((k * Math.PI) / 2));
    const p = (side: number, r: number, y: number): V3 => [dx * r + dz * side * r, y, dz * r - dx * side * r];
    b.quad(p(-1, 0.145, eave), p(1, 0.145, eave), p(1, 0.04, peak), p(-1, 0.04, peak), norm([dx * 0.11, 0.105, dz * 0.11]), iron);
  }
  b.box([-0.045, peak, -0.045], [0.045, peak + 0.03, 0.045], iron);
  // And a ring to carry it by. (On the far ones, where a ring would be thinner than a pixel, a plain knob.)
  if (Math.hypot(x, z) < 11) {
    for (const sx of [-1, 1]) b.box([sx * 0.045 - 0.012, peak + 0.03, -0.012], [sx * 0.045 + 0.012, peak + 0.085, 0.012], iron);
    b.box([-0.057, peak + 0.085, -0.012], [0.057, peak + 0.107, 0.012], iron);
  } else {
    b.box([-0.03, peak + 0.03, -0.03], [0.03, peak + 0.1, 0.03], iron);
  }

  // (The far ones are given more room round them, so that they are no harder to point at.)
  const reach = Math.max(0.21, 0.02 * Math.hypot(x, z));
  const frame: V3[] = [];
  for (const fx of [-reach, reach]) for (const fy of [0, peak + 0.14]) for (const fz of [-reach, reach]) frame.push(b.world([fx, fy, fz]));
  lanternFrames[i] = frame;
  lanternTops[i] = b.world([0, peak + 0.3, 0]);
  lanternFlames[i] = b.world([0, foot + 0.12, 0]);
}

/**
 * The paper lantern a finished task rises away as: a bag of thin paper, open
 * at the mouth, widest near its shoulder and drawn in over the crown. Built
 * at the origin with its mouth at the bottom, so it can be moved, turned and
 * made smaller as it goes. (Its faces are triangles, whose pattern runs with height.)
 */
function buildPaperLantern(b: PropBuilder): void {
  b.place(0, 0, 0, 0);
  const rings: [number, number][] = [[0, 0.085], [0.07, 0.122], [0.2, 0.155], [0.32, 0.16], [0.4, 0.125], [0.44, 0.06], [0.455, 0.004]];
  const SIDES = 8;
  for (let k = 0; k + 1 < rings.length; k++) {
    const [y0, r0] = rings[k];
    const [y1, r1] = rings[k + 1];
    for (let i = 0; i < SIDES; i++) {
      const a0 = (i / SIDES) * Math.PI * 2;
      const a1 = ((i + 1) / SIDES) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const at = (a: number, r: number, y: number): V3 => [Math.cos(a) * r, y, Math.sin(a) * r];
      const n = norm([Math.cos(am) * (y1 - y0), r0 - r1, Math.sin(am) * (y1 - y0)]);
      b.tri(at(a0, r0, y0), at(a1, r0, y0), at(a1, r1, y1), n, MAT.lanternPaper);
      b.tri(at(a0, r0, y0), at(a1, r1, y1), at(a0, r1, y1), n, MAT.lanternPaper);
      // Looking up into its mouth, the light of the flame.
      if (k === 0) b.tri(at(a0, 0.1, 0.045), at(a1, 0.1, 0.045), [0, 0.045, 0], [0, -1, 0], MAT.lanternPaper);
    }
  }
}

/** The lanterns and the paper lantern go at the end of the mesh, with the other things that come and go. */
function buildLanterns(b: PropBuilder): void {
  const count = () => b.data.length / 9;
  for (let i = 0; i < LANTERNS; i++) {
    const first = count();
    buildLantern(b, i);
    lanternParts[i] = [first, count() - first];
  }
  const first = count();
  buildPaperLantern(b);
  paperPart = [first, count() - first];
}

// ---- what the old stone remembers ---------------------------------------------------------
// The almanac (almanac.ts) keeps a record of what has been seen from here. For
// each thing remembered a pale pebble is laid on the old stone, as they are
// left on a cairn: first on its capstone, where they catch the light, then
// along the step at its foot, and at last along the lower step of the plinth,
// so that months of looking can be seen from where you stand.

export const TOKENS = 36;
/** Where the first of those pebbles lies in the mesh, and how many vertices each one is. */
export let tokenParts = { start: 0, each: 0 };

/** One of the pebbles, in the order they are laid: each row starts in the middle of the stone's front and grows outward to both sides. */
function buildToken(b: PropBuilder, i: number): void {
  const { x, z, yaw, height } = STONE;
  b.place(x, land(x, z) - 0.2, z, yaw);
  /** The height of a slab's upper face at a spot: a dome with its middle at `c`, reaching `r` each way. */
  const dome = (c: V3, r: V3, px: number, pz: number) => c[1] + r[1] * Math.sqrt(Math.max(0.05, 1 - ((px - c[0]) / r[0]) ** 2 - ((pz - c[2]) / r[2]) ** 2));
  /** The n-th place out from the middle of a row: 0, then one to the right, one to the left, two to the right, and so on. */
  const outward = (n: number) => (n % 2 ? (n + 1) / 2 : -n / 2);
  /** And for a row with nothing in the middle: half a place right, half a place left, one and a half right, and so on. */
  const astride = (n: number) => (n % 2 ? -1 : 1) * (Math.floor(n / 2) + 0.5);
  const cap: [V3, V3] = [[0.07, 0.5 + height - 0.02, 0], [0.9, 0.3, 0.7]];
  let px: number;
  let pz: number;
  let py: number;
  if (i < 9) {
    // The capstone, along its front edge.
    const a = (outward(i) * 21 * Math.PI) / 180;
    px = 0.07 + 0.64 * Math.sin(a);
    pz = 0.5 * Math.cos(a);
    py = dome(cap[0], cap[1], px, pz);
  } else if (i < 15) {
    // And behind those, round the pebble that was there already.
    const a = (astride(i - 9) * 36 * Math.PI) / 180;
    px = 0.07 + 0.43 * Math.sin(a);
    pz = 0.34 * Math.cos(a);
    py = dome(cap[0], cap[1], px, pz);
  } else if (i < 25) {
    // The step at the stone's own foot, leaving the candle's niche clear.
    const a = (astride(i - 15) * 16 + Math.sign(astride(i - 15)) * 18) * (Math.PI / 180);
    px = 0.03 + 0.93 * Math.sin(a);
    pz = 0.03 + 0.63 * Math.cos(a);
    py = dome([0.03, 0.42, 0.03], [1.02, 0.24, 0.74], px, pz);
  } else {
    // The lower step of the plinth, outside the upper one.
    const a = (outward(i - 25) * 15 * Math.PI) / 180;
    px = 0.015 + 1.17 * Math.sin(a);
    pz = 0.04 + 0.87 * Math.cos(a);
    py = dome([0, 0.16, 0.05], [1.32, 0.3, 0.98], px, pz);
  }
  // Pale, so that they show against the dark rock: no two the same size, and
  // white, cream or grey by turns (three materials, one after another).
  const size = 0.07 + 0.035 * hash2(i, 311);
  const tone = Math.floor(hash2(i, 173) * 2.999);
  b.lump([px, py + size * 0.22, pz], [size, size * 0.72, size * 0.9], MAT.token + tone, 0.22, 400 + i, false, true);
}

function buildTokens(b: PropBuilder): void {
  const first = b.data.length / 9;
  for (let i = 0; i < TOKENS; i++) buildToken(b, i);
  tokenParts = { start: first, each: (b.data.length / 9 - first) / TOKENS };
}

export interface Props {
  /** position 3, normal 3, uv 2, material 1 */
  vertices: Float32Array;
  roofs: RoofPatch[];
  /** How many vertices are always drawn; the pile and the cairn follow, each piece the same size. */
  fixed: number;
  pile: { start: number; each: number };
  cairn: { start: number; each: number };
  /** The lamb: its body and tail, each of its four legs, then its head. Each is [first vertex, how many]. */
  lamb: { body: [number, number]; legs: [number, number][]; head: [number, number] };
  /** The fishing boat, built at the origin with its bow toward +x: [first vertex, how many]. */
  boat: [number, number];
  /** A puffin, standing at the origin: its body, then its head. */
  puffin: { body: [number, number]; head: [number, number] };
}

/** Where puffins stand in their season (set when the place is built). */
export let perches: Perch[] = [];

export function buildProps(): Props {
  const b = new PropBuilder();
  const roofs: RoofPatch[] = [];
  for (const h of HOUSES) buildHouse(b, h, roofs);
  FLOCK.forEach(([x, z, yaw, size], i) => buildSheep(b, x, z, yaw, size, i));
  BOULDERS.forEach(([x, z, size], i) => {
    b.place(x, land(x, z), z, x * 1.3);
    b.lump([0, 0.16 * size, 0], [size, 0.66 * size, 0.8 * size], MAT.rock, 0.24, i + 60, size > 0.8, true);
    casts(1, x, land(x, z) + 0.16 * size, z, x * 1.3, size, 0.66 * size, 0.8 * size, SHADE.rock);
  });
  // The stones of the beach. The big ones are craggy and sit deep; the cobbles are sea-worn and smooth.
  shoreStones.forEach(([x, z, size], i) => {
    const ground = Math.max(land(x, z), -0.45 * size); // one out in the water stands on the bottom, or is mostly under
    b.place(x, ground, z, x * 2.1 + z);
    if (size > 0.6) b.lump([0, 0.14 * size, 0], [size, 0.62 * size, 0.78 * size], MAT.rock, 0.24, i + 400, size > 0.8, true);
    else b.lump([0, 0.2 * size, 0], [size, 0.5 * size, 0.74 * size], MAT.rock, 0.1, i + 400, false, true);
  });
  // An upturned rowing boat, wintering beside the red house.
  b.place(-17.5, land(-17.5, -57) + 0.1, -57, 0.9);
  b.lump([0, 0.3, 0], [2.3, 0.62, 0.82], MAT.boards, 0.03, 90, true, true);
  casts(1, -17.5, land(-17.5, -57) + 0.4, -57, 0.9, 2.3, 0.62, 0.82, SHADE.dark);
  buildLighthouse(b);
  buildChurch(b, 64, -404);
  // Round the village: haystacks drying in the mown fields, and its own sheep on the slope.
  // (Larger than life, like its houses, so they can be made out from here.)
  const stacks: [number, number][] = [[52, -352], [108, -356], [16, -374], [134, -388], [90, -410], [44, -428]];
  stacks.forEach(([x, z], i) => {
    b.place(x, land(x, z), z, i);
    b.lump([0, 1.5, 0], [2.3, 2.5, 2.3], MAT.ochre, 0.08, 300 + i, true, true);
  });
  const grazing: [number, number][] = [[36, -402], [58, -436], [104, -424], [140, -360], [70, -446], [12, -398], [128, -440], [96, -438]];
  grazing.forEach(([x, z], i) => {
    b.place(x, land(x, z), z, i * 2.1);
    b.lump([0, 1.0, 0], [1.9, 1.2, 1.2], i % 3 === 1 ? MAT.woolBrown : MAT.wool, 0.1, 320 + i, false, true);
    b.lump([2.0, 1.5, 0], [0.6, 0.5, 0.45], MAT.dark, 0.05, 340 + i, false);
  });
  buildStone(b);
  for (const run of WALLS) buildWall(b, run);
  buildFirePit(b);
  buildGramophone(b);
  // The places puffins stand in their season, and a few rocks for them to stand on: one is the cairn by the old stone.
  b.place(STONE.x, land(STONE.x, STONE.z) - 0.2, STONE.z, STONE.yaw);
  const cairnTop = b.world([STONE.width / 2 + 1.65, 1.04, -0.3]);
  perches = buildPerches(b, MAT, land, cairnTop, (ahead, aside) => [
    BEACH.x + Math.sin(FACING) * ahead + Math.cos(FACING) * aside,
    BEACH.z - Math.cos(FACING) * ahead + Math.sin(FACING) * aside,
  ]);

  // The parts that come and go are kept at the end, so any number of them can be drawn.
  const count = () => b.data.length / 9;
  const fixed = count();
  for (let i = 0; i < PILE_LOGS; i++) buildPileLog(b, i);
  const pile = { start: fixed, each: (count() - fixed) / PILE_LOGS };
  const cairnStart = count();
  for (let i = 0; i < CAIRN_STONES; i++) buildCairnStone(b, i);
  const cairn = { start: cairnStart, each: (count() - cairnStart) / CAIRN_STONES };
  const lambStart = count();
  const { bodyEnd, legEnds } = buildLamb(b);
  const legs = legEnds.map((end, i) => [i === 0 ? bodyEnd : legEnds[i - 1], end - (i === 0 ? bodyEnd : legEnds[i - 1])] as [number, number]);
  const lamb = { body: [lambStart, bodyEnd - lambStart] as [number, number], legs, head: [legEnds[3], count() - legEnds[3]] as [number, number] };
  buildBottle(b);
  // The lanterns by the path and the small stones laid on the old stone come and go as well.
  buildLanterns(b);
  buildTokens(b);
  // The fishing boat, which goes out and comes home, and a puffin, drawn once for each that is about.
  const boatStart = count();
  buildBoat(b, MAT);
  const boat: [number, number] = [boatStart, count() - boatStart];
  const puffin = buildPuffin(b, MAT);
  return { vertices: new Float32Array(b.data), roofs, fixed, pile, cairn, lamb, boat, puffin };
}

function insideHouse(x: number, z: number): boolean {
  for (const h of HOUSES) {
    const dx = x - h.x;
    const dz = z - h.z;
    const c = Math.cos(h.yaw);
    const s = Math.sin(h.yaw);
    // back into the house's own frame
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    if (Math.abs(lx) < h.len / 2 + 0.25 && Math.abs(lz) < h.wid / 2 + 0.25) return true;
  }
  return false;
}

// ---- the waterfall ----------------------------------------------------------------

/**
 * A ribbon of falling water down the cliff face (position 3, then across 0..1
 * and down 0..1), widening as it falls, followed by a patch of spray at its foot.
 */
export function buildFall(): { ribbon: Float32Array; spray: Float32Array; lip: V3 } {
  const top = land(FALL.x, FALL.z - 6) + 0.5;
  // (Rows enough for the wind to bend it: the fall's shader walks its path a row at a time, and counts the same number.)
  const rows = 36;
  const ribbon: number[] = [];
  const at = (i: number, side: number): number[] => {
    const v = i / rows;
    const half = 3.2 + 3.4 * v;
    // It leaves the rim and arcs slightly outward, toward you.
    return [FALL.x + side * half, top * (1 - v), FALL.z - 2 + 7.5 * Math.sqrt(v), side * 0.5 + 0.5, v];
  };
  for (let i = 0; i < rows; i++) {
    const a = at(i, -1);
    const b = at(i, 1);
    const c = at(i + 1, 1);
    const d = at(i + 1, -1);
    ribbon.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  const z = FALL.z + 7;
  const w = 16;
  const hgt = 15;
  const quad = [
    [FALL.x - w, -1, z, 0, 1], [FALL.x + w, -1, z, 1, 1], [FALL.x + w, hgt, z, 1, 0],
    [FALL.x - w, -1, z, 0, 1], [FALL.x + w, hgt, z, 1, 0], [FALL.x - w, hgt, z, 0, 0],
  ];
  return { ribbon: new Float32Array(ribbon), spray: new Float32Array(quad.flat()), lip: [FALL.x, top, FALL.z - 2] };
}

// ---- grass -----------------------------------------------------------------------

/** Floats per blade: root x, y, z, height, facing, width, phase, tint, and the ground's slope (x, z). */
export const BLADE_FLOATS = 10;

export interface Meadow {
  /** Blades of grass, nearest first. */
  blades: Float32Array;
  /** Flower heads, in the same layout as blades; each sits on top of a stem among the blades. */
  flowers: Float32Array;
}

// What a blade's tint means to the shader.
const RUSH = 0.03; // a dark, tall rush
const STRAW = 0.1; // a dry stalk
const PETAL = { yellow: 0.97, white: 0.98, pink: 0.99, violet: 0.997 };

/**
 * The meadow's grass grows in tufts: three blades to a tuft, one upright and
 * two splayed, with turf showing between them. Tufts are scattered so that
 * they look evenly dense on screen: thick at your feet and thinning with
 * distance. Rushes stand in the damper hollows, and flowers grow in drifts.
 */
export function buildGrass(tufts: number, roofs: RoofPatch[]): Meadow {
  const r = rng(4242);
  const blades: number[][] = [];
  const flowers: number[][] = [];
  const nearest = Math.log(3.6);
  const furthest = Math.log(110);
  const WIDTH = 0.024;

  /** Whether grass can grow at a spot, and whether it must be kept short there. */
  const ground = (x: number, z: number): 'no' | 'short' | 'yes' => {
    const y = land(x, z);
    if (y < 1.5 + r() * 1.4) return 'no'; // bare rock at the shore
    if (insideHouse(x, z)) return 'no';
    if (distanceToPath(x, z) < 0.55 + r() * 0.35) return 'no'; // feet have worn the path bare
    // Keep the grass off the shrine and short on the line between it and you, so its carving shows.
    const sx = x - STONE.x;
    const sz = z - STONE.z;
    const toward = sx * Math.sin(STONE.yaw) + sz * Math.cos(STONE.yaw);
    const across = sx * Math.cos(STONE.yaw) - sz * Math.sin(STONE.yaw);
    const beforeStone = Math.abs(across) < 1.1 && toward > -0.6 && toward < 4.5;
    if (beforeStone && toward < 0.5) return 'no';
    // The same round the fire, its row of logs and its cairn.
    const fx = x - FIRE.x;
    const fz = z - FIRE.z;
    if (Math.hypot(fx, fz) < 1.0) return 'no';
    const byFire = Math.abs(fx + 0.4) < 3.4 && fz > -1.4 && fz < 4.5;
    // And round the gramophone, kept short on your side of it.
    const mx = x - MUSIC.x;
    const mz = z - MUSIC.z;
    if (Math.hypot(mx, mz) < 0.5) return 'no';
    const byMusic = Math.hypot(mx, mz - 1.2) < 2.0;
    return beforeStone || byFire || byMusic ? 'short' : 'yes';
  };

  let made = 0;
  let guard = 0;
  while (made < tufts && guard++ < tufts * 8) {
    const d = Math.exp(nearest + (furthest - nearest) * r() ** 1.25); // weighted toward your feet
    const az = FACING + (r() - 0.5) * 2 * 1.15;
    const x = EYE[0] + d * Math.sin(az);
    const z = EYE[2] - d * Math.cos(az);
    const where = ground(x, z);
    if (where === 'no') continue;
    made++;
    const y = land(x, z);
    const n = normalAt(x, z, 0.8);
    // Longer in sheltered patches; the grass right in front of you is long and frames the view.
    const lush = 0.75 + 0.5 * noise(x / 9 + 3, z / 9 + 8);
    let tall = (0.42 + 0.46 * r() * r()) * lush * (1 + 0.8 * smooth(15, 6, d));
    // Rushes stand in the damp hollows: darker, stiffer and taller than the grass.
    const damp = noise(x / 14 + 31, z / 14 + 17);
    const rush = where === 'yes' && damp > 0.7 && r() < 0.5;
    if (rush) tall = 0.75 + 0.45 * r();
    if (where === 'short') tall = Math.min(tall, 0.2 + 0.12 * r());
    const tint = rush ? RUSH : r() < 0.07 ? STRAW : Math.min(0.94, Math.max(0.16, 0.5 + 0.35 * fbm(x / 5, z / 5) + (r() - 0.5) * 0.4));
    const facing = r() * 6.283;
    const phase = r() * 6.283;
    const count = rush ? 5 : 3;
    for (let k = 0; k < count; k++) {
      // The first blade stands; the rest lean outward round it.
      const f = k === 0 ? facing : facing + (k / (count - 1)) * 6.283 + (r() - 0.5) * 0.7;
      const off = k === 0 ? 0 : 0.03 + 0.05 * r();
      const hgt = tall * (k === 0 ? 1 : rush ? 0.75 + 0.25 * r() : 0.55 + 0.3 * r());
      blades.push([x + Math.cos(f) * off, y - 0.03, z + Math.sin(f) * off, hgt, f, WIDTH * (0.8 + 0.5 * r()), phase, tint, n[0], n[2], d]);
    }
  }

  // Flowers grow in drifts, each drift mostly of one kind.
  const kinds = [PETAL.yellow, PETAL.yellow, PETAL.white, PETAL.white, PETAL.pink, PETAL.violet];
  for (let drift = 0; drift < 90; drift++) {
    const d = Math.exp(nearest + (Math.log(85) - nearest) * r() ** 1.1);
    const az = FACING + (r() - 0.5) * 2 * 1.1;
    const cx = EYE[0] + d * Math.sin(az);
    const cz = EYE[2] - d * Math.cos(az);
    const kind = kinds[Math.floor(r() * kinds.length)];
    const spread = 0.8 + 2.4 * r();
    const blooms = Math.round(8 + 26 * r());
    for (let i = 0; i < blooms; i++) {
      const x = cx + (r() + r() + r() - 1.5) * spread;
      const z = cz + (r() + r() + r() - 1.5) * spread;
      if (ground(x, z) !== 'yes') continue;
      const y = land(x, z);
      const n = normalAt(x, z, 0.8);
      const fd = Math.hypot(x - EYE[0], z - EYE[2]);
      const tall = 0.34 + 0.3 * r();
      const facing = r() * 6.283;
      const phase = r() * 6.283;
      const tint = r() < 0.85 ? kind : kinds[Math.floor(r() * kinds.length)];
      blades.push([x, y - 0.03, z, tall, facing, WIDTH * 0.7, phase, 0.5, n[0], n[2], fd]); // its stem
      flowers.push([x, y - 0.03, z, tall, facing, WIDTH, phase, tint, n[0], n[2], fd]);
    }
  }

  // The roofs are living turf too.
  for (const roof of roofs) {
    const far = Math.hypot(roof.origin[0], roof.origin[2]) > 200;
    const area = Math.hypot(...roof.along) * Math.hypot(...roof.up);
    const n = Math.round(area * (far ? 1.5 : 22));
    const up = [roof.up[0], roof.up[1], roof.up[2]];
    const ul = Math.hypot(...up);
    for (let i = 0; i < n; i++) {
      const u = r();
      const v = r();
      const x = roof.origin[0] + roof.along[0] * u + roof.up[0] * v;
      const y = roof.origin[1] + roof.along[1] * u + roof.up[1] * v;
      const z = roof.origin[2] + roof.along[2] * u + roof.up[2] * v;
      const d = Math.hypot(x - EYE[0], z - EYE[2]);
      // A roof slope faces across the direction it climbs.
      const pressed = roof.flat !== undefined && u > roof.flat[0] && u < roof.flat[1] ? 0.3 : 1;
      blades.push([x, y - 0.03, z, (0.22 + 0.24 * r()) * pressed, r() * 6.283, 0.016, r() * 6.283, 0.3 + 0.5 * r(), (-up[0] / ul) * 0.6, (-up[2] / ul) * 0.6, d]);
    }
  }

  // The grass before the seaward window of the nearest house. From indoors you look out across it from
  // close to the ground, and the meadow as planted for the view from up here is far too thin down there:
  // it showed as a flat green board. (Planted last and with its own dice, so that the rest of the meadow
  // grows exactly as it did before.)
  const g = rng(9173);
  for (let planted = 0, tries = 0; planted < 3400 && tries < 30000; tries++) {
    const d = Math.exp(Math.log(4.6) + (Math.log(52) - Math.log(4.6)) * g() ** 1.15);
    const az = FACING + (g() - 0.5) * 2 * 0.98;
    const x = ROOM_EYE[0] + d * Math.sin(az);
    const z = ROOM_EYE[2] - d * Math.cos(az);
    if (ground(x, z) !== 'yes') continue;
    planted++;
    const y = land(x, z);
    const n = normalAt(x, z, 0.8);
    const tall = (0.36 + 0.42 * g() * g()) * (0.75 + 0.5 * noise(x / 9 + 3, z / 9 + 8)) * (1 + 0.5 * smooth(14, 5, d));
    const tint = g() < 0.07 ? STRAW : Math.min(0.94, Math.max(0.16, 0.5 + 0.35 * fbm(x / 5, z / 5) + (g() - 0.5) * 0.4));
    const facing = g() * 6.283;
    const phase = g() * 6.283;
    const fromYou = Math.hypot(x - EYE[0], z - EYE[2]);
    for (let k = 0; k < 3; k++) {
      const f = k === 0 ? facing : facing + (k / 2) * 6.283 + (g() - 0.5) * 0.7;
      const off = k === 0 ? 0 : 0.03 + 0.05 * g();
      blades.push([x + Math.cos(f) * off, y - 0.03, z + Math.sin(f) * off, tall * (k === 0 ? 1 : 0.55 + 0.3 * g()), f, WIDTH * (0.8 + 0.5 * g()), phase, tint, n[0], n[2], fromYou]);
    }
  }

  const pack = (list: number[][]): Float32Array => {
    list.sort((p, q) => p[10] - q[10]);
    const out = new Float32Array(list.length * BLADE_FLOATS);
    list.forEach((item, i) => out.set(item.slice(0, BLADE_FLOATS), i * BLADE_FLOATS));
    return out;
  };
  // No grass grows on the rocks the puffins stand on, and it is short round them, so that the rocks can be seen.
  // (Taken out afterwards, so that the rest of the meadow grows exactly as it would have.)
  const clear = (list: number[][]): number[][] =>
    list.filter((blade) => {
      const fromRock = Math.min(...PERCH_ROCKS.map(([rx, rz, reach]) => Math.hypot(blade[0] - rx, blade[2] - rz) - reach));
      if (fromRock < 0.8) blade[3] = Math.min(blade[3], 0.2 + 0.1 * blade[7]);
      return fromRock > 0;
    });
  return { blades: pack(clear(blades)), flowers: pack(clear(flowers)) };
}

/** Random seeds for rain and snow: position in a box, and a speed. */
export function buildSeeds(count: number): Float32Array {
  const r = rng(77);
  const out = new Float32Array(count * 4);
  for (let i = 0; i < out.length; i++) out[i] = r();
  return out;
}
