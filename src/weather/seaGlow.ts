// The sea glowing. On some dark nights in the warm half of the year the water
// is full of plankton that light up, a cold blue-green, wherever it is stirred:
// along a breaking crest, in the white water, in the sheet that runs up the
// stones, round a rock, where a skipped stone touches. In Shetland they call it
// mareel. It needs darkness (a bright moon washes it out), mild air, and a sea
// that has had the summer to warm; and even then it is there on some nights
// and not on others, for no reason anyone can see from the shore.

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How far into the glowing season a day is, 0..1: nothing in winter and spring, all of it from high summer into autumn (the sea is warmest well after midsummer). */
export function glowSeason(ms: number, south: boolean): number {
  const date = new Date(ms);
  let day = (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86_400_000;
  if (south) day = (day + 182) % 365;
  // From early June it comes on; by mid-July it is all there; it lasts into October, and is gone by December.
  return smooth(155, 196, day) * (1 - smooth(288, 335, day));
}

/** Whether tonight is one of the nights it happens on, 0..1: about one night in three has some, fewer have much. (A night runs from noon to noon, so that it does not change at midnight.) */
export function glowTonight(ms: number): number {
  const night = Math.floor((ms - new Date(ms).getTimezoneOffset() * 60_000 - 12 * 3_600_000) / 86_400_000);
  const h = Math.sin(night * 127.1 + 311.7) * 43758.5453;
  return smooth(0.62, 0.9, h - Math.floor(h));
}

/**
 * How brightly the sea glows just now, 0..1. `sunHeight` is 1 at midday, 0 at
 * sunrise and sunset, -1 in the middle of the night; `moonlight` how much of a
 * moon is lighting the place, 0..1; `tempC` the air.
 */
export function seaGlowFor(ms: number, south: boolean, sunHeight: number, moonlight: number, tempC: number): number {
  const dark = 1 - smooth(-0.4, -0.16, sunHeight);
  return glowSeason(ms, south) * glowTonight(ms) * dark * (1 - 0.65 * Math.max(0, Math.min(1, moonlight))) * smooth(3, 10, tempC);
}
