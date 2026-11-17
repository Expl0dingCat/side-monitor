// The two quiet lines of weather text: what it is doing now, and what is coming.

import type { HourAhead, Live } from './openMeteo';

const NOW: Record<number, string> = {
  0: 'clear',
  1: 'mostly clear',
  2: 'broken cloud',
  3: 'overcast',
  45: 'fog',
  48: 'freezing fog',
  51: 'light drizzle',
  53: 'drizzle',
  55: 'heavy drizzle',
  56: 'freezing drizzle',
  57: 'freezing drizzle',
  61: 'light rain',
  63: 'rain',
  65: 'heavy rain',
  66: 'freezing rain',
  67: 'freezing rain',
  68: 'sleet',
  69: 'heavy sleet',
  71: 'light snow',
  73: 'snow',
  75: 'heavy snow',
  77: 'snow grains',
  80: 'passing showers',
  81: 'showers',
  82: 'heavy showers',
  85: 'snow showers',
  86: 'heavy snow showers',
  95: 'thunderstorm',
  96: 'thunder and hail',
  99: 'thunder and hail',
};

export function describeNow(live: Live): string {
  return `${Math.round(live.tempC)}° · ${NOW[live.code] ?? 'quiet skies'}`;
}

function clock(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  if (h === 0) return 'midnight';
  if (h === 12) return 'noon';
  return `${h % 12}${h < 12 ? 'am' : 'pm'}`;
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

const isWet = (h: HourAhead) => h.precip >= 0.1;
const isSnow = (h: HourAhead) => h.snowfall > 0.05;

/** One line about the next few hours, e.g. "rain easing by 2am". */
export function describeAhead(live: Live, now: number): string {
  // Only hours that have not finished yet.
  const hours = live.hours.filter((h) => h.time + 3_600_000 > now);
  if (hours.length < 2) return '';
  const [current, ...ahead] = hours;
  const lastHour = new Date(ahead[ahead.length - 1].time).getHours();
  const untilWhen = lastHour >= 4 && lastHour <= 11 ? 'until morning' : 'for hours yet';

  if (isWet(current)) {
    const what = isSnow(current) ? 'snow' : 'rain';
    const dry = ahead.find((h) => !isWet(h));
    return dry ? `${what} easing by ${clock(dry.time)}` : `${what} ${untilWhen}`;
  }

  const wet = ahead.find(isWet);
  if (wet) return `${isSnow(wet) ? 'snow' : 'rain'} arriving around ${clock(wet.time)}`;

  // Nothing is coming here, but something is falling within sight.
  if (live.around) return `${live.around.snow ? 'snow' : 'rain'} off to the ${COMPASS[Math.round(live.around.bearing / 45) % 8]}`;

  // Smoke (or dust) thick enough to change the look of the day.
  if ((live.haze?.smoke ?? 0) > 0.45) return live.haze?.dusty ? 'dust in the air' : 'smoke in the air';

  if (current.visibility < 2000) {
    const lifted = ahead.find((h) => h.visibility > 6000);
    return lifted ? `fog lifting by ${clock(lifted.time)}` : `fog ${untilWhen}`;
  }

  if (current.cloud > 70) {
    const clearer = ahead.find((h) => h.cloud < 35);
    return clearer ? `sky clearing by ${clock(clearer.time)}` : `cloud holding ${untilWhen}`;
  }
  const cloudier = ahead.find((h) => h.cloud > 75);
  if (cloudier) return `cloud gathering by ${clock(cloudier.time)}`;
  return current.cloud < 30 ? `clear ${untilWhen}` : `dry ${untilWhen}`;
}
