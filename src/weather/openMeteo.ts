// Live conditions from Open-Meteo (free, no API key), turned into the 0..1
// numbers the scene is drawn from.

import { ask } from './calls';
import { clamp01, type Weather } from './env';
import type { Haze } from './airQuality';

export interface Place {
  lat: number;
  lon: number;
  name: string;
  /** Worked out from the internet address, not chosen by hand: looked up afresh each time the page opens. */
  auto?: boolean;
}

export interface HourAhead {
  time: number; // epoch ms
  precip: number; // mm in that hour
  snowfall: number; // cm in that hour
  cloud: number; // %
  visibility: number; // m
  code: number; // WMO weather code
}

export interface Live {
  weather: Weather;
  /** WMO weather code for right now. */
  code: number;
  /** Raw readings, for the text beside the scene. */
  tempC: number;
  sunrise: number; // epoch ms
  sunset: number; // epoch ms
  hours: HourAhead[];
  fetchedAt: number;
  /** Rain or snow falling somewhere round about, if any was found. */
  around?: Around;
  /** How cloudy it is toward each of the eight compass bearings (north first, then round by the east), 0..1 each, if it could be read. */
  coverBy?: number[];
  /** Smoke or dust in the air, if the air could be read. */
  haze?: Haze;
  /** Which weather service gave this reading (see sources.ts). */
  source?: string;
}

/** Rain or snow that is falling near by but not here. */
export interface Around {
  /** Which way it lies (east, south), with a length of how plainly it shows, 0..1. */
  x: number;
  z: number;
  snow: boolean;
  /** The same direction as a compass bearing in degrees (0 = north, clockwise). */
  bearing: number;
}

const CURRENT = [
  'temperature_2m',
  'dew_point_2m',
  'precipitation',
  'rain',
  'showers',
  'snowfall',
  'weather_code',
  'cloud_cover',
  'cloud_cover_low',
  'cloud_cover_mid',
  'cloud_cover_high',
  'wind_speed_10m',
  'wind_direction_10m',
  'snow_depth',
  'visibility',
].join(',');
// (The wind at 850 hPa is the wind about a mile up, where the low clouds are.)
const HOURLY = 'precipitation,snowfall,weather_code,cloud_cover,visibility,wind_speed_850hPa,wind_direction_850hPa';
// Rain and snow in quarter hours for the next three hours, to see weather coming.
const QUARTERLY = 'precipitation,snowfall';

const THUNDER = new Set([95, 96, 99]);
const FOG = new Set([45, 48]);
const WET = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOWY = new Set([71, 73, 75, 77, 85, 86]);

// Open-Meteo returns local wall-clock times without an offset.
const toEpoch = (iso: string, offsetSeconds: number) => Date.parse(iso + 'Z') - offsetSeconds * 1000;

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export async function fetchLive(place: Place): Promise<Live> {
  // Two decimal places is about a kilometre: plenty for weather, and no more
  // precise than it needs to be.
  const params = new URLSearchParams({
    latitude: place.lat.toFixed(2),
    longitude: place.lon.toFixed(2),
    current: CURRENT,
    hourly: HOURLY,
    forecast_hours: '14',
    minutely_15: QUARTERLY,
    forecast_minutely_15: '12',
    daily: 'sunrise,sunset',
    forecast_days: '2',
    timezone: 'auto',
  });
  const res = await ask(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`weather request failed (${res.status})`);
  const data = await res.json();

  const offset = num(data.utc_offset_seconds);
  const cur = data.current ?? {};
  const perHour = 3600 / Math.max(60, num(cur.interval, 900));

  const code = num(cur.weather_code);
  const rainRate = (num(cur.rain) + num(cur.showers)) * perHour; // mm/h
  const snowRate = num(cur.snowfall) * perHour; // cm/h
  const tempC = num(cur.temperature_2m, 10);

  let rain = clamp01(Math.sqrt(rainRate / 8));
  let snow = clamp01(Math.sqrt(snowRate / 3));
  // The code can say it is raining while the last interval measured nothing.
  if (WET.has(code)) rain = Math.max(rain, 0.14);
  if (SNOWY.has(code)) snow = Math.max(snow, 0.14);

  const speed = clamp01(num(cur.wind_speed_10m) / 50); // km/h
  // The API gives where the wind comes from (0 = north, clockwise).
  const from = (num(cur.wind_direction_10m) * Math.PI) / 180;

  const visibility = num(cur.visibility, 30_000);
  let fog = clamp01((6000 - visibility) / 6000) ** 1.5;
  if (FOG.has(code)) fog = Math.max(fog, 0.75);

  const depth = num(cur.snow_depth); // metres
  // What is really lying where you are; and while it is snowing, at least a dusting.
  const snowDepth = Math.max(depth, snow > 0 ? 0.004 + 0.012 * snow : 0);

  // Cloud by layer. (If the service gives no layers, all three follow the whole.)
  const whole = clamp01(num(cur.cloud_cover) / 100);
  const layer = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? clamp01(v / 100) : whole);

  const h = data.hourly ?? {};
  // The wind up where the clouds are: that is what moves them, and where weather comes from.
  const aloftSpeed = clamp01(num(h.wind_speed_850hPa?.[0], num(cur.wind_speed_10m) * 1.6) / 90);
  const aloftFrom = (num(h.wind_direction_850hPa?.[0], num(cur.wind_direction_10m)) * Math.PI) / 180;

  // Is rain or snow on its way? Look down the next three hours a quarter of an
  // hour at a time for the first that brings any; the nearer it is, the nearer 1.
  let front = 0;
  let frontSnow = 0;
  const q = data.minutely_15 ?? {};
  if (rain <= 0 && snow <= 0 && Array.isArray(q.precipitation)) {
    const first = q.precipitation.findIndex((mm: unknown, i: number) => i > 0 && num(mm) >= 0.1);
    if (first > 0) {
      front = clamp01(1 - (first * 15 - 10) / 120);
      frontSnow = num(q.snowfall?.[first]) > 0 ? 1 : 0;
    }
  }

  const hours: HourAhead[] = (h.time ?? []).map((t: string, i: number) => ({
    time: toEpoch(t, offset),
    precip: num(h.precipitation?.[i]),
    snowfall: num(h.snowfall?.[i]),
    cloud: num(h.cloud_cover?.[i]),
    visibility: num(h.visibility?.[i], 30_000),
    code: num(h.weather_code?.[i]),
  }));

  return {
    weather: {
      rain,
      snow,
      windX: -Math.sin(from) * speed,
      windZ: Math.cos(from) * speed,
      cloud: clamp01(num(cur.cloud_cover) / 100),
      fog,
      thunder: THUNDER.has(code) ? 1 : 0,
      temp: tempC,
      // (If the service gives no dew point, the air is taken to be middling dry.)
      dewPoint: num(cur.dew_point_2m, tempC - 5),
      snowDepth,
      cloudLow: layer(cur.cloud_cover_low),
      cloudMid: layer(cur.cloud_cover_mid),
      cloudHigh: layer(cur.cloud_cover_high),
      aloftX: -Math.sin(aloftFrom) * aloftSpeed,
      aloftZ: Math.cos(aloftFrom) * aloftSpeed,
      front,
      frontSnow,
      aroundX: 0,
      aroundZ: 0,
      aroundSnow: 0,
      smoke: 0,
    },
    code,
    tempC,
    sunrise: toEpoch(data.daily.sunrise[0], offset),
    sunset: toEpoch(data.daily.sunset[0], offset),
    hours,
    fetchedAt: Date.now(),
  };
}

// ---- the weather round about ---------------------------------------------------------
// The service has no radar picture to give, but it will answer for many places
// at once. So the sky is asked what is falling at sixteen spots in two rings
// round you: near enough that a shower there would be in sight from where you stand.
const RINGS = [
  { km: 25, shows: 0.62 },
  { km: 60, shows: 0.36 },
];
const SPOKES = 8;

/** One of the sixteen spots: the compass bearing it lies on, how plainly rain there would show, and what the service says of it. */
interface RingSpot {
  bearing: number;
  shows: number;
  current: Record<string, unknown>;
}

// One request answers for all sixteen spots, and everything that is asked of
// the ring (what is falling there, how cloudy it is) is read from that one
// answer: it is kept a while and shared.
const RING_KEPT = 25 * 60_000;
let ringAsked: { place: Place; at: number; answer: Promise<RingSpot[] | null> } | null = null;

function askRing(place: Place): Promise<RingSpot[] | null> {
  // (Sixteen spots count as sixteen questions against the service's daily allowance, and
  // weather twenty-five kilometres off does not change by the minute: one look serves for
  // twenty-five minutes.)
  if (ringAsked && ringAsked.place === place && Date.now() - ringAsked.at < RING_KEPT) return ringAsked.answer;
  const answer = readRing(place);
  ringAsked = { place, at: Date.now(), answer };
  return answer;
}

async function readRing(place: Place): Promise<RingSpot[] | null> {
  const lats: string[] = [];
  const lons: string[] = [];
  const spots: { bearing: number; shows: number }[] = [];
  const perDegree = 111.2; // km in a degree of latitude
  const squeeze = Math.max(0.2, Math.cos((place.lat * Math.PI) / 180)); // degrees of longitude are narrower toward the poles
  for (const ring of RINGS) {
    for (let i = 0; i < SPOKES; i++) {
      const bearing = (i / SPOKES) * 2 * Math.PI;
      const lat = Math.max(-89, Math.min(89, place.lat + (ring.km / perDegree) * Math.cos(bearing)));
      const lon = ((place.lon + (ring.km / (perDegree * squeeze)) * Math.sin(bearing) + 540) % 360) - 180;
      lats.push(lat.toFixed(2));
      lons.push(lon.toFixed(2));
      spots.push({ bearing, shows: ring.shows });
    }
  }
  // While the first service is not answering, another may be asked in its place (see sources.ts).
  if (otherRing) {
    const answers = await otherRing(lats.map((lat, i) => ({ lat, lon: lons[i] })));
    return answers && answers.length === spots.length ? answers.map((current, i) => ({ ...spots[i], current })) : null;
  }
  const params = new URLSearchParams({
    latitude: lats.join(','),
    longitude: lons.join(','),
    current: 'precipitation,snowfall,weather_code,cloud_cover',
    timezone: 'GMT',
  });
  // (Sixteen places in one question count as sixteen.)
  const res = await ask(`https://api.open-meteo.com/v1/forecast?${params}`, undefined, spots.length);
  if (!res.ok) throw new Error(`weather round about failed (${res.status})`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length !== spots.length) return null;
  return data.map((spot: { current?: Record<string, unknown> }, i: number) => ({ ...spots[i], current: spot.current ?? {} }));
}

/** Another service to ask about the sixteen spots, in place of this one; null to ask this one again. */
type RingReader = (points: { lat: string; lon: string }[]) => Promise<Record<string, unknown>[] | null>;
let otherRing: RingReader | null = null;
export function setRingReader(reader: RingReader | null): void {
  if (reader === otherRing) return;
  otherRing = reader;
  ringAsked = null; // what the other one said is not kept
}

/** Where rain or snow is falling round about, or null if it is dry all round. */
export async function fetchAround(place: Place): Promise<Around | null> {
  const ring = await askRing(place);
  if (!ring) return null;

  // Each wet spot pulls toward itself, by how hard it is raining there and how near it is.
  let east = 0;
  let north = 0;
  let most = 0;
  let mostAt = 0;
  let snowy = 0;
  let all = 0;
  ring.forEach((spot) => {
    const cur = spot.current;
    const code = num(cur.weather_code);
    const perHour = 3600 / Math.max(60, num(cur.interval, 900));
    let wet = clamp01(Math.sqrt((num(cur.precipitation) * perHour) / 6));
    if (WET.has(code) || SNOWY.has(code)) wet = Math.max(wet, 0.2);
    if (wet <= 0) return;
    const shows = spot.shows * (0.55 + 0.45 * wet);
    east += Math.sin(spot.bearing) * shows;
    north += Math.cos(spot.bearing) * shows;
    all += shows;
    if (num(cur.snowfall) > 0 || SNOWY.has(code)) snowy += shows;
    if (shows > most) {
      most = shows;
      mostAt = spot.bearing;
    }
  });
  if (most <= 0) return null;
  // Wet on every side pulls no way in particular: then it stands where it is heaviest.
  const pull = Math.hypot(east, north);
  const bearing = pull > 0.3 * all ? Math.atan2(east, north) : mostAt;
  return {
    x: Math.sin(bearing) * most,
    z: -Math.cos(bearing) * most,
    snow: snowy > all / 2,
    bearing: ((bearing * 180) / Math.PI + 360) % 360,
  };
}

/**
 * How cloudy it is toward each of the eight compass bearings, 0..1 each: north
 * first, then round by the east. (The two spots on a bearing are taken
 * together: the sky low on that side is the cloud over both.) Null if the sky
 * round about could not be read.
 */
export async function fetchCoverBy(place: Place): Promise<number[] | null> {
  const ring = await askRing(place);
  if (!ring) return null;
  const cover = new Array<number>(SPOKES).fill(0);
  const read = new Array<number>(SPOKES).fill(0);
  ring.forEach((spot, i) => {
    const percent = spot.current.cloud_cover;
    if (typeof percent !== 'number' || !Number.isFinite(percent)) return;
    cover[i % SPOKES] += clamp01(percent / 100);
    read[i % SPOKES]++;
  });
  if (read.some((n) => n === 0)) return null;
  return cover.map((sum, i) => sum / read[i]);
}

/** Look a city up by name. Returns null if nothing matches. */
export async function findPlace(name: string): Promise<Place | null> {
  const params = new URLSearchParams({ name, count: '1', language: 'en', format: 'json' });
  const res = await ask(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
  if (!res.ok) throw new Error(`place lookup failed (${res.status})`);
  const hit = (await res.json()).results?.[0];
  if (!hit) return null;
  return { lat: hit.latitude, lon: hit.longitude, name: String(hit.name).toLowerCase() };
}
