// Skipping stones. You go down to the beach (a click on the sea from the
// meadow takes you there), and from the water's edge a click on the water
// throws a flat stone toward that spot. It skips twice by itself; after that it
// only skips again if you click just as it touches the water, and each skip
// comes sooner and asks for a surer hand than the last. When it finally sinks,
// the count is said, and your best is remembered. It works in any weather, by
// day or night.

import type { V3 } from './scene/gl';

const KEY = 'nightpond.skips';
export const MAX_RIPPLES = 8;
const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen'];

interface Throw {
  /** Where it is coming from and going to on this leg, and when the leg began and how long it lasts. */
  from: V3;
  to: V3;
  began: number;
  lasts: number;
  /** How high this leg arcs. */
  arc: number;
  /** Which way it is travelling across the water, and how far the next skip will carry. */
  way: [number, number];
  carry: number;
  /** Times it has touched the water so far. */
  touches: number;
  /** When it touched and is waiting to see whether you click (0 while in the air). */
  skimming: number;
}

export function createSkipping(say: (words: string) => void) {
  let best = 0;
  try {
    best = Number(localStorage.getItem(KEY)) || 0;
  } catch {
    // Storage can be unavailable; then every throw is the best yet.
  }
  let stone: Throw | null = null;
  let lastTap = -1e9;
  const ripples: { x: number; z: number; at: number; size: number }[] = [];

  /** How long either side of a touch a click still counts, in milliseconds: generous at first, then finer. */
  const grace = (touches: number) => Math.max(110, 250 - 20 * touches);

  const ripple = (p: V3, now: number, size: number) => {
    ripples.push({ x: p[0], z: p[2], at: now, size });
    if (ripples.length > MAX_RIPPLES) ripples.shift();
  };

  const sink = (now: number, where: V3) => {
    ripple(where, now, 0.55);
    const skips = Math.max(0, (stone?.touches ?? 1) - 1);
    stone = null;
    const words = `${NUMBERS[skips] ?? skips} skip${skips === 1 ? '' : 's'}`;
    if (skips > best) {
      best = skips;
      try {
        localStorage.setItem(KEY, String(best));
      } catch {
        // Remembered until the page is closed.
      }
      say(`${words} · your best yet`);
    } else {
      say(best > skips ? `${words} · your best is ${NUMBERS[best] ?? best}` : words);
    }
  };

  return {
    inFlight: () => stone !== null,

    /** Throw a stone from where you stand toward a spot on the sea. */
    throwAt(target: V3, now: number, from: V3): void {
      if (stone) return;
      const dx = target[0] - from[0];
      const dz = target[2] - from[2];
      const aimed = Math.hypot(dx, dz) || 1;
      // A real throw from the water's edge: it first touches a few metres out
      // (further if you aim further, as far as an arm can send it) and skips on from there.
      const far = Math.max(7, Math.min(aimed, 24));
      stone = {
        from: [from[0] + (dx / aimed) * 0.7, from[1] - 0.45, from[2] + (dz / aimed) * 0.7],
        to: [from[0] + (dx / aimed) * far, 0, from[2] + (dz / aimed) * far],
        began: now,
        lasts: 420 + far * 19,
        arc: 0.35 + far * 0.03,
        way: [dx / aimed, dz / aimed],
        carry: 3.2 + far * 0.13,
        touches: 0,
        skimming: 0,
      };
      lastTap = -1e9;
    },

    /** A click while the stone is out there. */
    tap(now: number): void {
      lastTap = now;
    },

    /** Called every frame. Returns where the stone is (null if there is none) and the rings on the water. */
    update(now: number): { stone: V3 | null; ripples: number[] } {
      let at: V3 | null = null;
      if (stone) {
        const s = stone;
        if (s.skimming) {
          // It has touched. The first two skips are given; after that it needs your click, near enough to the moment.
          at = s.to;
          const free = s.touches <= 2;
          const clicked = Math.abs(lastTap - s.skimming) <= grace(s.touches);
          if (s.touches >= 14) {
            sink(now, s.to); // it has run out of speed
          } else if (free || clicked) {
            lastTap = -1e9;
            const next: V3 = [s.to[0] + s.way[0] * s.carry, 0, s.to[2] + s.way[1] * s.carry];
            stone = { ...s, from: s.to, to: next, began: now, lasts: Math.max(170, 520 * 0.87 ** s.touches), arc: Math.max(0.07, 0.62 * 0.72 ** s.touches), carry: s.carry * 0.82, skimming: 0 };
          } else if (now - s.skimming > grace(s.touches)) {
            sink(now, s.to);
          }
        } else {
          const t = Math.min(1, (now - s.began) / s.lasts);
          at = [s.from[0] + (s.to[0] - s.from[0]) * t, s.from[1] + (s.to[1] - s.from[1]) * t + s.arc * 4 * t * (1 - t), s.from[2] + (s.to[2] - s.from[2]) * t];
          if (t >= 1) {
            s.touches++;
            s.skimming = now;
            ripple(s.to, now, Math.max(0.16, 0.34 * 0.9 ** s.touches));
            at = s.to;
          }
        }
      }
      const out: number[] = [];
      for (let i = ripples.length - 1; i >= 0; i--) {
        const age = (now - ripples[i].at) / 2600;
        if (age >= 1) ripples.splice(i, 1);
      }
      for (const r of ripples) out.push(r.x, r.z, (now - r.at) / 2600, r.size);
      while (out.length < MAX_RIPPLES * 4) out.push(0, 0, 2, 0);
      return { stone: at, ripples: out };
    },

    best: () => best,
  };
}
