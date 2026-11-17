// The sound of the place. Nothing is recorded and nothing is a synthesiser
// note: every sound is built up the way the real one is. Rain is thousands of
// separate drops. A fire is the wood itself letting go: runs of dry ticks, duller
// knocks under them, snaps, pops that throw a shower of sparks, and now and then
// a log settling; and under that, low and level, the roar of the flames
// themselves. Cicadas are many insects, each swelling and dying away;
// crickets rasp in twos and threes. Thunder follows lightning.
//
// (There was wind and the wash of the sea as well; they were taken out on
// request. In dry, mild weather with no fire lit, the place is silent.)
//
// These textures are worked out once, as long stretches of sound (so no short
// loop can be heard going round), when you first click; from then on they are
// mixed according to the real weather the picture is drawn from. Snow on the
// ground hushes everything.
//
// A browser will not let a page make a sound until you have clicked or pressed
// a key, so it begins at your first click. The M key silences it and brings it
// back; that choice is remembered. Each kind of sound can also be turned up or
// down by itself (the fire, the rain and thunder, the insects, the church bell),
// and that is remembered too.

import { makeBell } from './bell';

const KEY = 'nightpond.sound';
const LEVELS_KEY = 'nightpond.levels';

/** The sounds that can each be turned up or down by themselves. */
export type Sounding = 'fire' | 'weather' | 'insects' | 'bell';
/** How loud each may be, from nothing to a little more than it was made. */
export const LEVEL_WORDS = ['silent', 'faint', 'soft', 'plain', 'loud'];
const LEVEL_GAINS = [0, 0.2, 0.45, 1, 2];
const PLAIN = 3;
type Mix = Record<Sounding, number>;
const EVEN: Mix = { fire: 1, weather: 1, insects: 1, bell: 1 };

/** What the air is doing, each 0..1. */
export interface Air {
  rain: number;
  /** How deep the snow lies (0 none, 1 well covered): it muffles everything. */
  snow: number;
  fog: number;
  /** The campfire: its flames, and its embers. */
  flame: number;
  embers: number;
  /** Music playing on the gramophone: the place quietens under it. */
  music: number;
  /** In the room of the house, with its walls between you and the meadow: 0 out of doors, 1 indoors. */
  indoors: number;
  /** AFAR: how far you are from the meadow: 0 in it, 1 down on the beach below it, 2 out on the bay in the boat. */
  afar: number;
  /** A hot day: cicadas. */
  heat: number;
  /** A warm, dry night: crickets. */
  crickets: number;
}

const STILL: Air = { rain: 0, snow: 0, fog: 0, flame: 0, embers: 0, music: 0, indoors: 0, afar: 0, heat: 0, crickets: 0 };

// ---- raw material: plain arithmetic on rows of samples ------------------------------

type Wave = Float32Array;
const TAU = Math.PI * 2;
const rand = Math.random;

function white(n: number): Wave {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = rand() * 2 - 1;
  return x;
}

/** Hiss with as much energy in every octave: the colour of rain, wind and surf. */
function pink(n: number): Wave {
  const x = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = rand() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    x[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return x;
}

/** Deeper still: a rumble. */
function brown(n: number): Wave {
  const x = new Float32Array(n);
  let b = 0;
  for (let i = 0; i < n; i++) {
    b = (b + 0.02 * (rand() * 2 - 1)) / 1.02;
    x[i] = b * 3.5;
  }
  return x;
}

/** Take the top off a sound, above `hz`. (In place.) */
function lowpass(x: Wave, hz: number, rate: number): Wave {
  const a = 1 - Math.exp((-TAU * hz) / rate);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y += a * (x[i] - y);
    x[i] = y;
  }
  return x;
}

/** Take the bottom off it, below `hz`. (In place.) */
function highpass(x: Wave, hz: number, rate: number): Wave {
  const a = 1 - Math.exp((-TAU * hz) / rate);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y += a * (x[i] - y);
    x[i] -= y;
  }
  return x;
}

/** Keep a band round `hz`: the higher `q`, the narrower. (In place.) */
function bandpass(x: Wave, hz: number, q: number, rate: number): Wave {
  const w = (TAU * Math.min(hz, rate * 0.45)) / rate;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const a1 = (-2 * Math.cos(w)) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const y = b0 * (v - x2) - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = v;
    y2 = y1;
    y1 = y;
    x[i] = y;
  }
  return x;
}

function loudest(x: Wave): number {
  let p = 0;
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
  return p;
}

function scaleTo(x: Wave, peak: number): Wave {
  const k = peak / (loudest(x) || 1);
  for (let i = 0; i < x.length; i++) x[i] *= k;
  return x;
}

/** A slow, wandering quantity between about -1 and 1, for things that come and go. */
function wander(n: number, hz: number, rate: number): Wave {
  const x = lowpass(lowpass(white(n), hz, rate), hz, rate);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += x[i] * x[i];
  const k = 1 / (Math.sqrt(sum / n) * 1.6 || 1);
  for (let i = 0; i < n; i++) x[i] = Math.tanh(x[i] * k);
  return x;
}

/** What one small event is made of: how loud it is, how long it rings, the band it is coloured by; and, for a larger one, the soft knock under it. */
interface Grain {
  loud: number;
  lasts: number;
  hz: number;
  q: number;
  thump?: number;
  /** How deep that knock is and how long it rings (a dull one at 160 Hz for three hundredths of a second, unless said). */
  thumpHz?: number;
  thumpLasts?: number;
}

/**
 * One tiny event (a drop, a snap) laid into a stretch of sound at sample `at`:
 * a few thousandths of a second of hiss, dying away, coloured by its own filter.
 */
function grainAt(out: Wave[], rate: number, at: number, s: Grain, pan = out.length > 1 ? rand() : 0): void {
  const n = out[0].length;
  const len = Math.min(n, Math.ceil(rate * (s.lasts * 7 + 0.004)));
  const grain = new Float32Array(len);
  const fall = Math.exp(-1 / (s.lasts * rate));
  let env = 1;
  for (let i = 0; i < len; i++) {
    grain[i] = (rand() * 2 - 1) * env;
    env *= fall;
  }
  bandpass(grain, s.hz, s.q, rate);
  const gains = out.length > 1 ? [Math.cos((pan * Math.PI) / 2), Math.sin((pan * Math.PI) / 2)] : [1];
  for (let c = 0; c < out.length; c++) {
    const dst = out[c];
    const g = s.loud * gains[c] * 2.2;
    for (let i = 0; i < len; i++) dst[(at + i) % n] += grain[i] * g;
  }
  // A bigger snap has a body to it: a soft knock underneath.
  if (s.thump) {
    const lasts = s.thumpLasts ?? 0.03;
    const tl = Math.ceil(rate * lasts * 4);
    let lp = 0;
    const a = 1 - Math.exp((-TAU * (s.thumpHz ?? 160)) / rate);
    for (let i = 0; i < tl; i++) {
      lp += a * ((rand() * 2 - 1) - lp);
      const v = lp * Math.exp(-i / (rate * lasts)) * s.thump * 4;
      for (let c = 0; c < out.length; c++) out[c][(at + i) % n] += v * gains[c];
    }
  }
}

/**
 * A scatter of such events: `count` of them. `shape` says how loud, how long
 * and how pitched each one is; `when` (if given) where in the stretch each falls.
 */
function scatter(out: Wave[], rate: number, count: number, shape: () => Grain, when?: () => number): void {
  const n = out[0].length;
  for (let e = 0; e < count; e++) {
    const s = shape();
    grainAt(out, rate, Math.floor((when ? when() : rand()) * n) % n, s);
  }
}

// ---- the textures -------------------------------------------------------------

/**
 * A wood fire's crackle, made of what the wood does and nothing else. (The
 * flames have their own low roar, kept apart from this: see makeRoar.)
 *
 * What gives it body is the wood: under the dry ticks there are duller,
 * longer knocks, a few hundred cycles a second, as a log makes when it is
 * tapped; a pop has a thud under it and throws sparks, a quick shower of the
 * smallest ticks thinning out; and every so often a log settles, with a low
 * soft thump, a scuff, and more sparks. The ticks come in short runs with gaps
 * between, as a seam of wood lets go, and not as an even patter. It all sits
 * in one place, in front of you. Last, its sharpest peaks are rounded off, so
 * that no single snap leaps out of the rest.
 */
function makeFire(rate: number, seconds: number): Wave[] {
  const n = Math.floor(rate * seconds);
  const out: Wave[] = [new Float32Array(n), new Float32Array(n)];
  const at = (t: number) => Math.floor(((t % seconds) + seconds) % seconds * rate) % n;
  const place = (about = 0.5, spread = 0.5) => Math.max(0, Math.min(1, about + (rand() - 0.5) * spread));

  // The fine crackle: small dry ticks, in runs of a few close together.
  for (let t = 0; t < seconds; ) {
    t += -Math.log(1 - rand()) / 6.5;
    const run = 1 + Math.floor(rand() ** 2 * 6);
    const pan = place();
    const bright = 1700 + rand() ** 1.5 * 4600;
    let when = t;
    for (let k = 0; k < run; k++) {
      grainAt(out, rate, at(when), { loud: 0.014 + 0.09 * rand() ** 3, lasts: 0.0004 + rand() * 0.0015, hz: bright * (0.8 + 0.4 * rand()), q: 0.7 + rand() * 1.1 }, pan);
      when += 0.004 + rand() ** 2 * 0.07;
    }
  }
  // The larger sounds gather a little, as they do when a log shifts; but only
  // a little, and slowly, so the fire is never heard to come and go.
  const busy = wander(n, 0.25, rate);
  const gathered = () => {
    for (;;) {
      const t = rand();
      if (rand() < 0.6 + 0.4 * Math.max(0, busy[Math.floor(t * n)])) return t;
    }
  };
  // The wood itself: duller knocks, lower and longer, under the crackle.
  scatter(out, rate, Math.floor(seconds * 5), () => ({ loud: 0.03 + 0.1 * rand() ** 2, lasts: 0.004 + rand() * 0.009, hz: 240 + rand() ** 1.5 * 720, q: 0.8 + rand() * 0.8 }), gathered);
  // Snaps: sharper and louder, each with a little of that knock in it.
  scatter(out, rate, Math.floor(seconds * 4.5), () => ({ loud: 0.05 + 0.17 * rand() ** 3, lasts: 0.0008 + rand() * 0.003, hz: 1100 + rand() ** 1.5 * 3400, q: 0.7 + rand() * 1.2, thump: 0.03 + 0.05 * rand(), thumpHz: 420, thumpLasts: 0.012 }), gathered);
  // The sparks a pop or a settling log throws: the smallest ticks, quick at first and thinning out.
  const sparks = (t: number, count: number, pan: number) => {
    let when = t + 0.008;
    for (let k = 0; k < count; k++) {
      when += (0.006 + rand() * 0.045) * (1 + k * 0.22);
      grainAt(out, rate, at(when), { loud: (0.02 + 0.06 * rand()) * Math.exp(-k / (count * 0.6)), lasts: 0.0003 + rand() * 0.0008, hz: 3000 + rand() * 4200, q: 1 + rand() * 1.5 }, place(pan, 0.3));
    }
  };
  // Pops: a pocket of sap or steam going off, with a thud under it.
  const pops = Math.floor(seconds * 0.8);
  for (let e = 0; e < pops; e++) {
    const t = gathered() * seconds;
    const big = 0.2 + 0.3 * rand() ** 2;
    const pan = place();
    grainAt(out, rate, at(t), { loud: big, lasts: 0.003 + rand() * 0.007, hz: 480 + rand() * 1500, q: 0.7 + rand() * 0.8, thump: big * 0.45, thumpHz: 150, thumpLasts: 0.035 }, pan);
    sparks(t, 4 + Math.floor(rand() * 14 * (big / 0.35)), pan);
  }
  // A log settling: a low soft thump, the scuff of it shifting, and a larger shower.
  const settles = Math.max(1, Math.round(seconds / 11));
  for (let e = 0; e < settles; e++) {
    const t = ((e + 0.2 + 0.6 * rand()) / settles) * seconds;
    const pan = place(0.5, 0.3);
    grainAt(out, rate, at(t), { loud: 0.06, lasts: 0.012, hz: 230, q: 0.8, thump: 0.34, thumpHz: 95, thumpLasts: 0.07 }, pan);
    const scuffs = 6 + Math.floor(rand() * 7);
    for (let k = 0; k < scuffs; k++) grainAt(out, rate, at(t + 0.03 + rand() * 0.3), { loud: 0.05 + 0.09 * rand(), lasts: 0.005 + rand() * 0.012, hz: 210 + rand() * 520, q: 0.8 + rand() * 0.5 }, place(pan, 0.2));
    sparks(t + 0.05, 18 + Math.floor(rand() * 16), pan);
  }
  // Both ears keep their balance; and the tallest peaks are rounded over, the rest left as it is.
  const top = Math.max(loudest(out[0]), loudest(out[1])) || 1;
  const drive = 2.2;
  for (const ch of out) for (let i = 0; i < n; i++) ch[i] = (Math.tanh((ch[i] / top) * drive) / Math.tanh(drive)) * 0.7;
  return out;
}

/** How many samples a second the roar is worked out at: it has nothing in it high enough to need more. */
const ROAR_RATE = 8000;

/**
 * The roar of the flames under the crackle: the deep, soft rumble of air
 * burning, which is what makes a fire sound like a fire and not like twigs
 * breaking.
 *
 * (A rush of flame was tried three times before and taken out each time,
 * because it sounded like wind coming and going. Those had a hiss in them, a
 * slow swell, and gentle filters that let the middle of the sound through,
 * which are the three things wind is made of. This has none of them. It is
 * only low: most of it between one and three hundred cycles a second, falling
 * away steeply above. It never swells or sinks: its loudness is level over
 * any second you choose. What moves in it is quick, the flap of the flames a
 * few times a second, with everything slower than that taken out of the
 * flapping, so that it trembles but does not come and go.)
 */
function makeRoar(seconds: number): Wave[] {
  const rate = ROAR_RATE;
  const n = Math.floor(rate * seconds);
  const lap = Math.floor(rate * 1.5);
  const m = n + lap;
  const rms = (x: Wave) => {
    let sum = 0;
    for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
    return Math.sqrt(sum / x.length) || 1;
  };
  const even = (x: Wave) => {
    const k = 1 / rms(x);
    for (let i = 0; i < x.length; i++) x[i] *= k;
    return x;
  };
  /** Keep only what lies between `lo` and `hi`, and steeply. */
  const band = (x: Wave, lo: number, hi: number) => lowpass(lowpass(lowpass(highpass(highpass(x, lo, rate), lo, rate), hi, rate), hi, rate), hi, rate);
  // The burning air: a rumble, the same in both ears, with a little of its own in each for width.
  const shared = even(band(pink(m), 95, 330));
  // The flap of the flames: quick wavering only, three to a dozen times a second, never a slow drift.
  const flap = even(highpass(highpass(lowpass(lowpass(white(m), 11, rate), 11, rate), 3, rate), 3, rate));
  // And their lapping: a deeper shudder, as the fire draws.
  const lapping = band(even(bandpass(white(m), 50, 1.6, rate)), 40, 220);
  for (let i = 0; i < m; i++) lapping[i] = Math.tanh(lapping[i] * 2.5);
  even(band(lapping, 40, 220));
  const out: Wave[] = [];
  for (let c = 0; c < 2; c++) {
    const own = even(band(pink(m), 95, 330));
    const long = new Float32Array(m);
    for (let i = 0; i < m; i++) long[i] = (shared[i] + 0.4 * own[i]) * (0.6 + 0.32 * Math.tanh(1.1 * flap[i])) + 0.2 * lapping[i];
    // Its end is folded into its beginning, so that it goes round without a join.
    const ch = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (i < lap) {
        const w = (i / lap) * (Math.PI / 2);
        ch[i] = long[i] * Math.sin(w) + long[n + i] * Math.cos(w);
      } else ch[i] = long[i];
    }
    out.push(ch);
  }
  const k = 0.1 / Math.max(rms(out[0]), rms(out[1]));
  for (const ch of out) for (let i = 0; i < n; i++) ch[i] *= k;
  return out;
}

/** Light rain: single drops on grass and stone, with a soft hiss behind them. */
function makeLightRain(rate: number, seconds: number): Wave {
  const n = Math.floor(rate * seconds);
  const out = lowpass(highpass(pink(n), 1800, rate), 9000, rate);
  for (let i = 0; i < n; i++) out[i] *= 0.16;
  scatter([out], rate, Math.floor(seconds * 200), () => ({ loud: 0.015 + 0.2 * rand() ** 4, lasts: 0.0003 + rand() * 0.0012, hz: 2500 + rand() * 6500, q: 1 + rand() * 3 }));
  // Drops on the turf are duller: small thuds.
  scatter([out], rate, Math.floor(seconds * 55), () => ({ loud: 0.02 + 0.14 * rand() ** 3, lasts: 0.002 + rand() * 0.004, hz: 450 + rand() * 1100, q: 0.8 + rand() }));
  return scaleTo(out, 0.6);
}

/** Heavy rain: a roar with a grain to it, drumming on the roofs and the ground. */
function makeHeavyRain(rate: number, seconds: number): Wave {
  const n = Math.floor(rate * seconds);
  const out = lowpass(highpass(pink(n), 320, rate), 11000, rate);
  const grit = white(n);
  const drum = bandpass(brown(n), 260, 0.7, rate);
  const surge = wander(n, 0.3, rate);
  for (let i = 0; i < n; i++) {
    // Mostly quiet with sudden spikes, like so many drops landing: hiss with a crackle in it.
    const g = grit[i];
    out[i] = (out[i] * 0.6 + g * g * g * g * g * 0.5 + drum[i] * 0.35) * (1 + 0.14 * surge[i]);
  }
  scatter([out], rate, Math.floor(seconds * 900), () => ({ loud: 0.02 + 0.16 * rand() ** 4, lasts: 0.0003 + rand() * 0.001, hz: 1500 + rand() * 7000, q: 0.8 + rand() * 2 }));
  return scaleTo(out, 0.7);
}

/**
 * Cicadas in the heat. Each insect is a band of sizzle, rattling a couple of
 * hundred times a second, that swells over a few seconds, holds, and sinks
 * away; a dozen of them, near and far, overlap so that it never quite stops.
 */
function makeCicadas(rate: number, seconds: number): Wave {
  const n = Math.floor(rate * seconds);
  const out = new Float32Array(n);
  for (let k = 0; k < 13; k++) {
    const lasts = 7 + rand() * 9;
    const len = Math.floor(rate * lasts);
    const pitch = 4300 + rand() * 3600;
    const voice = bandpass(white(len), pitch, 5 + rand() * 6, rate);
    const upper = bandpass(white(len), pitch * (1.5 + rand() * 0.3), 7, rate);
    const rattle = 110 + rand() * 130; // times a second
    const drift = wander(len, 1.5, rate);
    const up = 2 + rand() * 3;
    const down = 1.5 + rand() * 2.5;
    const far = 0.25 + 0.75 * rand() ** 2; // most are some way off
    const at = Math.floor(rand() * n);
    let phase = rand() * TAU;
    for (let i = 0; i < len; i++) {
      const s = i / rate;
      const body = Math.min(1, s / up) ** 1.5 * Math.min(1, (lasts - s) / down) ** 1.2;
      phase += (TAU * rattle * (1 + 0.04 * drift[i])) / rate;
      // Each rattle is a sharp tick, not a smooth wave.
      const tick = Math.max(0, Math.sin(phase)) ** 3;
      out[(at + i) % n] += (voice[i] + upper[i] * 0.5) * (0.3 + 0.7 * tick) * body * far;
    }
  }
  return scaleTo(out, 0.6);
}

/**
 * Crickets on a warm night: each chirps in twos and threes, at its own pitch
 * and in its own time. A chirp is a rasp, not a pure note (it is a wing
 * dragged over a file), so each is cut from a narrow band of hiss.
 */
function makeCrickets(rate: number, seconds: number): Wave {
  const n = Math.floor(rate * seconds);
  const out = new Float32Array(n);
  for (let k = 0; k < 9; k++) {
    const pitch = 3900 + rand() * 1100;
    const rasp = bandpass(bandpass(white(n), pitch, 14, rate), pitch, 14, rate);
    scaleTo(rasp, 1);
    const every = 0.42 + rand() * 0.35; // seconds between chirps
    const far = 0.2 + 0.8 * rand() ** 2;
    let t = rand() * every;
    while (t < seconds) {
      // It falls silent for a while now and then.
      if (rand() < 0.05) t += 1 + rand() * 3;
      const pulses = 2 + Math.floor(rand() * 3);
      for (let p = 0; p < pulses; p++) {
        const start = Math.floor((t + p * (0.019 + rand() * 0.004)) * rate);
        const len = Math.floor(rate * (0.011 + rand() * 0.005));
        const loud = far * (0.6 + 0.4 * rand());
        for (let i = 0; i < len; i++) {
          const env = Math.sin((Math.PI * i) / len) ** 2;
          out[(start + i) % n] += rasp[(start + i) % n] * env * loud;
        }
      }
      t += every * (0.9 + 0.2 * rand());
    }
  }
  return scaleTo(lowpass(out, 7500, rate), 0.5);
}

/** Thunder for one strike: a crack if it was near, then a long roll with several swells in it, growing duller. */
function makeThunder(rate: number, near: number): Wave {
  const seconds = 9;
  const n = Math.floor(rate * seconds);
  const x = brown(n);
  const air = pink(n);
  // The roll: a handful of swells, each fainter and later than the last.
  const swells: [number, number, number, number][] = [[0, 1, 0.03 + (1 - near) * 0.25, 1.1]];
  const more = 3 + Math.floor(rand() * 4);
  for (let k = 0; k < more; k++) swells.push([0.3 + rand() * 4.2, 0.25 + 0.5 * rand(), 0.12 + rand() * 0.3, 0.9 + rand() * 1.8]);
  let low = 0;
  let low2 = 0;
  for (let i = 0; i < n; i++) {
    const s = i / rate;
    let env = 0;
    for (const [at, loud, attack, fall] of swells) {
      const d = s - at;
      if (d > 0) env += loud * (d < attack ? d / attack : Math.exp(-(d - attack) / fall));
    }
    // Close thunder has a tearing top to it; distance and time take that away.
    const cut = 90 + (300 + 1700 * near) * Math.exp(-s / 1.3);
    const a = 1 - Math.exp((-TAU * cut) / rate);
    low += a * (x[i] * 0.8 + air[i] * 0.6 * near - low);
    low2 += a * (low - low2);
    x[i] = low2 * env * Math.min(1, (seconds - s) / 1.5);
  }
  if (near > 0.55) {
    // The crack itself.
    const len = Math.floor(rate * 0.09);
    const snap = lowpass(white(len), 3500, rate);
    for (let i = 0; i < len; i++) x[i] += snap[i] * Math.exp(-i / (rate * 0.02)) * (near - 0.4) * 0.9;
  }
  return scaleTo(x, 0.35 + 0.5 * near);
}

/** All the long textures, for one sample rate. */
interface Bank {
  rate: number;
  fire: Wave[];
  /** The roar of the flames, which keeps its own slower count of samples (ROAR_RATE). */
  roar: Wave[];
  lightRain: Wave;
  heavyRain: Wave;
  cicadas: Wave;
  crickets: Wave;
}

const banks = new Map<number, Promise<Bank>>();
/** Work the textures out (once per sample rate), a piece at a time so the picture does not stall. */
function bankFor(rate: number): Promise<Bank> {
  let made = banks.get(rate);
  if (!made) {
    made = (async () => {
      const pause = () => new Promise<void>((done) => setTimeout(done, 0));
      const parts: Partial<Bank> = { rate };
      parts.fire = makeFire(rate, 31);
      await pause();
      parts.roar = makeRoar(23);
      await pause();
      parts.lightRain = makeLightRain(rate, 17);
      await pause();
      parts.heavyRain = makeHeavyRain(rate, 16);
      await pause();
      parts.cicadas = makeCicadas(rate, 26);
      await pause();
      parts.crickets = makeCrickets(rate, 13);
      return parts as Bank;
    })();
    banks.set(rate, made);
  }
  return made;
}

// ---- the mixing ------------------------------------------------------------------

/** How loud the fire's crackle is at full flame, before its own level is applied; and the roar under it. */
const FIRE_LOUD = 0.28;
const ROAR_LOUD = 0.16;

/** A sound whose loudness is set from the weather. */
interface Voice {
  level: GainNode;
}

/**
 * Everything wired into whichever kind of audio context it is given: a live
 * one to be heard, or an offline one so that it can be measured in silence.
 */
class Voices {
  private master: GainNode;
  private hush: BiquadFilterNode;
  private lightRain: Voice;
  private heavyRain: Voice;
  private fire: Voice;
  private roar: Voice;
  private embers: Voice;
  private cicadas: Voice;
  private crickets: Voice;

  constructor(
    private ctx: BaseAudioContext,
    out: AudioNode,
    bank: Bank,
    /** How loud each kind of sound has been set, as a multiplier (it can be changed while this is running). */
    private mix: Mix = EVEN,
  ) {
    const buffer = (waves: Wave[]): AudioBuffer => {
      const b = ctx.createBuffer(waves.length, waves[0].length, bank.rate);
      waves.forEach((w, c) => b.copyToChannel(w as Float32Array<ArrayBuffer>, c));
      return b;
    };
    const play = (b: AudioBuffer, speed = 1, from = rand()): AudioBufferSourceNode => {
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.loop = true;
      src.playbackRate.value = speed;
      src.start(0, from * b.duration);
      return src;
    };
    /** One long texture played from two different places at once, one to each ear, so it has width. */
    const wide = (b: AudioBuffer, speed = 1): AudioNode => {
      if (b.numberOfChannels > 1) return play(b, speed);
      const both = ctx.createChannelMerger(2);
      const start = rand();
      play(b, speed, start).connect(both, 0, 0);
      play(b, speed * 1.003, (start + 0.37) % 1).connect(both, 0, 1);
      return both;
    };
    const filter = (type: BiquadFilterType, hz: number, q = 0.6): BiquadFilterNode => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = hz;
      f.Q.value = q;
      return f;
    };

    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.hush = filter('lowpass', 17000, 0.5);
    this.hush.connect(this.master).connect(out);

    const voice = (src: AudioNode, ...through: AudioNode[]): Voice => {
      const level = ctx.createGain();
      level.gain.value = 0;
      let node = src;
      for (const f of through) node = node.connect(f);
      node.connect(level).connect(this.hush);
      return { level };
    };

    this.lightRain = voice(wide(buffer([bank.lightRain])));
    this.heavyRain = voice(wide(buffer([bank.heavyRain])));
    const fire = buffer(bank.fire);
    this.fire = voice(play(fire));
    const roar = ctx.createBuffer(2, bank.roar[0].length, ROAR_RATE);
    bank.roar.forEach((w, c) => roar.copyToChannel(w as Float32Array<ArrayBuffer>, c));
    this.roar = voice(play(roar));
    // Embers: the same fire heard slower and duller, with only its odd tick left.
    this.embers = voice(play(fire, 0.62), filter('lowpass', 2400));
    this.cicadas = voice(wide(buffer([bank.cicadas])));
    this.crickets = voice(wide(buffer([bank.crickets])));
  }

  /** Move every voice toward what the air is doing now. */
  follow(air: Air): void {
    const now = this.ctx.currentTime;
    const to = (p: AudioParam, v: number, over = 0.6) => p.setTargetAtTime(v, now, over);
    const set = (v: Voice, level: number, over = 0.6) => to(v.level.gain, level, over);

    // A shower is single drops; as it thickens the roar takes over from them.
    const { mix } = this;
    const heavy = Math.max(0, Math.min(1, (air.rain - 0.25) / 0.65));
    // Indoors there are walls and a turf roof between you and all of it. The campfire, forty paces off
    // across the meadow, cannot be heard at all; the insects barely; the rain is on the roof and the
    // glass, so it stays, a little softer; and what does come in has lost its edge.
    const out = 1 - Math.max(0, Math.min(1, air.indoors));
    // AFAR: the campfire is up in the meadow. From the beach below it, and from the boat out on the bay, it
    // cannot be heard at all; and the insects in the meadow's grass only faintly from the beach, and not
    // from the water.
    const byFire = air.afar > 0.5 ? 0 : 1;
    const inGrass = air.afar > 1.5 ? 0 : air.afar > 0.5 ? 0.22 : 1;
    set(this.lightRain, mix.weather * 0.75 * Math.min(1, air.rain / 0.35) ** 0.8 * (1 - 0.65 * heavy) * (0.62 + 0.38 * out));
    set(this.heavyRain, mix.weather * 0.85 * heavy ** 1.2 * (0.78 + 0.22 * out));

    // (The fire is kept well under the rain: it is company, not the thing you listen to.)
    set(this.fire, mix.fire * FIRE_LOUD * Math.min(1.2, air.flame) * out * byFire, out * byFire < 0.5 ? 0.12 : 0.4);
    // (The roar belongs to the flames alone: a small fire has little of it, and embers none.)
    set(this.roar, mix.fire * ROAR_LOUD * Math.min(1, air.flame) ** 1.4 * out * byFire, out * byFire < 0.5 ? 0.12 : 0.8);
    set(this.embers, mix.fire * FIRE_LOUD * 0.33 * air.embers * (1 - Math.min(1, air.flame)) * out * byFire, out * byFire < 0.5 ? 0.12 : 1);
    set(this.cicadas, mix.insects * 1.9 * air.heat * (0.14 + 0.86 * out) * inGrass, out * inGrass < 0.5 ? 0.3 : 2.5);
    set(this.crickets, mix.insects * 0.24 * air.crickets * (0.14 + 0.86 * out) * inGrass, out * inGrass < 0.5 ? 0.3 : 2.5);

    // Snow lying, or fog, takes the edge off every sound, and so do the walls of the house; music playing sets the place back a little.
    to(this.hush.frequency, 17000 * (1 - 0.74 * air.snow) * (1 - 0.35 * air.fog) * (0.16 + 0.84 * out), out < 0.5 ? 0.25 : 1.5);
    to(this.master.gain, 0.5 * (1 - 0.5 * air.music), 1.0);
  }

  private churchBell: AudioBuffer | null = null;

  /**
   * The church bell in the far village striking the hour. It is most of a kilometre off across the
   * water, and has to sound it: what reaches you has lost its edge and its weight (the clapper's knock
   * is gone, the deep hum under the note does not carry, and the top is dulled by all that air), it comes
   * from one place, over to the right where the church stands, and a breath after each stroke the far
   * side of the fjord gives it back, fainter and duller still.
   */
  chime(strokes: number): void {
    const { ctx } = this;
    if (!this.churchBell) {
      const waves = makeBell(ctx.sampleRate, 147);
      this.churchBell = ctx.createBuffer(2, waves[0].length, ctx.sampleRate);
      waves.forEach((w, c) => this.churchBell!.copyToChannel(w as Float32Array<ArrayBuffer>, c));
    }
    const filter = (type: BiquadFilterType, hz: number, q = 0.5): BiquadFilterNode => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = hz;
      f.Q.value = q;
      return f;
    };
    // Thinned below, dulled above (twice over, so the top falls away steeply), and gathered into one point.
    const thin = filter('highpass', 190);
    const dull = filter('lowpass', 760);
    const duller = filter('lowpass', 1150);
    const onePlace = ctx.createGain();
    onePlace.channelCount = 1;
    onePlace.channelCountMode = 'explicit';
    const side = ctx.createStereoPanner();
    side.pan.value = 0.42;
    const soft = ctx.createGain();
    soft.gain.value = 0.2 * this.mix.bell;
    thin.connect(dull).connect(duller).connect(onePlace);
    onePlace.connect(side).connect(soft).connect(this.hush);
    // The echo: off the cliffs across the water, and once more, fainter, off something further.
    const echo = ctx.createDelay(2);
    echo.delayTime.value = 0.68;
    const fainter = ctx.createGain();
    fainter.gain.value = 0.36;
    const again = ctx.createGain();
    again.gain.value = 0.3;
    onePlace.connect(echo).connect(filter('lowpass', 520)).connect(fainter);
    fainter.connect(side);
    fainter.connect(again).connect(echo);
    for (let i = 0; i < strokes; i++) {
      const at = ctx.currentTime + 0.4 + i * 2.7;
      const src = ctx.createBufferSource();
      src.buffer = this.churchBell;
      // (A stroke heard from far off swells in: it does not begin with a blow.)
      const swell = ctx.createGain();
      swell.gain.setValueAtTime(0.12, at);
      swell.gain.linearRampToValueAtTime(1, at + 0.14);
      src.connect(swell).connect(thin);
      src.start(at);
    }
  }

  /** Thunder: later and softer the farther off the strike was. */
  thunder(near: number): void {
    const { ctx } = this;
    const when = ctx.currentTime + 0.35 + (1 - near) * 4.5;
    const wave = makeThunder(ctx.sampleRate, near);
    const b = ctx.createBuffer(1, wave.length, ctx.sampleRate);
    b.copyToChannel(wave as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = b;
    const loud = ctx.createGain();
    loud.gain.value = this.mix.weather;
    src.connect(loud).connect(this.hush);
    src.start(when);
  }
}

// ---- a way of looking at a sound without hearing it ----------------------------------

/** The strength of each pitch in a stretch of sound (a plain fast Fourier transform, averaged over the stretch). */
function spectrum(x: Wave, size = 8192): Float32Array {
  const power = new Float32Array(size / 2);
  const re = new Float32Array(size);
  const im = new Float32Array(size);
  let frames = 0;
  for (let at = 0; at + size <= x.length; at += size / 2) {
    for (let i = 0; i < size; i++) {
      re[i] = x[at + i] * (0.5 - 0.5 * Math.cos((TAU * i) / size));
      im[i] = 0;
    }
    for (let i = 1, j = 0; i < size; i++) {
      let bit = size >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= size; len <<= 1) {
      const ang = -TAU / len;
      for (let i = 0; i < size; i += len) {
        for (let k = 0; k < len / 2; k++) {
          const c = Math.cos(ang * k);
          const s = Math.sin(ang * k);
          const ur = re[i + k];
          const ui = im[i + k];
          const vr = re[i + k + len / 2] * c - im[i + k + len / 2] * s;
          const vi = re[i + k + len / 2] * s + im[i + k + len / 2] * c;
          re[i + k] = ur + vr;
          im[i + k] = ui + vi;
          re[i + k + len / 2] = ur - vr;
          im[i + k + len / 2] = ui - vi;
        }
      }
    }
    for (let i = 0; i < size / 2; i++) power[i] += re[i] * re[i] + im[i] * im[i];
    frames++;
  }
  for (let i = 0; i < power.length; i++) power[i] /= frames || 1;
  return power;
}

export function createSound() {
  let wanted = true;
  try {
    wanted = localStorage.getItem(KEY) !== 'off';
  } catch {
    // Storage can be unavailable in private windows.
  }
  // How loud each kind of sound has been set: a step for each (see LEVEL_WORDS), kept between visits.
  const steps: Record<Sounding, number> = { fire: PLAIN, weather: PLAIN, insects: PLAIN, bell: PLAIN };
  try {
    const kept = JSON.parse(localStorage.getItem(LEVELS_KEY) ?? '{}') as Partial<Record<Sounding, unknown>>;
    for (const k of Object.keys(steps) as Sounding[]) {
      const v = kept[k];
      if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < LEVEL_GAINS.length) steps[k] = v;
    }
  } catch {
    // Nothing kept, or nothing that can be read: every sound is as it was made.
  }
  const mix: Mix = { ...EVEN };
  const remix = () => {
    for (const k of Object.keys(steps) as Sounding[]) mix[k] = LEVEL_GAINS[steps[k]];
  };
  remix();
  let ctx: AudioContext | null = null;
  let voices: Voices | null = null;
  let air: Air = { ...STILL };

  /** Begin, or carry on. Only works from a click or a key press: browsers insist. */
  const wake = () => {
    if (!wanted) return;
    try {
      if (!ctx) {
        const made = new AudioContext();
        ctx = made;
        // The textures take a moment to work out; the place comes in quietly when they are ready.
        void bankFor(made.sampleRate).then((bank) => {
          voices = new Voices(made, made.destination, bank, mix);
        });
      }
      if (ctx.state === 'suspended') void ctx.resume();
    } catch {
      // No sound on this machine, then.
    }
  };
  window.addEventListener('pointerdown', wake);
  window.addEventListener('keydown', wake);

  return {
    /** Called every frame with what the air is doing. */
    update(_dt: number, now: Air): void {
      air = now;
      if (voices && ctx?.state === 'running') voices.follow(now);
    },

    /** Lightning has just struck: `near` is 1 for close by, 0 for far off. */
    thunder(near = 0.5): void {
      if (voices && ctx?.state === 'running') voices.thunder(near);
    },

    /** The hour has struck: the village church rings it. */
    chime(strokes: number): void {
      if (voices && ctx?.state === 'running') voices.chime(strokes);
    },

    /** Silence it, or bring it back. Returns whether it is now on. */
    toggle(): boolean {
      wanted = !wanted;
      try {
        localStorage.setItem(KEY, wanted ? 'on' : 'off');
      } catch {
        // Remembered until the page is closed.
      }
      if (wanted) wake();
      else if (ctx) void ctx.suspend();
      return wanted;
    },

    isOn: () => wanted,

    /** Turn one kind of sound up a step (`by` 1) or down one (-1). Returns the word for where it now stands. */
    turn(which: Sounding, by: number): string {
      steps[which] = Math.max(0, Math.min(LEVEL_GAINS.length - 1, steps[which] + Math.sign(by)));
      remix();
      try {
        localStorage.setItem(LEVELS_KEY, JSON.stringify(steps));
      } catch {
        // Remembered until the page is closed.
      }
      return LEVEL_WORDS[steps[which]];
    },
    /** Where each kind of sound stands, as its word. */
    levels: (): Record<Sounding, string> => ({ fire: LEVEL_WORDS[steps.fire], weather: LEVEL_WORDS[steps.weather], insects: LEVEL_WORDS[steps.insects], bell: LEVEL_WORDS[steps.bell] }),
    state: () => (ctx ? (voices ? ctx.state : 'preparing') : 'not started'),

    /**
     * For testing: what the place would sound like in given weather, without
     * making a sound. Plays some seconds into an offline context and reports
     * how loud it came out, how its energy is spread from low to high, and how
     * far any single pitch stands out of the hiss round it (a real wind or
     * fire has no such pitch; a synthesiser tone would stand out by 20 dB or more).
     */
    async measure(conditions: Partial<Air>, seconds = 6, thunderNear = -1): Promise<{ level: number; peak: number; bands: number[]; standsOut: number; standsOutAt: number }> {
      const rate = 44100;
      const bank = await bankFor(rate);
      const offline = new OfflineAudioContext(2, rate * seconds, rate);
      const test = new Voices(offline, offline.destination, bank);
      const now = { ...STILL, ...conditions };
      test.follow(now);
      for (let t = 0.25; t < seconds; t += 0.25) {
        void offline.suspend(t).then(() => {
          test.follow(now);
          void offline.resume();
        });
      }
      if (thunderNear >= 0) test.thunder(thunderNear);
      const out = await offline.startRendering();
      const data = out.getChannelData(0).subarray(Math.floor(rate * Math.min(2.5, seconds * 0.4)));
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const db = (v: number) => Math.round(100 * Math.log10(Math.max(v, 1e-12))) / 10;
      const power = spectrum(data);
      const hz = rate / 2 / power.length;
      // Energy in each band, an octave or so wide, in decibels.
      const edges = [40, 120, 300, 700, 1500, 3000, 6000, 12000, 20000];
      const bands: number[] = [];
      for (let b = 0; b + 1 < edges.length; b++) {
        let e = 0;
        for (let i = Math.floor(edges[b] / hz); i < Math.min(power.length, Math.floor(edges[b + 1] / hz)); i++) e += power[i];
        bands.push(db(e / (8192 * 8192)));
      }
      // How far the strongest narrow peak stands above the typical level a third of an octave either side of it.
      let standsOut = 0;
      let standsOutAt = 0;
      for (let i = Math.floor(80 / hz); i < Math.floor(12000 / hz); i++) {
        const lo = Math.floor(i / 1.26);
        const hi = Math.min(power.length - 1, Math.ceil(i * 1.26));
        const round: number[] = [];
        for (let j = lo; j <= hi; j += Math.max(1, Math.floor((hi - lo) / 40))) round.push(power[j]);
        round.sort((p, q) => p - q);
        const typical = round[Math.floor(round.length / 2)] || 1e-20;
        const over = 10 * Math.log10((power[i - 1] + power[i] + power[i + 1]) / 3 / typical);
        if (over > standsOut) {
          standsOut = over;
          standsOutAt = i * hz;
        }
      }
      return { level: db(sum / data.length) , peak: db(loudest(data) ** 2), bands, standsOut: Math.round(standsOut * 10) / 10, standsOutAt: Math.round(standsOutAt) };
    },

    /**
     * For testing: the roar of the flames looked at by itself. How its energy is spread (as fractions: under
     * 100 Hz, 100 to 300, 300 to 600, 600 to 1500, above), how far its loudness strays from one half-second
     * to the next (in decibels: the spread, and the most), and how deep its quick flapping is (the same, over
     * twentieths of a second).
     */
    async roarLook(): Promise<{ spread: number[]; swell: number; swellMost: number; flap: number }> {
      const bank = await bankFor(44100);
      const x = bank.roar[0];
      const power = spectrum(x);
      const hz = ROAR_RATE / 2 / power.length;
      const edges = [0, 100, 300, 600, 1500, ROAR_RATE / 2];
      let all = 0;
      for (let i = 0; i < power.length; i++) all += power[i];
      const spread: number[] = [];
      for (let b = 0; b + 1 < edges.length; b++) {
        let e = 0;
        for (let i = Math.floor(edges[b] / hz); i < Math.min(power.length, Math.floor(edges[b + 1] / hz)); i++) e += power[i];
        spread.push(Math.round((e / all) * 10000) / 10000);
      }
      const strays = (window: number): [number, number] => {
        const len = Math.floor(ROAR_RATE * window);
        const levels: number[] = [];
        for (let at = 0; at + len <= x.length; at += len) {
          let sum = 0;
          for (let i = 0; i < len; i++) sum += x[at + i] * x[at + i];
          levels.push(10 * Math.log10(sum / len + 1e-12));
        }
        const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
        const sd = Math.sqrt(levels.reduce((a, b) => a + (b - mean) ** 2, 0) / levels.length);
        return [Math.round(sd * 10) / 10, Math.round((Math.max(...levels) - Math.min(...levels)) * 10) / 10];
      };
      const [swell, swellMost] = strays(0.5);
      return { spread, swell, swellMost, flap: strays(0.05)[0] };
    },

    /** The air it was last told about (for testing). */
    hearing: () => air,
  };
}
