// Where the weather is asked for. There are three services, tried in order,
// none of which needs a key:
//
//   1. Open-Meteo: the fullest (snow depth, rain by the quarter hour, the wind
//      aloft, and the look at places round about). But it answers only so
//      many questions a day, and then says to come back tomorrow.
//   2. The Norwegian Meteorological Institute (api.met.no): nearly as full.
//   3. wttr.in: plain, but it is something.
//
// A service that fails is left alone for a while and the next is asked instead,
// so the sky is only ever "out of reach" when all three are.

import { ask, askedToday } from './calls';
import { callsMade } from './calls';
import { fetchLive, findPlace, setRingReader, type Live, type Place } from './openMeteo';
import { fetchMet, metRing } from './metNorway';
import { snowMeasured, snowReckoned } from './snowpack';
import { fetchWttr } from './wttr';

export type Source = 'open-meteo' | 'met.no' | 'wttr.in';

const SOURCES: { name: Source; ask: (place: Place) => Promise<Live> }[] = [
  { name: 'open-meteo', ask: fetchLive },
  { name: 'met.no', ask: fetchMet },
  { name: 'wttr.in', ask: fetchWttr },
];

/**
 * The first service allows ten thousand questions a day from one address. The page
 * stops asking it well short of that, so that a day of many reloads (or several
 * copies of the page open at once) cannot use the allowance up.
 */
const FIRST_HOST = 'api.open-meteo.com';
const DAILY_BUDGET = 6000;

/** Until when each service is being left alone (epoch ms). */
const resting = new Map<Source, number>();

// A service that has said "no more today" is remembered across reloads, so that
// opening the page again does not put the question again.
const REST_KEY = 'nightpond.weather-rest';
try {
  const kept = JSON.parse(localStorage.getItem(REST_KEY) ?? '{}') as Record<string, number>;
  for (const name in kept) if (kept[name] > Date.now()) resting.set(name as Source, kept[name]);
} catch {
  // Nothing remembered.
}
function restForTheDay(name: Source, until: number): void {
  resting.set(name, until);
  try {
    localStorage.setItem(REST_KEY, JSON.stringify(Object.fromEntries(resting)));
  } catch {
    // Remembered until the page is closed.
  }
}

/** How long to leave a service alone after it failed in this way. */
function restAfter(err: unknown): number {
  // "Too many requests": the day's allowance is spent, and days are counted in Greenwich time.
  if (/\(429\)/.test(String(err))) {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 10) - now.getTime();
  }
  // No answer at all is most likely this machine being off the network: ask again soon.
  if (err instanceof TypeError) return 3 * 60_000;
  return 15 * 60_000;
}

/** The weather for a place, from the first service that will give it. Throws only if none will. */
export async function fetchWeather(place: Place): Promise<Live> {
  let why: unknown = null;
  // Past its budget for the day, the first service is left alone until the day turns.
  if (askedToday(FIRST_HOST) >= DAILY_BUDGET && !firstChoiceResting()) restForTheDay('open-meteo', Date.now() + restAfter('(429)'));
  for (const source of SOURCES) {
    if ((resting.get(source.name) ?? 0) > Date.now()) continue;
    try {
      const live = await source.ask(place);
      live.source = source.name;
      if (source.name === 'open-meteo') {
        setRingReader(null);
        snowMeasured(live.weather.snowDepth);
      } else {
        // The look round about goes to the Norwegian service meanwhile, and the snow's depth is reckoned from what was last measured.
        setRingReader(source.name === 'met.no' ? metRing : async () => null);
        const hour = live.hours[0];
        live.weather.snowDepth = Math.max(live.weather.snowDepth, snowReckoned(live.tempC, hour?.snowfall ?? 0, hour ? hour.precip - hour.snowfall : 0));
      }
      // Said in the console at every reading, for anyone looking there: which service the weather came from,
      // which are being left alone, and how many questions have gone to each today.
      const left = sourcesResting();
      const asked = Object.entries(callsMade().today).map(([host, count]) => `${host} ${count}`);
      console.info(`nightpond · weather from ${source.name}${left.length ? ` · resting: ${left.join(', ')}` : ''} · asked today: ${asked.join(', ') || 'nothing yet'}`);
      return live;
    } catch (err) {
      if (/\(429\)/.test(String(err))) restForTheDay(source.name, Date.now() + restAfter(err));
      else resting.set(source.name, Date.now() + restAfter(err));
      console.warn(`${source.name}:`, err);
      why ??= err;
    }
  }
  throw why ?? new Error('no weather service is answering just now');
}

/** Whether the first service is being left alone. */
export const firstChoiceResting = () => (resting.get('open-meteo') ?? 0) > Date.now();

/** For testing: ask only this service for the next hour (the others are told to rest), or none in particular again. */
export function onlySource(name: Source | null): void {
  resting.clear();
  try {
    localStorage.removeItem(REST_KEY);
  } catch {
    // Nothing to forget.
  }
  if (name) for (const source of SOURCES) if (source.name !== name) resting.set(source.name, Date.now() + 3_600_000);
}

/** Which services are being left alone, and for how many minutes more (for testing). */
export const sourcesResting = () =>
  [...resting].filter(([, until]) => until > Date.now()).map(([name, until]) => `${name}: ${Math.round((until - Date.now()) / 60_000)} min`);

/** Look a city up by name: the first service's own gazetteer, and failing that OpenStreetMap's. Null if neither knows it. */
export async function findPlaceAnywhere(name: string): Promise<Place | null> {
  try {
    const found = await findPlace(name);
    if (found) return found;
  } catch {
    // The other one may still answer.
  }
  return findInOsm(name);
}

/** Look a city up in OpenStreetMap's gazetteer. Null if it is not known there. */
export async function findInOsm(name: string): Promise<Place | null> {
  const params = new URLSearchParams({ q: name, format: 'jsonv2', limit: '1', 'accept-language': 'en' });
  const res = await ask(`https://nominatim.openstreetmap.org/search?${params}`);
  if (!res.ok) throw new Error(`place lookup failed (${res.status})`);
  const hit = (await res.json())[0];
  if (!hit) return null;
  return { lat: Number(hit.lat), lon: Number(hit.lon), name: String(hit.name || String(hit.display_name).split(',')[0]).toLowerCase() };
}
