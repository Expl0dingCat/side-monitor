// A way of forcing the weather, the hour and the time of year from code, so
// that each state of the scene can be tried without waiting for a real storm.
// There is no panel for it on the page (there was one; it was taken out). From
// the browser's console: nightpond.set({ rain: 1, hour: 23 }), nightpond.live().

import type { Weather } from './weather/env';

export interface DebugState {
  /** When false the scene follows the real sky and none of the values below apply. */
  manual: boolean;
  hour: number; // 0..24
  /** Days from today, for trying other times of year. */
  days: number;
  rain: number;
  snow: number;
  wind: number; // 0..1
  windFrom: number; // degrees, 0 = north
  cloud: number;
  fog: number;
  thunder: number;
  temp: number;
  snowDepth: number; // metres
  moon: number; // phase 0..1
  /** The northern lights, 0..1; below 0 to follow the real ones. */
  aurora: number;
  /** The sea glowing where it is stirred, 0..1; below 0 for it to follow the season, the night and the dark. */
  glow: number;
  /** The tide, from low water (-1) to high (1) at springs; below -1 for it to follow the moon. */
  tide: number;
  /** Cloud by layer, 0..1 each; below 0 for a layer to follow `cloud`. */
  cloudLow: number;
  cloudMid: number;
  cloudHigh: number;
  /** Where the wind at cloud height comes from, in degrees; below 0 to follow `windFrom`. */
  aloftFrom: number;
  /** Rain or snow on its way, 0 (none) to 1 (arriving); and whether it is snow. */
  front: number;
  frontSnow: number;
  /** Rain or snow in sight but not here: how plainly (0..1), the compass bearing it lies on, and whether it is snow. */
  around: number;
  aroundAt: number;
  aroundSnow: number;
  /** How cloudy it is toward each compass bearing, 0..1: north, north-east, east, south-east, south, south-west, west, north-west. Null for every side to follow `cloud`. */
  coverBy: number[] | null;
  /** An eclipse of the moon: 0 (not yet begun) by 0.5 (the middle of totality) to 1 (over); below 0 to follow the real ones. */
  eclipse: number;
  /** Smoke in the air, 0..1. */
  smoke: number;
  /** The dew point in Celsius; below -90 for it to sit five degrees under `temp` (dry air, no dew). */
  dewPoint: number;
  /** Hoarfrost and dew, 0..1 each, as thick as asked for whatever the weather; below 0 to follow the weather. */
  frost: number;
  dew: number;
}

export function createDebug(initial: () => Partial<DebugState>) {
  const state: DebugState = {
    manual: false, hour: 22, days: 0, rain: 0, snow: 0, wind: 0.2, windFrom: 270, cloud: 0.2,
    fog: 0, thunder: 0, temp: 8, snowDepth: 0, moon: 0.5, aurora: -1, glow: -1, tide: -9,
    cloudLow: -1, cloudMid: -1, cloudHigh: -1, aloftFrom: -1, front: 0, frontSnow: 0,
    around: 0, aroundAt: 270, aroundSnow: 0,
    coverBy: null, eclipse: -1, smoke: 0,
    dewPoint: -99, frost: -1, dew: -1,
  };

  function setManual(on: boolean) {
    // Start from the real sky, so that only what is asked for changes.
    if (on && !state.manual) Object.assign(state, { coverBy: null, eclipse: -1, smoke: 0 });
    if (on && !state.manual) Object.assign(state, initial(), { manual: true, days: 0, aurora: -1, glow: -1, tide: -9, cloudLow: -1, cloudMid: -1, cloudHigh: -1, aloftFrom: -1, front: 0, frontSnow: 0, around: 0 });
    if (on && !state.manual) Object.assign(state, { dewPoint: -99, frost: -1, dew: -1 });
    state.manual = on;
  }

  return {
    state,
    /** Force some values; the rest stay as the real sky has them. */
    set(values: Partial<DebugState>) {
      setManual(values.manual ?? true);
      Object.assign(state, values);
    },
    /** Go back to the real sky. */
    live() {
      setManual(false);
    },
    weather(): Weather {
      const from = (state.windFrom * Math.PI) / 180;
      const high = ((state.aloftFrom >= 0 ? state.aloftFrom : state.windFrom) * Math.PI) / 180;
      const aloft = Math.min(1, state.wind * 1.5 + 0.1);
      const layer = (v: number) => (v >= 0 ? v : state.cloud);
      return {
        cloudLow: layer(state.cloudLow),
        cloudMid: layer(state.cloudMid),
        cloudHigh: layer(state.cloudHigh),
        aloftX: -Math.sin(high) * aloft,
        aloftZ: Math.cos(high) * aloft,
        front: state.front,
        frontSnow: state.frontSnow,
        aroundX: Math.sin((state.aroundAt * Math.PI) / 180) * state.around,
        aroundZ: -Math.cos((state.aroundAt * Math.PI) / 180) * state.around,
        aroundSnow: state.aroundSnow,
        smoke: state.smoke,
        rain: state.rain,
        snow: state.snow,
        windX: -Math.sin(from) * state.wind,
        windZ: Math.cos(from) * state.wind,
        cloud: state.cloud,
        fog: state.fog,
        thunder: state.thunder,
        temp: state.temp,
        dewPoint: state.dewPoint > -90 ? Math.min(state.dewPoint, state.temp) : state.temp - 5,
        snowDepth: state.snowDepth,
      };
    },
  };
}
