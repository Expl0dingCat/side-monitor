// The same reading again, from wttr.in (free, no key): the last resort, asked
// only when neither of the other two will answer. It is the plainest of the
// three: three-hour steps, no cloud by height, no snow depth, no wind aloft.

import { ask } from './calls';
import { clamp01 } from './env';
import type { HourAhead, Live, Place } from './openMeteo';
import { sunTimes } from './sun';

const n = (v: unknown, fallback = 0) => {
  const x = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(x) ? x : fallback;
};

/** Its own numbers for the weather, as the weather code the rest of the page speaks. */
const CODES: Record<number, number> = {
  113: 0, 116: 2, 119: 3, 122: 3, 143: 45, 248: 45, 260: 48,
  176: 80, 179: 85, 182: 68, 185: 56, 200: 95, 227: 73, 230: 75,
  263: 51, 266: 51, 281: 56, 284: 57,
  293: 61, 296: 61, 299: 63, 302: 63, 305: 65, 308: 65, 311: 66, 314: 67,
  317: 68, 320: 69, 323: 71, 326: 71, 329: 73, 332: 73, 335: 75, 338: 75, 350: 77,
  353: 80, 356: 81, 359: 82, 362: 68, 365: 69, 368: 85, 371: 86, 374: 77, 377: 77,
  386: 95, 389: 95, 392: 95, 395: 95,
};
const SNOWY = new Set([71, 73, 75, 77, 85, 86]);
const SLEET = new Set([68, 69]);
const frozenIn = (code: number) => (SNOWY.has(code) ? 1 : SLEET.has(code) ? 0.5 : 0);

export async function fetchWttr(place: Place): Promise<Live> {
  const res = await ask(`https://wttr.in/${place.lat.toFixed(2)},${place.lon.toFixed(2)}?format=j1`);
  if (!res.ok) throw new Error(`weather request failed (${res.status})`);
  const data = await res.json();
  const cur = data.current_condition?.[0];
  if (!cur) throw new Error('weather request gave nothing');
  const now = Date.now();

  const code = CODES[n(cur.weatherCode, 119)] ?? 3;
  const mm = n(cur.precipMM); // in the last hour
  const frozen = frozenIn(code);
  let rain = clamp01(Math.sqrt((mm * (1 - frozen)) / 8));
  let snow = clamp01(Math.sqrt((mm * frozen) / 3));
  if (code >= 51 && frozen < 1) rain = Math.max(rain, 0.14);
  if (frozen > 0) snow = Math.max(snow, 0.14);

  const kmh = n(cur.windspeedKmph);
  const speed = clamp01(kmh / 50);
  const from = (n(cur.winddirDegree) * Math.PI) / 180;
  const aloft = clamp01((kmh * 1.6) / 90);
  // (No wind is given for the height the clouds go at. Up there it blows half as hard again, and from
  // a quarter further round: to the right of the wind on the ground in the north, to the left in the south.)
  const high = from + (place.lat >= 0 ? 0.44 : -0.44);

  const metres = n(cur.visibility, 30) * 1000; // it speaks in kilometres
  let fog = clamp01((6000 - metres) / 6000) ** 1.5;
  if (code === 45 || code === 48) fog = Math.max(fog, 0.75);

  const whole = clamp01(n(cur.cloudcover) / 100);

  // Its forecast comes in three-hour steps, by the clock of the place. (Read here
  // by this machine's clock: right when the place is where you are.)
  const hours: HourAhead[] = [];
  for (const day of data.weather ?? []) {
    for (const step of day.hourly ?? []) {
      const began = new Date(`${day.date}T${String(Math.floor(n(step.time) / 100)).padStart(2, '0')}:00`).getTime();
      const stepCode = CODES[n(step.weatherCode, 119)] ?? 3;
      for (let k = 0; k < 3; k++) {
        hours.push({
          time: began + k * 3_600_000,
          precip: n(step.precipMM) / 3,
          snowfall: (n(step.precipMM) / 3) * frozenIn(stepCode),
          cloud: n(step.cloudcover),
          visibility: n(step.visibility, 30) * 1000,
          code: stepCode,
        });
      }
    }
  }
  const ahead = hours.filter((h) => Number.isFinite(h.time) && h.time + 3_600_000 > now).slice(0, 14);

  // Rain or snow on its way: the first wet hour within two.
  let front = 0;
  let frontSnow = 0;
  if (rain <= 0 && snow <= 0) {
    const wet = ahead.find((h) => h.time > now && h.precip >= 0.1);
    const minutes = wet ? (wet.time - now) / 60_000 : 999;
    if (wet && minutes <= 120) {
      front = clamp01(1 - (minutes - 10) / 120);
      frontSnow = wet.snowfall > 0 ? 1 : 0;
    }
  }

  return {
    weather: {
      rain,
      snow,
      windX: -Math.sin(from) * speed,
      windZ: Math.cos(from) * speed,
      cloud: whole,
      fog,
      thunder: code === 95 ? 1 : 0,
      temp: n(cur.temp_C, 10),
      snowDepth: snow > 0 ? 0.004 + 0.012 * snow : 0,
      cloudLow: whole,
      cloudMid: whole,
      cloudHigh: whole,
      aloftX: -Math.sin(high) * aloft,
      aloftZ: Math.cos(high) * aloft,
      front,
      frontSnow,
      aroundX: 0,
      aroundZ: 0,
      aroundSnow: 0,
      smoke: 0,
      // (It does not say how near the air is to its dew point: a dry five degrees is assumed, so no dew is drawn on its word.)
      dewPoint: n(cur.temp_C, 10) - 5,
    },
    code,
    tempC: n(cur.temp_C, 10),
    ...sunTimes(now, place.lat, place.lon),
    hours: ahead,
    fetchedAt: now,
  };
}
