// UPDATE. The page keeps itself up to date from its repository on GitHub, with nothing but itself.
//
// A page cannot write to the file it was opened from, so it does not replace that file. What it does,
// each time it is opened, before anything else is begun:
//   1. If a newer copy of itself was kept in this browser at an earlier opening, it becomes that copy at
//      once (so, once fetched, the newest version starts straight away, with or without a network).
//   2. It asks the repository which build is there (a few bytes). If that is newer than itself, it
//      fetches the whole page, checks that what came is a whole page and the build it claims to be,
//      keeps it in the browser, and becomes it.
// "Becomes" is in place: the same window, the same address, so everything the page remembers (your
// place, your notes, the stone, the catch) is as it was. Nothing is asked of anyone, and nothing is
// shown. Without a network, or with the repository out of reach, the page simply starts as it is.
//
// The only thing sent anywhere is the request for those two files.

/** When this page was built, in milliseconds: a later build is a newer page. (Set by the build: see vite.config.ts.) */
declare const __BUILD__: number;
/** Where the newest build is kept: the address its two files, version.json and nightpond.html, are fetched from. Empty to keep as it is. */
declare const __UPDATE_BASE__: string;

export const BUILD = __BUILD__;

const STATE = 'nightpond.update';
const STORE = 'nightpond-update';

/** What is remembered of a kept copy that was started: which build, how many times running it has been tried, and the last build that started properly. */
interface State {
  tried: number;
  tries: number;
  ok: number;
}

function readState(): State {
  try {
    const s = JSON.parse(localStorage.getItem(STATE) ?? 'null');
    if (s && typeof s.tried === 'number') return { tried: s.tried, tries: Number(s.tries) || 0, ok: Number(s.ok) || 0 };
  } catch {
    // Storage can be unavailable in private windows.
  }
  return { tried: 0, tries: 0, ok: 0 };
}

function writeState(s: State): void {
  try {
    localStorage.setItem(STATE, JSON.stringify(s));
  } catch {
    // Then nothing is remembered of it.
  }
}

/** The browser's own store, where the kept copy lives (it is too big for the small store the notes are in). Null if there is none to be had. */
function store(): Promise<IDBDatabase | null> {
  return new Promise((done) => {
    try {
      const ask = indexedDB.open(STORE, 1);
      ask.onupgradeneeded = () => ask.result.createObjectStore('page');
      ask.onsuccess = () => done(ask.result);
      ask.onerror = () => done(null);
      ask.onblocked = () => done(null);
    } catch {
      done(null);
    }
  });
}

async function kept(): Promise<{ build: number; html: string } | null> {
  const db = await store();
  if (!db) return null;
  return new Promise((done) => {
    try {
      const got = db.transaction('page').objectStore('page').get('latest');
      got.onsuccess = () => {
        const v = got.result;
        done(v && typeof v.build === 'number' && typeof v.html === 'string' ? v : null);
      };
      got.onerror = () => done(null);
    } catch {
      done(null);
    }
  });
}

async function keep(copy: { build: number; html: string } | null): Promise<void> {
  const db = await store();
  if (!db) return;
  await new Promise<void>((done) => {
    try {
      const tx = db.transaction('page', 'readwrite');
      if (copy) tx.objectStore('page').put(copy, 'latest');
      else tx.objectStore('page').delete('latest');
      tx.oncomplete = () => done();
      tx.onerror = () => done();
      tx.onabort = () => done();
    } catch {
      done();
    }
  });
}

/** Become another copy of the page, in place. (It never comes back: the page that asked is gone.) */
function become(html: string): Promise<never> {
  document.open();
  document.write(html);
  document.close();
  return new Promise(() => {});
}

const within = <T>(work: Promise<T>, ms: number): Promise<T | null> => Promise.race([work, new Promise<null>((done) => window.setTimeout(() => done(null), ms))]);

/** Which build the repository holds. */
async function buildThere(): Promise<number> {
  const res = await fetch(`${__UPDATE_BASE__}version.json`, { cache: 'no-store' });
  if (!res.ok) return 0;
  return Number((await res.json())?.build) || 0;
}

/** Fetch that build: the whole page, or null if what came is not a whole page or not the build it should be. */
async function fetchBuild(build: number): Promise<string | null> {
  const res = await fetch(`${__UPDATE_BASE__}nightpond.html`, { cache: 'no-store' });
  if (!res.ok) return null;
  const html = await res.text();
  const whole = html.length > 100_000 && /^\s*<!doctype html>/i.test(html) && /<\/html>\s*$/i.test(html);
  return whole && html.includes(`name="nightpond-build" content="${build}"`) ? html : null;
}

/**
 * Before the page begins: become the newest version there is, if there is a newer one than this.
 * Comes back (having done nothing that shows) when this page is the one to go on with.
 */
export async function updateOnLaunch(): Promise<void> {
  // (Not where no address was given: while the page is being worked on, none is.)
  if (!__UPDATE_BASE__) return;
  try {
    // A copy kept at an earlier opening.
    const state = readState();
    const have = await within(kept(), 1500);
    if (have && have.build > BUILD) {
      const failing = state.tried === have.build && state.ok !== have.build;
      if (failing && state.tries >= 2) {
        // It has been started twice and never got going: it is let go, and this page goes on as it is.
        await keep(null);
      } else {
        writeState({ ...state, tried: have.build, tries: failing ? state.tries + 1 : 1 });
        return await become(have.html);
      }
    } else if (have && have.build < BUILD) {
      void keep(null); // (the file itself is newer than the kept copy, which is of no more use)
    }

    // The repository. The question of which build is there is given a moment and a half; if the answer
    // is a newer one, the page waits for it (up to eight seconds: it is under a megabyte) and becomes it.
    // On a line too slow for that, the page starts as it is, and the new one is kept for next time.
    const there = await within(buildThere(), 1500);
    if (!there || there <= BUILD) return;
    if (state.tried === there && state.ok !== there && state.tries >= 2) return; // (that build would not start here: it is not fetched again)
    const fetching = fetchBuild(there);
    const html = await within(fetching, 8000);
    if (html) {
      await keep({ build: there, html });
      writeState({ ...state, tried: there, tries: state.tried === there && state.ok !== there ? state.tries + 1 : 1 });
      return await become(html);
    }
    void fetching
      .then((late) => {
        if (late) void keep({ build: there, html: late });
      })
      .catch(() => {});
  } catch {
    // Out of reach, or the browser keeps no store: the page goes on as it is.
  }
}

/** The page has started properly: remembered, so that a kept copy which does not start is found out and let go. */
export function updateStarted(): void {
  const state = readState();
  if (state.ok !== BUILD && (state.tried === BUILD || state.ok)) writeState({ ...state, ok: BUILD });
}
