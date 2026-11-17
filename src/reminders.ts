// Reminders. A line on the stone that begins with a time of day ("15:00 call
// mum", "3pm stand-up", "at 7:30 leave") is kept for that time. It is taken up
// when you stand back from the stone, and is for the next time the clock reads
// so: today if that is still ahead, otherwise tomorrow. The line stays where
// you wrote it until then, so you can see what is waiting, change it, or rub
// it out. When the moment comes the church bell tolls once, the words rise off
// the stone and hang over it a while, then drift away, and the line is gone.
//
// Where the clock is read in twelve hours, a time with no "am" or "pm" and an
// hour of twelve or less ("3:30 dentist") is taken for whichever of the two
// comes next; "03:30" and "15:30" mean what they say. Only a line that begins
// with the time counts: a time in the middle of a sentence is just writing.
//
// If the page was shut when the moment came, it is shown when the page next
// opens: with the bell if it is less than two hours late, without it if more.

import { land, STONE } from './scene/land';
import type { V3 } from './scene/gl';
import './stone.css';

const KEY = 'nightpond.reminders';
const LATE = 2 * 3_600_000; // past this a missed reminder is let go without the bell

/** A line that begins with a time: an hour, perhaps minutes, perhaps am or pm, and then some words. */
const TIMED = /^[ \t]*(?:at[ \t]+)?(\d{1,2})(?:([:.])(\d{2}))?[ \t]*(a\.?m\.?|p\.?m\.?)?(?=[ \t,;:–—-]|$)[ \t]*[,;:–—-]?[ \t]*(\S.*?)[ \t]*$/gim;

/** Whether clocks here count twelve hours twice (as against twenty-four once). */
const TWELVE = /^h1/.test(new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle ?? '');

interface Timed {
  /** The line as written (without the space round it), and where it starts and ends in the writing. */
  line: string;
  start: number;
  end: number;
  /** The hours of the day it may mean (two of them when it does not say which half of the day), and the minute. */
  hours: number[];
  minute: number;
}

/** The lines in some writing that begin with a time of day. */
export function timedLines(writing: string): Timed[] {
  const found: Timed[] = [];
  for (const m of writing.matchAll(TIMED)) {
    const hour = Number(m[1]);
    const minute = m[3] ? Number(m[3]) : 0;
    const half = m[4]?.toLowerCase();
    if (minute > 59) continue;
    let hours: number[];
    if (half) {
      if (hour < 1 || hour > 12) continue;
      hours = [(hour % 12) + (half.startsWith('p') ? 12 : 0)];
    } else {
      // A bare number is not a time ("3 eggs"), and nor is one with a point in it ("3.50 for milk").
      if (m[2] !== ':' || hour > 23) continue;
      // On a twelve-hour clock "3:30" could be either half of the day; "03:30", "0:30" and "15:30" could not.
      hours = TWELVE && hour >= 1 && hour <= 12 && m[1][0] !== '0' ? [hour % 12, (hour % 12) + 12] : [hour];
    }
    found.push({ line: m[0].trim(), start: m.index, end: m.index + m[0].length, hours, minute });
  }
  return found;
}

/** The next time after `from` that the clock reads one of those hours and that minute. */
function nextAt(t: Timed, from: number): number {
  let soonest = Infinity;
  for (const hour of t.hours) {
    const d = new Date(from);
    d.setHours(hour, t.minute, 0, 0);
    if (d.getTime() <= from) d.setDate(d.getDate() + 1);
    soonest = Math.min(soonest, d.getTime());
  }
  return soonest;
}

/**
 * On the hour the church is already striking the time (the count by day, one
 * stroke by night, a few seconds apart: see drawClock in main.ts). A reminder
 * that falls on the hour waits for that to finish, so its one stroke can be
 * told from the rest. Milliseconds to wait.
 */
function untilTheHourIsStruck(now: Date): number {
  if (now.getMinutes() !== 0) return 0;
  const hour = now.getHours();
  const strokes = hour >= 7 && hour <= 22 ? hour % 12 || 12 : 1;
  return Math.max(0, strokes * 2700 + 2500 - now.getSeconds() * 1000);
}

const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const clockWords = (at: number) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(at).toLowerCase();

/** The middle of the stone's carving, and the air over its crown: the words rise from one to the other. */
const FOOT = land(STONE.x, STONE.z) - 0.2;
const CARVING: V3 = [STONE.x + 0.5 * Math.sin(STONE.yaw), FOOT + 0.5 + 1.2, STONE.z + 0.5 * Math.cos(STONE.yaw)];
const OVERHEAD: V3 = [STONE.x, FOOT + 0.5 + STONE.height + 0.95, STONE.z];

interface Kept {
  line: string;
  at: number;
}

/** Words that have left the stone and are on their way. */
interface Rising {
  el: HTMLElement;
  /** Whether they hang by the stone (and so follow it as the picture slides), and which row of several they are. */
  byStone: boolean;
  row: number;
  wide: number;
  /** When they stop hanging there and drift away. */
  goesAt: number;
  gone: boolean;
}

/**
 * `notes` is the writing on the stone; `toll` rings the church bell once;
 * `say` shows a few passing words; `pageAt` says where a place in the scene
 * falls on the page (null when the meadow is out of sight).
 */
export function createReminders(
  notes: { text(): string; isOpen(): boolean; takeLine(start: number, end: number): { x: number; y: number; size: number } | null },
  toll: () => void,
  say: (words: string) => void,
  pageAt: (p: V3) => [number, number] | null,
) {
  let kept: Kept[] = [];
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (Array.isArray(stored)) kept = stored.filter((k) => k && typeof k.line === 'string' && typeof k.at === 'number').map((k) => ({ line: k.line, at: k.at }));
  } catch {
    // Storage can be unavailable; then a reminder lasts only while the page is open.
  }
  let stored = JSON.stringify(kept);
  const keep = () => {
    const now = JSON.stringify(kept);
    if (now === stored) return; // nothing has changed
    stored = now;
    try {
      localStorage.setItem(KEY, now);
    } catch {
      // Kept until the page is closed.
    }
  };

  const opened = performance.now();
  let first = true; // nothing has been looked at since the page opened
  let seen: string | null = null; // the writing as it was when the reminders were last taken up
  const rising: Rising[] = [];

  /**
   * Take up the reminders in the writing. One that was already kept (the very
   * same line) keeps its time; a new or altered one is for the next time the
   * clock reads so; one whose line is gone is forgotten.
   */
  function takeUp(now: number, quietly: boolean): void {
    const before = [...kept];
    const fresh: Kept[] = [];
    kept = timedLines(notes.text()).map((t) => {
      const k = before.findIndex((b) => b.line === t.line);
      if (k >= 0) return before.splice(k, 1)[0];
      const made = { line: t.line, at: nextAt(t, now) };
      fresh.push(made);
      return made;
    });
    keep();
    if (quietly || !fresh.length) return;
    const soonest = fresh.reduce((a, b) => (b.at < a.at ? b : a));
    const tomorrow = new Date(soonest.at).getDate() !== new Date(now).getDate() ? ' tomorrow' : '';
    const more = fresh.length - 1;
    say(`the bell will toll at ${clockWords(soonest.at)}${tomorrow}${more ? ` · and for ${NUMBERS[more] ?? more} more` : ''}`);
  }

  /** Lift some words off the stone: from where their line stood if you are at the stone reading, otherwise from its carving. */
  function lift(words: string, stood: { x: number; y: number; size: number } | null, holds: number): void {
    const el = document.createElement('div');
    el.className = 'reminder-away';
    el.textContent = words;
    const row = rising.filter((r) => !r.gone && r.byStone === !stood).length;
    if (stood) {
      el.style.left = `${Math.round(stood.x)}px`;
      el.style.top = `${Math.round(stood.y)}px`;
      el.style.fontSize = `${stood.size}px`;
      el.classList.add('from-line');
    }
    document.body.append(el);
    const r: Rising = { el, byStone: !stood, row, wide: el.offsetWidth, goesAt: performance.now() + holds, gone: false };
    rising.push(r);
    place(r);
    void el.offsetWidth; // so that it rises from where it starts and does not simply appear above
    el.classList.add('risen');
  }

  /** Put words that hang by the stone where the stone now is on the page. */
  function place(r: Rising): void {
    if (!r.byStone) return;
    const from = pageAt(CARVING);
    const to = pageAt(OVERHEAD);
    // Lying back, or down on the beach, the stone is out of sight: they rise in the middle of the view.
    const x = from ? from[0] : window.innerWidth / 2;
    const y = from ? from[1] : window.innerHeight * 0.62;
    const dy = from && to ? to[1] - from[1] : -window.innerHeight * 0.14;
    // Never off the edge of the window, and one above another if there are several.
    const half = r.wide / 2 + 14;
    const dx = Math.max(half - x, Math.min(window.innerWidth - half - x, from && to ? to[0] - from[0] : 0));
    r.el.style.left = `${Math.round(x)}px`;
    r.el.style.top = `${Math.round(y)}px`;
    r.el.style.setProperty('--dx', `${Math.round(dx)}px`);
    r.el.style.setProperty('--dy', `calc(${Math.round(dy)}px - ${r.row * 1.45}em)`);
  }

  /** The moment has come for some of them (`late` is by how much): the bell, the words, and the lines off the stone. */
  function fire(due: Kept[], now: number): void {
    kept = kept.filter((k) => !due.includes(k));
    keep();
    const late = Math.max(...due.map((k) => now - k.at));
    const rings = due.some((k) => now - k.at < LATE);
    const wait = rings && late < 60_000 ? untilTheHourIsStruck(new Date(now)) : 0;
    let shown = 0;
    for (const k of due) {
      const t = timedLines(notes.text()).find((l) => l.line === k.line);
      // (If the line is being rewritten at this very moment it is no longer this reminder: let it be.)
      if (!t) continue;
      // Over the stone the words hang long enough to be noticed and read; lifted from under your eyes, they go sooner.
      const stood = notes.takeLine(t.start, t.end);
      lift(k.line, stood, wait + (stood ? 2400 : 7500) + shown * 600);
      shown++;
    }
    seen = notes.text();
    if (shown && rings) window.setTimeout(toll, wait);
  }

  return {
    /** Called every frame (it does very little on most of them). */
    update(now = Date.now()): void {
      const text = notes.text();
      if (seen === null) {
        seen = text;
        takeUp(now, true);
      } else if (!notes.isOpen() && text !== seen) {
        seen = text;
        takeUp(now, false);
      }
      // When the page opens, wait a moment for the picture before showing what was missed.
      if (first && performance.now() - opened < 1500) return;
      first = false;
      const due = kept.filter((k) => k.at <= now);
      if (due.length) fire(due, now);

      const clock = performance.now();
      for (const r of rising) {
        if (r.gone) continue;
        place(r);
        if (clock >= r.goesAt && !r.el.classList.contains('going')) {
          r.el.classList.add('going');
          window.setTimeout(() => {
            r.gone = true;
            r.el.remove();
          }, 3200);
        }
      }
      while (rising.length && rising[0].gone) rising.shift();
    },

    /** Whether words are in the air just now. */
    busy: () => rising.some((r) => !r.gone),

    /** For testing: what is waiting, soonest first, with the time each is for. */
    list: () => [...kept].sort((a, b) => a.at - b.at).map((k) => ({ line: k.line, at: k.at, when: new Date(k.at).toString() })),
    /** For testing: make the n-th waiting reminder (the soonest, if not said) come due now. */
    fire(n = 0): void {
      const k = [...kept].sort((a, b) => a.at - b.at)[n];
      if (k) k.at = Date.now() - 1;
      keep();
    },
    /** For testing: move every waiting reminder earlier by so many milliseconds (then reload, to try one that was missed). */
    shift(ms: number): void {
      for (const k of kept) k.at -= ms;
      keep();
    },
  };
}
