// The rowing boat herself, built board by board.
//
// She is a small Faroese boat: double-ended, her stem and stern both swept up,
// built of overlapping planks riveted through at every rib. Everything of her
// is a real shape here: each plank standing a finger proud of the one below
// it, the copper rivets along each lap, her ribs and the knees that hold her
// thwarts, the boards laid in her bottom, her oars shipped along her thwarts,
// the basket for the catch, a bailer, a reel of line, a coil of rope and the
// anchor stone in her bow, and a lantern on her stem for after dark.
//
// She is drawn by a small program of her own, in whatever place and at
// whatever tilt the water has her (see fishing.ts): the same shape whether she
// lies at her mooring off the beach, keel up on the shingle, or under you out
// on the bay.

import type { V3 } from './gl';
import { beamAt, HULL, keelAt, sheerAt } from './afloat';
import { COMMON, HEAD } from './shaders';

/** Numbers kept for each corner: where it is and the way its face looks (in her own measure), its colour, what it is made of, and where it lies along and across its grain. */
export const SKIFF_FLOATS = 12;
const WOOD = 0;
const PAINT = 1;
const METAL = 2;
const LIGHT = 3;
const ROPE = 4;

const HALF = HULL.half;
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** A steady number from two others, 0..1: so that each board has a tone of its own, the same every time. */
const own = (a: number, b: number) => {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
};
const toned = (c: V3, k: number): V3 => [c[0] * k, c[1] * k, c[2] * k];

type Grain = (p: V3) => [number, number];

/** A place on her skin: s from stern (-1) to bow (1), u from keel (0) to gunwale (1), on one side or the other. */
export function skin(s: number, u: number, side: number): V3 {
  const k = keelAt(s);
  const g = sheerAt(s);
  return [side * beamAt(s) * Math.pow(u, 0.6), k + (g - k) * Math.pow(u, 1.3), s * HALF];
}
/** The way her skin looks there: outward, square to her planking. */
function outward(s: number, u: number, side: number): V3 {
  const a = skin(s, Math.max(0.002, u - 0.01), side);
  const b = skin(s, Math.min(1, u + 0.01), side);
  const up = sub(b, a);
  const a2 = skin(Math.max(-0.999, s - 0.01), Math.max(0.01, u), side);
  const b2 = skin(Math.min(0.999, s + 0.01), Math.max(0.01, u), side);
  const along = sub(b2, a2);
  const n = unit(cross(up, along));
  return n[0] * side < 0 ? [-n[0], -n[1], -n[2]] : n;
}
/** How far along from keel to gunwale her skin is at a height, at a place along her; and half her width inside, there. */
const uAt = (s: number, y: number) => Math.pow(Math.max(0, Math.min(1, (y - keelAt(s)) / (sheerAt(s) - keelAt(s)))), 1 / 1.3);
const THICK = 0.022; // her planking
const insideAt = (s: number, y: number) => Math.max(0, beamAt(s) * Math.pow(uAt(s, y), 0.6) - THICK - 0.012);

export function buildSkiff(): Float32Array {
  const out: number[] = [];
  const tri = (a: V3, b: V3, c: V3, col: V3, kind: number, g: Grain) => {
    const n = unit(cross(sub(b, a), sub(c, a)));
    for (const p of [a, b, c]) out.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2], kind, ...g(p));
  };
  const quad = (a: V3, b: V3, c: V3, d: V3, col: V3, kind: number, g: Grain) => {
    tri(a, b, c, col, kind, g);
    tri(a, c, d, col, kind, g);
  };
  /** A squared timber from one end to the other: its grain runs along it. */
  const timber = (from: V3, to: V3, wide: number, deep: number, col: V3, kind = WOOD, ends: V3 = toned(col, 0.8)) => {
    const along = unit(sub(to, from));
    const side = unit(Math.abs(along[1]) > 0.95 ? cross(along, [1, 0, 0]) : cross(along, [0, 1, 0]));
    const up = cross(side, along);
    const seed = own(from[0] * 3.1 + from[2], to[1] * 5.7 + to[0]) * 9;
    const g: Grain = (p) => [dot(sub(p, from), along) + seed, dot(sub(p, from), side) + seed * 0.37];
    const c = (p: V3, i: number, j: number): V3 => add(add(p, side, (i - 0.5) * wide), up, (j - 0.5) * deep);
    quad(c(from, 0, 1), c(to, 0, 1), c(to, 1, 1), c(from, 1, 1), col, kind, g);
    quad(c(from, 1, 0), c(to, 1, 0), c(to, 0, 0), c(from, 0, 0), toned(col, 0.9), kind, g);
    quad(c(from, 0, 0), c(to, 0, 0), c(to, 0, 1), c(from, 0, 1), col, kind, g);
    quad(c(from, 1, 1), c(to, 1, 1), c(to, 1, 0), c(from, 1, 0), col, kind, g);
    quad(c(from, 0, 0), c(from, 0, 1), c(from, 1, 1), c(from, 1, 0), ends, kind, g);
    quad(c(to, 1, 0), c(to, 1, 1), c(to, 0, 1), c(to, 0, 0), ends, kind, g);
  };
  /** A turned (round) piece from one end to the other, of one thickness at one end and another at the other. */
  const turned = (from: V3, to: V3, r0: number, r1: number, col: V3, kind = WOOD, sides = 8, capped = true) => {
    const along = unit(sub(to, from));
    const side = unit(Math.abs(along[1]) > 0.95 ? cross(along, [1, 0, 0]) : cross(along, [0, 1, 0]));
    const up = cross(side, along);
    const seed = own(from[0] + to[2] * 2.3, from[1] * 4.1 + to[0]) * 7;
    const at = (p: V3, r: number, a: number): V3 => add(add(p, side, Math.cos(a) * r), up, Math.sin(a) * r);
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const g: Grain = (p) => [dot(sub(p, from), along) + seed, (i / sides) * 0.5 + seed];
      quad(at(from, r0, a0), at(to, r1, a0), at(to, r1, a1), at(from, r0, a1), col, kind, g);
      if (capped) {
        tri(from, at(from, r0, a1), at(from, r0, a0), toned(col, 0.8), kind, g);
        tri(to, at(to, r1, a0), at(to, r1, a1), toned(col, 0.8), kind, g);
      }
    }
  };

  const TAR: V3 = [0.25, 0.175, 0.125];
  const WHITE: V3 = [0.86, 0.86, 0.8];
  const RED: V3 = [0.56, 0.17, 0.12];
  const INSIDE: V3 = [0.52, 0.4, 0.25];
  const OAK: V3 = [0.38, 0.28, 0.17];
  const PINE: V3 = [0.64, 0.5, 0.3];
  const ASH: V3 = [0.74, 0.62, 0.42];
  const COPPER: V3 = [0.62, 0.4, 0.22];
  const HEMP: V3 = [0.78, 0.7, 0.5];

  // ---- her planking: seven strakes a side, each lapping the one below it
  const STATIONS = 30;
  const STRAKES = 7;
  const LAP = 0.015;
  const st = (i: number) => -1 + (2 * i) / STATIONS;
  for (const side of [1, -1]) {
    for (let j = 0; j < STRAKES; j++) {
      const u0 = j / STRAKES;
      const u1 = (j + 1) / STRAKES;
      const top = j === STRAKES - 1;
      for (let i = 0; i < STATIONS; i++) {
        const s0 = st(i);
        const s1 = st(i + 1);
        // (A plank is made of lengths scarfed end to end, and each length has weathered its own way.)
        const tone = 0.9 + 0.2 * own(j * 3 + (side > 0 ? 0 : 17), Math.floor((i + j * 2) / 6));
        const g: Grain = (p) => [p[2] + j * 1.7 + (side > 0 ? 0 : 5.3), uAt(p[2] / HALF, p[1]) * 0.42 + j * 0.37];
        const o = (s: number, u: number, proud: number): V3 => add(skin(s, u, side), outward(s, u, side), proud);
        // Outside: its lower edge stands proud of the plank below; under that edge, the dark of the lap.
        quad(o(s0, u0, LAP), o(s1, u0, LAP), o(s1, u1, 0), o(s0, u1, 0), toned(top ? WHITE : TAR, tone), PAINT, g);
        if (j > 0) quad(o(s0, u0, 0), o(s1, u0, 0), o(s1, u0, LAP), o(s0, u0, LAP), toned(TAR, 0.45), PAINT, g);
        // Inside: bare wood. Here it is the upper edge of each plank that stands proud (of the one above it), a ledge that catches the light.
        const inner = (s: number, u: number, inboard: number): V3 => add(skin(s, u, side), outward(s, u, side), -THICK - inboard);
        quad(inner(s0, u0, 0), inner(s0, u1, top ? 0 : LAP), inner(s1, u1, top ? 0 : LAP), inner(s1, u0, 0), toned(INSIDE, tone), WOOD, g);
        if (!top) quad(inner(s0, u1, LAP), inner(s0, u1, 0), inner(s1, u1, 0), inner(s1, u1, LAP), toned(INSIDE, tone * 1.12), WOOD, g);
      }
    }
    // The rivets that hold each lap: copper, one at every rib and two between.
    for (let j = 1; j < STRAKES; j++) {
      for (let i = 2; i < STATIONS * 3 - 5; i++) {
        const s = -1 + (2 * (i + 0.5)) / (STATIONS * 3);
        const u = j / STRAKES - 0.035;
        const at = add(skin(s, u, side), outward(s, u, side), -THICK - LAP - 0.002);
        const upward = unit(sub(skin(s, u + 0.02, side), skin(s, u - 0.02, side)));
        const r = 0.007;
        quad(add(add(at, upward, -r), [0, 0, 1], -r), add(add(at, upward, r), [0, 0, 1], -r), add(add(at, upward, r), [0, 0, 1], r), add(add(at, upward, -r), [0, 0, 1], r), COPPER, METAL, () => [0, 0]);
      }
    }
    // Her gunwale: a red rubbing strake outside, a rail capping her planking, and an inwale within.
    for (let i = 0; i < STATIONS; i++) {
      const s0 = st(i);
      const s1 = st(i + 1);
      const p = (s: number, outBy: number, upBy: number): V3 => {
        const base = skin(s, 1, side);
        return [base[0] + side * outBy, base[1] + upBy, base[2]];
      };
      const g: Grain = (q) => [q[2] + (side > 0 ? 2.1 : 7.7), q[1] * 3 + q[0]];
      // (Rubbing strake.)
      quad(p(s0, 0.03, -0.05), p(s1, 0.03, -0.05), p(s1, 0.03, 0.0), p(s0, 0.03, 0.0), RED, PAINT, g);
      quad(p(s0, 0.0, -0.05), p(s1, 0.0, -0.05), p(s1, 0.03, -0.05), p(s0, 0.03, -0.05), toned(RED, 0.6), PAINT, g);
      // (Cap.)
      quad(p(s0, 0.034, 0.0), p(s1, 0.034, 0.0), p(s1, 0.034, 0.028), p(s0, 0.034, 0.028), PINE, WOOD, g);
      quad(p(s0, 0.034, 0.028), p(s1, 0.034, 0.028), p(s1, -0.062, 0.028), p(s0, -0.062, 0.028), toned(PINE, 1.06), WOOD, g);
      quad(p(s0, -0.062, 0.028), p(s1, -0.062, 0.028), p(s1, -0.062, -0.035), p(s0, -0.062, -0.035), toned(PINE, 0.86), WOOD, g);
      quad(p(s0, -0.062, -0.035), p(s1, -0.062, -0.035), p(s1, -THICK, -0.035), p(s0, -THICK, -0.035), toned(PINE, 0.7), WOOD, g);
    }
  }

  // ---- her backbone: keel below, hog within, and a post at either end
  for (let i = 0; i < STATIONS; i++) {
    const s0 = st(i);
    const s1 = st(i + 1);
    timber([0, keelAt(s0) - 0.045, s0 * HALF], [0, keelAt(s1) - 0.045, s1 * HALF], 0.07, 0.1, toned(TAR, 0.9), PAINT);
    if (Math.abs(s0) < 0.86 && Math.abs(s1) < 0.86) timber([0, keelAt(s0) + 0.04, s0 * HALF], [0, keelAt(s1) + 0.04, s1 * HALF], 0.11, 0.035, OAK);
  }
  for (const end of [1, -1]) {
    const pts: V3[] = [
      [0, keelAt(end) - 0.08, end * (HALF - 0.1)],
      [0, 0.22, end * (HALF + 0.035)],
      [0, sheerAt(end) + 0.02, end * (HALF + 0.085)],
      [0, sheerAt(end) + 0.2, end * (HALF + 0.14)],
    ];
    timber(pts[0], pts[1], 0.075, 0.12, toned(TAR, 0.95), PAINT);
    timber(pts[1], pts[2], 0.075, 0.115, toned(TAR, 0.95), PAINT);
    timber(pts[2], pts[3], 0.075, 0.11, WHITE, PAINT, toned(WHITE, 0.9));
    // The breasthook: a knee lying flat between her gunwales, in the very end of her.
    const sB = end * 0.84;
    const y = sheerAt(sB) - 0.01;
    const w = beamAt(sB) - 0.03;
    const tip: V3 = [0, sheerAt(end * 0.97) - 0.01, end * (HALF - 0.12)];
    const g: Grain = (p) => [p[0] + 1.3, p[2] * 0.6];
    tri([-w, y, sB * HALF], [w, y, sB * HALF], tip, toned(OAK, 1.15), WOOD, g);
    tri([-w, y - 0.04, sB * HALF], tip.map((v, k) => (k === 1 ? v - 0.04 : v)) as V3, [w, y - 0.04, sB * HALF], toned(OAK, 0.8), WOOD, g);
    quad([-w, y - 0.04, sB * HALF], [w, y - 0.04, sB * HALF], [w, y, sB * HALF], [-w, y, sB * HALF], toned(OAK, 0.9), WOOD, g);
  }

  // ---- her ribs, a foot apart, each bent to her planking and riveted through it
  for (let z = -2.15; z <= 2.16; z += 0.33) {
    const s = z / HALF;
    for (const side of [1, -1]) {
      const SEG = 10;
      for (let k = 0; k < SEG; k++) {
        const u0 = 0.015 + (k / SEG) * 0.955;
        const u1 = 0.015 + ((k + 1) / SEG) * 0.955;
        const a = add(skin(s, u0, side), outward(s, u0, side), -THICK - LAP * 0.6);
        const b = add(skin(s, u1, side), outward(s, u1, side), -THICK - LAP * 0.6);
        const na = outward(s, u0, side);
        const nb = outward(s, u1, side);
        const deep = 0.026;
        const wide = 0.019;
        const g: Grain = (p) => [uAt(s, p[1]) * 1.4 + z, p[2] * 6];
        const A0: V3 = [a[0], a[1], a[2] - wide];
        const A1: V3 = [a[0], a[1], a[2] + wide];
        const B0: V3 = [b[0], b[1], b[2] - wide];
        const B1: V3 = [b[0], b[1], b[2] + wide];
        const lift = (p: V3, n: V3): V3 => add(p, n, -deep);
        quad(lift(A0, na), lift(B0, nb), lift(B1, nb), lift(A1, na), OAK, WOOD, g);
        quad(A0, B0, lift(B0, nb), lift(A0, na), toned(OAK, 0.78), WOOD, g);
        quad(lift(A1, na), lift(B1, nb), B1, A1, toned(OAK, 0.78), WOOD, g);
      }
    }
  }

  // ---- thwarts to sit on, each resting on a riser along her side and held by a knee at either end
  const THWARTS = [-1.25, 0.12, 1.42];
  const SEAT = 0.25;
  for (const side of [1, -1]) {
    for (let z = -2.0; z < 1.99; z += 0.2) {
      const w0 = insideAt(z / HALF, SEAT - 0.04) - 0.006;
      const w1 = insideAt((z + 0.2) / HALF, SEAT - 0.04) - 0.006;
      timber([side * w0, SEAT - 0.045, z], [side * w1, SEAT - 0.045, z + 0.2], 0.03, 0.05, toned(OAK, 1.1));
    }
  }
  for (const z of THWARTS) {
    const w = insideAt(z / HALF, SEAT) - 0.004;
    const g: Grain = (p) => [p[0] + z * 3.1, p[2] * 1.3 + z];
    const [z0, z1, y0, y1] = [z - 0.115, z + 0.115, SEAT - 0.018, SEAT + 0.018];
    quad([-w, y1, z0], [w, y1, z0], [w, y1, z1], [-w, y1, z1], PINE, WOOD, g);
    quad([-w, y0, z1], [w, y0, z1], [w, y0, z0], [-w, y0, z0], toned(PINE, 0.6), WOOD, g);
    quad([-w, y0, z0], [w, y0, z0], [w, y1, z0], [-w, y1, z0], toned(PINE, 0.82), WOOD, g);
    quad([-w, y1, z1], [w, y1, z1], [w, y0, z1], [-w, y0, z1], toned(PINE, 0.82), WOOD, g);
    // (Worn pale where people have sat.)
    for (const x of [-0.24, 0.24]) quad([x - 0.13, y1 + 0.001, z0 + 0.03], [x + 0.13, y1 + 0.001, z0 + 0.03], [x + 0.13, y1 + 0.001, z1 - 0.03], [x - 0.13, y1 + 0.001, z1 - 0.03], toned(PINE, 1.13), WOOD, g);
    for (const side of [1, -1]) {
      // A knee: grown crooked, set on the thwart and up her side.
      const top = sheerAt(z / HALF) - 0.05;
      const wTop = insideAt(z / HALF, top);
      for (const dz of [-0.022, 0.022]) {
        tri([side * (w - 0.2), y1, z + dz], [side * w, y1, z + dz], [side * wTop, top, z + dz], toned(OAK, dz > 0 ? 1.05 : 0.85), WOOD, (p) => [p[0] * 2 + z, p[1] * 3]);
      }
      quad([side * (w - 0.2), y1, z - 0.022], [side * (w - 0.2), y1, z + 0.022], [side * wTop, top, z + 0.022], [side * wTop, top, z - 0.022], toned(OAK, 1.12), WOOD, (p) => [p[0] * 2 + z, p[2] * 9]);
    }
  }

  // ---- the boards laid in her bottom, with the dark of the bilge showing between them
  {
    const y = -0.085;
    for (const x of [-0.3, -0.15, 0, 0.15, 0.3]) {
      for (let z = -2.05; z < 2.0; z += 0.25) {
        const fits = (zz: number) => Math.abs(x) + 0.072 < insideAt(zz / HALF, y);
        if (!fits(z) || !fits(z + 0.25)) continue;
        const tone = 0.9 + 0.2 * own(x * 9, Math.floor((z + 3) / 1.0 + x * 5));
        const g: Grain = (p) => [p[2] + x * 7.3, (p[0] - x) * 1.6 + x * 3.1];
        const [x0, x1] = [x - 0.066, x + 0.066];
        quad([x0, y, z], [x0, y, z + 0.25], [x1, y, z + 0.25], [x1, y, z], toned([0.47, 0.37, 0.23], tone), WOOD, g);
        quad([x0, y - 0.02, z], [x0, y, z], [x1, y, z], [x1, y - 0.02, z], toned([0.3, 0.23, 0.14], tone), WOOD, g);
        quad([x0, y - 0.02, z], [x0, y - 0.02, z + 0.25], [x0, y, z + 0.25], [x0, y, z], [0.2, 0.15, 0.1], WOOD, g);
        quad([x1, y, z], [x1, y, z + 0.25], [x1, y - 0.02, z + 0.25], [x1, y - 0.02, z], [0.2, 0.15, 0.1], WOOD, g);
      }
    }
    // (Under them, the wet dark.)
    for (let z = -2.05; z < 2.0; z += 0.25) {
      const w0 = Math.min(0.37, insideAt(z / HALF, y - 0.03));
      const w1 = Math.min(0.37, insideAt((z + 0.25) / HALF, y - 0.03));
      quad([-w0, y - 0.03, z], [-w1, y - 0.03, z + 0.25], [w1, y - 0.03, z + 0.25], [w0, y - 0.03, z], [0.09, 0.075, 0.06], PAINT, () => [0, 0]);
    }
  }

  // ---- her oars, shipped: laid along her thwarts with their blades toward her bow
  for (const side of [1, -1]) {
    const at = (z: number): V3 => [side * (0.5 - 0.068 * (z + 1.6)), SEAT + 0.045 + 0.004 * (z + 1.6), z];
    turned(at(-1.6), at(-1.42), 0.017, 0.019, toned(ASH, 0.85)); // the grip
    turned(at(-1.42), at(-0.72), 0.026, 0.025, ASH);
    turned(at(-0.72), at(-0.5), 0.03, 0.03, [0.3, 0.2, 0.13], ROPE); // the leather where it works in the tholes
    turned(at(-0.5), at(1.05), 0.025, 0.021, ASH);
    // The blade: a board, widening to its tip, with a ridge down its middle; the tip painted.
    const BLADE = 6;
    for (let k = 0; k < BLADE; k++) {
      const z0 = 1.05 + (k / BLADE) * 0.85;
      const z1 = 1.05 + ((k + 1) / BLADE) * 0.85;
      const w = (z: number) => 0.022 + 0.045 * Math.pow((z - 1.05) / 0.85, 0.7);
      const col = k === BLADE - 1 ? RED : ASH;
      const kind = k === BLADE - 1 ? PAINT : WOOD;
      const g: Grain = (p) => [p[2] + side * 3, p[0] * 4];
      const c0 = at(z0);
      const c1 = at(z1);
      const ridge = 0.012;
      quad([c0[0] - w(z0), c0[1], z0], [c1[0] - w(z1), c1[1], z1], [c1[0], c1[1] + ridge, z1], [c0[0], c0[1] + ridge, z0], col, kind, g);
      quad([c0[0], c0[1] + ridge, z0], [c1[0], c1[1] + ridge, z1], [c1[0] + w(z1), c1[1], z1], [c0[0] + w(z0), c0[1], z0], toned(col, 0.9), kind, g);
      quad([c0[0] - w(z0), c0[1], z0], [c0[0] + w(z0), c0[1], z0], [c1[0] + w(z1), c1[1], z1], [c1[0] - w(z1), c1[1], z1], toned(col, 0.7), kind, g);
    }
  }

  // ---- the thole pins her oars work against: a pad on the gunwale, and two pins in it
  for (const side of [1, -1]) {
    for (const z of [-0.62, 0.72]) {
      const gun = skin(z / HALF, 1, side);
      const x = gun[0] - side * 0.014;
      timber([x, gun[1] + 0.045, z - 0.15], [x, gun[1] + 0.045, z + 0.15], 0.07, 0.035, toned(OAK, 1.1));
      for (const dz of [-0.075, 0.075]) turned([x, gun[1] + 0.06, z + dz], [x, gun[1] + 0.2, z + dz], 0.017, 0.013, toned(OAK, 0.9), WOOD, 6);
    }
  }

  // ---- the basket for the catch: withies woven round stakes
  {
    const [x0, x1, z0, z1, y0, y1] = [-0.56, -0.08, 0.38, 1.08, -0.08, 0.2];
    const BANDS = 7;
    for (let b = 0; b < BANDS; b++) {
      const ya = y0 + ((y1 - y0) * b) / BANDS;
      const yb = y0 + ((y1 - y0) * (b + 1)) / BANDS;
      const walls: [V3, V3][] = [
        [[x0, 0, z0], [x1, 0, z0]],
        [[x1, 0, z0], [x1, 0, z1]],
        [[x1, 0, z1], [x0, 0, z1]],
        [[x0, 0, z1], [x0, 0, z0]],
      ];
      walls.forEach(([p, q], wall) => {
        // (Each withy goes in front of one stake and behind the next: the weave is in steps a hand wide.)
        const steps = Math.round(Math.hypot(q[0] - p[0], q[2] - p[2]) / 0.07);
        for (let k = 0; k < steps; k++) {
          const t0 = k / steps;
          const t1 = (k + 1) / steps;
          const bulge = (k + b) % 2 ? 0.008 : 0;
          const n: V3 = unit(cross(sub(q, p), [0, 1, 0]));
          const a: V3 = [p[0] + (q[0] - p[0]) * t0 + n[0] * bulge, 0, p[2] + (q[2] - p[2]) * t0 + n[2] * bulge];
          const c: V3 = [p[0] + (q[0] - p[0]) * t1 + n[0] * bulge, 0, p[2] + (q[2] - p[2]) * t1 + n[2] * bulge];
          const col = toned([0.62, 0.48, 0.26], ((k + b) % 2 ? 1.05 : 0.8) * (0.92 + 0.16 * own(wall + b * 3, k)));
          quad([a[0], ya, a[2]], [c[0], ya, c[2]], [c[0], yb, c[2]], [a[0], yb, a[2]], col, ROPE, () => [0, 0]);
        }
      });
    }
    quad([x0, y0 + 0.012, z0], [x1, y0 + 0.012, z0], [x1, y0 + 0.012, z1], [x0, y0 + 0.012, z1], [0.3, 0.23, 0.12], ROPE, () => [0, 0]);
    for (const [a, b] of [[[x0, z0], [x1, z0]], [[x1, z0], [x1, z1]], [[x1, z1], [x0, z1]], [[x0, z1], [x0, z0]]]) timber([a[0], y1 + 0.012, a[1]], [b[0], y1 + 0.012, b[1]], 0.04, 0.035, [0.46, 0.35, 0.18], ROPE);
  }

  // ---- gear: a bailer, a reel of line, a box for bait
  {
    // The bailer: a wooden scoop, lying by your feet.
    const [x, y, z] = [0.3, -0.083, -0.5];
    const B: V3 = [0.6, 0.47, 0.3];
    quad([x - 0.08, y + 0.005, z - 0.14], [x + 0.08, y + 0.005, z - 0.14], [x + 0.1, y + 0.005, z + 0.14], [x - 0.1, y + 0.005, z + 0.14], toned(B, 0.8), WOOD, (p) => [p[2], p[0]]);
    quad([x - 0.08, y, z - 0.14], [x - 0.1, y, z + 0.14], [x - 0.1, y + 0.09, z + 0.14], [x - 0.08, y + 0.1, z - 0.14], B, WOOD, (p) => [p[2], p[1]]);
    quad([x + 0.08, y, z - 0.14], [x + 0.08, y + 0.1, z - 0.14], [x + 0.1, y + 0.09, z + 0.14], [x + 0.1, y, z + 0.14], B, WOOD, (p) => [p[2], p[1]]);
    quad([x - 0.08, y, z - 0.14], [x - 0.08, y + 0.1, z - 0.14], [x + 0.08, y + 0.1, z - 0.14], [x + 0.08, y, z - 0.14], toned(B, 1.1), WOOD, (p) => [p[0], p[1]]);
    turned([x, y + 0.075, z - 0.14], [x, y + 0.11, z - 0.32], 0.018, 0.016, toned(B, 0.95), WOOD, 6);
    // The reel: line wound on a wooden frame, lying on the middle thwart.
    const [rx, ry, rz] = [0.3, SEAT + 0.02, 0.12];
    timber([rx - 0.11, ry + 0.012, rz - 0.07], [rx + 0.11, ry + 0.012, rz - 0.07], 0.022, 0.022, OAK);
    timber([rx - 0.11, ry + 0.012, rz + 0.07], [rx + 0.11, ry + 0.012, rz + 0.07], 0.022, 0.022, OAK);
    timber([rx - 0.085, ry + 0.012, rz - 0.07], [rx - 0.085, ry + 0.012, rz + 0.07], 0.02, 0.02, toned(OAK, 1.1));
    timber([rx + 0.085, ry + 0.012, rz - 0.07], [rx + 0.085, ry + 0.012, rz + 0.07], 0.02, 0.02, toned(OAK, 1.1));
    timber([rx - 0.06, ry + 0.02, rz], [rx + 0.06, ry + 0.02, rz], 0.125, 0.034, [0.84, 0.8, 0.66], ROPE, [0.7, 0.66, 0.54]);
    // The bait box, with its lid.
    const [bx, by, bz] = [0.34, -0.085, 0.62];
    timber([bx - 0.12, by + 0.06, bz], [bx + 0.12, by + 0.06, bz], 0.15, 0.12, [0.33, 0.37, 0.3], PAINT);
    timber([bx - 0.127, by + 0.128, bz], [bx + 0.127, by + 0.128, bz], 0.164, 0.016, [0.4, 0.44, 0.36], PAINT);
  }

  // ---- in her bow: a coil of rope, and the anchor stone in its lashing
  {
    const cz = 1.93;
    const TURN = Math.PI * 2;
    for (const [r0, r1, y0, y1] of [[0.09, 0.2, -0.085, -0.045], [0.07, 0.165, -0.045, -0.008], [0.06, 0.12, -0.008, 0.025]]) {
      for (let i = 0; i < 14; i++) {
        const a0 = (i / 14) * TURN;
        const a1 = ((i + 1) / 14) * TURN;
        const ring = (a: number, r: number, y: number): V3 => [Math.cos(a) * r, y, cz + Math.sin(a) * r * 0.86];
        const tone = i % 2 ? 1 : 0.86;
        quad(ring(a0, r0, y1), ring(a1, r0, y1), ring(a1, r1, y1), ring(a0, r1, y1), toned(HEMP, tone), ROPE, () => [0, 0]);
        quad(ring(a0, r1, y0), ring(a0, r1, y1), ring(a1, r1, y1), ring(a1, r1, y0), toned(HEMP, tone * 0.78), ROPE, () => [0, 0]);
        quad(ring(a0, r0, y0), ring(a1, r0, y0), ring(a1, r0, y1), ring(a0, r0, y1), toned(HEMP, tone * 0.6), ROPE, () => [0, 0]);
      }
    }
    // The stone: a rough lump, in a turn of rope.
    const c: V3 = [0.16, -0.01, 1.52];
    const r: V3 = [0.1, 0.075, 0.13];
    const STONE: V3 = [0.42, 0.43, 0.46];
    const RINGS = 5;
    const SIDES = 8;
    const at = (i: number, k: number): V3 => {
      const lat = -Math.PI / 2 + (i / RINGS) * Math.PI;
      const lon = (k / SIDES) * TURN;
      const rough = 0.86 + 0.28 * own(i * 3.3, (k % SIDES) * 1.7);
      return [c[0] + Math.cos(lat) * Math.cos(lon) * r[0] * rough, c[1] + Math.sin(lat) * r[1] * rough, c[2] + Math.cos(lat) * Math.sin(lon) * r[2] * rough];
    };
    for (let i = 0; i < RINGS; i++) {
      for (let k = 0; k < SIDES; k++) quad(at(i, k), at(i + 1, k), at(i + 1, k + 1), at(i, k + 1), toned(STONE, 0.85 + 0.3 * own(i, k)), PAINT, () => [0, 0]);
    }
    turned([c[0] - 0.11, c[1] + 0.01, c[2]], [c[0] + 0.11, c[1] + 0.01, c[2]], 0.086, 0.086, toned(HEMP, 0.9), ROPE, 8, false);
  }

  // ---- on her stem, an iron crook for the lantern to hang from (the lantern itself is a thing of its own: it swings)
  {
    const y = sheerAt(1) + 0.2;
    const z = HALF + 0.14;
    const IRON: V3 = [0.14, 0.14, 0.16];
    // (It stands tall and leans out to port before it curls over, so that the lantern hangs clear above her
    // stem head with the rod beside it, not across it, as you look forward from her stern.)
    const bend: V3[] = [[-0.03, y - 0.04, z], [-0.17, y + 0.4, z + 0.08], [-0.185, y + 0.62, z + 0.14], [-0.14, y + 0.75, z + 0.18], [-0.06, y + 0.8, z + 0.2], [0.0, y + 0.785, z + 0.2], [0.02, y + 0.745, z + 0.2]];
    for (let i = 0; i + 1 < bend.length; i++) turned(bend[i], bend[i + 1], 0.012, 0.012, IRON, METAL, 6, false);
    // (A strap round the stem head holds it.)
    timber([0, y + 0.03, z - 0.005], [0, y + 0.06, z - 0.005], 0.095, 0.13, IRON, METAL);
  }
  return new Float32Array(out);
}

/** Where the lantern hangs from (the end of the crook on her stem), in her own measure; how much larger than life it is; and where its flame is, near enough. */
export const LANTERN_HOOK: V3 = [0.02, sheerAt(1) + 0.945, HALF + 0.34];
export const LANTERN_BIG = 1.55;
export const BOW_LAMP: V3 = [LANTERN_HOOK[0], LANTERN_HOOK[1] - 0.2 * LANTERN_BIG, LANTERN_HOOK[2]];

/**
 * The lantern: a storm lantern, hung by its bail. In its own measure it hangs from the origin, its body
 * below: a wire bail, a hood with its vent, a glass globe in a cage of wire with the flame inside, the
 * burner, and the font that holds its oil. Everything of it is turned, in ten sides, and shaded round.
 */
export function buildLantern(): number[] {
  const out: number[] = [];
  const SIDES = 10;
  const TURN = Math.PI * 2;
  const put = (p: V3, n: V3, col: V3, kind: number, u: number, v: number) => out.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2], kind, u, v);
  /** A turned shape: rings of given height and radius, joined; each corner told the way the surface faces. `v` runs 0 at the first ring to 1 at the last. */
  const lathe = (rings: [number, number][], col: V3, kind: number, flag = 0) => {
    const facing = (j: number, a: number): V3 => {
      const lo = rings[Math.max(0, j - 1)];
      const hi = rings[Math.min(rings.length - 1, j + 1)];
      const dy = hi[0] - lo[0];
      const dr = hi[1] - lo[1];
      const l = Math.hypot(dy, dr) || 1;
      // (Square to the outline, pointing away from the middle line.)
      const out2 = Math.abs(dy) / l;
      const up = (-dr / l) * Math.sign(dy || 1);
      return [Math.cos(a) * out2, up, Math.sin(a) * out2];
    };
    for (let j = 0; j + 1 < rings.length; j++) {
      for (let i = 0; i < SIDES; i++) {
        const corners: [number, number][] = [[j, i], [j + 1, i], [j + 1, i + 1], [j, i], [j + 1, i + 1], [j, i + 1]];
        for (const [jj, ii] of corners) {
          const a = (ii / SIDES) * TURN;
          const [y, r] = rings[jj];
          put([Math.cos(a) * r, y, Math.sin(a) * r], facing(jj, a), col, kind, flag, jj / (rings.length - 1));
        }
      }
    }
  };
  const wire = (from: V3, to: V3, r: number, col: V3) => {
    const along = unit(sub(to, from));
    const side = unit(Math.abs(along[1]) > 0.95 ? cross(along, [1, 0, 0]) : cross(along, [0, 1, 0]));
    const up = cross(side, along);
    for (let i = 0; i < 4; i++) {
      const a0 = (i / 4) * TURN;
      const a1 = ((i + 1) / 4) * TURN;
      const at = (p: V3, a: number): V3 => add(add(p, side, Math.cos(a) * r), up, Math.sin(a) * r);
      const n = (a: number): V3 => add(add([0, 0, 0], side, Math.cos(a)), up, Math.sin(a));
      for (const [p, a] of [[from, a0], [to, a0], [to, a1], [from, a0], [to, a1], [from, a1]] as [V3, number][]) put(at(p, a), n(a), col, METAL, 0, 0);
    }
  };
  const IRON: V3 = [0.17, 0.17, 0.2];
  const ENAMEL: V3 = [0.2, 0.42, 0.36];
  const BRASS: V3 = [0.78, 0.6, 0.26];
  // The bail: a wire hoop from either side of the hood up to the ring it hangs by.
  for (const side of [1, -1]) {
    const pts: V3[] = [[side * 0.058, -0.105, 0], [side * 0.066, -0.06, 0], [side * 0.045, -0.02, 0], [0, -0.004, 0]];
    for (let i = 0; i + 1 < pts.length; i++) wire(pts[i], pts[i + 1], 0.005, IRON);
  }
  lathe([[0.006, 0.0], [0.006, 0.012], [-0.006, 0.012], [-0.006, 0.0]], IRON, METAL);
  // The hood: a cap over the vent, the vent, and the dome that sheds the rain.
  lathe([[-0.03, 0.0], [-0.034, 0.03], [-0.04, 0.032], [-0.045, 0.02], [-0.06, 0.02], [-0.066, 0.036], [-0.085, 0.05], [-0.1, 0.06], [-0.108, 0.058]], ENAMEL, PAINT);
  // The globe: glass, bellied. (Its second number marks it as glass, 0; the flame is marked 2.)
  lathe([[-0.108, 0.05], [-0.13, 0.062], [-0.16, 0.07], [-0.19, 0.068], [-0.215, 0.058], [-0.232, 0.046]], [0.6, 0.7, 0.74], LIGHT, 0);
  // The flame inside it: a small tongue on the wick.
  lathe([[-0.228, 0.004], [-0.215, 0.014], [-0.195, 0.012], [-0.17, 0.0]], [1.0, 0.8, 0.4], LIGHT, 2);
  // The cage of wire round the globe: four bowed uprights and a hoop.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TURN + 0.4;
    const pts: [number, number][] = [[-0.108, 0.06], [-0.135, 0.071], [-0.165, 0.078], [-0.195, 0.075], [-0.232, 0.056]];
    for (let j = 0; j + 1 < pts.length; j++) wire([Math.cos(a) * pts[j][1], pts[j][0], Math.sin(a) * pts[j][1]], [Math.cos(a) * pts[j + 1][1], pts[j + 1][0], Math.sin(a) * pts[j + 1][1]], 0.0042, IRON);
  }
  for (let i = 0; i < SIDES; i++) {
    const a0 = (i / SIDES) * TURN;
    const a1 = ((i + 1) / SIDES) * TURN;
    wire([Math.cos(a0) * 0.079, -0.166, Math.sin(a0) * 0.079], [Math.cos(a1) * 0.079, -0.166, Math.sin(a1) * 0.079], 0.0042, IRON);
  }
  // The burner, in brass, with the wheel that turns the wick up.
  lathe([[-0.232, 0.05], [-0.24, 0.052], [-0.252, 0.04], [-0.262, 0.05]], BRASS, METAL);
  wire([0.045, -0.248, 0], [0.085, -0.248, 0], 0.0035, BRASS);
  lathe([[-0.236, 0.0], [-0.236, 0.011], [-0.26, 0.011], [-0.26, 0.0]].map(([y, r]) => [y, r] as [number, number]), BRASS, METAL);
  // The font that holds the oil, on its foot.
  lathe([[-0.262, 0.052], [-0.27, 0.074], [-0.3, 0.08], [-0.322, 0.076], [-0.33, 0.066], [-0.338, 0.07], [-0.345, 0.07], [-0.345, 0.0]], ENAMEL, PAINT);
  return out;
}


export const SKIFF_VERT = `${HEAD}
${COMMON}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aCol;
layout(location = 3) in vec3 aMore; // what it is made of (0 wood, 1 paint or tar or stone, 2 metal, 3 the lantern's glass, 4 rope and wicker; and for the catch, see catch.ts: 5 to 8 the skin of each kind of fish, 9 fin, 10 eye), and where it lies along and across its grain
uniform vec3 uBoatAt, uBoatX, uBoatY, uBoatZ; // where she is, and the ways her own starboard, up and bow point
out vec3 vWorld;
out vec3 vNormal;
out vec3 vCol;
out vec3 vMore;
void main() {
  vWorld = uBoatAt + uBoatX * aPos.x + uBoatY * aPos.y + uBoatZ * aPos.z;
  vNormal = uBoatX * aNormal.x + uBoatY * aNormal.y + uBoatZ * aNormal.z;
  vCol = aCol;
  vMore = aMore;
  gl_Position = uViewProj * vec4(vWorld, 1.0);
}
`;

export const SKIFF_FRAG = `${HEAD}
${COMMON}
in vec3 vWorld;
in vec3 vNormal;
in vec3 vCol;
in vec3 vMore;
out vec4 outColor;
uniform vec4 uBowLamp; // the lantern on her stem: where its flame is, and how brightly it burns (0 by day)
uniform vec3 uLightAt; // PATH-TRACE: the spot whose light the thing stands in (the ground it is on; for the boat at her mooring, the beach abreast of her)
uniform float uCooked; // for a fish: how far the fire has got with it (0 raw, 1 done, past 2.4 burnt black)
void main() {
  vec2 fc = gl_FragCoord.xy;
  float grain = bayer(fc);
  vec3 N = normalize(vNormal);
  // (A board is seen from either side: it is lit as the side you are looking at.)
  if (dot(N, uCam - vWorld) < 0.0) N = -N;
  int kind = int(vMore.x + 0.5);
  vec3 col = vCol;
  vec3 glow = vec3(0.0);
  if (kind == 0) {
    // Wood: its grain runs along the board in streaks, darker and paler, with a knot here and there.
    float streak = texture(uNoise, vec2(vMore.y * 0.5, vMore.z * 5.5)).r;
    float knot = texture(uNoise, vec2(vMore.y * 0.23 + 0.31, vMore.z * 1.9 + 0.17)).g;
    col *= streak > 0.64 ? 0.87 : streak < 0.3 ? 1.08 : 1.0;
    if (knot > 0.87) col *= 0.76;
  } else if (kind == 1) {
    // Tar and paint, weathered in patches.
    if (texture(uNoise, vec2(vMore.y * 0.37, vMore.z * 2.1)).b > 0.68) col *= 0.9;
  } else if (kind == 3) {
    if (vMore.y > 1.5) {
      // The lantern's flame: only there when it is lit; white at its foot, gold at its tip.
      if (uBowLamp.w < 0.05) discard;
      col = vec3(0.0);
      glow = mix(vec3(1.0, 0.95, 0.72), vec3(1.0, 0.62, 0.2), smoothstep(0.25, 0.9, vMore.z)) * (0.55 + 0.6 * uBowLamp.w);
    } else {
      // Its glass. Clear, so by day most of it is not there to be seen: what shows is its edge, where you
      // look along it, and a streak of light. Lit, the whole globe is full of the flame's glow.
      float along = abs(dot(N, normalize(uCam - vWorld)));
      float streak = dot(N, normalize(vec3(-0.5, 0.5, 0.7)));
      bool seen = along < 0.42 || streak > 0.93;
      if (!seen && grain > mix(0.1, 0.8, uBowLamp.w)) discard;
      col = seen ? vec3(0.62, 0.72, 0.78) : vec3(0.5, 0.58, 0.62);
      glow = vec3(1.0, 0.68, 0.28) * uBowLamp.w * (seen ? 0.5 : 0.95);
    }
  }
  // CATCH: a fish. Its skin has its kind's marks; the fire turns all of it gold, and then black.
  float raw = 0.0;
  if (kind >= 5) {
    float along = vMore.y; // 0 at its nose, 1 at the root of its tail
    float back = vMore.z;  // 1 along its back, -1 under its belly
    if (kind == 5) {
      // Cod: mottled, with pale spots over its back and sides, and a pale line along it.
      float spot = texture(uNoise, vec2(along * 2.3, back * 0.9 + 0.2)).g;
      if (back > -0.25 && spot > 0.6) col *= 1.24;
      else if (back > -0.25 && spot < 0.34) col *= 0.84;
      if (abs(back - 0.16) < 0.05 && along > 0.2 && along < 0.94) col = mix(col, vec3(0.9, 0.88, 0.74), 0.75);
    } else if (kind == 6) {
      // Saithe: dark-backed and plain, with a straight pale line.
      if (abs(back - 0.14) < 0.045 && along > 0.2 && along < 0.94) col = mix(col, vec3(0.82, 0.87, 0.9), 0.8);
    } else if (kind == 7) {
      // Haddock: a black line along it, and the black thumbprint over its shoulder.
      if (abs(back - 0.2) < 0.045 && along > 0.2 && along < 0.94) col = vec3(0.07, 0.07, 0.08);
      if (length(vec2((along - 0.3) * 3.2, back + 0.02)) < 0.2) col = vec3(0.06, 0.06, 0.07);
    } else if (kind == 8) {
      // Mackerel: dark wavy bars across its back, and a sheen below them.
      if (back > 0.2 && sin(along * 62.0 + 2.2 * sin(back * 11.0)) > 0.2) col = vec3(0.03, 0.1, 0.14);
      if (back < 0.2 && back > -0.3) col = mix(col, vec3(0.78, 0.86, 0.8), 0.35);
    } else if (kind == 9) {
      // A fin: thin skin on rays.
      if (fract(vMore.y * 7.0) < 0.22) col *= 0.74;
      col *= 0.82 + 0.3 * vMore.z;
    }
    float done = smoothstep(0.0, 1.0, uCooked);
    raw = 1.0 - done;
    if (kind == 10) {
      // Its eye: bright while it is fresh; it turns white in the fire.
      col = mix(col, vec3(0.9, 0.88, 0.82), done);
    } else {
      float pale = dot(col, vec3(0.333));
      col = mix(col, vec3(0.84, 0.54, 0.2) * (0.62 + 0.62 * pale), done);
      // (The skin blisters and darkens in patches as it crisps.)
      if (uCooked > 0.5 && texture(uNoise, vec2(along * 3.7 + 0.3, back * 1.6)).r > 0.62) col *= mix(1.0, 0.66, smoothstep(0.5, 1.2, uCooked));
      col = mix(col, vec3(0.09, 0.07, 0.06), smoothstep(1.5, 2.4, uCooked));
    }
  }
  // PATH-TRACE: on the beach (and by the fire) she stands in the light rays found there: in the bank's
  // shadow of a morning with the stones round her, and under as much of the sky as they are.
  vec2 found = tracedAt(uLightAt);
  float amount = sunShade(vWorld.xz) * found.x * (0.2 + 0.8 * smoothstep(-0.2, 0.7, dot(N, uLightDir)));
  // (Besides the sun, a soft light from the sky, more on what looks up, and a little from over your left
  // shoulder: so that a shape shows its roundness in shade and under cloud.)
  vec3 toYou = normalize(uCam - vWorld);
  vec3 fill = normalize(toYou + vec3(-toYou.z, 0.0, toYou.x) * 0.55 + vec3(0.0, 0.5, 0.0));
  float form = floor((0.6 * smoothstep(-0.6, 0.9, N.y) + 0.4 * smoothstep(0.1, 0.95, dot(N, fill))) * 5.0 + grain) / 5.0;
  // (CATCH: and the fire lights what is near it, as it does the grass.)
  col = col * (uAmbient * found.y * mix(0.7, 1.16, form) + uLightCol * clamp(floor(amount * 6.0 + grain) / 6.0, 0.0, 1.0) + warmLight(vWorld, grain)) * (1.0 - 0.14 * uWet);
  // A fresh fish is wet, and shines where the light glances off it.
  if (raw > 0.4 && kind >= 5 && kind <= 8) {
    vec3 H = normalize(uLightDir + normalize(uCam - vWorld));
    float shine = pow(max(dot(N, H), 0.0), 22.0) * sunShade(vWorld.xz) * found.x * step(0.0, uLightDir.y);
    if (shine > 0.42 + 0.4 * grain) col = mix(col, uLightCol + uAmbient, 0.55 * raw);
  }
  // The lantern lights what is near it, in steps, and most what faces it.
  if (uBowLamp.w > 0.01 && kind != 3) {
    vec3 to = uBowLamp.xyz - vWorld;
    float far = length(to);
    float l = clamp(1.0 - far / 3.8, 0.0, 1.0);
    float q = floor(l * l * (0.3 + 0.7 * max(dot(N, to / far), 0.0)) * 10.0 + grain) / 10.0;
    col += vCol * vec3(1.0, 0.62, 0.26) * q * uBowLamp.w * 1.7;
  }
  col += glow;
  outColor = vec4(mix(col, uFogCol, stepped(fogAmount(vWorld), 28.0, fc)), IS_OBJECT);
}
`;
