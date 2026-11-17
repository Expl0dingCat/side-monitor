// Out on the bay in the rowing boat: where she lies, and the swell that moves her.
//
// From the meadow and the beach the open sea is a level sheet with its waves
// drawn on it, which is right for water seen from far off. Sitting in a boat it
// is not: the water round you has height, it lifts the boat and lets her down,
// and a crest between you and the horizon hides what is behind it. So the sea
// near the boat is a piece of its own, finely meshed, that really rises and
// falls; and the same sum that raises it is done here as well, so that the
// boat, her float and the water all move as one.
//
// The swell is five of the sea's own wave trains (the same lengths, bearings
// and timing as the marks drawn on the level sea, so crest falls on crest),
// each given a real height. How big they run follows the sea itself: a hand's
// breadth in a calm, a foot or two in a breeze.

import { noiseR } from './gl';
import { BEACH, FACING } from './land';

/** Where the boat lies when she is out: a good way off the beach, out the way you face from it, clear of the rocks and the cliff's foot. */
export const SKIFF_SPOT: [number, number] = [BEACH.x + Math.sin(FACING) * 128, BEACH.z - Math.cos(FACING) * 128];

/** The boat's shape: half her length; and, at a place along her from stern (-1) to bow (1), half her breadth at the gunwale, how high her gunwale stands, and how deep her keel lies (metres from where the water meets her). */
export const HULL = { half: 2.62 };
export const beamAt = (s: number) => 0.8 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), 2.3)), 0.6);
export const sheerAt = (s: number) => 0.4 + 0.36 * Math.pow(Math.abs(s), 2.4);
export const keelAt = (s: number) => -0.2 + 0.22 * Math.pow(Math.abs(s), 3.5);

/**
 * For the sea's shader: whether a place is inside her, so that no water is drawn there (the sea has no
 * notion of a boat; left alone, a passing crest would show through her bottom boards). She is given as
 * where her middle is and the ways her starboard, up and bow point.
 */
export const IN_BOAT = `
uniform vec4 uHullAt;                 // the boat in the water: where her middle is, and 1 if there is one (0 if not)
uniform vec3 uHullX, uHullY, uHullZ;  // the ways her own starboard, up and bow point
bool inBoat(vec3 w) {
  if (uHullAt.w < 0.5) return false;
  vec3 d = w - uHullAt.xyz;
  if (dot(d, d) > 9.0) return false;
  vec3 l = vec3(dot(d, uHullX), dot(d, uHullY), dot(d, uHullZ));
  float s = abs(l.z) / ${(2.62).toFixed(2)};
  if (s >= 1.0) return false;
  float keel = -0.2 + 0.22 * pow(s, 3.5);
  float sheer = 0.4 + 0.36 * pow(s, 2.4);
  if (l.y <= keel || l.y >= sheer + 0.05) return false;
  float u = pow(min((l.y - keel) / (sheer - keel), 1.0), 1.0 / 1.3);
  float beam = 0.8 * pow(max(0.0, 1.0 - pow(s, 2.3)), 0.6);
  return abs(l.x) < beam * pow(u, 0.6) - 0.014;
}
`;

/** The trains: how long each wave is (metres), the bearing it runs on, how high it stands at full sea (metres, as a half-height), and which of the sea's eight phases is its own. */
const TRAINS: { len: number; ang: number; amp: number; phase: number }[] = [
  { len: 47, ang: 1.25, amp: 0.17, phase: 2 },
  { len: 29, ang: 1.62, amp: 0.15, phase: 3 },
  { len: 17, ang: 0.95, amp: 0.1, phase: 4 },
  { len: 9, ang: 1.9, amp: 0.075, phase: 5 },
  { len: 5.3, ang: 1.45, amp: 0.042, phase: 6 },
];
/** All their half-heights together: the sea's mean rise where the swell runs full. */
export const SWELL_MEAN = TRAINS.reduce((sum, t) => sum + t.amp, 0);
/** The swell is only there near the boat: full within this many metres of her, gone by that many. */
const NEAR = 70;
const GONE = 112;

const smooth = (a: number, b: number, x: number) => {
  const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

/**
 * How far the sea stands above its level at a place near the boat, and how it slopes there (per metre,
 * toward +x and toward +z). `waves` is the eight phases the sea is drawn with; `sea` how big it runs, 0..1 and over.
 */
export function swellAt(x: number, z: number, waves: number[], sea: number): { rise: number; dx: number; dz: number } {
  const fade = 1 - smooth(NEAR, GONE, Math.hypot(x - SKIFF_SPOT[0], z - SKIFF_SPOT[1]));
  let rise = 0;
  let dx = 0;
  let dz = 0;
  for (const t of TRAINS) {
    const k = (Math.PI * 2) / t.len;
    const cx = Math.cos(t.ang);
    const cz = Math.sin(t.ang);
    const th = (cx * x + cz * z) * k - waves[t.phase];
    rise += t.amp * (1 + Math.cos(th));
    dx -= t.amp * k * Math.sin(th) * cx;
    dz -= t.amp * k * Math.sin(th) * cz;
  }
  const much = sea * fade;
  return { rise: rise * much, dx: dx * much, dz: dz * much };
}

/** The same sum, for the shaders that draw the sea. (They declare the sea's phases, uWaveA and uWaveB, themselves.) */
export const SWELL = `
uniform vec4 uAfloat; // out in the boat: where she lies (x, z), and how big the swell runs there (0 when you are not out)
const float SW_LEN[5] = float[5](${TRAINS.map((t) => t.len.toFixed(1)).join(', ')});
const float SW_ANG[5] = float[5](${TRAINS.map((t) => t.ang.toFixed(3)).join(', ')});
const float SW_AMP[5] = float[5](${TRAINS.map((t) => t.amp.toFixed(3)).join(', ')});
const float SW_MEAN = ${SWELL_MEAN.toFixed(3)};
float swellFade(vec2 p) { return 1.0 - smoothstep(${NEAR.toFixed(1)}, ${GONE.toFixed(1)}, distance(p, uAfloat.xy)); }
// How far the sea stands above its level there (x), and how it slopes (y toward +x, z toward +z).
vec3 openSwell(vec2 p) {
  float phase[5] = float[5](uWaveA[2], uWaveA[3], uWaveB[0], uWaveB[1], uWaveB[2]);
  vec3 s = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    float k = 6.2831853 / SW_LEN[i];
    vec2 dir = vec2(cos(SW_ANG[i]), sin(SW_ANG[i]));
    float th = dot(dir, p) * k - phase[i];
    s.x += SW_AMP[i] * (1.0 + cos(th));
    s.yz -= SW_AMP[i] * k * sin(th) * dir;
  }
  return s * (uAfloat.z * swellFade(p));
}
`;

/**
 * The piece of sea round the boat that rises and falls: a fan of rings about her, close together near
 * her and wider apart far off, covering only the side you look out on (you sit facing the bow, and the
 * picture is wider than the window, so a good deal to either hand). Two numbers a corner: x, z.
 */
export function buildBoatSea(): Float32Array {
  const out: number[] = [];
  const SPREAD = 1.72; // radians either side of the way you face (you can turn your head a good way to either hand)
  const SECTORS = 150;
  const rings: number[] = [];
  for (let r = 0.35; r < GONE + 6; r *= 1.075) rings.push(r);
  // (You sit aft of her middle, so the fan is struck from there: nothing of it lies behind you.)
  const cx = SKIFF_SPOT[0] - Math.sin(FACING) * 1.6;
  const cz = SKIFF_SPOT[1] + Math.cos(FACING) * 1.6;
  const at = (r: number, a: number): [number, number] => [cx + Math.sin(FACING + a) * r, cz - Math.cos(FACING + a) * r];
  for (let j = 0; j + 1 < rings.length; j++) {
    for (let i = 0; i < SECTORS; i++) {
      const a0 = -SPREAD + (i / SECTORS) * 2 * SPREAD;
      const a1 = -SPREAD + ((i + 1) / SECTORS) * 2 * SPREAD;
      const p = at(rings[j], a0);
      const q = at(rings[j + 1], a0);
      const r = at(rings[j + 1], a1);
      const s = at(rings[j], a1);
      out.push(...p, ...q, ...r, ...p, ...r, ...s);
    }
  }
  return new Float32Array(out);
}

// ---- off the beach ------------------------------------------------------------------
// The waves that come in to the beach are another sum (seaRise, in the shaders): two waves always on
// their way, standing up as the bottom rises under them and breaking. A boat lying at her mooring in
// the shallows rides those, so the same sum is done here too, with the same numbers.

const LANDS = 0.6;
const surfHeight = (size: number) => 0.1 + 0.5 * size + 1.05 * size * size * size;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * How far the sea stands above its level at a place off the beach as those waves pass. `combers` is what
 * each of the two waves is like (four numbers each: see COMBERS in the shaders). `life` is how far
 * through its life the first wave is (0..1), `size` how big they run, `edge` how far in front of where
 * you stand on the beach the water's edge lies just now (the tide moves it).
 */
export function surfRise(x: number, z: number, life0: number, size0: number, edge: number, combers: number[] = [1, 0, 0.1, 0, 0.76, 0, 0.47, 0]): number {
  const ax = Math.sin(FACING);
  const az = -Math.cos(FACING);
  const rx = x - BEACH.x;
  const rz = z - BEACH.z;
  const out = rx * ax + rz * az - edge;
  const along = rx * -az + rz * ax;
  const span = 1 - smooth(0.75, 1.3, Math.abs(along) / BEACH.r);
  if (span <= 0 || out < -1 || out > 24) return 0;
  let rise = 0;
  for (let k = 0; k < 2; k++) {
    const life = (((life0 + 0.5 * k) % 1) + 1) % 1;
    if (life >= LANDS) continue;
    // (COMBERS: each wave has its own size, slant, wavering and peak; the same sum as crestLag and crestTall in the shaders.)
    const [big, slant, own, peak] = combers.slice(k * 4, k * 4 + 4);
    const from = (along - peak) / (0.6 * BEACH.r);
    const size = size0 * big * (0.66 + 0.5 * Math.exp(-from * from));
    const lag = along * along * 0.011 + slant * along + (noiseR(along * 0.019 + own, 0.61) - 0.5) * 3.2 + (noiseR(along * 0.067 + own * 3, 0.27) - 0.5) * 0.9;
    const at = 17 * Math.pow(Math.max(1 - life / LANDS, 0), 1.2);
    const off = out - at - lag * (0.2 + at / 17);
    const tall = 1 - smooth(9, 17, at);
    const broke = 1 - smooth(2.2 + 3.5 * size, 4.2 + 5.5 * size, at);
    const front = mix(1.5, 0.38 + 0.55 * size * size, tall * (1 - broke));
    const back = mix(2.4, 1.5 + 0.9 * size, tall);
    const ahead = off + 2.3 * front;
    const shape = (off < 0 ? Math.exp(-(off * off) / (front * front)) : Math.exp(-(off * off) / (back * back))) - 0.24 * (1 - broke) * Math.exp(-(ahead * ahead) / (1.6 * front * front));
    rise += surfHeight(size) * tall * (0.3 + 0.7 * (1 - 0.7 * broke)) * shape * smooth(0, 1.5, at);
  }
  return rise * span;
}
