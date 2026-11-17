// The gramophone in the meadow. It plays along with whatever Spotify is
// playing: notes rise from its horn while there is music, the name of the
// tune hangs above it when you point at it or when the tune changes, and a
// click pauses or plays. (Shift-click skips to the next tune; alt-click lets
// you change or forget the Spotify sign-in.)
//
// The first click asks, once, for the client id of your own Spotify app, as a
// few words in the sky; then it sees you through signing in.

import { createSpotify, NOWHERE, pageAddress, type Hearing, type Track } from './spotify';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function createGramophone() {
  const spotify = createSpotify();
  const label = $('tune');
  const form = $<HTMLFormElement>('music-form');
  const ask = $('music-ask');
  const input = $<HTMLInputElement>('music-id');
  const link = $<HTMLAnchorElement>('music-link');
  const go = $<HTMLButtonElement>('music-go');
  const forget = $<HTMLButtonElement>('music-forget');
  const note = $('music-note');

  let amount = 0; // how much music is in the air, eased
  let whisperUntil = 0; // the tune's name shows by itself until then
  let lastTune = '';
  /** Which question the form is asking: for the client id, or for the address Spotify sent the other tab to. */
  let step: 'id' | 'paste' = 'id';

  const words = (h: Hearing): string => {
    switch (h.kind) {
      case 'unset':
        return 'click, and it will play along with spotify';
      case 'away':
        return 'click to sign in to spotify';
      case 'quiet':
        return 'nothing is playing';
      case 'track':
        return `${h.track.title}${h.track.by ? ` · ${h.track.by}` : ''}${h.track.playing ? '' : ' · paused'}`.toLowerCase();
      case 'trouble':
        return h.why;
    }
  };

  spotify.onChange((h) => {
    // A new tune announces itself for a few seconds; so does anything going wrong.
    // (And so does being signed out, which can happen by itself when a sign-in runs out: SPOTIFY-REST.)
    const tune = h.kind === 'track' ? `${h.track.title}|${h.track.by}` : h.kind === 'trouble' ? h.why : h.kind === 'away' ? 'away' : '';
    if (tune && tune !== lastTune) whisperUntil = performance.now() + 7000;
    lastTune = tune;
  });

  /** First question: the client id. */
  const askForId = () => {
    step = 'id';
    ask.textContent = 'to play along with spotify it needs the client id of your own spotify app';
    input.value = '';
    input.placeholder = 'spotify client id';
    link.hidden = true;
    go.textContent = 'connect';
    forget.hidden = !spotify.hasClientId();
    note.textContent = `in that app's settings, add this as a redirect address: ${pageAddress() ?? NOWHERE}`;
    form.hidden = false;
    window.setTimeout(() => input.focus(), 60); // (once the form has begun to ease into sight)
  };

  /**
   * Then signing in. A page with a web address of its own is sent to Spotify
   * and back. A page opened as a file cannot be sent back to, so Spotify opens
   * in another tab and you bring back the address it ends at.
   */
  const signIn = async () => {
    const address = await spotify.signInAddress();
    if (!address) return askForId();
    if (pageAddress()) {
      window.location.assign(address);
      return;
    }
    step = 'paste';
    ask.textContent = 'now let it in: open spotify, and agree';
    link.href = address;
    link.hidden = false;
    input.value = '';
    input.placeholder = 'paste the address here';
    go.textContent = 'finish';
    forget.hidden = false;
    note.textContent = 'the new tab will then fail to load a page at 127.0.0.1. that is meant to happen: copy its whole address, and paste it here';
    form.hidden = false;
    window.setTimeout(() => input.focus(), 60); // (once the form has begun to ease into sight)
  };

  const closeForm = () => {
    form.hidden = true;
    input.value = '';
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const typed = input.value.trim();
    if (step === 'id') {
      if (!/^[0-9a-zA-Z]{16,64}$/.test(typed)) {
        note.textContent = 'that does not look like a client id (it is a row of about 32 letters and digits)';
        return;
      }
      spotify.setClientId(typed);
      await signIn();
      return;
    }
    if (!typed) return;
    note.textContent = 'asking spotify…';
    const went = await spotify.finish(typed);
    if (went === 'ok') {
      closeForm();
      whisperUntil = performance.now() + 6000;
    } else {
      note.textContent = went;
    }
  });
  $('music-cancel').addEventListener('click', closeForm);
  forget.addEventListener('click', () => {
    spotify.forget();
    closeForm();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !form.hidden) closeForm();
  });

  void spotify.begin();

  return {
    click(shift: boolean, alt: boolean): void {
      const h = spotify.hearing();
      whisperUntil = performance.now() + 4000;
      if (!form.hidden) return closeForm();
      if (alt || h.kind === 'unset') return askForId();
      if (h.kind === 'away') return void signIn();
      if (h.kind === 'trouble') return void spotify.listen();
      if (shift && h.kind === 'track') return void spotify.next();
      void spotify.toggle();
    },

    /**
     * Called every frame. `pointed` is whether the pointer is on the
     * gramophone; `at` is where the air above it falls on the page.
     * Returns how much music is in the air, 0 to 1.
     */
    update(dt: number, pointed: boolean, at: [number, number] | null): number {
      const h = spotify.hearing();
      const playing = h.kind === 'track' && h.track.playing;
      amount += ((playing ? 1 : 0) - amount) * (1 - Math.exp(-dt * 1.6));
      if (amount < 0.003) amount = 0;

      const show = !!at && form.hidden && (pointed || performance.now() < whisperUntil);
      const text = show ? words(h) : label.textContent ?? '';
      if (label.textContent !== text) label.textContent = text;
      label.classList.toggle('shown', show);
      if (at) {
        label.style.left = `${Math.round(at[0])}px`;
        label.style.top = `${Math.round(at[1])}px`;
      }
      return amount;
    },

    /** For trying it without Spotify (from the console): nightpond.music.pretend({ title, by, playing }). */
    pretend: (track: Track | null) => spotify.pretend(track),
    hearing: () => spotify.hearing(),
  };
}
