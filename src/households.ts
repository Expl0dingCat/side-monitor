// The people of the place keep their own hours. Each household lights its
// windows as the day goes, at its own moment: one house is always first with a
// lamp and another always last. Through the evening the light moves from the
// kitchen to the bedroom, and then goes out at that house's bedtime, somewhere
// between half past nine and half past midnight (later on a Friday or a
// Saturday). One house in the far village sits up until three or so. On dark
// winter mornings the early risers light a lamp again from about six, until
// the day comes. The lantern by a meadow house's door burns while anyone in
// that house is up. The church keeps its own sense: a light until the nine
// o'clock bell, later on a Saturday and on the eves of Christmas and the new
// year, and on a dark Sunday morning.
//
// Everything here follows from the clock, the date and how dark it is, so the
// same moment always shows the same windows. A window never snaps: it comes up
// or goes down over a few seconds.

import { HOMES } from './scene/land';

/** A house has three rooms with glass in them: behind either gable, and beside the door. */
const ROOMS = 3;
const COUNT = HOMES.length;
const CHURCH = COUNT - 1;
/** The house in the far village that sits up late: high on the slope, where its light can be seen from the meadow. */
const NIGHT_OWL = 13;
/** How long a window takes to come up or go down, in seconds. */
const FADE = 4.5;

/** A number from 0 to 1 that is always the same for the same two whole numbers. */
function chance(a: number, b: number): number {
  let h = (Math.imul(a + 1, 374761393) ^ Math.imul(b + 7, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Each household's place in the order of things, 0..1 and evenly spread, so no two share a moment. `turn` picks which order. */
function standing(turn: number): number[] {
  const houses = Array.from({ length: CHURCH }, (_, i) => i);
  houses.sort((p, q) => chance(p, turn) - chance(q, turn));
  const out: number[] = [];
  houses.forEach((house, place) => (out[house] = place / (CHURCH - 1)));
  return out;
}
const DUSK_ORDER = standing(11);
const BED_ORDER = standing(23);
const WAKE_ORDER = standing(37);

/** How dark it is, by the measure the lamps go by: 0 in full day, 1 at night, and a little for heavy cloud and rain. */
export function darkness(dayness: number, cloud: number, rain: number, snow: number): number {
  return 1 - dayness + cloud ** 1.4 * 0.25 + Math.min(1, rain + snow * 0.4) * 0.2;
}

/**
 * Which rooms are lit at a moment: three numbers (0 or 1) for each household, the church last.
 * `clock` is the hour on the wall and `day` the date. `held` is what is lit just now, so that
 * a lamp lit at the edge of dusk is not put out again by a passing cloud.
 */
export function litRooms(clock: number, day: Date, dark: number, held?: ArrayLike<number>): number[] {
  // Before five in the morning it is still last night.
  const late = clock < 5;
  const hour = late ? clock + 24 : clock;
  const evening = new Date(day.getFullYear(), day.getMonth(), day.getDate() - (late ? 1 : 0), 12);
  const night = Math.round(evening.getTime() / 86_400_000); // a number for this night, to make each a little different
  const weekday = evening.getDay();
  const out: number[] = [];
  const dim = (i: number, at: number, room: number) => dark > at - (held && held[i * ROOMS + room] > 0.5 ? 0.04 : 0);

  for (let i = 0; i < CHURCH; i++) {
    const lightsAt = 0.3 + 0.58 * DUSK_ORDER[i] + 0.02 * chance(i, night);
    let bed = 21.5 + 3 * BED_ORDER[i] + 0.12 * (chance(i, night + 1000) - 0.5);
    if (weekday === 5 || weekday === 6) bed += 0.65;
    if (i === NIGHT_OWL) bed = 27.2 + 0.5 * chance(i, night + 2000);
    // Which gable the bedroom is behind; the best room is behind the other.
    const bedroom = chance(i, 5) < 0.5 ? 0 : 1;
    const rooms = [0, 0, 0];
    if (hour >= 12 && hour < bed) {
      rooms[2] = dim(i, lightsAt, 2) && hour < bed - 0.6 ? 1 : 0;
      rooms[1 - bedroom] = dim(i, lightsAt + 0.05, 1 - bedroom) && hour < bed - 0.22 ? 1 : 0;
      rooms[bedroom] = dim(i, lightsAt, bedroom) && hour > bed - 0.75 ? 1 : 0;
    }
    // Morning: the early risers, until it is properly light. (They lie in at the weekend.)
    const today = day.getDay();
    const wake = 6 + 1.5 * WAKE_ORDER[i] + 0.1 * (chance(i, night + 3000) - 0.5) + (today === 0 || today === 6 ? 0.9 : 0);
    if (!late && clock < 12 && clock >= wake && chance(i, 9) > 0.3 && i !== NIGHT_OWL) {
      const dayAt = 0.22 + 0.3 * DUSK_ORDER[i];
      rooms[2] = dim(i, dayAt, 2) ? 1 : 0;
      rooms[bedroom] = dim(i, dayAt, bedroom) && clock < wake + 0.3 ? 1 : 0;
    }
    out.push(...rooms);
  }

  // The church.
  const eve = evening.getMonth() === 11 && (evening.getDate() === 24 || evening.getDate() === 31);
  const until = eve ? 24.5 : weekday === 6 ? 22 : 21;
  const sunday = !late && day.getDay() === 0 && clock >= 9.5 && clock < 13;
  const church = dim(CHURCH, 0.55, 0) && ((hour >= 12 && hour < until) || sunday) ? 1 : 0;
  out.push(church, church, church);
  return out;
}

export function createHouseholds() {
  const level = new Float32Array(COUNT * ROOMS); // how far each window has come up, 0..1
  const shown: number[] = new Array(COUNT * ROOMS).fill(0);
  let lastClock = NaN;
  let lastDark = 0;
  let rooms: number[] = [];

  return {
    /** Called every frame with the hour on the wall, the date and how dark it is; returns how brightly each room's glass is lit. */
    update(dt: number, clock: number, day: Date, dark: number): number[] {
      // The page has just opened, or the clock or the weather has been moved by hand: show that moment as it stands.
      const moved = Math.abs(clock - lastClock);
      const jumped = !(Math.min(moved, 24 - moved) < 0.03) || Math.abs(dark - lastDark) > 0.12;
      rooms = litRooms(clock, day, dark, jumped ? undefined : rooms);
      lastClock = clock;
      lastDark = dark;
      for (let k = 0; k < level.length; k++) {
        const want = rooms[k];
        level[k] = jumped ? want : want > level[k] ? Math.min(want, level[k] + dt / FADE) : Math.max(want, level[k] - dt / FADE);
        const v = level[k];
        shown[k] = v * v * (3 - 2 * v);
      }
      return shown;
    },

    /** The lanterns by the doors of the four meadow houses: each burns while any room of its house is lit. */
    lanterns: () => [0, 1, 2, 3].map((i) => Math.max(shown[i * ROOMS], shown[i * ROOMS + 1], shown[i * ROOMS + 2])),

    /** For testing: which rooms are lit, a row of three marks for each household (gable, gable, by the door). */
    lit: () => Array.from({ length: COUNT }, (_, i) => [0, 1, 2].map((r) => (rooms[i * ROOMS + r] ? '*' : '.')).join('')).join(' '),
    levels: () => [...shown],
  };
}
