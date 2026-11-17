// Joining the stars. On a clear night, click the sky and you lie back in the
// grass with the whole of it above you. The real stars can then be joined, one
// to the next, into the figures people have always seen in them. Point at a
// star that belongs to a figure and a ring shows round it; click it, and the
// stars it joins to begin to pulse; click one of those and a line is drawn.
// Finish a figure and its name appears beside it, a shooting star goes over,
// and the figure stays in your sky from then on, turning with the stars: you
// will see it over the sea when you are back on your feet.
//
// There is nothing to open or start: it is simply something the sky lets you do.

import type { V3 } from './scene/gl';
import { FIGURES, type Figure } from './sky/figures';
import type { Heavens } from './sky/stars';

const KEY = 'nightpond.sky';
export const MAX_JOINS = 24;
export const MAX_RINGS = 8;
/** How near a star the pointer must come, in CSS pixels. */
const REACH = 34;
/** A star must stand this far above the horizon to be joined (as the sine of its height). */
const UP = 0.035;

interface View {
  skyToPage(d: V3): [number, number] | null;
  isSky(clientX: number, clientY: number): boolean;
}

/** One line of a figure, as seen from one of its two stars. */
interface Link {
  key: string;
  other: number;
  figure: Figure;
}

export interface SkyMarks {
  /** Lines: where each starts (x, y, z) and how much of it is drawn; where it ends and how brightly it shows. */
  joinA: number[];
  joinB: number[];
  joins: number;
  /** Rings round stars: direction (x, y, z) and strength (above 1.5, a double ring). */
  rings: number[];
  ringCount: number;
  /** Whether the pointer is on a star that can be clicked. */
  pointing: boolean;
  /** The list of stars to draw, with those that can be joined marked (null to draw the plain list). */
  stars: number[] | null;
}

export function createStarPlay(view: View, onFinished: () => void) {
  /** Every line drawn so far: when it was drawn (for the line growing along its length), and from which star. */
  const drawn = new Map<string, { at: number; from: number }>();
  const links = new Map<number, Link[]>();
  FIGURES.forEach((figure) => {
    figure.lines.forEach(([a, b], i) => {
      const key = `${figure.id}:${i}`;
      if (!links.has(a)) links.set(a, []);
      if (!links.has(b)) links.set(b, []);
      links.get(a)!.push({ key, other: b, figure });
      links.get(b)!.push({ key, other: a, figure });
    });
  });
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (Array.isArray(kept)) {
      for (const key of kept) {
        const [id, n] = String(key).split(':');
        const figure = FIGURES.find((f) => f.id === id);
        const line = figure?.lines[Number(n)];
        if (line) drawn.set(`${id}:${Number(n)}`, { at: -Infinity, from: line[0] });
      }
    }
  } catch {
    // Storage can be unavailable in private windows; the sky then starts bare.
  }
  const keep = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...drawn.keys()]));
    } catch {
      // They last until the page is closed.
    }
  };

  const label = document.getElementById('sky-name') as HTMLElement;
  let held: number | null = null;
  let hover: number | null = null;
  /** The figure most lately finished, and when: it glows, and its name shows for a while. */
  let finished: { figure: Figure; at: number } | null = null;
  /** Now and then a star shows a ring by itself: an invitation to click the sky, or a hint of where to begin. */
  let wink: { star: number; at: number } | null = null;
  let nextWink = 0;
  let idleSince = 0;
  /** Whether each star was last found to be in open sky (not behind land or cloud deck), and when that was asked. */
  const seen = new Map<number, { open: boolean; at: number }>();

  const whole = (figure: Figure) => figure.lines.every((_, i) => drawn.has(`${figure.id}:${i}`));
  const at = (h: Heavens, star: number): V3 => [h.where[star * 3], h.where[star * 3 + 1], h.where[star * 3 + 2]];
  /** The lines still to be drawn from a star, to stars that are up. */
  const open = (h: Heavens, star: number): Link[] => (links.get(star) ?? []).filter((l) => !drawn.has(l.key) && h.where[l.other * 3 + 1] > UP);

  /** Where a star is on the page, if it is up, on the page and not hidden behind the land. */
  function place(h: Heavens, star: number, now: number): [number, number] | null {
    if (h.where[star * 3 + 1] <= UP) return null;
    const p = view.skyToPage(at(h, star));
    if (!p || p[0] < 0 || p[1] < 0 || p[0] > window.innerWidth || p[1] > window.innerHeight) return null;
    let was = seen.get(star);
    if (!was || now - was.at > 1500) {
      was = { open: view.isSky(p[0], p[1]), at: now };
      seen.set(star, was);
    }
    return was.open ? p : null;
  }

  /** The stars that could be clicked just now. */
  function candidates(h: Heavens): number[] {
    if (held !== null) return [held, ...open(h, held).map((l) => l.other)];
    const out: number[] = [];
    for (const star of links.keys()) if (h.where[star * 3 + 1] > UP && open(h, star).length > 0) out.push(star);
    return out;
  }

  function nearest(h: Heavens, x: number, y: number, now: number): number | null {
    let best: number | null = null;
    let bestDistance = REACH;
    for (const star of candidates(h)) {
      // The cheap test first: only stars near the pointer are looked up in the picture.
      const rough = view.skyToPage(at(h, star));
      if (!rough || Math.hypot(rough[0] - x, rough[1] - y) > bestDistance) continue;
      const p = place(h, star, now);
      if (!p) continue;
      bestDistance = Math.hypot(p[0] - x, p[1] - y);
      best = star;
    }
    return best;
  }

  return {
    /**
     * Called every frame. `pointer` is where the pointer is on the page (null
     * if it is not over open scenery); `starlight` is how well the stars show,
     * 0..1; `lying` is whether you are on your back looking up, which is when
     * stars can be joined.
     */
    update(now: number, pointer: [number, number] | null, h: Heavens | null, starlight: number, lying: boolean): SkyMarks {
      const marks: SkyMarks = { joinA: [], joinB: [], joins: 0, rings: [], ringCount: 0, pointing: false, stars: null };
      const playable = !!h && lying && starlight > 0.3;
      if (!h || !playable) {
        held = null;
        hover = null;
      } else {
        if (held !== null && h.where[held * 3 + 1] <= UP) held = null; // it has set
        hover = pointer ? nearest(h, pointer[0], pointer[1], now) : null;
      }
      marks.pointing = hover !== null;

      // Lying back, every star that a line can start from carries a small glint, so
      // there is no guessing which can be clicked.
      if (h && playable) {
        marks.stars = h.stars.slice();
        h.ids.forEach((id, i) => {
          if (id >= 0 && h.where[id * 3 + 1] > UP && open(h, id).length > 0) marks.stars![i * 4 + 3] += 400;
        });
      }

      if (h && playable) {
        // The figure in hand (the one the pointer is on, or the star last clicked
        // belongs to) shows the lines still to draw, dotted, as a guide.
        const inHand = held ?? hover;
        if (inHand !== null) {
          const figures = new Set((links.get(inHand) ?? []).map((l) => l.figure));
          for (const figure of figures) {
            figure.lines.forEach(([a, b], i) => {
              if (marks.joins >= MAX_JOINS - 6 || drawn.has(`${figure.id}:${i}`)) return;
              if (h.where[a * 3 + 1] <= UP || h.where[b * 3 + 1] <= UP) return;
              marks.joinA.push(...at(h, a), 1);
              marks.joinB.push(...at(h, b), -0.5);
              marks.joins++;
            });
          }
        }
      }

      if (h) {
        // The lines: the newest first, in case there are more than can be drawn at once.
        const lines = [...drawn.entries()].sort((a, b) => b[1].at - a[1].at);
        for (const [key, line] of lines) {
          if (marks.joins >= MAX_JOINS) break;
          const [id, n] = key.split(':');
          const figure = FIGURES.find((f) => f.id === id);
          const pair = figure?.lines[Number(n)];
          if (!figure || !pair) continue;
          const from = line.from === pair[1] ? pair[1] : pair[0];
          const to = from === pair[0] ? pair[1] : pair[0];
          if (h.where[from * 3 + 1] <= 0 || h.where[to * 3 + 1] <= 0) continue; // one end has set
          const grown = Math.min(1, (now - line.at) / 700);
          // A finished figure settles to a quiet line; one just finished glows for a few seconds first.
          const glow = finished && finished.figure === figure ? Math.max(0, 1 - (now - finished.at) / 6000) : 0;
          const bright = whole(figure) ? 0.5 + 0.5 * glow : 0.8;
          marks.joinA.push(...at(h, from), grown);
          marks.joinB.push(...at(h, to), bright);
          marks.joins++;
        }
      }

      if (h && starlight > 0.3) {
        const ring = (star: number, strength: number) => {
          if (marks.ringCount >= MAX_RINGS) return;
          marks.rings.push(...at(h, star), strength);
          marks.ringCount++;
        };
        if (held !== null) {
          ring(held, 2);
          for (const l of open(h, held)) if (l.other !== hover) ring(l.other, 0.4 + 0.25 * Math.sin(now / 380));
        }
        if (hover !== null && hover !== held) ring(hover, 1);

        // A ring that comes and goes by itself. Standing up, while nothing has
        // ever been joined, it is an invitation to click the sky. Lying back,
        // after a few idle seconds, it shows a star that a line can start from.
        const idle = held === null && hover === null;
        if (!idle) idleSince = now;
        const due = lying ? now - idleSince > 5000 : drawn.size === 0;
        if (idle && due) {
          if (!wink && now > nextWink) {
            const free = candidates(h).filter((star) => place(h, star, now));
            if (free.length) wink = { star: free[Math.floor(Math.random() * free.length)], at: now };
            nextWink = now + (lying ? 6000 : 22_000);
          }
          if (wink) {
            const age = (now - wink.at) / 3200;
            if (age >= 1) wink = null;
            else ring(wink.star, 0.75 * Math.sin(Math.PI * age));
          }
        } else {
          wink = null;
        }
      } else {
        wink = null;
      }

      // The name of a figure just finished hangs under it for a while.
      let naming = false;
      if (h && finished && now - finished.at < 9000) {
        let x = 0;
        let lowest = -Infinity;
        let count = 0;
        const stars = new Set(finished.figure.lines.flat());
        for (const star of stars) {
          const p = view.skyToPage(at(h, star));
          if (!p) continue;
          x += p[0];
          lowest = Math.max(lowest, p[1]);
          count++;
        }
        if (count) {
          naming = true;
          if (label.textContent !== finished.figure.name) label.textContent = finished.figure.name;
          label.style.left = `${Math.round(x / count)}px`;
          label.style.top = `${Math.round(lowest + 14)}px`;
        }
      }
      label.classList.toggle('shown', naming);

      while (marks.joinA.length < MAX_JOINS * 4) marks.joinA.push(0, -1, 0, 0);
      while (marks.joinB.length < MAX_JOINS * 4) marks.joinB.push(0, -1, 0, 0);
      while (marks.rings.length < MAX_RINGS * 4) marks.rings.push(0, -1, 0, 0);
      return marks;
    },

    /** A click on open scenery, at a point on the page. Returns true if it was a click on a star. */
    click(now: number, h: Heavens | null, x: number, y: number, starlight: number): boolean {
      // Looked up afresh, since a click can come without the pointer having been seen to move there.
      hover = h && starlight > 0.3 ? nearest(h, x, y, now) : null;
      if (!h || hover === null) {
        const had = held !== null;
        held = null;
        return had;
      }
      const star = hover;
      const join = held !== null && held !== star ? open(h, held).find((l) => l.other === star) : undefined;
      if (join && held !== null) {
        drawn.set(join.key, { at: now, from: held });
        keep();
        if (whole(join.figure)) {
          finished = { figure: join.figure, at: now + 700 }; // once the last line has finished growing
          onFinished();
        }
        // Carry on from the star just reached, if it has anywhere left to go.
        held = open(h, star).length > 0 ? star : null;
      } else {
        held = held === star ? null : star;
      }
      return true;
    },

    /** For testing: the stars that can be clicked now, with where they are on the page. */
    reachable(h: Heavens | null): { star: number; x: number; y: number; joins: number[] }[] {
      if (!h) return [];
      const now = performance.now();
      const out: { star: number; x: number; y: number; joins: number[] }[] = [];
      for (const star of candidates(h)) {
        const p = place(h, star, now);
        if (p) out.push({ star, x: Math.round(p[0]), y: Math.round(p[1]), joins: open(h, star).map((l) => l.other) });
      }
      return out;
    },
    found: () => FIGURES.filter(whole).map((f) => f.id),
  };
}
