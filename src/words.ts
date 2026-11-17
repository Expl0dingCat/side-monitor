// Changing what a piece of text says, without it ever simply changing. The old
// words fade out, the new ones fade in; the first words an empty place is given
// simply appear with whatever fade that place already has.

const waiting = new WeakMap<HTMLElement, number>();

/**
 * Make `el` say `words`. `write` is for a place whose words are more than plain
 * text (the clock's small "pm", the temperature set large): it is given the
 * element to fill. Asking for what it already says does nothing, so this can be
 * called every second.
 */
export function setWords(el: HTMLElement, words: string, write?: (el: HTMLElement) => void): void {
  if (el.dataset.says === words) return;
  const had = el.dataset.says ?? el.textContent ?? '';
  el.dataset.says = words;
  const put = () => {
    if (el.dataset.says !== words) return; // something newer has been asked for since
    if (write) write(el);
    else el.textContent = words;
    el.classList.remove('turning');
  };
  window.clearTimeout(waiting.get(el));
  // Nothing was showing: there is nothing to fade out first.
  if (!had || getComputedStyle(el).opacity === '0') {
    put();
    return;
  }
  el.classList.add('turning');
  waiting.set(el, window.setTimeout(put, 300));
}
