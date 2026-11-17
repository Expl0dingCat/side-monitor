// Keeping time by the fire.
//
// There is no timer on screen. You light the campfire to begin a spell of
// work. Five logs wait beside it and are fed in one at a time, so the pile
// tells you how long is left: each log is five minutes. When the last one has
// burnt, a bell rings, a stone is added to the cairn, and the embers glow
// while you rest. When they go dark the pile is restocked, ready to be lit again.

import { makeBell } from './bell';

const KEY = 'nightpond.focus';
const WORK = 25 * 60_000;
const REST = 5 * 60_000;
const LONG_REST = 15 * 60_000; // after every fourth spell
const LOGS = 5;

type Phase = 'cold' | 'burning' | 'embers';

interface Saved {
  phase: Phase;
  /** When the current phase ends, and how long it lasts in all. */
  endsAt: number;
  lasts: number;
  /** Spells finished today, and which day that is. */
  done: number;
  day: string;
}

export interface Fire {
  phase: Phase;
  /** How high the flames stand, 0..1. */
  heat: number;
  /** How brightly the embers glow, 0..1. */
  embers: number;
  /** Logs still waiting in the pile. */
  logs: number;
  /** Stones on the cairn: one for each spell finished today. */
  stones: number;
  minutesLeft: number;
}

const today = () => new Date().toDateString();

function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (s && typeof s.endsAt === 'number' && ['cold', 'burning', 'embers'].includes(s.phase)) return s;
  } catch {
    // Fall through to a cold fire.
  }
  return { phase: 'cold', endsAt: 0, lasts: WORK, done: 0, day: today() };
}

export function createFocus() {
  let s = load();
  let audio: AudioContext | null = null;

  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      // Without storage the fire still works; it just will not survive a reload.
    }
  };

  /** The bells already cast, by pitch (see bell.ts for how one is made). */
  const cast = new Map<number, AudioBuffer>();

  function bell(strokes: number, pitch: number): void {
    // Sound is only allowed once you have clicked something, so this may be silent after a reload.
    if (!audio || audio.state !== 'running') return;
    let stroke = cast.get(pitch);
    if (!stroke) {
      const waves = makeBell(audio.sampleRate, pitch);
      stroke = audio.createBuffer(2, waves[0].length, audio.sampleRate);
      waves.forEach((w, c) => stroke!.copyToChannel(w as Float32Array<ArrayBuffer>, c));
      cast.set(pitch, stroke);
    }
    // Slow strokes, each a little softer than the last, ringing into one another.
    for (let i = 0; i < strokes; i++) {
      const src = audio.createBufferSource();
      src.buffer = stroke;
      const loud = audio.createGain();
      loud.gain.value = 0.6 * 0.86 ** i;
      src.connect(loud).connect(audio.destination);
      src.start(audio.currentTime + 0.05 + i * 2.3);
    }
  }

  return {
    /** Light the fire, or put it out. A fire put out early does not count. */
    toggle(now = Date.now()): void {
      // A click is the moment the browser will let sound start.
      try {
        audio ??= new AudioContext();
        void audio.resume();
      } catch {
        audio = null;
      }
      if (s.phase === 'burning') s = { ...s, phase: 'cold', endsAt: 0 };
      else s = { ...s, phase: 'burning', endsAt: now + WORK, lasts: WORK };
      save();
    },

    /** Move time on, and say how the fire should look. */
    update(now = Date.now()): Fire {
      if (s.day !== today()) {
        // A new day: the cairn starts again.
        s.day = today();
        s.done = 0;
        save();
      }
      if (s.phase === 'burning' && now >= s.endsAt) {
        s.done++;
        s.lasts = s.done % 4 === 0 ? LONG_REST : REST;
        s.endsAt += s.lasts;
        s.phase = 'embers';
        bell(3, 196); // the village bell, three slow strokes
        save();
      }
      if (s.phase === 'embers' && now >= s.endsAt) {
        s.phase = 'cold';
        bell(1, 392); // one small stroke: time to begin again
        save();
      }

      const left = Math.max(0, s.endsAt - now);
      const stones = s.done;
      if (s.phase === 'burning') {
        return {
          phase: 'burning',
          // A full blaze until the last minute and a half, then it sinks.
          heat: left > 90_000 ? 1 : 0.35 + (0.65 * left) / 90_000,
          embers: 1,
          logs: Math.min(LOGS, Math.floor(left / (WORK / LOGS))),
          stones,
          minutesLeft: Math.ceil(left / 60_000),
        };
      }
      if (s.phase === 'embers') {
        return { phase: 'embers', heat: 0, embers: 0.2 + (0.8 * left) / s.lasts, logs: 0, stones, minutesLeft: Math.ceil(left / 60_000) };
      }
      return { phase: 'cold', heat: 0, embers: 0, logs: LOGS, stones, minutesLeft: 0 };
    },

    /** Jump time forward (for testing). */
    skip(ms: number): void {
      s.endsAt -= ms;
    },
  };
}
