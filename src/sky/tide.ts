// The tide, from the real moon.
//
// The sea rises and falls twice in each lunar day (24 hours and 50 minutes):
// it is high a little after the moon crosses overhead, and again when it is
// under your feet, and low in between. How far it goes depends on the phase:
// at new and full moon, when sun and moon pull in line, the tides are springs
// and go furthest; at the quarters they are neaps and barely stir. (Springs
// come a day or two after the moon is new or full, and so they do here.)
//
// Where the moon is in the sky is worked out from where you are: the hour of
// the sun by your longitude, less the part of a day the moon lags behind it,
// which is its phase. On this beach the sea stands a hand's breadth or two
// higher or lower for it, which carries the water's edge a stride or so up or
// down the stones (the islands' tides are small ones).

import { moonPhaseAt } from './stars';

export interface Tide {
  /** How far the sea stands above its mean level just now, in metres (below zero when the tide is out). */
  level: number;
  /** The level the last high water reached. */
  high: number;
  /** How wet that has left the stones between there and the water: 1 just after high water, drying slowly. */
  damp: number;
  /** Whether it is coming in. */
  rising: boolean;
  /** Where it stands between low water (-1) and high (1). */
  part: number;
}

/** How far either side of its mean level the sea goes on an ordinary tide, in metres. */
const MEAN = 0.12;
/** How much further at springs, and how much less at neaps. */
const SWING = 0.45;
/** From one high water to the next, in hours. */
const BETWEEN = 12.42;

/** The tide as it would stand with the water at a given part of its way between low (-1) and high (1), at springs. (For trying things out.) */
export function tideHeld(part: number): Tide {
  const high = MEAN * (1 + SWING);
  const p = Math.max(-1, Math.min(1, part));
  return { level: high * p, high, damp: 0.75, rising: false, part: p };
}

/** The tide at a moment, for a place at a given longitude (degrees east). */
export function tideAt(ms: number, longitude: number): Tide {
  const phase = moonPhaseAt(ms);
  // Turns since the sun was on your meridian; and, taking the moon's lag off that, since the moon was.
  const solar = ms / 86_400_000 + longitude / 360 - 0.5;
  const lunar = solar - phase;
  // High water follows the moon's crossing by an hour and a half.
  const turn = ((((lunar - 1.5 / 24.84) * 2) % 1) + 1) % 1; // 0 at high water, a half at low
  const high = MEAN * (1 + SWING * Math.cos(4 * Math.PI * (phase - 0.05)));
  const part = Math.cos(2 * Math.PI * turn);
  return { level: high * part, high, damp: Math.max(0.2, 1 - (turn * BETWEEN) / 9), rising: turn > 0.5, part };
}
