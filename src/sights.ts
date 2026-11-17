// Rare sights. Once in a while something passes that is easy to miss: whales
// far out in the fjord, a ship under sail between the islands, a hare at the
// meadow's edge, a seal in the bay below. Which days have one, what it is and
// when in the day it comes are decided from the date alone (most days have
// none; about one in four or five does), so a day's sight does not change if
// the page is opened again. Each lasts a quarter to three quarters of an hour.
//
// Nothing announces them. If the pointer rests on one, or it is clicked, a few
// words name it, and it is counted as seen.
//
// They are drawn with the kite's brush: plain coloured corners, worked out here.

import type { V3 } from './scene/gl';
import { BEACH, EYE, FACING, land, SHORE_EYE } from './scene/land';

export type Sighting = 'whales' | 'ship' | 'hare' | 'seal';

interface Drawn {
  tris: number[];
  lines: number[];
}

interface Plan {
  kind: Sighting;
  /** When it begins (epoch ms) and how long it lasts. */
  from: number;
  lasts: number;
}

const DAY = 86_400_000;
const MIN = 60_000;
const UP: V3 = [0, 1, 0];
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** A number between 0 and 1 made from a whole number: the same one always gives the same. */
function chance(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 2654435761);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** What a day holds, if anything: decided from its date, and fitted to its daylight. */
export function planFor(ms: number, sunrise: number, sunset: number): Plan | null {
  const d = new Date(ms);
  const noon = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime();
  const day = Math.round(noon / DAY);
  if (chance(day) > 0.23) return null;
  // The sun's times, brought to this day.
  const shift = Math.round((noon - (sunrise + sunset) / 2) / DAY) * DAY;
  const up = sunrise + shift;
  const down = sunset + shift;
  const pick = chance(day * 7 + 3);
  const kind: Sighting = pick < 0.34 ? 'whales' : pick < 0.6 ? 'ship' : pick < 0.82 ? 'hare' : 'seal';
  const lasts = (18 + 26 * chance(day * 13 + 5)) * MIN;
  const r = chance(day * 31 + 11);
  // A hare is out at first light or at dusk; the others pass in daylight.
  const from = kind === 'hare' ? (r < 0.5 ? up - 15 * MIN + r * 60 * MIN : down - 55 * MIN + (r - 0.5) * 60 * MIN) : up + 40 * MIN + r * Math.max(0, down - up - 80 * MIN - lasts);
  return { kind, from, lasts };
}

export function createSights(say: (words: string) => void, covers: (corners: V3[], x: number, y: number) => boolean, onSighting: (kind: Sighting, words: string) => void = () => {}) {
  /** One started by hand, for testing: timed on the page's own clock. */
  let forced: { kind: Sighting; at: number; lasts: number } | null = null;
  let showing: Sighting | null = null;
  /** How far the sea stands above its mean level, as the tide has it. */
  let seaLevel = 0;
  let boxAt: V3[] = [];
  let winter = false;
  const noticed = new Set<string>();

  const box = (c: V3, r: number, lo: number, hi: number): V3[] => {
    const corners: V3[] = [];
    for (const dx of [-r, r]) for (const dy of [lo, hi]) for (const dz of [-r, r]) corners.push([c[0] + dx, c[1] + dy, c[2] + dz]);
    return corners;
  };
  /** The way across your view at a place: to your right as you look at it from the meadow. */
  const acrossAt = (p: V3, from: V3 = EYE): V3 => unit(cross([p[0] - from[0], 0, p[2] - from[2]], UP));

  // ---- whales: dark backs rolling far out, and a puff of breath as each comes up
  function whales(into: Drawn, p: number, time: number): void {
    const t = Math.floor(time / 166) * 0.166; // six steps a second, like the water
    const centre: V3 = [-330 + 190 * p, 0.05, -820 - 170 * p];
    const side = acrossAt(centre);
    const dark: V3 = [0.09, 0.11, 0.14];
    for (let k = 0; k < 4; k++) {
      const at = add(add(centre, side, (k - 1.5) * 26 + 9 * Math.sin(k * 2.3)), [0, 0, 1], (k % 2) * 30 - 12);
      const turn = ((t + k * 2.7 + 4 * chance(k + 5)) % 10) / 10; // each rolls up once in ten seconds
      const upNow = turn < 0.36 ? Math.sin((turn / 0.36) * Math.PI) : 0;
      if (upNow > 0.02) {
        const long = 26;
        const high = 5.5 * upNow;
        let prev: V3 | null = null;
        for (let i = 0; i <= 6; i++) {
          const u = i / 6;
          const crest = add(add(at, side, (u - 0.5) * long), UP, high * Math.sin(Math.PI * u) ** 0.7);
          const foot = add(at, side, (u - 0.5) * long);
          if (prev) into.tris.push(...prev, ...dark, ...crest, ...dark, ...foot, ...dark, ...prev, ...dark, ...foot, ...dark, ...add(at, side, ((i - 1) / 6 - 0.5) * long), ...dark);
          prev = crest;
        }
        // The fin, set well back.
        const fin = add(add(at, side, long * 0.22), UP, high * 0.9);
        into.tris.push(...fin, ...dark, ...add(fin, side, 3.5), ...dark, ...add(add(fin, side, 2.6), UP, 2.6 * upNow), ...dark);
      }
      // Its breath: a low pale puff as it breaks the surface, gone in a second or two.
      if (turn > 0.04 && turn < 0.2) {
        const fade = 1 - (turn - 0.04) / 0.16;
        const blow = add(add(at, side, -6), UP, 3.5 * upNow);
        const pale: V3 = [0.86, 0.9, 0.95];
        into.tris.push(...add(blow, side, -1.6 * fade - 0.6), ...pale, ...add(blow, side, 1.6 * fade + 0.6), ...pale, ...add(blow, UP, 5 + 7 * (1 - fade)), ...pale);
      }
    }
    boxAt = box(centre, 70, 0, 16);
  }

  // ---- a ship: an old two-masted smack under brown sails, crossing far out between the islands
  function ship(into: Drawn, p: number, time: number): void {
    const from: V3 = [-720, 0.3, -1480];
    const to: V3 = [-230, 0.3, -1660];
    const at: V3 = [from[0] + (to[0] - from[0]) * p, 0.3 + 0.6 * Math.sin(Math.floor(time / 500) * 0.9), from[2] + (to[2] - from[2]) * p];
    const along = unit([to[0] - from[0], 0, to[2] - from[2]]);
    const hull: V3 = [0.08, 0.07, 0.07];
    const sail: V3 = [0.46, 0.2, 0.12];
    const sailLit: V3 = [0.58, 0.28, 0.16];
    const P = (a: number, y: number): V3 => add(add(at, along, a), UP, y);
    const quad = (a: V3, b: V3, c: V3, d: V3, col: V3) => into.tris.push(...a, ...col, ...b, ...col, ...c, ...col, ...a, ...col, ...c, ...col, ...d, ...col);
    quad(P(-30, 0), P(34, 0), P(40, 7), P(-32, 6), hull); // the hull, with its bow lifted
    into.tris.push(...P(34, 2), ...hull, ...P(56, 9), ...hull, ...P(40, 7), ...hull); // the bowsprit
    quad(P(6, 9), P(31, 11), P(27, 44), P(8, 50), sail); // mainsail
    into.tris.push(...P(8, 50), ...sailLit, ...P(27, 44), ...sailLit, ...P(9, 62), ...sailLit); // topsail
    quad(P(-28, 9), P(-8, 10), P(-11, 36), P(-26, 40), sail); // mizzen
    into.tris.push(...P(34, 10), ...sailLit, ...P(55, 10), ...sailLit, ...P(10, 52), ...sailLit); // jib
    into.lines.push(...P(8, 6), ...hull, ...P(9, 64), ...hull, ...P(-26, 6), ...hull, ...P(-26, 44), ...hull);
    boxAt = box(at, 60, 0, 66);
  }

  // ---- a hare on the path down the meadow: sitting with its ears up, then loping off into the grass
  function hare(into: Drawn, p: number, time: number): void {
    const t = Math.floor((time / 1000) * 12) / 12;
    const sat: [number, number] = [-0.5, -36.5]; // on the bare earth of the path, where the grass does not hide it
    // The last tenth of its time it is off, in long low bounds, away to the left.
    const going = Math.max(0, (p - 0.9) / 0.1);
    const run = going * 26;
    const x = sat[0] - 0.8 * run;
    const z = sat[1] - 0.6 * run;
    const bound = going > 0 ? Math.abs(Math.sin(run * 0.9)) * 0.55 : 0;
    const at: V3 = [x, land(x, z) + bound, z];
    const side = acrossAt(at);
    const face = going > 0 ? -1 : Math.sin(t * 0.21) > 0.6 ? -1 : 1; // which way it looks along your view
    const coat: V3 = winter ? [0.93, 0.93, 0.96] : [0.5, 0.42, 0.34];
    const shade: V3 = [coat[0] * 0.78, coat[1] * 0.78, coat[2] * 0.8];
    const s = 1.7; // (larger than life, to be seen at all)
    const P = (a: number, y: number): V3 => add(add(at, side, a * face * s), UP, y * s);
    const tri = (a: V3, b: V3, c: V3, col: V3) => into.tris.push(...a, ...col, ...b, ...col, ...c, ...col);
    if (going > 0) {
      // Running: stretched out long and low, ears laid back.
      tri(P(-0.46, 0.05), P(0.1, 0.02), P(-0.2, 0.3), shade);
      tri(P(-0.2, 0.3), P(0.1, 0.02), P(0.42, 0.26), coat);
      tri(P(0.1, 0.02), P(0.46, 0.04), P(0.42, 0.26), coat);
      tri(P(0.36, 0.22), P(0.6, 0.3), P(0.42, 0.42), coat);
      tri(P(0.4, 0.4), P(0.46, 0.4), P(0.12, 0.5), shade);
      tri(P(-0.5, 0.14), P(-0.42, 0.14), P(-0.46, 0.24), [0.96, 0.96, 0.96]); // the scut
    } else {
      // Sitting up on its haunches, as a hare does to look about: tall enough that the grass does not hide it.
      tri(P(-0.24, 0), P(0.14, 0), P(-0.1, 0.4), shade); // haunches
      tri(P(-0.1, 0.4), P(0.14, 0), P(0.2, 0.52), coat); // back and belly
      tri(P(-0.1, 0.4), P(0.2, 0.52), P(0.04, 0.62), coat); // shoulders
      tri(P(0.1, 0), P(0.2, 0), P(0.17, 0.4), shade); // a foreleg, set down in front
      tri(P(0.04, 0.56), P(0.32, 0.62), P(0.12, 0.8), coat); // the head
      const twitch = 0.04 * Math.sin(t * 3.1);
      tri(P(0.08, 0.76), P(0.15, 0.78), P(0.04 + twitch, 1.12), shade); // the two long ears
      tri(P(0.13, 0.78), P(0.2, 0.76), P(0.16 + twitch, 1.1), coat);
      tri(P(-0.28, 0.08), P(-0.2, 0.08), P(-0.24, 0.18), [0.96, 0.96, 0.96]); // the scut
      // (A dark eye, so that it is plainly looking at something.)
      tri(P(0.19, 0.68), P(0.24, 0.68), P(0.215, 0.73), [0.08, 0.07, 0.07]);
    }
    boxAt = box(at, 1.1, 0, 2.0);
  }

  // ---- a seal in the bay below the meadow: a dark head that looks about, sinks, and comes up near by
  function seal(into: Drawn, time: number): void {
    const t = Math.floor(time / 166) * 0.166;
    const round = Math.floor(t / 22);
    const within = (t % 22) / 22; // up for most of each round, under for the rest
    const ahead: V3 = [Math.sin(FACING), 0, -Math.cos(FACING)];
    const right: V3 = [Math.cos(FACING), 0, Math.sin(FACING)];
    const out = BEACH.toWater + 15 + 8 * chance(round * 3 + 1);
    const over = -7 + 12 * chance(round * 5 + 2);
    const at = add(add([BEACH.x, 0.03 + seaLevel, BEACH.z], ahead, out), right, over);
    boxAt = box(at, 1.0, 0, 1.0);
    const upNow = within < 0.7 ? Math.min(1, within / 0.05, (0.7 - within) / 0.05) : 0;
    if (upNow <= 0) return;
    const side = acrossAt(at, SHORE_EYE);
    const dark: V3 = [0.13, 0.13, 0.15];
    const look = 0.12 * Math.sin(t * 0.5 + round);
    const h = 0.42 * upNow;
    const P = (a: number, y: number): V3 => add(add(at, side, a), UP, y);
    into.tris.push(...P(-0.34, 0), ...dark, ...P(0.34, 0), ...dark, ...P(0.2 + look, h), ...dark);
    into.tris.push(...P(-0.34, 0), ...dark, ...P(0.2 + look, h), ...dark, ...P(-0.2 + look, h), ...dark);
    const muzzle: V3 = [0.3, 0.3, 0.33];
    into.tris.push(...P(0.02 + look * 2, h * 0.35), ...muzzle, ...P(0.2 + look * 2, h * 0.35), ...muzzle, ...P(0.11 + look * 2, h * 0.62), ...muzzle);
  }

  const WORDS: Record<Sighting, () => [string, string]> = {
    whales: () => ['whales, far out', 'whales in the fjord'],
    ship: () => ['a ship under sail', 'a ship under sail'],
    hare: () => (winter ? ['a white hare', 'a white hare in the meadow'] : ['a hare', 'a hare in the meadow']),
    seal: () => ['a seal, watching you', 'a seal in the bay'],
  };

  return {
    /** Tell it where the sea stands, so that the seal's head is at the water. */
    sea(level: number): void {
      seaLevel = level;
    },
    /** What today holds, and when (for testing). */
    today: (ms: number, sunrise: number, sunset: number) => {
      const plan = planFor(ms, sunrise, sunset);
      return plan ? { kind: plan.kind, from: new Date(plan.from).toString().slice(0, 21), minutes: Math.round(plan.lasts / MIN) } : null;
    },
    /** The next few days that hold something (for testing). */
    next: (ms: number, sunrise: number, sunset: number, many = 5) => {
      const out: string[] = [];
      for (let k = 0; k < 90 && out.length < many; k++) {
        const plan = planFor(ms + k * DAY, sunrise, sunset);
        if (plan) out.push(`${new Date(plan.from).toString().slice(0, 21)} · ${plan.kind}`);
      }
      return out;
    },
    /** Start one now, for a few minutes (for testing). */
    force(kind: Sighting, minutes = 6): void {
      forced = { kind, at: -1, lasts: minutes * MIN };
    },
    showing: () => showing,
    /** Where in the scene what is showing is (the middle of it), for testing. */
    where: (): V3 | null => (showing && boxAt.length ? [(boxAt[0][0] + boxAt[7][0]) / 2, (boxAt[0][1] + boxAt[7][1]) / 2, (boxAt[0][2] + boxAt[7][2]) / 2] : null),

    /** Whether a point on the page is on what is showing. */
    over: (x: number, y: number) => showing !== null && covers(boxAt, x, y),

    /** It has been looked at: name it, once in a sitting for each day's sight, and count it as seen. */
    seen(ms: number): void {
      if (!showing) return;
      const key = `${Math.floor(ms / DAY)} ${showing}`;
      if (noticed.has(key)) return;
      noticed.add(key);
      const [words, kept] = WORDS[showing]();
      say(words);
      onSighting(showing, kept);
    },

    /** Called every frame: adds whatever is passing to what is drawn. */
    draw(into: Drawn, ms: number, time: number, sunrise: number, sunset: number, gale: boolean): void {
      showing = null;
      const month = new Date(ms).getMonth();
      winter = month >= 10 || month <= 2;
      let kind: Sighting;
      let p: number;
      if (forced) {
        if (forced.at < 0) forced.at = time;
        p = (time - forced.at) / forced.lasts;
        kind = forced.kind;
        if (p >= 1) {
          forced = null;
          return;
        }
      } else {
        const plan = planFor(ms, sunrise, sunset);
        if (!plan || ms < plan.from || ms > plan.from + plan.lasts) return;
        // (No ship is out in a gale.)
        if (plan.kind === 'ship' && gale) return;
        kind = plan.kind;
        p = (ms - plan.from) / plan.lasts;
      }
      showing = kind;
      if (kind === 'whales') whales(into, p, time);
      else if (kind === 'ship') ship(into, p, time);
      else if (kind === 'hare') hare(into, p, time);
      else seal(into, time);
    },
  };
}
