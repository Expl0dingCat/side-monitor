// Roughly where this computer is, worked out from its internet address. That is
// only good to the nearest city, which is all the weather needs. Nothing is
// sent but the request itself; two free services are tried in turn, and neither
// needs a key.

import { ask as counted } from './calls';
import type { Place } from './openMeteo';

const SERVICES = ['https://get.geojs.io/v1/ip/geo.json', 'https://ipwho.is/'];

// Some services give coordinates as numbers, others as text.
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);

async function ask(url: string): Promise<Place | null> {
  const giveUp = new AbortController();
  const timer = setTimeout(() => giveUp.abort(), 8000);
  try {
    const res = await counted(url, { signal: giveUp.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) return null;
    const found = await res.json();
    if (!found || found.success === false) return null;
    const lat = num(found.latitude);
    const lon = num(found.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    if (lat === 0 && lon === 0) return null; // what some services answer when they do not know
    const city = typeof found.city === 'string' ? found.city.trim().toLowerCase() : '';
    return { lat, lon, name: city, auto: true };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The city this connection appears to come from, or null if no service could say. */
export async function findByIp(): Promise<Place | null> {
  for (const url of SERVICES) {
    const place = await ask(url);
    if (place) return place;
  }
  return null;
}
