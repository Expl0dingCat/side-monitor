// How the campfire is shown. `focus.ts` knows what time it is in a spell of
// work; this turns each change into something you watch happen: the fire
// catching and then blazing up, a log hopping from the pile into the flames,
// steam when you put it out, a stone dropping onto the cairn.

import type { Fire } from './focus';

export interface FireLook {
  /** Height of the flames: 0 is out, 1 a full blaze, a little more when it flares. */
  flame: number;
  /** How brightly the embers glow, 0..1. */
  embers: number;
  /** How many sparks are flying, 0..1. */
  sparks: number;
  /** A burst of white smoke, 0..1: steam from dousing, or the last curl as it burns out. */
  steam: number;
  /** Logs to draw in the pile, and how far to move the last of them (one that is leaving or arriving). */
  logs: number;
  logShift: [number, number, number] | null;
  /** Stones to draw on the cairn, and how far above its seat the newest one still is. */
  stones: number;
  stoneLift: number;
}

// The row of logs runs away from the fire at this angle (it matches land.ts),
// so this is the way a log travels to reach the flames.
const TO_FIRE: [number, number] = [-Math.cos(0.32), Math.sin(0.32)];

/** A drop that lands with a couple of small bounces: 1 at the start, 0 at rest. */
const bounce = (t: number) => Math.abs(Math.cos(t * Math.PI * 2.5)) * (1 - t) ** 2;

export function createFireShow() {
  let before: Fire | null = null;
  let seconds = 0;

  let flame = 0;
  let embers = 0;
  let flare = 0;
  let sparks = 0;
  let steam = 0;
  let litAt = -100;
  let hasBlazedUp = true;
  let flareAt = 0;

  let logs = 5;
  let moving: { leaving: boolean; t: number } | null = null;
  let stones = 0;
  let stoneT = 1;

  return {
    update(fire: Fire, dt: number, pointedAt: boolean): FireLook {
      seconds += dt;

      if (!before) {
        // First frame (or a reload mid-spell): show things as they are, without replaying how they got there.
        flame = fire.heat;
        embers = fire.embers;
        logs = fire.logs;
        stones = fire.stones;
      } else {
        if (before.phase !== 'burning' && fire.phase === 'burning') {
          litAt = seconds;
          hasBlazedUp = false;
          sparks = 1; // struck alight
        }
        if (before.phase === 'burning' && fire.phase === 'cold') steam = 1; // put out: a gout of steam
        if (before.phase === 'burning' && fire.phase === 'embers') steam = 0.45; // burnt out: a last curl of smoke
      }
      before = { ...fire };

      // A stone earned drops onto the cairn.
      if (fire.stones > stones) {
        stones = fire.stones;
        stoneT = 0;
      } else if (fire.stones < stones) {
        stones = fire.stones; // a new day
        stoneT = 1;
      }
      stoneT = Math.min(1, stoneT + dt / 0.8);

      // Logs come and go one at a time.
      if (moving) {
        moving.t += dt / (moving.leaving ? 0.55 : 0.38);
        if (moving.t >= 1) {
          if (moving.leaving) logs--;
          moving = null;
        }
      }
      if (!moving) {
        if (logs > fire.logs) {
          moving = { leaving: true, t: 0 };
          // The fire leaps when the log lands in it.
          if (fire.phase === 'burning') flareAt = seconds + 0.45;
        } else if (logs < fire.logs) {
          logs++;
          moving = { leaving: false, t: 0 };
        }
      }
      if (flareAt && seconds >= flareAt) {
        flareAt = 0;
        flare = Math.max(flare, 0.3);
        sparks = Math.max(sparks, 0.85);
      }

      // The flames. A fire catches before it blazes: a second of small flame, then it goes up.
      const sinceLit = seconds - litAt;
      let target = fire.heat;
      if (fire.phase === 'burning' && sinceLit < 1.1) {
        target = Math.min(target, 0.1 + 0.2 * sinceLit);
      } else if (fire.phase === 'burning' && !hasBlazedUp) {
        hasBlazedUp = true;
        flare = Math.max(flare, 0.34);
        sparks = Math.max(sparks, 0.9);
      }
      target *= 1 + flare;
      // It dies faster than it grows.
      flame += (target - flame) * (1 - Math.exp(-dt * (target > flame ? 2.4 : 5)));
      if (flame < 0.004) flame = 0;
      flare *= Math.exp(-dt * 1.1);

      // A few sparks always fly while it burns; bursts fade.
      sparks = Math.max(sparks * Math.exp(-dt * 0.9), fire.phase === 'burning' ? 0.2 * Math.min(1, flame) : 0);
      steam *= Math.exp(-dt * 0.5);

      // Embers linger after the flames have gone.
      const glow = fire.phase === 'cold' ? 0 : fire.embers;
      embers += (glow - embers) * (1 - Math.exp(-dt * (glow > embers ? 2 : 0.3)));

      // With the pointer on a cold fire the ashes stir, to show it can be lit.
      if (pointedAt && fire.phase === 'cold') {
        embers = Math.max(embers, 0.22);
        sparks = Math.max(sparks, 0.1);
      }

      let logShift: FireLook['logShift'] = null;
      if (moving) {
        const p = moving.t;
        logShift = moving.leaving
          ? [TO_FIRE[0] * 0.8 * p, 0.42 * Math.sin(Math.PI * p) - 0.35 * p * p, TO_FIRE[1] * 0.8 * p] // a hop toward the fire
          : [0, bounce(p) * 0.5, 0]; // set down with a bump
      }

      return { flame, embers, sparks, steam, logs, logShift, stones, stoneLift: bounce(stoneT) * 1.1 };
    },
  };
}
