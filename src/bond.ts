// What there is between you and the lamb. It remembers the days it has spent
// by your fire and the spells of work you have finished with it beside you,
// and over some weeks of that it grows from a lamb into a yearling. You can
// give it a name by writing a line on the stone, such as "lamb: pip": when you
// stand back from the stone the line lifts off it and is gone, and the name
// is the lamb's. Write another such line to change it. Click the lamb and it
// has something to say: mostly what sheep say, sometimes more.

const KEY = 'nightpond.lamb';

interface Bond {
  /** The first day it came to your fire. */
  since: string;
  /** How many different days it has kept you company, and the last of them. */
  days: number;
  lastDay: string;
  /** Spells of work finished with it beside you. */
  sessions: number;
  /** What you have called it. */
  name: string;
}

/** A line that names the lamb: "lamb: pip", "lamb = pip", "the lamb is pip", "the lamb is called pip". */
const NAMING = /^[ \t]*(?:the[ \t]+)?lamb(?:[ \t]+is(?:[ \t]+called)?|[ \t]*[:=–-])[ \t]*(.{1,24}?)[ \t.]*$/im;

/** The naming line in some writing, if there is one: the name it gives, the line as written, and where it starts and ends. */
export function namingLine(writing: string): { name: string; line: string; start: number; end: number } | null {
  const found = NAMING.exec(writing);
  if (!found) return null;
  return { name: found[1].trim().toLowerCase(), line: found[0], start: found.index, end: found.index + found[0].length };
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** What the lamb can see of the moment, for choosing what to say. */
export interface Moment {
  hour: number;
  rain: number;
  snow: number;
  heat: number;
  stars: number;
  /** The fire: burning, embers or cold; and how many logs are left on the pile. */
  phase: 'cold' | 'burning' | 'embers';
  logs: number;
  /** The wind (0..1), the air's temperature in Celsius, fog (0..1), and whether there is thunder about. */
  wind?: number;
  temp?: number;
  fog?: number;
  thunder?: number;
  /** Whether the two of you are down on the beach. */
  ashore?: boolean;
}

const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const count = (n: number) => NUMBERS[n] ?? String(n);
const pick = <T>(from: T[]): T => from[Math.floor(Math.random() * from.length)];

export function createBond() {
  let bond: Bond = { since: '', days: 0, lastDay: '', sessions: 0, name: '' };
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (kept && typeof kept.days === 'number' && typeof kept.sessions === 'number') bond = { ...bond, ...kept };
  } catch {
    // Storage can be unavailable in private windows; then every day is its first.
  }
  const keep = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(bond));
    } catch {
      // It lasts until the page is closed.
    }
  };
  let lastSaid = '';

  return {
    /** It has come and lain down by your fire. Counts once for each day. */
    together(): void {
      const day = today();
      if (bond.lastDay === day) return;
      bond = { ...bond, since: bond.since || day, days: bond.days + 1, lastDay: day };
      keep();
    },

    /** A spell of work finished with it beside you. */
    session(): void {
      bond = { ...bond, sessions: bond.sessions + 1 };
      keep();
    },

    /** 0 for a new lamb, 1 for a yearling: about six weeks of days, sooner with work done. */
    grown: () => Math.min(1, (bond.days + bond.sessions * 0.25) / 42),
    days: () => bond.days,

    name: () => bond.name,
    /** Give it a name, or a new one. */
    setName(name: string): void {
      bond = { ...bond, name };
      keep();
    },

    /** What it is called and how long you have known it: shown when you point at it. */
    about(): string {
      const name = bond.name;
      const known = bond.days >= 2 ? ` · ${count(bond.days)} days by your fire` : '';
      return name ? `${name}${known}` : `a lamb${known} · write “lamb: ” and a name on the stone`;
    },

    /** What it says when you click it. */
    says(m: Moment): string {
      const name = bond.name;
      const baa = ['baa.', 'baa?', 'mèè.', 'baaa.', 'mm.', 'bah.', '…baa.'];
      const more: string[] = [];
      if (m.hour < 5 || m.hour >= 23.5) more.push('still up? me too.', 'the night is long. the fire is warm.', 'it is late. i will stay.');
      if (m.rain > 0.15) more.push('listen to that rain.', 'rain on wool. i do not mind.');
      if (m.rain > 0.15 && !m.ashore) more.push('closer to the fire, then.');
      if (m.snow > 0.1) more.push('snow again. good wool weather.', 'i am wearing the snow.');
      if (m.heat > 0.3) more.push('too hot for wool.', 'the grass has gone dry.', 'i will lie here. you do the moving.');
      if ((m.thunder ?? 0) > 0.5) more.push('i heard it too.', 'the sky is cross. we are fine.', 'it is only loud.');
      if ((m.wind ?? 0) > 0.45 && (m.temp ?? 10) < 6) more.push('the wind has teeth today.', 'i am keeping small.');
      if ((m.fog ?? 0) > 0.4) more.push('the hills have gone. we have not.');
      // Down by the water it has the sea on its mind.
      if (m.ashore) more.push('so much water.', 'throw one. i will watch.', 'i go no further than this.', 'the sea is never finished.');
      if (m.stars > 0.5 && m.rain < 0.05) more.push('look up sometime.', 'so many stars tonight.');
      if (m.phase === 'burning' && m.logs > 1) more.push(`${count(m.logs)} logs to go.`, 'you work. i will watch the fire.');
      if (m.phase === 'burning' && m.logs <= 1) more.push('last log. nearly there.');
      if (m.phase === 'embers') more.push('rest now.', 'well done. sit a while.');
      if (bond.days >= 3) more.push(`${count(bond.days)} days now, you and i.`);
      if (bond.sessions >= 4) more.push(`${count(bond.sessions)} fires we have seen out.`);
      if (name) more.push(`${name}. that is me.`);
      // Mostly it just says what sheep say.
      let line = '';
      for (let tries = 0; tries < 4 && (!line || line === lastSaid); tries++) line = more.length && Math.random() < 0.45 ? pick(more) : pick(baa);
      lastSaid = line;
      return line;
    },
  };
}
