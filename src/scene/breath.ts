// The lamb's breath on a cold day: a small pale puff at its muzzle every few
// seconds, pushed out ahead of it, then hanging, lifting a little and thinning
// as the wind takes it. This keeps the few puffs that are in the air at once;
// the breath shaders draw them.

import { LAMB } from './land';

/** As much of the lamb's pose as its breath needs. */
interface Breather {
  x: number;
  y: number;
  z: number;
  yaw: number;
  low: number;
  head: number;
  grow: number;
}

/** Puffs in the air at once, and how long one lasts, in seconds. */
export const BREATHS = 3;
const LASTS = 2.1;
// Where the tip of its muzzle is on the lamb as built (ahead of its middle, and up), in metres at its first size.
const MUZZLE = { ahead: 1.0 * LAMB.size, up: 0.8 * LAMB.size };

export function createBreath() {
  /** Each puff: where it left the muzzle (x, y, z) and its age as a share of its life; then the way the muzzle pointed (x, z) and two spares. */
  const puff = new Array<number>(BREATHS * 4).fill(0);
  const way = new Array<number>(BREATHS * 4).fill(0);
  const age = new Array<number>(BREATHS).fill(9);
  let wait = 1.2;
  let turn = 0;

  return {
    /**
     * Carry the breath on by `dt` seconds. Below about 3 C the lamb, if it is
     * about, breathes out a puff every few seconds (oftener on its feet than
     * lying down). Returns what to draw, or null when the air is empty.
     */
    update(dt: number, lamb: Breather | null, temp: number): { puff: number[]; way: number[] } | null {
      wait -= dt;
      if (lamb && temp < 3 && wait <= 0) {
        const resting = lamb.low > 0.5;
        wait = (resting ? 3.5 : 2.0) + Math.random() * 0.9;
        const g = lamb.grow || 1;
        const ahead = [Math.cos(lamb.yaw), -Math.sin(lamb.yaw)];
        const k = turn++ % BREATHS;
        puff[k * 4] = lamb.x + ahead[0] * MUZZLE.ahead * g;
        puff[k * 4 + 1] = lamb.y + (MUZZLE.up - lamb.low * (LAMB.bodyDrop + LAMB.headDrop)) * g + lamb.head;
        puff[k * 4 + 2] = lamb.z + ahead[1] * MUZZLE.ahead * g;
        way[k * 4] = ahead[0];
        way[k * 4 + 1] = ahead[1];
        age[k] = 0;
      }
      if (wait < -5) wait = 0.6; // it has been away, or the air too mild: the first breath comes soon after
      let any = false;
      for (let k = 0; k < BREATHS; k++) {
        age[k] = Math.min(9, age[k] + dt / LASTS);
        puff[k * 4 + 3] = age[k];
        if (age[k] < 1) any = true;
      }
      return any ? { puff, way } : null;
    },
  };
}
