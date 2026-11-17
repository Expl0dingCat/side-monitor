// A keepsake. Everything you make here (your notes, the figures you have
// joined in the stars, your place, the fire's count of work done, whether the
// sound is on) is kept by this browser, not in the page's own file. So that it
// can be carried to another browser or another computer, or simply kept safe,
// it can be saved out as one small file and loaded back in.
//
// E saves a keepsake. I asks for one to load; so does dropping the file
// anywhere on the page. Loading replaces what is kept here, so it asks first.
//
// Of Spotify, only the client id of your app is kept (it is not a secret, and
// saves finding it again). The sign-in itself is deliberately left out: it is
// a key to your account, and does not belong in a file that may be copied
// about. On another machine you sign in again with one click.

const KEPT = ['nightpond.notes', 'nightpond.sky', 'nightpond.place', 'nightpond.focus', 'nightpond.sound', 'nightpond.lamb', 'nightpond.skips', 'nightpond.bottles', 'nightpond.reminders', 'nightpond.lanterns', 'nightpond.lanterns.since', 'nightpond.done', 'nightpond.almanac', 'nightpond.cairn', 'nightpond.room', 'nightpond.parlour', 'nightpond.levels', 'nightpond.kite', 'nightpond.catch'];
const SPOTIFY = 'nightpond.spotify';
const CLIENT_ID = 'spotify-client-id'; // what the id is filed under in a keepsake

/** The client id of the Spotify app last given to the gramophone, if any. */
function spotifyClientId(): string | null {
  try {
    const id = JSON.parse(localStorage.getItem(SPOTIFY) ?? 'null')?.clientId;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}

interface Keepsake {
  app: 'nightpond';
  version: 1;
  saved: string;
  state: Record<string, string>;
}

/**
 * `say` shows a few passing words. `notes` lets the writing on the stone be
 * read and replaced as it stands, including anything typed in the last moment.
 */
export function createKeepsake(say: (words: string) => void, notes: { save(): void; put(text: string): void }) {
  function save(): void {
    notes.save();
    const state: Record<string, string> = {};
    try {
      for (const key of KEPT) {
        const value = localStorage.getItem(key);
        if (value !== null) state[key] = value;
      }
      const id = spotifyClientId();
      if (id) state[CLIENT_ID] = id;
    } catch {
      say('this browser keeps nothing, so there is nothing to save');
      return;
    }
    const keepsake: Keepsake = { app: 'nightpond', version: 1, saved: new Date().toISOString(), state };
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(keepsake, null, 2)], { type: 'application/json' }));
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; // today, by your clock
    link.download = `nightpond-keepsake-${day}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    say('a keepsake is saved');
  }

  async function load(file: File): Promise<void> {
    let found: Partial<Keepsake> | null = null;
    try {
      if (file.size > 5_000_000) throw new Error('too large');
      found = JSON.parse(await file.text());
    } catch {
      say('that file could not be read');
      return;
    }
    const state = found?.state;
    if (!found || found.app !== 'nightpond' || !state || typeof state !== 'object') {
      say('that is not a nightpond keepsake');
      return;
    }
    if (![...KEPT, CLIENT_ID].some((key) => typeof state[key] === 'string')) {
      say('that keepsake is empty');
      return;
    }
    const when = found.saved ? new Date(found.saved).toLocaleString() : 'an unknown date';
    if (!window.confirm(`Replace what is kept here (notes, stars, place, fire, the lamb) with the keepsake saved on ${when}?`)) return;
    try {
      for (const key of KEPT) {
        if (typeof state[key] === 'string') localStorage.setItem(key, state[key]);
        else localStorage.removeItem(key);
      }
      // The Spotify client id: taken up unless this browser is already signed in with that very app.
      const id = state[CLIENT_ID];
      if (typeof id === 'string' && /^[0-9a-zA-Z]{16,64}$/.test(id) && id !== spotifyClientId()) {
        localStorage.setItem(SPOTIFY, JSON.stringify({ clientId: id }));
      }
    } catch {
      say('this browser would not keep it');
      return;
    }
    // The stone holds its writing in hand; give it the new text, or it would write the old back.
    notes.put(typeof state['nightpond.notes'] === 'string' ? state['nightpond.notes'] : '');
    // Start again from what was loaded.
    window.location.reload();
  }

  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = '.json,application/json';
  picker.hidden = true;
  picker.addEventListener('change', () => {
    const file = picker.files?.[0];
    picker.value = '';
    if (file) void load(file);
  });
  document.body.append(picker);

  window.addEventListener('keydown', (e) => {
    const at = e.target;
    const typing = at instanceof HTMLInputElement || at instanceof HTMLTextAreaElement || (at instanceof HTMLElement && at.isContentEditable);
    if (typing || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'e') save();
    if (key === 'i') picker.click();
  });

  // A keepsake dropped anywhere on the page is loaded.
  const carriesFile = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  window.addEventListener('dragover', (e) => {
    if (carriesFile(e)) e.preventDefault();
  });
  window.addEventListener('drop', (e) => {
    if (!carriesFile(e)) return;
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file) void load(file);
  });

  return { save, load };
}
