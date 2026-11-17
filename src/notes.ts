// The notes the standing stone keeps. Click the stone and the view leans in to
// it; what you have written hangs in the air beside it, in the light of its
// carving, and you write straight onto the scene. There is no window to open
// or close: click anywhere else, or press Esc, and you stand back again.
// Whatever you write is saved in this browser as you type.

import { namingLine } from './bond';

const KEY = 'nightpond.notes';

/** A line that named the lamb, lifted off the stone: the name, the line as it was written, and where on the page it stood. */
export interface Named {
  name: string;
  line: string;
  x: number;
  y: number;
  size: number;
}

export function createNotes(onNamed?: (named: Named) => void) {
  const panel = document.getElementById('notes') as HTMLElement;
  const text = document.getElementById('notes-text') as HTMLTextAreaElement;
  const status = document.getElementById('notes-status') as HTMLElement;

  try {
    text.value = localStorage.getItem(KEY) ?? '';
  } catch {
    // Storage can be unavailable in private windows.
  }

  // The writing takes up only as much room as it needs.
  const fit = () => {
    text.style.height = 'auto';
    text.style.height = `${text.scrollHeight}px`;
  };
  window.addEventListener('resize', () => {
    if (isOpen) fit();
  });

  let isOpen = false;
  let closedAt = -1e9;
  let lastKey = -1e9;
  let saveTimer = 0;
  let hideTimer = 0;

  const keep = () => {
    window.clearTimeout(saveTimer);
    try {
      localStorage.setItem(KEY, text.value);
      status.textContent = '';
    } catch {
      // Only spoken of when it goes wrong.
      status.textContent = 'this browser would not let the stone keep that';
    }
  };

  text.addEventListener('input', () => {
    lastKey = performance.now();
    fit();
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(keep, 400);
  });

  /**
   * If the writing holds a line that names the lamb, take the line out of the
   * writing and say what it was and where it stood.
   */
  const takeNaming = (): Named | null => {
    const found = namingLine(text.value);
    if (!found) return null;
    // Whereabouts on the page that line is (near enough: it does not allow for long lines that wrap).
    const style = getComputedStyle(text);
    const size = parseFloat(style.fontSize) || 20;
    const tall = parseFloat(style.lineHeight) || size * 1.45;
    const box = text.getBoundingClientRect();
    const row = text.value.slice(0, found.start).split('\n').length - 1;
    const named: Named = {
      name: found.name,
      line: found.line.trim(),
      x: box.left + (parseFloat(style.paddingLeft) || 0),
      y: box.top + (parseFloat(style.paddingTop) || 0) + row * tall - text.scrollTop,
      size,
    };
    // Out it comes, with the line break that followed it (or the one before, if it was the last line).
    let { start, end } = found;
    if (text.value[end] === '\n') end++;
    else if (start > 0 && text.value[start - 1] === '\n') start--;
    text.value = text.value.slice(0, start) + text.value.slice(end);
    return named;
  };

  const close = () => {
    if (!isOpen) return;
    const named = takeNaming();
    if (named && onNamed) onNamed(named);
    keep(); // never lose the last few keystrokes
    isOpen = false;
    closedAt = performance.now();
    panel.classList.remove('open');
    text.blur();
    // Leave it in place while it fades.
    hideTimer = window.setTimeout(() => {
      panel.hidden = true;
    }, 800);
  };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  // A click anywhere but on the writing stands you back up.
  window.addEventListener('pointerdown', (e) => {
    if (isOpen && !panel.contains(e.target as Node)) close();
  });
  // Closing the tab mid-sentence should not lose it either.
  window.addEventListener('pagehide', () => {
    if (isOpen) keep();
  });

  return {
    open() {
      if (isOpen) return;
      isOpen = true;
      window.clearTimeout(hideTimer);
      panel.hidden = false;
      fit();
      // A moment later, so that it fades in from nothing.
      window.setTimeout(() => {
        if (isOpen) panel.classList.add('open');
      }, 30);
      text.focus({ preventScroll: true });
      text.setSelectionRange(text.value.length, text.value.length);
      text.scrollTop = text.scrollHeight;
    },
    isOpen: () => isOpen,
    /** What is written, as it stands. */
    text: () => text.value,
    /** Take a line naming the lamb out of the writing, if one is there (used once at the start, for a line left from before). */
    takeNaming(): Named | null {
      const named = takeNaming();
      if (named) keep();
      return named;
    },
    /**
     * Take one line out of the writing: the letters from `start` to `end`, and
     * the line break with them. The caret stays where it was, so this can be
     * done while you are writing. Says where on the page the line stood (near
     * enough), or null if the writing is put away and it stood nowhere.
     */
    takeLine(start: number, end: number): { x: number; y: number; size: number } | null {
      let stood: { x: number; y: number; size: number } | null = null;
      if (isOpen) {
        const style = getComputedStyle(text);
        const size = parseFloat(style.fontSize) || 20;
        const tall = parseFloat(style.lineHeight) || size * 1.45;
        const box = text.getBoundingClientRect();
        const row = text.value.slice(0, start).split('\n').length - 1;
        stood = { x: box.left + (parseFloat(style.paddingLeft) || 0), y: box.top + (parseFloat(style.paddingTop) || 0) + row * tall - text.scrollTop, size };
      }
      if (text.value[end] === '\n') end++;
      else if (start > 0 && text.value[start - 1] === '\n') start--;
      const moved = (at: number) => (at <= start ? at : Math.max(start, at - (end - start)));
      const caret = [moved(text.selectionStart), moved(text.selectionEnd)];
      text.value = text.value.slice(0, start) + text.value.slice(end);
      if (isOpen) {
        text.setSelectionRange(caret[0], caret[1]);
        fit();
      }
      keep();
      return stood;
    },
    /** Keep what is written right now, without waiting for a pause in the typing. */
    save: keep,
    /** Replace what is written (used when a keepsake is loaded). */
    put(words: string) {
      text.value = words;
      keep();
    },
    /** True for a moment after standing back, so the click that did it does nothing else. */
    justClosed: () => performance.now() - closedAt < 400,
    /** 1 as a key is struck, fading to 0: the carving flickers as you write. */
    spark: () => Math.max(0, 1 - (performance.now() - lastKey) / 500),
  };
}
