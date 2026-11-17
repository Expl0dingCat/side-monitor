// A message in a bottle. On the beach a bottle of sea-green glass lies on the
// shingle near your feet. Click it and you write to yourself, in the air
// beside it; one line of what you write may say when it should come back (in
// a week, in 30 days, in a year, on march 3, 2027-03-03), and with no such
// line it comes back in a month. Stand back with something written and the
// bottle is corked and thrown: it arcs out over the water, lands, bobs, and
// drifts away out of sight. The next time you come down there is a fresh one,
// so several can be at sea at once.
//
// On or after its day a bottle has washed up: it lies at the water's edge, wet,
// and up in the meadow a few words say that something has. Click it and the
// message is drawn out to be read, with the day it was sent under it; stand
// back and the sea takes the bottle away for good.
//
// What is at sea is kept in this browser: the words, when they were sent and
// the day they are due.

import type { V3 } from './scene/gl';
import { BEACH, FACING, land } from './scene/land';
import type { Landscape, Scene } from './scene/view';
import { MAX_RIPPLES } from './skipping';

const KEY = 'nightpond.bottles';

/** A bottle at sea: what it says, the moment it was thrown, and the start of the day it comes back (both as milliseconds). */
export interface Bottle {
  text: string;
  sent: number;
  due: number;
}

/** When a bottle is to come back: the start of that day, and the words for it ("in a week", "on the 3rd of march"). */
export interface When {
  due: number;
  words: string;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const COUNTS = ['', 'a', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const DAY = 86_400_000;

/** 1st, 2nd, 3rd, 4th, 11th, 21st. */
function nth(day: number): string {
  const tail = day % 100 >= 11 && day % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][day % 10] ?? 'th');
  return `${day}${tail}`;
}

/** A day of the calendar as it is spoken of here: "the 3rd of march", with its year only when that is not plain. */
function dayWords(ms: number, withYear: boolean): string {
  const d = new Date(ms);
  return `the ${nth(d.getDate())} of ${MONTHS[d.getMonth()]}${withYear ? `, ${d.getFullYear()}` : ''}`;
}

/** The start of a day so many days, months or years after today. A month on from the 31st is the last day of the next month. */
function later(now: number, count: number, unit: string): number {
  const d = new Date(now);
  const [y, m, day] = [d.getFullYear(), d.getMonth(), d.getDate()];
  if (unit === 'day') return new Date(y, m, day + count).getTime();
  if (unit === 'week') return new Date(y, m, day + 7 * count).getTime();
  const months = unit === 'year' ? 12 * count : count;
  const last = new Date(y, m + months + 1, 0).getDate();
  return new Date(y, m + months, Math.min(day, last)).getTime();
}

/**
 * Read one line as a time to come back, if that is all the line says:
 * "in a week", "in 30 days", "in a year", "tomorrow", "on march 3",
 * "on the 3rd of march", "3 march 2027", "2027-03-03". A day with no year is
 * the next such day; a day already past is no answer at all.
 */
export function whenLine(line: string, now: number): When | null {
  const said = line.trim().toLowerCase().replace(/[.,;!]+$/, '').replace(/\s+/g, ' ').replace(/^(come back|back|return|open|opens) /, '');
  if (!said) return null;
  const today = new Date(now).setHours(0, 0, 0, 0);

  // So long from now.
  const span = said.match(/^(?:in|after) (an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,5}) (day|week|month|year)s?(?: from now| time| or so)?$/);
  const next = said.match(/^next (week|month|year)$/);
  if (span || next || said === 'tomorrow') {
    const unit = span ? span[2] : next ? next[1] : 'day';
    const word = span ? span[1] : 'a';
    const count = /^\d/.test(word) ? Number(word) : word === 'an' || word === 'one' ? 1 : COUNTS.indexOf(word);
    const most: Record<string, number> = { day: 36_500, week: 5200, month: 1200, year: 100 };
    if (count < 1 || count > most[unit]) return null;
    return { due: later(now, count, unit), words: said === 'tomorrow' ? 'tomorrow' : `in ${COUNTS[count] ?? count} ${unit}${count === 1 ? '' : 's'}` };
  }

  // A day of the calendar.
  let year: number | null = null;
  let month = -1;
  let day = 0;
  const iso = said.match(/^(?:on )?(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const monthFirst = said.match(/^(?:on )?([a-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/);
  const dayFirst = said.match(/^(?:on )?(?:the )?(\d{1,2})(?:st|nd|rd|th)?(?: of)? ([a-z]{3,9})\.?(?:,? (\d{4}))?$/);
  const monthOf = (name: string) => MONTHS.findIndex((full) => full === name || full.slice(0, 3) === name || (name === 'sept' && full === 'september'));
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])];
  else if (monthFirst) [year, month, day] = [monthFirst[3] ? Number(monthFirst[3]) : null, monthOf(monthFirst[1]), Number(monthFirst[2])];
  else if (dayFirst) [year, month, day] = [dayFirst[3] ? Number(dayFirst[3]) : null, monthOf(dayFirst[2]), Number(dayFirst[1])];
  else return null;
  if (month < 0 || month > 11 || day < 1) return null;
  const on = (y: number): number | null => {
    const d = new Date(y, month, day);
    return d.getMonth() === month && d.getDate() === day ? d.getTime() : null; // there is no 30th of february
  };
  let due: number | null;
  if (year === null) {
    const thisYear = new Date(now).getFullYear();
    due = on(thisYear);
    if (due === null || due <= today) due = on(thisYear + 1) ?? on(thisYear + 2) ?? on(thisYear + 3) ?? on(thisYear + 4);
  } else {
    due = year <= new Date(now).getFullYear() + 100 ? on(year) : null;
  }
  if (due === null || due <= today) return null;
  return { due, words: `on ${dayWords(due, due - today > 330 * DAY)}` };
}

/**
 * Take what was written apart: the message, and when it is to come back. The
 * last line that says when (if any does) is taken out of the message; with
 * none, it is a month.
 */
export function readWriting(written: string, now: number): { message: string; when: When; said: boolean } {
  const lines = written.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const when = whenLine(lines[i], now);
    if (!when) continue;
    lines.splice(i, 1);
    return { message: lines.join('\n').trim(), when, said: true };
  }
  return { message: written.trim(), when: { due: later(now, 1, 'month'), words: 'in a month' }, said: false };
}

/** A spot on the beach, so many metres in front of where you stand there and so many to your right: where the ground is. */
function beachSpot(ahead: number, right: number): V3 {
  const x = BEACH.x + Math.sin(FACING) * ahead + Math.cos(FACING) * right;
  const z = BEACH.z - Math.cos(FACING) * ahead + Math.sin(FACING) * right;
  return [x, land(x, z), z];
}
/** The turn that lays a bottle along the shore with its neck to your right, swung by `away` toward the sea. */
const lying = (away: number) => away - FACING;

const FLOATS = -0.034; // how low a bottle rides in the water
const SUNK = -0.15; // it lies on top of the beach's stones, not down among them (they stand a hand high)
// A throw: the cork goes in, the bottle lifts, it flies, and then it is on the water until it is lost to sight.
const CORKING = 650;
const LIFTING = 420;
const FLYING = 1500;
const DRIFTING = 12_000;
// One that comes back rides in on the water over this long; one that has been read is drawn back out.
const WASHING_IN = 9000;
const WASHING_OUT = 9000;
const RING_LASTS = 2600; // as the rings of a skipping stone do

const ease = (t: number) => {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
};
/** Held to so many frames a second, like hand-drawn animation. */
const stepped = (ms: number, frames: number) => Math.floor((ms * frames) / 1000) * (1000 / frames);

type Pose = Scene['bottles'][number];

export function createBottles(say: (words: string) => void, landscape: Landscape) {
  /** How far the sea stands above its mean level, as the tide has it: a bottle on the water rides at that. */
  let seaLevel = 0;
  const panel = document.getElementById('bottle') as HTMLElement;
  const text = document.getElementById('bottle-text') as HTMLTextAreaElement;
  const under = document.getElementById('bottle-line') as HTMLElement;
  const hush = document.getElementById('bottle-hush') as HTMLElement;

  // ---- what is kept ----------------------------------------------------------------

  let atSea: Bottle[] = [];
  let draft = ''; // something begun and not yet sent
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    const list: unknown[] = Array.isArray(kept) ? kept : Array.isArray(kept?.atSea) ? kept.atSea : [];
    atSea = list.filter((b): b is Bottle => !!b && typeof (b as Bottle).text === 'string' && Number.isFinite((b as Bottle).sent) && Number.isFinite((b as Bottle).due));
    if (typeof kept?.draft === 'string') draft = kept.draft;
  } catch {
    // Storage can be unavailable, or hold something unreadable: then the sea is empty.
  }
  const keep = (): boolean => {
    try {
      if (atSea.length || draft) localStorage.setItem(KEY, JSON.stringify({ atSea, draft }));
      else localStorage.removeItem(KEY);
      return true;
    } catch {
      return false; // kept until the page is closed
    }
  };
  /** The bottles whose day has come, the longest at sea first. */
  const due = () => atSea.filter((b) => b.due <= Date.now()).sort((a, b) => a.sent - b.sent);

  // ---- where things are ---------------------------------------------------------------

  /**
   * The empty bottle: near your feet and a little to your left (the lamb, when it
   * comes down with you, stands to your right), as far up the shingle from the
   * water as can still be seen, its neck toward the sea.
   */
  const freshAt = (): Pose => {
    const [x, y, z] = beachSpot(BEACH.toWater - 2.5, -0.75);
    return { x, y: y - SUNK, z, yaw: lying(Math.PI - 0.3), wet: 0, lit: 0 };
  };
  /** One that has come back: left lying along the water's edge, to your left. */
  const washedAt = (): Pose => {
    const [x, y, z] = beachSpot(BEACH.toWater - 0.45, -2.1);
    return { x, y: y - SUNK, z, yaw: lying(0.22), wet: 1, lit: 0 };
  };
  /** Where a thrown bottle comes down, and the way it drifts from there: out, and a little to the left, toward the open sea. */
  const landsAt = (): V3 => {
    const [x, , z] = beachSpot(BEACH.toWater + 9.5, 0.4);
    return [x, FLOATS, z];
  };
  const outward: [number, number] = [Math.sin(FACING - 0.2), -Math.cos(FACING - 0.2)];
  /** The corners of a box round a bottle, roomy enough to be easy to click. */
  const boxRound = (p: Pose): V3[] => {
    const corners: V3[] = [];
    for (const dx of [-0.34, 0.34]) for (const dy of [-0.04, 0.22]) for (const dz of [-0.34, 0.34]) corners.push([p.x + dx, p.y + dy, p.z + dz]);
    return corners;
  };

  // ---- what is going on ---------------------------------------------------------------

  let now = 0; // the scene's own clock, as of the last frame
  let ashore = false;
  let fresh = true; // an empty bottle lies on the shingle
  let freshLit = 0;
  let washedLit = 0;
  /** The bottle on its way out: where it lay, when the cork went in, the words to say as it lands, and how far its rings have got. */
  let thrown: { from: Pose; began: number; words: string; landed: boolean; ringAt: number } | null = null;
  /** The one that has come back: riding in, lying at the water's edge, or being drawn back out after it was read. */
  let washed: { bottle: Bottle; phase: 'in' | 'lying' | 'out'; since: number; ringAt: number } | null = null;
  const rings: { x: number; z: number; at: number; size: number }[] = [];
  const ring = (x: number, z: number, size: number) => {
    rings.push({ x, z, at: now, size });
    if (rings.length > 4) rings.shift();
  };
  /** The words about what has washed up are said once for each bottle, however long the page stays open. */
  const told = new Set<number>();
  const opened = performance.now();
  // One whose day came while the page was shut is already lying there.
  if (due()[0]) washed = { bottle: due()[0], phase: 'lying', since: 0, ringAt: 0 };

  // The pointer, kept here so that the bottle under it can catch the light.
  const pointer = { x: -1, y: -1, on: false, moved: -1e9 };
  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.on = e.target instanceof HTMLCanvasElement;
    pointer.moved = performance.now();
  });

  /** Where the thrown bottle is, so long after its cork went in. */
  const flight = (t: number): Pose => {
    const { from } = thrown!;
    const pose: Pose = { ...from, lit: 0 };
    if (t < CORKING) return pose;
    // It lifts off the stones and swings back a little, as an arm does before a throw.
    const back = 0.32;
    const up = 0.5;
    const lift = ease(stepped(t - CORKING, 12) / LIFTING);
    pose.x = from.x - Math.sin(FACING) * back * lift;
    pose.z = from.z + Math.cos(FACING) * back * lift;
    pose.y = from.y + up * lift;
    pose.yaw = from.yaw + 0.6 * lift;
    if (t < CORKING + LIFTING) return pose;
    const [lx, seaAt, lz] = landsAt();
    const ly = seaAt + seaLevel; // (the sea stands where the tide has it)
    const air = stepped(t - CORKING - LIFTING, 12) / FLYING;
    if (air < 1) {
      // Out over the water in one long arc, spinning as it goes.
      pose.x += (lx - pose.x) * air;
      pose.z += (lz - pose.z) * air;
      pose.y += (ly - pose.y) * air + 2.1 * 4 * air * (1 - air);
      pose.yaw += air * Math.PI * 4;
      return pose;
    }
    // On the water: it goes under, comes up, and rides there, turning slowly, while the sea carries it off.
    const afloat = stepped(t - CORKING - LIFTING - FLYING, 6);
    const gone = 16 * (afloat / DRIFTING) ** 1.5;
    pose.x = lx + outward[0] * gone;
    pose.z = lz + outward[1] * gone;
    pose.y = ly - 0.1 * Math.exp(-afloat / 420) * Math.cos(afloat / 210) + 0.014 * Math.sin(afloat / 520) - 0.16 * ease((afloat - (DRIFTING - 3200)) / 3200);
    pose.yaw = from.yaw + 0.6 + 0.4 * Math.sin(afloat / 1900) + afloat * 0.00005;
    pose.wet = 1;
    return pose;
  };

  /** Where the bottle that came back is: riding in from a little way out, lying where the water left it, or going out again. */
  const tide = (): Pose => {
    const home = washedAt();
    const w = washed!;
    if (w.phase === 'lying') return { ...home, lit: washedLit };
    const t = stepped(now - w.since, 6);
    const coming = w.phase === 'in';
    const far = coming ? beachSpot(BEACH.toWater + 5, -3.8) : beachSpot(BEACH.toWater + 6, -1.0);
    const along = coming ? 1 - (1 - Math.min(1, t / WASHING_IN)) ** 2 : 1 - Math.min(1, t / WASHING_OUT) ** 2; // 0 out on the water, 1 at rest
    const x = far[0] + (home.x - far[0]) * along;
    const z = far[2] + (home.z - far[2]) * along;
    const rides = FLOATS + 0.014 * Math.sin(t / 520) - (coming ? 0 : 0.16 * ease((t - (WASHING_OUT - 2600)) / 2600));
    return { ...home, x, z, y: Math.max(rides, land(x, z) - SUNK), yaw: home.yaw + (coming ? 1.5 : -1.1) * (1 - along) };
  };

  // ---- the writing, and the reading ------------------------------------------------------

  let mode: 'writing' | 'reading' | null = null;
  let anchor: V3 = [0, 0, 0]; // the bottle the words hang beside
  let held: [number, number] = [0, 0]; // where the view was looking when it was opened: it holds there
  let closedAt = -1e9;
  let saveTimer = 0;
  let hideTimer = 0;

  /** The words sit just above the bottle and a little to its right, and take only the room they need. */
  const settle = () => {
    const at = landscape.spotOnPage(anchor);
    if (!at) return;
    const wide = window.innerWidth;
    const high = window.innerHeight;
    const tall = high > wide;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const width = Math.min((tall ? 0.84 : 0.5) * wide, 46 * rem);
    const left = Math.max(0.06 * wide, Math.min(wide - width - 0.06 * wide, at[0] + 0.05 * wide));
    const clear = 0.065 * high;
    const room = Math.max(8 * rem, at[1] - clear - 0.07 * high);
    panel.style.left = `${Math.round(left)}px`;
    panel.style.width = `${Math.round(width)}px`;
    panel.style.bottom = `${Math.round(high - at[1] + clear)}px`;
    panel.style.maxHeight = `${Math.round(room)}px`;
    text.style.maxHeight = `${Math.round(room - 2.2 * rem)}px`;
    // They come out of the bottle and go back into it: that is the point they grow from.
    panel.style.transformOrigin = `${Math.round(at[0] - left)}px calc(100% + ${Math.round(clear)}px)`;
    hush.style.setProperty('--at-x', `${Math.round(at[0])}px`);
    hush.style.setProperty('--at-y', `${Math.round(at[1])}px`);
  };
  /** The writing is only as tall as what is written. */
  const fit = () => {
    text.style.height = 'auto';
    text.style.height = `${text.scrollHeight}px`;
  };
  /** Under the writing: when it will come back, as far as can be told from what is written so far. */
  const foretell = () => {
    const { when, said } = readWriting(text.value, Date.now());
    under.textContent = said ? `it will come back ${when.words}` : 'it will come back in a month · or say when on a line of its own';
  };

  const open = (what: 'writing' | 'reading', beside: Pose): void => {
    if (mode) return;
    mode = what;
    anchor = [beside.x, beside.y + 0.15, beside.z];
    held = pointer.x < 0 ? [0, 0] : [(pointer.x / window.innerWidth) * 2 - 1, 1 - (pointer.y / window.innerHeight) * 2];
    window.clearTimeout(hideTimer);
    text.readOnly = what === 'reading';
    panel.classList.toggle('reading', what === 'reading');
    if (what === 'writing') {
      text.value = draft;
      foretell();
    } else {
      const { text: message, sent } = washed!.bottle;
      text.value = message;
      under.textContent = `sent on ${dayWords(sent, new Date(sent).getFullYear() !== new Date().getFullYear())}`;
    }
    panel.hidden = false;
    settle();
    fit();
    document.body.classList.add('bottling');
    // A moment later, so that it grows out of the bottle from nothing.
    window.setTimeout(() => {
      if (mode) panel.classList.add('open');
    }, 30);
    text.focus({ preventScroll: true });
    text.setSelectionRange(what === 'writing' ? text.value.length : 0, what === 'writing' ? text.value.length : 0);
    text.scrollTop = what === 'writing' ? text.scrollHeight : 0;
  };

  /** Cork a bottle and send it out, from where the empty one lies if you are there to see it go. */
  const send = (message: string, when: When): Bottle => {
    const bottle: Bottle = { text: message, sent: Date.now(), due: when.due };
    atSea.push(bottle);
    const words = `it will find its way back ${when.words}`;
    if (ashore && fresh && !thrown) {
      thrown = { from: freshAt(), began: now, words, landed: false, ringAt: 0 };
      fresh = false;
    } else {
      say(words);
    }
    if (!keep()) say('this browser would not let the sea keep that');
    return bottle;
  };

  const close = (): void => {
    if (!mode) return;
    const was = mode;
    mode = null;
    closedAt = performance.now();
    window.clearTimeout(saveTimer);
    panel.classList.remove('open');
    document.body.classList.remove('bottling');
    text.blur();
    if (was === 'writing') {
      const { message, when } = readWriting(text.value, Date.now());
      // With nothing written it simply closes, and whatever was begun waits for next time.
      draft = message ? '' : text.value.trim() ? text.value : '';
      if (message) send(message, when);
      else keep();
    } else if (washed) {
      // Read, it is done with: out of what is kept, and the sea takes the bottle back.
      atSea = atSea.filter((b) => b !== washed!.bottle);
      keep();
      washed = { ...washed, phase: 'out', since: now, ringAt: 0 };
    }
    // Left in place while the words go back into the bottle.
    hideTimer = window.setTimeout(() => {
      panel.hidden = true;
      text.value = draft;
    }, 900);
  };

  text.addEventListener('input', () => {
    if (mode !== 'writing') return;
    fit();
    foretell();
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      draft = text.value;
      keep();
    }, 400);
  });
  // Esc puts the writing away, and that is all it does: you stay on the beach.
  window.addEventListener(
    'keydown',
    (e) => {
      if (!mode || e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      close();
    },
    true,
  );
  // So does a click anywhere but on the words.
  window.addEventListener('pointerdown', (e) => {
    if (mode && !panel.contains(e.target as Node)) close();
  });
  window.addEventListener('resize', () => {
    if (mode) fit();
  });
  // Closing the tab mid-sentence does not send it, and does not lose it. (Only what was begun is
  // put by: whatever else is kept by then, a keepsake just loaded for one, is left as it is.)
  window.addEventListener('pagehide', () => {
    if (mode !== 'writing') return;
    try {
      const kept = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      const begun = text.value.trim() ? text.value : '';
      const sea = Array.isArray(kept?.atSea) ? kept.atSea : [];
      if (sea.length || begun) localStorage.setItem(KEY, JSON.stringify({ atSea: sea, draft: begun }));
      else localStorage.removeItem(KEY);
    } catch {
      // Nothing to be done about it now.
    }
  });

  return {
    /**
     * Called every frame with the scene's clock, the seconds since the last
     * frame, and where you are: down on the beach, or up in the meadow with
     * nothing else in hand. It puts its rings among the skipping stone's and
     * returns the bottles to draw.
     */
    update(time: number, dt: number, where: { ashore: boolean; meadow: boolean; tide?: number }, ripples: number[]): Pose[] {
      seaLevel = where.tide ?? 0;
      now = time;
      ashore = where.ashore;
      // Each time you come down there is an empty bottle on the shingle again.
      if (!ashore && !thrown) fresh = true;

      // One whose day has come is at the water's edge when you get there; if you are there already, you see it ride in.
      if (!washed && !mode) {
        const next = due()[0];
        if (next) washed = { bottle: next, phase: ashore ? 'in' : 'lying', since: now, ringAt: 0 };
      } else if (washed && washed.phase !== 'lying') {
        const over = now - washed.since >= (washed.phase === 'in' ? WASHING_IN : WASHING_OUT);
        if (washed.phase === 'in' && (over || !ashore)) washed.phase = 'lying';
        else if (washed.phase === 'out' && (over || !ashore)) washed = null;
      }
      // Up in the meadow, a few words say that something has come back: once you are there to read them.
      if (where.meadow && !mode) {
        const age = performance.now() - opened;
        const there = performance.now() - pointer.moved < 2500 || (age > 5000 && age < 60_000);
        const news = due().filter((b) => !told.has(b.sent));
        if (news.length && there && age > 3000) {
          for (const b of due()) told.add(b.sent);
          say('something has washed up on the shore');
        }
      }

      // While the words are open the view holds where it was, and they stay beside the bottle.
      if (mode && !ashore) close();
      if (mode) {
        landscape.lookToward(held[0], held[1]);
        settle();
      }

      const poses: Pose[] = [];
      const picks = (lit: number, pose: Pose, can: boolean) => lit + ((can && !mode && pointer.on && landscape.covers(boxRound(pose), pointer.x, pointer.y) ? 1 : 0) - lit) * (1 - Math.exp(-dt * 6));
      if (thrown) {
        const t = now - thrown.began;
        const pose = flight(t);
        const down = CORKING + LIFTING + FLYING;
        if (t >= down && !thrown.landed) {
          thrown.landed = true;
          thrown.ringAt = now;
          ring(pose.x, pose.z, 0.5);
          say(thrown.words);
        }
        // As it bobs it sends out a small ring now and then.
        if (thrown.landed && now - thrown.ringAt > 2300 && t < down + DRIFTING - 3600) {
          thrown.ringAt = now;
          ring(pose.x, pose.z, 0.13);
        }
        if (t >= down + DRIFTING) thrown = null;
        else if (ashore) poses.push(pose);
      }
      if (ashore && fresh) {
        const pose = freshAt();
        freshLit = picks(freshLit, pose, true);
        poses.push({ ...pose, lit: mode === 'writing' ? 1 : freshLit });
      }
      if (ashore && washed) {
        const pose = tide();
        washedLit = picks(washedLit, pose, washed.phase === 'lying');
        if (washed.phase !== 'lying' && pose.y < FLOATS + 0.03 && now - washed.ringAt > 2400 && now - washed.since < WASHING_OUT - 3000) {
          washed.ringAt = now;
          ring(pose.x, pose.z, 0.11);
        }
        poses.push({ ...pose, lit: mode === 'reading' ? 1 : washed.phase === 'lying' ? washedLit : 0 });
      }

      // The rings take whatever places the skipping stone has left free.
      for (let i = rings.length - 1; i >= 0; i--) if (now - rings[i].at >= RING_LASTS) rings.splice(i, 1);
      let slot = 0;
      for (const r of rings) {
        while (slot < MAX_RIPPLES && ripples[slot * 4 + 2] < 1 && ripples[slot * 4 + 3] > 0) slot++;
        if (slot >= MAX_RIPPLES) break;
        ripples.splice(slot * 4, 4, r.x, r.z, (now - r.at) / RING_LASTS, r.size);
        slot++;
      }
      return poses;
    },

    /** A click on the beach: true if it was on a bottle, which is then opened. */
    click(x: number, y: number): boolean {
      if (mode) return true;
      if (!ashore) return false;
      if (washed?.phase === 'lying' && landscape.covers(boxRound(washedAt()), x, y)) {
        open('reading', washedAt());
        return true;
      }
      if (fresh && landscape.covers(boxRound(freshAt()), x, y)) {
        open('writing', freshAt());
        return true;
      }
      return false;
    },

    isOpen: () => mode !== null,
    /** True for a moment after the words are put away, so the click that did it does nothing else. */
    justClosed: () => performance.now() - closedAt < 400,
    /** Whether anything of a bottle's is on the move, and wants smooth frames. */
    moving: () => mode !== null || thrown !== null || (washed !== null && washed.phase !== 'lying'),

    // ---- for testing, from the console: nightpond.bottles ----

    /** The bottles at sea, as they are kept. */
    list: (): Bottle[] => atSea.map((b) => ({ ...b })),
    /** Send one without typing: the words, and (if wanted) a line saying when, as it would be written. Thrown before your eyes if you are on the beach. */
    send(message: string, whenSaid = ''): Bottle | null {
      const when = whenLine(whenSaid, Date.now()) ?? readWriting('', Date.now()).when;
      return message.trim() ? send(message.trim(), when) : null;
    },
    /** Make a bottle's day today (the first at sea, or the one numbered). */
    dueNow(index = 0): Bottle | null {
      const bottle = atSea[index];
      if (!bottle) return null;
      bottle.due = new Date().setHours(0, 0, 0, 0);
      keep();
      return { ...bottle };
    },
    /** Open the empty bottle to write in, or the one that has come back to read, as a click on it would. */
    open(what: 'writing' | 'reading' = 'writing'): boolean {
      if (mode || !ashore || (what === 'reading' ? washed?.phase !== 'lying' : !fresh)) return false;
      open(what, what === 'reading' ? washedAt() : freshAt());
      return true;
    },
    close,
    /** What is on the beach and on the water just now, and where on the page the bottles lie. */
    state: () => ({
      mode,
      fresh,
      thrown: thrown ? now - thrown.began : null,
      washed: washed ? washed.phase : null,
      draft,
      freshOnPage: landscape.spotOnPage([freshAt().x, freshAt().y + 0.05, freshAt().z]),
      washedOnPage: landscape.spotOnPage([washedAt().x, washedAt().y + 0.05, washedAt().z]),
    }),
  };
}
