// How cloudy it is out toward the horizon, bearing by bearing. The sky low
// down on any side is cloud tens of kilometres away, which need not be the
// cloud overhead: it can be clear to the west while it is overcast here.
//
// What is kept is how much cloudier (or clearer) than overhead each of the
// eight compass bearings is. That eases over a minute or so, as the rest of
// the weather does; and when nothing is known of the sky round about, every
// bearing simply follows the cloud overhead.

import { clamp01 } from './env';

export const BEARINGS = 8; // north first, then round by the east

export function createCloudRound() {
  const differs = new Array<number>(BEARINGS).fill(0);
  const shown = new Array<number>(BEARINGS).fill(0);
  return {
    /**
     * Carry the easing on by `dt` seconds toward `wanted` (the cover toward
     * each bearing, or null if it is not known), where `wantedHere` is the
     * cover overhead those readings go with and `here` is the cover overhead
     * as it is shown now. Returns the cover to show toward each bearing.
     */
    update(dt: number, wanted: number[] | null, wantedHere: number, here: number, tau: number): number[] {
      const k = tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);
      for (let i = 0; i < BEARINGS; i++) {
        const reading = wanted?.[i];
        const target = typeof reading === 'number' && Number.isFinite(reading) ? clamp01(reading) - wantedHere : 0;
        differs[i] += (target - differs[i]) * k;
        shown[i] = clamp01(here + differs[i]);
      }
      return shown;
    },
    /** The cover toward each bearing as it is shown now (for testing). */
    shown: () => [...shown],
  };
}
