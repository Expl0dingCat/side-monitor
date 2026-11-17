// When the sun rises and sets, worked out from where you are and the date
// alone. (The first weather service says this itself; the others do not, and
// the arithmetic is short: the sun's place on its yearly round, how far north
// or south of the equator that puts it, and so how long it stays above your horizon.)

const DAY = 86_400_000;
const RAD = Math.PI / 180;
const NOON_2000 = Date.UTC(2000, 0, 1, 12);

/** Sunrise and sunset (epoch ms) for the day whose noon is nearest to `ms` at that longitude. Good to a few minutes. */
export function sunTimes(ms: number, lat: number, lon: number): { sunrise: number; sunset: number } {
  // Local noons are counted in days from noon on 1 January 2000; east of Greenwich they come earlier.
  const noon = Math.round((ms - NOON_2000) / DAY + lon / 360) - lon / 360;
  const anomaly = ((357.5291 + 0.98560028 * noon) % 360) * RAD; // how far round its orbit the earth is
  const centre = 1.9148 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly) + 0.0003 * Math.sin(3 * anomaly);
  const along = (((anomaly / RAD + centre + 180 + 102.9372) % 360) + 360) % 360 * RAD; // the sun's place along the zodiac
  // The sun is not due south at exactly twelve: it runs a few minutes fast or slow through the year.
  const transit = noon + 0.0053 * Math.sin(anomaly) - 0.0069 * Math.sin(2 * along);
  const tilt = Math.asin(Math.sin(along) * Math.sin(23.4397 * RAD)); // how far north of the equator the sun stands
  // (Its top edge shows, lifted by the air, when its centre is still 0.83 degrees down.)
  const reach = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * Math.sin(tilt)) / (Math.cos(lat * RAD) * Math.cos(tilt));
  // Never up (the polar night) or never down (the midnight sun).
  const half = reach >= 1 ? 0 : reach <= -1 ? 0.5 : Math.acos(reach) / (2 * Math.PI);
  return { sunrise: NOON_2000 + (transit - half) * DAY, sunset: NOON_2000 + (transit + half) * DAY };
}
