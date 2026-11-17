// The almanac: the place remembers what you have seen together. While the
// page is open it keeps a small record, each thing with its day: the first
// snow of each winter, thunderstorms, nights the northern lights showed, full
// moons, nights of a meteor shower, the solstices and equinoxes, fires burned
// to the end, the day the lamb was named, your best count of skips.
//
// It shows in two ways. When you lean in to the stone to write, a few quiet
// lines of the same script hang apart from your own (over the stone in a wide
// window, under it in a tall one): the latest things, and what happened a
// year ago today if anything did. And for each thing remembered a small stone
// is laid on the old stone, so that months of looking can be seen from where
// you stand.
//
// Only what the real sky does is kept. While the weather or the date is being
// forced for a trial (see debug.ts) what is seen is remembered for the length
// of the trial and then forgotten, so trying things out leaves no mark.

import type { V3 } from './scene/gl';
import { land, STONE, TOKENS } from './scene/land';
import './stone.css';

const KEY = 'nightpond.almanac';
const MOST = 400; // the oldest are let go past this

export type Kind = 'snow' | 'thunder' | 'lights' | 'moon' | 'meteors' | 'sun' | 'fire' | 'named' | 'skips' | 'sight';
const KINDS: Kind[] = ['named', 'sight', 'snow', 'sun', 'lights', 'meteors', 'moon', 'thunder', 'skips', 'fire']; // the rarest first

interface Entry {
  k: Kind;
  /** The day, by your clock, as yyyy-mm-dd. (A night belongs to the day it began on.) */
  d: string;
  /** How many: fires burned down that day, or skips of the stone. */
  n?: number;
  /** Which: the shower, the turn of the year (0 to 3, counted from March), or the lamb's name. */
  w?: string;
}

/** What the sky is doing, as much of it as the almanac cares about. */
export interface Sight {
  /** South of the equator the seasons fall the other way round. */
  south: boolean;
  snow: number;
  snowDepth: number;
  /** The northern lights (0..1), and how well the stars show (0..1). */
  lights: number;
  stars: number;
  /** The moon's phase (0.5 is full), and how well it shows (0..1). */
  moonPhase: number;
  moonSeen: number;
  shower: { name: string; strength: number } | null;
  /** The best count of skips so far. */
  best: number;
}

const DAY = 86_400_000;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const UNITS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
/** A number in words, as far as ninety-nine. */
const inWords = (n: number): string => (n < 20 ? UNITS[n] : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? `-${UNITS[n % 10]}` : '') : String(n));
const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${inWords(n)} times`);

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Noon on a day, from its key. */
const dayOf = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};
/** A day as it is written here: "nov 16", or "nov 2025" once it is most of a year ago. */
function dayWords(key: string, today: Date): string {
  const [y, m, d] = key.split('-').map(Number);
  const monthsAgo = (today.getFullYear() - y) * 12 + today.getMonth() - (m - 1);
  return monthsAgo >= 11 ? `${MONTHS[m - 1]} ${y}` : `${MONTHS[m - 1]} ${d}`;
}

/** The season a day falls in, and a name for that one season of that one year. */
function seasonOf(day: Date, south: boolean): { name: string; id: string } {
  const month = (day.getMonth() + (south ? 6 : 0)) % 12;
  const name = month === 11 || month < 2 ? 'winter' : month < 5 ? 'spring' : month < 8 ? 'summer' : 'autumn';
  // December belongs with the January that follows it.
  const year = day.getFullYear() + (day.getMonth() === 11 ? 1 : 0);
  return { name, id: `${year} ${name}` };
}
/** Which winter a day belongs to, counting the whole cold half of the year as one. */
const winterOf = (day: Date, south: boolean) => (south ? day.getFullYear() : day.getFullYear() - (day.getMonth() < 6 ? 1 : 0));

/**
 * The four turns of a year: the March equinox, the June solstice, the
 * September equinox and the December solstice, as moments in time (good to a
 * quarter of an hour, by the mean formulas in Meeus's Astronomical Algorithms).
 */
function turnsOf(year: number): number[] {
  const y = (year - 2000) / 1000;
  const days = [
    2451623.80984 + 365242.37404 * y + 0.05169 * y * y - 0.00411 * y ** 3 - 0.00057 * y ** 4,
    2451716.56767 + 365241.62603 * y + 0.00325 * y * y + 0.00888 * y ** 3 - 0.0003 * y ** 4,
    2451810.21715 + 365242.01767 * y - 0.11575 * y * y + 0.00337 * y ** 3 + 0.00078 * y ** 4,
    2451900.05952 + 365242.74049 * y - 0.06223 * y * y - 0.00823 * y ** 3 + 0.00032 * y ** 4,
  ];
  return days.map((jd) => (jd - 2440587.5) * DAY - 69_000); // (the formulas keep a clock about 69 seconds ahead of ours)
}
const TURNS = ['spring equinox', 'summer solstice', 'autumn equinox', 'winter solstice'];
const turnName = (which: number, south: boolean) => TURNS[(which + (south ? 2 : 0)) % 4];

/** What a thing remembered is called, by itself. */
function nameOf(e: Entry, south: boolean): string {
  switch (e.k) {
    case 'snow':
      return 'first snow';
    case 'thunder':
      return 'thunder';
    case 'lights':
      return south ? 'southern lights' : 'northern lights';
    case 'moon':
      return 'full moon';
    case 'meteors':
      return `the ${e.w ?? 'shooting stars'}`;
    case 'sun':
      return turnName(Number(e.w ?? 0), south);
    case 'fire':
      return (e.n ?? 1) > 1 ? `${inWords(e.n ?? 1)} fires burned to the end` : 'a fire burned to the end';
    case 'named':
      return `the lamb was named ${e.w ?? ''}`.trim();
    case 'skips':
      return `${inWords(e.n ?? 0)} skip${e.n === 1 ? '' : 's'}`;
    case 'sight':
      return e.w ?? 'something rare';
  }
}

/** How many stones the old stone has earned: one for each of the first dozen things, then more slowly, so that it is months in the filling. */
const stonesFor = (things: number) => Math.min(TOKENS, things <= 12 ? things : things <= 36 ? 12 + Math.floor((things - 12) / 2) : 24 + Math.floor((things - 36) / 4));

/** A drop that lands with a couple of small bounces: 1 at the start, 0 at rest. */
const bounce = (t: number) => Math.abs(Math.cos(t * Math.PI * 2.5)) * (1 - t) ** 2;

/** The air over the stone's crown and the grass at its foot: where the passage hangs, in a wide window and a tall one. */
const FOOT = land(STONE.x, STONE.z) - 0.2;
export const ALMANAC_OVER: V3 = [STONE.x, FOOT + 0.5 + STONE.height + 0.62, STONE.z];
export const ALMANAC_UNDER: V3 = [STONE.x + 1.1 * Math.sin(STONE.yaw), FOOT - 0.12, STONE.z + 1.1 * Math.cos(STONE.yaw)];

/**
 * `say` shows a few passing words. `forced` says whether the weather or the
 * date is being forced for a trial: null if not, otherwise by how many days
 * the date is put on.
 */
export function createAlmanac(say: (words: string) => void, forced: () => number | null) {
  let kept: Entry[] = [];
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (Array.isArray(stored?.seen)) kept = stored.seen.filter((e: Entry) => e && KINDS.includes(e.k) && /^\d{4}-\d\d-\d\d$/.test(e.d));
  } catch {
    // Storage can be unavailable; then it remembers only while the page is open.
  }
  const keep = () => {
    if (kept.length > MOST) kept = kept.slice(kept.length - MOST);
    try {
      localStorage.setItem(KEY, JSON.stringify({ seen: kept }));
    } catch {
      // Remembered until the page is closed.
    }
  };

  /** Things seen while the weather or the date was forced: shown with the rest for as long as that lasts, and never kept. */
  let trials: Entry[] = [];
  let trial = false;
  let days = 0;
  let south = false;
  const all = () => (trial ? [...kept, ...trials] : kept);
  const today = () => new Date(Date.now() + (trial ? days : 0) * DAY);
  // What the sky has to keep doing, look after look, before it counts as seen.
  const held = { snow: 0, lights: 0, moon: 0, meteors: 0 };
  let sunDay = '';
  /** Find out whether a trial is on, before anything is read or remembered. When one ends, what it showed is forgotten. */
  function mode(): void {
    const put = forced();
    if ((put !== null) === trial && (put ?? 0) === days) return;
    if (put === null) trials = [];
    trial = put !== null;
    days = put ?? 0;
    held.snow = held.lights = held.moon = held.meteors = 0;
    sunDay = '';
  }

  // If several things are first seen at once, each is said in its turn and not one over another.
  let quietAt = 0;
  const tell = (words: string) => {
    const now = performance.now();
    const at = Math.max(now, quietAt);
    quietAt = at + 3400;
    window.setTimeout(() => say(words), at - now);
  };

  // The stones on the old stone. Those earned before the page opened are simply there; one earned now drops into place.
  let stones = stonesFor(kept.length);
  let dropT = 1;

  /**
   * Remember a thing, unless it is already remembered (a snow once a winter,
   * a storm once a day, a moon once a month, and so on). The first of its
   * kind is marked with a few passing words.
   */
  function remember(k: Kind, more: { n?: number; w?: string; on?: Date; quietly?: boolean } = {}): void {
    const now = more.on ?? today();
    // What belongs to a night is filed under the day the night began on.
    const nightly = k === 'lights' || k === 'moon' || k === 'meteors';
    const d = dayKey(nightly && !more.on ? new Date(now.getTime() - DAY / 2) : now);
    const seen = all();
    const of = seen.filter((e) => e.k === k);
    const list = trial ? trials : kept;
    let words = '';
    if (k === 'snow') {
      if (of.some((e) => winterOf(dayOf(e.d), south) === winterOf(dayOf(d), south))) return;
      words = 'first snow';
    } else if (k === 'thunder') {
      if (of.some((e) => e.d === d)) return;
      if (!of.length) words = 'first thunder';
    } else if (k === 'lights') {
      if (of.some((e) => e.d === d)) return;
      if (!of.length) words = south ? 'the southern lights' : 'the northern lights';
    } else if (k === 'moon') {
      if (of.some((e) => Math.abs(dayOf(e.d).getTime() - dayOf(d).getTime()) < 20 * DAY)) return;
      if (!of.length) words = 'full moon';
    } else if (k === 'meteors') {
      if (of.some((e) => e.d === d && e.w === more.w)) return;
      if (!of.some((e) => e.w === more.w && Math.abs(dayOf(e.d).getTime() - dayOf(d).getTime()) < 60 * DAY)) words = `the ${more.w}`;
    } else if (k === 'sun') {
      if (of.some((e) => e.w === more.w && e.d.slice(0, 4) === d.slice(0, 4))) return;
      words = `the ${turnName(Number(more.w ?? 0), south)}`;
    } else if (k === 'sight') {
      // A rare thing seen (the one who shows it says its own words): once for each day it is seen.
      if (of.some((e) => e.d === d && e.w === more.w)) return;
    } else if (k === 'fire') {
      // The fires of one day are counted together.
      const sameDay = list.find((e) => e.k === 'fire' && e.d === d);
      if (sameDay) {
        sameDay.n = (sameDay.n ?? 1) + (more.n ?? 1);
        if (!trial) keep();
        return;
      }
    } else if (k === 'named') {
      if (of.some((e) => e.d === d && e.w === more.w)) return;
    } else if (k === 'skips') {
      // Only the best is remembered.
      for (let i = list.length - 1; i >= 0; i--) if (list[i].k === 'skips') list.splice(i, 1);
    }
    const entry: Entry = { k, d };
    if (more.n !== undefined) entry.n = more.n;
    if (more.w !== undefined) entry.w = more.w;
    list.push(entry);
    list.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
    if (!trial) keep();
    if (words && !more.quietly) tell(words);
  }

  /** The few lines of the passage, as things stand: the latest of each kind of thing, newest first (`most` of them), and what a year ago today held. */
  function lines(most = 4): string[] {
    const seen = all();
    if (!seen.length) return [];
    const now = today();
    const found: { d: string; rank: number; words: string }[] = [];
    KINDS.forEach((k, rank) => {
      const of = seen.filter((e) => e.k === k);
      if (!of.length) return;
      const last = of[of.length - 1];
      const when = dayWords(last.d, now);
      let words = `${nameOf(last, south)} · ${when}`;
      if (k === 'thunder') {
        // Storms are counted by the season.
        const season = seasonOf(now, south);
        const storms = of.filter((e) => seasonOf(dayOf(e.d), south).id === season.id).length;
        if (storms >= 2 && seasonOf(dayOf(last.d), south).id === season.id) words = `thunder · ${times(storms)} this ${season.name}`;
      } else if (k === 'lights') {
        const nights = of.filter((e) => now.getTime() - dayOf(e.d).getTime() < 365 * DAY).length;
        if (nights >= 2) words = `${nameOf(last, south)} · ${inWords(nights)} nights`;
      } else if (k === 'meteors') {
        const nights = of.filter((e) => e.w === last.w && dayOf(last.d).getTime() - dayOf(e.d).getTime() < 30 * DAY).length;
        if (nights >= 2) words = `${nameOf(last, south)} · ${inWords(nights)} nights`;
      } else if (k === 'fire') {
        const fires = of.reduce((sum, e) => sum + (e.n ?? 1), 0);
        words = fires > 1 ? `${inWords(fires)} fires burned to the end` : `a fire burned to the end · ${when}`;
      } else if (k === 'skips') {
        words = `${nameOf(last, south)} · your best · ${when}`;
      }
      found.push({ d: last.d, rank, words });
    });
    found.sort((a, b) => (a.d > b.d ? -1 : a.d < b.d ? 1 : a.rank - b.rank));
    const out = found.slice(0, most).map((f) => f.words);
    // And this same day in an earlier year, the nearest year first.
    for (let back = 1; back <= 9; back++) {
      const then = dayKey(new Date(now.getFullYear() - back, now.getMonth(), now.getDate(), 12));
      const held = seen.filter((e) => e.d === then).sort((a, b) => KINDS.indexOf(a.k) - KINDS.indexOf(b.k))[0];
      if (!held) continue;
      out.push(`${back === 1 ? 'a year' : `${inWords(back)} years`} ago today · ${nameOf(held, south)}`);
      break;
    }
    return out;
  }

  // The passage itself: a few lines of the stone's own script, dimmer than yours.
  const passage = document.createElement('div');
  passage.id = 'almanac';
  passage.setAttribute('aria-label', 'What the stone remembers');
  document.body.append(passage);
  let hanging = false;
  let high = 0; // how tall the passage is, as last written

  let looked = 0;
  let best = -1;

  return {
    /** Called every frame with what the sky is doing; a few times a second it looks, and remembers what is new. */
    watch(m: Sight): void {
      mode();
      south = m.south;
      const clock = performance.now();
      if (clock - looked < (trial ? 250 : 2000)) return;
      looked = clock;
      const need = trial ? 3 : 8;
      const holds = (what: keyof typeof held, so: boolean) => (held[what] = so ? held[what] + 1 : 0) === need;
      if (holds('snow', m.snow > 0.06 || m.snowDepth > 0.01)) remember('snow');
      if (holds('lights', m.lights > 0.25 && m.stars > 0.2)) remember('lights');
      if (holds('moon', Math.abs(m.moonPhase - 0.5) < 0.02 && m.moonSeen > 0.3)) remember('moon');
      if (holds('meteors', !!m.shower && m.shower.strength > 0.04 && m.stars > 0.35) && m.shower) remember('meteors', { w: m.shower.name });
      // The turns of the year, on the day each falls.
      const now = today();
      if (dayKey(now) !== sunDay) {
        sunDay = dayKey(now);
        turnsOf(now.getFullYear()).forEach((at, which) => {
          if (dayKey(new Date(at)) === sunDay) remember('sun', { w: String(which) });
        });
      }
      // A better count of skips than ever before.
      if (best < 0) best = m.best;
      else if (m.best > best) {
        best = m.best;
        remember('skips', { n: best });
      }
    },

    /** Something that happens at a moment: lightning ('thunder'), a fire burned to the end ('fire'), the lamb given a name ('named'). */
    saw(k: 'thunder' | 'fire' | 'named' | 'sight', which?: string): void {
      mode();
      remember(k, k === 'fire' ? { n: 1 } : which ? { w: which } : {});
    },

    /**
     * Called every frame: how many stones lie on the old stone, and how far
     * above its seat the newest still is. (One earned while you watch drops into place.)
     */
    stones(dt: number): { tokens: number; tokenLift: number } {
      mode();
      const earned = stonesFor(all().length);
      if (earned > stones) dropT = 0;
      stones = earned;
      dropT = Math.min(1, dropT + dt / 0.8);
      return { tokens: stones, tokenLift: bounce(dropT) * 0.5 };
    },

    /**
     * Hang the passage by the stone while you are at it: `at` is where the air
     * over the stone and the ground under it fall on the page, or null when
     * you stand back. Nothing shows while there is nothing to remember.
     */
    hang(at: [[number, number] | null, [number, number] | null] | null): void {
      if (at && !hanging) {
        // Written out afresh each time you lean in.
        mode();
        passage.replaceChildren(
          ...lines(window.innerHeight < 560 ? 3 : 4).map((words) => {
            const line = document.createElement('div');
            line.textContent = words;
            if (/ago today/.test(words)) line.className = 'ago';
            return line;
          }),
        );
        high = passage.offsetHeight;
      }
      hanging = !!at;
      const tall = window.innerHeight > window.innerWidth;
      const where = at ? (tall ? at[1] : at[0]) : null;
      if (where) {
        passage.classList.toggle('under', tall);
        passage.style.left = `${Math.round(where[0])}px`;
        // (Kept inside the window: in a short one it may come down over the stone's crown, or up over its foot.)
        passage.style.top = `${Math.round(tall ? Math.min(where[1], window.innerHeight - high - 12) : Math.max(where[1], high + 10))}px`;
      }
      passage.classList.toggle('shown', !!where && passage.childElementCount > 0);
    },

    /** Whether a stone is dropping into place just now. */
    busy: () => dropT < 1,

    /** For testing: what is remembered (and what only this trial has shown), the passage as it would read, and the stones earned. */
    list: () => (mode(), { kept: kept.map((e) => ({ ...e })), trial: trials.map((e) => ({ ...e })), lines: lines(), stones: stonesFor(all().length), today: dayKey(today()) }),
    /**
     * For testing: remember a thing as of so many days ago (by the date now
     * shown). While the weather or the date is forced it lasts only as long as
     * that does; otherwise it is kept for good, so take it out again with forget().
     */
    add(k: Kind, daysAgo = 0, more: { n?: number; w?: string } = {}): void {
      mode();
      remember(k, { ...more, on: new Date(today().getTime() - daysAgo * DAY), quietly: true });
    },
    /** For testing: forget the last so many things kept (all of them, if not said), and whatever the trial has shown. */
    forget(many = Infinity): void {
      trials = [];
      kept = kept.slice(0, Math.max(0, kept.length - many));
      keep();
    },
  };
}
