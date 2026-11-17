// The fishing boat's day. It lies at anchor in the bay through the night with
// its light on. A little before sunrise it weighs anchor and motors out
// through the sound between the long island and the islet, growing small, and
// spends the day working the ground out there, a speck near the horizon. A
// little after sunset it is home again by the same way. Leaving and returning
// each take twelve minutes. It keeps Sunday, as boats there do, and in a
// thunderstorm or a gale it stays in (or, if it is out, comes home).
//
// Where it is follows from the clock and that day's sunrise and sunset, so the
// same moment always finds it in the same place.

import { ANCHORAGE } from './scene/life';

const DAY = 86_400_000;
/** How long it takes to motor out, or home, in milliseconds. */
const TRIP = 12 * 60_000;
/** The fishing ground, far out in the sound. */
const GROUND = { x: -760, z: -2440 };
/** It sets off the way it was lying, then comes round onto its course. */
const ROUNDING = { x: ANCHORAGE.x + Math.cos(ANCHORAGE.yaw) * 60, z: ANCHORAGE.z - Math.sin(ANCHORAGE.yaw) * 60 };

export interface BoatPose {
  x: number;
  z: number;
  /** The way its bow points, as a turn about the upright axis. */
  yaw: number;
  /** How much larger than built it is drawn: far out it is helped to stay a speck that can be seen. */
  grow: number;
  /** How many pixels of the picture it is lifted just now by the swell (whole numbers: it rides as one piece). */
  rise: number;
  /** How far out it is, 0 at anchor to 1 on the fishing ground. */
  out: number;
}

/** What the boat needs to know of the weather: the wind's strength (0..1), the way it travels in the scene, and thunder. */
export interface SeaWeather {
  wind: number;
  windX: number;
  windZ: number;
  thunder: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => v * v * (3 - 2 * v);
const between = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** A number from 0 to 1 that is always the same for the same two whole numbers. */
function chance(a: number, b: number): number {
  let h = (Math.imul(a + 1, 374761393) ^ Math.imul(b + 7, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * How far out the boat should be at a moment, by the clock alone: 0 at anchor, 1 on the ground.
 * `sunrise` and `sunset` are those of any one day; they are carried to the day in question.
 */
export function tide(ms: number, sunrise: number, sunset: number): number {
  const light = Math.max(0, Math.min(DAY, sunset - sunrise));
  const latest = sunrise + Math.floor((ms - sunrise) / DAY) * DAY; // the last sunrise before now
  let out = 0;
  // (The day now ending, and the one about to begin: it leaves before the sun is up.)
  for (const rise of [latest, latest + DAY]) {
    const day = Math.round(rise / DAY);
    if (new Date(rise).getDay() === 0) continue; // Sunday
    // Away some minutes before sunrise, home some minutes after sunset, a little different each day.
    const leaves = rise - (20 - 13 * chance(day, 1)) * 60_000;
    const home = rise + light + (10 + 13 * chance(day, 2)) * 60_000;
    if (home - leaves < 2 * TRIP + 30 * 60_000) continue; // too short a day to be worth the trip
    out = Math.max(out, Math.min(clamp01((ms - leaves) / TRIP), clamp01((home - ms) / TRIP)));
  }
  return out;
}

export function createBoat() {
  let out = 0;
  let lastMs = NaN;
  let staying = false; // kept in by the weather
  let homeward = false;
  let swing = ANCHORAGE.yaw; // the way it lies at anchor: it swings a little toward the wind
  let facing = ANCHORAGE.yaw; // the way its bow points just now: it comes round to a new heading, it does not jump to it
  let clock = 0;

  return {
    /** Called every frame with the clock and one day's sunrise and sunset (all in milliseconds). */
    update(dt: number, ms: number, sunrise: number, sunset: number, weather: SeaWeather): BoatPose {
      clock += dt;
      // A gale or thunder keeps it in; it goes out again once that has well passed.
      staying = staying ? weather.wind > 0.66 || weather.thunder > 0.4 : weather.wind > 0.8 || weather.thunder > 0.5;
      const wanted = staying ? 0 : tide(ms, sunrise, sunset);
      // (When the page opens, or the clock is moved by hand, it is simply where it should be.)
      const jumped = !(Math.abs(ms - lastMs) < 120_000);
      if (jumped) {
        out = wanted;
        homeward = !staying && tide(ms + 5000, sunrise, sunset) < wanted;
      } else {
        // (If the clock is being held still by hand, it still makes its way by the time that really passes.)
        const step = Math.max(Math.abs(ms - lastMs), dt * 1000) / TRIP;
        if (wanted < out - 1e-9) homeward = true;
        else if (wanted > out + 1e-9) homeward = false;
        out = wanted > out ? Math.min(wanted, out + step) : Math.max(wanted, out - step);
      }
      lastMs = ms;

      // Along a long curve: slowly away from its mooring, steadily down the sound, slowly onto the ground.
      // (It moves in small steps, four a second, like the water it rides on.)
      const paced = Math.round(out * (TRIP / 250)) / (TRIP / 250);
      const u = smooth(paced);
      const a = ANCHORAGE;
      const c = ROUNDING;
      const g = GROUND;
      // On the ground it works slowly to and fro all day.
      const seconds = ms / 1000;
      const driftX = 150 * Math.sin(seconds / 1700) * u * u;
      const driftZ = 80 * Math.sin(seconds / 2600 + 1) * u * u;
      const x = (1 - u) * (1 - u) * a.x + 2 * u * (1 - u) * c.x + u * u * g.x + driftX;
      const z = (1 - u) * (1 - u) * a.z + 2 * u * (1 - u) * c.z + u * u * g.z + driftZ;
      const tx = (1 - u) * (c.x - a.x) + u * (g.x - c.x);
      const tz = (1 - u) * (c.z - a.z) + u * (g.z - c.z);
      const course = Math.atan2(-tz, tx) + (homeward ? Math.PI : 0);

      // At anchor it lies partly to the wind, bow toward where the wind comes from, and swings round slowly as that changes.
      const toWind = Math.atan2(weather.windZ, -weather.windX);
      const pull = clamp01((weather.wind - 0.03) / 0.12);
      const lie = ANCHORAGE.yaw + Math.max(-0.35, Math.min(0.35, between(ANCHORAGE.yaw, toWind))) * pull;
      swing += between(swing, lie) * (jumped ? 1 : 1 - Math.exp(-dt / 30));
      // Under way it points along its course; the turn between the two is made in the first and last half minute.
      const under = smooth(clamp01(paced / 0.045));
      const heading = swing + between(swing, course) * under;
      facing += between(facing, heading) * (jumped ? 1 : 1 - Math.exp(-dt / 2.5));

      const far = Math.hypot(x - a.x, z - a.z);
      // The swell: a slow rise and fall, a pixel of the picture at a time; more of it when it blows. Far out it is too small to show it.
      const swell = far > 420 ? 0 : weather.wind > 0.55 ? 2 : 1;
      const wave = Math.sin(clock * 0.98) + 0.45 * Math.sin(clock * 2.3 + 1);
      const rise = swell === 2 ? Math.round(clamp01(wave / 2.4 + 0.5) * 2) : wave > 0.2 ? swell : 0;
      // Turned in small steps, so that it is redrawn seldom.
      const notch = Math.PI / 60;
      return { x, z, yaw: Math.round(facing / notch) * notch, grow: 1 + Math.min(1, far / 1500), rise, out };
    },

    /** For testing: how far out it is, and whether the weather is keeping it in. */
    state: () => ({ out, staying, homeward }),
  };
}
