// Stacking stones on the beach: a toy for a steady hand.
//
// A flat stone lies on the shingle near your feet. Click it and a stone lifts
// off the beach and hangs over it, drifting slowly from side to side; click
// again (anywhere) and it is set down where it then is. Each stone is a little
// smaller than the last, and drifts a little wider and faster. If what stands
// above any stone leans too far out over its edge, down it comes from there:
// the stones below are left standing, and you go on from them. Whatever is
// standing is still there when you come back, and your tallest is remembered.
//
// The balance is a fair one. A stone's weight, and the weight of all it
// carries, must lie over the stone beneath: set near enough the middle it
// sits still; set well off it, it rocks hard and the stack trembles, but
// holds; set further than about three quarters of the way to the edge, it
// goes. The stone in your hand swings wide enough that a careless click will
// often miss, and a careful one will not.
//
// And you can knock it down: press and drag across the stack, and everything
// from the stone your hand meets upward goes over the way you swept.
//
// They are stones of the beach: the same shape as the cobbles lying round
// them, lit, shadowed and wetted as those are, and with weight. One set down
// rocks a moment before it is still; a stack that is only just in balance
// trembles. The weather is on it as it is on everything. Wind leans the whole
// column and rocks it, more the taller it is, and in a hard blow a tall or a
// badly set stack goes over, downwind. And when a big wave runs up the beach
// as far as its foot, the water takes it: in a hand's depth all but the lowest
// stone, in more than that the lot. What falls on dry stones lies where it
// fell, until you pick it up again or the sea has it.

import type { V3 } from './scene/gl';
import { BEACH, FACING, land, SHORE_EYE } from './scene/land';

const KEY = 'nightpond.cairn';
/** No stack goes higher than this many stones. */
const MOST = 12;
/** Where the setting stone lies: metres ahead of you, and to your right. */
const AHEAD = 3.7;
const RIGHT = 0.3;
const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** What the weather is doing to the stack. */
export interface Weathering {
  /** How hard it blows, 0..1 (1 is a gale); and how much of that pushes to your right as you look at the stack (negative, to your left). */
  wind: number;
  push: number;
  /** How high the water has run up the beach just now, in metres above the sea's mean level. */
  reach: number;
}

const UP: V3 = [0, 1, 0];
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mark = (n: number) => {
  const s = Math.sin(n * 127.1 + 31.7) * 43758.5453;
  return s - Math.floor(s);
};

/** The setting stone, and each stone above it: half its width and its height, in metres. */
const BASE = { w: 0.36, h: 0.14 };
const half = (i: number) => 0.25 - 0.013 * i;
const tall = (i: number) => 0.125 - 0.004 * i;
/** How far out over the stone beneath a weight may lie before it goes, as a part of that stone's half-width. */
const HOLDS = 0.76;
/** How heavy a stone is, near enough: its width twice over, times its height. */
const weight = (i: number) => half(i) * half(i) * tall(i);

export function createStacking(say: (words: string) => void, covers: (corners: V3[], x: number, y: number) => boolean) {
  /** Each standing stone's place: how far its middle lies to the right of the setting stone's. */
  let stack: number[] = [];
  let best = 0;
  /** A stone in the hand: when it was lifted (page clock, ms). */
  let held: { since: number } | null = null;
  /** One being set down: where, and how far it has dropped (0..1). */
  let setting: { x: number; t: number } | null = null;
  /** The stone last set down, rocking until it is still: how hard, and for how long so far. */
  let rocking: { i: number; much: number; t: number } | null = null;
  /** Stones coming down: which, where each began, which way they go, how long they have been falling, and whether the sea has them. */
  let falling: { stones: { i: number; x: number; y: number }[]; way: number; t: number; washed: boolean } | null = null;
  /** Stones lying on the beach where they fell: which stone, how far right of the setting stone, how far toward the sea, and how it is turned. */
  let lying: { i: number; x: number; d: number; yaw: number }[] = [];
  let now = 0;
  let weather: Weathering = { wind: 0, push: 0, reach: -9 };

  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { stack?: number[]; best?: number } | null;
    if (kept && Array.isArray(kept.stack)) stack = kept.stack.filter((v) => Number.isFinite(v)).slice(0, MOST);
    if (kept && Number.isFinite(kept.best)) best = Number(kept.best);
  } catch {
    // Nothing kept: the beach is as it was found.
  }
  const keep = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ stack, best }));
    } catch {
      // Remembered until the page is closed.
    }
  };

  const ahead: V3 = [Math.sin(FACING), 0, -Math.cos(FACING)];
  const right: V3 = [Math.cos(FACING), 0, Math.sin(FACING)];
  const foot = add(add([BEACH.x, 0, BEACH.z], ahead, AHEAD), right, RIGHT);
  /** How high the beach is under the setting stone, above the sea's mean level. */
  const ground = land(foot[0], foot[2]);
  foot[1] = ground + 0.07; // bedded a little way into the shingle
  /** The way across your view at the stack: to your right as you look at it. */
  const across = unit(cross([foot[0] - SHORE_EYE[0], 0, foot[2] - SHORE_EYE[2]], UP));
  /** And the way you look at it: away from you, toward the sea. */
  const away = unit([foot[0] - SHORE_EYE[0], 0, foot[2] - SHORE_EYE[2]]);
  /** The turn that lays a stone's long side across your view. */
  const broadside = Math.atan2(-across[2], across[0]);

  /** How high above the foot the underside of stone `i` is. */
  const under = (i: number) => {
    let y = BASE.h * 0.9;
    for (let k = 0; k < i; k++) y += tall(k) * 0.9;
    return y;
  };
  /** The page's clock in twelfths of a second, like the grass: everything here moves in those steps. */
  const beat = () => Math.floor((now / 1000) * 12) / 12;
  /** The gusts: how hard the wind is pushing this moment, as a part of its strength. */
  const gust = (t: number) => 0.62 + 0.38 * Math.sin(t * 1.7 + 0.9 * Math.sin(t * 0.63));

  /** Where the stone in the hand is, to the right of the one it hangs over: it drifts wider and quicker the taller the stack, and wind makes it harder to hold steady. */
  const drift = () => {
    const n = stack.length;
    const over = n ? stack[n - 1] : 0;
    if (!held) return over;
    const t = Math.floor(((now - held.since) / 1000) * 12) / 12;
    const reach = Math.min(0.42, 0.23 + 0.021 * n) * (1 + 0.5 * weather.wind);
    return over + reach * Math.sin(t * (1.4 + 0.19 * n) + 1.2) + 0.05 * weather.push * gust(beat()) * Math.sin(t * 5.3);
  };

  /**
   * The lowest stone that what stands above it overbalances (-1 for the setting stone), or null if all is steady.
   * `blown` is how far the wind is pushing each stone's weight aside just now, for every stone it has above it to push on.
   */
  function gives(blown = 0): { at: number; way: number } | null {
    for (let j = stack.length - 2; j >= -1; j--) {
      let mass = 0;
      let lever = 0;
      for (let i = j + 1; i < stack.length; i++) {
        mass += weight(i);
        lever += weight(i) * (stack[i] + blown * (i - j));
      }
      const centre = lever / mass;
      const on = j < 0 ? 0 : stack[j];
      const rests = (j < 0 ? BASE.w : half(j)) * HOLDS;
      if (Math.abs(centre - on) > rests) return { at: j, way: Math.sign(centre - on) || 1 };
    }
    return null;
  }
  /** How near the stack is to going over, 0 (dead true) to 1 (on the point of it). */
  function strain(): number {
    let most = 0;
    for (let j = stack.length - 2; j >= -1; j--) {
      let mass = 0;
      let lever = 0;
      for (let i = j + 1; i < stack.length; i++) {
        mass += weight(i);
        lever += weight(i) * stack[i];
      }
      const rests = (j < 0 ? BASE.w : half(j)) * HOLDS;
      most = Math.max(most, Math.abs(lever / mass - (j < 0 ? 0 : stack[j])) / rests);
    }
    return Math.min(1, most);
  }

  /** One stone, as the beach's own are drawn: where its middle is, half its width, its height, which stone it is, and how far it is tipped over to your right. */
  function stone(into: number[], middle: V3, w: number, h: number, seed: number, tip = 0, turn = 0): void {
    into.push(middle[0], middle[1], middle[2], w, broadside + (mark(seed + 0.3) - 0.5) * 0.5 + turn, h / (2 * w), mark(seed) * 0.93, mark(seed + 0.5), away[0], 0, away[2], -tip);
  }

  const corners = (): V3[] => {
    const top = under(stack.length) + (held ? 0.5 : 0.12);
    const out: V3[] = [];
    for (const a of [-0.5, 0.5]) for (const y of [-0.05, top]) for (const d of [-0.3, 0.3]) out.push(add(add(add(foot, across, a), UP, y), ahead, d));
    return out;
  };

  const lift = () => {
    if (held || setting || falling) return;
    if (stack.length >= MOST) {
      say('that is as tall as it goes');
      return;
    }
    // (If one is lying where it fell, that is the one you pick up.)
    lying.pop();
    held = { since: now };
  };
  const setDown = () => {
    if (!held) return;
    setting = { x: drift(), t: 0 };
    held = null;
  };
  /** Everything above stone `at` comes down, to the side `way`. */
  const topple = (at: number, way: number, washed: boolean) => {
    falling = { stones: stack.map((x, i) => ({ i, x, y: under(i) })).filter((s) => s.i > at), way, t: 0, washed };
    rocking = null;
  };

  return {
    /** Whether a stone is in the hand (every click is then for setting it down). */
    holding: () => held !== null,
    busy: () => held !== null || setting !== null || falling !== null || rocking !== null || (stack.length > 0 && weather.wind > 0.12),
    state: () => ({ stack: stack.map((v) => Math.round(v * 100) / 100), best, holding: held !== null, falling: falling !== null, lying: lying.length, strain: Math.round(strain() * 100) / 100, ground: Math.round(ground * 100) / 100 }),
    /** Where the top of the stack is, for words to hang over. */
    topAt: (): V3 => add(foot, UP, under(stack.length) + 0.25),
    lift,
    setDown,
    /** Put the stone in the hand back on the beach. */
    cancel(): void {
      held = null;
    },
    /**
     * A hand swept across the stack at a point on the page, going right (1) or left (-1): everything from the
     * stone it meets upward goes over that way. Returns whether it met one.
     */
    knock(x: number, y: number, way: number): boolean {
      if (held || setting || falling || stack.length === 0) return false;
      const box = (i: number): V3[] => {
        const out: V3[] = [];
        const middle = add(add(foot, across, stack[i]), UP, under(i) + tall(i) / 2);
        for (const a of [-1, 1]) for (const v of [-1, 1]) for (const d of [-1, 1]) out.push(add(add(add(middle, across, a * half(i) * 1.15), UP, v * tall(i) * 0.7), away, d * 0.15));
        return out;
      };
      for (let i = stack.length - 1; i >= 0; i--) {
        if (!covers(box(i), x, y)) continue;
        topple(i - 1, way >= 0 ? 1 : -1, false);
        return true;
      }
      return false;
    },
    /** For testing: set the next stone down this far to the right of the one beneath. */
    place(offset: number): void {
      if (falling || setting || stack.length >= MOST) return;
      held = null;
      setting = { x: (stack.length ? stack[stack.length - 1] : 0) + offset, t: 0 };
    },

    /** A click on the beach. Returns whether it was for the stones. */
    click(x: number, y: number): boolean {
      if (held) {
        setDown();
        return true;
      }
      if (setting || falling) return covers(corners(), x, y);
      if (!covers(corners(), x, y)) return false;
      lift();
      return true;
    },

    /**
     * Called every frame while you are on the beach: moves what is moving, lets the weather at it, and
     * gives back the stones to be drawn (twelve numbers each, as the beach's own stones are sent).
     */
    draw(time: number, dt: number, around: Weathering): number[] {
      now = time;
      weather = around;
      const into: number[] = [];
      const t = beat();
      const n = stack.length;
      const blow = around.push * gust(t);

      // The sea first. Water at the foot of the stack takes it: a hand's depth leaves the lowest stone, more leaves none.
      const depth = around.reach - ground;
      if (depth > 0.02 && !falling) {
        if (lying.length) lying = [];
        if (n > (depth > 0.1 ? 0 : 1) && !setting) {
          topple(depth > 0.1 ? -1 : 0, blow >= 0 ? 1 : -1, true);
          say(n > 2 ? 'a wave takes it · the sea keeps the stones' : 'a wave takes it');
        }
      }
      // Then the wind: it leans on every stone, and the more stones a stone carries the more of that it bears.
      if (!falling && !setting && n > 1 && around.wind > 0.3) {
        const fails = gives(0.075 * blow * around.wind);
        if (fails) {
          topple(fails.at, fails.way, false);
          say('the wind takes it');
        }
      }

      // The setting stone, and what stands on it. The column leans downwind and rocks in the gusts, more the higher up;
      // a stack near to going over trembles; and the stone last set down rocks until it has found its seat.
      stone(into, add(foot, UP, BASE.h / 2 - 0.02), BASE.w, BASE.h, 0.5);
      const going = new Set(falling ? falling.stones.map((s) => s.i) : []);
      const near = Math.max(0, (strain() - 0.55) / 0.45);
      if (rocking) {
        rocking.t += dt;
        if (rocking.t > 1.1) rocking = null;
      }
      stack.forEach((x, i) => {
        if (going.has(i)) return;
        const up = (i + 1) / MOST;
        let tip = blow * around.wind * (0.06 + 0.5 * up) * 0.22 + near * 0.035 * Math.sin(t * 9 + i) * (i === n - 1 ? 1 : 0.5);
        if (rocking && rocking.i === i) tip += rocking.much * Math.exp(-rocking.t / 0.2) * Math.cos(rocking.t * 17);
        const lean = blow * around.wind * 0.018 * (i + 1) ** 1.25;
        stone(into, add(add(foot, across, x + lean), UP, under(i) + tall(i) / 2), half(i), tall(i), i + 1, tip);
      });
      // Those lying where they fell.
      for (const s of lying) {
        const at = add(add(foot, across, s.x), away, s.d);
        at[1] = land(at[0], at[2]) + tall(s.i) * 0.4;
        stone(into, at, half(s.i), tall(s.i), s.i + 1, 0, s.yaw);
      }

      if (held) {
        // In the hand: a little above where it would rest, drifting, and never quite level.
        const sway = 0.07 * Math.sin(t * 2.3 + 1) + 0.1 * blow * around.wind;
        stone(into, add(add(foot, across, drift()), UP, under(n) + 0.26 + tall(n) / 2), half(n), tall(n), n + 1, sway);
      } else if (setting) {
        setting.t = Math.min(1, setting.t + dt / 0.2);
        const drop = 0.26 * (1 - setting.t * setting.t);
        stone(into, add(add(foot, across, setting.x), UP, under(n) + drop + tall(n) / 2), half(n), tall(n), n + 1);
        if (setting.t >= 1) {
          const over = setting.x - (n ? stack[n - 1] : 0);
          stack.push(setting.x);
          setting = null;
          const fails = gives();
          if (fails) {
            // Everything above the stone that gave comes down, on the side it leaned to.
            topple(fails.at, fails.way, false);
          } else {
            // It knocks down onto the one below and rocks there, harder the further off the middle it was set.
            rocking = { i: stack.length - 1, much: 0.05 + 0.45 * Math.min(1, Math.abs(over) / half(n)) * (over >= 0 ? 1 : -1), t: 0 };
            if (stack.length > best) {
              best = stack.length;
              if (best >= 3) say(`${NUMBERS[best] ?? best} stones · your tallest yet`);
            }
            keep();
          }
        }
      } else if (falling) {
        const f = falling;
        f.t += dt;
        const ft = Math.floor(f.t * 12) / 12;
        let landed = true;
        const rest: typeof lying = [];
        f.stones.forEach((s, k) => {
          // It tips off the stone below, slowly at first, and then drops; the higher the stone, the further out it is thrown.
          const out = f.way * ((0.3 + 0.2 * k) * ft + 0.5 * ft * ft);
          const toSea = (mark(s.i * 3.1 + 7) - 0.5) * 0.5 * ft;
          const floor = -0.03 + tall(s.i) * 0.4;
          const down = s.y + tall(s.i) / 2 - 3.6 * Math.max(0, ft - 0.08) ** 2;
          if (down > floor) landed = false;
          const spin = f.way * Math.min(ft, 0.9) * (2.4 + 0.5 * k);
          if (down > floor - 0.05) stone(into, add(add(add(foot, across, s.x + out), away, toSea), UP, Math.max(down, floor)), half(s.i), tall(s.i), s.i + 1, spin);
          rest.push({ i: s.i, x: s.x + out, d: toSea, yaw: spin * 0.7 });
        });
        if (landed || f.t > 2) {
          stack = stack.slice(0, f.stones[0].i);
          // On dry stones they lie where they fell; the sea carries off what it knocked down.
          if (!f.washed) lying = [...lying, ...rest].slice(-MOST);
          const washed = f.washed;
          falling = null;
          keep();
          if (!washed) say(best >= 3 ? `down it comes · your tallest is ${NUMBERS[best] ?? best}` : 'down it comes');
        }
      }
      return into;
    },
  };
}
