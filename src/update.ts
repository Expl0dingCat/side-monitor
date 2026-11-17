// UPDATE. The page keeps itself up to date from its repository on GitHub, with nothing but itself.
//
// Versions are kept as GitHub Releases: each release is a version (its tag, as v1.2.3), and the release
// GitHub calls the latest is the newest version. A page cannot write to the file it was opened from, so
// it does not replace that file. What it does, each time it is opened, before anything else is begun:
//   1. If a newer copy of itself was kept in this browser at an earlier opening, it becomes that copy at
//      once (so, once fetched, the newest version starts straight away, with or without a network).
//   2. It asks GitHub which release is the latest. If that is a newer version than itself, it fetches
//      that release's nightpond.html, checks that what came is a whole page and the version the release
//      says, keeps it in the browser, and becomes it.
// "Becomes" is in place: the same window, the same address, so everything the page remembers (your
// place, your notes, the stone, the catch) is as it was. Without a network, or with GitHub out of
// reach, the page simply starts as it is. And when the file it was opened from is older than the newest
// version, it says so under the time, and offers the new file to save over the old.
//
// (The page is fetched from the repository as it stood at the release's tag, not from the file attached
// to the release: GitHub does not let a page read a release's attachments, only its own files. So the
// new nightpond.html goes into the repository before the release is made.)
//
// The only things sent anywhere are the question to GitHub and the request for the file.

/** This page's version, as 1.2.3. (Set by the build from package.json: see vite.config.ts.) */
declare const __VERSION__: string;
/** Where the releases are asked after: the repository's address in GitHub's API. Empty to keep as it is. */
declare const __RELEASES__: string;
/** Where a release's files are fetched from: the repository's address for its files as they stood at a tag. */
declare const __FILES__: string;

export const VERSION = __VERSION__;

/** A version as its numbers (v1.2.3, or 1.2.3, is [1, 2, 3]); null if it is not one. */
function numbers(version: string): number[] | null {
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/i.exec(version.trim());
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
}

/** Whether the first version is newer than the second. */
function newer(a: string, b: string): boolean {
  const x = numbers(a);
  const y = numbers(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

const STATE = 'nightpond.update';
const STORE = 'nightpond-update';
const FILE = 'nightpond.update.file';

/**
 * The version of the file this page was opened from, when this page is a newer copy that the file
 * became. (Null: this page is the file itself.) The file's page leaves its own version as a mark, for
 * this window only, just before it becomes the newer copy; the copy takes the mark up as it starts.
 */
let fileVersion: string | null = null;

function takeFileMark(): string | null {
  const own = window as unknown as { nightpondFile?: string };
  let mark = typeof own.nightpondFile === 'string' ? own.nightpondFile : '';
  delete own.nightpondFile;
  try {
    mark = sessionStorage.getItem(FILE) || mark;
    sessionStorage.removeItem(FILE);
  } catch {
    // Then the mark left on the window itself is gone by.
  }
  return numbers(mark) ? mark : null;
}

/**
 * A page of the old kind (from before versions were kept as releases: it went by build numbers, not
 * versions), when it has fetched this page and becomes it, leaves no mark of its own; but just before
 * it does, it writes down which build it is starting, as a number. So a page that finds a number
 * written there was started by a file of the old kind, which is older than any release. (It is cleared,
 * so that a page opened from a file of this kind does not find it.)
 */
function takeOldMark(): boolean {
  try {
    const s = JSON.parse(localStorage.getItem(STATE) ?? 'null');
    if (s && typeof s.tried === 'number') {
      localStorage.removeItem(STATE);
      return true;
    }
  } catch {
    // Storage can be unavailable in private windows.
  }
  return false;
}

function leaveFileMark(version: string): void {
  (window as unknown as { nightpondFile?: string }).nightpondFile = version;
  try {
    sessionStorage.setItem(FILE, version);
  } catch {
    // Then the mark on the window has to do.
  }
}

/**
 * What is remembered of a kept copy that was started: which version, how many times running it has been
 * tried, and the last version that started properly. And of a release whose page could not be had (it
 * was not in the repository yet, perhaps): which, and when it was last tried, so it is not fetched at
 * every opening.
 */
interface State {
  tried: string;
  tries: number;
  ok: string;
  missed: string;
  missedAt: number;
}

function readState(): State {
  try {
    const s = JSON.parse(localStorage.getItem(STATE) ?? 'null');
    if (s && typeof s.tried === 'string') return { tried: s.tried, tries: Number(s.tries) || 0, ok: String(s.ok ?? ''), missed: String(s.missed ?? ''), missedAt: Number(s.missedAt) || 0 };
  } catch {
    // Storage can be unavailable in private windows.
  }
  return { tried: '', tries: 0, ok: '', missed: '', missedAt: 0 };
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

async function kept(): Promise<{ version: string; html: string } | null> {
  const db = await store();
  if (!db) return null;
  return new Promise((done) => {
    try {
      const got = db.transaction('page').objectStore('page').get('latest');
      got.onsuccess = () => {
        const v = got.result;
        done(v && typeof v.version === 'string' && numbers(v.version) && typeof v.html === 'string' ? v : null);
      };
      got.onerror = () => done(null);
    } catch {
      done(null);
    }
  });
}

async function keep(copy: { version: string; html: string } | null): Promise<void> {
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
  leaveFileMark(fileVersion ?? VERSION);
  document.open();
  document.write(html);
  document.close();
  return new Promise(() => {});
}

const within = <T>(work: Promise<T>, ms: number): Promise<T | null> => Promise.race([work, new Promise<null>((done) => window.setTimeout(() => done(null), ms))]);

/** Which release GitHub calls the latest: its tag, and the version that is. (Null if there is none, or it cannot be told.) */
async function latestThere(): Promise<{ tag: string; version: string } | null> {
  const res = await fetch(`${__RELEASES__}releases/latest`, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) return null;
  const tag = String((await res.json())?.tag_name ?? '');
  // (A tag is a few letters, digits, dots and dashes: nothing else is taken for one.)
  if (!/^[\w.+-]{1,60}$/.test(tag) || !numbers(tag)) return null;
  return { tag, version: tag.replace(/^v/i, '') };
}

/** Fetch that release's page: the whole of it, or null if what came is not a whole page or not the version the release says. */
async function fetchRelease(tag: string, version: string): Promise<string | null> {
  const res = await fetch(`${__FILES__}${encodeURIComponent(tag)}/nightpond.html`, { cache: 'no-store' });
  if (!res.ok) return null;
  const html = await res.text();
  const whole = html.length > 100_000 && /^\s*<!doctype html>/i.test(html) && /<\/html>\s*$/i.test(html);
  return whole && html.includes(`name="nightpond-version" content="${version}"`) ? html : null;
}

/**
 * Before the page begins: become the newest version there is, if there is a newer one than this.
 * Comes back (having done nothing that shows) when this page is the one to go on with.
 */
export async function updateOnLaunch(): Promise<void> {
  // (Not where no address was given: while the page is being worked on, none is.)
  if (!__RELEASES__) return;
  const mark = takeFileMark();
  // (A file of the old kind marks itself by a build number, or not at all: either way it is older than any release.)
  if (takeOldMark() || (mark && /^\d{10,}$/.test(mark))) fileVersion = '0.0.0';
  else if (mark && newer(VERSION, mark)) fileVersion = mark;
  try {
    // A copy kept at an earlier opening.
    const state = readState();
    const have = await within(kept(), 1500);
    if (have && newer(have.version, VERSION)) {
      const failing = state.tried === have.version && state.ok !== have.version;
      if (failing && state.tries >= 2) {
        // It has been started twice and never got going: it is let go, and this page goes on as it is.
        await keep(null);
      } else {
        writeState({ ...state, tried: have.version, tries: failing ? state.tries + 1 : 1 });
        return await become(have.html);
      }
    } else if (have && newer(VERSION, have.version)) {
      void keep(null); // (the file itself is newer than the kept copy, which is of no more use)
    }

    // GitHub. The question of which release is the latest is given a moment and a half; if the answer
    // is a newer version, the page waits for it (up to eight seconds: it is under a megabyte) and
    // becomes it. On a line too slow for that, the page starts as it is, and the new one is kept for
    // next time.
    const there = await within(latestThere(), 1500);
    if (!there || !newer(there.version, VERSION)) return;
    if (state.tried === there.version && state.ok !== there.version && state.tries >= 2) return; // (that version would not start here: it is not fetched again)
    if (state.missed === there.version && Date.now() - state.missedAt < 6 * 3600_000) return; // (its page was not to be had a little while ago: not at every opening)
    const fetching = fetchRelease(there.tag, there.version);
    const html = await within(
      fetching.then((got) => got ?? 'none'),
      8000,
    );
    if (html === 'none') {
      writeState({ ...state, missed: there.version, missedAt: Date.now() });
      return;
    }
    if (html) {
      await keep({ version: there.version, html });
      writeState({ ...state, tried: there.version, tries: state.tried === there.version && state.ok !== there.version ? state.tries + 1 : 1 });
      return await become(html);
    }
    void fetching
      .then((late) => {
        if (late) void keep({ version: there.version, html: late });
      })
      .catch(() => {});
  } catch {
    // Out of reach, or the browser keeps no store: the page goes on as it is.
  }
}

/** The page has started properly: remembered, so that a kept copy which does not start is found out and let go. */
export function updateStarted(): void {
  const state = readState();
  if (state.ok !== VERSION && (state.tried === VERSION || state.ok)) writeState({ ...state, ok: VERSION });
}

/**
 * If the file this page was opened from is older than the newest version there is: that version, whole.
 * (So it is when this page is a newer copy the file became; and when a newer version came too slowly
 * to become at once, and is being kept for next time.)
 */
async function staleFile(): Promise<{ version: string; html: string } | null> {
  if (!__RELEASES__) return null;
  const file = fileVersion ?? VERSION;
  const have = await kept();
  if (have && newer(have.version, file)) return have;
  // (This page is the newer copy, but the browser kept none of it: it is fetched again.)
  if (fileVersion !== null) {
    const html = await fetchRelease(`v${VERSION}`, VERSION).catch(() => null);
    if (html) return { version: VERSION, html };
  }
  return null;
}

/**
 * Hand the new file over. Where the browser lets a page save a file wherever it is told, it asks where:
 * choose the old file, and the new one takes its place there and then. Elsewhere it is an ordinary
 * download. Says which it was; 'no' if the asking was waved away.
 */
async function handOver(html: string): Promise<'saved' | 'downloaded' | 'no'> {
  const blob = new Blob([html], { type: 'text/html' });
  const ask = (window as unknown as { showSaveFilePicker?: (o: object) => Promise<{ createWritable(): Promise<{ write(b: Blob): Promise<void>; close(): Promise<void> }> }> }).showSaveFilePicker;
  if (typeof ask === 'function') {
    try {
      const where = await ask.call(window, { suggestedName: 'nightpond.html', types: [{ description: 'nightpond', accept: { 'text/html': ['.html'] } }] });
      const out = await where.createWritable();
      await out.write(blob);
      await out.close();
      return 'saved';
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'no';
      // (Not allowed here: an ordinary download, then.)
    }
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'nightpond.html';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
  return 'downloaded';
}

/**
 * Once the page is going: if the file it was opened from is out of date, say so under the time, with a
 * way to have the new one. It is said once at each opening, and "not now" puts it away till the next.
 */
export function offerNewFile(): void {
  const box = document.getElementById('stale');
  const say = document.getElementById('stale-say');
  const get = document.getElementById('stale-get') as HTMLButtonElement | null;
  const later = document.getElementById('stale-later') as HTMLButtonElement | null;
  if (!box || !say || !get || !later) return;
  let copy: { version: string; html: string } | null = null;
  let done = false;
  const look = async () => {
    if (copy || done) return;
    copy = await staleFile().catch(() => null);
    if (copy && !done) box.hidden = false;
  };
  // (Looked for a little after the page starts; and once more later, for a build that came slowly.)
  window.setTimeout(look, 2500);
  window.setTimeout(look, 25_000);
  const putAway = (after: number) => {
    done = true;
    window.setTimeout(() => (box.hidden = true), after);
  };
  later.addEventListener('click', () => putAway(0));
  get.addEventListener('click', async () => {
    if (!copy) return;
    const how = await handOver(copy.html);
    if (how === 'no') return;
    get.hidden = true;
    later.hidden = true;
    say.textContent = how === 'saved' ? 'saved · if that was over the old file, it is up to date' : 'it is in your downloads · put it in place of the old file';
    putAway(9000);
  });
}
