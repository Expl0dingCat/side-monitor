// A rowing boat, a line, and supper.
//
// Down on the beach a small boat lies at her mooring in the shallows, to the
// right, lifting to each wave that comes in under her. Click her and you row
// out into the bay. There you sit in her stern, looking the way you always
// look, with her bow in front of you and the swell passing under: she rises
// and falls with it, lifts her bow to a crest and dips it after, and rolls as
// the water leans. Click the water and your line goes out to where you
// clicked; a painted float marks it. When something is at the bait the float
// dips and trembles; when it has taken it the float goes right under. Click
// then, and you bring a fish aboard. Click too soon and you pull the bait away
// from it. Click the boat herself (or press Esc) to row home.
//
// She does not go out in weather that would not let a small boat out: a
// stiff wind, a sea running, thunder, or fog too thick to find the way back.
// On such a day she has been hauled up the shingle and turned keel up, and a
// click on her only says why. If it comes on to blow while you are out, you
// row home.
//
// What you catch goes up to the fire with you and hangs on a rack beside it.
// With the fire lit (or still in embers), click a fish and it goes on a spit
// over the flames; it cooks through in a minute or two, turning from silver
// to gold. Click it then to eat it. Leave it too long and it burns.
//
// The boat is a thing built board by board (scene/skiff.ts); the fish, the
// rack and the spit are built as real shapes too (scene/catch.ts), and the
// picture draws them itself: from here it is only told where each one is.
// What is left to draw as plain coloured corners (by the little program that
// draws the kite) is slight: the rod, the float, the line, a string, a wisp
// of steam.

import type { KiteDrawn } from './kite';
import { HULL, sheerAt, SKIFF_SPOT, surfRise, swellAt } from './scene/afloat';
import { FISH, FISH_BIG, rackPlace, spitPlace, type FishKind } from './scene/catch';
import { LANTERN_BIG, LANTERN_HOOK } from './scene/skiff';
import type { V3 } from './scene/gl';
import { BEACH, FACING, land } from './scene/land';

const KEY = 'nightpond.catch';
/** How many fish there can be at once, between the boat, the rack and the fire. */
const MOST = 6;

type Kind = FishKind;
interface Fish {
  kind: Kind;
  /** How big it is beside others of its kind, about 0.8 to 1.3. */
  size: number;
  /** When it was caught. */
  at: number;
  where: 'boat' | 'rack' | 'fire';
  /** How far cooked: 0 raw, 1 done, past 2.4 burnt black. */
  cooked: number;
}

const A = (kind: Kind) => (kind === 'haddock' ? 'a haddock' : kind === 'mackerel' ? 'a mackerel' : kind === 'cod' ? 'a cod' : 'a saithe');
const COUNT = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];

// ---- small sums ---------------------------------------------------------------------

const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (a: number, b: number, x: number) => {
  const u = clamp((x - a) / (b - a));
  return u * u * (3 - 2 * u);
};

/** The way you face, and the way to your right, along the ground. */
const AHEAD: V3 = [Math.sin(FACING), 0, -Math.cos(FACING)];
const RIGHT: V3 = [Math.cos(FACING), 0, Math.sin(FACING)];
/** A spot on the beach: so far in front of where you stand there, so far to your right. */
const beachXZ = (ahead: number, right: number): [number, number] => [BEACH.x + AHEAD[0] * ahead + RIGHT[0] * right, BEACH.z + AHEAD[2] * ahead + RIGHT[2] * right];

// ---- shapes: each a list of three-cornered faces in a thing's own measure ----------------

/** Faces, nine numbers of corners and three of colour each; `self` marks a face that gives light of its own. */
interface Shape {
  corners: number[];
  colours: number[];
  self: boolean[];
}
const shape = (): Shape => ({ corners: [], colours: [], self: [] });
function tri(s: Shape, a: V3, b: V3, c: V3, col: V3, self = false): void {
  s.corners.push(...a, ...b, ...c);
  s.colours.push(...col);
  s.self.push(self);
}
function quad(s: Shape, a: V3, b: V3, c: V3, d: V3, col: V3, self = false): void {
  tri(s, a, b, c, col, self);
  tri(s, a, c, d, col, self);
}
/** A squared timber from one end to the other, so wide and so deep. */
function timber(s: Shape, from: V3, to: V3, wide: number, deep: number, col: V3, endCol: V3 = col): void {
  const along = unit(sub(to, from));
  const side = unit(Math.abs(along[1]) > 0.95 ? cross(along, [1, 0, 0]) : cross(along, [0, 1, 0]));
  const up = cross(side, along);
  const c = (p: V3, i: number, j: number): V3 => add(add(p, side, (i - 0.5) * wide), up, (j - 0.5) * deep);
  quad(s, c(from, 0, 1), c(to, 0, 1), c(to, 1, 1), c(from, 1, 1), col);
  quad(s, c(from, 1, 0), c(to, 1, 0), c(to, 0, 0), c(from, 0, 0), col);
  quad(s, c(from, 0, 0), c(to, 0, 0), c(to, 0, 1), c(from, 0, 1), col);
  quad(s, c(from, 1, 1), c(to, 1, 1), c(to, 1, 0), c(from, 1, 0), col);
  quad(s, c(from, 0, 0), c(from, 0, 1), c(from, 1, 1), c(from, 1, 0), endCol);
  quad(s, c(to, 1, 0), c(to, 1, 1), c(to, 0, 1), c(to, 0, 0), endCol);
}

// (The boat herself is built board by board in scene/skiff.ts, and drawn by a program of her own. What is
// drawn from here is what comes and goes: the catch, the rod, the float, the line, her mooring ropes.)
const HALF = HULL.half;

/** The float: a cork painted red above and white below, with a quill through it. */
function buildFloat(): Shape {
  const s = shape();
  const r = 0.05;
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2;
    const a1 = ((i + 1) / 6) * Math.PI * 2;
    const ring = (a: number): V3 => [Math.cos(a) * r, 0, Math.sin(a) * r];
    tri(s, [0, 0.085, 0], ring(a0), ring(a1), i % 2 ? [0.9, 0.16, 0.12] : [0.78, 0.12, 0.1]);
    tri(s, [0, -0.085, 0], ring(a1), ring(a0), [0.92, 0.92, 0.88]);
  }
  timber(s, [0, 0.07, 0], [0, 0.2, 0], 0.012, 0.012, [0.94, 0.9, 0.5]);
  return s;
}

const FLOAT = buildFloat();

/** A thing's place in the scene: where its own middle is, and the three ways its own x, y and z point (each as long as the thing is scaled). */
export interface Frame {
  at: V3;
  x: V3;
  y: V3;
  z: V3;
}
const place = (f: Frame, p: V3): V3 => [
  f.at[0] + f.x[0] * p[0] + f.y[0] * p[1] + f.z[0] * p[2],
  f.at[1] + f.x[1] * p[0] + f.y[1] * p[1] + f.z[1] * p[2],
  f.at[2] + f.x[2] * p[0] + f.y[2] * p[1] + f.z[2] * p[2],
];
/**
 * A frame for something that heads `heading` (as the scene measures bearings), tipped bow-up by `pitch`
 * and starboard-up by `roll` (half a turn of roll lays it keel up).
 */
function frameOf(at: V3, heading: number, pitch: number, roll: number): Frame {
  const f: V3 = [Math.sin(heading), 0, -Math.cos(heading)];
  const r: V3 = [Math.cos(heading), 0, Math.sin(heading)];
  // Pitched about her beam...
  const z: V3 = [f[0] * Math.cos(pitch), Math.sin(pitch), f[2] * Math.cos(pitch)];
  const up: V3 = [-f[0] * Math.sin(pitch), Math.cos(pitch), -f[2] * Math.sin(pitch)];
  // ...then rolled about her length.
  const x: V3 = [r[0] * Math.cos(roll) + up[0] * Math.sin(roll), up[1] * Math.sin(roll), r[2] * Math.cos(roll) + up[2] * Math.sin(roll)];
  const y: V3 = [up[0] * Math.cos(roll) - r[0] * Math.sin(roll), up[1] * Math.cos(roll), up[2] * Math.cos(roll) - r[2] * Math.sin(roll)];
  return { at, x, y, z };
}

/** What the page tells this each frame. */
export interface FishingAround {
  ashore: boolean;
  /** In the meadow, standing (not at the stone, lying back or indoors). */
  meadow: boolean;
  /** The wind's strength (1 is about 50 km/h), thunder, fog, and how big the sea is running. */
  wind: number;
  thunder: number;
  fog: number;
  sea: number;
  /** The sea's eight phases as it is drawn, how far through its life the first wave on the beach is, and the tide. */
  waves: number[];
  surf: number;
  /** COMBERS: what each of the two waves on their way in is like (see main.ts). */
  combers: number[];
  tide: number;
  /** Where the light comes from, and how dark it is (0 day, 1 night). */
  light: V3;
  dark: number;
  /** The fire: how high its flames stand, and how its embers glow. */
  flame: number;
  embers: number;
  /** The hour of the day, for when fish feed. */
  hour: number;
  rain: number;
  /** Where your eyes are (from the meadow or the beach; out in the boat it is worked out here). */
  eye: V3;
  /** Where the pointer is in the window, -1..1 across and -1..1 up (0, 0 if it is not on the picture): out in the boat you turn your head toward it. */
  look: [number, number];
}

/** One of the shapes in scene/catch.ts, set somewhere in the scene: which, where (its middle, and the ways its own x, y and z point), how far cooked, and whether it lies in the boat (where her lantern lights it). */
export interface CatchThing {
  mesh: FishKind | 'rack' | 'spit' | 'lantern';
  at: V3;
  x: V3;
  y: V3;
  z: V3;
  cooked: number;
  aboard: boolean;
}

/** What it gives back for the picture. */
export interface FishingNow {
  /** While you are out: where your eyes are. */
  eye: V3;
  /** How your head is carried with her, and turned: tipped up (bow rising, or looking up), rolled (starboard rising), and turned to the right, in radians. */
  tilt: [number, number, number];
  /** The boat, where she is to be drawn (null if she is not in sight); and whether she lies in the water, so that none is drawn inside her. */
  boat: Frame | null;
  wet: boolean;
  /** How brightly the lantern on her stem burns, 0..1; and how big the swell is running out on the bay. */
  lamp: number;
  swell: number;
  /** Whether anything of it is moving and wants the picture drawn smoothly. */
  lively: boolean;
  /** Whether you should be rowed home now: the weather has turned. */
  home: boolean;
}

export function createFishing(say: (words: string) => void, covers: (corners: V3[], x: number, y: number) => boolean) {
  let fish: Fish[] = [];
  try {
    const got: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (Array.isArray(got)) {
      fish = got
        .filter((f): f is Fish => !!f && typeof f.kind === 'string' && f.kind in FISH && typeof f.size === 'number')
        .map((f): Fish => ({ kind: f.kind, size: clamp(f.size, 0.7, 1.4), at: Number(f.at) || Date.now(), where: f.where === 'fire' ? 'fire' : 'rack', cooked: Math.max(0, Number(f.cooked) || 0) }))
        .slice(0, MOST);
    }
  } catch {
    // Nothing kept, then.
  }
  const keep = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(fish));
    } catch {
      // Remembered until the page is closed.
    }
  };

  /** Whether you are out in her. */
  let out = false;
  let toldOut = false;
  let goingHome = false; // the weather has turned, and you have been told
  /** Out in the boat: how far your head is turned to the right, and tipped up, toward where the pointer is. */
  const gaze = { yaw: 0, pitch: 0 };
  /** And how far it has gone over with her: a little, and late (see HEAD-LEVEL). */
  const head = { pitch: 0, roll: 0 };
  let seenFrom: V3 = [0, 0, 0]; // where your eyes are, for lighting the side of each face you can see
  /** Whether the weather lets her out (it takes a clear easing to let her out again once it has not). */
  let fair = true;
  let why = '';
  /** How far she has been hauled up the beach and turned over: 0 at her mooring, 1 keel up on the shingle. */
  let hauled = 0;
  let knownWeather = false;
  /** Her motion on the water: where her middle stands, her pitch and her roll, each eased so that she has weight. */
  const ride = { y: 0, pitch: 0, roll: 0, vy: 0, vPitch: 0, vRoll: 0, set: false };
  /** Where she is drawn just now. */
  let boatFrame: Frame = frameOf([0, 0, 0], 0, 0, 0);
  let boatBox: V3[] = [];
  let boatSeen = false;

  // The line.
  type Line = 'in' | 'flying' | 'waiting' | 'nibble' | 'taken' | 'hauling';
  let line: Line = 'in';
  let lineT = 0; // seconds in this state
  let waitFor = 0; // seconds until something comes to the bait
  let nibbles = 0; // nibbles still to come before it is taken
  let target: [number, number] = [0, 0]; // where the float lies (x, z)
  let hooked: Kind = 'cod';
  let hookedSize = 1;
  let rings: { x: number; z: number; at: number; size: number }[] = [];
  let floatAt: V3 = [0, 0, 0];
  let rodTip: V3 = [0, 0, 0];

  // At the fire.
  let rackUp = fish.length > 0;
  let wasMeadow = false;
  let eating: { fish: Fish; from: Frame; t: number } | null = null;
  let sinceKept = 0;
  let racked: { fish: Fish; box: V3[] }[] = [];
  let spitBox: V3[] = [];

  const aboard = () => fish.filter((f) => f.where === 'boat');

  /** Whether the weather lets a small boat out, and if not, why not. */
  function weather(a: FishingAround): void {
    const wind = fair ? 0.4 : 0.33;
    const sea = fair ? 0.62 : 0.52;
    const thunder = fair ? 0.2 : 0.1;
    const fog = fair ? 0.72 : 0.6;
    if (a.thunder > thunder) (fair = false), (why = 'not in thunder · she stays ashore');
    else if (a.wind > wind) (fair = false), (why = 'too much wind for a small boat · she stays ashore');
    else if (a.sea > sea) (fair = false), (why = 'too much sea running · she stays ashore');
    else if (a.fog > fog) (fair = false), (why = 'too thick to find the way home · she stays ashore');
    else fair = true;
  }

  /** How long until something comes to the bait: fish feed at the turn of the light and under cloud, and sulk at noon. */
  function nextWait(a: FishingAround): number {
    const dusk = Math.min(Math.abs(a.hour - 6.5), Math.abs(a.hour - 19)) < 2.2 ? 0.6 : 1;
    const noon = a.dark < 0.2 && Math.abs(a.hour - 13) < 2.5 ? 1.25 : 1;
    return (7 + Math.random() * 16) * dusk * noon * (a.rain > 0.2 ? 0.85 : 1);
  }
  function whatBites(): void {
    const month = new Date().getMonth();
    const summer = month >= 5 && month <= 8;
    const roll = Math.random();
    hooked = summer && roll < 0.3 ? 'mackerel' : roll < 0.55 ? 'saithe' : roll < 0.82 ? 'cod' : 'haddock';
    hookedSize = 0.82 + Math.random() * Math.random() * 0.5;
  }
  const ring = (x: number, z: number, size: number, now: number) => {
    rings.push({ x, z, at: now, size });
    if (rings.length > 4) rings.shift();
  };

  /** Draw a shape of plain faces, set in its frame, lit from where the light is. (For the rod and the float.) */
  function draw(into: KiteDrawn, s: Shape, f: Frame, light: V3): void {
    const n = s.self.length;
    for (let i = 0; i < n; i++) {
      const a = place(f, [s.corners[i * 9], s.corners[i * 9 + 1], s.corners[i * 9 + 2]]);
      const b = place(f, [s.corners[i * 9 + 3], s.corners[i * 9 + 4], s.corners[i * 9 + 5]]);
      const c = place(f, [s.corners[i * 9 + 6], s.corners[i * 9 + 7], s.corners[i * 9 + 8]]);
      // Each face takes the light by the way it looks. (It can be seen from either side: it is lit as the side you are looking at.)
      let nrm = unit(cross(sub(b, a), sub(c, a)));
      if (dot(nrm, sub(seenFrom, a)) < 0) nrm = [-nrm[0], -nrm[1], -nrm[2]];
      const k = 0.68 + 0.36 * Math.max(0, dot(nrm, light)) + 0.1 * Math.max(0, nrm[1]);
      const r = s.colours[i * 3] * k;
      const g = s.colours[i * 3 + 1] * k;
      const bl = s.colours[i * 3 + 2] * k;
      into.tris.push(a[0], a[1], a[2], r, g, bl, b[0], b[1], b[2], r, g, bl, c[0], c[1], c[2], r, g, bl);
    }
  }
  /** The corners of a box round a frame's thing, for telling whether the pointer is on it. */
  const boxRound = (f: Frame, lo: V3, hi: V3): V3[] => {
    const cornersOf: V3[] = [];
    for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) cornersOf.push(place(f, [x, y, z]));
    return cornersOf;
  };

  return {
    /** The fish there are, and where each is (for testing). */
    list: () => fish.map((f) => ({ ...f })),
    isOut: () => out,
    fair: () => fair,
    /** Where she is, and where the rack by the fire stands (for a few words to hang over each). */
    boatAt: (): V3 => boatFrame.at,
    rackAt: (): V3 => rackPlace().mid,
    hauled: () => hauled,
    line: () => line,
    /** For testing: put a fish on the rack; make whatever is at the bait take it now; cook what is on the fire through. */
    give(kind: Kind = 'cod'): void {
      if (fish.length >= MOST) return;
      fish.push({ kind, size: 1, at: Date.now(), where: out ? 'boat' : 'rack', cooked: 0 });
      rackUp = true;
      keep();
    },
    bite(): void {
      if (line === 'waiting') (waitFor = 0), (nibbles = 0);
    },
    floatOnPage: () => floatAt,
    clear(): void {
      fish = [];
      keep();
    },

    /** You have gone out in her, or come home. */
    setOut(on: boolean): void {
      out = on;
      goingHome = false;
      gaze.yaw = gaze.pitch = 0;
      head.pitch = head.roll = 0;
      line = 'in';
      lineT = 0;
      ride.set = false;
      if (on) {
        if (!toldOut) say('out on the bay · the water takes your line · the boat takes you home');
        toldOut = true;
      } else {
        // What was caught comes ashore with you, and up to the fire.
        const landed = aboard();
        for (const f of landed) f.where = 'rack';
        if (landed.length) {
          rackUp = true;
          say(`${COUNT[landed.length] ?? landed.length} fish to take up to the fire`);
          keep();
        }
      }
    },

    /** A click on the beach: on her, if it is on her. Returns 'go' to row out, 'no' if it was on her but she stays, or null. */
    clickBeach(x: number, y: number): 'go' | 'no' | null {
      if (!boatSeen || !covers(boatBox, x, y)) return null;
      if (!fair || hauled > 0.05) {
        say(why || 'she stays ashore today');
        return 'no';
      }
      if (fish.length >= MOST) {
        say('there is fish enough at the fire already');
        return 'no';
      }
      return 'go';
    },
    /** Whether the pointer is on her, on the beach. */
    overBeach: (x: number, y: number) => boatSeen && covers(boatBox, x, y),

    /**
     * A click while you are out: on the water (and where), on the sky, or on anything else (which is her).
     * Returns true if the click asks to be rowed home.
     */
    clickAfloat(kind: 'sky' | 'sea' | 'other', spot: V3 | undefined, a: FishingAround, now: number): boolean {
      if (line === 'hauling' || line === 'flying') return false;
      if (line === 'taken') {
        // Struck in time: it is brought aboard.
        line = 'hauling';
        lineT = 0;
        ring(target[0], target[1], 0.7, now);
        return false;
      }
      if (line === 'nibble') {
        // Too soon: the bait is pulled away from it.
        say('too soon · it only had a taste');
        line = 'in';
        lineT = 0;
        return false;
      }
      if (kind === 'sea' && spot) {
        if (fish.length >= MOST) {
          say('the basket is full · the boat takes you home');
          return false;
        }
        // The line goes out to where you clicked: not under the boat, and not further than it can be thrown.
        const dx = spot[0] - SKIFF_SPOT[0];
        const dz = spot[2] - SKIFF_SPOT[1];
        const far = Math.hypot(dx, dz) || 1;
        // (And never quite where it was meant: a pace long or short, a little to one side.)
        const reach = clamp(far * (0.94 + 0.12 * Math.random()), 3.2, 15);
        const off = (Math.random() - 0.5) * 0.12;
        const ux = (dx / far) * Math.cos(off) - (dz / far) * Math.sin(off);
        const uz = (dx / far) * Math.sin(off) + (dz / far) * Math.cos(off);
        target = [SKIFF_SPOT[0] + ux * reach, SKIFF_SPOT[1] + uz * reach];
        line = 'flying';
        lineT = 0;
        waitFor = nextWait(a);
        nibbles = 1 + Math.floor(Math.random() * 3);
        return false;
      }
      if (kind === 'other') return true;
      return false;
    },

    /** A click in the meadow: on a fish, if it is on one. */
    clickMeadow(x: number, y: number, a: FishingAround): boolean {
      if (eating) return false;
      const onFire = fish.find((f) => f.where === 'fire');
      if (onFire && spitBox.length && covers(spitBox, x, y)) {
        if (onFire.cooked < 1) {
          say(a.flame + a.embers < 0.05 ? 'the fire is cold · it will not cook' : 'not done yet');
          return true;
        }
        const burnt = onFire.cooked > 2.3;
        eating = { fish: onFire, from: spitFrame(onFire), t: 0 };
        fish = fish.filter((f) => f !== onFire);
        keep();
        say(burnt ? `burnt black · the gulls can have it` : `${A(onFire.kind)}, eaten by the fire · ${fish.length ? `${COUNT[fish.length] ?? fish.length} left` : 'none left'}`);
        return true;
      }
      for (const r of racked) {
        if (!covers(r.box, x, y)) continue;
        if (onFire) say('one at a time · there is a fish over the fire already');
        else if (a.flame + a.embers < 0.05) say('the fire is cold · light it, and the fish will cook');
        else {
          r.fish.where = 'fire';
          keep();
          say(`${A(r.fish.kind)} on the spit`);
        }
        return true;
      }
      return false;
    },
    /** Whether the pointer is on a fish in the meadow. */
    overMeadow: (x: number, y: number) => (spitBox.length > 0 && covers(spitBox, x, y)) || racked.some((r) => covers(r.box, x, y)),

    /** Rings on the water where the float has gone in, or a fish has broken the surface: laid into the list the sea draws from. */
    ripples(list: number[], now: number): void {
      rings = rings.filter((r) => now - r.at < 2600);
      for (const r of rings) {
        let slot = 0;
        while (slot < 8 && list[slot * 4 + 2] < 1 && list[slot * 4 + 3] > 0) slot++;
        if (slot >= 8) break;
        while (list.length < slot * 4) list.push(0, 0, 1, 0);
        list.splice(slot * 4, 4, r.x, r.z, (now - r.at) / 2600, r.size);
      }
    },

    /** Called every frame: moves everything on, and says where your eyes are if you are out. */
    update(dt: number, now: number, a: FishingAround): FishingNow {
      weather(a);
      // What is already so when the page opens is simply so; after that she is hauled up, or run down again, over a few seconds.
      if (!knownWeather) {
        knownWeather = true;
        hauled = fair ? 0 : 1;
      }
      hauled += clamp((fair ? 0 : 1) - hauled, -dt / 7, dt / 7);
      let lively = hauled > 0 && hauled < 1;
      let home = false;
      if (out && !fair) {
        if (!goingHome) say('the weather is turning · rowing home');
        goingHome = true;
        home = true;
      }

      // Where she is, and how the water has her.
      const afloatAt = (cx: number, cz: number, heading: number, level: (x: number, z: number) => number, keelOn: ((x: number, z: number) => number) | null) => {
        const f: V3 = [Math.sin(heading), 0, -Math.cos(heading)];
        const r: V3 = [Math.cos(heading), 0, Math.sin(heading)];
        // The water under her bow, her stern and either side; where it is too shallow she sits on the bottom there.
        const at = (along: number, across: number) => {
          const x = cx + f[0] * along + r[0] * across;
          const z = cz + f[2] * along + r[2] * across;
          const water = level(x, z);
          return keelOn ? Math.max(water, keelOn(x, z) + 0.2) : water;
        };
        const bow = at(1.9, 0);
        const stern = at(-1.9, 0);
        const starboard = at(0, 0.6);
        const port = at(0, -0.6);
        const mid = at(0, 0);
        const y = (bow + stern + starboard + port + 2 * mid) / 6;
        const pitch = Math.atan2(bow - stern, 3.8);
        const roll = Math.atan2(starboard - port, 1.2);
        // She has weight. She does not follow the water exactly: she is pushed toward where it would have her,
        // overshoots a little and comes back, like anything afloat; and she rolls most easily of all, in her
        // own time (about two seconds from side to side), so a sea that comes at that pace sets her rocking.
        if (!ride.set) {
          ride.y = y;
          ride.pitch = pitch;
          ride.roll = roll;
          ride.vy = ride.vPitch = ride.vRoll = 0;
          ride.set = true;
        }
        const step = Math.min(dt, 0.05);
        for (let left = dt; left > 1e-4; left -= step) {
          const h = Math.min(step, left);
          ride.vy += ((y - ride.y) * 30 - ride.vy * 6.5) * h;
          ride.y += ride.vy * h;
          ride.vPitch += ((pitch - ride.pitch) * 22 - ride.vPitch * 4.6) * h;
          ride.pitch += ride.vPitch * h;
          ride.vRoll += ((roll * 1.25 - ride.roll) * 10.5 - ride.vRoll * 2.1) * h;
          ride.roll += ride.vRoll * h;
        }
        ride.pitch = clamp(ride.pitch, -0.2, 0.2);
        ride.roll = clamp(ride.roll, -0.3, 0.3);
      };

      let eye: V3 = [0, 0, 0];
      let tilt: [number, number, number] = [0, 0, 0];
      let boat: Frame | null = null;
      let wet = false;
      // (Out on the bay there is always some swell running, however still the day.)
      const swell = Math.max(0.34, a.sea);
      boatSeen = false;
      seenFrom = a.eye;
      if (out) {
        afloatAt(SKIFF_SPOT[0], SKIFF_SPOT[1], FACING, (x, z) => a.tide + swellAt(x, z, a.waves, swell).rise, null);
        boatFrame = frameOf([SKIFF_SPOT[0], ride.y, SKIFF_SPOT[1]], FACING, ride.pitch, ride.roll);
        // HEAD-LEVEL: you sit on her after thwart and go where she goes, up and down with every swell; but
        // your eyes are not pinned to her. Your back takes up her pitching and rolling as anybody's does in
        // a boat, so your head stays upright over the seat and the horizon stays nearly level, while she
        // lifts her bow, drops it and leans under and around you. Only a little of her motion gets as far
        // as your head, and that a moment late.
        const seat = place(boatFrame, [0, 0.27, -1.25]);
        const settle = 1 - Math.exp(-dt * 1.7);
        head.pitch += (ride.pitch * 0.1 - head.pitch) * settle;
        head.roll += (ride.roll * 0.2 - head.roll) * settle;
        eye = [seat[0] + boatFrame.y[0] * 0.14, seat[1] + 0.75, seat[2] + boatFrame.y[2] * 0.14];
        // And you can look about you: toward either side of the window you turn your head that way (a good
        // way round, at its edge), and a little up or down. In the middle of it you look ahead, over her bow.
        const edge = (v: number, from: number) => Math.sign(v) * smooth(from, 1, Math.abs(v));
        const turning = 1 - Math.exp(-dt * 2.6);
        gaze.yaw += (edge(a.look[0], 0.28) * 0.66 - gaze.yaw) * turning;
        gaze.pitch += (edge(a.look[1], 0.4) * 0.13 - gaze.pitch) * turning;
        // (Turned, her pitch and roll come to you crossed: looking abeam, it is her roll that lifts and drops the horizon.)
        const cy = Math.cos(gaze.yaw);
        const sy = Math.sin(gaze.yaw);
        tilt = [head.pitch * cy + head.roll * sy + gaze.pitch, head.roll * cy - head.pitch * sy, gaze.yaw];
        seenFrom = eye;
        boat = boatFrame;
        wet = true;
        lively = true;
      } else if (a.ashore) {
        const edge = BEACH.toWater - a.tide / BEACH.slope;
        const moor = beachXZ(11.2, 3.2);
        const up = beachXZ(3.9, -2.9);
        const h = smooth(0, 1, hauled);
        const mooredHeading = FACING - 0.5;
        const hauledHeading = FACING - 0.5;
        if (hauled < 1) afloatAt(moor[0], moor[1], mooredHeading, (x, z) => a.tide + surfRise(x, z, a.surf, a.sea, edge, a.combers), (x, z) => land(x, z));
        const ground = land(up[0], up[1]);
        // Hauled up, she lies on her gunwales, keel to the sky, bow toward the sea.
        // (Keel up, she rests on the tops of her stem and stern posts, her gunwale clear of the stones amidships.)
        const at: V3 = [lerp(moor[0], up[0], h), lerp(ride.y, ground + 0.96, h) + 0.4 * Math.sin(Math.PI * h), lerp(moor[1], up[1], h)];
        boatFrame = frameOf(at, lerp(mooredHeading, hauledHeading, h), lerp(ride.pitch, -0.11, h), lerp(ride.roll, Math.PI, h));
        boatBox = boxRound(boatFrame, [-0.8, -0.25, -HALF], [0.8, 0.75, HALF]);
        boatSeen = true;
        boat = boatFrame;
        wet = hauled < 0.5;
        lively = lively || wet;
      }

      // The line.
      lineT += dt;
      if (out) {
        if (line === 'flying' && lineT > 0.75) {
          line = 'waiting';
          lineT = 0;
          ring(target[0], target[1], 0.45, now);
        } else if (line === 'waiting' && lineT > waitFor) {
          if (nibbles > 0) {
            nibbles--;
            line = 'nibble';
            lineT = 0;
            ring(target[0], target[1], 0.22, now);
          } else {
            whatBites();
            line = 'taken';
            lineT = 0;
            ring(target[0], target[1], 0.55, now);
          }
        } else if (line === 'nibble' && lineT > 0.45) {
          line = 'waiting';
          lineT = 0;
          waitFor = 0.5 + Math.random() * 1.4;
        } else if (line === 'taken' && lineT > 1.7) {
          // It was not struck: it has the bait, and is gone. The float comes up; something else will find the hook.
          line = 'waiting';
          lineT = 0;
          waitFor = nextWait(a);
          nibbles = 1 + Math.floor(Math.random() * 3);
          ring(target[0], target[1], 0.3, now);
        } else if (line === 'hauling' && lineT > 1.7) {
          fish.push({ kind: hooked, size: hookedSize, at: Date.now(), where: 'boat', cooked: 0 });
          keep();
          const n = aboard().length;
          say(`${A(hooked)} · ${COUNT[n] ?? n} in the basket`);
          line = 'in';
          lineT = 0;
        }
      }

      // The fire: what is on the spit cooks while there is heat under it.
      const onFire = fish.find((f) => f.where === 'fire');
      if (onFire) {
        const heat = Math.min(1.1, a.flame) + 0.45 * a.embers;
        if (heat > 0.02) {
          const before = onFire.cooked;
          onFire.cooked += (dt * heat) / 85;
          if (before < 1 && onFire.cooked >= 1) say(`the ${onFire.kind} is done · click it to eat`);
          sinceKept += dt;
          if (sinceKept > 6) {
            sinceKept = 0;
            keep();
          }
          if (a.meadow) lively = lively || onFire.cooked < 1.05;
        }
      }
      if (eating) {
        eating.t += dt / 1.3;
        lively = true;
        if (eating.t >= 1) eating = null;
      }
      // (The rack is put up when there is fish for it, and taken down, when it is empty, while you are away.)
      if (fish.some((f) => f.where !== 'boat')) rackUp = true;
      else if (a.meadow && !wasMeadow && !eating) rackUp = false;
      wasMeadow = a.meadow;

      return { eye, tilt, boat, wet, lamp: a.dark > 0.35 && hauled < 0.5 ? Math.min(1, (a.dark - 0.35) * 3) : 0, swell, lively, home };
    },

    /**
     * Put what is to be seen of it into this frame's picture: the slight things as plain corners, and (given
     * back) where each fish, the rack and the spit are, for the picture to draw them itself.
     */
    draw(into: KiteDrawn, a: FishingAround, now: number): CatchThing[] {
      const light = unit(a.light);
      const things: CatchThing[] = [];
      const fishAt = (f: { kind: Kind; cooked: number }, frame: Frame, aboardHer: boolean) => things.push({ mesh: f.kind, at: frame.at, x: frame.x, y: frame.y, z: frame.z, cooked: f.cooked, aboard: aboardHer });
      const scaled = (at: V3, x: V3, y: V3, z: V3, k: number): Frame => ({ at, x: [x[0] * k, x[1] * k, x[2] * k], y: [y[0] * k, y[1] * k, y[2] * k], z: [z[0] * k, z[1] * k, z[2] * k] });
      if (out || (a.ashore && boatSeen)) {
        // At her mooring: a line from her bow down to her anchor stone, and one from her stern to the beach.
        if (!out && hauled < 0.5) {
          const bow = place(boatFrame, [0, sheerAt(1) + 0.1, HALF + 0.1]);
          const stone = place(boatFrame, [0, -0.6, HALF + 2.4]);
          const stern = place(boatFrame, [0, sheerAt(-1) + 0.1, -HALF - 0.1]);
          const stake = beachXZ(6.0, 4.6);
          const ROPE: V3 = [0.7, 0.64, 0.48];
          const rope = (p: V3, q: V3, sag: number) => {
            let last = p;
            for (let i = 1; i <= 6; i++) {
              const t = i / 6;
              const at = lerp3(p, q, t);
              at[1] -= sag * Math.sin(Math.PI * t);
              into.lines.push(...last, ...ROPE, ...at, ...ROPE);
              last = at;
            }
          };
          rope(bow, [stone[0], Math.min(stone[1], a.tide - 0.05), stone[2]], 0.1);
          rope(stern, [stake[0], land(stake[0], stake[1]) + 0.3, stake[1]], 0.35);
        }
        // Her lantern hangs from the crook on her stem: plumb, whatever way she lies, and swung a little by her motion.
        if (hauled < 0.3) {
          const swingX = clamp(-ride.vRoll * 0.16, -0.3, 0.3);
          const swingZ = clamp(-ride.vPitch * 0.16, -0.3, 0.3);
          const flat = (v: V3): V3 => unit([v[0], 0, v[2]]);
          const bx = flat(boatFrame.x);
          const bz = flat(boatFrame.z);
          const up = unit([bx[0] * swingX + bz[0] * swingZ, 1, bx[2] * swingX + bz[2] * swingZ]);
          const lx = unit(sub(bx, [up[0] * dot(bx, up), up[1] * dot(bx, up), up[2] * dot(bx, up)]));
          const lz = cross(lx, up);
          things.push({ mesh: 'lantern', ...scaled(place(boatFrame, LANTERN_HOOK), lx, up, lz, LANTERN_BIG), cooked: 0, aboard: true });
        }
        // The catch, in her basket: each lying on its side, across the others.
        aboard().forEach((f, i) => {
          const len = FISH[f.kind].long * f.size * 1.15;
          const turn = 0.25 + (i % 2 ? -0.5 : 0.35) + i * 0.13;
          const at = place(boatFrame, [-0.32 + 0.05 * Math.sin(i * 2.3), 0.0 + 0.05 * i, 0.73 + 0.06 * Math.cos(i * 1.7)]);
          const zf = unit(add(add([0, 0, 0], boatFrame.z, Math.cos(turn)), boatFrame.x, Math.sin(turn) * 0.9));
          const yf = unit(cross(zf, boatFrame.y));
          const xf = cross(yf, zf);
          fishAt(f, scaled(at, xf, yf, zf, len), true);
        });
      }

      if (out) {
        // The rod: held low by your right hand, its tip out over the water toward the float.
        // (It is a slight thing, a hazel wand; and it is held on the side the float lies, so that it does not cross your view.)
        const waterAt = (x: number, z: number) => a.tide + swellAt(x, z, a.waves, Math.max(0.34, a.sea)).rise;
        const toFloat: V3 = [target[0] - SKIFF_SPOT[0], 0, target[1] - SKIFF_SPOT[1]];
        const leftward = line !== 'in' && dot(toFloat, RIGHT) < 0;
        const hand = place(boatFrame, [leftward ? -0.4 : 0.4, 0.46, -0.7]);
        let aim: V3;
        if (line === 'in') aim = unit(add(add([0, 0, 0], AHEAD, 0.75), RIGHT, 0.66));
        else aim = unit([target[0] - hand[0], 0, target[1] - hand[2]]);
        const lift = line === 'taken' ? 0.18 : line === 'hauling' ? 0.8 : 0.42;
        const LONG = 1.7;
        rodTip = add(add(hand, aim, LONG * Math.cos(lift)), [0, 1, 0], LONG * Math.sin(lift));
        // (It bends to a fish.)
        if (line === 'taken') rodTip[1] -= 0.14 + 0.04 * Math.sin(now / 45);
        const rod = shape();
        timber(rod, [0, 0, 0], [0, 0, 0.45], 0.024, 0.024, [0.5, 0.4, 0.22]);
        timber(rod, [0, 0, 0.45], [0, 0, 1], 0.014, 0.014, [0.58, 0.47, 0.26]);
        const along = sub(rodTip, hand);
        const rside = unit(cross(along, [0, 1, 0]));
        const rup = unit(cross(rside, along));
        draw(into, rod, { at: hand, x: rside, y: rup, z: along }, light);

        // The float, and what it is doing.
        const surface = waterAt(target[0], target[1]);
        let at: V3 = [target[0], surface + 0.02, target[1]];
        let showFish = 0;
        if (line === 'in') at = add(rodTip, [0, -0.7 + 0.03 * Math.sin(now / 420), 0]);
        else if (line === 'flying') {
          const t = clamp(lineT / 0.75);
          at = lerp3(rodTip, [target[0], surface, target[1]], t);
          at[1] += 2.2 * Math.sin(Math.PI * t) * (1 - 0.3 * t);
        } else if (line === 'nibble') at[1] -= 0.06 * Math.sin((lineT / 0.45) * Math.PI);
        else if (line === 'taken') {
          at[1] -= 0.15 + 0.02 * Math.sin(now / 38);
          at[0] += 0.03 * Math.sin(now / 61);
        } else if (line === 'hauling') {
          // In it comes: up out of the water, over the gunwale, and into the basket.
          const t = clamp(lineT / 1.7);
          const over = place(boatFrame, [0.7, 1.1, 0.4]);
          const basket = place(boatFrame, [-0.3, 0.25, 0.7]);
          const p0: V3 = [target[0], surface - 0.2, target[1]];
          at = t < 0.6 ? lerp3(p0, over, smooth(0, 0.6, t)) : lerp3(over, basket, smooth(0.6, 1, t));
          if (t < 0.6) at[1] += 0.5 * Math.sin((Math.PI * t) / 0.6);
          showFish = 1;
        }
        floatAt = at;
        if (showFish) {
          // The fish on the hook, hanging head up from the line, twisting.
          const len = FISH[hooked].long * hookedSize * 1.15;
          const twist = Math.sin(now / 90) * 0.5;
          const zf: V3 = [0, 1, 0];
          const xf: V3 = [Math.cos(twist) * AHEAD[0] + Math.sin(twist) * RIGHT[0], 0, Math.cos(twist) * AHEAD[2] + Math.sin(twist) * RIGHT[2]];
          const yf = cross(zf, xf);
          fishAt({ kind: hooked, cooked: 0 }, scaled(add(at, [0, -len * 0.5, 0]), xf, yf, zf, len), true);
        } else {
          draw(into, FLOAT, { at, x: [1.5, 0, 0], y: [0, 1.5, 0], z: [0, 0, 1.5] }, light);
        }
        // The line, from the rod's tip to the float, hanging slack unless there is a fish on it.
        const LINE: V3 = [0.86, 0.86, 0.8];
        const slack = line === 'taken' || line === 'hauling' ? 0.02 : line === 'in' ? 0 : 0.5;
        let last = rodTip;
        for (let i = 1; i <= 8; i++) {
          const t = i / 8;
          const p = lerp3(rodTip, at, t);
          p[1] -= slack * Math.sin(Math.PI * t) * Math.min(1.2, Math.hypot(at[0] - rodTip[0], at[2] - rodTip[2]) / 6);
          if (line !== 'in' && line !== 'flying' && line !== 'hauling') p[1] = Math.max(p[1], waterAt(p[0], p[2]) + 0.01);
          into.lines.push(...last, ...LINE, ...p, ...LINE);
          last = p;
        }
      }

      // By the fire: the rack with what hangs on it, and the spit with what is cooking.
      racked = [];
      spitBox = [];
      if (a.meadow && (rackUp || eating)) {
        const unitFrame = { at: [0, 0, 0] as V3, x: [1, 0, 0] as V3, y: [0, 1, 0] as V3, z: [0, 0, 1] as V3 };
        things.push({ mesh: 'rack', ...unitFrame, cooked: 0, aboard: false });
        const rack = rackPlace();
        // The fish hang from the pole by their tails, a string to each; a breath of wind sets them turning.
        const hanging = fish.filter((f) => f.where === 'rack');
        hanging.forEach((f, i) => {
          const len = FISH[f.kind].long * f.size * FISH_BIG;
          const along = hanging.length === 1 ? 0 : -rack.span + (i / (hanging.length - 1)) * 2 * rack.span;
          const sway = 0.035 * Math.sin(now / 900 + i * 1.9) * (0.4 + a.wind * 3);
          const twist = (i % 2 ? -0.3 : 0.25) + 0.2 * Math.sin(now / 1500 + i * 2.7) * (0.3 + a.wind * 2);
          // (The pole bows a little under them.)
          const sag = 0.03 * Math.sin(Math.PI * (0.5 + along / 2.24));
          const top: V3 = [rack.mid[0] + RIGHT[0] * along, rack.high - 0.015 - sag, rack.mid[2] + RIGHT[2] * along];
          // Head down; its side to you, more or less.
          const zf = unit([RIGHT[0] * sway, -1, RIGHT[2] * sway]);
          const across: V3 = [RIGHT[0] * Math.cos(twist) + AHEAD[0] * Math.sin(twist), 0, RIGHT[2] * Math.cos(twist) + AHEAD[2] * Math.sin(twist)];
          const xf = unit(cross(across, zf));
          const yf = cross(zf, xf);
          const string = 0.11;
          const frame = scaled(add(top, zf, string + len * 0.57), xf, yf, zf, len);
          fishAt(f, frame, false);
          const STRING: V3 = [0.84, 0.78, 0.6];
          into.lines.push(...top, ...STRING, ...add(top, zf, string + len * 0.03), ...STRING);
          racked.push({ fish: f, box: boxRound(frame, [-0.09, -0.17, -0.58], [0.09, 0.2, 0.52]) });
        });
        const onFire = fish.find((f) => f.where === 'fire');
        if (onFire || eating) things.push({ mesh: 'spit', ...unitFrame, cooked: 0, aboard: false });
        if (onFire) {
          const frame = spitFrame(onFire);
          fishAt(onFire, frame, false);
          spitBox = boxRound(frame, [-0.11, -0.2, -0.6], [0.11, 0.22, 0.55]);
          // A thread of steam off it while it cooks: a few small pale flecks, rising.
          if (onFire.cooked > 0.08 && onFire.cooked < 1.7 && a.flame + a.embers > 0.05) {
            for (let i = 0; i < 4; i++) {
              const t = (now / 1900 + i / 4) % 1;
              const p = add(frame.at, [0.07 * Math.sin(t * 5 + i), 0.14 + 0.6 * t, 0]);
              const w = 0.022 + 0.035 * t;
              const pale = 0.6 * (1 - t);
              const c: V3 = [0.5 + 0.4 * pale, 0.5 + 0.4 * pale, 0.52 + 0.4 * pale];
              into.tris.push(p[0] - RIGHT[0] * w, p[1], p[2] - RIGHT[2] * w, ...c, p[0] + RIGHT[0] * w, p[1], p[2] + RIGHT[2] * w, ...c, p[0], p[1] + 2 * w, p[2], ...c);
            }
          }
        }
        if (eating) {
          // Eaten: it is lifted off the spit and comes toward you, and is gone.
          const t = smooth(0, 1, eating.t);
          const f = eating.from;
          const k = 1 - 0.75 * t;
          const at: V3 = [f.at[0] - AHEAD[0] * 1.6 * t, f.at[1] + 0.45 * Math.sin(Math.PI * t * 0.8), f.at[2] - AHEAD[2] * 1.6 * t];
          fishAt(eating.fish, { at, x: [f.x[0] * k, f.x[1] * k, f.x[2] * k], y: [f.y[0] * k, f.y[1] * k, f.y[2] * k], z: [f.z[0] * k, f.z[1] * k, f.z[2] * k] }, false);
        }
      }
      return things;
    },
  };

  /** Where a fish lies on the spit: run through on the stick, near its tip over the flames, its back uppermost. */
  function spitFrame(f: Fish): Frame {
    const { butt, tip } = spitPlace();
    const len = FISH[f.kind].long * f.size * FISH_BIG * 0.9;
    const zf = unit(sub(tip, butt));
    const side = unit(cross(zf, [0, 1, 0]));
    const yf = cross(side, zf);
    const xf = cross(yf, zf);
    const at = add(tip, zf, -len * 0.42);
    return { at, x: [xf[0] * len, xf[1] * len, xf[2] * len], y: [yf[0] * len, yf[1] * len, yf[2] * len], z: [zf[0] * len, zf[1] * len, zf[2] * len] };
  }
}
