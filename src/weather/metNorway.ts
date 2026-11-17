// The same reading as openMeteo.ts gives, asked of the Norwegian Meteorological
// Institute instead (api.met.no: free, no key). It is the second choice: it
// cannot say how deep the snow lies, what the wind is doing up where the clouds
// are, or what is falling at places round about, so those are left out or
// guessed from what it does say.

import { ask } from './calls';
import { clamp01 } from './env';
import type { HourAhead, Live, Place } from './openMeteo';
import { sunTimes } from './sun';

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** How much of what falls is snow, by the forecast's name for the weather: all, half (sleet), or none. */
const frozenIn = (symbol: string) => (symbol.includes('snow') ? 1 : symbol.includes('sleet') ? 0.5 : 0);

/** The institute's name for the weather ("lightrainshowers_day") as the weather code the rest of the page speaks. */
function codeFor(symbol: string): number {
  const s = symbol.replace(/_(day|night|polartwilight)$/, '');
  if (s.includes('thunder')) return 95;
  const light = s.startsWith('light');
  const heavy = s.startsWith('heavy');
  const showers = s.includes('showers');
  if (s.includes('snow')) return showers ? (heavy ? 86 : 85) : light ? 71 : heavy ? 75 : 73;
  if (s.includes('sleet')) return heavy ? 69 : 68;
  if (s.includes('rain')) return showers ? (light ? 80 : heavy ? 82 : 81) : light ? 61 : heavy ? 65 : 63;
  if (s === 'fog') return 45;
  if (s === 'cloudy') return 3;
  if (s === 'partlycloudy') return 2;
  if (s === 'fair') return 1;
  return 0;
}

interface Step {
  time: string;
  data: {
    instant: { details: Record<string, unknown> };
    next_1_hours?: { summary?: { symbol_code?: string }; details?: Record<string, unknown> };
    next_6_hours?: { summary?: { symbol_code?: string }; details?: Record<string, unknown> };
  };
}

export async function fetchMet(place: Place): Promise<Live> {
  // Two decimal places, as for the other service: about a kilometre.
  const res = await ask(`https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${place.lat.toFixed(2)}&lon=${place.lon.toFixed(2)}`);
  if (!res.ok) throw new Error(`weather request failed (${res.status})`);
  const steps: Step[] = (await res.json()).properties?.timeseries ?? [];
  const now = Date.now();
  // The step for the present hour: the last that has begun.
  let at = 0;
  steps.forEach((s, i) => {
    if (Date.parse(s.time) <= now) at = i;
  });
  const here = steps[at];
  if (!here) throw new Error('weather request gave nothing');

  /** One step's weather: its name, the code for it, and the millimetres an hour falling. */
  const fall = (s: Step) => {
    const hourly = s.data.next_1_hours;
    const next = hourly ?? s.data.next_6_hours;
    const symbol = String(next?.summary?.symbol_code ?? 'cloudy');
    return { symbol, code: codeFor(symbol), mm: num(next?.details?.precipitation_amount) / (hourly ? 1 : 6) };
  };

  const d = here.data.instant.details;
  const { symbol, code, mm } = fall(here);
  const frozen = frozenIn(symbol);
  // (A millimetre of water falls as about a centimetre of snow.)
  let rain = clamp01(Math.sqrt((mm * (1 - frozen)) / 8));
  let snow = clamp01(Math.sqrt((mm * frozen) / 3));
  // The name can say it is raining while the hour's measure says nothing.
  if (code >= 51 && frozen < 1) rain = Math.max(rain, 0.14);
  if (frozen > 0) snow = Math.max(snow, 0.14);

  const kmh = num(d.wind_speed) * 3.6; // it speaks in metres a second
  const speed = clamp01(kmh / 50);
  const from = (num(d.wind_from_direction) * Math.PI) / 180;
  // No wind is given for the height the clouds go at. Up there it blows about half as hard again, and from a
  // quarter further round: to the right of the wind on the ground in the north of the world, to the left in the south.
  const aloft = clamp01((kmh * 1.6) / 90);
  const high = from + (place.lat >= 0 ? 0.44 : -0.44);

  let fog = clamp01(num(d.fog_area_fraction) / 100) ** 1.2;
  if (code === 45) fog = Math.max(fog, 0.75);

  const whole = clamp01(num(d.cloud_area_fraction) / 100);
  const layer = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? clamp01(v / 100) : whole);

  // Is rain or snow on its way? Hour by hour is all it tells, so the first wet hour within two.
  let front = 0;
  let frontSnow = 0;
  if (rain <= 0 && snow <= 0) {
    for (const s of steps.slice(at + 1)) {
      const minutes = (Date.parse(s.time) - now) / 60_000;
      if (minutes > 120) break;
      const coming = fall(s);
      if (coming.mm >= 0.1) {
        front = clamp01(1 - (minutes - 10) / 120);
        frontSnow = frozenIn(coming.symbol) > 0 ? 1 : 0;
        break;
      }
    }
  }

  const hours: HourAhead[] = steps
    .slice(at)
    .filter((s) => s.data.next_1_hours)
    .slice(0, 14)
    .map((s) => {
      const f = fall(s);
      const murk = num(s.data.instant.details.fog_area_fraction);
      return {
        time: Date.parse(s.time),
        precip: f.mm,
        snowfall: f.mm * frozenIn(f.symbol),
        cloud: num(s.data.instant.details.cloud_area_fraction),
        visibility: murk > 50 ? 1200 : murk > 15 ? 5000 : 30_000,
        code: f.code,
      };
    });

  return {
    weather: {
      rain,
      snow,
      windX: -Math.sin(from) * speed,
      windZ: Math.cos(from) * speed,
      cloud: whole,
      fog,
      thunder: code === 95 ? 1 : 0,
      temp: num(d.air_temperature, 10),
      // How much snow lies is not told: only that while it is snowing there is at least a dusting.
      snowDepth: snow > 0 ? 0.004 + 0.012 * snow : 0,
      cloudLow: layer(d.cloud_area_fraction_low),
      cloudMid: layer(d.cloud_area_fraction_medium),
      cloudHigh: layer(d.cloud_area_fraction_high),
      aloftX: -Math.sin(high) * aloft,
      aloftZ: Math.cos(high) * aloft,
      front,
      frontSnow,
      aroundX: 0,
      aroundZ: 0,
      aroundSnow: 0,
      smoke: 0,
      dewPoint: num(d.dew_point_temperature, num(d.air_temperature, 10) - 5),
    },
    code,
    tempC: num(d.air_temperature, 10),
    ...sunTimes(now, place.lat, place.lon),
    hours,
    fetchedAt: now,
  };
}

/**
 * The look at places round about, asked of this service: it answers for one
 * place at a time, so only the eight nearer spots are asked (one question
 * each), and the farther ring is given the same cloud and no rain. Each answer
 * is shaped like the first service's, so the same reading of it serves.
 */
export async function metRing(points: { lat: string; lon: string }[]): Promise<Record<string, unknown>[] | null> {
  const near = points.slice(0, 8);
  const answers = await Promise.all(
    near.map(async (p) => {
      const res = await ask(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${p.lat}&lon=${p.lon}`);
      if (!res.ok) throw new Error(`weather round about failed (${res.status})`);
      const steps: Step[] = (await res.json()).properties?.timeseries ?? [];
      const now = Date.now();
      let at = 0;
      steps.forEach((s, i) => {
        if (Date.parse(s.time) <= now) at = i;
      });
      const here = steps[at];
      if (!here) return {};
      const next = here.data.next_1_hours ?? here.data.next_6_hours;
      const symbol = String(next?.summary?.symbol_code ?? 'cloudy');
      const mm = num(next?.details?.precipitation_amount) / (here.data.next_1_hours ? 1 : 6);
      return { interval: 3600, precipitation: mm, snowfall: mm * frozenIn(symbol), weather_code: codeFor(symbol), cloud_cover: num(here.data.instant.details.cloud_area_fraction) };
    }),
  );
  return points.map((_, i) => (i < 8 ? answers[i] : { interval: 3600, precipitation: 0, snowfall: 0, weather_code: 0, cloud_cover: answers[i % 8].cloud_cover }));
}
