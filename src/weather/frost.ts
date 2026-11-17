// Hoarfrost and dew: what a cold or a damp night leaves on the grass, and how
// the morning takes it away again. Both are worked out from the air alone (how
// cold, how cloudy, how windy, how near its dew point) and from where the sun
// is, with nothing remembered: the same weather at the same hour always gives
// the same morning, however often the page is opened.

import { smoothstep, type Env } from './env';

export interface Rime {
  /** How thickly the place is rimed where no sun has reached it, 0..1. */
  frost: number;
  /** How far the sun has taken the frost off the places it reaches, 0..1. */
  burnt: number;
  /** How brightly the frost glints: only while the sun is low. 0..1. */
  glint: number;
  /** How heavy the dew is where no sun has reached it, 0..1. */
  dew: number;
  /** How far the sun has dried the dew off the places it reaches, 0..1. */
  dried: number;
  /** How brightly the beads of dew catch the light, 0..1. */
  shine: number;
}

/** The frost and the dew just now. `snowCover` is how much of the ground lying snow hides, 0..1. */
export function rimeFor(env: Env, snowCover: number): Rime {
  const { sky } = env;
  const wind = Math.hypot(env.windX, env.windZ);
  const night = sky.height < 0;
  const morning = !night && sky.progress < 0.5;
  const up = Math.max(0, sky.height);
  // A clear sky lets the ground lose its heat to the night, and still air lets the cold settle on it.
  const clear = 1 - 0.65 * smoothstep(0.3, 0.95, env.cloud);
  const dry = 1 - smoothstep(0.03, 0.3, env.rain);
  // Snow that is lying hides them both; a trace of it does not.
  const bare = 1 - smoothstep(0.12, 0.6, snowCover);
  const low = smoothstep(0, 0.05, up) * (1 - smoothstep(0.3, 0.6, up));
  const veiled = 1 - 0.9 * smoothstep(0.3, 0.9, env.cloud);

  // ---- hoarfrost: below freezing, and gone once the air is a degree or two above it.
  const freezing = smoothstep(1.6, -1.2, env.temp);
  const still = 1 - 0.65 * smoothstep(0.1, 0.5, wind);
  // (Freezing fog rimes everything, whatever the sky above it is doing.)
  const made = Math.min(1, 0.25 + 0.75 * clear * still + 0.5 * env.fog);
  // It grows all night and is thickest at dawn. By day the shade keeps most of
  // a hard frost and little of a light one, and it begins again as the sun goes.
  const hard = smoothstep(-0.5, -5.5, env.temp);
  const held = 0.3 + 0.55 * hard;
  const atDusk = Math.max(0.4, held);
  const through = night
    ? atDusk + (1 - atDusk) * smoothstep(0, 0.7, sky.progress)
    : morning
      ? 1 - (1 - held) * smoothstep(0.03, 0.42, sky.progress)
      : held + (atDusk - held) * smoothstep(0.7, 1, sky.progress);
  // Where the sun reaches, it is gone within an hour or so of sunrise (later
  // under cloud, and never quite in a bitter cold), and comes back only at sunset.
  const sunStrength = (1 - 0.85 * smoothstep(0.55, 1, env.cloud)) * (1 - 0.3 * smoothstep(-6, -14, env.temp));
  const burnt = night ? 0 : (morning ? smoothstep(0.04, 0.42, up) : smoothstep(0, 0.14, up)) * sunStrength;

  // ---- dew: a mild, still night with the air near its dew point. It settles
  // through the small hours, beads the grass at sunrise, and is gone by mid-morning.
  const damp = smoothstep(3.2, 0.8, env.temp - env.dewPoint);
  const mild = smoothstep(0.8, 3, env.temp); // colder than that and it comes as frost
  const calm = 1 - smoothstep(0.08, 0.3, wind);
  const settled = night ? smoothstep(0.3, 0.85, sky.progress) : morning ? 1 - smoothstep(0.25, 0.8, up) : 0;

  return {
    frost: freezing * made * through * bare * dry,
    burnt,
    glint: low * veiled,
    dew: damp * mild * calm * (0.35 + 0.65 * clear) * settled * bare * dry,
    dried: morning ? smoothstep(0.08, 0.45, up) : 0,
    shine: smoothstep(0, 0.04, up) * veiled,
  };
}
