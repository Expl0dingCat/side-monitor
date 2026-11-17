// The place explains itself. Hold H, and a few quiet words hang over each
// thing that can be touched: what it is for, and (for the stone) the special
// lines it understands. Let go, and they fade. There is nothing to read
// otherwise: this is the whole of the instructions, and it stays out of sight.
//
// The words do not travel. Each is put where it belongs while it cannot yet be
// seen, and fades in there; it follows its thing as the picture slides, and
// otherwise holds still.

import './guide.css';

/** One thing to be named: where its words hang on the page (bottom centre of them), and what they say. */
export interface Saying {
  at: [number, number] | null;
  words: string;
  more?: string;
  /** Hung from a fixed place on the page, and not moved out of another's way. */
  fixed?: boolean;
  /** Hung under the place given, not over it. */
  below?: boolean;
  keys?: boolean;
  /** Set with its top left corner at the place given, its lines ranged left: for words that belong under the corner's own text. */
  corner?: boolean;
}

/**
 * `standsOut` says how well pale ink and dark ink would each show over a patch of the page (its corners, in CSS
 * pixels), as contrast: each saying is written in whichever shows better over what lies behind those very words.
 */
export function createGuide(standsOut: (x0: number, y0: number, x1: number, y1: number) => { pale: number; dark: number } | null = () => null) {
  const root = document.createElement('div');
  root.id = 'guide';
  root.setAttribute('aria-hidden', 'true');
  document.body.append(root);
  /** Each saying's own words on the page, by what they say; and for how many frames each has been in its place. */
  const made = new Map<string, { el: HTMLDivElement; placed: number; ink?: 'pale' | 'dark' }>();
  let held = false;

  return {
    held: () => held,
    hold(on: boolean): void {
      if (on && !held) {
        // Each fades in afresh, where it now belongs, in the ink that suits what is behind it now.
        for (const one of made.values()) {
          one.placed = 0;
          one.ink = undefined;
        }
      }
      held = on;
      root.classList.toggle('shown', on);
    },

    /** Called every frame while H is held: put each saying over its thing (the picture slides, so they are placed afresh). */
    place(sayings: Saying[]): void {
      // Those hung from a fixed place are seated first, so that the others can keep clear of them.
      const live = sayings.filter((s) => s.at).sort((a, b) => Number(!!b.fixed) - Number(!!a.fixed));
      const wanted = new Set(live.map((s) => s.words));
      for (const [words, one] of made) {
        if (wanted.has(words)) continue;
        one.el.style.display = 'none';
        one.placed = 0;
      }
      const taken: { x0: number; y0: number; x1: number; y1: number }[] = [];
      for (const s of live) {
        let one = made.get(s.words);
        if (!one) {
          one = { el: document.createElement('div'), placed: 0 };
          one.el.textContent = s.words;
          root.append(one.el);
          made.set(s.words, one);
        }
        const { el } = one;
        el.style.display = '';
        // (One that hangs in the upper part of the view is over the sky, and takes the sky's ink. And it is only
        // let be seen once it has been put in its place: so it fades in there, and is never seen arriving.)
        el.className = `says${s.keys ? ' keys' : ''}${s.corner ? ' corner' : ''}${s.at![1] < window.innerHeight * 0.4 ? ' high' : ''}${one.placed > 0 ? ' in' : ''}`;
        const more = s.more ?? '';
        if (el.dataset.more !== more) {
          el.dataset.more = more;
          el.textContent = s.words;
          if (more) {
            const small = document.createElement('small');
            small.textContent = more;
            el.append(small);
          }
        }
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        // Kept inside the window; and where two would lie over one another, the later is lifted clear.
        let x = Math.max(8, Math.min(window.innerWidth - w - 8, s.corner ? s.at![0] : s.at![0] - w / 2));
        let y = Math.max(8, Math.min(window.innerHeight - h - 8, s.corner || s.below ? s.at![1] : s.at![1] - h));
        if (!s.fixed) {
          for (let tries = 0; tries < 6; tries++) {
            const hit = taken.find((t) => x < t.x1 + 10 && x + w > t.x0 - 10 && y < t.y1 + 4 && y + h > t.y0 - 4);
            if (!hit) break;
            y = hit.y0 - h - 6 > 8 ? hit.y0 - h - 6 : hit.y1 + 6;
          }
        }
        taken.push({ x0: x, y0: y, x1: x + w, y1: y + h });
        el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        // Its ink, from what is behind it there: settled before it is first seen, and looked at again a few
        // times a second after. (It takes a clear advantage to change over, so it never flickers between the two.)
        if (one.placed === 0 || (one.placed + taken.length * 3) % 24 === 0) {
          const stands = standsOut(x, y, x + w, y + h);
          if (stands) {
            const dark = one.ink === 'dark' ? stands.dark * 1.25 > stands.pale : one.ink === 'pale' ? stands.dark > stands.pale * 1.25 : stands.dark > stands.pale;
            if (one.ink !== (dark ? 'dark' : 'pale')) {
              one.ink = dark ? 'dark' : 'pale';
              el.style.setProperty('--ink', dark ? '18, 25, 40' : '244, 246, 252');
            }
          }
        }
        one.placed++;
      }
    },
  };
}
