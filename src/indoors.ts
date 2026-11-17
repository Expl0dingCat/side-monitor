// What there is to do in the room indoors. None of it is a button: each is
// the thing itself, answering a click the way the thing would.
//
//   the stove      a log from the basket goes on, and it burns up for a quarter of an hour
//                  (the basket holds five, and fills again slowly)
//   the kettle     is put on; in under a minute it boils, sooner over a fed fire
//   the mug        tea is poured, if the kettle is boiling; it steams until it has gone cold
//   the cat        lifts its head, and its tail goes over
//   a curtain      they are drawn across the window, or back
//   the open book  a page is turned, and a line of it read
//   the hourglass  is the same half hour as the campfire's: turn it to begin, or to stop
//   the wireless   is the gramophone's music: on and off (shift for the next tune)
//
// The last two belong to the page, which already keeps the fire and the music;
// the rest are kept here, and remembered from one visit to the next.

import { BASKET_LOGS } from './scene/parlour';

const KEY = 'nightpond.parlour';

/** How the room's moving parts stand this frame. */
export interface RoomLife {
  /** The curtains: 0 drawn back, 1 across the window. */
  drawn: number;
  /** The cat: its breath (-1..1), how far its head is lifted (0..1), which way its tail lies (-1..1). */
  cat: [number, number, number];
  /** The clock's pendulum, as an angle. */
  swing: number;
  /** Logs left in the basket. */
  logs: number;
  /** The stove: 0 ticking over, 1 just fed. */
  flare: number;
  /** The kettle: 0 cold, 1 on the boil. */
  boil: number;
  /** The mug: 0 empty or cold, 1 just poured. */
  tea: number;
  /** How misted the window is by the steam in the room, 0..1. */
  fog: number;
}

/** The size of the picture kept of where the misted glass has been wiped: across, and up. */
export const WIPE = { wide: 128, high: 56 };

interface Kept {
  drawn: boolean;
  logs: number;
  /** When the stove was last fed, the basket last topped up, the kettle put on and the tea poured (0 for never). */
  fedAt: number;
  filledAt: number;
  kettleAt: number;
  teaAt: number;
  /** Which page the book lies open at. */
  page: number;
}

const BURNS = 15 * 60_000; // how long a log makes a difference
const REFILL = 10 * 60_000; // a log comes back to the basket this often
const STAYS_HOT = 12 * 60_000; // how long the kettle is kept on the boil before it is taken off
const TEA_LASTS = 10 * 60_000;

// The book on the table. A few lines to a page, written for this place.
const PAGES = [
  'the tide keeps no diary, and is never late',
  'a house is a lamp somebody else can see',
  'rain on turf makes no sound at all; listen for it on the glass',
  'the kettle sings before it knows the tune',
  'what the fog takes, it gives back by noon',
  'count the gulls going out and you will know the weather coming in',
  'a wall is only the hill, persuaded to stand closer',
  'the lamb knows the way home; it is the shepherd who forgets',
  'snow is the one visitor who tidies as it arrives',
  'you cannot hurry a fire, a loaf or a sea mist',
  'every window faces the weather somebody is waiting on',
  'the stone remembers; the rest of us write it down',
];

function load(): Kept {
  const fresh: Kept = { drawn: false, logs: BASKET_LOGS, fedAt: 0, filledAt: Date.now(), kettleAt: 0, teaAt: 0, page: 0 };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh;
    const got = JSON.parse(raw) as Partial<Kept>;
    return {
      drawn: got.drawn === true,
      logs: typeof got.logs === 'number' ? Math.max(0, Math.min(BASKET_LOGS, Math.round(got.logs))) : BASKET_LOGS,
      fedAt: Number(got.fedAt) || 0,
      filledAt: Number(got.filledAt) || Date.now(),
      kettleAt: Number(got.kettleAt) || 0,
      teaAt: Number(got.teaAt) || 0,
      page: Number(got.page) || 0,
    };
  } catch {
    return fresh;
  }
}

export function createIndoors(say: (words: string) => void) {
  let s = load();
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      // Remembered until the page is closed.
    }
  };

  let drawnNow = s.drawn ? 1 : 0;
  let headUp = 0;
  let petted = -1e9; // when the cat was last spoken to, on the room's own clock
  let tail = 0.4;
  let clock = 0; // seconds the room has been lived in, this visit
  let fog = 0; // how misted the kettle and the tea have made the window
  // Where the mist on the glass has been wiped away: a small picture of the whole window, each spot from
  // 0 (misted) to 255 (wiped clean). A wiped place mists over again in a couple of minutes, and now and
  // then a bead of water gathers at the foot of a stroke and runs down the glass, clearing a thread as it goes.
  const wiped = new Uint8Array(WIPE.wide * WIPE.high);
  let wipedChanged = false;
  let lastFade = 0;
  let last: [number, number] | null = null;
  const runs: { x: number; y: number; left: number }[] = [];
  const dab = (u: number, v: number, reach: number) => {
    const cx = u * WIPE.wide;
    const cy = v * WIPE.high;
    const r = reach * WIPE.high;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(WIPE.high - 1, Math.ceil(cy + r)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(WIPE.wide - 1, Math.ceil(cx + r)); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
        if (d < 1) wiped[y * WIPE.wide + x] = Math.max(wiped[y * WIPE.wide + x], Math.round(255 * Math.min(1, (1 - d) * 2.2)));
      }
    }
    wipedChanged = true;
  };

  /** How hot the stove is burning: 1 just fed, falling away over a quarter of an hour. */
  const flareAt = (now: number) => (s.fedAt ? Math.max(0, 1 - (now - s.fedAt) / BURNS) ** 1.4 : 0);
  /** How near the boil the kettle is: it takes the best part of a minute, less over a fed fire. */
  const boilAt = (now: number) => {
    if (!s.kettleAt) return 0;
    const on = now - s.kettleAt;
    if (on > STAYS_HOT) return Math.max(0, 1 - (on - STAYS_HOT) / 60_000);
    const takes = (48 - 22 * flareAt(s.kettleAt)) * 1000;
    return Math.min(1, on / takes);
  };

  return {
    /** A log from the basket onto the fire. */
    stoke(now = Date.now()): void {
      if (s.logs <= 0) {
        say('the basket is empty · it fills again by and by');
        return;
      }
      s = { ...s, logs: s.logs - 1, fedAt: now, filledAt: s.logs === BASKET_LOGS ? now : s.filledAt };
      save();
      say(s.logs === 0 ? 'the last log on the fire' : 'a log on the fire');
    },

    /** The kettle is put on (or, if it is already boiling, left to it). */
    kettle(now = Date.now()): void {
      const hot = boilAt(now);
      if (s.kettleAt && now - s.kettleAt < STAYS_HOT) {
        say(hot >= 1 ? 'the kettle is boiling' : 'the kettle is on');
        return;
      }
      s = { ...s, kettleAt: now };
      save();
      say('the kettle is on');
    },

    /** Tea is poured into the mug, if there is boiling water for it. */
    pour(now = Date.now()): void {
      if (boilAt(now) >= 0.98) {
        s = { ...s, teaAt: now, kettleAt: 0 };
        save();
        say('tea');
      } else if (s.kettleAt && now - s.kettleAt < STAYS_HOT) {
        say('the kettle has not boiled yet');
      } else if (s.teaAt && now - s.teaAt < TEA_LASTS) {
        say('still warm');
      } else {
        say('put the kettle on first');
      }
    },

    /** The cat is spoken to. */
    pet(): void {
      petted = clock;
      tail = -Math.sign(tail || 1) * (0.5 + 0.5 * Math.random());
      say('prrr');
    },

    /** The curtains are drawn across, or back. */
    curtains(): void {
      s = { ...s, drawn: !s.drawn };
      save();
    },

    /** A page of the book is turned, and a line of it read. */
    turnPage(): void {
      s = { ...s, page: (s.page + 1) % PAGES.length };
      save();
      say(PAGES[s.page]);
    },

    drawn: () => s.drawn,

    /**
     * A finger drawn across the misted glass, to a place on the window (0..1 across, 0..1 up). `start`
     * is true where the finger first touches; after that each call carries the stroke on from the last.
     */
    wipe(u: number, v: number, start: boolean): void {
      if (u < 0 || u > 1 || v < 0 || v > 1) {
        last = null;
        return;
      }
      const from = start || !last ? [u, v] : last;
      const steps = Math.max(1, Math.ceil(Math.hypot((u - from[0]) * WIPE.wide, (v - from[1]) * WIPE.high) / 2));
      for (let i = 1; i <= steps; i++) dab(from[0] + ((u - from[0]) * i) / steps, from[1] + ((v - from[1]) * i) / steps, 0.085);
      // (A bead of water, sometimes, from the lowest part of the stroke.)
      if (Math.random() < 0.1 && runs.length < 14) runs.push({ x: u + (Math.random() - 0.5) * 0.02, y: v - 0.07, left: 0.15 + Math.random() * 0.5 });
      last = [u, v];
    },
    /** The finger is lifted. */
    wipeEnd(): void {
      last = null;
    },
    /** The picture of where the glass is wiped, if it has changed since it was last asked for. */
    wipedNow(): Uint8Array | null {
      if (!wipedChanged) return null;
      wipedChanged = false;
      return wiped;
    },

    /** Called every frame while you are indoors (and it does no harm out of doors). */
    update(dt: number, now = Date.now()): RoomLife {
      clock += dt;
      // The basket fills again, a log at a time.
      if (s.logs < BASKET_LOGS && now - s.filledAt > REFILL) {
        s = { ...s, logs: s.logs + 1, filledAt: now };
        save();
      }
      drawnNow += ((s.drawn ? 1 : 0) - drawnNow) * (1 - Math.exp(-dt * 3.2));
      if (Math.abs((s.drawn ? 1 : 0) - drawnNow) < 0.003) drawnNow = s.drawn ? 1 : 0;
      // Spoken to, the cat looks up for a few seconds, then settles again.
      const awake = clock - petted < 3.2 ? 1 : 0;
      headUp += (awake - headUp) * (1 - Math.exp(-dt * (awake ? 7 : 1.6)));
      // A boiling kettle steams the window up in half a minute; it clears again, slowly, when the kettle is off.
      const boiling = boilAt(now);
      const steamy = Math.max(boiling >= 1 ? 0.95 : 0.5 * boiling * boiling, s.teaAt ? 0.4 * Math.max(0, 1 - (now - s.teaAt) / TEA_LASTS) : 0);
      fog += (steamy - fog) * (1 - Math.exp(-dt / (steamy > fog ? 14 : 110)));
      // Beads run down; and what was wiped mists over again.
      for (let i = runs.length - 1; i >= 0; i--) {
        const run = runs[i];
        const fall = dt * (0.05 + 0.25 * (1 - run.left));
        run.y -= fall;
        run.left -= fall;
        if (run.y > 0 && run.left > 0) dab(run.x, run.y, 0.022);
        else runs.splice(i, 1);
      }
      if (clock - lastFade > 0.5) {
        lastFade = clock;
        for (let i = 0; i < wiped.length; i++) {
          if (wiped[i] > 0) {
            wiped[i] -= 1;
            wipedChanged = true;
          }
        }
      }
      return {
        fog,
        drawn: drawnNow,
        cat: [Math.sin(clock * 1.15), headUp, tail * (1 - 0.25 * Math.sin(clock * 0.6) * headUp)],
        swing: 0.2 * Math.sin(clock * 3.14159),
        logs: s.logs,
        flare: flareAt(now),
        boil: boilAt(now),
        tea: s.teaAt ? Math.max(0, 1 - (now - s.teaAt) / TEA_LASTS) : 0,
      };
    },
  };
}
