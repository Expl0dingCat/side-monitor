// What is in the air besides weather: smoke from far-off fires, dust, the
// haze of a city. Read from Open-Meteo's air-quality service (free, no API
// key) and turned into one number the sky can be drawn from.

import { ask } from './calls';
import { smoothstep } from './env';
import type { Place } from './openMeteo';

export interface Haze {
  /** How much the air dims and colours the sky: 0 on any ordinary day, 1 in thick smoke. */
  smoke: number;
  /** Whether it is mostly dust carried from far away, and not smoke. */
  dusty: boolean;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export async function fetchHaze(place: Place): Promise<Haze> {
  // The same two decimal places as the weather itself is asked with: about a kilometre.
  const params = new URLSearchParams({
    latitude: place.lat.toFixed(2),
    longitude: place.lon.toFixed(2),
    current: 'pm2_5,aerosol_optical_depth,dust',
  });
  // (It must never hold the weather up: after a few seconds it is given up on.)
  const res = await ask(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`air request failed (${res.status})`);
  const cur = (await res.json()).current ?? {};
  const fine = num(cur.pm2_5); // fine particles at the ground, micrograms in a cubic metre
  const depth = num(cur.aerosol_optical_depth); // how much the whole depth of air dims the sun
  const dust = num(cur.dust);
  // Smoke at the ground shows in the fine particles; smoke passing high
  // overhead only in how dim the sun is. Clean air (and ordinary city air)
  // counts as none at all.
  const smoke = Math.max(smoothstep(25, 160, fine), smoothstep(0.5, 1.8, depth));
  return { smoke, dusty: dust > 60 && dust > fine * 1.5 };
}
