// Turns the weather and the position of the sun and moon into a palette: where
// the light comes from, what colour it is, how the sky is banded and how far
// you can see. The colours are deliberately a little richer than life, with
// cool shadows and warm light, as in painted pixel art.

import { smoothstep, type Env } from '../weather/env';
import { norm, type Rgb, type V3 } from './gl';

export interface Atmosphere {
  sunDir: V3;
  moonDir: V3;
  /** LOW-SUN: how low the sun stands while it is up and not hidden: 1 just risen or about to set, 0 once it is well up (or under cloud, or in rain). */
  sunLow: number;
  /** Direction toward whichever of the two is lighting the land. */
  lightDir: V3;
  lightCol: Rgb;
  ambient: Rgb;
  /** The sky is three colours: at the horizon, part way up, and overhead. */
  horizon: Rgb;
  skyMid: Rgb;
  zenith: Rgb;
  fogCol: Rgb;
  /** Fog per metre. Visibility is roughly 3 / density. */
  fogDensity: number;
  /** How much the cloud base swallows high ground, 0..1. */
  cloudFog: number;
  /** Fog pouring over the rim of the far cliff and down its face, 0..1. */
  spill: number;
  /** How quickly the haze thins as you look up. Small = the whole sky is fogged. */
  hazeFalloff: number;
  /** How hot the day feels, 0..1: the air shimmers, the light bleaches, the grass dries. */
  heat: number;
  cloudLit: Rgb;
  cloudDark: Rgb;
  /** What a low sun paints the undersides of clouds: a colour, then how strongly (0..1). */
  cloudGlow: [number, number, number, number];
  /** How strongly a rainbow could show, before asking whether the sun is behind you. */
  bow: number;
  sunGlow: Rgb;
  sunDisc: Rgb;
  stars: number;
  moonVisible: number;
  /** Window light, 0 by day to 1 after dark. */
  lamp: number;
  grassLush: Rgb;
  grassDry: Rgb;
  /** The pale colour grass flashes when a gust bends it. */
  grassLight: Rgb;
  seaDeep: Rgb;
  seaPale: Rgb;
  /** Sparkle on the water, and the white water along the shore. */
  glint: Rgb;
  foam: Rgb;
  /** Text colour that reads against the upper sky, and a halo behind it. */
  ink: Rgb;
  halo: Rgb;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: Rgb, b: Rgb, t: number): Rgb => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const scale = (a: Rgb, s: number): Rgb => [a[0] * s, a[1] * s, a[2] * s];
const add = (a: Rgb, b: Rgb): Rgb => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Rgb, b: Rgb): Rgb => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const luma = (c: Rgb) => c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15;
const grey = (c: Rgb, t: number): Rgb => {
  const l = luma(c);
  return [mix(c[0], l, t), mix(c[1], l, t), mix(c[2], l, t)];
};
const rad = (deg: number) => (deg * Math.PI) / 180;

/** One look of the sky. */
interface Look {
  horizon: Rgb;
  mid: Rgb;
  zenith: Rgb;
  ambient: Rgb;
  light: Rgb;
  cloudLit: Rgb;
  cloudDark: Rgb;
}

const DAY: Look = {
  horizon: [0.76, 0.91, 0.95],
  mid: [0.38, 0.68, 0.94],
  zenith: [0.15, 0.41, 0.84],
  ambient: [0.36, 0.48, 0.68],
  light: [0.64, 0.59, 0.44],
  cloudLit: [1.0, 1.0, 0.97],
  cloudDark: [0.58, 0.68, 0.88],
};
const DUSK: Look = {
  horizon: [1.0, 0.64, 0.36],
  mid: [0.74, 0.38, 0.52],
  zenith: [0.17, 0.16, 0.44],
  ambient: [0.3, 0.24, 0.42],
  light: [0.82, 0.42, 0.22],
  cloudLit: [1.0, 0.76, 0.56],
  cloudDark: [0.46, 0.3, 0.52],
};
const DAWN: Look = {
  horizon: [1.0, 0.8, 0.66],
  mid: [0.8, 0.6, 0.72],
  zenith: [0.24, 0.3, 0.6],
  ambient: [0.32, 0.3, 0.46],
  light: [0.8, 0.52, 0.4],
  cloudLit: [1.0, 0.86, 0.78],
  cloudDark: [0.52, 0.42, 0.6],
};
const NIGHT: Look = {
  horizon: [0.09, 0.15, 0.3],
  mid: [0.045, 0.08, 0.2],
  zenith: [0.02, 0.035, 0.11],
  ambient: [0.1, 0.15, 0.3],
  light: [0.27, 0.37, 0.54],
  cloudLit: [0.2, 0.27, 0.44],
  cloudDark: [0.08, 0.11, 0.22],
};

const blend = (a: Look, b: Look, t: number): Look => ({
  horizon: mix3(a.horizon, b.horizon, t),
  mid: mix3(a.mid, b.mid, t),
  zenith: mix3(a.zenith, b.zenith, t),
  ambient: mix3(a.ambient, b.ambient, t),
  light: mix3(a.light, b.light, t),
  cloudLit: mix3(a.cloudLit, b.cloudLit, t),
  cloudDark: mix3(a.cloudDark, b.cloudDark, t),
});

// The view looks west, out to sea: +z is east (behind you), -x is south (to the left).
function sunDirection(env: Env): V3 {
  const { sky } = env;
  const up = sky.height >= 0;
  // East at sunrise, round through the south, into the west at sunset; then under the north.
  const az = up ? Math.PI * sky.progress : Math.PI * (1 + sky.progress);
  const top = rad(mix(15, 52, sky.summer)); // the winter sun stays low
  const el = up ? top * Math.sin(Math.PI * sky.progress) : -0.45 * Math.sin(Math.PI * sky.progress);
  return [-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
}

// The moon crosses the sky ahead of you, low enough to stay in view.
function moonDirection(env: Env): V3 {
  const { sky } = env;
  const p = sky.height >= 0 ? (sky.dawn ? 1 : 0) : sky.progress;
  const el = rad(8 + 9 * Math.sin(Math.PI * p));
  const h = norm([mix(0.42, -0.7, p), 0, -1]);
  return [h[0] * Math.cos(el), Math.sin(el), h[2] * Math.cos(el)];
}

export function atmosphereFor(env: Env, flash: number): Atmosphere {
  const { sky } = env;
  const day = sky.dayness;
  const night = 1 - day;
  const tw = sky.twilight * 0.92;
  const c = env.cloud;
  const over = c ** 1.4;
  const wet = Math.min(1, env.rain + env.snow * 0.4);

  let look = blend(blend(NIGHT, DAY, day), sky.dawn ? DAWN : DUSK, tw);

  // Overcast: the sky evens out to a soft blue-grey, and the land is lit from all sides.
  const dull = (col: Rgb, lift: number): Rgb => scale(grey(col, 0.72), lift);
  const brightness = mix(0.55, 1, day);
  look = {
    horizon: mix3(look.horizon, scale(dull(look.horizon, 1), 0.98), over * 0.9),
    mid: mix3(look.mid, mix3(dull(look.mid, 1.12), dull(look.horizon, 0.9), 0.5), over * 0.9),
    zenith: mix3(look.zenith, mix3(dull(look.zenith, 1.5), dull(look.horizon, 0.78), 0.6), over * 0.9),
    ambient: mix3(look.ambient, scale(add(look.ambient, scale(look.light, 0.42)), 0.92 * brightness + (1 - brightness) * 0.95), over),
    light: look.light,
    cloudLit: mix3(look.cloudLit, dull(look.cloudLit, 0.9), over * 0.8),
    cloudDark: mix3(look.cloudDark, dull(look.cloudDark, 0.95), over * 0.8),
  };

  // Rain and storm darken everything.
  // (The light begins to go before the rain comes, as its cloud climbs the sky.)
  const dim = 1 - 0.36 * wet - 0.14 * env.thunder - 0.1 * env.front;
  look.horizon = scale(look.horizon, dim);
  look.mid = scale(look.mid, dim);
  look.zenith = scale(look.zenith, dim);
  look.ambient = scale(look.ambient, 1 - 0.26 * wet);
  look.light = scale(look.light, 1 - 0.3 * wet);
  look.cloudLit = scale(look.cloudLit, 1 - 0.3 * wet);
  look.cloudDark = scale(look.cloudDark, 1 - 0.42 * wet);

  // A thin moon lights the land less than a full one.
  look.light = scale(look.light, 1 - night * 0.55 * (1 - sky.moonLit));
  // In the Earth's shadow the moon gives next to no light at all: the land
  // darkens, the sky deepens, and the stars come out as on a moonless night.
  const shadowed = night * (sky.eclipsed ?? 0);
  look.light = scale(look.light, 1 - 0.8 * shadowed);
  look.ambient = scale(look.ambient, 1 - 0.28 * shadowed);
  look.horizon = scale(look.horizon, 1 - 0.3 * shadowed);
  look.mid = scale(look.mid, 1 - 0.3 * shadowed);
  look.zenith = scale(look.zenith, 1 - 0.3 * shadowed);

  if (flash > 0) {
    look.ambient = add(look.ambient, scale([0.7, 0.75, 0.95], flash));
    look.zenith = add(look.zenith, scale([0.3, 0.33, 0.45], flash));
    look.mid = add(look.mid, scale([0.4, 0.43, 0.55], flash));
    look.horizon = add(look.horizon, scale([0.45, 0.48, 0.6], flash));
  }

  // ---- heat. A hot day under a high sun: the sky bleaches toward the horizon,
  // the light turns white and hard, and the distance goes pale with haze.
  const heat = smoothstep(24, 33, env.temp) * day * (1 - 0.55 * over) * (1 - wet);
  look.horizon = mix3(look.horizon, [1.0, 0.95, 0.84], 0.45 * heat);
  look.mid = mix3(look.mid, [0.84, 0.9, 0.94], 0.3 * heat);
  look.light = add(look.light, scale([0.17, 0.13, 0.04], heat));
  look.ambient = mix3(look.ambient, add(look.ambient, [0.07, 0.04, -0.03]), heat);

  // ---- smoke. Smoke from fires a long way off (or dust) hanging in the air:
  // the sky goes milky, and brownish toward the horizon; the light on the
  // ground is dimmer, warmer and flatter, with the shade filled in; and the
  // sun is a copper disc that can be looked at. Clean air changes nothing.
  const smoke = env.smoke;
  const stained = (col: Rgb, stain: Rgb, lift: number): Rgb => scale(stain, luma(col) * lift);
  look.horizon = mix3(look.horizon, stained(look.horizon, [1.12, 0.88, 0.62], 0.9), 0.85 * smoke);
  look.mid = mix3(look.mid, stained(look.mid, [1.07, 0.94, 0.76], 1.12), 0.65 * smoke);
  look.zenith = mix3(look.zenith, stained(look.zenith, [1.0, 0.97, 0.9], 1.15), 0.42 * smoke);
  look.light = mul(scale(look.light, 1 - 0.5 * smoke), mix3([1, 1, 1], [1.12, 0.8, 0.5], smoke));
  look.ambient = mul(scale(look.ambient, 1 + 0.1 * smoke), mix3([1, 1, 1], [1.1, 0.97, 0.8], smoke));
  look.cloudLit = mix3(look.cloudLit, stained(look.cloudLit, [1.06, 0.92, 0.74], 0.9), 0.6 * smoke);
  look.cloudDark = mix3(look.cloudDark, stained(look.cloudDark, [1.04, 0.95, 0.84], 1.0), 0.5 * smoke);

  // ---- where the light comes from ----
  const sunDir = sunDirection(env);
  const moonDir = moonDirection(env);
  const sunUp = smoothstep(0.03, 0.3, day);
  // LOW-SUN: while the sun stands low its light is warm and strong on whatever faces it, for as long as it
  // stays low: an hour at either end of a summer's day, most of a winter's. (The sky's own dawn colours
  // are a matter of the first hour only; this is the colour of the light.)
  const sunLow = (1 - smoothstep(rad(4.5), rad(15), Math.asin(Math.max(0, Math.min(1, sunDir[1]))))) * smoothstep(0.5, 1, day) * (1 - over) * (1 - wet);
  look.light = mix3(look.light, mul(scale(look.light, 1.14), [1.12, 0.9, 0.64]), sunLow * 0.7);
  look.cloudLit = mix3(look.cloudLit, mul(look.cloudLit, [1.0, 0.93, 0.8]), sunLow * 0.6);
  // Keep it a little above the horizon so nothing is lit from below.
  const lowSun = norm([sunDir[0], Math.max(sunDir[1], 0.1), sunDir[2]]);
  const lightDir = norm([mix(moonDir[0], lowSun[0], sunUp), mix(moonDir[1], lowSun[1], sunUp), mix(moonDir[2], lowSun[2], sunUp)]);

  // ---- air ----
  const fogDensity = 0.00026 + 0.0008 * c * c + 0.004 * wet + 0.034 * env.fog ** 1.7 + 0.0011 * heat + 0.0012 * smoke;
  // Distance turns the hills the blue of the lower sky; fog and rain turn them grey.
  const fogCol = mix3(mix3(look.horizon, look.mid, 0.32), grey(look.horizon, 0.5), Math.min(1, env.fog + wet * 0.5));

  // ---- grass: greenest in midsummer, straw-coloured in winter, pale under frost ----
  const wintry = (1 - sky.summer) * 0.4;
  const frost = smoothstep(1, -4, env.temp) * 0.45;
  const frosted: Rgb = [0.62, 0.74, 0.72];
  // (In a heatwave it dries and yellows.)
  const grassLush = mix3(mix3(mix3([0.33, 0.62, 0.2], [0.5, 0.58, 0.22], wintry), [0.58, 0.6, 0.22], 0.55 * heat), frosted, frost);
  const grassDry = mix3(mix3(mix3([0.6, 0.66, 0.24], [0.72, 0.62, 0.3], wintry), [0.84, 0.72, 0.32], 0.6 * heat), frosted, frost);
  const grassLight = mix3(mix3([0.8, 0.9, 0.42], [0.9, 0.82, 0.5], wintry), [0.9, 0.96, 0.92], frost);

  // ---- sea ----
  const skyOnWater = mix3(look.horizon, look.mid, 0.4);
  const seaDeep = mul([0.14, 0.4, 0.62], add(scale(look.ambient, 1.45), scale(look.light, 0.3)));
  const seaPale = mix3(seaDeep, skyOnWater, 0.72);
  const whiteLight = add(scale(look.ambient, 1.05), scale(look.light, 0.75));

  // ---- text ----
  const above = mix3(look.zenith, mix3(look.cloudDark, look.cloudLit, 0.6), c * 0.8);
  const bright = smoothstep(0.47, 0.55, luma(above));

  const glowFade = smoothstep(-0.3, 0.05, sky.height) * (1 - 0.85 * over) * (1 - wet);
  return {
    sunDir,
    moonDir,
    sunLow,
    lightDir,
    lightCol: look.light,
    ambient: look.ambient,
    horizon: look.horizon,
    skyMid: look.mid,
    zenith: look.zenith,
    fogCol,
    fogDensity,
    cloudFog: smoothstep(0.5, 0.95, c) * 0.96,
    // A thin fog (a thick one hides the cliff altogether), or low cloud lying still on the tops, spills off the rim.
    spill: Math.min(1, smoothstep(0.05, 0.28, env.fog) * (1 - 0.7 * smoothstep(0.5, 0.9, env.fog)) + 0.8 * smoothstep(0.78, 0.97, env.cloudLow) * (1 - smoothstep(0.3, 0.65, Math.hypot(env.windX, env.windZ)))),
    hazeFalloff: Math.max(0.45, Math.min(24, 0.0066 / fogDensity)),
    heat,
    cloudLit: look.cloudLit,
    cloudDark: look.cloudDark,
    cloudGlow: [...(sky.dawn ? ([1.0, 0.64, 0.56] as Rgb) : ([1.0, 0.5, 0.3] as Rgb)), tw * glowFade],
    // Rain, broken cloud, and a sun that is up but lower than 42 degrees.
    bow:
      smoothstep(0.04, 0.25, env.rain) *
      (1 - smoothstep(0.72, 0.97, c)) *
      smoothstep(0.03, 0.16, sunDir[1]) *
      (1 - smoothstep(0.56, 0.67, sunDir[1])),
    sunGlow: scale(mix3(mix3([1.0, 0.95, 0.8], [1.0, 0.55, 0.25], tw), [1.0, 0.48, 0.18], smoke), (0.3 + 0.7 * tw + 0.5 * heat) * glowFade * (1 - 0.8 * smoke)),
    sunDisc: mix3(mix3([1.0, 1.0, 0.92], [1.0, 0.8, 0.5], tw), [0.95, 0.36, 0.12], smoke),
    stars: night * night * (1 - c) ** 1.3 * (1 - env.fog * 0.85) * (1 - 0.6 * smoke) * (1 + 0.3 * shadowed),
    moonVisible: smoothstep(0.35, 0.8, night) * (1 - 0.85 * c * c) * (1 - 0.8 * env.fog) * (1 - 0.3 * smoke),
    lamp: smoothstep(0.25, 0.8, night + over * 0.25 + wet * 0.2),
    grassLush,
    grassDry,
    grassLight,
    seaDeep,
    seaPale,
    glint: [Math.min(1, whiteLight[0] * 1.25), Math.min(1, whiteLight[1] * 1.25), Math.min(1, whiteLight[2] * 1.25)],
    foam: whiteLight,
    ink: mix3([0.95, 0.97, 1.0], [0.07, 0.1, 0.16], bright),
    halo: mix3([0.0, 0.01, 0.04], [1, 1, 1], bright),
  };
}
