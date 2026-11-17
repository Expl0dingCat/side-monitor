import { moonPhaseAt } from '../sky/stars';

// The environment the scene is drawn from: a handful of 0..1 numbers for the
// weather, plus where the sun and moon are.

export interface Weather {
  /** Rain intensity, 0 (dry) to 1 (downpour). */
  rain: number;
  /** Snowfall intensity, 0 to 1. */
  snow: number;
  /** Wind as the direction it travels across the pond (x = east, z = south), length 0..1. */
  windX: number;
  windZ: number;
  /** Cloud cover, 0 to 1. */
  cloud: number;
  /** Fog, 0 (clear air) to 1 (dense). */
  fog: number;
  /** Thunderstorm, 0 or 1. */
  thunder: number;
  /** Air temperature in Celsius. */
  temp: number;
  /** The dew point in Celsius: how cold the air would have to get for dew to settle out of it. */
  dewPoint: number;
  /** Depth of snow lying on the ground, in metres. */
  snowDepth: number;
  /**
   * Cloud by the height it floats at, each 0..1: low (heaped cumulus and grey
   * decks), middle (rippled sheets) and high (streaks of cirrus).
   */
  cloudLow: number;
  cloudMid: number;
  cloudHigh: number;
  /** The wind up where the clouds are, as the direction it travels (x = east, z = south), length 0..1. */
  aloftX: number;
  aloftZ: number;
  /** Rain or snow on its way: 0 while none is in sight, rising to 1 as it arrives. */
  front: number;
  /** Whether what is coming is snow, 0..1. */
  frontSnow: number;
  /**
   * Rain or snow falling somewhere round about, though not here: which way it
   * lies (x = east, z = south), with a length of how plainly it can be seen, 0..1.
   */
  aroundX: number;
  aroundZ: number;
  /** Whether what is falling over there is snow, 0..1. */
  aroundSnow: number;
  /** Smoke (or dust) in the air: 0 on any ordinary day, 1 when it is thick. */
  smoke: number;
}

export interface Sky {
  /** Sun height: 1 at midday, 0 at sunrise and sunset, -1 in the middle of the night. */
  height: number;
  /** 0 at night, 1 in full daylight. */
  dayness: number;
  /** 1 right at sunrise or sunset, fading to 0 either side. */
  twilight: number;
  /** Whether the nearest twilight is the morning one. */
  dawn: boolean;
  /** 0..1 through the current day (if the sun is up) or the current night. */
  progress: number;
  /** Moon phase: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
  moonPhase: number;
  /** Fraction of the moon's disc that is lit. */
  moonLit: number;
  /** Time of year: 1 at midsummer, 0 at midwinter. */
  summer: number;
  /** During an eclipse of the moon: how much of its light the Earth's shadow has taken, 0..1. */
  eclipsed?: number;
}

export interface Env extends Weather {
  sky: Sky;
}

export const CALM: Weather = {
  rain: 0,
  snow: 0,
  windX: 0.08,
  windZ: 0,
  cloud: 0.1,
  fog: 0,
  thunder: 0,
  temp: 12,
  dewPoint: 6,
  snowDepth: 0,
  cloudLow: 0.1,
  cloudMid: 0,
  cloudHigh: 0,
  aloftX: 0.1,
  aloftZ: 0,
  front: 0,
  frontSnow: 0,
  aroundX: 0,
  aroundZ: 0,
  aroundSnow: 0,
  smoke: 0,
};

const DAY_MS = 86_400_000;

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * Where the sun is at `ms`, given one sunrise and sunset (any day; they are
 * shifted by whole days to bracket `ms`).
 */
export function skyAt(ms: number, sunrise: number, sunset: number, southern = false): Sky {
  // Midsummer is around 21 June in the north, 21 December in the south.
  const yearAngle = ((ms - Date.UTC(2001, 5, 21)) / (365.2425 * DAY_MS)) * 2 * Math.PI;
  const summer = 0.5 + 0.5 * Math.cos(yearAngle) * (southern ? -1 : 1);

  const dayLen = Math.max(60_000, Math.min(DAY_MS - 60_000, sunset - sunrise));
  const sr = sunrise + Math.floor((ms - sunrise) / DAY_MS) * DAY_MS; // latest sunrise before now
  const ss = sr + dayLen;

  let height: number;
  let progress: number;
  let dawn: boolean;
  if (ms <= ss) {
    progress = (ms - sr) / dayLen;
    height = Math.sin(Math.PI * progress);
    dawn = progress < 0.5;
  } else {
    progress = (ms - ss) / (DAY_MS - dayLen);
    height = -Math.sin(Math.PI * progress);
    dawn = progress > 0.5;
  }

  const twilight = height >= 0 ? 1 - smoothstep(0, 0.34, height) : 1 - smoothstep(0, 0.2, -height);
  const moonPhase = moonPhaseAt(ms);
  return {
    height,
    progress,
    dawn,
    twilight,
    dayness: smoothstep(-0.12, 0.24, height),
    moonPhase,
    moonLit: (1 - Math.cos(2 * Math.PI * moonPhase)) / 2,
    summer,
  };
}

/** Move `cur` toward `target`. `tau` is the time constant in seconds. */
export function easeWeather(cur: Weather, target: Weather, dt: number, tau: number): void {
  const k = tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);
  for (const key of Object.keys(cur) as (keyof Weather)[]) {
    cur[key] += (target[key] - cur[key]) * k;
  }
}
