// GLSL shared by the grass, the ground and the things standing on it: how
// thickly hoarfrost lies at a spot, how heavy the dew is, and what a crystal
// or a bead looks like with the sun in it. (It goes in with the shaders'
// common code, after the fire's thaw, which it leans on.)

export const RIME = `
// Hoarfrost and dew. Both lie thickest where no sun has reached, and go first
// where it has: so each asks how much of the sun arrives at a spot.
uniform vec4 uRime; // frost: how thick it is in the shade (0..1), how far the sun has taken it off where it reaches (0..1), how brightly it glints (0..1), and a slow clock (wraps 0..1)
uniform vec4 uDew;  // dew: how heavy it is in the shade (0..1), how far the sun has dried it where it reaches (0..1), how brightly its beads shine (0..1), and a spare

// Frost is a blue-white a tone under snow, so the two can be told apart. It
// lies longest in the shade, where only the blue of the sky lights it, and that
// alone would paint it a deep blue; to the eye it is paler than that. So its
// colour leans half way against the sky's.
vec3 rimeCol() {
  float grey = dot(uAmbient, vec3(0.3, 0.55, 0.15));
  return vec3(0.79, 0.88, 0.95) * mix(vec3(1.0), grey / max(uAmbient, vec3(0.04)), 0.5) * 1.1;
}

// How well the sun gets to a spot, from the share of its light that arrives
// there (0 in a cast shadow or on a face turned away). A passing cloud's shadow
// is not counted: frost that has gone does not come back under a cloud.
float sunReach(float share) {
  return smoothstep(0.2, 0.45, share);
}

// The share of sunlight a face gets by the plain rule, for where no light has been traced.
float sunShare(vec3 N) {
  return 0.2 + 0.8 * smoothstep(-0.15, 0.45, dot(N, uLightDir));
}

// How warm the fire keeps the ground: neither frost nor dew lies near it while it burns, nor for a while after.
float byTheFire(vec2 xz) {
  float away = length(xz - uHearth.xz) / (1.4 + 4.2 * uMelt);
  return (1.0 - smoothstep(0.5, 1.0, away)) * smoothstep(0.0, 0.12, uMelt);
}

// How thickly frost lies at a spot the sun reaches this well, 0..1.
float rimeAt(vec2 xz, float reach) {
  return uRime.x * (1.0 - uRime.y * reach) * (1.0 - byTheFire(xz));
}

// How heavy the dew is at a spot the sun reaches this well, 0..1.
float dewAt(vec2 xz, float reach) {
  return uDew.x * (1.0 - uDew.y * reach) * (1.0 - byTheFire(xz));
}

// A crystal of frost or a bead of dew with light in it (sun is how much of the
// sun falls on it, 0..1): the colour of the light itself, paled, and never past white.
vec3 sparkle(float sun) {
  vec3 c = uAmbient * 1.25 + uLightCol * (1.5 * sun);
  c /= max(1.0, max(c.r, max(c.g, c.b)));
  return mix(c, vec3(1.0), 0.3 * sun) * 0.98;
}

// One glint among many, coming and going slowly and each to its own beat
// (own is a number that is that glint's alone, 0..1). It is dark for half its
// time, and brightens and fades in three steps, each held a second or more.
float slowGlint(float own) {
  float turn = fract(own * 57.3 + uRime.w * (1.0 + floor(own * 2.99)));
  float swell = 1.0 - abs(turn * 2.0 - 1.0);
  return floor(smoothstep(0.35, 0.9, swell) * 3.0 + 0.5) / 3.0;
}
`;
