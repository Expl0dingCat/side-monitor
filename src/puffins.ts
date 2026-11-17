// Puffins. They come to the islands to nest in May and are gone to sea again
// by the end of August; outside those months there are none. While they are
// here a few stand about on the rocks and the turf, turning their heads now
// and then to look round, and by day a couple at a time go whirring low over
// the water. At night they sit still with their bills tucked into their backs.
//
// The first arrive on the first of May and the rest over the days that
// follow; they leave the same way, one by one, at the end of August.

/** How one standing bird holds its head: turned to one side, and tipped. */
export interface PuffinLook {
  turn: number;
  tilt: number;
}

/** A number from 0 to 1 that is always the same for the same two whole numbers. */
function chance(a: number, b: number): number {
  let h = (Math.imul(a + 1, 374761393) ^ Math.imul(b + 7, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Which of `count` birds are about on a date: the first comes on 1 May, another every day or two after; they leave in the same order reversed. */
export function about(day: Date, count: number): boolean[] {
  const month = day.getMonth();
  const here: boolean[] = new Array(count).fill(false);
  if (month < 4 || month > 7) return here;
  const since = Math.round((new Date(day.getFullYear(), month, day.getDate(), 12).getTime() - new Date(day.getFullYear(), 4, 1, 12).getTime()) / 86_400_000);
  const left = 122 - since; // days until the last of August
  for (let i = 0; i < count; i++) here[i] = Math.min(since, left) >= i * 1.5;
  return here;
}

/** The ways a puffin looks about: straight ahead, to either side, over a shoulder. */
const LOOKS = [0, 0.55, -0.55, 1.15, -1.15, 0, 0.3, -0.85, 1.5, -0.3];
/** Asleep: its head turned right round, and its bill down among the feathers of its back. */
const TUCKED = { turn: 2.55, tilt: -0.35 };
/** Its head moves in steps, this many a second, and so far at each. */
const STEPS = 10;
const STEP = 0.42;

export function createPuffins(count: number) {
  const looks: PuffinLook[] = Array.from({ length: count }, () => ({ turn: 0, tilt: 0 }));
  const asleep: boolean[] = new Array(count).fill(false);
  let time = NaN; // seconds since midnight by the clock, carried on smoothly from when the page opened
  let stepped = 0;

  return {
    /**
     * Called every frame with the hour on the wall, the date, how dark it is (0 day to 1 night) and the rain.
     * Returns each standing bird's look (null for one that is not here), how many are flying, and the time their flights keep.
     */
    update(dt: number, clock: number, day: Date, dark: number, rain: number): { birds: (PuffinLook | null)[]; flying: number; time: number } {
      const first = Number.isNaN(time);
      // The time by the wall clock when the page opens (so the same moment shows the same birds), then counted on from there.
      if (first || Math.abs(clock * 3600 - time) > 120) time = clock * 3600;
      else time += dt;
      const here = about(day, count);
      const tick = Math.floor(time * STEPS);
      const move = first || tick !== stepped;
      stepped = tick;
      const birds = looks.map((look, i) => {
        if (!here[i]) return null;
        // Each goes to sleep at its own point in the dusk, and wakes at its own point in the dawn.
        asleep[i] = dark > 0.62 + 0.3 * chance(i, 9) - (asleep[i] ? 0.08 : 0);
        // Awake, it holds one look for some seconds and then takes another.
        const every = 4.5 + 7 * chance(i, 3);
        const which = Math.floor(time / every + 10 * chance(i, 4));
        const want = asleep[i] ? TUCKED : { turn: LOOKS[Math.floor(chance(i * 31 + which, 7) * LOOKS.length)], tilt: chance(i * 17 + which, 8) < 0.2 ? 0.18 : 0 };
        if (first) Object.assign(look, want);
        else if (move) {
          look.turn += Math.max(-STEP, Math.min(STEP, want.turn - look.turn));
          look.tilt += Math.max(-0.18, Math.min(0.18, want.tilt - look.tilt));
        }
        return look;
      });
      // On the wing by day, in anything short of heavy rain: up to three, fewer early and late in the season.
      const present = here.filter(Boolean).length;
      const flying = dark < 0.45 && rain < 0.4 ? Math.min(3, Math.ceil(present / 2)) : 0;
      return { birds, flying, time };
    },
  };
}
