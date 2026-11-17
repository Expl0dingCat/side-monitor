// Spotify, with nothing but this one file. The page signs in with Spotify's
// "authorization code with PKCE" flow, which needs no secret and no server:
// only the client id of an app registered in Spotify's developer dashboard.
// What comes back (an access token, and a refresh token to renew it) is kept
// in this browser and sent nowhere but to Spotify.
//
// Spotify finishes a sign-in by sending the browser to a "redirect address"
// carrying a code. It will only send it to an https page or to 127.0.0.1,
// never to a file. So there are two ways through:
//  - if this page has such an address, Spotify sends you straight back to it;
//  - if it was opened as a file, Spotify is told to send you to a 127.0.0.1
//    address where nothing is listening. That tab fails to load, but its
//    address bar holds the code: you copy the address and paste it here.

const STORE = 'nightpond.spotify';
const PENDING = 'nightpond.spotify.pending';
// SPOTIFY-REST: what was last heard and when, shared by every window this page is open in, so that
// however many there are only one of them asks Spotify, and all of them rest when it says to.
const HEARD = 'nightpond.spotify.heard';
/**
 * How long is left between one asking and the next (milliseconds). Spotify allows an app only so many
 * askings (counted over half a minute, and over the day), and this page is open all day: asked every
 * five seconds from every window, it was in time told to stop, and then heard nothing at all.
 */
const EVERY = { playing: 10_000, quiet: 30_000, trouble: 60_000 };
const SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';
const ACCOUNTS = 'https://accounts.spotify.com';
/** Where Spotify is told to send you when this page is a file: nothing needs to be there. */
export const NOWHERE = 'http://127.0.0.1:8888/callback';
const API = 'https://api.spotify.com/v1';

export interface Track {
  title: string;
  by: string;
  playing: boolean;
}

/** What the gramophone knows about the music just now. */
export type Hearing =
  | { kind: 'unset' } // no client id has been given yet
  | { kind: 'away' } // there is a client id, but nobody is signed in
  | { kind: 'quiet' } // signed in, and nothing is playing
  | { kind: 'track'; track: Track }
  | { kind: 'trouble'; why: string };

interface Saved {
  clientId: string;
  access?: string;
  refresh?: string;
  /** When the access token runs out, as a time in milliseconds. */
  expires?: number;
}

/**
 * This page's address as Spotify must be told it, or null if Spotify would
 * refuse it: it accepts https, and plain http only for 127.0.0.1 (not for
 * "localhost", and never a file opened straight from disk).
 */
export function pageAddress(): string | null {
  const { protocol, hostname, origin, pathname } = window.location;
  const loopback = hostname === '127.0.0.1' || hostname === '[::1]';
  if (protocol === 'https:' || (protocol === 'http:' && loopback)) return origin + pathname;
  return null;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function random(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const b of bytes) out += LETTERS[b % LETTERS.length];
  return out;
}

/** SHA-256, for a browser that withholds its own from a page opened as a file. */
function sha256(data: Uint8Array): Uint8Array {
  // The constants are the fractional parts of the square and cube roots of the first primes.
  const k: number[] = [];
  const h: number[] = [];
  for (let n = 2; k.length < 64; n++) {
    let prime = true;
    for (let d = 2; d * d <= n; d++) if (n % d === 0) prime = false;
    if (!prime) continue;
    if (h.length < 8) h.push(((Math.sqrt(n) % 1) * 2 ** 32) >>> 0);
    k.push(((Math.cbrt(n) % 1) * 2 ** 32) >>> 0);
  }
  const padded = new Uint8Array((((data.length + 8) >> 6) + 1) << 6);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, data.length * 8);
  const w = new Uint32Array(64);
  const turn = (x: number, by: number) => (x >>> by) | (x << (32 - by));
  for (let at = 0; at < padded.length; at += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(at + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = turn(w[i - 15], 7) ^ turn(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const b = turn(w[i - 2], 17) ^ turn(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + a + w[i - 7] + b) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (turn(e, 6) ^ turn(e, 11) ^ turn(e, 25)) + ((e & f) ^ (~e & g)) + k[i] + w[i]) >>> 0;
      const t2 = ((turn(a, 2) ^ turn(a, 13) ^ turn(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((v, i) => {
      h[i] = (h[i] + v) >>> 0;
    });
  }
  const out = new Uint8Array(32);
  h.forEach((v, i) => new DataView(out.buffer).setUint32(i * 4, v));
  return out;
}

/** For checking the spare SHA-256 against the browser's own. */
export const spareSha256 = sha256;

async function challengeFor(verifier: string): Promise<string> {
  const bytes = new TextEncoder().encode(verifier);
  const hash = crypto.subtle ? new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)) : sha256(bytes);
  let text = '';
  for (const b of hash) text += String.fromCharCode(b);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function createSpotify() {
  let saved: Saved | null = null;
  try {
    const raw = localStorage.getItem(STORE);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed.clientId === 'string') saved = parsed;
  } catch {
    // Storage can be unavailable in private windows.
  }

  let hearing: Hearing = saved ? (saved.refresh ? { kind: 'quiet' } : { kind: 'away' }) : { kind: 'unset' };
  let pretending = false;
  let timer = 0;
  /** A sign-in that has been started and not yet finished. */
  let pending: { verifier: string; state: string; redirect: string } | null = null;
  const heard: ((h: Hearing) => void)[] = [];

  const keep = () => {
    try {
      if (saved) localStorage.setItem(STORE, JSON.stringify(saved));
      else localStorage.removeItem(STORE);
    } catch {
      // It then lasts until the page is closed.
    }
  };

  const set = (next: Hearing) => {
    hearing = next;
    for (const tell of heard) tell(next);
  };

  /** Why Spotify last refused to hand over a token, in its own word ("invalid_client", "invalid_grant"). */
  let refusal = '';

  // SPOTIFY-REST.
  /** Told to wait: nothing is asked before this time; and how many times running it has been told. */
  let rest = 0;
  let restStep = 0;
  /** When Spotify was last asked from this window; when the tune playing will end; when the fuller question was last put. */
  let askedAt = 0;
  let endsAt = 0;
  let wholeAt = 0;

  /**
   * Another window of this page may have signed in, or renewed the sign-in, since this one last looked:
   * take up what it kept. (Each renewal can make the one before it worthless, so a window going by what
   * it remembered would be refused, and would then throw the good sign-in away for every window.)
   */
  const reread = (): void => {
    try {
      const kept = JSON.parse(localStorage.getItem(STORE) ?? 'null');
      if (!kept || typeof kept.clientId !== 'string') return;
      if (!saved || kept.clientId !== saved.clientId || (kept.refresh && kept.refresh !== saved.refresh) || (kept.refresh && (kept.expires ?? 0) > (saved.expires ?? 0))) saved = kept;
    } catch {
      // Storage can be unavailable in private windows.
    }
  };

  /** What any window last heard, if it is still fresh enough to go by. */
  const lately = (within: number): { hearing: Hearing; ends: number } | null => {
    try {
      const kept = JSON.parse(localStorage.getItem(HEARD) ?? 'null');
      if (kept && typeof kept.rest === 'number' && kept.rest > rest) rest = kept.rest;
      if (!kept || typeof kept.at !== 'number' || !kept.hearing || Date.now() - kept.at > within || kept.id !== saved?.clientId) return null;
      return { hearing: kept.hearing as Hearing, ends: Number(kept.ends ?? 0) };
    } catch {
      return null;
    }
  };
  const share = (): void => {
    try {
      localStorage.setItem(HEARD, JSON.stringify({ at: Date.now(), id: saved?.clientId, hearing, ends: endsAt, rest }));
    } catch {
      // Then each window asks for itself.
    }
  };
  /** "in a minute", "in 12 minutes", "in about 3 hours". */
  const inWords = (ms: number): string => {
    const minutes = Math.max(1, Math.round(ms / 60_000));
    if (minutes < 2) return 'in a minute';
    if (minutes < 90) return `in ${minutes} minutes`;
    return `in about ${Math.round(minutes / 60)} hours`;
  };

  /** Swap a sign-in code, or a refresh token, for an access token. */
  async function tokens(body: Record<string, string>): Promise<boolean> {
    if (!saved) return false;
    const res = await fetch(`${ACCOUNTS}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...body, client_id: saved.clientId }),
    });
    if (!res.ok) {
      refusal = '';
      try {
        refusal = String((await res.json()).error ?? '');
      } catch {
        // No reason given.
      }
      // A refresh token that is no longer good means signing in again: unless another window has renewed
      // the sign-in meanwhile, in which case what it kept is the good one (see reread).
      if (res.status === 400 || res.status === 401) {
        const tried = body.refresh_token;
        reread();
        if (tried && saved.refresh && saved.refresh !== tried) {
          if (saved.access && (saved.expires ?? 0) - Date.now() > 60_000) return true;
          return tokens({ ...body, refresh_token: saved.refresh });
        }
        saved = { clientId: saved.clientId };
        keep();
      }
      return false;
    }
    const got = await res.json();
    saved.access = String(got.access_token);
    saved.expires = Date.now() + Number(got.expires_in ?? 3600) * 1000;
    if (got.refresh_token) saved.refresh = String(got.refresh_token); // otherwise the old one carries on
    keep();
    return true;
  }

  async function access(): Promise<string | null> {
    reread();
    if (!saved?.refresh) return null;
    if (saved.access && (saved.expires ?? 0) - Date.now() > 60_000) return saved.access;
    return (await tokens({ grant_type: 'refresh_token', refresh_token: saved.refresh })) ? (saved.access ?? null) : null;
  }

  async function ask(method: string, path: string): Promise<Response | null> {
    let token = await access();
    if (!token) return null;
    let res = await fetch(API + path, { method, headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401 && saved?.refresh) {
      // The token went stale early: renew it once and ask again.
      saved.expires = 0;
      token = await access();
      if (!token) return null;
      res = await fetch(API + path, { method, headers: { Authorization: `Bearer ${token}` } });
    }
    return res;
  }

  /** What Spotify's answer says is playing, if anything. */
  const heardIn = (now: any): Hearing | null => {
    const item = now?.item;
    if (!item) {
      if (now?.currently_playing_type === 'ad') return { kind: 'track', track: { title: 'an advert', by: '', playing: !!now.is_playing } };
      if (now?.device?.is_private_session) return { kind: 'trouble', why: 'spotify is in a private session · it cannot be heard from here' };
      return null;
    }
    const by = Array.isArray(item.artists) ? item.artists.map((a: { name?: string }) => a.name ?? '').filter(Boolean).join(', ') : (item.show?.name ?? '');
    endsAt = now.is_playing && item.duration_ms > 0 && now.progress_ms >= 0 ? Date.now() + (item.duration_ms - now.progress_ms) : 0;
    return { kind: 'track', track: { title: String(item.name ?? ''), by: String(by), playing: !!now.is_playing } };
  };

  /** Ask Spotify what is playing. `pressed` is when you asked for it yourself, by a click: then it is asked whatever any window heard lately. */
  async function listen(pressed = false): Promise<void> {
    if (pretending) return;
    reread();
    if (!saved) return set({ kind: 'unset' });
    if (!saved.refresh) return set({ kind: 'away' });
    // SPOTIFY-REST. If another window has asked just lately, what it heard is what there is to hear;
    // and while Spotify has said to wait, nothing is asked at all (a click may try once in ten seconds).
    if (!pressed) {
      const other = lately(pause() - 1500);
      if (other) {
        endsAt = other.ends;
        if (JSON.stringify(other.hearing) !== JSON.stringify(hearing)) set(other.hearing);
        return;
      }
      if (Date.now() < rest) return;
    } else if (Date.now() < rest && Date.now() - askedAt < 10_000) return;
    askedAt = Date.now();
    try {
      const res = await ask('GET', '/me/player/currently-playing?additional_types=episode');
      if (!res) return set({ kind: 'away' });
      if (res.status === 429) {
        // Asked too often. Spotify says how long to leave it (when it does not: a minute, then two, then
        // four, up to an hour); nothing more is asked until then, from any window.
        let reason = '';
        try {
          reason = String((await res.json())?.error?.reason ?? '');
        } catch {
          // No reason given.
        }
        const told = Number(res.headers.get('Retry-After'));
        const seconds = told > 0 ? told : Math.min(3600, 60 * 2 ** restStep);
        restStep++;
        rest = Date.now() + seconds * 1000;
        const when = inWords(seconds * 1000);
        // (A short wait changes nothing you can see: what was playing is taken to be playing still.)
        if (seconds > 90 || reason === 'QUOTA_EXCEEDED' || hearing.kind !== 'track') {
          set({ kind: 'trouble', why: reason === 'QUOTA_EXCEEDED' ? `spotify says this app has used up its allowance · it will listen again ${when}` : `spotify asked it to wait · it will listen again ${when}` });
        }
        return share();
      }
      restStep = 0;
      if (res.status === 403) return set({ kind: 'trouble', why: 'spotify will not let this app listen · its owner needs premium, and your account must be added to it' });
      if (!res.ok) return set({ kind: 'trouble', why: `spotify answered ${res.status}` });
      const text = res.status === 204 ? '' : await res.text();
      let found = heardIn(text ? JSON.parse(text) : null);
      // Nothing, by that answer. It can come back empty while something is playing (on some players, and
      // between tunes), so now and then the fuller question is put as well: what the player itself is doing.
      if (!found && Date.now() - wholeAt > 55_000) {
        wholeAt = Date.now();
        const whole = await ask('GET', '/me/player?additional_types=episode');
        if (whole && whole.status === 200) found = heardIn(await whole.json());
      }
      if (!found) endsAt = 0;
      set(found ?? { kind: 'quiet' });
      share();
    } catch {
      set({ kind: 'trouble', why: 'spotify is out of reach just now' });
    }
  }

  /** How long to leave it before asking again. */
  function pause(): number {
    if (hearing.kind === 'trouble') return EVERY.trouble;
    if (hearing.kind === 'track' && hearing.track.playing) {
      // (And as soon as the tune that is playing ends, to hear what follows it.)
      const left = endsAt - Date.now() + 1200;
      return endsAt > 0 && left > 1500 && left < EVERY.playing ? left : EVERY.playing;
    }
    return EVERY.quiet;
  }

  function wait(ms: number, pressed = false): void {
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      // Nothing is asked while the page is hidden.
      if (document.visibilityState === 'visible') await listen(pressed);
      wait(Math.max(pause(), rest - Date.now() + 500));
    }, ms);
  }

  // Coming back to the page after it has been hidden, hear at once what is playing now.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && saved?.refresh && Date.now() - askedAt > 4000) wait(300);
  });
  // What another window hears, or does about the sign-in, is known here at once.
  window.addEventListener('storage', (e) => {
    if (e.key === HEARD && e.newValue && !pretending) {
      const other = lately(60_000);
      if (other && saved?.refresh && JSON.stringify(other.hearing) !== JSON.stringify(hearing)) {
        endsAt = other.ends;
        set(other.hearing);
      }
    } else if (e.key === STORE) {
      if (e.newValue === null) {
        if (saved) {
          window.clearTimeout(timer);
          saved = null;
          set({ kind: 'unset' });
        }
        return;
      }
      const signedIn = !!saved?.refresh;
      reread();
      if (!signedIn && saved?.refresh) wait(0);
    }
  });

  /** Swap the code from a sign-in for tokens. Returns 'ok', or what went wrong. */
  async function redeem(code: string, state: string): Promise<string> {
    if (!pending) {
      try {
        pending = JSON.parse(sessionStorage.getItem(PENDING) ?? 'null');
      } catch {
        pending = null;
      }
    }
    const waiting = pending;
    if (!saved || !waiting) return 'that sign-in was not started from here';
    if (waiting.state !== state) return 'that address is from a different sign-in';
    pending = null;
    try {
      sessionStorage.removeItem(PENDING);
    } catch {
      // Nothing to clear.
    }
    try {
      const ok = await tokens({ grant_type: 'authorization_code', code, redirect_uri: waiting.redirect, code_verifier: waiting.verifier });
      if (ok) return 'ok';
      if (refusal === 'invalid_client') return 'spotify does not know that client id · alt-click the gramophone to give it another';
      return 'spotify did not accept that · the code may have been used already, or the redirect address in your app does not match';
    } catch {
      return 'spotify is out of reach just now';
    }
  }

  /** Tell Spotify to do something to what is playing. */
  async function tell(method: string, path: string): Promise<void> {
    if (pretending) return;
    try {
      const res = await ask(method, path);
      if (!res) return set({ kind: 'away' });
      if (res.status === 404) return set({ kind: 'trouble', why: 'start something in spotify, and it will play along' });
      if (res.status === 403) return set({ kind: 'trouble', why: 'spotify would not do that from here (it needs premium)' });
      wait(700, true); // then hear what came of it
    } catch {
      set({ kind: 'trouble', why: 'spotify is out of reach just now' });
    }
  }

  return {
    hearing: () => hearing,
    onChange(tell: (h: Hearing) => void): void {
      heard.push(tell);
    },
    hasClientId: () => !!saved,

    /** Coming back from Spotify's sign-in page, finish signing in; then start listening. */
    async begin(): Promise<void> {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');
      if ((code || params.get('error')) && state) {
        // Take the code out of the address bar whatever happens.
        window.history.replaceState(null, '', window.location.pathname);
        const went = code ? await redeem(code, state) : 'spotify did not let it in';
        if (went !== 'ok') set({ kind: 'trouble', why: `${went} · click to try again` });
      }
      if (saved?.refresh) wait(0);
    },

    /**
     * Start a sign-in. Returns the address of Spotify's sign-in page: when
     * this page has a web address of its own, go there and Spotify sends you
     * back; when it is a file, open it in another tab and paste the address
     * that tab ends up at into finish().
     */
    async signInAddress(): Promise<string | null> {
      if (!saved) return null;
      const redirect = pageAddress() ?? NOWHERE;
      const verifier = random(64);
      const state = random(16);
      pending = { verifier, state, redirect };
      try {
        sessionStorage.setItem(PENDING, JSON.stringify(pending));
      } catch {
        // It is still held here for as long as the page stays open.
      }
      const query = new URLSearchParams({
        client_id: saved.clientId,
        response_type: 'code',
        redirect_uri: redirect,
        code_challenge_method: 'S256',
        code_challenge: await challengeFor(verifier),
        scope: SCOPES,
        state,
      });
      return `${ACCOUNTS}/authorize?${query}`;
    },

    /** Finish a sign-in from the address Spotify sent the other tab to. Returns 'ok', or what went wrong. */
    async finish(pasted: string): Promise<string> {
      const text = pasted.trim();
      const query = new URLSearchParams(text.includes('?') ? text.slice(text.indexOf('?') + 1) : text);
      const code = query.get('code');
      if (query.get('error')) return 'spotify says access was refused';
      if (!code) return 'that address has no code in it · copy the whole address of the tab that failed to load';
      const went = await redeem(code, query.get('state') ?? '');
      if (went === 'ok') wait(0);
      return went;
    },

    /** Remember the client id of the listener's own Spotify app. */
    setClientId(clientId: string): void {
      saved = { clientId };
      keep();
      set({ kind: 'away' });
    },

    /** Forget the client id and the sign-in. */
    forget(): void {
      window.clearTimeout(timer);
      saved = null;
      keep();
      set({ kind: 'unset' });
    },

    /** Ask now (a click on the gramophone when something has gone wrong). */
    listen: () => listen(true),

    /** Pause if it is playing, play if it is not. */
    async toggle(): Promise<void> {
      if (pretending && hearing.kind === 'track') return set({ kind: 'track', track: { ...hearing.track, playing: !hearing.track.playing } });
      const playing = hearing.kind === 'track' && hearing.track.playing;
      if (hearing.kind === 'track') set({ kind: 'track', track: { ...hearing.track, playing: !playing } }); // at once; Spotify confirms it shortly
      await tell('PUT', playing ? '/me/player/pause' : '/me/player/play');
    },

    async next(): Promise<void> {
      await tell('POST', '/me/player/next');
    },

    /** For trying the gramophone without Spotify: play a made-up track, or pass null to stop pretending. */
    pretend(track: Track | null): void {
      pretending = track !== null;
      if (track) set({ kind: 'track', track });
      else void listen();
    },
  };
}
