// The catch, and what it hangs and cooks on.
//
// Four fish (cod, saithe, haddock, mackerel), each a rounded body with its own
// shape, fins, tail, eye and gill, shaded smooth; the rack they hang from by
// the fire, of forked branches with a pole laid in them; and the spit one is
// cooked on. They are few and small, but they are looked at closely, so they
// are built as real shapes and drawn by the same program as the rowing boat
// (skiff.ts), which lights them as it lights her, the fire's glow included.
//
// The rack stands to the right of the fire, behind the row of logs, where
// from the meadow the fish hang clear above the log tops against plain grass.
// (It stood on the left at first, behind the cairn, and could not be made out.)

import type { V3 } from './gl';
import { FACING, fireHeart, land } from './land';
import { buildLantern, SKIFF_FLOATS } from './skiff';

export type FishKind = 'cod' | 'saithe' | 'haddock' | 'mackerel';
const KINDS: FishKind[] = ['cod', 'saithe', 'haddock', 'mackerel'];

/** What a corner is made of, as the boat's program knows it: wood, paint or stone, rope; then fish skin (one number for each kind), fin, and eye. */
const WOOD = 0;
const PAINT = 1;
const ROPE = 4;
const SKIN = 5; // + 0 cod, 1 saithe, 2 haddock, 3 mackerel
const FIN = 9;
const EYE = 10;

const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const toned = (c: V3, k: number): V3 => [c[0] * k, c[1] * k, c[2] * k];
const smooth = (a: number, b: number, x: number) => {
  const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
const own = (a: number, b: number) => {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** Each kind: how long a grown one is (metres); its back, flank and belly; how deep and how thick its body is; where along it it is deepest; how far its tail is forked. */
export const FISH: Record<FishKind, { long: number; back: V3; flank: V3; belly: V3; deep: number; thick: number; fore: number; fork: number }> = {
  cod: { long: 0.62, back: [0.3, 0.3, 0.17], flank: [0.6, 0.56, 0.38], belly: [0.9, 0.88, 0.8], deep: 0.118, thick: 0.074, fore: 0.5, fork: 0.015 },
  saithe: { long: 0.52, back: [0.1, 0.14, 0.17], flank: [0.42, 0.48, 0.52], belly: [0.84, 0.86, 0.86], deep: 0.102, thick: 0.058, fore: 0.56, fork: 0.05 },
  haddock: { long: 0.46, back: [0.28, 0.26, 0.29], flank: [0.62, 0.62, 0.64], belly: [0.92, 0.92, 0.9], deep: 0.112, thick: 0.06, fore: 0.52, fork: 0.045 },
  mackerel: { long: 0.36, back: [0.06, 0.3, 0.36], flank: [0.55, 0.68, 0.68], belly: [0.94, 0.94, 0.92], deep: 0.086, thick: 0.058, fore: 0.62, fork: 0.07 },
};

type Out = number[];
const put = (out: Out, p: V3, n: V3, col: V3, kind: number, u: number, v: number) => out.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2], kind, u, v);
/** A flat three-cornered face. */
const flat = (out: Out, a: V3, b: V3, c: V3, col: V3, kind: number, uv: [number, number][] = [[0, 0], [0, 0], [0, 0]]) => {
  const n = unit(cross(sub(b, a), sub(c, a)));
  put(out, a, n, col, kind, uv[0][0], uv[0][1]);
  put(out, b, n, col, kind, uv[1][0], uv[1][1]);
  put(out, c, n, col, kind, uv[2][0], uv[2][1]);
};

/**
 * A fish, one long in its own measure: nose at +z, back at +y, its thickness along x. Its body is turned
 * in rings from nose to tail, each corner given the way the skin faces there (so it is shaded round, not
 * in flats) and a colour between its back's and its belly's.
 */
function buildFish(kind: FishKind): number[] {
  const out: Out = [];
  const f = FISH[kind];
  const which = SKIN + KINDS.indexOf(kind);
  // Its outline from nose (t = 0) to the root of its tail (t = 1): 0 at the nose, 1 where it is deepest.
  const a = f.fore;
  const b = 1.05;
  const peak = Math.pow(a / (a + b), a) * Math.pow(b / (a + b), b);
  const girth = (t: number) => (Math.pow(Math.max(t, 0), a) * Math.pow(Math.max(1 - t, 0), b)) / peak;
  const deep = (t: number) => f.deep * girth(t) + 0.024 * smooth(0.55, 1, t) + 0.004;
  // (A cod is broad in the head; the others are not.)
  const thick = (t: number) => f.thick * girth(t) * (kind === 'cod' ? 1 + 0.3 * (1 - smooth(0, 0.4, t)) : 1) + 0.007 * smooth(0.6, 1, t) + 0.003;
  const zAt = (t: number) => 0.5 - 0.92 * t;
  // (Its belly hangs a little: the middle line of each ring lies below the line from nose to tail.)
  const sag = (t: number) => -0.012 * Math.sin(Math.PI * Math.min(1, t * 1.25));
  const AROUND = 12;
  const RINGS = 16;
  const tOf = (i: number) => Math.pow(i / RINGS, 1.25); // rings closer together in the head
  const at = (t: number, k: number): V3 => {
    const th = (k / AROUND) * Math.PI * 2;
    return [Math.sin(th) * thick(t), Math.cos(th) * deep(t) + sag(t), zAt(t)];
  };
  const facing = (t: number, k: number): V3 => {
    const th = (k / AROUND) * Math.PI * 2;
    const e = 0.004;
    const along = sub(at(Math.min(1, t + e), k), at(Math.max(0, t - e), k));
    const round: V3 = [Math.cos(th) * thick(t), -Math.sin(th) * deep(t), 0];
    const n = unit(cross(round, along));
    // (Outward: away from the middle line.)
    return n[0] * Math.sin(th) + n[1] * Math.cos(th) < 0 ? [-n[0], -n[1], -n[2]] : n;
  };
  const colourAt = (k: number): V3 => {
    const up = Math.cos((k / AROUND) * Math.PI * 2); // 1 on its back, -1 under its belly
    return up > 0.35 ? mix3(f.flank, f.back, smooth(0.35, 0.8, up)) : mix3(f.belly, f.flank, smooth(-0.55, 0.35, up));
  };
  for (let i = 0; i < RINGS; i++) {
    const t0 = tOf(i);
    const t1 = tOf(i + 1);
    for (let k = 0; k < AROUND; k++) {
      const corners: [number, number][] = [[t0, k], [t1, k], [t1, k + 1], [t0, k], [t1, k + 1], [t0, k + 1]];
      for (const [t, kk] of corners) put(out, at(t, kk), facing(t, kk), colourAt(kk), which, t, Math.cos((kk / AROUND) * Math.PI * 2));
    }
  }

  // Fins: thin, each a fan of rays from where it joins the body. (Their two numbers are how far along the fin, and how far out from the body.)
  const finCol = toned(mix3(f.back, f.flank, 0.35), 0.82);
  const fin = (pts: V3[], col: V3 = finCol) => {
    // pts[0] and pts[last] lie on the body; the others are its edge. Faces fan from the middle of its root.
    const root = mix3(pts[0], pts[pts.length - 1], 0.5);
    for (let i = 0; i + 1 < pts.length; i++) {
      const u0 = i / (pts.length - 1);
      const u1 = (i + 1) / (pts.length - 1);
      flat(out, root, pts[i], pts[i + 1], col, FIN, [[(u0 + u1) / 2, 0], [u0, 1], [u1, 1]]);
    }
  };
  const top = (t: number) => deep(t) + sag(t);
  const under = (t: number) => -deep(t) + sag(t);
  const dorsal = (t0: number, t1: number, high: number, lean = 0.3) => {
    const z0 = zAt(t0);
    const z1 = zAt(t1);
    fin([[0, top(t0) - 0.004, z0], [0, top(t0) + high * 0.85, z0 + (z1 - z0) * lean], [0, top((t0 + t1) / 2) + high, z0 + (z1 - z0) * (lean + 0.25)], [0, top(t1) + high * 0.3, z1 + (z1 - z0) * 0.12], [0, top(t1) - 0.004, z1]]);
  };
  const anal = (t0: number, t1: number, high: number) => {
    const z0 = zAt(t0);
    const z1 = zAt(t1);
    fin([[0, under(t0) + 0.004, z0], [0, under(t0) - high, z0 + (z1 - z0) * 0.35], [0, under(t1) - high * 0.35, z1 + (z1 - z0) * 0.1], [0, under(t1) + 0.004, z1]]);
  };
  if (kind === 'mackerel') {
    dorsal(0.3, 0.43, 0.075, 0.2);
    dorsal(0.62, 0.71, 0.045);
    anal(0.63, 0.72, 0.04);
    // (And the little finlets down to its tail, above and below.)
    for (let t = 0.75; t < 0.95; t += 0.05) {
      fin([[0, top(t) - 0.002, zAt(t)], [0, top(t) + 0.018, zAt(t + 0.03)], [0, top(t + 0.035) - 0.002, zAt(t + 0.035)]]);
      fin([[0, under(t) + 0.002, zAt(t)], [0, under(t) - 0.018, zAt(t + 0.03)], [0, under(t + 0.035) + 0.002, zAt(t + 0.035)]]);
    }
  } else {
    // The cod and its cousins carry three fins on the back and two beneath.
    dorsal(0.27, 0.42, kind === 'haddock' ? 0.105 : 0.07, kind === 'haddock' ? 0.18 : 0.3);
    dorsal(0.45, 0.64, 0.06);
    dorsal(0.67, 0.84, 0.045);
    anal(0.48, 0.65, 0.055);
    anal(0.68, 0.84, 0.042);
  }
  // The fins at its sides, laid back along it, and the small pair under its throat.
  for (const side of [1, -1]) {
    const t = 0.27;
    const root: V3 = [side * thick(t) * 0.98, sag(t) - deep(t) * 0.25, zAt(t)];
    fin([add(root, [0, 0.022, 0]), [side * (thick(t) + 0.045), root[1] - 0.02, zAt(t + 0.12)], [side * (thick(t) + 0.03), root[1] - 0.075, zAt(t + 0.1)], add(root, [0, -0.02, 0])], toned(finCol, 1.15));
    const tp = 0.22;
    fin([[side * 0.012, under(tp) + 0.006, zAt(tp)], [side * 0.03, under(tp) - 0.045, zAt(tp + 0.07)], [side * 0.012, under(tp + 0.05) + 0.006, zAt(tp + 0.05)]], toned(f.belly, 0.8));
  }
  // Its tail: two lobes, forked more or less.
  {
    const z = zAt(1);
    const r = deep(1) * 0.9;
    const span = kind === 'cod' ? 0.13 : 0.15;
    const notch: V3 = [0, sag(1), z - 0.1 + f.fork];
    fin([[0, sag(1) + r, z], [0, sag(1) + span * 0.75, z - 0.07], [0, sag(1) + span, z - 0.15], [0, sag(1) + span * 0.45, z - 0.115], notch], toned(finCol, 0.9));
    fin([notch, [0, sag(1) - span * 0.45, z - 0.115], [0, sag(1) - span, z - 0.15], [0, sag(1) - span * 0.75, z - 0.07], [0, sag(1) - r, z]], toned(finCol, 0.9));
  }

  // Its eye, its gill cover, and the line of its mouth.
  for (const side of [1, -1]) {
    const te = 0.105;
    const c: V3 = [side * (thick(te) * 0.9 + 0.003), sag(te) + deep(te) * 0.32, zAt(te)];
    const n: V3 = [side, 0.15, 0.2];
    const ring = (r: number, i: number): V3 => {
      const an = (i / 8) * Math.PI * 2;
      return [c[0], c[1] + Math.sin(an) * r, c[2] + Math.cos(an) * r];
    };
    for (let i = 0; i < 8; i++) {
      // (Iris pale, pupil dark: the pupil stands a hair proud so that it wins.)
      for (const [r, col, proud, part] of [[0.021, [0.82, 0.78, 0.5] as V3, 0, 0], [0.011, [0.03, 0.03, 0.04] as V3, 0.002, 1]] as const) {
        const p0 = add(c, [side * proud, 0, 0]);
        const p1 = add(ring(r, i), [side * proud, 0, 0]);
        const p2 = add(ring(r, i + 1), [side * proud, 0, 0]);
        for (const p of [p0, p1, p2]) put(out, p, unit(n), col, EYE, part, 0);
      }
    }
    // The gill cover: a dark curved edge behind the head.
    const tg = 0.215;
    for (let j = 0; j < 7; j++) {
      const k0 = 1.2 + (j / 7) * 3.4;
      const k1 = 1.2 + ((j + 1) / 7) * 3.4;
      const bow = (kk: number) => 0.035 * Math.sin(((kk - 1.2) / 3.4) * Math.PI);
      const p = (kk: number, w: number): V3 => {
        const th = ((side > 0 ? kk : AROUND - kk) / AROUND) * Math.PI * 2;
        const t = tg + bow(kk) + w;
        return [Math.sin(th) * (thick(t) + 0.0025), Math.cos(th) * (deep(t) + 0.0025) + sag(t), zAt(t)];
      };
      const col = toned(mix3(f.back, f.flank, 0.5), 0.5);
      const nn = facing(tg, side > 0 ? (k0 + k1) / 2 : AROUND - (k0 + k1) / 2);
      for (const q of [p(k0, 0), p(k1, 0), p(k1, 0.016), p(k0, 0), p(k1, 0.016), p(k0, 0.016)]) put(out, q, nn, col, PAINT, 0, 0);
    }
    // The mouth.
    const m0: V3 = [side * (thick(0.012) + 0.002), sag(0.012) - deep(0.012) * 0.25, zAt(0.012)];
    const m1: V3 = [side * (thick(0.085) + 0.002), sag(0.085) - deep(0.085) * 0.42, zAt(0.085)];
    const mn: V3 = [side, -0.2, 0.3];
    for (const q of [m0, m1, add(m1, [0, 0.007, 0]), m0, add(m1, [0, 0.007, 0]), add(m0, [0, 0.005, 0])]) put(out, q, unit(mn), [0.08, 0.07, 0.07], PAINT, 0, 0);
  }
  return out;
}

/** A round stick from one end to the other, of one thickness at one end and another at the other; its bark in two tones. */
function stick(out: Out, from: V3, to: V3, r0: number, r1: number, col: V3, kind = WOOD, sides = 7): void {
  const along = unit(sub(to, from));
  const side = unit(Math.abs(along[1]) > 0.95 ? cross(along, [1, 0, 0]) : cross(along, [0, 1, 0]));
  const up = cross(side, along);
  const seed = own(from[0] * 1.3 + to[2], from[1] * 2.1 + to[0]) * 9;
  const at = (p: V3, r: number, k: number): V3 => {
    const an = (k / sides) * Math.PI * 2;
    return add(add(p, side, Math.cos(an) * r), up, Math.sin(an) * r);
  };
  const nrm = (k: number): V3 => {
    const an = (k / sides) * Math.PI * 2;
    return add(add([0, 0, 0], side, Math.cos(an)), up, Math.sin(an));
  };
  for (let k = 0; k < sides; k++) {
    const tone = 0.9 + 0.2 * own(seed, k);
    const quad: [V3, number][] = [[from, k], [to, k], [to, k + 1], [from, k], [to, k + 1], [from, k + 1]];
    for (const [p, kk] of quad) put(out, at(p, p === from ? r0 : r1, kk), nrm(kk), toned(col, tone), kind, dot(sub(p, from), along) + seed, (kk / sides) * 0.6 + seed);
    flat(out, from, at(from, r0, k + 1), at(from, r0, k), toned(col, 1.25), kind);
    flat(out, to, at(to, r1, k), at(to, r1, k + 1), toned(col, 1.25), kind);
  }
}
/** A rough stone, bedded where it lies. */
function stone(out: Out, c: V3, r: V3, seed: number): void {
  const RINGS = 5;
  const SIDES = 7;
  const at = (i: number, k: number): V3 => {
    const lat = -Math.PI / 2 + (i / RINGS) * Math.PI;
    const lon = ((k % SIDES) / SIDES) * Math.PI * 2;
    const rough = 0.84 + 0.3 * own(i * 3.3 + seed, (k % SIDES) * 1.7);
    return [c[0] + Math.cos(lat) * Math.cos(lon) * r[0] * rough, c[1] + Math.sin(lat) * r[1] * rough, c[2] + Math.cos(lat) * Math.sin(lon) * r[2] * rough];
  };
  for (let i = 0; i < RINGS; i++) {
    for (let k = 0; k < SIDES; k++) {
      const col = toned([0.4, 0.41, 0.45], 0.82 + 0.34 * own(i + seed, k));
      flat(out, at(i, k), at(i + 1, k), at(i + 1, k + 1), col, PAINT);
      flat(out, at(i, k), at(i + 1, k + 1), at(i, k + 1), col, PAINT);
    }
  }
}

/** The way you face from the meadow, and the way to your right, along the ground. */
const AHEAD: V3 = [Math.sin(FACING), 0, -Math.cos(FACING)];
const RIGHT: V3 = [Math.cos(FACING), 0, Math.sin(FACING)];
/** How much larger than life the fish hang and cook (they are a good way off: like the washing, they are drawn to be made out). */
export const FISH_BIG = 1.45;

/** Where the rack stands: its middle on the ground, its two feet, how high its pole lies, and how far along the pole the fish may hang (either side of its middle). */
export function rackPlace(): { mid: V3; left: V3; right: V3; high: number; span: number } {
  const h = fireHeart;
  const foot = (p: V3): V3 => [p[0], land(p[0], p[2]) - 0.04, p[2]];
  const mid = foot(add(add(h, RIGHT, 2.95), AHEAD, 1.95));
  const left = foot(add(mid, RIGHT, -0.92));
  const right = foot(add(mid, RIGHT, 0.92));
  return { mid, left, right, high: Math.max(left[1], right[1]) + 1.36, span: 0.72 };
}
/** Where the spit lies: the foot of its forked rest, the butt of the stick, and its tip over the fire. */
export function spitPlace(): { fork: V3; forkTop: V3; butt: V3; tip: V3 } {
  const h = fireHeart;
  const foot = (p: V3): V3 => [p[0], land(p[0], p[2]) - 0.03, p[2]];
  // (Its tip is on your side of the flames, so that what is cooking is seen against them and not lost in them.)
  const butt = foot(add(add(h, RIGHT, 1.58), AHEAD, 0.5));
  const tip: V3 = [h[0] - RIGHT[0] * 0.5 - AHEAD[0] * 0.42, h[1] + 0.64, h[2] - RIGHT[2] * 0.5 - AHEAD[2] * 0.42];
  const fork = foot([butt[0] + (tip[0] - butt[0]) * 0.36, 0, butt[2] + (tip[2] - butt[2]) * 0.36]);
  // (The rest's top is where the line from butt to tip passes over its foot.)
  const t = dot(sub(fork, butt), sub(tip, butt)) / dot(sub(tip, butt), sub(tip, butt));
  const over = add(butt, sub(tip, butt), t);
  return { fork, forkTop: [fork[0], over[1] - 0.02, fork[2]], butt: [butt[0], butt[1] + 0.05, butt[2]], tip };
}

/** The rack: two forked branches with a stay behind each, a pole laid in the forks and lashed there, and stones packed round its feet. In the scene's own measure. */
function buildRack(): number[] {
  const out: Out = [];
  const { left, right, high } = rackPlace();
  const BARK: V3 = [0.36, 0.27, 0.18];
  const PEELED: V3 = [0.62, 0.5, 0.32];
  const HEMP: V3 = [0.8, 0.72, 0.52];
  let n = 0;
  for (const foot of [left, right]) {
    const lean = foot === left ? -0.03 : 0.03;
    const crotch: V3 = [foot[0] + RIGHT[0] * lean, high - 0.07, foot[2] + RIGHT[2] * lean];
    const knee: V3 = [foot[0] + RIGHT[0] * lean * 0.4 + AHEAD[0] * 0.02, foot[1] + (high - foot[1]) * 0.55, foot[2] + RIGHT[2] * lean * 0.4 + AHEAD[2] * 0.02];
    // (A branch is never quite straight.)
    stick(out, foot, knee, 0.042, 0.036, BARK);
    stick(out, knee, crotch, 0.036, 0.032, BARK);
    for (const way of [-1, 1]) stick(out, crotch, add(crotch, [AHEAD[0] * 0.11 * way, 0.2, AHEAD[2] * 0.11 * way]), 0.027, 0.018, BARK, WOOD, 6);
    // A stay, leaning in from behind.
    const back = add(foot, AHEAD, 0.62);
    stick(out, [back[0], land(back[0], back[2]) - 0.03, back[2]], add(crotch, [0, -0.1, 0]), 0.026, 0.022, toned(BARK, 0.9), WOOD, 6);
    // The lashing where pole, fork and stay meet.
    stick(out, add(crotch, [-RIGHT[0] * 0.05, -0.02, -RIGHT[2] * 0.05]), add(crotch, [RIGHT[0] * 0.05, -0.02, RIGHT[2] * 0.05]), 0.05, 0.05, HEMP, ROPE, 7);
    // Stones packed round its foot.
    stone(out, add(foot, [RIGHT[0] * 0.1 - AHEAD[0] * 0.07, 0.07, RIGHT[2] * 0.1 - AHEAD[2] * 0.07]), [0.11, 0.08, 0.1], 3 + n);
    stone(out, add(foot, [-RIGHT[0] * 0.09 - AHEAD[0] * 0.1, 0.06, -RIGHT[2] * 0.09 - AHEAD[2] * 0.1]), [0.09, 0.07, 0.09], 7 + n);
    stone(out, add(foot, [RIGHT[0] * 0.02 + AHEAD[0] * 0.12, 0.05, RIGHT[2] * 0.02 + AHEAD[2] * 0.12]), [0.08, 0.06, 0.09], 11 + n);
    n += 20;
  }
  // The pole: peeled, a little bowed, standing out past the forks at either end.
  const a: V3 = [left[0] - RIGHT[0] * 0.2, high + 0.015, left[2] - RIGHT[2] * 0.2];
  const b: V3 = [right[0] + RIGHT[0] * 0.2, high + 0.015, right[2] + RIGHT[2] * 0.2];
  const SEG = 6;
  for (let i = 0; i < SEG; i++) {
    const p = (t: number): V3 => {
      const q = mix3(a, b, t);
      return [q[0], q[1] - 0.03 * Math.sin(Math.PI * t), q[2]];
    };
    stick(out, p(i / SEG), p((i + 1) / SEG), 0.028 - 0.004 * (i / SEG), 0.028 - 0.004 * ((i + 1) / SEG), PEELED);
  }
  return out;
}

/** The spit: a forked rest by the fire, a green stick laid in it with its tip over the flames, and two stones on its butt to hold it there. */
function buildSpit(): number[] {
  const out: Out = [];
  const { fork, forkTop, butt, tip } = spitPlace();
  const BARK: V3 = [0.36, 0.27, 0.18];
  stick(out, fork, forkTop, 0.032, 0.027, BARK);
  const across = unit(cross(sub(tip, butt), [0, 1, 0]));
  for (const way of [-1, 1]) stick(out, forkTop, add(forkTop, [across[0] * 0.07 * way, 0.13, across[2] * 0.07 * way]), 0.022, 0.015, BARK, WOOD, 6);
  stick(out, butt, mix3(butt, tip, 0.55), 0.021, 0.017, [0.4, 0.44, 0.24]);
  stick(out, mix3(butt, tip, 0.55), add(tip, sub(tip, butt), 0.08), 0.017, 0.009, [0.44, 0.46, 0.26]);
  stone(out, add(butt, [across[0] * 0.03, 0.05, across[2] * 0.03]), [0.12, 0.08, 0.11], 41);
  stone(out, add(butt, [-across[0] * 0.1 + 0.02, 0.03, -across[2] * 0.1]), [0.09, 0.06, 0.08], 47);
  return out;
}

/** Every shape here in one list, and where each begins and how many corners it has. (Built once the fire is in its place.) */
export function buildCatch(): { data: Float32Array; parts: Record<string, [number, number]> } {
  const all: number[] = [];
  const parts: Record<string, [number, number]> = {};
  const take = (name: string, corners: number[]) => {
    parts[name] = [all.length / SKIFF_FLOATS, corners.length / SKIFF_FLOATS];
    for (const v of corners) all.push(v);
  };
  for (const kind of KINDS) take(kind, buildFish(kind));
  take('rack', buildRack());
  take('spit', buildSpit());
  take('lantern', buildLantern());
  return { data: new Float32Array(all), parts };
}
