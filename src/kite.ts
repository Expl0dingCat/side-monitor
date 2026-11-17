// A kite, and it only flies when it is really windy outside.
//
// It is only out in the meadow on a day with wind enough to fly it (about
// 15 km/h): on a still day there is no kite there at all. It comes when the
// wind gets up and is gone again once it has dropped, a little at a time both
// ways. While it is there it lies propped on its stick, with its reel beside
// it, its tail trailing the way the wind goes. Click it and it lifts, the line
// pays out and it climbs. Click the kite or the reel to wind it in. If the
// wind drops it comes down by itself.
//
// It flies where the real wind carries it. With the wind at your back it
// stands out ahead of you over the sea; with the wind from your left it hangs
// far out to the right, and the other way about; and with the wind coming at
// you off the sea, when a kite would go back over your head, it stands as
// high as it can be seen instead. When the wind veers it swings round, taking
// its time.
//
// And it flies as the wind's strength has it. In a wind that barely holds it
// up it hangs low on a sagging line, wandering slowly from side to side and
// sinking in the lulls, its tail hanging. In a good breeze it climbs and
// stands almost still on a line nearly straight, the tail streaming. In a
// hard wind it will not stand: it darts from side to side in figures of
// eight, diving at the ends, the tail whipping, the line bar-taut. Past about
// 40 km/h the line will not hold it for long. It parts; the kite goes
// tumbling off downwind and is lost; and there is no kite in the meadow for
// a day afterwards. (Left on the grass in a full gale, it is blown away just
// the same.)

import type { V3 } from './scene/gl';
import { FACING, land } from './scene/land';

/** What is drawn of it this frame: triangles and lines, six numbers a corner (x, y, z, then the colour). */
export interface KiteDrawn {
  tris: number[];
  lines: number[];
}

interface Around {
  /** The wind as the way it travels in the scene (x right, z toward you), and its strength 0..1. */
  windX: number;
  windZ: number;
  wind: number;
  thunder: number;
  /** Where the pointer is across the window, -1..1 (0 if it is not on the scene). */
  pointer: number;
}

/** Where it lies: in the open grass left of the path, seen between the stone and the gramophone. */
const REST: [number, number] = [-8.2, -17.0];
const REEL: [number, number] = [-7.1, -16.1];
/** The least wind that lifts it, and the least that keeps it up (1 is about 50 km/h). */
const LIFTS = 0.3;
const HOLDS = 0.2;
/** The wind its line begins to give in; and the wind that carries it off the grass where it lies. */
const BREAKS = 0.78;
const SWEEPS = 0.93;
/** How long it is gone for once it is lost: a day. */
const GONE_FOR = 24 * 3_600_000;
const KEY = 'nightpond.kite';
/** How tall and wide it is. (Larger than life, so that it can be made out in the sky.) */
const TALL = 2.6;
const WIDE = 1.9;

const RED: V3 = [0.74, 0.2, 0.16];
const OCHRE: V3 = [0.88, 0.66, 0.28];
const STICK: V3 = [0.2, 0.15, 0.12];
const THREAD: V3 = [0.86, 0.84, 0.78];
const SPOOL: V3 = [0.42, 0.27, 0.15];

const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const ease = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

export function createKite(say: (words: string) => void, covers: (corners: V3[], x: number, y: number) => boolean) {
  let mode: 'lying' | 'rising' | 'flying' | 'winding' | 'flopping' | 'lost' = 'lying';
  /** How much of the line is out, 0..1; and for a flop, how far through it is. */
  let out = 0;
  let flop = 0;
  let clock = 0; // seconds it has been in the air, for its weaving
  let calm = 0; // seconds the wind has been too light to hold it
  let lean = 0; // how far it is coaxed aside, eased
  let wanted = false; // whether there is wind enough for it to be out in the meadow
  let there = 0; // how much of it is there, 0..1: it comes and goes over a few seconds
  let veer = 0; // which way the wind is carrying it, from the way you face (to your right is positive): it follows the wind slowly
  let pull = 0; // how near the line is to parting, in a wind too hard for it
  let swept = 0; // seconds a full gale has had it on the grass
  /** Lost on the wind: where it parted, the way it went, and how long ago. */
  let lost: { from: V3; way: V3; t: number } | null = null;
  /** Until when there is no kite at all (a time of day, in ms): it was lost. */
  let goneUntil = 0;
  try {
    goneUntil = Number(JSON.parse(localStorage.getItem(KEY) ?? '{}').goneUntil) || 0;
  } catch {
    // Nothing kept: the kite is where it always is.
  }
  let last: Around = { windX: 0.1, windZ: 0, wind: 0, thunder: 0, pointer: 0 };
  let kiteAt: V3 = [REST[0], land(REST[0], REST[1]) + 0.6, REST[1]];

  const reelAt: V3 = [REEL[0], land(REEL[0], REEL[1]) + 0.22, REEL[1]];
  const box = (c: V3, r: number, h: number): V3[] => {
    const corners: V3[] = [];
    for (const dx of [-r, r]) for (const dy of [-h, h]) for (const dz of [-r, r]) corners.push([c[0] + dx, c[1] + dy, c[2] + dz]);
    return corners;
  };
  const over = (x: number, y: number) => there > 0.6 && mode !== 'lost' && (covers(box(kiteAt, mode === 'lying' ? 1.0 : 1.9, mode === 'lying' ? 0.8 : 1.9), x, y) || covers(box(reelAt, 0.45, 0.4), x, y));

  /** The kite itself, as four panes, two sticks and a tail, standing in the plane of `spine` and `side`. */
  function build(into: KiteDrawn, centre: V3, spine: V3, side: V3, tailWay: V3, t: number, wind: number, size = 1): void {
    const tri = (a: V3, b: V3, c: V3, col: V3) => into.tris.push(...a, ...col, ...b, ...col, ...c, ...col);
    const line = (a: V3, b: V3, col: V3) => into.lines.push(...a, ...col, ...b, ...col);
    const nose = add(centre, spine, TALL * 0.38 * size);
    const foot = add(centre, spine, -TALL * 0.62 * size);
    const left = add(centre, side, (-WIDE / 2) * size);
    const right = add(centre, side, (WIDE / 2) * size);
    // Four panes of cloth, red and ochre by turns, each a tone darker in its lower half.
    tri(nose, left, centre, RED);
    tri(nose, centre, right, OCHRE);
    tri(left, foot, centre, [OCHRE[0] * 0.82, OCHRE[1] * 0.82, OCHRE[2] * 0.82]);
    tri(centre, foot, right, [RED[0] * 0.8, RED[1] * 0.8, RED[2] * 0.8]);
    line(nose, foot, STICK);
    line(left, right, STICK);
    // The tail: a string with bows of ribbon tied along it, streaming the way the air goes. It hangs and
    // sways slowly in a light air, and whips, quick and wide, in a hard one.
    let at = foot;
    for (let i = 0; i < 7; i++) {
      const sway = Math.sin(t * (3 + 9 * wind) - i * 0.9) * (0.1 + 0.2 * wind + 0.05 * i) * size;
      const next = add(add(at, tailWay, 0.62 * size), side, sway);
      line(at, next, THREAD);
      if (i % 2 === 1) {
        const col = i % 4 === 1 ? RED : OCHRE;
        const across = unit(cross(tailWay, spine));
        tri(next, add(add(next, side, 0.3 * size), across, 0.12 * size), add(add(next, side, 0.3 * size), across, -0.12 * size), col);
        tri(next, add(add(next, side, -0.3 * size), across, 0.12 * size), add(add(next, side, -0.3 * size), across, -0.12 * size), col);
      }
      at = next;
    }
  }

  /** The kite is lost: it goes off on the wind from where it is, and there is none for a day. */
  function lose(words: string): void {
    const w = Math.max(0.05, last.wind);
    lost = { from: kiteAt, way: unit([last.windX / w, 0.22, last.windZ / w]), t: 0 };
    mode = 'lost';
    pull = 0;
    swept = 0;
    goneUntil = Date.now() + GONE_FOR;
    try {
      localStorage.setItem(KEY, JSON.stringify({ goneUntil }));
    } catch {
      // Remembered until the page is closed.
    }
    say(words);
  }

  return {
    over,
    state: () => ({ mode, out: Math.round(out * 100) / 100, there: Math.round(there * 100) / 100, veer: Math.round(veer * 100) / 100, pull: Math.round(pull * 100) / 100, goneForHours: Math.max(0, Math.round(((goneUntil - Date.now()) / 3_600_000) * 10) / 10), at: kiteAt.map((v) => Math.round(v * 10) / 10) }),
    /** Where it is, whether it is in the air, and whether it is out in the meadow at all today. */
    where: (): { at: V3; up: boolean; there: boolean } => ({ at: kiteAt, up: mode !== 'lying' && mode !== 'flopping', there: there > 0.6 && mode !== 'lost' }),
    /** For testing: bring a lost kite back at once. */
    mend(): void {
      goneUntil = 0;
      try {
        localStorage.removeItem(KEY);
      } catch {
        // Nothing to forget.
      }
    },

    /** Send it up (if the wind will take it) or wind it in. Returns whether the click was for the kite. */
    click(x: number, y: number): boolean {
      if (!over(x, y)) return false;
      if (mode === 'lying') this.fly();
      else if (mode === 'rising' || mode === 'flying') this.land();
      return true;
    },
    fly(): void {
      if (mode !== 'lying' || there < 0.6) return;
      if (last.thunder > 0.5) {
        say('not in a thunderstorm');
        return;
      }
      if (last.wind >= LIFTS) {
        mode = 'rising';
        clock = 0;
        calm = 0;
        pull = 0;
        if (last.wind >= BREAKS) say('it is blowing very hard for a kite');
      } else {
        mode = 'flopping';
        flop = 0;
        say(last.wind < 0.08 ? 'not a breath of wind today' : 'not enough wind today');
      }
    },
    land(): void {
      if (mode === 'rising' || mode === 'flying') mode = 'winding';
    },

    /** Called every frame. Returns what to draw. */
    update(time: number, dt: number, around: Around): KiteDrawn {
      last = around;
      const into: KiteDrawn = { tris: [], lines: [] };
      const line = (a: V3, b: V3, col: V3) => into.lines.push(...a, ...col, ...b, ...col);
      const tri = (a: V3, b: V3, c: V3, col: V3) => into.tris.push(...a, ...col, ...b, ...col, ...c, ...col);
      // It moves twelve times a second, like the grass.
      const t = Math.floor((time / 1000) * 12) / 12;
      const wind = around.wind;
      const up: V3 = [0, 1, 0];
      // The way the wind goes over the ground, as a direction (it is given as x to your right, z toward you).
      const blows: V3 = wind > 0.02 ? [around.windX / wind, 0, around.windZ / wind] : [Math.sin(FACING), 0, -Math.cos(FACING)];
      // How it flies for the wind's strength: `fresh` from barely holding up (0) to a good breeze (1), `hard` from there to nearly a gale.
      const fresh = ease((wind - LIFTS) / 0.3);
      const hard = ease((wind - 0.62) / 0.3);

      // Lost: it tumbles away downwind, climbing a little, turning over and over, until it is too small to see.
      if (mode === 'lost' && lost) {
        lost.t += dt;
        const lt = Math.floor(lost.t * 12) / 12;
        const far = (9 + 14 * Math.max(wind, 0.6)) * lt + 2 * lt * lt;
        kiteAt = add(add(lost.from, lost.way, far), up, 3 * Math.sin(lt * 1.3) - 0.25 * lt * lt * 0.3);
        const roll = lt * 4.2;
        const spine = unit([Math.cos(roll) * blows[2] * -1 + 0.2, Math.sin(roll), Math.cos(roll) * blows[0]]);
        const side = unit(cross(spine, add(blows, up, 0.4 * Math.sin(roll * 0.7))));
        build(into, kiteAt, spine, side, unit([-blows[0] * 0.2, -0.6, -blows[2] * 0.2]), t, 1);
        // What is left of the line lies slack on the grass, downwind of the reel.
        const rx: V3 = [0.2, 0, 0.08];
        tri(add(reelAt, rx, -1), add(reelAt, rx), add(add(reelAt, rx), up, 0.3), SPOOL);
        tri(add(reelAt, rx, -1), add(add(reelAt, rx), up, 0.3), add(add(reelAt, rx, -1), up, 0.3), SPOOL);
        let from = add(reelAt, up, 0.15);
        for (let i = 1; i <= 5; i++) {
          const p = add(add(reelAt, blows, i * 0.55), cross(blows, up), 0.22 * Math.sin(i * 1.7));
          p[1] = land(p[0], p[2]) + 0.05;
          line(from, p, THREAD);
          from = p;
        }
        if (lost.t > 9) {
          lost = null;
          mode = 'lying';
          out = 0;
          there = 0;
          wanted = false;
        }
        return into;
      }
      // For a day after that there is no kite.
      if (Date.now() < goneUntil) {
        there = 0;
        wanted = false;
        return into;
      }

      if (mode === 'rising') {
        out = Math.min(1, out + dt / 7);
        if (out >= 1) mode = 'flying';
      } else if (mode === 'winding') {
        out = Math.max(0, out - dt / 5.5);
        if (out <= 0) mode = 'lying';
      } else if (mode === 'flopping') {
        flop += dt / 1.7;
        if (flop >= 1) mode = 'lying';
      }
      if (mode === 'rising' || mode === 'flying') {
        // Too little wind for a while, or thunder, and it comes down by itself.
        calm = wind < HOLDS ? calm + dt : 0;
        if (calm > 4 || around.thunder > 0.5) mode = 'winding';
        // Too much, and the line gives: slowly in a wind just over what it will bear, in a few seconds in a gale.
        pull = Math.max(0, pull + dt * (wind - BREAKS) * 2.2);
        if (pull > 1.5 && out > 0.5) {
          lose('the line has parted · the kite is gone on the wind');
          return into;
        }
      } else pull = Math.max(0, pull - dt);
      if (mode !== 'lying' && mode !== 'flopping') clock += dt * (0.6 + 1.2 * wind);
      lean += ((mode === 'flying' ? around.pointer * 0.22 : 0) - lean) * (1 - Math.exp(-dt * 0.9));
      // Which way the wind carries it, measured round from the way you face. It follows a veering wind slowly.
      const carried = Math.atan2(blows[0], -blows[2]) - FACING;
      veer += Math.atan2(Math.sin(carried - veer), Math.cos(carried - veer)) * (1 - Math.exp(-dt * 0.3));

      // It is out only while there is wind for it: brought out when the wind is enough to lift it,
      // and taken in once it has fallen too light to hold it (never while it is still in the air).
      if (wind >= LIFTS) wanted = true;
      else if (wind < HOLDS && mode === 'lying') wanted = false;
      there = Math.max(0, Math.min(1, there + (wanted ? dt : -dt) / 4));
      if (there <= 0) return into;
      const size = ease(there);

      // Lying on the grass in a full gale, it is not there for long.
      swept = mode === 'lying' && there >= 1 && wind >= SWEEPS ? swept + dt : 0;
      if (swept > 10) {
        lose('the wind has taken the kite');
        return into;
      }

      // The reel: a spool on the grass, with thread on it.
      const rx: V3 = [0.2 * size, 0, 0.08 * size];
      tri(add(reelAt, rx, -1), add(reelAt, rx), add(add(reelAt, rx), up, 0.3 * size), SPOOL);
      tri(add(reelAt, rx, -1), add(add(reelAt, rx), up, 0.3 * size), add(add(reelAt, rx, -1), up, 0.3 * size), SPOOL);
      line(add(add(reelAt, rx, -1), up, 0.15 * size), add(add(reelAt, rx), up, 0.15 * size), THREAD);
      const reelTop = add(reelAt, up, 0.3 * size);

      if (out <= 0) {
        // On the ground: propped up on its stick, nose in the air, its tail lying downwind in the grass.
        // The harder it blows the more it shudders and tugs to be off.
        const hop = mode === 'flopping' ? Math.sin(Math.PI * Math.min(1, flop)) : 0;
        const stir = (0.03 * wind + 0.09 * hard) * Math.sin(t * (5 + 6 * hard)) + 0.05 * hard * Math.sin(t * 2.3);
        const tilt = 0.72 + 0.35 * hop + stir;
        const spine = unit([0.25 * Math.cos(tilt), Math.sin(tilt), -Math.cos(tilt)]);
        const side = unit(cross(spine, [0, 0, 1]));
        const ground = land(REST[0], REST[1]);
        kiteAt = [REST[0], ground + (TALL * 0.62 * Math.sin(tilt) + 0.05) * size + 1.5 * hop + 0.12 * hard * Math.max(0, Math.sin(t * 2.3)), REST[1]];
        const trail = unit([blows[0] * (0.35 + 0.6 * fresh), -0.5 + 0.45 * (1 - hop), blows[2] * (0.35 + 0.6 * fresh)]);
        build(into, kiteAt, spine, side, trail, t, wind * 0.5, size);
        line(reelTop, add(kiteAt, spine, -TALL * 0.1 * size), THREAD);
        return into;
      }

      // In the air. Across the wind it flies far out to the side the wind goes; with the wind in your
      // face it stands as high as can be seen (it cannot be followed back over your head).
      const aside = 0.52 * Math.sin(veer);
      const overhead = Math.max(0, -Math.cos(veer));
      // How it moves for the wind's strength. Barely held up: a slow wide wander, sinking in the lulls.
      // A good breeze: all but still. A hard wind: figures of eight, quick, diving at each end.
      const wander = (1 - fresh) * (0.2 * Math.sin(clock * 0.5) + 0.06 * Math.sin(clock * 1.3 + 1));
      const dart = hard * 0.21 * Math.sin(clock * 2.4);
      const dive = hard * 0.06 * Math.sin(clock * 4.8 + 0.5);
      const lull = (1 - fresh) * 0.045 * (0.5 + 0.5 * Math.sin(clock * 0.37 + 4));
      const quiver = 0.012 * fresh * Math.sin(clock * 3.1);
      const bearing = FACING + aside + wander + dart + quiver + lean;
      const lift = Math.max(0.06, 0.15 + 0.15 * fresh - 0.04 * hard + 0.07 * overhead + dive - lull) * ease(out * 1.4);
      const length = (44 + 22 * fresh) * ease(out);
      const way: V3 = [Math.sin(bearing) * Math.cos(lift), Math.sin(lift), -Math.cos(bearing) * Math.cos(lift)];
      const lineEnd = add(reelTop, way, length);
      kiteAt = lineEnd;
      // It stands across the line, leaning back into the wind (flatter in a light air, more upright in a
      // hard one), and banks into each swing, the harder the faster it is going.
      const flat = unit(cross(way, up));
      const going = (1 - fresh) * (0.1 * Math.cos(clock * 0.5) + 0.078 * Math.cos(clock * 1.3 + 1)) + hard * 0.5 * Math.cos(clock * 2.4);
      const bank = Math.max(-0.9, Math.min(0.9, going * 2.6));
      const sideways = unit(add(flat, cross(flat, way), Math.sin(bank)));
      const spine = unit(add(cross(sideways, way), way, 0.62 - 0.32 * fresh));
      // The tail hangs under it in a light air, and streams out behind in a strong one.
      const tailWay = unit([way[0] * (0.2 + 0.85 * fresh), -(1 - 0.55 * fresh - 0.2 * hard), way[2] * (0.2 + 0.85 * fresh)]);
      build(into, add(kiteAt, spine, TALL * 0.1), spine, sideways, tailWay, t, wind);
      // The line: it sags under its own weight in a light air, and is drawn all but straight in a hard one.
      const sag = length * Math.max(0.012, 0.15 - 0.11 * fresh - 0.03 * hard);
      let from = reelTop;
      for (let i = 1; i <= 14; i++) {
        const u = i / 14;
        const p: V3 = [reelTop[0] + (lineEnd[0] - reelTop[0]) * u, reelTop[1] + (lineEnd[1] - reelTop[1]) * u - sag * Math.sin(Math.PI * u), reelTop[2] + (lineEnd[2] - reelTop[2]) * u];
        line(from, p, THREAD);
        from = p;
      }
      return into;
    },
  };
}
