// The real night sky. The bright stars of the well-known constellations are
// placed where they actually are for your latitude, longitude and the current
// time, and turn with the sky through the night.
//
// The view in this scene looks a little south of due west, so what you see is
// whatever is going down in the west: the Summer Triangle on autumn evenings,
// Orion in the small hours of winter, and so on.
//
// Positions are right ascension (hours) and declination (degrees), epoch
// J2000, written from memory to about a quarter of a degree: plenty for stars
// drawn a pixel or two across, but not a substitute for a real catalogue.

import type { V3 } from '../scene/gl';

const J2000 = Date.UTC(2000, 0, 1, 12);

/** Star colours: white, blue-white, yellow, orange, red. */
type Tint = 0 | 1 | 2 | 3 | 4;

// [right ascension h, declination deg, magnitude, tint]
const STARS: [number, number, number, Tint][] = [
  // Orion
  [5.919, 7.41, 0.45, 4], [5.242, -8.2, 0.18, 1], [5.419, 6.35, 1.64, 1], [5.533, -0.3, 2.25, 1],
  [5.604, -1.2, 1.69, 1], [5.679, -1.94, 1.74, 1], [5.796, -9.67, 2.07, 1], [5.585, 9.93, 3.4, 1],
  // Taurus, the Hyades and the Pleiades
  [4.599, 16.51, 0.87, 3], [5.438, 28.61, 1.65, 1], [5.627, 21.14, 3.0, 1], [4.477, 19.18, 3.5, 3],
  [4.33, 15.63, 3.65, 3], [4.478, 15.87, 3.4, 0], [4.382, 17.54, 3.8, 3],
  [3.791, 24.11, 2.85, 1], [3.763, 24.11, 3.7, 1], [3.772, 24.47, 3.9, 1], [3.819, 24.05, 3.6, 1],
  [3.747, 24.29, 4.1, 1], [3.753, 24.55, 4.3, 1],
  // Canis Major and Minor
  [6.752, -16.72, -1.46, 1], [6.977, -28.97, 1.5, 1], [7.14, -26.39, 1.83, 2], [6.378, -17.96, 1.98, 1],
  [7.402, -29.3, 2.45, 1], [7.655, 5.22, 0.4, 2], [7.453, 8.29, 2.9, 1],
  // Gemini
  [7.755, 28.03, 1.16, 3], [7.577, 31.89, 1.58, 0], [6.629, 16.4, 1.93, 0], [6.383, 22.51, 2.87, 4], [6.732, 25.13, 3.0, 2],
  // Auriga and Perseus
  [5.278, 46.0, 0.08, 2], [5.992, 44.95, 1.9, 0], [5.995, 37.21, 2.65, 0], [4.95, 33.17, 2.69, 3],
  [3.405, 49.86, 1.8, 2], [3.136, 40.96, 2.1, 1],
  // Cassiopeia
  [0.675, 56.54, 2.24, 3], [0.153, 59.15, 2.28, 2], [0.945, 60.72, 2.15, 1], [1.43, 60.24, 2.66, 0], [1.907, 63.67, 3.35, 1],
  // Andromeda, Pegasus, Aries
  [0.14, 29.09, 2.07, 1], [1.162, 35.62, 2.07, 4], [2.065, 42.33, 2.1, 3],
  [23.079, 15.21, 2.49, 1], [23.063, 28.08, 2.44, 4], [0.221, 15.18, 2.83, 1], [21.736, 9.88, 2.38, 3],
  [2.12, 23.46, 2.0, 3], [1.911, 20.81, 2.64, 0],
  // Cygnus (the Northern Cross)
  [20.69, 45.28, 1.25, 0], [20.37, 40.26, 2.23, 2], [20.77, 33.97, 2.48, 3], [19.75, 45.13, 2.87, 1], [19.512, 27.96, 3.05, 3],
  // Lyra
  [18.616, 38.78, 0.03, 0], [18.835, 33.36, 3.5, 1], [18.982, 32.69, 3.25, 1],
  // Aquila and Delphinus
  [19.846, 8.87, 0.76, 0], [19.771, 10.61, 2.72, 3], [19.922, 6.41, 3.7, 2], [19.425, 3.11, 3.36, 0],
  [19.09, 13.86, 2.99, 0], [19.104, -4.88, 3.43, 1], [20.188, -0.82, 3.24, 1],
  [20.626, 14.6, 3.6, 2], [20.661, 15.91, 3.77, 1], [20.778, 16.12, 3.9, 3], [20.724, 15.07, 4.4, 2], [20.554, 11.3, 4.0, 1],
  // Ursa Major (the Plough) and Ursa Minor
  [11.062, 61.75, 1.8, 3], [11.031, 56.38, 2.37, 0], [11.897, 53.69, 2.44, 0], [12.257, 57.03, 3.3, 0],
  [12.9, 55.96, 1.77, 0], [13.399, 54.93, 2.23, 0], [13.792, 49.31, 1.86, 1],
  [2.53, 89.26, 1.98, 2], [14.845, 74.16, 2.08, 3], [15.345, 71.83, 3.0, 0],
  // Bootes, Corona Borealis, Hercules, Draco
  [14.261, 19.18, -0.05, 3], [14.75, 27.07, 2.37, 3], [13.911, 18.4, 2.68, 2], [14.535, 38.31, 3.0, 0], [15.032, 40.39, 3.5, 2],
  [15.578, 26.71, 2.2, 0],
  [16.504, 21.49, 2.77, 2], [16.688, 31.6, 2.8, 2], [16.715, 38.92, 3.5, 2], [17.251, 36.81, 3.15, 3], [17.005, 30.93, 3.9, 0], [17.244, 14.39, 3.1, 4],
  [17.943, 51.49, 2.24, 3], [17.507, 52.3, 2.8, 2], [21.31, 62.59, 2.45, 0],
  // Leo and Virgo
  [10.139, 11.97, 1.35, 1], [11.818, 14.57, 2.14, 0], [10.333, 19.84, 2.0, 3], [11.235, 20.52, 2.56, 0],
  [11.237, 15.43, 3.3, 0], [10.122, 16.76, 3.5, 0], [10.278, 23.42, 3.4, 2], [9.764, 23.77, 2.98, 2], [9.879, 26.01, 3.9, 3],
  [13.42, -11.16, 1.0, 1], [12.694, -1.45, 2.74, 2], [13.036, 10.96, 2.83, 2],
  // Scorpius and Sagittarius
  [16.49, -26.43, 1.0, 4], [16.006, -22.62, 2.3, 1], [16.091, -19.81, 2.6, 1], [17.56, -37.1, 1.6, 1], [17.622, -43.0, 1.87, 2],
  [16.836, -34.29, 2.3, 3], [15.981, -26.11, 2.9, 1], [16.353, -25.59, 2.9, 1], [16.598, -28.22, 2.8, 1],
  [18.403, -34.38, 1.85, 1], [18.921, -26.3, 2.05, 1], [19.044, -29.88, 2.6, 0], [18.35, -29.83, 2.7, 3],
  [18.466, -25.42, 2.8, 3], [18.097, -30.42, 3.0, 3], [18.761, -26.99, 3.2, 1],
  // Ophiuchus, Serpens, Libra
  [17.582, 12.56, 2.08, 0], [17.173, -15.72, 2.43, 0], [17.725, 4.57, 2.76, 3], [15.738, 6.43, 2.6, 3],
  [15.283, -9.38, 2.6, 1], [14.848, -16.04, 2.75, 0],
  // The autumn south: Fomalhaut, Capricornus, Aquarius, Cetus, Eridanus
  [22.961, -29.62, 1.16, 0], [21.784, -16.13, 2.85, 0], [20.35, -14.78, 3.05, 3], [21.526, -5.57, 2.9, 2], [22.096, -0.32, 2.95, 2],
  [0.727, -17.99, 2.04, 3], [3.038, 4.09, 2.54, 4], [5.131, -5.09, 2.78, 0], [1.629, -57.24, 0.46, 1],
  // Lepus, Hydra, Corvus
  [5.545, -17.82, 2.58, 2], [5.471, -20.76, 2.84, 2], [9.46, -8.66, 1.98, 3],
  [12.263, -17.54, 2.59, 1], [12.573, -23.4, 2.65, 2], [12.498, -16.52, 2.94, 0], [12.169, -22.62, 3.0, 3],
  // The far south: Centaurus, the Southern Cross, Carina and the rest
  [14.66, -60.83, -0.27, 2], [14.064, -60.37, 0.6, 1], [14.111, -36.37, 2.06, 3],
  [12.443, -63.1, 0.77, 1], [12.795, -59.69, 1.25, 1], [12.519, -57.11, 1.63, 4], [12.252, -58.75, 2.8, 1],
  [6.399, -52.7, -0.72, 0], [9.22, -69.72, 1.67, 0], [8.375, -59.51, 1.86, 3], [8.158, -47.34, 1.8, 1], [8.745, -54.71, 1.95, 0],
  [8.06, -40.0, 2.2, 1], [22.137, -46.96, 1.74, 1], [20.427, -56.74, 1.94, 1], [16.811, -69.03, 1.9, 3],
];

// Each star as a unit vector in the sky's own frame, worked out once.
const FIXED = STARS.map(([ra, dec, mag, tint]) => {
  const a = (ra / 24) * Math.PI * 2;
  const d = (dec * Math.PI) / 180;
  return { e: [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)] as V3, mag, tint };
});

/**
 * Which star of the list stands at a place in the sky (right ascension in
 * hours, declination in degrees), or -1 if none is within about half a degree.
 * The constellation figures name their stars this way.
 */
export function starIndex(raHours: number, decDeg: number): number {
  const at = fromRaDec(raHours, decDeg);
  let best = -1;
  let nearest = Math.cos((0.6 * Math.PI) / 180);
  FIXED.forEach((s, i) => {
    const d = s.e[0] * at[0] + s.e[1] * at[1] + s.e[2] * at[2];
    if (d > nearest) {
      nearest = d;
      best = i;
    }
  });
  return best;
}

function fromRaDec(raHours: number, decDeg: number): V3 {
  const a = (raHours / 24) * Math.PI * 2;
  const d = (decDeg * Math.PI) / 180;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}

// The north pole of our galaxy (the Milky Way is the great circle at right
// angles to it), and the direction of its centre, in Sagittarius, where the
// band is brightest and broadest.
const GALAXY_POLE = fromRaDec(12.857, 27.13);
const GALAXY_CORE = fromRaDec(17.761, -29.01);

// ---- the planets -------------------------------------------------------------
// Orbits of Venus, Earth, Mars, Jupiter and Saturn, as their size, shape, tilt,
// mean longitude, longitude of perihelion and longitude of the ascending node
// at the year 2000, each with its change per century. (The standard table of
// approximate elements, good to a fraction of a degree for 1800 to 2050.)
type Orbit = [number, number, number, number, number, number, number, number, number, number, number, number];
const VENUS: Orbit = [0.72333566, 0.0000039, 0.00677672, -0.00004107, 3.39467605, -0.0007889, 181.9790995, 58517.81538729, 131.60246718, 0.00268329, 76.67984255, -0.27769418];
const EARTH: Orbit = [1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668, 100.46457166, 35999.37244981, 102.93768193, 0.32327364, 0, 0];
const MARS: Orbit = [1.52371034, 0.00001847, 0.0933941, 0.00007882, 1.84969142, -0.00813131, -4.55343205, 19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343];
const JUPITER: Orbit = [5.202887, -0.00011607, 0.04838624, -0.00013253, 1.30439695, -0.00183714, 34.39644051, 3034.74612775, 14.72847983, 0.21252668, 100.47390909, 0.20469106];
const SATURN: Orbit = [9.53667594, -0.0012506, 0.05386179, -0.00050991, 2.48599187, 0.00193609, 49.95424423, 1222.49362201, 92.59887831, -0.41897216, 113.66242448, -0.28867794];

/** Where a body is round the sun, in the plane of the Earth's orbit (in units of the Earth's distance). */
function aroundSun(o: Orbit, T: number): V3 {
  const rad = Math.PI / 180;
  const a = o[0] + o[1] * T;
  const e = o[2] + o[3] * T;
  const tilt = (o[4] + o[5] * T) * rad;
  const L = o[6] + o[7] * T;
  const peri = o[8] + o[9] * T;
  const node = (o[10] + o[11] * T) * rad;
  const w = peri * rad - node;
  let M = (((L - peri) % 360) + 540) % 360 - 180;
  M *= rad;
  // Kepler's equation, solved by a few rounds of Newton's method.
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const px = a * (Math.cos(E) - e);
  const py = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const cn = Math.cos(node);
  const sn = Math.sin(node);
  const ci = Math.cos(tilt);
  const si = Math.sin(tilt);
  return [
    (cw * cn - sw * sn * ci) * px + (-sw * cn - cw * sn * ci) * py,
    (cw * sn + sw * cn * ci) * px + (-sw * sn + cw * cn * ci) * py,
    sw * si * px + cw * si * py,
  ];
}

/**
 * The four bright planets as seen from the Earth: their direction in the
 * sky's own frame, how bright they are, and their colour code.
 */
export function planetsAt(ms: number): { e: V3; mag: number; tint: number; name: string }[] {
  const T = (ms - J2000) / 86_400_000 / 36525;
  const earth = aroundSun(EARTH, T);
  const tilt = (23.4393 * Math.PI) / 180; // of the Earth's axis
  const seen = (o: Orbit, name: string, tint: number, base: number) => {
    const p = aroundSun(o, T);
    const x = p[0] - earth[0];
    const y = p[1] - earth[1];
    const z = p[2] - earth[2];
    const far = Math.hypot(x, y, z);
    const near = Math.hypot(p[0], p[1], p[2]);
    // Brighter when closer to us and to the sun (a rough rule; phase is ignored).
    // Without its phase Venus would come out far too bright when it is near us, so cap it at its real best.
    const mag = Math.max(-4.6, base + 5 * Math.log10(far * near));
    const e: V3 = [x / far, (y * Math.cos(tilt) - z * Math.sin(tilt)) / far, (y * Math.sin(tilt) + z * Math.cos(tilt)) / far];
    return { e, mag, tint, name };
  };
  return [seen(VENUS, 'Venus', 5, -4.4), seen(JUPITER, 'Jupiter', 6, -9.4), seen(MARS, 'Mars', 7, -1.5), seen(SATURN, 'Saturn', 8, -8.9)];
}


export interface Heavens {
  /**
   * Turns a direction in the scene (x north, y up, z east) into the sky's own
   * frame, as a 3x3 matrix by columns. The faint background stars are placed
   * with it, so they turn with the real ones.
   */
  turn: number[];
  /** The galactic pole and the galactic centre, as directions in the scene. */
  galaxy: V3;
  core: V3;
  /**
   * The planets and stars now in the part of the sky you can see: direction x, y, z,
   * then (magnitude + 5) + 20 x colour code. Codes 0 to 4 are star colours; 5 to 8
   * are Venus, Jupiter, Mars and Saturn, which shine steadily where stars twinkle.
   */
  stars: number[];
  count: number;
  /** For each of those in turn, which star of the list it is (-1 for a planet). */
  ids: number[];
  /**
   * The meteor shower under way, if there is one: how strong it is tonight
   * (1 for the best of the year at its peak) and the point in the sky its
   * meteors seem to come from, as a direction in the scene.
   */
  shower: { name: string; strength: number; radiant: V3 } | null;
  /** Every star of the list, in view or not, as a direction in the scene: x, y, z for each in turn. */
  where: Float32Array;
}

/**
 * The year's meteor showers: the night each is at its best (month, day), where
 * in the sky its meteors seem to come from (right ascension in hours,
 * declination in degrees), how many an hour a watcher under a dark sky might
 * count at the peak, and over how many days either side it fades.
 */
const SHOWERS: [string, number, number, number, number, number, number][] = [
  ['quadrantids', 1, 3, 15.33, 49.5, 110, 0.6],
  ['lyrids', 4, 22, 18.07, 34, 18, 1.2],
  ['eta aquariids', 5, 6, 22.5, -1, 50, 3],
  ['delta aquariids', 7, 30, 22.67, -16, 25, 4],
  ['perseids', 8, 12, 3.2, 58, 100, 2],
  ['orionids', 10, 21, 6.33, 16, 20, 2.5],
  ['leonids', 11, 17, 10.13, 22, 15, 1.2],
  ['geminids', 12, 14, 7.47, 33, 150, 1.3],
  ['ursids', 12, 22, 14.47, 76, 10, 0.8],
];

/** Most stars the sky shader will draw at once. */
export const MAX_STARS = 96;

/**
 * Where the sky is for an observer and a moment. `facing` is the scene's view
 * direction (x north, z east); only stars within reach of it are returned.
 */
export function heavensAt(ms: number, latitude: number, longitude: number, facing: V3, reach = 0.35): Heavens {
  const days = (ms - J2000) / 86_400_000;
  // Sidereal time: how far the sky has turned.
  const turnHours = (18.697374558 + 24.06570982441908 * days + longitude / 15) % 24;
  const th = (turnHours / 24) * Math.PI * 2;
  const lat = (latitude * Math.PI) / 180;
  // North, up and east at your spot, written in the sky's frame.
  const north: V3 = [-Math.sin(lat) * Math.cos(th), -Math.sin(lat) * Math.sin(th), Math.cos(lat)];
  const up: V3 = [Math.cos(lat) * Math.cos(th), Math.cos(lat) * Math.sin(th), Math.sin(lat)];
  const east: V3 = [-Math.sin(th), Math.cos(th), 0];
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const toScene = (e: V3): V3 => [dot(e, north), dot(e, up), dot(e, east)];

  const where = new Float32Array(FIXED.length * 3);
  FIXED.forEach((s, i) => where.set(toScene(s.e), i * 3));

  // Everything up and within `reach` of where you face (the cosine of how far
  // off that may be). If that is more than can be drawn, the faintest go.
  const inView: { w: V3; code: number; mag: number; id: number }[] = [];
  const planets = planetsAt(ms);
  [...planets, ...FIXED].forEach((s, i) => {
    const w = toScene(s.e);
    if (w[1] < 0.01) return; // below the horizon
    if (dot(w, facing) < reach) return; // well out of view, even looking round
    inView.push({ w, code: s.mag + 5 + 20 * s.tint, mag: s.mag, id: i - planets.length });
  });
  if (inView.length > MAX_STARS) inView.sort((a, b) => a.mag - b.mag).length = MAX_STARS;
  const stars: number[] = [];
  for (const s of inView) stars.push(s.w[0], s.w[1], s.w[2], s.code);
  const count = inView.length;
  const ids = inView.map((s) => Math.max(-1, s.id));

  // Which meteor shower, if any, is under way on this date.
  let shower: Heavens['shower'] = null;
  const date = new Date(ms);
  for (const [name, month, day, ra, dec, rate, spread] of SHOWERS) {
    let peak = Date.UTC(date.getUTCFullYear(), month - 1, day, 6);
    // The nearest peak may be last year's or next year's, either side of new year.
    if (ms - peak > 183 * 86_400_000) peak = Date.UTC(date.getUTCFullYear() + 1, month - 1, day, 6);
    if (peak - ms > 183 * 86_400_000) peak = Date.UTC(date.getUTCFullYear() - 1, month - 1, day, 6);
    const away = (ms - peak) / 86_400_000 / spread;
    const strength = (rate / 150) * Math.exp(-0.5 * away * away);
    if (strength > 0.02 && (!shower || strength > shower.strength)) shower = { name, strength, radiant: toScene(fromRaDec(ra, dec)) };
  }
  while (stars.length < MAX_STARS * 4) stars.push(0, -1, 0, 20);

  return { turn: [...north, ...up, ...east], galaxy: toScene(GALAXY_POLE), core: toScene(GALAXY_CORE), stars, count, ids, where, shower };
}

/**
 * The moon's phase, from where the sun and moon really are along the
 * zodiac (good to a small fraction of a degree, so to well under an hour of
 * the true phase). Returns 0 at new moon, 0.25 at first quarter, 0.5 at full.
 */
export function moonPhaseAt(ms: number): number {
  const d = (ms - J2000) / 86_400_000;
  const T = d / 36525;
  const rad = Math.PI / 180;
  const sin = (deg: number) => Math.sin(deg * rad);
  const g = 357.528 + 0.9856003 * d;
  const sun = 280.46 + 0.9856474 * d + 1.915 * sin(g) + 0.02 * sin(2 * g);
  const moon =
    218.32 + 481267.881 * T +
    6.29 * sin(135.0 + 477198.87 * T) -
    1.27 * sin(259.3 - 413335.36 * T) +
    0.66 * sin(235.7 + 890534.22 * T) +
    0.21 * sin(269.9 + 954397.74 * T) -
    0.19 * sin(357.5 + 35999.05 * T) -
    0.11 * sin(186.5 + 966404.03 * T);
  const apart = (((moon - sun) % 360) + 360) % 360;
  return apart / 360;
}
