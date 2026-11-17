// The eclipses of the moon, on the nights they really happen. For a few hours
// the full moon passes through the Earth's shadow: it darkens from one edge,
// and if it goes right in, it turns a deep copper red.

/**
 * Every eclipse from late 2026 to 2032 in which the moon enters the dark core
 * of the shadow (the ones that only graze the half-shadow can hardly be seen,
 * and are left out; there is none of this kind at all between August 2026
 * and January 2028). For each: the moment of greatest eclipse (UTC), its
 * kind, how deep the moon goes (the umbral magnitude: the share of its
 * width inside the core, more than 1 when it is right in), the minutes from
 * the core first touching it to last leaving it, and the minutes of totality.
 * Times are timeanddate.com's; magnitudes and durations agree with NASA's
 * five-millennium catalogue.
 */
const ECLIPSES: [string, 'partial' | 'total', number, number, number][] = [
  ['2028-01-12T04:13:05Z', 'partial', 0.066, 56, 0],
  ['2028-07-06T18:19:47Z', 'partial', 0.389, 141, 0],
  ['2028-12-31T16:52:03Z', 'total', 1.246, 209, 71],
  ['2029-06-26T03:22:14Z', 'total', 1.844, 220, 102],
  ['2029-12-20T22:42:01Z', 'total', 1.117, 213, 54],
  ['2030-06-15T18:33:23Z', 'partial', 0.502, 144, 0],
  ['2032-04-25T15:13:38Z', 'total', 1.191, 211, 66],
  ['2032-10-18T19:02:30Z', 'total', 1.103, 196, 47],
];

export interface EarthShadow {
  /**
   * For the picture of the moon: where the middle of the shadow's dark core
   * is, measured from the middle of the moon in moon radii (x, y), the core's
   * radius in moon radii, and how much of the moon's light is gone (0..1).
   */
  shadow: [number, number, number, number];
  /** 0 while the core is not on the moon, 1 while it covers part of it, 2 in totality. */
  stage: 0 | 1 | 2;
}

const NONE: EarthShadow = { shadow: [0, 0, 0, 0], stage: 0 };
/** The half-shadow reaches about a moon's width beyond the core, and takes this long to cross before the core arrives. */
const HALF_SHADOW = 2.06;

/** The shadow `minutes` from the middle of an eclipse of the given depth and lengths. */
function shadowAt(minutes: number, magnitude: number, partial: number, total: number): EarthShadow {
  // The core's radius in moon radii is about 2.7. Where the lengths of both
  // phases are known it follows from them exactly, so that totality begins
  // and ends in the picture when it does in the sky.
  let core = 2.7;
  if (total > 0 && magnitude > 1) {
    const k = (partial / total) ** 2;
    const solved = (magnitude * (magnitude - 1) * (1 - k)) / (magnitude - k * (magnitude - 1));
    if (solved > 2.3 && solved < 3.1) core = solved;
  }
  // At the middle of the eclipse the two centres are this far apart; the moon crosses at a steady pace.
  const nearest = core + 1 - 2 * magnitude;
  const pace = Math.sqrt(Math.max(0.01, (core + 1) ** 2 - nearest ** 2)) / (partial / 2); // moon radii a minute
  const along = pace * minutes;
  const apart = Math.hypot(along, nearest);
  if (apart > core + 1 + HALF_SHADOW) return NONE;
  // How much of the moon's width is inside the core, and inside the half-shadow round it.
  const inCore = Math.max(0, Math.min(1, (core + 1 - apart) / 2));
  const inHalf = Math.max(0, Math.min(1, (core + 1 + HALF_SHADOW - apart) / 2));
  const dark = 0.08 * inHalf + 0.9 * inCore * inCore * (3 - 2 * inCore);
  // The moon moves into the shadow eastward: the shadow comes onto it from its left, and leaves by its right.
  return { shadow: [along, -nearest, core, dark], stage: inCore >= 1 ? 2 : inCore > 0 ? 1 : 0 };
}

/** The Earth's shadow on the moon at a moment: nothing at all, except during an eclipse. */
export function earthShadowAt(ms: number): EarthShadow {
  for (const [when, , magnitude, partial, total] of ECLIPSES) {
    const minutes = (ms - Date.parse(when)) / 60_000;
    if (Math.abs(minutes) < partial / 2 + 90) return shadowAt(minutes, magnitude, partial, total);
  }
  return NONE;
}

/** A total eclipse to try things out with: `through` runs from 0 (not yet begun) by 0.5 (the middle of totality) to 1 (over). */
export function earthShadowTried(through: number): EarthShadow {
  return shadowAt((through - 0.5) * 340, 1.25, 210, 72);
}
