// The room indoors, built as a room. You are standing in the nearest of the turf
// houses, a few paces back from its seaward window. Everything in here is a
// real thing with its own depth: the plank floor and the rug on it, the beams
// overhead, the thick wall with the window set deep in it, the table under the
// window, the chair, the stove with its pipe and kettle, the shelf of books,
// the cat asleep by the fire. It is lit by what comes in at the window, by the
// lamp on the sill and by the stove, and what is outside the window is the real
// scene, with the real weather on the glass.
//
// The room is measured in its own terms: x to your right, y up from the floor,
// z ahead of you, all in metres, with your eyes at (0, EYE_HIGH, 0). The shader
// turns that to face the way you face.

import { HEAD } from './shaders';
import { RAY_MESH } from './rays';

type V3 = [number, number, number];

/** How high your eyes are above the floor. */
const EYE_HIGH = 1.5;
/** The room: half its width, how far behind you it goes, where the window wall's inner face is, how thick that wall is, and the ceiling. */
const HALF = 3.0;
const BACK = -0.9;
const WALL = 4.2;
const THICK = 0.5;
const TOP = 2.45;
/** The window: a wide one of three lights, set in the far wall. */
const WIN = { x0: -1.45, x1: 1.45, y0: 0.84, y1: 2.08 };
/** Where the glass stands in the depth of the wall. */
const GLASS_Z = WALL + 0.4;
/** The lamp on the sill, and its flame. */
const LAMP: V3 = [-0.95, WIN.y0, WALL + 0.17];
const FLAME: V3 = [LAMP[0], LAMP[1] + 0.155, LAMP[2]];
/** The door of the stove, which the fire shows through. */
const STOVE: V3 = [2.27, 0.53, 2.5];
/** The chair at the table: where you are when you sit in it (your seat on the floor, as x and z; your eyes at the height given). */
const SEAT: V3 = [-0.55, 1.2, 2.8];

/** While the room is drawn it keeps the nearest sliver of the picture's depth to itself, so that nothing outside can come in front of it. */
export const ROOM_DEPTH = 0.012;

/** What the page needs to know of the room, in the room's own measure. */
/**
 * HOURGLASS: the hourglass on the table, as a real thing: where it stands, how tall, and the shape of its
 * glass (two bulbs meeting at a waist). `glassR` is the glass's radius at a height in a bulb, from 0 at
 * the waist to 1 at the wooden end; the shaders are given the same rule, so the sand can fill the glass
 * exactly as far up as it has run.
 */
const HG = { x: 0.13, z: 3.86, foot: 0.765, plate: 0.016, high: 0.22, waist: 0.0055, bulb: 0.041, ends: 0.058, posts: 0.047 };
const HG_WAIST_Y = HG.foot + HG.high / 2;
const HG_BULB_H = HG.high / 2 - HG.plate;
/**
 * CANDLE: a candle in a brass stick on the table, alight while the curtains are drawn: the room's light
 * when the day is shut out. Where it stands, and where its flame is.
 */
const CANDLE: V3 = [-0.82, 0.765, 3.9];
const CANDLE_FLAME: V3 = [CANDLE[0], CANDLE[1] + 0.262, CANDLE[2]];
/** CLOTH: the curtains. Where the cloth hangs from and to, how wide each is when drawn back, how far out from the wall, and how many pleats each hangs in. */
const CLOTH = { low: 0.6, high: 2.21, wide: 0.53, z: WALL - 0.085, folds: 9 };
const glassR = (t: number) => HG.waist + (HG.bulb - HG.waist) * Math.pow(Math.sin(Math.min(1, Math.max(0, t)) * 2.2), 0.75);

export const PARLOUR = { eyeHigh: EYE_HIGH, win: WIN, glassZ: GLASS_Z, lamp: LAMP, flame: FLAME, wall: WALL, seat: SEAT };

/** The things in the room that answer a click, each as a box round it: its low corner and its high one. Small things first. */
export const TOUCH: [string, V3, V3][] = [
  ['lamp', [LAMP[0] - 0.1, LAMP[1] - 0.02, LAMP[2] - 0.08], [LAMP[0] + 0.1, LAMP[1] + 0.36, LAMP[2] + 0.08]],
  ['mug', [0.31, 0.76, 3.5], [0.48, 0.92, 3.63]],
  ['hourglass', [HG.x - HG.ends, HG.foot - 0.005, HG.z - HG.ends], [HG.x + HG.ends, HG.foot + HG.high + 0.005, HG.z + HG.ends]],
  ['book', [-0.52, 0.76, 3.44], [-0.02, 0.8, 3.8]],
  ['kettle', [2.06, 1.02, 2.6], [2.38, 1.24, 2.86]],
  ['wireless', [-2.46, 0.5, 3.85], [-2.11, 0.75, 4.08]],
  ['cat', [0.86, 0, 2.56], [1.42, 0.22, 2.9]],
  ['chair', [SEAT[0] - 0.25, 0, SEAT[2] - 0.3], [SEAT[0] + 0.25, 0.94, SEAT[2] + 0.2]],
  ['stove', [1.93, 0.02, 2.5], [2.62, 1.02, 3.22]],
  ['curtain', [WIN.x0 - 0.58, 0.6, WALL - 0.14], [WIN.x0 - 0.02, 2.22, WALL - 0.03]],
  ['curtain', [WIN.x1 + 0.02, 0.6, WALL - 0.14], [WIN.x1 + 0.58, 2.22, WALL - 0.03]],
];

const MAT = {
  wall: 0, floor: 1, ceiling: 2, beam: 3, plaster: 4, frame: 5, curtain: 6, rug: 7, wood: 8, brass: 9, iron: 10, glow: 11,
  terracotta: 12, leaf: 13, book: 14, paper: 15, mug: 16, flame: 17, clock: 18, blanket: 19, fur: 20, copper: 21, log: 22,
  picture: 23, chimney: 24, slate: 25, basket: 26, wool: 27, herb: 28,
  // Things drawn on a card by the shader: steam, the hourglass, the wireless's face, the calendar, motes in the light.
  steam: 29, hourglass: 30, wireless: 31, calendar: 32, motes: 33, yarn: 34, sail: 35, shell: 36,
  // The hourglass's glass, and the sand in it (see HOURGLASS).
  glassware: 37, sand: 38,
  // The candle's flame (see CANDLE).
  candleFlame: 39,
};

/** Numbers kept for each corner: where it is, the way its face looks, two numbers the material may use, and the material. */
export const PARLOUR_FLOATS = 9;

// A ball of twenty faces, split once into eighty: for round things.
const BALL = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const unit = (v: V3): V3 => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const points: V3[] = ([[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]] as V3[]).map(unit);
  const faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const out: V3[][] = [];
  for (const [a, b, c] of faces) {
    const mid = (p: V3, q: V3) => unit([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]);
    const A = points[a];
    const B = points[b];
    const C = points[c];
    const ab = mid(A, B);
    const bc = mid(B, C);
    const ca = mid(C, A);
    out.push([A, ab, ca], [B, bc, ab], [C, ca, bc], [ab, bc, ca]);
  }
  return out;
})();

class Kit {
  data: number[] = [];

  /** A flat four-cornered face, given its corners in order round it and the way it looks. */
  quad(a: V3, b: V3, c: V3, d: V3, n: V3, mat: number, uv: [number, number][] = [[0, 0], [0, 0], [0, 0], [0, 0]]): void {
    const put = (p: V3, t: [number, number]) => this.data.push(p[0], p[1], p[2], n[0], n[1], n[2], t[0], t[1], mat);
    put(a, uv[0]);
    put(b, uv[1]);
    put(c, uv[2]);
    put(a, uv[0]);
    put(c, uv[2]);
    put(d, uv[3]);
  }

  /**
   * A box from its low corner to its high one. `tint` is a number the material may use (which colour of
   * book, say); `part` says which moving part of the room it belongs to (0 for what never moves).
   */
  box(lo: V3, hi: V3, mat: number, tint = 0, part = 0): void {
    const [x0, y0, z0] = lo;
    const [x1, y1, z1] = hi;
    const t: [number, number][] = [[tint, part], [tint, part], [tint, part], [tint, part]];
    this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1], mat, t); // toward you
    this.quad([x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1], [0, 0, 1], mat, t);
    this.quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0], mat, t);
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], mat, t);
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0], mat, t);
    this.quad([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0], mat, t);
  }

  /** A rounded lump: a ball stretched to `r` about `c`, each of its small faces flat. */
  lump(c: V3, r: V3, mat: number, tint = 0, part = 0): void {
    for (const face of BALL) {
      const pts = face.map((d) => [c[0] + d[0] * r[0], c[1] + d[1] * r[1], c[2] + d[2] * r[2]] as V3);
      const mid: V3 = [(face[0][0] + face[1][0] + face[2][0]) / 3, (face[0][1] + face[1][1] + face[2][1]) / 3, (face[0][2] + face[1][2] + face[2][2]) / 3];
      // (The face looks the way the ball's surface does there, squeezed as the ball is squeezed.)
      const raw: V3 = [mid[0] / r[0], mid[1] / r[1], mid[2] / r[2]];
      const l = Math.hypot(raw[0], raw[1], raw[2]);
      const n: V3 = [raw[0] / l, raw[1] / l, raw[2] / l];
      for (const q of pts) this.data.push(q[0], q[1], q[2], n[0], n[1], n[2], tint, part, mat);
    }
  }
}

/** The moving parts of the room: the shader shifts each as the page tells it to. */
const PART = { curtainLeft: 1, curtainRight: 2, catBody: 3, catHead: 4, catTail: 5, pendulum: 6, log: 7 /* and 8, 9, 10, 11 */, sandTop: 12, sandHeap: 13, sandStream: 14 };
/** How many logs the basket holds when it is full. */
export const BASKET_LOGS = 5;

/** A small steady random-number maker, so the books stand the same way every time. */
function dice(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Everything in the room but the glass: corners in triangles, PARLOUR_FLOATS numbers each. */
export function buildParlour(): Float32Array {
  const k = new Kit();
  const r = dice(907);
  const { x0, x1, y0, y1 } = WIN;
  const OUT = WALL + THICK;

  // ---- the shell: floor, ceiling and its beams, the two side walls, and the far wall round the window
  k.quad([-HALF, 0, BACK], [-HALF, 0, WALL], [HALF, 0, WALL], [HALF, 0, BACK], [0, 1, 0], MAT.floor);
  k.quad([-HALF, TOP, WALL], [-HALF, TOP, BACK], [HALF, TOP, BACK], [HALF, TOP, WALL], [0, -1, 0], MAT.ceiling);
  for (const bx of [-1.95, 0, 1.95]) k.box([bx - 0.075, TOP - 0.17, BACK], [bx + 0.075, TOP, WALL], MAT.beam);
  k.box([-HALF, TOP - 0.13, WALL - 0.11], [HALF, TOP, WALL], MAT.beam); // the wall plate the beams rest on
  k.quad([-HALF, 0, BACK], [-HALF, TOP, BACK], [-HALF, TOP, WALL], [-HALF, 0, WALL], [1, 0, 0], MAT.wall);
  k.quad([HALF, 0, WALL], [HALF, TOP, WALL], [HALF, TOP, BACK], [HALF, 0, BACK], [-1, 0, 0], MAT.wall);
  const far = (ax: number, ay: number, bx: number, by: number) => k.quad([ax, ay, WALL], [ax, by, WALL], [bx, by, WALL], [bx, ay, WALL], [0, 0, -1], MAT.wall);
  far(-HALF, 0, x0, TOP);
  far(x1, 0, HALF, TOP);
  far(x0, 0, x1, y0);
  far(x0, y1, x1, TOP);
  // Skirting along the foot of each wall.
  k.box([-HALF, 0, BACK], [-HALF + 0.025, 0.11, WALL], MAT.beam);
  k.box([HALF - 0.025, 0, BACK], [HALF, 0.11, WALL], MAT.beam);
  k.box([-HALF, 0, WALL - 0.025], [HALF, 0.11, WALL], MAT.beam);

  // ---- the window: the thickness of the wall round it, the sill, the frame and its bars
  k.quad([x0, y0, WALL], [x0, y1, WALL], [x0, y1, OUT], [x0, y0, OUT], [1, 0, 0], MAT.plaster);
  k.quad([x1, y0, OUT], [x1, y1, OUT], [x1, y1, WALL], [x1, y0, WALL], [-1, 0, 0], MAT.plaster);
  k.quad([x0, y1, OUT], [x0, y1, WALL], [x1, y1, WALL], [x1, y1, OUT], [0, -1, 0], MAT.plaster);
  k.box([x0 - 0.14, y0 - 0.045, WALL - 0.16], [x1 + 0.14, y0, OUT], MAT.wood, 1); // the sill board, standing out into the room
  const fz0 = GLASS_Z - 0.03;
  const fz1 = GLASS_Z + 0.03;
  k.box([x0, y0, fz0], [x0 + 0.07, y1, fz1], MAT.frame);
  k.box([x1 - 0.07, y0, fz0], [x1, y1, fz1], MAT.frame);
  k.box([x0, y1 - 0.07, fz0], [x1, y1, fz1], MAT.frame);
  k.box([x0, y0, fz0], [x1, y0 + 0.06, fz1], MAT.frame);
  for (const m of paneEdges().uprights) k.box([m - 0.022, y0, fz0], [m + 0.022, y1, fz1], MAT.frame);
  k.box([x0, paneEdges().transom - 0.022, fz0], [x1, paneEdges().transom + 0.022, fz1], MAT.frame);

  // ---- curtains on a brass rod, drawn back to either side
  k.box([x0 - 0.62, 2.215, WALL - 0.12], [x1 + 0.62, 2.245, WALL - 0.09], MAT.brass);
  // CLOTH. Each curtain is a sheet of cloth, not a slab: cut here into narrow strips from the rod to the
  // hem, and hung in pleats by the shader (deep and close together while it is drawn back, shallow and
  // wide once it is drawn across), so that its folds are real folds, lit and shaded as folds are. Each
  // corner carries how far across the cloth it is, from the end that is fixed (0) to the end that is drawn (1).
  const cloth = (outer: number, way: number, part: number) => {
    const COLS = CLOTH.folds * 12;
    const ROWS = 10;
    const at = (u: number, v: number): V3 => [outer + way * u * CLOTH.wide, CLOTH.low + v * (CLOTH.high - CLOTH.low), CLOTH.z];
    for (let i = 0; i < COLS; i++) {
      for (let j = 0; j < ROWS; j++) {
        const u0 = i / COLS;
        const u1 = (i + 1) / COLS;
        k.quad(at(u0, j / ROWS), at(u0, (j + 1) / ROWS), at(u1, (j + 1) / ROWS), at(u1, j / ROWS), [0, 0, -1], MAT.curtain, [[u0, part], [u0, part], [u1, part], [u1, part]]);
      }
    }
  };
  cloth(x0 - 0.56, 1, PART.curtainLeft);
  cloth(x1 + 0.56, -1, PART.curtainRight);
  // (The rings they hang by, along the rod.)
  for (let i = 0; i < 9; i++) {
    const rx = x0 - 0.5 + (i / 8) * (x1 - x0 + 1.0);
    k.box([rx - 0.012, 2.2, WALL - 0.125], [rx + 0.012, 2.26, WALL - 0.085], MAT.brass);
  }
  // The window's catch, on the bar across it: a small brass plate, and the lever that turns on it.
  // (It was a block of black iron, which against the daylight was only a black block.)
  {
    const ty = paneEdges().transom;
    k.box([-0.018, ty - 0.024, GLASS_Z - 0.042], [0.018, ty + 0.024, GLASS_Z - 0.03], MAT.brass);
    k.box([-0.008, ty - 0.007, GLASS_Z - 0.056], [0.046, ty + 0.007, GLASS_Z - 0.042], MAT.brass);
  }

  // ---- the table under the window, with a book left open on it and a mug
  k.box([-1.0, 0.72, 3.28], [1.0, 0.765, 4.0], MAT.wood);
  k.box([-0.93, 0.62, 3.34], [0.93, 0.72, 3.94], MAT.wood, 2); // its apron
  // CANDLE: a brass stick (a broad foot, a stem, a cup with a drip pan), a candle in it, and its flame.
  {
    const [cx, cy, cz] = CANDLE;
    k.lump([cx, cy + 0.008, cz], [0.055, 0.012, 0.055], MAT.brass);
    k.box([cx - 0.011, cy + 0.012, cz - 0.011], [cx + 0.011, cy + 0.1, cz + 0.011], MAT.brass);
    k.lump([cx, cy + 0.058, cz], [0.02, 0.014, 0.02], MAT.brass);
    k.lump([cx, cy + 0.104, cz], [0.04, 0.008, 0.04], MAT.brass);
    k.box([cx - 0.014, cy + 0.108, cz - 0.014], [cx + 0.014, cy + 0.225, cz + 0.014], MAT.mug, 1);
    k.box([cx - 0.002, cy + 0.225, cz - 0.002], [cx + 0.002, cy + 0.238, cz + 0.002], MAT.iron, 2); // the wick
    k.quad([cx - 0.022, cy + 0.228, cz - 0.001], [cx - 0.022, cy + 0.305, cz - 0.001], [cx + 0.022, cy + 0.305, cz - 0.001], [cx + 0.022, cy + 0.228, cz - 0.001], [0, 0, -1], MAT.candleFlame, [[0, 0], [0, 1], [1, 1], [1, 0]]);
  }
  for (const [lx, lz] of [[-0.95, 3.32], [0.89, 3.32], [-0.95, 3.9], [0.89, 3.9]]) k.box([lx, 0, lz], [lx + 0.06, 0.72, lz + 0.06], MAT.wood, 2);
  k.box([-0.5, 0.765, 3.46], [-0.275, 0.785, 3.78], MAT.paper);
  k.box([-0.265, 0.765, 3.46], [-0.04, 0.785, 3.78], MAT.paper, 1);
  k.box([0.34, 0.765, 3.52], [0.43, 0.87, 3.61], MAT.mug);
  k.box([0.43, 0.795, 3.55], [0.46, 0.85, 3.58], MAT.mug);
  k.box([0.6, 0.765, 3.4], [0.84, 0.79, 3.7], MAT.book, 2); // a closed book, and another on it
  k.box([0.62, 0.79, 3.43], [0.83, 0.812, 3.68], MAT.book, 4);
  // Its drawer, with a brass knob; and the rail that ties its legs together.
  k.box([-0.3, 0.635, 3.33], [0.3, 0.71, 3.345], MAT.wood);
  k.lump([0, 0.672, 3.325], [0.02, 0.02, 0.015], MAT.brass);
  k.box([-0.92, 0.14, 3.6], [0.92, 0.18, 3.64], MAT.wood, 2);
  // A woven runner down the middle of it.
  k.box([-0.62, 0.765, 3.84], [0.9, 0.769, 3.98], MAT.blanket, 2);
  // The hourglass (see HOURGLASS): two turned wooden ends, three brass posts between them, the glass,
  // and the sand: what is left above, the heap below, and the thread falling between while it runs.
  {
    const put = (p: V3, n: V3, tint: number, part: number, mat: number) => k.data.push(p[0], p[1], p[2], n[0], n[1], n[2], tint, part, mat);
    const round = (r: number, y: number, a: number): V3 => [HG.x + r * Math.cos(a), y, HG.z + r * Math.sin(a)];
    const TURN = Math.PI * 2;
    // The ends: ten-sided, each with a narrower bead next to the glass.
    const disc = (y0: number, y1: number, r: number, sides: number, mat: number, tint: number) => {
      for (let i = 0; i < sides; i++) {
        const a0 = (i / sides) * TURN;
        const a1 = ((i + 1) / sides) * TURN;
        const am = (a0 + a1) / 2;
        const n: V3 = [Math.cos(am), 0, Math.sin(am)];
        const t: [number, number][] = [[tint, 0], [tint, 0], [tint, 0], [tint, 0]];
        k.quad(round(r, y0, a0), round(r, y1, a0), round(r, y1, a1), round(r, y0, a1), n, mat, t);
        for (const [y, up] of [[y1, 1], [y0, -1]] as const) {
          put([HG.x, y, HG.z], [0, up, 0], tint, 0, mat);
          put(round(r, y, a0), [0, up, 0], tint, 0, mat);
          put(round(r, y, a1), [0, up, 0], tint, 0, mat);
        }
      }
    };
    const top = HG.foot + HG.high;
    disc(HG.foot, HG.foot + HG.plate * 0.7, HG.ends, 10, MAT.wood, 2);
    disc(HG.foot + HG.plate * 0.7, HG.foot + HG.plate, HG.ends * 0.8, 10, MAT.wood, 1);
    disc(top - HG.plate * 0.7, top, HG.ends, 10, MAT.wood, 2);
    disc(top - HG.plate, top - HG.plate * 0.7, HG.ends * 0.8, 10, MAT.wood, 1);
    // The posts, with a little collar at each end.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TURN + 0.52;
      const [px, , pz] = round(HG.posts, 0, a);
      k.box([px - 0.0035, HG.foot + HG.plate, pz - 0.0035], [px + 0.0035, top - HG.plate, pz + 0.0035], MAT.brass);
      k.box([px - 0.006, HG.foot + HG.plate, pz - 0.006], [px + 0.006, HG.foot + HG.plate + 0.008, pz + 0.006], MAT.brass);
      k.box([px - 0.006, top - HG.plate - 0.008, pz - 0.006], [px + 0.006, top - HG.plate, pz + 0.006], MAT.brass);
    }
    // The glass: each bulb turned in rings from the waist to its wooden end.
    const SIDES = 14;
    const RINGS = 9;
    for (const way of [1, -1]) {
      for (let j = 0; j < RINGS; j++) {
        const t0 = j / RINGS;
        const t1 = (j + 1) / RINGS;
        const lean = (t: number) => (glassR(t + 0.01) - glassR(t - 0.01)) / 0.02 / HG_BULB_H; // how fast the glass widens there
        for (let i = 0; i < SIDES; i++) {
          const a0 = (i / SIDES) * TURN;
          const a1 = ((i + 1) / SIDES) * TURN;
          const at = (t: number, a: number): V3 => round(glassR(t), HG_WAIST_Y + way * t * HG_BULB_H, a);
          const out = (t: number, a: number): V3 => {
            const l = Math.hypot(1, lean(t));
            return [Math.cos(a) / l, (-way * lean(t)) / l, Math.sin(a) / l];
          };
          const corners: [number, number][] = [[t0, a0], [t1, a0], [t1, a1], [t0, a0], [t1, a1], [t0, a1]];
          for (const [t, a] of corners) put(at(t, a), out(t, a), 0, 0, MAT.glassware);
        }
      }
    }
    // The sand. Each corner carries how far up its bulb it belongs (0 at the waist, 1 at the end; 2 more
    // for a corner on the middle line); the shader then sets it no further than the sand has run.
    const GRAINS = 10;
    const LAYERS = 7;
    for (const [part, way] of [[PART.sandTop, 1], [PART.sandHeap, -1]] as const) {
      const at = (t: number, a: number): V3 => round(glassR(t) * 0.88, HG_WAIST_Y + way * t * HG_BULB_H, a);
      for (let i = 0; i < GRAINS; i++) {
        const a0 = (i / GRAINS) * TURN;
        const a1 = ((i + 1) / GRAINS) * TURN;
        const am = (a0 + a1) / 2;
        const n: V3 = [Math.cos(am), 0, Math.sin(am)];
        for (let j = 0; j < LAYERS; j++) {
          const t0 = j / LAYERS;
          const t1 = (j + 1) / LAYERS;
          const corners: [number, number][] = [[t0, a0], [t1, a0], [t1, a1], [t0, a0], [t1, a1], [t0, a1]];
          for (const [t, a] of corners) put(at(t, a), n, t, part, MAT.sand);
        }
        // Its upper face: level in the top glass (dipping where it drains), a peak in the bottom one.
        // (In the top glass that face is the far end of the sand, at 1; in the bottom one, the near end, at 0.)
        const face = way > 0 ? 1 : 0;
        put([HG.x, HG_WAIST_Y + way * face * HG_BULB_H, HG.z], [0, 1, 0], face + 2, part, MAT.sand);
        put(at(face, a0), [0, 1, 0], face, part, MAT.sand);
        put(at(face, a1), [0, 1, 0], face, part, MAT.sand);
      }
    }
    // The thread of sand falling through the waist: its upper corners stay at the waist (0), its lower ones follow the heap (1).
    {
      const w = 0.0022;
      const y0 = HG_WAIST_Y - HG_BULB_H;
      const faces: [V3, [number, number], [number, number]][] = [
        [[0, 0, -1], [-w, -w], [w, -w]],
        [[0, 0, 1], [w, w], [-w, w]],
        [[-1, 0, 0], [-w, w], [-w, -w]],
        [[1, 0, 0], [w, -w], [w, w]],
      ];
      for (const [n, p0, p1] of faces) {
        const lo0: V3 = [HG.x + p0[0], y0, HG.z + p0[1]];
        const lo1: V3 = [HG.x + p1[0], y0, HG.z + p1[1]];
        const hi0: V3 = [HG.x + p0[0], HG_WAIST_Y, HG.z + p0[1]];
        const hi1: V3 = [HG.x + p1[0], HG_WAIST_Y, HG.z + p1[1]];
        put(lo0, n, 1, PART.sandStream, MAT.sand);
        put(hi0, n, 0, PART.sandStream, MAT.sand);
        put(hi1, n, 0, PART.sandStream, MAT.sand);
        put(lo0, n, 1, PART.sandStream, MAT.sand);
        put(hi1, n, 0, PART.sandStream, MAT.sand);
        put(lo1, n, 1, PART.sandStream, MAT.sand);
      }
    }
  }
  // Steam off the mug, when there is tea in it.
  k.quad([0.335, 0.87, 3.565], [0.335, 1.1, 3.565], [0.435, 1.1, 3.565], [0.435, 0.87, 3.565], [0, 0, -1], MAT.steam, [[0, 0], [0, 1], [1, 1], [1, 0]]);
  // A plate with the heel of a loaf on it.
  k.lump([-0.72, 0.772, 3.5], [0.11, 0.008, 0.11], MAT.mug, 1);
  k.lump([-0.72, 0.805, 3.5], [0.07, 0.035, 0.05], MAT.terracotta, 1);

  // ---- a chair, drawn up to the table and facing the window: sit in it (click it) to be at the window
  const cx0 = SEAT[0] - 0.23;
  const cx1 = SEAT[0] + 0.23;
  const cz0 = SEAT[2] - 0.28; // its back, toward you as you stand in the room
  const cz1 = SEAT[2] + 0.18;
  k.box([cx0, 0.43, cz0], [cx1, 0.47, cz1], MAT.wood, 2);
  for (const [lx, lz] of [[cx0, cz0], [cx1 - 0.04, cz0], [cx0, cz1 - 0.04], [cx1 - 0.04, cz1 - 0.04]]) k.box([lx, 0, lz], [lx + 0.04, lz < SEAT[2] ? 0.92 : 0.43, lz + 0.04], MAT.wood, 2);
  // Its back is a top rail on three slender spindles, so the table shows through it.
  k.box([cx0, 0.86, cz0], [cx1, 0.92, cz0 + 0.03], MAT.wood, 2);
  for (const sx of [-0.11, 0, 0.11]) k.box([SEAT[0] + sx - 0.012, 0.47, cz0 + 0.005], [SEAT[0] + sx + 0.012, 0.86, cz0 + 0.025], MAT.wood, 2);
  k.lump([SEAT[0], 0.495, SEAT[2] - 0.05], [0.19, 0.035, 0.19], MAT.blanket, 1); // its cushion
  k.box([cx0 + 0.02, 0.2, cz0 + 0.01], [cx0 + 0.04, 0.225, cz1 - 0.01], MAT.wood, 2);
  k.box([cx1 - 0.04, 0.2, cz0 + 0.01], [cx1 - 0.02, 0.225, cz1 - 0.01], MAT.wood, 2);
  k.box([cx0 + 0.02, 0.26, cz1 - 0.035], [cx1 - 0.02, 0.285, cz1 - 0.015], MAT.wood, 2);
  // A basket of wool on the floor by it, with the knitting left on top.
  k.box([-2.42, 0, 2.86], [-2.02, 0.22, 3.2], MAT.basket);
  k.lump([-2.3, 0.26, 2.96], [0.085, 0.08, 0.085], MAT.yarn, 0);
  k.lump([-2.14, 0.25, 3.08], [0.08, 0.075, 0.08], MAT.yarn, 1);
  k.lump([-2.26, 0.27, 3.1], [0.07, 0.065, 0.07], MAT.yarn, 2);
  k.box([-2.36, 0.3, 2.9], [-2.02, 0.31, 2.91], MAT.wood, 1);
  k.box([-2.33, 0.3, 2.95], [-1.99, 0.31, 2.96], MAT.wood, 1);

  // ---- on the sill: the lamp, a plant in a pot
  k.box([LAMP[0] - 0.05, LAMP[1], LAMP[2] - 0.05], [LAMP[0] + 0.05, LAMP[1] + 0.014, LAMP[2] + 0.05], MAT.brass);
  k.lump([LAMP[0], LAMP[1] + 0.06, LAMP[2]], [0.065, 0.05, 0.065], MAT.brass);
  k.box([LAMP[0] - 0.024, LAMP[1] + 0.1, LAMP[2] - 0.024], [LAMP[0] + 0.024, LAMP[1] + 0.125, LAMP[2] + 0.024], MAT.brass);
  k.lump(FLAME, [0.013, 0.03, 0.013], MAT.flame);
  k.box([LAMP[0] - 0.034, LAMP[1] + 0.125, LAMP[2] - 0.034], [LAMP[0] + 0.034, LAMP[1] + 0.33, LAMP[2] + 0.034], MAT.chimney);
  k.box([0.84, y0, WALL + 0.1], [1.02, y0 + 0.15, WALL + 0.28], MAT.terracotta);
  k.box([0.82, y0, WALL + 0.08], [1.04, y0 + 0.012, WALL + 0.3], MAT.mug, 1); // the saucer it stands in
  // Shells brought up from the beach, and the glasses for watching the sea.
  for (const [sx, sz, sr] of [[-0.42, 0.14, 0.03], [-0.33, 0.2, 0.022], [-0.26, 0.13, 0.026], [0.5, 0.18, 0.024]]) k.lump([sx, y0 + sr * 0.6, WALL + sz], [sr, sr * 0.6, sr * 0.8], MAT.shell, Math.round(sx * 10) & 1);
  k.box([0.14, y0, WALL + 0.1], [0.19, y0 + 0.055, WALL + 0.24], MAT.iron, 2);
  k.box([0.21, y0, WALL + 0.1], [0.26, y0 + 0.055, WALL + 0.24], MAT.iron, 2);
  k.box([0.19, y0 + 0.02, WALL + 0.15], [0.21, y0 + 0.04, WALL + 0.19], MAT.brass);
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9;
    k.lump([0.93 + Math.cos(a) * 0.09, y0 + 0.22 + 0.05 * (i % 3), WALL + 0.19 + Math.sin(a) * 0.07], [0.075, 0.035 + 0.02 * (i % 2), 0.06], MAT.leaf, i % 3);
  }

  // ---- the stove on its slate, to the right: iron, on four short legs, its pipe going up through the ceiling
  k.box([1.78, 0, 2.38], [2.78, 0.02, 3.4], MAT.slate);
  k.box([1.95, 0.16, 2.55], [2.6, 0.98, 3.2], MAT.iron);
  for (const [lx, lz] of [[1.97, 2.57], [2.5, 2.57], [1.97, 3.1], [2.5, 3.1]]) k.box([lx, 0.02, lz], [lx + 0.08, 0.16, lz + 0.08], MAT.iron);
  k.box([1.91, 0.98, 2.51], [2.64, 1.02, 3.24], MAT.iron, 1);
  k.box([2.22, 1.02, 2.86], [2.34, TOP, 2.98], MAT.iron, 1);
  k.box([2.04, 0.3, 2.535], [2.5, 0.76, 2.55], MAT.iron, 2); // the door's frame
  k.quad([2.08, 0.34, 2.53], [2.08, 0.72, 2.53], [2.46, 0.72, 2.53], [2.46, 0.34, 2.53], [0, 0, -1], MAT.glow, [[0, 0], [0, 1], [1, 1], [1, 0]]);
  k.lump([2.24, 1.11, 2.72], [0.115, 0.09, 0.115], MAT.copper); // the kettle
  k.box([2.1, 1.1, 2.7], [2.14, 1.16, 2.74], MAT.copper);
  k.box([2.2, 1.2, 2.705], [2.28, 1.215, 2.735], MAT.iron, 2);
  k.box([2.16, 1.02, 2.64], [2.32, 1.03, 2.8], MAT.iron, 2); // the ring it sits on
  // Steam from its spout, when it is on the boil.
  k.quad([2.0, 1.15, 2.72], [2.0, 1.62, 2.72], [2.22, 1.62, 2.72], [2.22, 1.15, 2.72], [0, 0, -1], MAT.steam, [[0, 0], [0, 1], [1, 1], [1, 0]]);
  // The door's handle and hinges, the ash drawer under it, and the damper in the pipe.
  k.box([2.41, 0.5, 2.51], [2.45, 0.58, 2.535], MAT.brass);
  k.box([2.05, 0.38, 2.52], [2.075, 0.44, 2.535], MAT.iron, 2);
  k.box([2.05, 0.62, 2.52], [2.075, 0.68, 2.535], MAT.iron, 2);
  k.box([2.08, 0.19, 2.535], [2.46, 0.27, 2.55], MAT.iron, 2);
  k.lump([2.27, 0.23, 2.528], [0.018, 0.018, 0.012], MAT.brass);
  k.box([2.19, 1.55, 2.9], [2.37, 1.565, 2.94], MAT.iron, 2);
  // The poker and the shovel, leaning in the corner behind it.
  k.box([2.74, 0.02, 3.3], [2.76, 0.86, 3.32], MAT.iron, 2);
  k.box([2.82, 0.02, 3.26], [2.84, 0.8, 3.28], MAT.iron, 2);
  k.box([2.79, 0.02, 3.22], [2.87, 0.14, 3.3], MAT.iron, 2);
  // A line over it with two socks drying.
  k.box([1.8, 1.9, 3.3], [HALF, 1.905, 3.305], MAT.beam);
  k.box([2.5, 1.66, 3.29], [2.58, 1.9, 3.31], MAT.blanket, 2);
  k.box([2.66, 1.68, 3.29], [2.74, 1.9, 3.31], MAT.blanket, 2);
  // Wood for it, in a basket: five logs, and one goes on the fire each time you feed it.
  k.box([2.1, 0, 1.7], [2.62, 0.3, 2.14], MAT.basket);
  const stack: V3[] = [[2.22, 0.34, 1.92], [2.4, 0.34, 1.92], [2.54, 0.35, 1.92], [2.31, 0.46, 1.92], [2.47, 0.47, 1.92]];
  stack.forEach((at, i) => k.lump(at, [0.08, 0.08, 0.24], MAT.log, 0, PART.log + i));

  // ---- the rug, and the cat asleep on the end of it nearest the stove
  k.box([-1.5, 0, 1.6], [1.55, 0.016, 3.1], MAT.rug);
  k.lump([1.15, 0.105, 2.72], [0.21, 0.095, 0.14], MAT.fur, 0, PART.catBody);
  k.lump([1.33, 0.1, 2.63], [0.08, 0.075, 0.075], MAT.fur, 1, PART.catHead);
  k.box([1.3, 0.16, 2.6], [1.325, 0.2, 2.615], MAT.fur, 1, PART.catHead);
  k.box([1.355, 0.16, 2.62], [1.38, 0.2, 2.635], MAT.fur, 1, PART.catHead);
  k.lump([1.0, 0.05, 2.84], [0.15, 0.035, 0.045], MAT.fur, 0, PART.catTail);
  k.lump([1.34, 0.035, 2.74], [0.05, 0.03, 0.035], MAT.fur, 2); // its paws, tucked in front
  k.lump([1.27, 0.035, 2.8], [0.05, 0.03, 0.035], MAT.fur, 2);

  // ---- books on a shelf against the left wall
  const shelfZ0 = 2.3;
  const shelfZ1 = 3.9;
  for (const sz of [shelfZ0, shelfZ1 - 0.04]) k.box([-HALF, 0, sz], [-HALF + 0.3, 1.98, sz + 0.04], MAT.wood, 2);
  for (const sy of [0.1, 0.56, 1.02, 1.48, 1.94]) k.box([-HALF, sy, shelfZ0], [-HALF + 0.3, sy + 0.035, shelfZ1], MAT.wood, 2);
  for (const sy of [0.135, 0.595, 1.055, 1.515]) {
    let z = shelfZ0 + 0.06;
    while (z < shelfZ1 - 0.12) {
      const thick = 0.03 + 0.045 * r();
      // (Now and then a gap, or something that is not a book.)
      if (r() < 0.12) {
        z += 0.1 + 0.14 * r();
        continue;
      }
      k.box([-HALF + 0.03, sy, z], [-HALF + 0.2 + 0.06 * r(), sy + 0.21 + 0.17 * r(), z + thick], MAT.book, Math.floor(r() * 7));
      z += thick + 0.004;
    }
  }
  k.lump([-HALF + 0.15, 2.08, 2.75], [0.08, 0.105, 0.08], MAT.terracotta); // a jar on top of it
  // And a model of a boat under sail: hull, mast and two sails.
  k.box([-HALF + 0.1, 1.98, 3.2], [-HALF + 0.18, 2.03, 3.62], MAT.book, 0);
  k.box([-HALF + 0.135, 2.03, 3.4], [-HALF + 0.145, 2.34, 3.41], MAT.wood, 2);
  k.box([-HALF + 0.135, 2.06, 3.42], [-HALF + 0.142, 2.31, 3.58], MAT.sail);
  k.box([-HALF + 0.135, 2.08, 3.26], [-HALF + 0.142, 2.26, 3.39], MAT.sail);

  // ---- on the far wall: a small picture and a chest with a blanket to the left; the clock and a jersey on a peg to the right
  k.box([-2.74, 1.3, WALL - 0.03], [-2.22, 1.74, WALL], MAT.wood, 2);
  k.quad([-2.7, 1.34, WALL - 0.032], [-2.7, 1.7, WALL - 0.032], [-2.26, 1.7, WALL - 0.032], [-2.26, 1.34, WALL - 0.032], [0, 0, -1], MAT.picture, [[0, 0], [0, 1], [1, 1], [1, 0]]);
  k.box([-2.9, 0, 3.7], [-2.08, 0.46, WALL - 0.03], MAT.wood, 2);
  k.box([-2.92, 0.46, 3.68], [-2.06, 0.5, WALL - 0.03], MAT.wood);
  k.box([-2.86, 0.5, 3.76], [-2.5, 0.6, 4.1], MAT.blanket);
  // The wireless on the chest: a wooden box, its cloth and its dial drawn on a card on the front of it.
  k.box([-2.45, 0.5, 3.86], [-2.12, 0.74, 4.08], MAT.wood, 2);
  k.quad([-2.435, 0.515, 3.858], [-2.435, 0.725, 3.858], [-2.135, 0.725, 3.858], [-2.135, 0.515, 3.858], [0, 0, -1], MAT.wireless, [[0, 0], [0, 1], [1, 1], [1, 0]]);
  k.box([2.28, 1.42, WALL - 0.075], [2.64, 1.98, WALL], MAT.wood, 2);
  k.quad([2.31, 1.63, WALL - 0.077], [2.31, 1.93, WALL - 0.077], [2.61, 1.93, WALL - 0.077], [2.61, 1.63, WALL - 0.077], [0, 0, -1], MAT.clock, [[-1, -1], [-1, 1], [1, 1], [1, -1]]);
  k.lump([2.46, 1.5, WALL - 0.08], [0.03, 0.03, 0.012], MAT.brass, 0, PART.pendulum);
  k.box([2.455, 1.5, WALL - 0.082], [2.465, 1.62, WALL - 0.078], MAT.brass, 0, PART.pendulum);
  // A tear-off calendar beside it, showing the day.
  k.quad([2.03, 1.5, WALL - 0.012], [2.03, 1.82, WALL - 0.012], [2.23, 1.82, WALL - 0.012], [2.23, 1.5, WALL - 0.012], [0, 0, -1], MAT.calendar, [[0, 0], [0, 1], [1, 1], [1, 0]]);

  k.box([2.2, 1.18, WALL - 0.04], [2.9, 1.215, WALL], MAT.wood, 2);
  k.lump([2.72, 0.9, WALL - 0.07], [0.2, 0.29, 0.055], MAT.wool);

  // ---- hanging from a beam: bunches of herbs drying
  // (From the left-hand beam, up by the wall, where they are out of the way of the window.)
  for (const [hx, hz] of [[-1.93, 3.55], [-1.98, 3.85], [-1.9, 4.05]]) {
    k.box([hx - 0.004, 2.1, hz - 0.004], [hx + 0.004, TOP - 0.17, hz + 0.004], MAT.beam);
    k.lump([hx, 2.0, hz], [0.05, 0.12, 0.05], MAT.herb);
  }
  return new Float32Array(k.data);
}

/** Where the bars of the window stand: the two uprights and the one across. */
// ---- PATH-TRACE: the room as rays know it ------------------------------------------------
// The light in the room is worked out by following paths of it (see TRACE_FRAG in shaders.ts for the
// way of it out of doors): from each spot in the picture to the window, the sun, the lamp and the stove,
// and on from whatever a path strikes, three bounces long. The paths strike the room's own triangles.

/** How much of the light falling on each of the room's materials comes back, in red, green and blue. */
const ROOM_GIVES: Record<number, V3> = {
  0: [0.62, 0.6, 0.51], 1: [0.42, 0.29, 0.17], 2: [0.47, 0.34, 0.21], 3: [0.3, 0.2, 0.12], 4: [0.84, 0.81, 0.73], 5: [0.86, 0.85, 0.79],
  7: [0.5, 0.3, 0.24], 8: [0.5, 0.34, 0.19], 9: [0.7, 0.5, 0.2], 10: [0.13, 0.13, 0.14], 12: [0.62, 0.36, 0.22], 13: [0.2, 0.42, 0.18],
  14: [0.4, 0.3, 0.25], 15: [0.86, 0.83, 0.74], 16: [0.85, 0.84, 0.8], 18: [0.5, 0.4, 0.3], 19: [0.5, 0.45, 0.4], 20: [0.4, 0.38, 0.36],
  21: [0.62, 0.34, 0.2], 22: [0.4, 0.3, 0.2], 23: [0.5, 0.6, 0.65], 25: [0.2, 0.21, 0.24], 26: [0.48, 0.36, 0.2], 27: [0.8, 0.77, 0.68],
  28: [0.4, 0.42, 0.24], 31: [0.4, 0.3, 0.2], 32: [0.85, 0.83, 0.76], 34: [0.55, 0.45, 0.4], 35: [0.86, 0.82, 0.7], 36: [0.8, 0.76, 0.72],
};

/**
 * The room's triangles for rays to strike (nine numbers to each for its corners, three for its colour).
 * Left out: what gives light itself or lets it through (the stove's door, the lamp's flame and glass,
 * steam, motes, the hourglass's glass and sand); the curtains, which are reckoned with as the light is
 * laid on (so drawing them need not mean gathering it all again); and the small things that move (the
 * pendulum, the logs in the basket). Put in: the wall behind you, which is never drawn.
 */
export function roomRayTriangles(mesh: Float32Array): { corners: number[]; colours: number[] } {
  const corners: number[] = [];
  const colours: number[] = [];
  const F = PARLOUR_FLOATS;
  for (let i = 0; i + 2 < mesh.length / F; i += 3) {
    const m = Math.round(mesh[i * F + 8]);
    const card = m === 11 || m === 18 || m === 23 || (m >= 29 && m <= 33) || m === 39;
    const part = card ? 0 : Math.round(mesh[i * F + 7]);
    if (m === 11 || m === 17 || m === 24 || m === 29 || m === 30 || m === 33 || m === 37 || m === 38 || m === 39 || m === 6) continue;
    if (part >= 6) continue;
    for (let k = 0; k < 3; k++) corners.push(mesh[(i + k) * F], mesh[(i + k) * F + 1], mesh[(i + k) * F + 2]);
    colours.push(...(ROOM_GIVES[m] ?? [0.5, 0.45, 0.4]));
  }
  const back: V3[] = [[-HALF, 0, BACK], [HALF, 0, BACK], [HALF, TOP, BACK], [-HALF, 0, BACK], [HALF, TOP, BACK], [-HALF, TOP, BACK]];
  for (const c of back) corners.push(...c);
  colours.push(...ROOM_GIVES[0], ...ROOM_GIVES[0]);
  return { corners, colours };
}

function paneEdges(): { uprights: number[]; transom: number } {
  const wide = WIN.x1 - WIN.x0;
  return { uprights: [WIN.x0 + wide / 3, WIN.x0 + (2 * wide) / 3], transom: WIN.y0 + 0.64 * (WIN.y1 - WIN.y0) };
}

/** Numbers kept for each corner of a pane of glass: where it is, where that is within its pane (0..1 each way), and which pane (across, up). */
export const PANE_FLOATS = 7;

/** The six panes, each a sheet of glass: for what the weather puts on them. */
export function buildPanes(): Float32Array {
  const out: number[] = [];
  const { uprights, transom } = paneEdges();
  const xs = [WIN.x0 + 0.07, uprights[0], uprights[1], WIN.x1 - 0.07];
  const ys = [WIN.y0 + 0.06, transom, WIN.y1 - 0.07];
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 3; i++) {
      const a = xs[i] + (i === 0 ? 0 : 0.022);
      const b = xs[i + 1] - (i === 2 ? 0 : 0.022);
      const c = ys[j] + (j === 0 ? 0 : 0.022);
      const d = ys[j + 1] - (j === 1 ? 0 : 0.022);
      const corner = (x: number, y: number, u: number, v: number) => out.push(x, y, GLASS_Z, u, v, i, j);
      corner(a, c, 0, 0);
      corner(a, d, 0, 1);
      corner(b, d, 1, 1);
      corner(a, c, 0, 0);
      corner(b, d, 1, 1);
      corner(b, c, 1, 0);
    }
  }
  return new Float32Array(out);
}

const f = (n: number) => n.toFixed(3);
const v3 = (v: V3) => `vec3(${f(v[0])}, ${f(v[1])}, ${f(v[2])})`;

// What both of the room's shaders share: how the room is turned to face the
// way you face, and where its lights are.
const SHARED = `
uniform mat4 uViewProj;
uniform vec3 uEye;    // where your eyes are, in the scene
uniform vec3 uRight;  // the way to your right
uniform vec3 uAhead;  // the way you face, kept level
const float EYE_HIGH = ${f(EYE_HIGH)};
const vec3 LAMP_AT = ${v3(FLAME)};
const vec3 STOVE_AT = ${v3(STOVE)};
vec3 inScene(vec3 p) { return uEye + uRight * p.x + vec3(0.0, p.y - EYE_HIGH, 0.0) + uAhead * p.z; }
`;

export const PARLOUR_VERT = `${HEAD}
${SHARED}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv;
layout(location = 3) in float aMat;
uniform float uDrawn; // the curtains: 0 drawn back, 1 drawn across the window
uniform vec3 uCat;    // the cat: its breath (-1..1), how far its head is lifted (0..1), which way its tail lies (-1..1)
uniform float uSwing; // the clock's pendulum, as an angle
uniform float uLogs;  // how many logs are left in the basket
uniform float uSand;  // the hourglass: how much sand is still in the top, 0..1 (below 0: it is not running)
// (See HOURGLASS in the builder: the same glass, by the same rule.)
const vec2 HG_AXIS = vec2(${f(HG.x)}, ${f(HG.z)});
const float HG_WAIST_Y = ${HG_WAIST_Y.toFixed(4)};
const float HG_BULB_H = ${HG_BULB_H.toFixed(4)};
float glassR(float t) { return ${HG.waist.toFixed(4)} + ${(HG.bulb - HG.waist).toFixed(4)} * pow(sin(clamp(t, 0.0, 1.0) * 2.2), 0.75); }
out vec3 vAt;       // where this is, in the room's own measure
out vec3 vWas;      // where it would be if nothing in the room ever moved (patterns are fixed to this)
out vec3 vNormal;
out float vFold;    // CLOTH: on a curtain, how deep in a fold this is, from 0 on a ridge standing out into the room to 1 at the bottom of a fold
out vec2 vUv;
flat out float vMat;
void main() {
  vec3 p = aPos;
  int m = int(aMat + 0.5);
  // (Things drawn on a card use their second number for the drawing; everything else, for which moving part it is.)
  bool card = m == 11 || m == 18 || m == 23 || (m >= 29 && m <= 33) || m == 39;
  int part = card ? 0 : int(aUv.y + 0.5);
  // CLOTH. Curtains: each hangs from its outer end and is pulled out across the window. The cloth is
  // the same cloth either way, so it hangs in the same number of pleats: deep and close together while
  // it is drawn back, opened out wide and shallow when it is drawn across. They are held even at the
  // heading, where the rings carry it, and below that fall freely: deeper, and wandering a little.
  vec3 facing = aNormal;
  vFold = 0.0;
  if (part == 1 || part == 2) {
    float side = part == 1 ? 1.0 : -1.0;
    float u = aUv.x;
    float wide = ${f(CLOTH.wide)} * mix(1.0, 3.72, uDrawn);
    float hang = clamp((${f(CLOTH.high)} - aPos.y) / ${f(CLOTH.high - CLOTH.low)}, 0.0, 1.0); // 0 at the rod, 1 at the hem
    float wander = 0.55 * hang * sin(u * 7.0 + hang * 1.7 + side);
    float phase = (u * ${CLOTH.folds.toFixed(1)} + 0.25) * 6.2831853 + wander;
    float deep = mix(0.062, 0.024, uDrawn) * (0.45 + 0.55 * smoothstep(0.0, 0.35, hang)) * (0.85 + 0.15 * sin(u * 11.0 + 2.0 * side));
    float wave = 0.5 - 0.5 * cos(phase);
    p.x = ${f(WIN.x0 - 0.56)} * side + side * u * wide;
    p.z = aPos.z + deep * (wave - 0.35);
    p.y = aPos.y + 0.014 * hang * hang * (wave - 0.5); // (the hem rises and falls a little with the folds)
    // The sill stands out into the room further than the cloth hangs from the wall: where the cloth comes
    // down to it, it is pushed out over the sill's edge, and hangs in front of it from there to the hem.
    float bySill = smoothstep(${f(WIN.x0 - 0.22)}, ${f(WIN.x0 - 0.13)}, p.x) * smoothstep(${f(WIN.x1 + 0.22)}, ${f(WIN.x1 + 0.13)}, p.x);
    float over = bySill * smoothstep(${f(WIN.y0 + 0.34)}, ${f(WIN.y0 + 0.01)}, p.y);
    p.z -= 0.13 * over;
    // The way the cloth faces there: across the slope of the fold.
    float turns = ${(CLOTH.folds * 6.2831853).toFixed(3)} + 0.55 * hang * 7.0 * cos(u * 7.0 + hang * 1.7 + side);
    float slope = deep * 0.5 * sin(phase) * turns / (side * wide);
    facing = normalize(vec3(slope, 0.0, -1.0));
    vFold = wave;
  }
  // The cat: its side rises and falls, its head comes up when it is spoken to, its tail lies one way or the other.
  if (part == 3) p.y *= 1.0 + 0.06 * uCat.x;
  if (part == 4) p += vec3(0.0, 0.07, -0.02) * uCat.y;
  if (part == 5) {
    vec2 root = vec2(1.13, 2.84);
    vec2 d = p.xz - root;
    float a = 0.55 * uCat.z;
    p.xz = root + vec2(d.x * cos(a) - d.y * sin(a), d.x * sin(a) + d.y * cos(a));
  }
  // The pendulum swings from its pin.
  if (part == 6) {
    vec2 pin = vec2(2.46, 1.62);
    vec2 d = p.xy - pin;
    p.xy = pin + vec2(d.x * cos(uSwing) - d.y * sin(uSwing), d.x * sin(uSwing) + d.y * cos(uSwing));
  }
  // The hourglass's sand: so much still in the top glass, the rest heaped in the bottom one, and a thread
  // falling between them while it runs. Each corner is set no further along its bulb than the sand has got.
  if (part >= 12 && part <= 14) {
    float left = uSand < 0.0 ? 0.0 : uSand;
    bool running = uSand > 0.0 && uSand < 1.0;
    bool middle = aUv.x > 1.5;
    float t = middle ? aUv.x - 2.0 : aUv.x;
    // (A bulb holds most of its sand in its wide part, so the level moves fastest when nearly empty or nearly full.)
    float top = 0.9 * sqrt(left);                 // how far up the top glass the sand still stands
    float heap = 1.0 - 0.9 * sqrt(1.0 - left);    // how far down from the waist the heap's edge lies
    float peak = max(0.04, heap - (running ? 0.2 : 0.05) * min(1.0, (1.0 - heap) * 5.0));
    if (part == 12) {
      t = min(t, top);
      if (middle && running) t = max(0.0, t - 0.09 * min(1.0, top * 4.0)); // it dips in the middle, where it drains
      vec2 way = middle ? vec2(0.0) : normalize(aPos.xz - HG_AXIS);
      p = vec3(HG_AXIS.x + way.x * glassR(t) * 0.88, HG_WAIST_Y + t * HG_BULB_H, HG_AXIS.y + way.y * glassR(t) * 0.88);
    } else if (part == 13) {
      t = middle ? peak : max(t, heap);
      vec2 way = middle ? vec2(0.0) : normalize(aPos.xz - HG_AXIS);
      p = vec3(HG_AXIS.x + way.x * glassR(t) * 0.88, HG_WAIST_Y - t * HG_BULB_H, HG_AXIS.y + way.y * glassR(t) * 0.88);
    } else {
      p.y = HG_WAIST_Y - (running && t > 0.5 ? peak : 0.0) * HG_BULB_H + (running ? 0.004 : 0.0) * (t > 0.5 ? 0.0 : 1.0);
    }
  }
  // A log that has gone on the fire is not in the basket.
  if (part >= 7 && part <= 11 && float(part - 7) >= uLogs - 0.5) p = vec3(2.36, -2.0, 1.92);
  vAt = p;
  vWas = aPos;
  vNormal = facing;
  vUv = aUv;
  vMat = aMat;
  gl_Position = uViewProj * vec4(inScene(p), 1.0);
}
`;

export const PARLOUR_FRAG = `${HEAD}
${SHARED}
in vec3 vAt;
in vec3 vWas;
in vec3 vNormal;
in vec2 vUv;
in float vFold;
flat in float vMat;
out vec4 outColor;
uniform sampler2D uNoise;
uniform vec3 uDayIn;   // the daylight (or moonlight) coming in at the window
uniform float uNight;  // how dark it is outside, 0..1
uniform float uLamp;   // the lamp on the sill: 0 out, 1 lit
uniform float uFlick;  // the flames' slow lean (an angle)
uniform vec2 uHands;   // the clock: its hour hand and its minute hand, as angles clockwise from twelve
uniform float uRoomT;  // seconds
uniform float uDrawn;  // the curtains: 0 drawn back, 1 drawn across the window
uniform float uFlare;  // the stove: 0 ticking over, 1 just fed and roaring
uniform float uBoil;   // the kettle: 0 cold, 1 on the boil
uniform float uTea;    // the mug: 0 empty or gone cold, 1 just poured
uniform vec3 uEyeAt;   // where your eyes are, in the room's own measure (standing, or in the chair)
uniform float uMusic;  // 1 while music is playing
uniform float uDay;    // the day of the month
uniform float uRain;   // rain on the window, 0..1
// PATH-TRACE: the light as rays found it (see ROOM_TRACE_FRAG), how far it has taken over from the rule
// below (0..1), and the sun's (or moon's) own light as it is out of doors just now.
uniform sampler2D uTraceA, uTraceB, uTraceC, uTraceD;
uniform float uCandle; // CANDLE: how brightly the candle on the table burns, 0..1 (it is alight while the curtains are drawn)
uniform float uTraced;
uniform vec2 uSureAt;  // how many samples a pixel is to have before its gathered light begins to show, and by how many it shows in full
uniform vec3 uSunIn;

const int DIGIT[10] = int[10](31599, 11415, 29671, 29647, 23497, 31183, 31215, 29257, 31727, 31695);
// Whether a spot (0..1 each way) inside a numeral's box is inked: numerals three marks wide and five tall.
bool numeral(int n, vec2 q) {
  if (q.x < 0.0 || q.x >= 1.0 || q.y < 0.0 || q.y >= 1.0) return false;
  int c = int(q.x * 3.0);
  int r = 4 - int(q.y * 5.0);
  return ((DIGIT[n] >> (14 - (r * 3 + c))) & 1) == 1;
}

const vec4 WIN = vec4(${f(WIN.x0)}, ${f(WIN.y0)}, ${f(WIN.x1)}, ${f(WIN.y1)});
const float WALL_Z = ${f(WALL)};

float hash(vec2 v) { return fract(sin(dot(v, vec2(127.1, 311.7))) * 43758.5453); }
float toHand(vec2 d, float angle, float len) { vec2 way = vec2(sin(angle), cos(angle)); return length(d - way * clamp(dot(d, way), 0.0, len)); }

void main() {
  vec2 fc = gl_FragCoord.xy;
  float grain = bayer(fc);
  vec3 P = vAt;
  vec3 N = normalize(vNormal);
  int m = int(vMat + 0.5);
  float tint = vUv.x;
  vec3 col = vec3(0.5);
  vec3 shine = vec3(0.0); // what gives light of its own
  bool thing = true;      // a thing standing in the room, as against the room's own walls, floor and ceiling
  float fine = texture(uNoise, P.xz * 0.9 + P.y * 0.37).r;

  if (m == 0) {
    // The walls: boards set upright, limewashed above a painted dado.
    thing = false;
    float along = abs(N.z) > 0.5 ? P.x : P.z;
    float board = along / 0.145;
    float own = hash(vec2(floor(board), abs(N.z) > 0.5 ? 1.0 : 2.0));
    col = P.y < 0.98 ? vec3(0.3, 0.4, 0.4) : vec3(0.76, 0.71, 0.58);
    col *= 0.93 + 0.12 * own;
    if (fract(board) < 0.07 && P.y > 0.98) col *= 0.72;         // the seam between two boards
    if (P.y < 0.95 && P.y > 0.11) {
      // Below the rail the wall is panelled: each panel a field sunk within a frame,
      // its upper and left edges in shadow and its lower and right ones catching the light.
      vec2 q = vec2(fract(along / 0.62), (P.y - 0.11) / 0.84);
      vec2 inPanel = vec2(q.x * 0.62, q.y * 0.84);
      float l = inPanel.x - 0.07, r = 0.55 - inPanel.x, b = inPanel.y - 0.08, t = 0.76 - inPanel.y;
      if (min(min(l, r), min(b, t)) > 0.0) {
        col *= 0.9;
        if (t < 0.018 || l < 0.018) col *= 0.72;
        else if (b < 0.018 || r < 0.018) col *= 1.2;
      }
    }
    if (abs(P.y - 0.98) < 0.03) col = P.y > 0.985 ? vec3(0.3, 0.39, 0.39) : vec3(0.2, 0.27, 0.27);   // the rail along the top of the dado
    if (fine > 0.74) col *= 0.95;
    // Old limewash is never one tone: paler where it was last touched up, greyer in the corners.
    if (P.y > 1.0) col *= 0.94 + 0.1 * texture(uNoise, vec2(along * 0.11, P.y * 0.13)).a;
  } else if (m == 1) {
    // The floor: wide planks running away from you, worn paler down the middle of the room.
    thing = false;
    float plank = P.x / 0.2;
    float own = hash(vec2(floor(plank), 7.0));
    col = mix(vec3(0.37, 0.25, 0.15), vec3(0.46, 0.32, 0.19), own);
    col *= 1.0 + 0.1 * (1.0 - smoothstep(0.3, 1.6, abs(P.x)));
    if (fract(plank) < 0.055) col *= 0.6;
    if (fract(P.z / 1.9 + own * 3.0) < 0.012) col *= 0.62;      // where one plank ends and the next begins
    if (texture(uNoise, vec2(P.x * 2.3, P.z * 0.21)).g > 0.7) col *= 0.93; // the grain
    // A knot here and there, and the nails that hold each plank's end down.
    vec2 knotCell = vec2(floor(plank), floor(P.z / 0.9 + own * 5.0));
    vec2 knot = vec2(hash(knotCell) * 0.6 + 0.2, hash(knotCell + 3.3) * 0.6 + 0.2);
    if (hash(knotCell + 9.1) < 0.3 && length((vec2(fract(plank), fract(P.z / 0.9 + own * 5.0)) - knot) * vec2(0.2, 0.9)) < 0.022) col *= 0.55;
    float end = fract(P.z / 1.9 + own * 3.0);
    if (min(end, 1.0 - end) > 0.012 && min(end, 1.0 - end) < 0.022 && abs(fract(plank) - 0.5) > 0.3 && abs(fract(plank) - 0.5) < 0.36) col *= 0.45;
  } else if (m == 2) {
    // The ceiling: boards laid across the beams.
    thing = false;
    col = vec3(0.47, 0.34, 0.21) * (0.92 + 0.14 * hash(vec2(floor(P.z / 0.17), 3.0)));
    if (fract(P.z / 0.17) < 0.08) col *= 0.66;
  } else if (m == 3) {
    col = vec3(0.3, 0.2, 0.12) * (0.9 + 0.2 * fine); // beams, skirting: dark old wood
    thing = P.y > 0.2 && P.y < 2.2;
  } else if (m == 4) {
    thing = false;
    col = vec3(0.84, 0.81, 0.73) * (0.95 + 0.08 * fine); // the limewashed thickness of the wall round the window
  } else if (m == 5) {
    col = vec3(0.86, 0.85, 0.79); // the window's frame and bars, painted
  } else if (m == 6) {
    // CLOTH. Curtains: heavy red wool, hanging in real folds (the corners' shader hangs them).
    float hang = clamp((${f(CLOTH.high)} - vWas.y) / ${f(CLOTH.high - CLOTH.low)}, 0.0, 1.0); // 0 at the rod, 1 at the hem
    col = vec3(0.6, 0.165, 0.15);
    // The weave: no yarn is even, so the cloth is faintly streaked down its length, thread by thread,
    // and slubbed here and there across it.
    float yarn = texture(uNoise, vec2(vUv.x * 7.0, vWas.y * 0.3)).r;
    float slub = texture(uNoise, vec2(vUv.x * 1.3 + 0.4, vWas.y * 2.6)).g;
    col *= 0.88 + 0.2 * yarn + (slub > 0.72 ? 0.05 : 0.0);
    // Wool has a nap: where you look along the cloth, on the flanks of the folds, it catches the light.
    float along = 1.0 - abs(dot(N, normalize(uEyeAt - P)));
    col *= 1.0 + 0.45 * along * along;
    // Down in a fold the cloth shades itself.
    col *= mix(1.0, 0.52, vFold * vFold);
    // The heading, where it is doubled over a tape and gathered to the rings; and the hem, turned up and
    // stitched, with a band or two woven in above it.
    bool heading = hang < 0.035;
    bool hem = hang > 0.972;
    if (heading || hem) col *= 0.8;
    if (abs(hang - 0.968) < 0.003) col *= 0.7;
    if (hang > 0.86 && hang < 0.875) col = mix(col, vec3(0.74, 0.56, 0.3), 0.55);
    if (hang > 0.895 && hang < 0.93) col *= 0.74;
    // The day glowing through it, where the window is behind it: most where the cloth hangs square to
    // the light, least through the flanks of the folds (where it lies doubled) and through the heading
    // and the hem; and the window's bars lie across the glow as soft shadows. Drawn back, it is bunched
    // thick, and little gets through.
    float behind = smoothstep(WIN.x - 0.01, WIN.x + 0.07, P.x) * smoothstep(WIN.z + 0.01, WIN.z - 0.07, P.x)
                 * smoothstep(WIN.y - 0.05, WIN.y + 0.03, P.y) * smoothstep(WIN.w + 0.05, WIN.w - 0.03, P.y);
    float square = abs(N.z);
    float bars = 1.0 - 0.34 * (1.0 - smoothstep(0.03, 0.09, abs(fract((P.x - WIN.x) / ${f((WIN.x1 - WIN.x0) / 3)} + 0.5) - 0.5) * ${f((WIN.x1 - WIN.x0) / 3)}))
               * (P.x > WIN.x + 0.3 && P.x < WIN.z - 0.3 ? 1.0 : 0.0);
    bars *= 1.0 - 0.34 * (1.0 - smoothstep(0.03, 0.09, abs(P.y - ${f(paneEdges().transom)})));
    float through = behind * mix(0.4, 1.0, square * square) * (heading || hem ? 0.45 : 1.0) * bars * mix(0.5, 1.0, uDrawn);
    shine = vec3(0.86, 0.25, 0.17) * (0.86 + 0.28 * yarn) * uDayIn * (0.04 + 0.62 * through);
  } else if (m == 7) {
    // The rug: woven in bands.
    float band = P.z / 0.085;
    float b = mod(floor(band), 11.0);
    col = b < 1.0 ? vec3(0.78, 0.7, 0.52) : b < 4.0 ? vec3(0.55, 0.17, 0.15) : b < 5.0 ? vec3(0.78, 0.7, 0.52) : b < 7.0 ? vec3(0.16, 0.24, 0.36) : b < 8.0 ? vec3(0.74, 0.52, 0.2) : vec3(0.55, 0.17, 0.15);
    if (abs(P.x + 1.5) < 0.06 || abs(P.x - 1.55) < 0.06) col = mod(floor(P.z / 0.03), 2.0) < 1.0 ? vec3(0.78, 0.7, 0.52) : vec3(0.4, 0.3, 0.2); // its fringe
    col *= 0.9 + 0.2 * fine;
    thing = false;
  } else if (m == 8) {
    // Furniture and the sill: wood, oiled or painted.
    col = tint < 0.5 ? vec3(0.5, 0.33, 0.18) : tint < 1.5 ? vec3(0.6, 0.44, 0.26) : vec3(0.36, 0.23, 0.13);
    if (texture(uNoise, vec2(P.x * 0.6 + P.y * 2.0, P.z * 2.6)).g > 0.68) col *= 0.9;
  } else if (m == 9) {
    col = vec3(0.8, 0.58, 0.22); // brass
    if (N.y > 0.3) col *= 1.2;
  } else if (m == 10) {
    col = tint > 1.5 ? vec3(0.1, 0.1, 0.11) : vec3(0.15, 0.15, 0.17); // cast iron
    if (tint < 0.5 && fract(P.y / 0.27) < 0.05) col *= 0.7;
  } else if (m == 11) {
    // The stove's door: the fire seen through its bars, never quite still.
    float bar = fract(vUv.x * 5.0);
    float fire = texture(uNoise, vec2(vUv.x * 0.9, vUv.y * 0.7 - uRoomT * 0.11)).r * 0.6 + texture(uNoise, vec2(vUv.x * 2.3 + 0.4, vUv.y * 1.5 - uRoomT * 0.23)).g * 0.4;
    float heat = (fire * (1.25 - vUv.y * 0.6) + 0.06 * sin(uFlick)) * (0.82 + 0.5 * uFlare);
    col = vec3(0.05);
    shine = bar < 0.16 || vUv.y > 0.94 || vUv.y < 0.06 ? vec3(0.0) : heat > 0.62 ? vec3(1.0, 0.8, 0.42) : heat > 0.46 ? vec3(1.0, 0.5, 0.14) : heat > 0.33 ? vec3(0.72, 0.2, 0.05) : vec3(0.26, 0.06, 0.02);
    // The logs it is burning, dark against it.
    if (bar >= 0.16 && vUv.y < 0.3 + 0.08 * sin(vUv.x * 9.0) && vUv.y > 0.06 && fire < 0.62) shine *= 0.25;
  } else if (m == 12) {
    col = tint > 0.5 ? (N.y > 0.2 ? vec3(0.62, 0.42, 0.2) : vec3(0.84, 0.74, 0.54)) : vec3(0.62, 0.33, 0.21); // terracotta; or a loaf, crust above and crumb at the cut
    if (tint < 0.5 && P.y > 0.84 + 0.13 && P.y < 1.0) col *= 0.86;
  } else if (m == 13) {
    col = tint < 0.5 ? vec3(0.2, 0.42, 0.18) : tint < 1.5 ? vec3(0.26, 0.5, 0.2) : vec3(0.15, 0.34, 0.17); // leaves
    shine = col * uDayIn * 0.18; // the day comes through them
  } else if (m == 14) {
    // Books: each its own cloth, with a paler band or two across the spine.
    int which = int(tint + 0.5);
    col = which == 0 ? vec3(0.5, 0.15, 0.13) : which == 1 ? vec3(0.16, 0.26, 0.4) : which == 2 ? vec3(0.2, 0.36, 0.24) : which == 3 ? vec3(0.62, 0.5, 0.3)
        : which == 4 ? vec3(0.32, 0.2, 0.13) : which == 5 ? vec3(0.66, 0.62, 0.52) : vec3(0.42, 0.22, 0.34);
    float up = fract(P.y / 0.46 + 0.19);
    if (abs(N.x) > 0.5 && (abs(up - 0.3) < 0.02 || abs(up - 0.62) < 0.012)) col = mix(col, vec3(0.86, 0.74, 0.42), 0.75);
    if (N.y > 0.5) col = vec3(0.8, 0.76, 0.66); // the tops of their pages
  } else if (m == 15) {
    // The open book: its two pages, with the lines of print on them.
    col = vec3(0.86, 0.83, 0.74);
    if (N.y > 0.5) {
      float line = fract(P.z / 0.026);
      float inMargin = tint < 0.5 ? P.x + 0.5 : P.x + 0.265;
      if (line < 0.42 && inMargin > 0.025 && inMargin < 0.2 && hash(vec2(floor(P.z / 0.026), floor(P.x / 0.012))) > 0.2) col = vec3(0.36, 0.33, 0.3);
    }
  } else if (m == 16) {
    col = tint < 0.5 && P.y > 0.855 ? vec3(0.2, 0.3, 0.5) : vec3(0.88, 0.87, 0.82); // an enamel mug with a blue rim; a plate; a saucer
    if (tint < 0.5 && N.y > 0.5 && uTea > 0.03) col = vec3(0.4, 0.22, 0.1); // the tea in it
  } else if (m == 17) {
    // The lamp's flame.
    if (uLamp < 0.03) discard;
    col = vec3(0.0);
    shine = (P.y < LAMP_AT.y ? vec3(1.0, 0.9, 0.62) : vec3(1.0, 0.66, 0.26)) * min(1.0, uLamp * 1.4);
  } else if (m == 18) {
    // The clock, which keeps the real time.
    vec2 d = vUv;
    float rad = length(d);
    col = vec3(0.33, 0.21, 0.12);
    if (rad < 0.9) {
      col = vec3(0.9, 0.87, 0.76);
      float turn = atan(d.x, d.y) / 6.2831853 + 0.5;
      if (rad > 0.7 && rad < 0.84 && fract(turn * 12.0 + 0.5) > 0.42 && fract(turn * 12.0 + 0.5) < 0.58) col = vec3(0.16, 0.14, 0.13);
      if (toHand(d, uHands.x, 0.46) < 0.065 || toHand(d, uHands.y, 0.7) < 0.045) col = vec3(0.1, 0.09, 0.09);
      if (rad < 0.08) col = vec3(0.7, 0.5, 0.2);
    } else if (rad < 0.98) {
      col = vec3(0.74, 0.54, 0.22);
    }
  } else if (m == 19) {
    // A blanket folded on the chest, and the cushion of the chair: striped wool.
    float stripe = mod(floor((tint > 1.5 ? P.x + P.y : tint > 0.5 ? P.x + P.z : P.x) / (tint > 1.5 ? 0.035 : 0.05)), 5.0);
    col = stripe < 1.0 ? vec3(0.8, 0.75, 0.6) : stripe < 3.0 ? vec3(0.24, 0.34, 0.42) : vec3(0.62, 0.3, 0.16);
    if (tint > 1.5) col = stripe < 2.0 ? vec3(0.78, 0.74, 0.62) : stripe < 3.0 ? vec3(0.56, 0.2, 0.16) : vec3(0.72, 0.68, 0.56); // the runner, and the socks: cream with a red line
  } else if (m == 20) {
    // The cat: grey, with darker bars across its back.
    col = tint > 1.5 ? vec3(0.78, 0.76, 0.72) : vec3(0.4, 0.38, 0.36);
    if (tint < 0.5 && fract(vWas.x / 0.07) < 0.36 && N.y > 0.1) col = vec3(0.24, 0.22, 0.21);
  } else if (m == 21) {
    col = vec3(0.62, 0.34, 0.2); // the copper kettle
    if (N.y > 0.4) col *= 1.25;
  } else if (m == 22) {
    // Split logs: bark outside, pale wood on the cut ends.
    col = abs(N.z) > 0.8 ? vec3(0.76, 0.6, 0.38) : vec3(0.32, 0.22, 0.15);
  } else if (m == 23) {
    // A small painting: a boat under a pale sky.
    vec2 q = vUv;
    col = q.y > 0.42 ? mix(vec3(0.74, 0.8, 0.84), vec3(0.5, 0.64, 0.78), q.y) : vec3(0.2, 0.34, 0.46);
    if (q.y > 0.42 && q.y < 0.52 + 0.1 * sin(q.x * 9.0) && q.x > 0.6) col = vec3(0.34, 0.42, 0.36);
    if (abs(q.x - 0.36) < 0.1 && q.y > 0.36 && q.y < 0.43) col = vec3(0.3, 0.14, 0.1);
    if (q.x > 0.35 && q.x < 0.35 + (0.78 - q.y) * 0.4 && q.y > 0.44 && q.y < 0.78) col = vec3(0.9, 0.87, 0.78);
  } else if (m == 24) {
    // The lamp's glass chimney: clear, so most of it is not there to be seen.
    bool edge = abs(P.x - ${f(LAMP[0])}) > 0.027;
    if (!edge && grain > 0.16) discard;
    col = vec3(0.8, 0.86, 0.9);
    shine = vec3(1.0, 0.62, 0.3) * uLamp * 0.3;
  } else if (m == 25) {
    col = vec3(0.2, 0.21, 0.24) * (0.9 + 0.2 * fine); // the slate the stove stands on
    thing = false;
  } else if (m == 26) {
    // A basket woven of withies.
    col = mod(floor(P.y / 0.028) + floor((P.x + P.z) / 0.045), 2.0) < 1.0 ? vec3(0.56, 0.42, 0.24) : vec3(0.4, 0.29, 0.16);
  } else if (m == 27) {
    // A knitted jersey on its peg: undyed wool, with a patterned band across the chest.
    col = vec3(0.8, 0.77, 0.68);
    if (P.y > 0.98 && P.y < 1.08) col = mod(floor(P.x / 0.03) + floor(P.y / 0.03), 2.0) < 1.0 ? vec3(0.2, 0.28, 0.4) : vec3(0.8, 0.77, 0.68);
  } else if (m == 28) {
    col = vec3(0.4, 0.42, 0.24) * (0.8 + 0.4 * fine); // herbs drying
  } else if (m == 29) {
    // Steam: from the kettle's spout when it boils, off the mug while the tea is hot. A wisp that
    // leans and thins as it climbs, stippled away to nothing.
    float much = P.x > 1.5 ? uBoil : uTea;
    float lean = 0.5 + 0.16 * sin(vUv.y * 7.0 - uRoomT * 1.5 + P.x * 3.0) * vUv.y + (P.x > 1.5 ? -0.22 * vUv.y : 0.0);
    float wide = 0.1 + 0.26 * vUv.y;
    float thick = much * pow(1.0 - vUv.y, 0.7) * (1.0 - smoothstep(0.0, wide, abs(vUv.x - lean)));
    thick *= 0.6 + 0.8 * texture(uNoise, vec2(vUv.x * 0.6, vUv.y * 0.5 - uRoomT * 0.09)).r;
    if (thick < 0.2 + grain * 0.7) discard;
    col = vec3(0.86, 0.88, 0.9);
    thing = false;
  } else if (m == 37) {
    // The hourglass's glass (see HOURGLASS): clear, so its face is mostly not there to be seen; what shows
    // is its edge, where you look along the glass, and a streak of light down the side the window lights.
    vec3 V = normalize(uEyeAt - P);
    float facing = abs(dot(N, V));
    float glint = dot(N, normalize(vec3(-0.5, 0.45, 0.74)));
    if (facing < 0.5) col = vec3(0.8, 0.9, 0.96);
    else if (glint > 0.9 && facing > 0.6) col = vec3(0.96, 0.98, 1.0);
    else if (grain > 0.07) discard;
    else col = vec3(0.82, 0.9, 0.94);
  } else if (m == 38) {
    // Its sand: pale and dry, a grain darker here and there.
    col = vec3(1.0, 0.83, 0.52) * (N.y > 0.5 ? 1.06 : 0.92);
    if (hash(floor(P.xy * 420.0) + floor(P.z * 420.0)) > 0.8) col *= 0.86;
  } else if (m == 31) {
    // The wireless: woven cloth over the speaker, a round dial that glows while there is music, two knobs.
    vec2 q = vUv;
    col = vec3(0.36, 0.23, 0.13);
    if (q.x > 0.06 && q.x < 0.6 && q.y > 0.14 && q.y < 0.9) col = mod(floor(q.x * 46.0) + floor(q.y * 30.0), 2.0) < 1.0 ? vec3(0.62, 0.52, 0.34) : vec3(0.5, 0.4, 0.26);
    vec2 d = (q - vec2(0.8, 0.6)) * vec2(1.0, 0.72);
    if (length(d) < 0.13) {
      col = vec3(0.86, 0.78, 0.56);
      shine = vec3(1.0, 0.62, 0.22) * uMusic * 0.8;
      if (abs(d.x - d.y * 0.4) < 0.012 && d.y > 0.0) col = vec3(0.5, 0.12, 0.1);
    } else if (length(d) < 0.155) col = vec3(0.74, 0.54, 0.22);
    if (length((q - vec2(0.72, 0.2)) * vec2(1.0, 0.72)) < 0.045 || length((q - vec2(0.88, 0.2)) * vec2(1.0, 0.72)) < 0.045) col = vec3(0.16, 0.13, 0.11);
  } else if (m == 32) {
    // The calendar: a pad of leaves, the top one showing the day.
    vec2 q = vUv;
    col = vec3(0.9, 0.88, 0.8);
    if (q.y > 0.8) col = vec3(0.6, 0.16, 0.14);
    if (q.y < 0.05 || (q.y < 0.1 && fract(q.y * 60.0) < 0.5)) col = vec3(0.7, 0.68, 0.62); // the leaves under it
    int day = int(uDay + 0.5);
    int tens = day / 10;
    int ones = day - tens * 10;
    vec2 box = vec2(0.26, 0.5); // the size of one numeral
    bool ink = tens > 0
      ? numeral(tens, (q - vec2(0.2, 0.2)) / box) || numeral(ones, (q - vec2(0.54, 0.2)) / box)
      : numeral(ones, (q - vec2(0.37, 0.2)) / box);
    if (ink) col = vec3(0.14, 0.13, 0.14);
  } else if (m == 33) {
    // Motes of dust, turning slowly where the light from the window falls through the room.
    float lightHere = max(uDayIn.r, max(uDayIn.g, uDayIn.b)) * (1.0 - uDrawn);
    vec2 cells = vec2(26.0, 14.0);
    vec2 cell = floor(vUv * cells);
    float own = hash(cell);
    vec2 drift = vec2(0.5 + 0.3 * sin(uRoomT * (0.11 + 0.1 * own) + own * 40.0), fract(own * 7.0 - uRoomT * (0.008 + 0.012 * own)));
    vec2 from = (fract(vUv * cells) - drift) * vec2(2.6 / 26.0, 1.35 / 14.0); // in metres
    bool mote = own < 0.34 && max(abs(from.x), abs(from.y)) < 0.006 && lightHere > 0.3;
    // (Only in the shaft of light itself, which slants down into the room from the window.)
    float shaft = 1.0 - smoothstep(0.0, 0.35, abs(vUv.y - (0.72 - 0.25 * abs(vUv.x - 0.5))));
    if (!mote || shaft < 0.2 + 0.6 * hash(cell + 1.7)) discard;
    col = vec3(0.0);
    shine = vec3(1.0, 0.96, 0.84) * min(1.0, lightHere) * (0.5 + 0.5 * sin(uRoomT * 0.9 + own * 30.0));
    thing = false;
  } else if (m == 39) {
    // CANDLE: its flame, a still tongue of light, there while the candle is alight.
    float across = abs(vUv.x - 0.5) / (0.5 * (1.0 - vUv.y) * (0.5 + 1.1 * vUv.y) + 0.03);
    if (uCandle < 0.03 || across > 1.0) discard;
    col = vec3(0.0);
    shine = (vUv.y < 0.3 ? vec3(0.5, 0.6, 1.0) * 0.5 + vec3(1.0, 0.8, 0.5) * 0.5 : across < 0.5 ? vec3(1.0, 0.95, 0.72) : vec3(1.0, 0.7, 0.3)) * min(1.0, uCandle * 1.5);
    thing = false;
  } else if (m == 34) {
    // Balls of wool: wound in turns.
    col = tint < 0.5 ? vec3(0.62, 0.2, 0.17) : tint < 1.5 ? vec3(0.82, 0.78, 0.66) : vec3(0.22, 0.32, 0.46);
    if (fract((P.x + P.y * 0.6 + P.z * 0.3) / 0.022) < 0.3) col *= 0.8;
  } else if (m == 35) {
    col = vec3(0.86, 0.82, 0.7); // the model boat's sails
  } else {
    col = tint > 0.5 ? vec3(0.62, 0.66, 0.72) : vec3(0.9, 0.82, 0.76); // shells
  }

  // ---- the light in the room: from the window, from the lamp, and from the stove
  // The window is a pale panel of sky in the far wall: what faces it and stands
  // near it is lit, and what is in the plane of that wall gets almost none.
  // (With the curtains drawn, only what comes through the cloth is left of it.)
  vec3 dayIn = uDayIn * (1.0 - 0.86 * uDrawn);
  vec3 winAt = vec3(clamp(P.x, WIN.x, WIN.z), clamp(P.y, WIN.y, WIN.w), WALL_Z + 0.25);
  vec3 toWin = winAt - P;
  float farWin = length(toWin);
  vec3 wayWin = toWin / max(farWin, 0.001);
  float seenWin = max(wayWin.z, 0.0);
  vec3 toLamp = LAMP_AT - P;
  float farLamp = length(toLamp);
  // What stands between a place on the floor and each of those lights: the table's top and the chair's seat.
  float winShade = 1.0;
  float lampShade = 1.0;
  if (N.y > 0.5 && P.y < 0.1) {
    vec3 skyAt = vec3(clamp(P.x, WIN.x, WIN.z), 1.6, WALL_Z + 0.25);
    vec3 a = P + (skyAt - P) * ((0.765 - P.y) / (skyAt.y - P.y));
    if (a.x > -1.0 && a.x < 1.0 && a.z > 3.28 && a.z < 4.0) winShade = 0.42;
    vec3 c = P + (skyAt - P) * ((0.47 - P.y) / (skyAt.y - P.y));
    if (c.x > ${f(SEAT[0] - 0.23)} && c.x < ${f(SEAT[0] + 0.23)} && c.z > ${f(SEAT[2] - 0.28)} && c.z < ${f(SEAT[2] + 0.18)}) winShade = min(winShade, 0.55);
    vec3 l = P + toLamp * ((0.765 - P.y) / max(toLamp.y, 0.01));
    if (l.x > -1.0 && l.x < 1.0 && l.z > 3.28 && l.z < 4.0) lampShade = 0.3;
  }
  vec3 light = dayIn * (0.15 + 1.75 * max(dot(N, wayWin), 0.0) * seenWin / (1.0 + 0.3 * farWin * farWin)) * (0.35 + 0.65 * winShade);
  // Under the window the day lies in a pool on the table and the floor, barred by the
  // window's own bars; and in rain the shadows of the drops on the glass crawl through it.
  if (N.y > 0.5 && P.z < WALL_Z) {
    float pool = (1.0 - smoothstep(0.9, 1.9, abs(P.x))) * smoothstep(1.2, 2.6, P.z);
    float barred = abs(fract((P.x + 1.45) / 0.9667 + 0.5) - 0.5) < 0.035 ? 0.55 : 1.0;
    float drops = 1.0 - 0.3 * uRain * step(0.62, texture(uNoise, vec2(P.x * 0.7, P.z * 0.5 + uRoomT * 0.05)).g);
    light += dayIn * 0.42 * pool * barred * drops * winShade;
  }
  // (By day the lamp is a small thing beside the window; after dark it is what the room is seen by.)
  light += vec3(1.0, 0.6, 0.27) * uLamp * (0.4 + 0.6 * uNight) * (0.14 + 0.86 * max(dot(N, toLamp / farLamp), 0.0)) * 2.1 / (1.0 + 1.25 * farLamp * farLamp) * lampShade;
  vec3 toStove = STOVE_AT - P;
  float farStove = length(toStove);
  // (The stove is never out: after dark, with the lamp unlit, it is what the room is seen by, so its glow
  // carries across the floor. Fed, it burns up for a while.)
  light += vec3(1.0, 0.42, 0.15) * (0.12 + 0.88 * max(dot(N, toStove / farStove), 0.0)) * (1.3 + 0.9 * uNight) * (1.0 + 0.7 * uFlare) / (1.0 + (1.5 - 0.85 * uNight) * farStove * farStove);
  // (CANDLE: and the candle on the table, by the same plain rule.)
  vec3 toCandle = ${v3(CANDLE_FLAME)} - P;
  float farCandle = length(toCandle);
  light += vec3(1.0, 0.64, 0.3) * uCandle * (0.14 + 0.86 * max(dot(N, toCandle / farCandle), 0.0)) * 1.5 / (1.0 + 1.25 * farCandle * farCandle);
  light += vec3(0.014, 0.016, 0.024);

  // Where little light gets: under the table and the chair, in the corners, behind the curtains.
  float dim = 1.0;
  if (m == 1 || m == 7) {
    if (P.x > -1.02 && P.x < 1.02 && P.z > 3.26 && P.z < 4.02) dim *= 0.52;
    if (P.x > ${f(SEAT[0] - 0.25)} && P.x < ${f(SEAT[0] + 0.25)} && P.z > ${f(SEAT[2] - 0.3)} && P.z < ${f(SEAT[2] + 0.2)}) dim *= 0.62;
    if (P.x > 1.93 && P.x < 2.62 && P.z > 2.53 && P.z < 3.22) dim *= 0.5;
    dim *= 0.72 + 0.28 * smoothstep(0.0, 0.5, 3.0 - abs(P.x));
    if (length((P.xz - vec2(1.15, 2.72)) / vec2(0.3, 0.2)) < 1.0) dim *= 0.6; // under the cat
  }
  if (m == 0) dim *= (0.8 + 0.2 * smoothstep(0.0, 0.45, P.y)) * (0.82 + 0.18 * smoothstep(0.0, 0.4, 2.45 - P.y));
  if (m == 2) dim *= 0.86;

  // (The curtains hang in the room's light: once that is gathered, the room is a good deal brighter
  // than the rule above makes it, and the cloth with it.)
  if (m == 6) light += uDayIn * (0.3 - 0.12 * uDrawn) * uTraced + vec3(1.0, 0.6, 0.27) * uLamp * (0.4 + 0.6 * max(uNight, 0.8 * uDrawn)) * 0.25 * uTraced;

  // PATH-TRACE. The same lights, as paths of light found them: so the shadow under the table is the
  // table's, the bars across the pool of sun are the window's own, and the far corners are dim because
  // little reaches them, not because they were told to be. Each light is kept as how much of it arrives,
  // so the day brightening, the lamp being lit or the stove flaring shows at once.
  if (uTraced > 0.0) {
    ivec2 px = ivec2(fc);
    vec4 ta = texelFetch(uTraceA, px, 0);
    vec4 tb = texelFetch(uTraceB, px, 0);
    vec4 tc = texelFetch(uTraceC, px, 0);
    // How far this pixel's own gathering has got. A pixel with only a few samples is all grain, so it is
    // lit by the rule above until it has a dozen, and goes over to the gathered light by degrees as it
    // gets toward a hundred: a room newly come into, or seen for the first time with its curtains drawn,
    // comes right smoothly, not in a storm of speckle. (None at all: a thing rays do not know of, seen
    // against the window.)
    // (Not the curtains: the light gathered at their pixels is the light of what is behind them. They are
    // lit by the rule above, with the room's own brightness added below.)
    float sure = m == 6 ? 0.0 : uTraced * smoothstep(uSureAt.x, uSureAt.y, abs(tc.a));
    if (sure > 0.0) {
      // Indoors the eye opens to the dimmer light. A room lit by one window gets a few parts in a hundred
      // of the day outside, so the day (and the sun) count here for near thirty times what they do out
      // of doors: which is why the window is so bright a thing to look at from in here.
      // (With the curtains drawn, what is left of the day is what the red cloth lets through; and the eye
      // opens to the dimmer room as it does after dark, so the lamp and the stove count for more.)
      float dark = max(uNight, 0.8 * uDrawn);
      vec3 byCloth = mix(vec3(1.0), vec3(1.0, 0.6, 0.52), uDrawn) * (1.0 - 0.68 * uDrawn) * (1.0 + uDrawn);
      vec3 traced = uDayIn * byCloth * ta.rgb * 28.0
        + uSunIn * (1.0 - uDrawn) * (ta.a + tb.rgb) * 28.0
        // (After dark the eye opens further still: the lamp, and with the lamp out the stove, are then what
        // the room is seen by, and count for more.)
        + vec3(1.0, 0.6, 0.27) * uLamp * (0.4 + 0.6 * dark) * tb.a * mix(1.7, 4.5, dark)
        + vec3(1.0, 0.42, 0.15) * tc.rgb * (1.3 + 0.9 * dark) * (1.0 + 0.7 * uFlare) * mix(0.6, mix(4.2, 1.8, min(uLamp, 1.0)), dark)
        // (CANDLE: and the candle on the table, alight while the curtains are drawn.)
        + vec3(1.0, 0.64, 0.3) * uCandle * texelFetch(uTraceD, px, 0).rgb * mix(1.2, 3.4, dark)
        + vec3(0.014, 0.016, 0.024);
      // (And it does not open as far for the brightest places: they are held back, so nothing is burnt out.)
      traced /= 1.0 + 0.6 * max(traced.r, max(traced.g, traced.b));
      light = mix(light, traced, sure);
      dim = mix(dim, 1.0, sure);
    }
  }

  // In a few clean steps, stippled into one another, like everything else here.
  float bright = max(light.r, max(light.g, light.b)) * dim;
  float stepped_ = floor(min(bright, 1.7) * 9.0 + grain) / 9.0;
  col = col * light * dim * (stepped_ / max(bright, 0.0001)) + shine;
  outColor = vec4(col, thing ? IS_OBJECT : IS_LAND);
}
`;

// Where everything in the room is and which way it faces, for the paths to set out from (PATH-TRACE).
// Drawn with the room's own corners (PARLOUR_VERT), so what moves is where it is. Its fourth number says
// what kind of thing: 1 a fixed thing, a half a curtain.
export const ROOM_SHAPE_FRAG = `${HEAD}
in vec3 vAt;
in vec3 vNormal;
in vec2 vUv;
flat in float vMat;
out vec4 outColor;
void main() {
  int m = int(vMat + 0.5);
  bool card = m == 11 || m == 18 || m == 23 || (m >= 29 && m <= 33) || m == 39;
  int part = card ? 0 : int(vUv.y + 0.5);
  // (Not the flame, the lamp's glass, steam, motes, the hourglass's glass and sand, or the pendulum: they
  // take the light of what is behind them.)
  // Nor the curtains: light is gathered for the wall, the window's sides and the sill behind them, so
  // that it is there whether they are drawn or not, and nothing has to be gathered again when they move.
  if (m == 6 || m == 17 || m == 24 || m == 29 || m == 33 || m == 37 || m == 38 || m == 39 || part == 6 || vAt.y < -1.0) discard;
  outColor = vec4(normalize(vNormal) * 0.5 + 0.5, 1.0);
}
`;

/**
 * The bright places by the window: its sill, the plastered sides and top of its opening, and the table
 * under it. After the window itself they light the room more than anything, and they are small, so a
 * path sent off at random seldom finds them (which leaves the far walls speckled for a long while).
 * So a path is sent to one of them on purpose each time. Each is a corner, two edges, the way it faces,
 * and its colour.
 */
const BRIGHT: { o: V3; u: V3; v: V3; n: V3; colour: V3 }[] = [
  { o: [WIN.x0 - 0.14, WIN.y0, WALL - 0.16], u: [WIN.x1 - WIN.x0 + 0.28, 0, 0], v: [0, 0, GLASS_Z - WALL + 0.16], n: [0, 1, 0], colour: [0.6, 0.44, 0.26] },
  { o: [WIN.x0, WIN.y0, WALL], u: [0, WIN.y1 - WIN.y0, 0], v: [0, 0, GLASS_Z - WALL], n: [1, 0, 0], colour: [0.84, 0.81, 0.73] },
  { o: [WIN.x1, WIN.y0, WALL], u: [0, WIN.y1 - WIN.y0, 0], v: [0, 0, GLASS_Z - WALL], n: [-1, 0, 0], colour: [0.84, 0.81, 0.73] },
  { o: [WIN.x0, WIN.y1, WALL], u: [WIN.x1 - WIN.x0, 0, 0], v: [0, 0, GLASS_Z - WALL], n: [0, -1, 0], colour: [0.84, 0.81, 0.73] },
  { o: [-1, 0.765, 3.28], u: [2, 0, 0], v: [0, 0, 0.72], n: [0, 1, 0], colour: [0.5, 0.33, 0.18] },
];
const BRIGHT_AREAS = BRIGHT.map((b) => Math.hypot(...b.u) * Math.hypot(...b.v));
const BRIGHT_AREA = BRIGHT_AREAS.reduce((a, b) => a + b, 0);
const list = (pick: (b: (typeof BRIGHT)[number]) => V3) => `vec3[${BRIGHT.length}](${BRIGHT.map((b) => v3(pick(b))).join(', ')})`;

export const ROOM_TRACE_FRAG = `${HEAD}
precision highp int;
precision highp sampler2D;
layout(location = 0) out vec4 outA; // the daylight from the window, straight and bounced (rgb, for a window of brightness 1); how much of the sun (or moon) arrives straight (a)
layout(location = 1) out vec4 outB; // the sun's light after a bounce or more (rgb, for a sun of brightness 1); the lamp's light, straight and bounced (a)
layout(location = 2) out vec4 outC; // the stove's light, straight and bounced (rgb, for a fire of brightness 1); how many samples this pixel has had (a)
layout(location = 3) out vec4 outD; // CANDLE: the candle's light, straight and bounced (rgb, for a flame of brightness 1)
uniform sampler2D uDepth, uNormal, uPrevA, uPrevB, uPrevC, uPrevD;
${RAY_MESH}
uniform mat4 uInvViewProj;
uniform vec2 uRes;
uniform vec3 uEye, uRight, uAhead; // the room's place in the scene
uniform vec3 uEyeAt;    // where your eyes are, in the room's own measure
uniform vec3 uSunWay;   // the way to the sun (or moon), in the room's own measure
uniform vec4 uCount;    // a number that changes every time; the least a new sample may count for, of the sun's own light (y) and of its bounced light (z); and 1 while the curtains are moving (w)
uniform float uSunSize; // how wide the sun's disc is to a ray (its radius, radians)
uniform vec2 uEnough;   // how many samples of the lights that never move are plenty for a pixel; and how many bounces long a path is
const float EYE_HIGH = ${f(EYE_HIGH)};
const vec4 WIN = vec4(${f(WIN.x0)}, ${f(WIN.y0)}, ${f(WIN.x1)}, ${f(WIN.y1)});
const float GLASS_Z = ${f(GLASS_Z)};
const float WIN_AREA = ${((WIN.x1 - WIN.x0) * (WIN.y1 - WIN.y0)).toFixed(4)};
const vec3 LAMP_AT = ${v3(FLAME)};
const vec3 STOVE_AT = ${v3([STOVE[0], STOVE[1], 2.53 - 0.05])}; // the middle of the stove's door, a little out from it
const vec3 CANDLE_AT = ${v3(CANDLE_FLAME)};

uint seed;
float rnd() {
  seed = seed * 747796405u + 2891336453u;
  uint w = ((seed >> ((seed >> 28u) + 4u)) ^ seed) * 277803737u;
  w = (w >> 22u) ^ w;
  return float(w >> 8u) * (1.0 / 16777216.0);
}

// A direction somewhere on the sun's disc.
vec3 sunWay(float u, float v) {
  vec3 a = normalize(cross(uSunWay, abs(uSunWay.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 b = cross(uSunWay, a);
  float turn = 6.2831853 * v;
  return normalize(uSunWay + (a * cos(turn) + b * sin(turn)) * (uSunSize * sqrt(u)));
}

// A direction out from a surface: any way at all, but oftener the nearer to straight out.
vec3 outWay(vec3 n, float u, float v) {
  vec3 side = normalize(abs(n.y) < 0.99 ? cross(n, vec3(0.0, 1.0, 0.0)) : vec3(1.0, 0.0, 0.0));
  float turn = 6.2831853 * v;
  return normalize((side * cos(turn) + cross(n, side) * sin(turn)) * sqrt(u) + n * sqrt(1.0 - u));
}

// The sun on a place that faces n: whether a ray toward it gets out. (The room is shut all round but
// for the window, so a ray that strikes nothing has gone out through the glass.)
float sunOn(vec3 x, vec3 n, float u, float v) {
  float facing = dot(n, uSunWay);
  if (facing <= 0.0 || uSunWay.z <= 0.02) return 0.0;
  vec3 way = sunWay(u, v);
  return meshAny(x, way, 30.0) ? 0.0 : facing;
}

// The daylight on it from the window: from one point of the glass, taken at random. (The bars and the
// frame stand in the glass's own plane, and stop what falls on them.)
float windowOn(vec3 x, vec3 n, float u, float v, float most) {
  vec3 to = vec3(mix(WIN.x, WIN.z, u), mix(WIN.y, WIN.w, v), GLASS_Z) - x;
  float d2 = dot(to, to);
  float far = sqrt(d2);
  vec3 way = to / far;
  float c = dot(n, way);
  if (c <= 0.0 || way.z <= 0.0) return 0.0;
  float t = c * way.z * WIN_AREA / (3.14159265 * max(d2, 0.12));
  if (meshAny(x, way, far + 0.04)) return 0.0;
  // (Brighter from the sky than from the sea and the ground below it.)
  return min(t, most) * (way.y > 0.0 ? 1.0 : 0.6);
}

// The bright places by the window (see BRIGHT): where each is, the way it faces, its colour; and how far
// through the whole of their area each one's share ends.
const vec3 BRIGHT_O[${BRIGHT.length}] = ${list((b) => b.o)};
const vec3 BRIGHT_U[${BRIGHT.length}] = ${list((b) => b.u)};
const vec3 BRIGHT_V[${BRIGHT.length}] = ${list((b) => b.v)};
const vec3 BRIGHT_N[${BRIGHT.length}] = ${list((b) => b.n)};
const vec3 BRIGHT_COL[${BRIGHT.length}] = ${list((b) => b.colour)};
const float BRIGHT_UPTO[${BRIGHT.length}] = float[${BRIGHT.length}](${BRIGHT_AREAS.map((_, i) => (BRIGHT_AREAS.slice(0, i + 1).reduce((a, b) => a + b, 0) / BRIGHT_AREA).toFixed(4)).join(', ')});
const float BRIGHT_AREA = ${BRIGHT_AREA.toFixed(4)};

// Whether a place is on one of them.
bool onBright(vec3 p) {
  for (int k = 0; k < ${BRIGHT.length}; k++) {
    vec3 d = p - BRIGHT_O[k];
    if (abs(dot(d, BRIGHT_N[k])) > 0.02) continue;
    float a = dot(d, BRIGHT_U[k]) / dot(BRIGHT_U[k], BRIGHT_U[k]);
    float b = dot(d, BRIGHT_V[k]) / dot(BRIGHT_V[k], BRIGHT_V[k]);
    if (a > -0.01 && a < 1.01 && b > -0.01 && b < 1.01) return true;
  }
  return false;
}

// The window's light that comes to a place by way of one of them: a point on one, taken at random; what
// the window throws on that point; and how much of it the place then sees.
float brightOn(vec3 x, vec3 n, out vec3 colour) {
  float pick = rnd();
  int k = 0;
  for (int i = 0; i < ${BRIGHT.length - 1}; i++) if (pick > BRIGHT_UPTO[i]) k = i + 1;
  colour = BRIGHT_COL[k];
  vec3 r = BRIGHT_O[k] + BRIGHT_U[k] * rnd() + BRIGHT_V[k] * rnd();
  vec3 to = r - x;
  float d2 = dot(to, to);
  float far = sqrt(d2);
  vec3 way = to / far;
  float c = dot(n, way);
  float cr = -dot(BRIGHT_N[k], way);
  if (c <= 0.0 || cr <= 0.0) return 0.0;
  float seen = min(c * cr * BRIGHT_AREA / (3.14159265 * max(d2, 0.05)), 0.7); // (held to a most, close to: or the frame and the things on the sill speckle)
  if (meshAny(x, way, far - 0.012)) return 0.0;
  return seen * windowOn(r + BRIGHT_N[k] * 0.012, BRIGHT_N[k], rnd(), rnd(), 2.5);
}

// The sun's light bounced once. Where the sun comes in it lays a patch on the floor, the table or a
// wall: small, and very bright, so a path sent off at random hardly ever finds it, and when one does the
// room is speckled with it. So the patch is found on purpose: a ray is sent in at the window the way the
// sun's light comes, from a point of the glass taken at random; where it lands is a point of the patch,
// and what that point throws on this place is reckoned.
vec3 sunPatchOn(vec3 x, vec3 n) {
  vec3 from = vec3(mix(WIN.x, WIN.z, rnd()), mix(WIN.y, WIN.w, rnd()), GLASS_Z + 0.045);
  vec3 hn;
  vec3 colour;
  float t = meshHit(from, -uSunWay, 20.0, hn, colour);
  if (t < 0.0) return vec3(0.0);
  vec3 r = from - uSunWay * t;
  if (r.z > GLASS_Z - 0.04) return vec3(0.0); // (it fell on the window's own bars)
  vec3 to = r + hn * 0.012 - x;
  float d2 = dot(to, to);
  float far = sqrt(d2);
  vec3 way = to / far;
  float c = dot(n, way);
  float cr = -dot(hn, way);
  if (c <= 0.0 || cr <= 0.0) return vec3(0.0);
  if (meshAny(x, way, far - 0.01)) return vec3(0.0);
  return colour * min(uSunWay.z * c * cr * WIN_AREA / (3.14159265 * max(d2, 0.1)), 1.2);
}

// The lamp's light on it.
float lampOn(vec3 x, vec3 n) {
  vec3 to = LAMP_AT + (vec3(rnd(), rnd(), rnd()) - 0.5) * 0.03 - x;
  float d2 = dot(to, to);
  float far = sqrt(d2);
  vec3 way = to / far;
  float f = (0.1 + 0.9 * max(dot(n, way), 0.0)) / (d2 + 0.08);
  if (f < 0.003 || meshAny(x, way, far - 0.03)) return 0.0;
  return min(f, 6.0);
}

// CANDLE: the candle's light on it.
float candleOn(vec3 x, vec3 n) {
  vec3 to = CANDLE_AT + (vec3(rnd(), rnd(), rnd()) - 0.5) * 0.02 - x;
  float d2 = dot(to, to);
  float far = sqrt(d2);
  vec3 way = to / far;
  float f = (0.1 + 0.9 * max(dot(n, way), 0.0)) / (d2 + 0.06);
  if (f < 0.003 || meshAny(x, way, far - 0.02)) return 0.0;
  return min(f, 6.0);
}

// The stove's: from somewhere on its door, which glows out into the room in front of it.
float stoveOn(vec3 x, vec3 n) {
  vec3 to = STOVE_AT + vec3((rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3, 0.0) - x;
  float d2 = dot(to, to);
  float far = sqrt(d2);
  vec3 way = to / far;
  float f = (0.12 + 0.88 * max(dot(n, way), 0.0)) * (0.2 + 0.8 * max(way.z, 0.0)) / (d2 + 0.15);
  if (f < 0.003 || meshAny(x, way, far - 0.02)) return 0.0;
  return min(f, 5.0);
}

void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  vec4 prevA = texelFetch(uPrevA, at, 0);
  vec4 prevB = texelFetch(uPrevB, at, 0);
  vec4 prevC = texelFetch(uPrevC, at, 0);
  float depth = texelFetch(uDepth, at, 0).r;
  vec4 prevD = texelFetch(uPrevD, at, 0);
  outA = prevA;
  outB = prevB;
  outC = prevC;
  outD = prevD;
  if (depth >= 1.0) {
    outC.a = 0.0; // (nothing of the room here: only what is out of the window)
    return;
  }
  vec4 shape = texelFetch(uNormal, at, 0);
  vec3 N = normalize(shape.rgb * 2.0 - 1.0);
  vec4 w = uInvViewProj * vec4(gl_FragCoord.xy / uRes * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec3 inScene = w.xyz / w.w - uEye;
  vec3 P = vec3(dot(inScene, uRight), inScene.y + EYE_HIGH, dot(inScene, uAhead));
  if (dot(N, P - uEyeAt) > 0.0) N = -N;

  // How many samples this pixel has had. (A curtain while they are being drawn begins again each time:
  // it is not where it was.)
  // (The count is kept below nought for a curtain's pixel: so a pixel that was curtain and is now wall,
  // or was wall and is now curtain, is known, and begins again.)
  bool cloth = shape.a < 0.75;
  float had = abs(prevC.a);
  if ((prevC.a < 0.0) != cloth && had > 0.0) had = 0.0;
  if (uCount.w > 0.5 && cloth) had = 0.0;
  bool settled = had >= uEnough.x;                              // the lights that never move: plenty gathered
  bool sunCan = uSunWay.z > 0.02 && uSunWay.y > -0.03;       // the sun (or moon) stands where it can shine in
  float now = min(had + 1.0, 100000.0);
  float still = max(1.0 / now, 1.0 / 4000.0);
  float bSun = max(1.0 / now, uCount.y);
  float bBounce = max(1.0 / now, uCount.z);
  if (settled && !sunCan) {
    // Nothing left to find out: only what the sun had lit fades as it goes.
    outA.a = mix(prevA.a, 0.0, bSun);
    outB.rgb = mix(prevB.rgb, vec3(0.0), bBounce);
    outC.a = cloth ? -had : had;
    return;
  }

  seed = uint(at.x) * 1973u + uint(at.y) * 9277u + uint(uCount.x) * 26699u + 1u;
  rnd();
  vec2 shift = vec2(rnd(), rnd());
  vec2 evenA = fract(shift + now * vec2(0.7548776662, 0.5698402910));
  vec2 evenB = fract(shift.yx + now * vec2(0.6180339887, 0.3247179572));
  vec2 evenC = fract(vec2(rnd(), rnd()) + now * vec2(0.7548776662, 0.5698402910));

  vec3 from = P + N * 0.015;
  float sun = sunCan ? sunOn(from, N, evenB.x, evenB.y) : 0.0;
  vec3 sky = prevA.rgb;
  float lamp = prevB.a;
  vec3 stove = prevC.rgb;
  vec3 candle = prevD.rgb;
  if (!settled) {
    sky = vec3(windowOn(from, N, evenA.x, evenA.y, 2.5));
    lamp = lampOn(from, N);
    stove = vec3(stoveOn(from, N));
    candle = vec3(candleOn(from, N));
  }

  // The window's light that comes by way of the bright places beside it; and the sun's, by way of the
  // patch it makes in the room.
  vec3 bounce = sunCan ? sunPatchOn(from, N) : vec3(0.0);
  if (!settled) {
    vec3 tint;
    float by = brightOn(from, N, tint);
    sky += tint * by;
  }

  // And a path on round the room, three bounces long: at each place it strikes, what the window, the
  // sun, the lamp and the stove throw on that place comes back along it, in that place's colour. (Not
  // the window's light on a bright place struck first: that has just been reckoned.)
  vec3 through = vec3(1.0);
  vec3 o = from;
  vec3 n = N;
  for (int leg = 0; leg < 3; leg++) {
    if (float(leg) >= uEnough.y) break;
    vec3 way = leg == 0 ? outWay(n, evenC.x, evenC.y) : outWay(n, rnd(), rnd());
    vec3 hn;
    vec3 colour;
    float t = meshHit(o, way, 20.0, hn, colour);
    if (t < 0.0) break; // (out through the window: the daylight is reckoned at every place already)
    through *= colour;
    bool reckoned = leg == 0 && onBright(o + way * t);
    o = o + way * t + hn * 0.012;
    n = hn;
    // (The sun's light on the first place struck has just been reckoned, by way of its patch. On a place
    // struck after that it has bounced twice and is faint: it is held to a most, so that it cannot speckle.)
    if (sunCan && leg > 0) bounce += min(through * sunOn(o, n, rnd(), rnd()), vec3(0.12));
    if (!settled) {
      // (At a bounce it is held to a most: one lucky strike close by the glass would else speckle a far wall.)
      if (!reckoned) sky += through * windowOn(o, n, rnd(), rnd(), 0.5);
      if (leg < 2) {
        lamp += dot(through, vec3(0.3, 0.5, 0.2)) * lampOn(o, n);
        stove += through * stoveOn(o, n);
        candle += through * min(candleOn(o, n), 1.5);
      }
    }
  }

  outA = vec4(mix(prevA.rgb, sky, still), mix(prevA.a, sun, bSun));
  outB = vec4(mix(prevB.rgb, bounce, bBounce), mix(prevB.a, lamp, still));
  outC = vec4(mix(prevC.rgb, stove, still), cloth ? -now : now);
  outD = vec4(mix(prevD.rgb, candle, still), 1.0);
}
`;

export const PANE_VERT = `${HEAD}
${SHARED}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aIn;     // where this is within its pane, 0..1 each way
layout(location = 2) in vec2 aWhich;  // which pane: across, and up
out vec3 vAt;
out vec2 vIn;
flat out vec2 vWhich;
void main() {
  vAt = aPos;
  vIn = aIn;
  vWhich = aWhich;
  gl_Position = uViewProj * vec4(inScene(aPos), 1.0);
}
`;

// What the weather has put on the glass: rain beading on it and running down,
// mist at the foot of the panes, frost growing in from their edges, snow lying
// on the ledge outside; and at night the lamp's own flame hanging in the dark of it.
export const PANE_FRAG = `${HEAD}
${SHARED}
in vec3 vAt;
in vec2 vIn;
flat in vec2 vWhich;
out vec4 outColor;
uniform sampler2D uNoise;
uniform vec3 uDayIn;
uniform float uNight;
uniform float uLamp;
uniform vec4 uGlass;   // on the panes: rain (0..1), frost (0..1), snow on the ledge (0..1), mist (0..1)
uniform float uRoomT;
uniform sampler2D uWiped; // where a finger has wiped the mist off the glass: the whole window, 0 misted to 1 clean

const vec4 WINDOW = vec4(${f(WIN.x0)}, ${f(WIN.y0)}, ${f(WIN.x1)}, ${f(WIN.y1)});

float hash(vec2 v) { return fract(sin(dot(v, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 fc = gl_FragCoord.xy;
  float grain = bayer(fc);
  vec2 g = vIn;
  vec2 which = vWhich;
  float wiped = texture(uWiped, (vAt.xy - WINDOW.xy) / (WINDOW.zw - WINDOW.xy)).r;
  vec3 lampGlow = uLamp * vec3(1.0, 0.6, 0.27) * (0.4 + 0.6 * uNight) / (1.0 + 6.0 * dot(vAt - LAMP_AT, vAt - LAMP_AT));
  vec3 skyTone = uDayIn * 0.6 + vec3(0.1, 0.12, 0.16);
  // (What is on the glass is seen by the light there is: pale by day, dim by night, and warm where the lamp is near.)
  vec3 wet = skyTone * 1.3 + 0.03 + lampGlow * 0.35;
  vec3 pale = vec3(0.8, 0.84, 0.88) * (uDayIn * 0.75 + 0.1) + lampGlow * 0.25;
  // Old glass is never quite clear.
  vec4 over = vec4(skyTone, 0.05);
  vec2 pg = g + which * 0.37; // so that no two panes are alike

  // Mist, where the warm room meets the cold glass: it gathers at the foot of each pane and climbs,
  // and with the kettle boiling it takes the whole of the glass. A finger drawn across it wipes it away.
  float misted = max(0.0, uGlass.w - 0.2) / 0.8 * (1.0 - 0.8 * uGlass.y);
  float reach = 2.4 * misted;
  bool cleared = wiped > 0.3 + 0.25 * grain;
  if (reach > 0.03 && !cleared) {
    float mist = 1.0 - (g.y + (texture(uNoise, pg * vec2(0.9, 0.3)).b - 0.5) * 0.3 * min(reach, 1.0)) / reach;
    if (mist > grain) over = vec4(pale, 0.4 + 0.26 * clamp(mist, 0.0, 1.0));
  }
  // (Where it has just been wiped the glass is wet, and a little brighter along the edge of the stroke.)
  if (reach > 0.03 && wiped > 0.12 && wiped < 0.3 + 0.25 * grain) over = vec4(pale * 1.1, 0.62);
  // Rain: beads that sit on the glass, each a point of light with its own small
  // shadow above it; and here and there a drop that has gathered enough to run.
  if (uGlass.x > 0.02) {
    vec2 cellSize = vec2(7.0, 8.0);
    vec2 beadCell = floor(fc / cellSize);
    vec2 inCell = floor(mod(fc, cellSize));
    vec2 bead = floor(vec2(hash(beadCell) * 6.0, hash(beadCell + 3.1) * 6.0));
    float chance = hash(beadCell + 7.7);
    if (chance < 0.42 * uGlass.x) {
      bool big = chance < 0.1 * uGlass.x;
      if (inCell == bead || (big && inCell == bead + vec2(1.0, 0.0))) over = vec4(wet + 0.06, 0.5);
      else if (inCell == bead + vec2(0.0, 1.0) || (big && inCell == bead + vec2(1.0, 1.0))) over = vec4(vec3(0.0), 0.2);
    }
    float laneWide = 9.0;
    float lane = floor(fc.x / laneWide);
    float runs = hash(vec2(lane, which.y * 3.0 + 1.0));
    if (runs < 0.1 + 0.4 * uGlass.x) {
      float pace = 0.045 + 0.07 * hash(vec2(lane, 4.0));
      float turn = fract(uRoomT * pace + runs * 9.0);
      float head = 1.1 - 1.3 * turn * turn * turn; // it hangs near the top of the pane, then lets go
      float wander = floor(texture(uNoise, vec2(lane * 0.13, g.y * 0.35 + runs)).r * 2.6 - 0.8);
      bool column = floor(mod(fc.x, laneWide)) == floor(hash(vec2(lane, 6.0)) * 6.0) + 1.0 + wander;
      float behind = g.y - head;
      float trail = 0.1 + 0.5 * turn;
      if (column && behind > 0.0 && behind < trail) over = vec4(wet + 0.04, 0.26 * (1.0 - behind / trail));
      if (column && behind > -0.035 && behind <= 0.0) over = vec4(wet + 0.1, 0.62);
    }
  }
  // Frost: it grows in from the corners and the edges of each pane in feathers,
  // and leaves the middle clear to see through.
  if (uGlass.y > 0.02) {
    vec2 fromEdge = min(g, 1.0 - g);
    float edge = min(fromEdge.x, fromEdge.y) + 0.35 * max(fromEdge.x, fromEdge.y);
    float fern = texture(uNoise, pg * vec2(2.3, 2.6)).a * 0.55 + texture(uNoise, pg * vec2(7.0, 6.2) + 0.3).r * 0.45;
    float ice = (0.03 + 0.2 * uGlass.y) * (1.0 - 0.8 * smoothstep(0.3, 0.8, wiped)) - edge - (fern - 0.5) * 0.2; // (a warm finger melts frost back, too)
    vec3 rimeCol = vec3(0.86, 0.92, 0.98) * (uDayIn * 0.7 + 0.2) + lampGlow * 0.3;
    if (ice > 0.03) over = vec4(fern > 0.56 ? rimeCol * 1.08 : rimeCol, 0.92);
    else if (ice > -0.03 + grain * 0.06) over = vec4(rimeCol, 0.5);
  }
  // Snow lying along the ledge outside, heaped against the foot of the lowest panes.
  if (which.y < 0.5 && uGlass.z > 0.02) {
    float heap = uGlass.z * (0.1 + 0.07 * texture(uNoise, vec2(pg.x * 0.9, 0.5)).g);
    if (g.y < heap) over = vec4(vec3(0.94, 0.97, 1.0) * (uDayIn * 0.8 + 0.25), 1.0);
  }
  // The lamp's own flame, hanging in the dark glass at night.
  vec2 off = vAt.xy - (LAMP_AT.xy + vec2(0.16, 0.05));
  float ghost = uLamp * uNight * (1.0 - smoothstep(0.0, 0.05, length(off * vec2(1.0, 0.7))));
  if (ghost > 0.0) over = vec4(mix(over.rgb, vec3(1.0, 0.66, 0.32), 0.8), max(over.a, 0.35 * ghost));

  if (over.a <= 0.0) discard;
  outColor = over;
}
`;
