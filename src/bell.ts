// A bell, struck. A real bell is not one note but a dozen, none of them in
// tune with each other in the way a synthesiser's would be: a deep hum under
// the note you hear, a minor third above it, and a crowd of higher tones that
// die away within a second or two. Each of those is really two tones a hair
// apart, which is what makes a bell's sound slowly beat. The clapper adds a
// knock at the start, and the valley adds its echo.
//
// Worked out here as plain samples, once for each pitch.

const TAU = Math.PI * 2;

/** [how many times the bell's note, how strong, how many seconds it rings] */
const TONES: [number, number, number][] = [
  [0.5, 0.45, 7.5], // the hum
  [1, 1, 5.5], // the note itself
  [1.19, 0.6, 4.2], // the minor third that makes it a bell
  [1.5, 0.3, 3.2],
  [2, 0.75, 2.8],
  [2.51, 0.28, 2.0],
  [3.01, 0.22, 1.6],
  [3.76, 0.16, 1.2],
  [4.57, 0.11, 0.9],
  [5.43, 0.08, 0.7],
  [6.71, 0.05, 0.5],
  [8.2, 0.03, 0.35],
];

/** Two channels of one stroke of a bell whose note is `pitch` (in hertz). */
export function makeBell(rate: number, pitch: number): Float32Array[] {
  const seconds = 9;
  const n = Math.floor(rate * seconds);
  const out = [new Float32Array(n), new Float32Array(n)];
  for (let c = 0; c < 2; c++) {
    const x = out[c];
    for (const [times, strength, rings] of TONES) {
      const f = pitch * times;
      if (f > rate * 0.45) continue;
      // The pair of tones a hair apart, each starting where it pleases.
      const apart = 0.0005 + Math.random() * 0.0014;
      const p1 = Math.random() * TAU;
      const p2 = Math.random() * TAU;
      const w1 = (TAU * f * (1 - apart)) / rate;
      const w2 = (TAU * f * (1 + apart)) / rate;
      const last = Math.min(n, Math.floor(rate * rings * 3.2));
      for (let i = 0; i < last; i++) {
        const s = i / rate;
        // Struck: it speaks at once, loses its first loudness quickly, then rings on.
        const env = Math.min(1, s / 0.004) * (0.55 * Math.exp(-s / (rings * 0.22)) + 0.45 * Math.exp(-s / rings));
        x[i] += strength * env * (Math.sin(w1 * i + p1) + Math.sin(w2 * i + p2)) * 0.5;
      }
    }
    // The clapper: a short dull knock.
    let knock = 0;
    let band = 0;
    for (let i = 0; i < rate * 0.05; i++) {
      knock += 0.3 * (Math.random() * 2 - 1 - knock);
      band += 0.5 * (knock - band);
      x[i] += (knock - band * 0.6) * Math.exp(-i / (rate * 0.008)) * 0.5;
    }
  }

  // The echo of the valley: the sound fed back on itself through a few delays of
  // different lengths (and a little differently in each ear), duller each time round.
  for (let c = 0; c < 2; c++) {
    const dry = out[c];
    const wet = new Float32Array(n);
    for (const ms of c === 0 ? [31.7, 37.9, 43.1, 49.3] : [33.1, 39.7, 44.9, 51.1]) {
      const d = Math.floor((rate * ms) / 1000);
      const line = new Float32Array(n);
      let damp = 0;
      for (let i = 0; i < n; i++) {
        const back = i >= d ? line[i - d] : 0;
        damp += 0.35 * (back - damp);
        line[i] = dry[i] + damp * 0.86;
        wet[i] += line[i] * 0.25;
      }
    }
    // Smeared, so that it is a wash and not a row of echoes.
    for (const ms of [5.3, 1.9]) {
      const d = Math.floor((rate * ms) / 1000);
      const through = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const back = i >= d ? through[i - d] : 0;
        const fed = wet[i] + back * 0.6;
        through[i] = fed;
        wet[i] = back - fed * 0.6;
      }
    }
    for (let i = 0; i < n; i++) dry[i] = dry[i] * 0.8 + wet[i] * 0.22;
  }

  let peak = 0;
  for (const x of out) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(x[i]));
  for (const x of out) {
    for (let i = 0; i < n; i++) x[i] = (x[i] / (peak || 1)) * 0.5 * Math.min(1, (n - i) / (rate * 0.5));
  }
  return out;
}
