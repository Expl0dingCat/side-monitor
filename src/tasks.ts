// Tasks as lanterns. A line on the stone that begins with a dash and a space
// ("- call mum") is a thing to be done, and each one stands beside the footpath
// as a small lantern, lit after dark. Point at a lantern and its words hang
// over it. Click it when the thing is done: its light lifts out as a paper
// lantern and drifts away into the sky, the lantern by the path is gone, and
// the line is taken off the stone.
//
// The lanterns always match the lines. They are counted again whenever you
// stand back from the stone (not while you are still writing): a new line
// brings a new lantern, a line rubbed out takes its lantern with it, and a
// line reworded keeps the lantern it had. There is room by the path for seven;
// any more wait their turn.

import { FACING, lanternFlames, LANTERNS } from './scene/land';
import type { Scene } from './scene/view';
import './stone.css';

const KEY = 'nightpond.lanterns';

/** A task: a dash, a space, and some words. (An empty box after the dash, as in "- [ ] call mum", is not part of the words.) */
const TASK = /^[ \t]*-[ \t]+(?:\[ ?\][ \t]*)?(\S.*?)[ \t]*$/gm;

/** The task lines in some writing, in order: the words of each, and where the line starts and ends. */
export function taskLines(writing: string): { words: string; start: number; end: number }[] {
  const found: { words: string; start: number; end: number }[] = [];
  for (const m of writing.matchAll(TASK)) {
    // A row of dashes is a rule across the page, not a thing to do.
    if (/[\p{L}\p{N}]/u.test(m[1])) found.push({ words: m[1], start: m.index, end: m.index + m[0].length });
  }
  return found;
}

/** Seconds: a lantern easing in, its candle catching, its candle going out, and the lantern easing away. */
const ARRIVES = 1.8;
const KINDLES = 2.6;
const DIMS = 0.9;
/** How long a paper lantern is in sight, and for how much of the end of that it is thinning away. */
const FLIGHT = 13;
const FADES = 2.6;
/** Everything here moves in twelfths of a second, like the grass and the flame. */
const FRAMES = 12;

interface Place {
  /** The words of its task; none when no lantern stands here. */
  words: string;
  state: 'empty' | 'coming' | 'standing' | 'leaving';
  /** How much of the lantern is there, and how brightly it burns, both 0..1. */
  there: number;
  lit: number;
  /** Seconds still to wait before it starts to arrive. */
  wait: number;
  /** Leaving: seconds since it began to go, and whether its light was let go by you (as against its line being rubbed out). */
  gone: number;
  freed: boolean;
  /** When its task was first written down (ms): a lantern left waiting burns lower by the day, and gathers moss. */
  since: number;
}

const DAY = 86_400_000;
const SINCE_KEY = 'nightpond.lanterns.since';
/**
 * What waiting does to a lantern, by the days it has stood. Its candle burns
 * down: a little lower each day, to a stub with a small flame after a week.
 * And from about the fifth day moss begins on its iron and its stake, and has
 * most of it by the end of a second week. (Its light never goes out: a thing
 * still to be done is still lit.)
 */
export function weathering(days: number): { low: number; moss: number } {
  const t = Math.max(0, Math.min(1, days / 7));
  const m = Math.max(0, Math.min(1, (days - 4.5) / 8));
  return { low: t * t * (3 - 2 * t), moss: m * m * (3 - 2 * m) };
}

/**
 * How a lantern leaves, by the seconds since it began to. Its task done, the
 * candle flares as the light is let go and a few sparks go up with it; the
 * light is gone with the paper lantern in about a second; and then the empty
 * lantern is taken up after it: lifted off the grass, swaying a little, and
 * thinning away as it rises. (One whose line was simply rubbed out goes dark
 * without the flare, and is taken up the same way.)
 */
const TAKEN_FROM = 1.1; // when the lantern itself begins to lift
const TAKEN_FOR = 2.3; // and how long it is in going
function leaving(gone: number, freed: boolean, litThen: number): { lit: number; there: number; lift: number; sway: number; sparks: number; over: boolean } {
  const lit = freed ? (gone < 0.3 ? litThen + (1.2 - litThen) * (gone / 0.3) : Math.max(0, 1.2 * (1 - (gone - 0.3) / 1.0))) : Math.max(0, litThen * (1 - gone / DIMS));
  const u = Math.max(0, Math.min(1, (gone - TAKEN_FROM) / TAKEN_FOR));
  const fade = Math.max(0, Math.min(1, (u - 0.3) / 0.7));
  return {
    lit,
    there: 1 - fade * fade * (3 - 2 * fade),
    lift: 1.15 * u * u,
    sway: 0.07 * Math.sin(gone * 2.6) * u,
    sparks: freed ? 0.85 * Math.max(0, 1 - Math.abs(gone - 0.55) / 0.85) : 0,
    over: u >= 1,
  };
}

interface Flight {
  from: [number, number, number];
  age: number;
  /** Each sways in its own time. */
  seed: number;
}

/** What the lanterns need to know each frame. */
export interface TaskMoment {
  /** Whether you are at the stone, writing. */
  reading: boolean;
  /** Which lantern the pointer is on (-1 for none), and where the air above it falls on the page. */
  pointed: number;
  at: [number, number] | null;
  /** The wind, as it travels in the scene (x to your right, z toward you), 0..1. */
  wind: [number, number];
  /** How dark it is, 0 by day to 1 at night: a paper lantern shows its flame more at night. */
  lamp: number;
}

export function createTasks(notes: { text(): string; takeLine(start: number, end: number): unknown }) {
  const empty = (): Place => ({ words: '', state: 'empty', there: 0, lit: 0, wait: 0, gone: 0, freed: false, since: Date.now() });
  const places: Place[] = Array.from({ length: LANTERNS }, empty);
  const flights: Flight[] = [];
  let seen: string | null = null; // the writing as it was when the lanterns were last counted
  let waiting = false; // more tasks than lanterns
  let clock = 0;
  let frame = -1;
  let shown: Scene['lanterns'] = { there: [], lit: [], lift: [], sway: [], sparks: [], low: [], moss: [], up: [], rising: [] };
  const litWhenFreed = new Map<Place, number>(); // how brightly each leaving lantern burned as it began to go

  // The words hang over a lantern the way the tune's name hangs over the gramophone.
  const label = document.createElement('div');
  label.id = 'task-word';
  label.setAttribute('role', 'status');
  document.body.append(label);

  try {
    const kept: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    // (When each was first written down is kept beside them, by its words.)
    const since: unknown = JSON.parse(localStorage.getItem(SINCE_KEY) ?? '{}');
    const when = (words: string) => {
      const at = since && typeof since === 'object' ? (since as Record<string, unknown>)[words] : undefined;
      return typeof at === 'number' && at > 0 && at <= Date.now() ? at : Date.now();
    };
    if (Array.isArray(kept)) {
      kept.slice(0, LANTERNS).forEach((words, i) => {
        if (typeof words === 'string' && words) places[i] = { ...empty(), words, state: 'standing', there: 1, lit: 1, since: when(words) };
      });
    }
  } catch {
    // Storage can be unavailable; the lanterns are then set out afresh from the writing.
  }
  const told = () => JSON.stringify(places.map((p) => (p.state === 'leaving' ? '' : `${p.words}\u0000${p.words ? p.since : ''}`)));
  let kept = told();
  const keep = () => {
    const now = told();
    if (now === kept) return; // nothing has changed places
    kept = now;
    try {
      localStorage.setItem(KEY, JSON.stringify(places.map((p) => (p.state === 'leaving' ? '' : p.words))));
      const since: Record<string, number> = {};
      for (const p of places) if (p.words && p.state !== 'leaving') since[p.words] = p.since;
      localStorage.setItem(SINCE_KEY, JSON.stringify(since));
    } catch {
      // They are counted again from the writing next time.
    }
  };

  /**
   * Make the lanterns match the task lines. `atOnce` is for when the page
   * opens: what is already written is already standing there, and nothing eases in.
   */
  function count(atOnce: boolean): void {
    const wanted = taskLines(notes.text()).map((t) => t.words);
    // A lantern whose line is still there keeps its place.
    const orphans: Place[] = [];
    for (const p of places) {
      if (!p.words || p.state === 'leaving') continue;
      const k = wanted.indexOf(p.words);
      if (k >= 0) wanted.splice(k, 1);
      else orphans.push(p);
    }
    // A line that was reworded keeps the lantern it had: the words change, the
    // lantern stays. (Words added to a line, or taken off it, are known for the
    // same line; failing that, the lines are taken in order.)
    const kin = (a: string, b: string) => a.includes(b) || b.includes(a);
    const known = new Set<Place>();
    for (const p of orphans) {
      const k = wanted.findIndex((words) => kin(words, p.words));
      if (k < 0) continue;
      p.words = wanted.splice(k, 1)[0];
      known.add(p);
    }
    for (const p of orphans) {
      if (known.has(p)) continue;
      const words = wanted.shift();
      if (words !== undefined) {
        p.words = words;
        p.since = Date.now(); // (a different thing to do: it is new today, whatever the lantern it has taken over)
      } else if (atOnce) {
        Object.assign(p, empty());
      } else {
        // Its line is gone: the candle goes out and the lantern with it.
        p.state = 'leaving';
        p.words = '';
        p.gone = 0;
        p.freed = false;
        litWhenFreed.set(p, p.lit);
      }
    }
    // New lines take the free places, the nearest first, one a little after another.
    let delay = 0.9; // (you are still standing back from the stone)
    let placed = 0;
    for (const words of wanted) {
      const p = places.find((q) => q.state === 'empty');
      if (!p) break;
      Object.assign(p, empty(), atOnce ? { words, state: 'standing', there: 1, lit: 1 } : { words, state: 'coming', wait: delay });
      delay += 0.45;
      placed++;
    }
    waiting = placed < wanted.length;
    keep();
  }

  /** Where a paper lantern has got to: x, y, z, its size, its turn, how much of it is there, how brightly it glows. */
  function flightAt(f: Flight, wind: [number, number], lamp: number): number[] {
    const a = f.age;
    // It climbs slowly at first and faster as it goes, and is carried off the way you face, out toward the sea.
    const rise = 0.3 + 0.3 * a + 0.05 * a * a;
    const away = 0.5 * a + 0.22 * a * a;
    // It sways from side to side as it climbs, more widely the higher it is, and a wind across the view takes it along.
    const ease = Math.min(1, a / 3);
    const sway = 0.34 * Math.sin(a * 1.15 + f.seed * 6.283) * ease * ease * (1 + 0.09 * a);
    const nod = 0.2 * Math.sin(a * 0.8 + f.seed * 17) * ease;
    const ahead: [number, number] = [Math.sin(FACING), -Math.cos(FACING)];
    const across: [number, number] = [-ahead[1], ahead[0]];
    const blown = (wind[0] * across[0] + wind[1] * across[1]) * 0.12 * a * a;
    const x = f.from[0] + ahead[0] * (away + nod) + across[0] * (sway + blown);
    const z = f.from[2] + ahead[1] * (away + nod) + across[1] * (sway + blown);
    // It leaves the lantern small, opens out as it clears the roof, and thins to nothing at the end.
    const open = Math.min(1, a / 1.8);
    const size = 0.22 + 0.78 * open * open * (3 - 2 * open);
    const there = Math.max(0, Math.min(1, (FLIGHT - a) / FADES));
    const glow = Math.min(1, a / DIMS) * (0.42 + 0.58 * lamp);
    return [x, f.from[1] + rise, z, size, 0.4 * a + f.seed * 6.283, Math.round(there * 16) / 16, glow];
  }

  return {
    /** Called every frame. Returns how the lanterns stand, for drawing. */
    update(dt: number, m: TaskMoment): Scene['lanterns'] {
      // Count them again when the writing has changed and you are not in the middle of changing it.
      const text = notes.text();
      if (seen === null) {
        seen = text;
        count(true);
      } else if (!m.reading && (text !== seen || (waiting && places.some((p) => p.state === 'empty')))) {
        seen = text;
        count(false);
      }

      for (const p of places) {
        if (p.state === 'coming') {
          if (p.wait > 0) p.wait -= dt;
          else if (p.there < 1) p.there = Math.min(1, p.there + dt / ARRIVES);
          else p.lit = Math.min(1, p.lit + dt / KINDLES);
          if (p.lit >= 1) p.state = 'standing';
        } else if (p.state === 'leaving') {
          p.gone += dt;
          const how = leaving(p.gone, p.freed, litWhenFreed.get(p) ?? 1);
          p.lit = how.lit;
          p.there = how.there;
          if (how.over) {
            litWhenFreed.delete(p);
            Object.assign(p, empty());
          }
        }
      }
      for (const f of flights) f.age += dt;
      while (flights.length && flights[0].age >= FLIGHT) flights.shift();

      // What is drawn changes twelve times a second and holds still between.
      clock += dt;
      const now = Math.floor(clock * FRAMES);
      if (now !== frame) {
        frame = now;
        shown = {
          there: places.map((p) => Math.round(p.there * 16) / 16),
          lit: places.map((p) => Math.round(p.lit * 12) / 12),
          // A lantern is set down as it arrives: it comes to rest from a hand's breadth above its place.
          // And one that is leaving is taken up off the grass, swaying, with a few sparks if its task was done.
          lift: places.map((p) => (p.state === 'coming' ? 0.2 * (1 - p.there) ** 2 : p.state === 'leaving' ? leaving(p.gone, p.freed, 1).lift : 0)),
          sway: places.map((p) => (p.state === 'leaving' ? leaving(p.gone, p.freed, 1).sway : 0)),
          sparks: places.map((p) => (p.state === 'leaving' ? leaving(p.gone, p.freed, 1).sparks : 0)),
          // How far each candle has burned down in the days it has waited, and how much moss it has gathered.
          low: places.map((p) => (p.words || p.state === 'leaving' ? weathering((Date.now() - p.since) / DAY).low : 0)),
          moss: places.map((p) => (p.words || p.state === 'leaving' ? weathering((Date.now() - p.since) / DAY).moss : 0)),
          up: places.map((p) => !!p.words && p.there >= 1),
          rising: flights.map((f) => flightAt(f, m.wind, m.lamp)),
        };
      }

      // The words of the lantern under the pointer.
      const words = m.pointed >= 0 ? places[m.pointed]?.words : '';
      const show = !!words && !!m.at && !m.reading;
      if (show && m.at) {
        if (label.textContent !== words) label.textContent = words;
        label.style.left = `${Math.round(m.at[0])}px`;
        label.style.top = `${Math.round(m.at[1])}px`;
      }
      label.classList.toggle('shown', show);
      return shown;
    },

    /**
     * The task of the lantern in a place is done: its light is let go as a
     * paper lantern, and its line comes off the stone. Returns the words of it, or null if no lantern stood there.
     */
    finish(place: number): string | null {
      const p = places[place];
      if (!p || !p.words || p.there < 1 || p.state === 'leaving') return null;
      const words = p.words;
      flights.push({ from: lanternFlames[place], age: 0, seed: Math.random() });
      p.state = 'leaving';
      p.words = '';
      p.gone = 0;
      p.freed = true; // its candle flares, sparks go up, and the lantern is taken up after its light
      litWhenFreed.set(p, p.lit);
      const line = taskLines(notes.text()).find((t) => t.words === words);
      if (line) notes.takeLine(line.start, line.end);
      seen = notes.text();
      keep();
      return words;
    },

    /** Whether anything here is on the move, and so wants smooth frames. */
    busy: () => flights.length > 0 || places.some((p) => p.state === 'coming' || p.state === 'leaving'),

    /** For testing: make the lantern in a place as old as if its task had waited so many days. */
    aged(place: number, days: number): void {
      const p = places[place];
      if (!p || !p.words) return;
      p.since = Date.now() - days * DAY;
      frame = -1;
      keep();
    },

    /** For testing: what stands in each place, and the paper lanterns in the air. */
    list: () => ({ places: places.map((p) => ({ ...p })), rising: flights.length, waiting }),
  };
}
