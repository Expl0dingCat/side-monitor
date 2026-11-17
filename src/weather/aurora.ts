import { ask } from './calls';
// The northern lights, when they are really out. How disturbed the Earth's
// magnetic field is just now is published every minute by the US Space
// Weather Prediction Center as one number, Kp, from 0 (quiet) to 9 (a great
// storm). The higher it is, the further from the poles the lights are seen.

/** The latest Kp, or null if it could not be had. */
export async function fetchKp(): Promise<number | null> {
  try {
    const res = await ask('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json', { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) return null;
    const rows = await res.json();
    const last = Array.isArray(rows) ? rows[rows.length - 1] : null;
    const kp = Number(last?.estimated_kp ?? last?.kp_index);
    return Number.isFinite(kp) ? kp : null;
  } catch {
    return null;
  }
}

/**
 * How much of the lights you would see from a place, 0 (none) to 1 (overhead),
 * for a given Kp. What matters is not how far north you are but how near the
 * magnetic pole, which sits in the Canadian Arctic: so they reach further
 * south over North America than over Europe.
 */
export function auroraFrom(kp: number, latitude: number, longitude: number): number {
  const rad = Math.PI / 180;
  const pole = [80.7 * rad, -72.7 * rad]; // the magnetic pole, near enough
  const lat = latitude * rad;
  const magnetic = Math.asin(Math.sin(lat) * Math.sin(pole[0]) + Math.cos(lat) * Math.cos(pole[0]) * Math.cos(longitude * rad - pole[1])) / rad;
  // The Kp at which the lights first show on the poleward horizon from here.
  const first = (65 - Math.abs(magnetic)) / 2 + 0.5;
  const t = Math.max(0, Math.min(1, (kp - (first - 0.5)) / 3));
  return t * t * (3 - 2 * t);
}
