// Getting things done, and being able to take one back.
//
// The stone keeps tasks (a line that begins with a dash: each stands by the
// path as a lantern). This keeps the little that goes with finishing one:
//
//   when a lantern is let go, the count of what is left is said;
//   Z puts back a task finished by mistake (for half a minute after);
//   what was finished is kept by the day, and can be read back (the book on the
//   table indoors opens at today's).
//
// (There was also a line for writing a task from anywhere, marks in the margin
// of the stone's writing, and a line in the corner saying what was next. They
// were interface, not things in the world, and were taken out.)

import { taskLines } from './tasks';

const KEY = 'nightpond.done';
const KEPT_DAYS = 45;
const UNDO_FOR = 30_000;

interface Done {
  words: string;
  at: number;
}

interface Notes {
  text(): string;
  put(words: string): void;
}
interface Tasks {
  finish(place: number): string | null;
}

const COUNT = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const count = (n: number) => COUNT[n] ?? String(n);

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

export function createDoing(notes: Notes, tasks: Tasks, say: (words: string) => void) {
  let done: Done[] = [];
  try {
    const got: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (Array.isArray(got)) done = got.filter((d): d is Done => !!d && typeof d.words === 'string' && typeof d.at === 'number');
  } catch {
    // Nothing kept, then.
  }
  const keep = () => {
    const from = Date.now() - KEPT_DAYS * 86_400_000;
    done = done.filter((d) => d.at >= from);
    try {
      localStorage.setItem(KEY, JSON.stringify(done));
    } catch {
      // Remembered until the page is closed.
    }
  };

  let last: Done | null = null; // the task most lately finished, while it can still be put back

  /** Put the last finished task back, if it was finished only a moment ago. */
  const undo = () => {
    if (!last || Date.now() - last.at > UNDO_FOR) {
      say('nothing to put back');
      return;
    }
    done = done.filter((d) => d !== last);
    keep();
    const text = notes.text();
    notes.put(`${text}${text === '' || text.endsWith('\n') ? '' : '\n'}- ${last.words}`);
    say('put back');
    last = null;
  };

  window.addEventListener('keydown', (e) => {
    const at = e.target;
    const typing = at instanceof HTMLInputElement || at instanceof HTMLTextAreaElement || (at instanceof HTMLElement && at.isContentEditable);
    if (typing || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key.toLowerCase() === 'z') undo();
  });

  return {
    /** The lantern in a place by the path was clicked: its task is done. */
    finish(place: number): void {
      const words = tasks.finish(place);
      if (words === null) return;
      last = { words, at: Date.now() };
      done.push(last);
      keep();
      const n = taskLines(notes.text()).length;
      say(n === 0 ? 'done · nothing left to do' : `done · ${count(n)} left`);
    },
    undo,

    /** What was finished today, oldest first. */
    today(now = Date.now()): string[] {
      return done.filter((d) => sameDay(d.at, now)).map((d) => d.words);
    },

    /** For testing. */
    log: () => done.slice(),
  };
}
