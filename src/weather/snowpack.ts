// How deep the snow lies, kept in mind for the times when the weather service
// that measures it will not answer. The others say only what is falling; so the
// last measured depth is remembered, and from then on it is added to by what
// falls and worn away by warmth and rain, hour by hour. A reckoning, not a
// measurement: it is put right the moment the first service answers again.

const KEY = 'nightpond.snowpack';

interface Pack {
  /** Metres lying, and when that was last worked out (epoch ms). */
  depth: number;
  at: number;
}

function load(): Pack | null {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Pack | null;
    return kept && Number.isFinite(kept.depth) && Number.isFinite(kept.at) ? kept : null;
  } catch {
    return null;
  }
}

function keep(pack: Pack): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(pack));
  } catch {
    // Remembered until the page is closed.
  }
}

/** The depth as measured, from the service that can tell it. */
export function snowMeasured(depth: number): void {
  keep({ depth: Math.max(0, depth), at: Date.now() });
}

/**
 * The depth as reckoned: what was last known, plus what has fallen since and
 * less what has melted. `snowfall` is in centimetres an hour, `rain` in
 * millimetres an hour, at `tempC`.
 */
export function snowReckoned(tempC: number, snowfall: number, rain: number): number {
  const now = Date.now();
  const pack = load() ?? { depth: 0, at: now };
  // (After a long gap nothing is known of the hours between: only the last few are counted.)
  const hours = Math.max(0, Math.min(6, (now - pack.at) / 3_600_000));
  // Settled snow goes at about a centimetre and a half for each degree above freezing in a day, and rain takes it faster.
  const melting = Math.max(0, tempC) * 0.0006 + Math.max(0, tempC > 0 ? rain : 0) * 0.0008;
  const depth = Math.max(0, pack.depth + (snowfall / 100 - melting) * hours);
  keep({ depth, at: now });
  return depth;
}
