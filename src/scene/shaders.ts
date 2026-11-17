// GLSL for the landscape, drawn as pixel art.
//
// The scene is rendered small and scaled up with hard pixels. To keep it
// reading as pixel art rather than a blurry 3D render:
//   - light arrives in a few flat steps, never a smooth gradient;
//   - colours come in distinct patches (three kinds of grass, two of rock);
//   - gradients that must exist (sky, fog) are stippled with an ordered dither;
//   - a final pass draws dark outlines round objects and white foam on shores.
//
// The alpha channel is not transparency: it labels what each pixel is, for
// that final pass.

import { COVER_ROUND, EARTH_SHADOW, HALO, SHOWER_CLOUD } from './skyParts';

import { RIME } from './rime';
import { IN_BOAT, SWELL } from './afloat';
import { RAY_MESH } from './rays';

export const HEAD = `#version 300 es
precision highp float;
// smoothstep that falls from 1 to 0 as x goes from lo up to hi
#define rstep(hi, lo, x) (1.0 - smoothstep(lo, hi, x))

#define IS_SKY 0.0
#define IS_SEA 0.2
#define IS_LAND 0.4
#define IS_WATERFALL 0.6
#define IS_OBJECT 1.0

// Ordered-dither threshold for this pixel, 0..1.
float bayer(vec2 fc) {
  const float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  ivec2 p = ivec2(fc) & 3;
  return (m[p.x + p.y * 4] + 0.5) / 16.0;
}

// Snap v (0..1) to a few flat steps, stippling between neighbouring steps.
float stepped(float v, float steps, vec2 fc) {
  return clamp(floor(v * steps + bayer(fc)) / steps, 0.0, 1.0);
}
`;

const THAW = `
// Where the snow is gone: 0 where it lies as deep as anywhere, 1 where there is
// none. The fire melts a ring of bare ground that widens the longer it burns
// and closes slowly once it is out; and the fire place itself (the pit, the row
// of logs, the cairn) is kept swept, so it can be found and used however deep
// the snow lies.
uniform vec3 uHearth;  // where the fire is
uniform float uMelt;   // how warm the ground round it is, 0..1
uniform vec4 uWarm[8]; // the small flames (each lantern by the path, and the storm lantern): where each is, and how far its warmth keeps the snow off (0 for none)
float thaw(vec2 xz) {
  vec2 d = xz - uHearth.xz;
  float bare = 1.0 - smoothstep(0.45, 1.0, length(d) / (1.1 + 2.5 * uMelt));
  vec2 a = vec2(-2.8, 0.3);
  vec2 ab = vec2(3.8, -1.2) - a;
  float along = clamp(dot(d - a, ab) / dot(ab, ab), 0.0, 1.0);
  float swept = 1.0 - smoothstep(0.75, 1.3, length(d - a - ab * along));
  float gone = max(bare, 0.9 * swept);
  // A lantern keeps a small ring of ground clear round its foot: wider for a full
  // candle than for one burned low, and never quite a neat circle.
  for (int i = 0; i < 8; i++) {
    float reach = uWarm[i].w;
    if (reach <= 0.0) continue;
    vec2 off = xz - uWarm[i].xz;
    float ragged = 1.0 + 0.22 * sin(atan(off.y, off.x) * 3.0 + float(i) * 1.7) + 0.1 * sin(atan(off.y, off.x) * 7.0 + float(i));
    gone = max(gone, 1.0 - smoothstep(0.5, 1.0, length(off) / (reach * ragged)));
  }
  return gone;
}
`;

export const COMMON = `
uniform mat4 uViewProj;
uniform vec3 uCam;
uniform vec3 uLightDir;
uniform vec3 uLightCol;
uniform vec3 uAmbient;
uniform vec3 uFogCol;
uniform float uFogDensity;
uniform float uCloudFog;
uniform sampler2D uNoise;
uniform vec2 uScrollA;   // broad gusts
uniform vec2 uScrollB;   // fine gusts
uniform vec2 uScrollC;   // cloud shadows
uniform vec2 uWindDir;
uniform float uWindAmt;
uniform float uCloud;
uniform float uSnow;
uniform float uWet;
uniform vec3 uGrassLush;
uniform vec3 uGrassDry;
uniform vec3 uGrassLight;
uniform vec3 uLampPos[4];
uniform float uLampOn;
uniform vec4 uLampLit;     // how brightly each of those lanterns burns, 0..1: a household puts its lantern out when it goes to bed
uniform vec3 uFirePos;
uniform float uFireGlow;
uniform sampler2D uTraceA; // traced light: how much of the sky's light arrives, bounces and all (rgb), and how much of the sun's straight (a)
uniform sampler2D uTraceB; // traced light: how much of the sun's light arrives by bouncing (rgb), and of the door lanterns' (a)
uniform sampler2D uTraceC; // traced light: how much of the fire's light arrives (rgb), and of the path lanterns' (a)
uniform float uTraced;     // 0 = lit by formula, 1 = lit by the traced result
uniform vec4 uShore;       // the beach: where you stand on it (x, z) and the way you face from there (x, z)
uniform vec4 uSurf;        // the surf: how far through its life the first wave is (0..1), how big the waves are (0..1), how far in front of you the water's edge is, and how far the beach reaches
uniform vec4 uTaskLamp[8]; // the lanterns by the path, and last the storm lantern on its post: where the flame of each is, and how brightly it burns (0 if it is unlit or not there)
uniform float uSeaGlow;    // the sea glowing where it is stirred, on a dark warm night: 0 for none, 1 for a good night of it
uniform vec3 uTide;        // the tide: how far the sea stands above its mean level just now (metres), the level the last high water reached, and how wet that has left the stones above the water (1 fresh, drying toward 0)

// The light of that glow: a cold blue-green, dim where the water is only moved and bright where it is churned.
vec3 seaGlow(float stirred) {
  return uSeaGlow * mix(vec3(0.0, 0.13, 0.22), vec3(0.06, 0.56, 0.74), clamp(stirred, 0.0, 1.0));
}

const vec3 SNOW = vec3(0.96, 1.0, 1.06);

// A place measured from the water's edge on the beach: x is metres out to sea
// (negative up the beach), y metres along the shore.
vec2 fromShore(vec2 xz) {
  vec2 rel = xz - uShore.xy;
  return vec2(dot(rel, uShore.zw) - uSurf.z, dot(rel, vec2(-uShore.w, uShore.z)));
}

// Two waves are always on their way in, half a life apart, the second smaller.
// A wave spends the first part of its life coming in, reaches the water's edge
// at LANDS, runs up the beach quickly, and drains back slowly for the rest.
const float LANDS = 0.6;
// COMBERS. No two waves are alike. Each of the two has a size of its own (they come in sets: a few big
// ones together, then smaller), comes in a little aslant in its own way, wavers along its length in its
// own way, and has a peak of its own somewhere along the beach: there it stands tallest and breaks
// first, and the break runs away from there along the crest to either side.
uniform vec4 uComber[2]; // for each wave: its size against the sea's (x), how far aslant it lies (metres further out for each metre along the shore, y), a number of its own (z), and where along the shore its peak is (metres, w)
float waveLife(int k) { return fract(uSurf.x + 0.5 * float(k)); }
float waveSize(int k) { return uSurf.y * uComber[k].x; }
// How far behind its own middle a wave's crest is at a place along the shore (metres): its ends lag,
// it lies aslant, and it wavers.
float crestLag(float along, int k) {
  return along * along * 0.011 + uComber[k].y * along
    + (textureLod(uNoise, vec2(along * 0.019 + uComber[k].z, 0.61), 0.0).r - 0.5) * 3.2
    + (textureLod(uNoise, vec2(along * 0.067 + uComber[k].z * 3.0, 0.27), 0.0).r - 0.5) * 0.9;
}
// How tall it stands there, against its size: tallest at its peak, lower on its shoulders.
float crestTall(float along, int k) {
  float from = (along - uComber[k].w) / (0.6 * uSurf.w);
  return 0.66 + 0.5 * exp(-from * from);
}
// How tall a wave of a given size stands just before it breaks, in metres: a
// hand's breadth in a calm, knee high in a breeze, over your head in a gale.
float surfHeight(float size) { return 0.1 + 0.5 * size + 1.05 * size * size * size; }
// How far wave k's crest has gone past a place off the beach (above 0 once it
// has passed, below while it has yet to arrive), in metres; and how hard that
// wave strikes there, 0 to 1 and a little more.
vec2 crestPast(vec2 sv, int k) {
  float life = waveLife(k);
  if (life >= LANDS) return vec2(-99.0, 0.0);
  float at = 17.0 * pow(max(1.0 - life / LANDS, 0.0), 1.2);
  return vec2(sv.x - at - crestLag(sv.y, k) * (0.2 + at / 17.0), waveSize(k) * crestTall(sv.y, k) * (1.0 - smoothstep(9.0, 17.0, at)));
}
// How far up the beach a wave's water has run just now, 0..1.
float runUp(float life) {
  return smoothstep(LANDS - 0.02, LANDS + 0.1, life) * (1.0 - smoothstep(LANDS + 0.12, 1.0, life));
}
// How far the sea stands above its own level at a place off the beach, as those
// waves pass: a long low swell far out, standing up taller and steeper in front
// as the bottom rises under it, and falling to a low bore once it has broken.
float seaRise(vec2 xz) {
  vec2 sv = fromShore(xz);
  float span = 1.0 - smoothstep(0.75, 1.3, abs(sv.y) / uSurf.w);
  if (span <= 0.0 || sv.x < -1.0 || sv.x > 24.0) return 0.0;
  float rise = 0.0;
  for (int k = 0; k < 2; k++) {
    float life = waveLife(k);
    if (life >= LANDS) continue;
    float size = waveSize(k) * crestTall(sv.y, k);
    float at = 17.0 * pow(max(1.0 - life / LANDS, 0.0), 1.2);
    float off = sv.x - at - crestLag(sv.y, k) * (0.2 + at / 17.0);
    float tall = 1.0 - smoothstep(9.0, 17.0, at);
    float broke = 1.0 - smoothstep(2.2 + 3.5 * size, 4.2 + 5.5 * size, at);
    // (A big wave is broader as well as taller: its face is never a wall.)
    float front = mix(1.5, 0.38 + 0.55 * size * size, tall * (1.0 - broke)); // metres from crest to foot on the shoreward side
    float back = mix(2.4, 1.5 + 0.9 * size, tall);
    float shape = off < 0.0 ? exp(-(off * off) / (front * front)) : exp(-(off * off) / (back * back));
    // (The water is drawn down in front of a wave that is standing up: there is a trough before its face.)
    float ahead = off + 2.3 * front;
    shape -= 0.24 * (1.0 - broke) * exp(-(ahead * ahead) / (1.6 * front * front));
    rise += surfHeight(size) * tall * (0.3 + 0.7 * (1.0 - 0.7 * broke)) * shape * smoothstep(0.0, 1.5, at);
  }
  return rise * span;
}
${THAW}

// Gusts: fronts of wind crossing the hillside. 0..1.
float gust(vec2 xz) {
  float g = texture(uNoise, xz * 0.0045 + uScrollA).r * 0.62 + texture(uNoise, xz * 0.019 + uScrollB).g * 0.38;
  return smoothstep(0.28, 0.74, g);
}

// Whether a gust is passing here: it shows as a pale band in the grass.
float gustBand(vec2 xz) {
  return step(0.63 - 0.12 * uWindAmt, gust(xz)) * (0.3 + 0.6 * uWindAmt);
}

// 1 in sunlight, 0 under a cloud. The share in shadow follows the cloud cover.
float sunShade(vec2 xz) {
  float n = texture(uNoise, xz * 0.0013 + uScrollC).b;
  float th = 0.1 + 0.8 * uCloud;
  return smoothstep(th - 0.11, th + 0.11, n); // a soft edge
}

// Light arrives in eight fine steps, stippled into one another (grain is a
// dither value, 0..1), so it reads as a gradual change, not as bands.
float lightLevel(vec2 xz, vec3 N, float grain) {
  float facing = smoothstep(-0.15, 0.45, dot(N, uLightDir));
  return floor(sunShade(xz) * (0.2 + 0.8 * facing) * 8.0 + grain) / 8.0;
}

// The light the lanterns by the path throw on the ground about them, 0..1:
// a small pool round each, which is all a candle behind glass can do.
float lanternPool(vec2 xz) {
  float pool = 0.0;
  for (int i = 0; i < 8; i++) {
    vec2 d = xz - uTaskLamp[i].xz;
    float l = clamp(1.0 - sqrt(dot(d, d) + 0.3) / 3.3, 0.0, 1.0);
    pool += l * l * uTaskLamp[i].w;
  }
  return min(pool, 1.0);
}

// How brightly the lantern nearest a place is burning.
float lanternAt(vec2 xz) {
  float nearest = 1.0e9;
  float lit = 0.0;
  for (int i = 0; i < 4; i++) {
    float d = distance(xz, uLampPos[i].xz);
    if (d < nearest) {
      nearest = d;
      lit = uLampLit[i];
    }
  }
  return lit;
}

// Warm light from the lanterns by the doors, falling off in steps.
// Warm light from the lanterns by the doors and from the campfire. It thins
// smoothly with distance, in many fine steps that are stippled into one
// another (grain is a dither value, 0..1), so there is no hard edge to it.
vec3 warmLight(vec3 wpos, float grain) {
  vec3 warm = vec3(0.0);
  if (uLampOn > 0.02) {
    float nearest = 0.0;
    for (int i = 0; i < 4; i++) nearest = max(nearest, uLampLit[i] * (1.0 - distance(wpos, uLampPos[i]) / 7.5));
    float l = clamp(nearest, 0.0, 1.0);
    warm += vec3(1.0, 0.58, 0.22) * (floor(l * l * 8.0 + grain) / 8.0) * uLampOn;
  }
  if (uFireGlow > 0.01) {
    // The fire reaches further the higher it burns, and its light reddens as it fades.
    float f = clamp(1.0 - distance(wpos, uFirePos) / (2.6 + 7.5 * uFireGlow), 0.0, 1.0);
    float q = floor(f * f * 14.0 + grain) / 14.0;
    warm += mix(vec3(0.92, 0.3, 0.09), vec3(1.0, 0.68, 0.3), q) * q * uFireGlow * 1.15;
  }
  // And the lit lanterns by the path: a deep amber, in the same fine steps.
  warm += vec3(1.0, 0.43, 0.1) * (floor(lanternPool(wpos.xz) * 10.0 + grain) / 10.0) * 0.85;
  return warm;
}

// How brightly the lanterns by the path burn, as it counts at a place: each one's own brightness, by its
// share of the light that reaches there.
float taskBright(vec2 xz) {
  float lit = 0.0;
  float all = 1.0e-4;
  for (int i = 0; i < 8; i++) {
    vec2 d = xz - uTaskLamp[i].xz;
    float l = clamp(1.0 - sqrt(dot(d, d) + 0.3) / 3.3, 0.0, 1.0);
    lit += l * l * uTaskLamp[i].w;
    all += l * l;
  }
  return lit / all;
}

// The traced light arriving at a pixel of the picture (PATH-TRACE). What is kept is how much of each
// light arrives (the sky's, the sun's straight and bounced, the fire's, the lanterns'), so their colour
// and strength can change at once (a passing cloud, a flaring fire, a lantern lit) without retracing.
vec3 tracedLight(ivec2 pixel, vec2 xz, float grain) {
  vec4 a = texelFetch(uTraceA, pixel, 0);
  vec4 b = texelFetch(uTraceB, pixel, 0);
  vec4 c = texelFetch(uTraceC, pixel, 0);
  vec3 light = uAmbient * a.rgb + uLightCol * (sunShade(xz) * (a.a + b.rgb))
             + vec3(1.0, 0.56, 0.2) * (c.rgb * uFireGlow * 2.6)
             + vec3(1.0, 0.6, 0.24) * (b.a * uLampOn * lanternAt(xz) * 1.5)
             + vec3(1.0, 0.43, 0.1) * (c.a * taskBright(xz) * 0.85);
  // In fine steps, stippled into one another, so it stays pixel art.
  return floor(light * 12.0 + grain) / 12.0;
}

// PATH-TRACE: how much of the sun's own light reaches the ground under a pixel of the picture, 0..1, as
// rays found it: for the water lying over that ground, which is in the same shadows (the bank's in the
// morning, a rock's). 1 where no light has been gathered.
float tracedSun(vec2 fc) {
  if (uTraced <= 0.0) return 1.0;
  vec4 ta = texelFetch(uTraceA, ivec2(fc), 0);
  if (ta.r + ta.g + ta.b < 0.001) return 1.0;
  return mix(1.0, clamp(ta.a / (0.2 + 0.8 * smoothstep(-0.15, 0.45, uLightDir.y)), 0.0, 1.0), uTraced);
}

// PATH-TRACE: the light rays found on the ground where a thing stands, for a thing they do not know of
// (the rowing boat on the beach, a fish on the rack): how much of the sun's own light reaches there (x)
// and how much of the sky's (y), each against open ground. It is read at the one spot for the whole of
// the thing, so that a hull seen half against the beach and half against the sea is lit as one. (1, 1)
// where no light has been gathered.
vec2 tracedAt(vec3 where) {
  if (uTraced <= 0.0) return vec2(1.0);
  vec4 clip = uViewProj * vec4(where, 1.0);
  if (clip.w <= 0.0) return vec2(1.0);
  vec2 at = (clip.xy / clip.w * 0.5 + 0.5) * vec2(textureSize(uTraceA, 0));
  float open = 0.2 + 0.8 * smoothstep(-0.15, 0.45, uLightDir.y);
  vec2 sum = vec2(0.0);
  float n = 0.0;
  // (A few spots close together, not one: a single pixel may be the side of a stone.)
  for (int i = 0; i < 5; i++) {
    ivec2 px = ivec2(at) + ivec2(i == 1 ? 5 : i == 2 ? -5 : 0, i == 3 ? 4 : i == 4 ? -4 : 0);
    if (px.x < 0 || px.y < 0 || px.x >= textureSize(uTraceA, 0).x || px.y >= textureSize(uTraceA, 0).y) continue;
    vec4 ta = texelFetch(uTraceA, px, 0);
    if (ta.r + ta.g + ta.b < 0.001) continue;
    sum += vec2(clamp(ta.a / open, 0.0, 1.0), clamp(dot(ta.rgb, vec3(0.3, 0.5, 0.2)) / 1.1, 0.45, 1.1));
    n += 1.0;
  }
  if (n < 0.5) return vec2(1.0);
  return mix(vec2(1.0), sum / n, uTraced);
}

vec3 lit(vec3 albedo, float level, vec3 N, vec3 wpos, float grain) {
  // Steep faces see less sky, so cliffs stay darker than the ground above them.
  float skyShare = N.y > 0.55 ? 1.0 : 0.76;
  return albedo * (uAmbient * skyShare + uLightCol * level + warmLight(wpos, grain));
}

// The colour of the grass. It varies across the meadow at two scales, from a
// deep cool green in the damper ground, through lush green, to dry yellow-green,
// one grading gently into the next.
vec3 grassAlbedo(vec2 xz, float grain) {
  float broad = texture(uNoise, xz * 0.011).a * 0.7 + texture(uNoise, xz * 0.0031 + 0.4).r * 0.3;
  float local = texture(uNoise, xz * 0.047 + 0.2).g;
  float q = floor(smoothstep(0.3, 0.7, broad * 0.62 + local * 0.38) * 9.0 + grain) / 9.0;
  vec3 deep = uGrassLush * vec3(0.72, 0.87, 0.92);
  return q < 0.45 ? mix(deep, uGrassLush, q / 0.45) : mix(uGrassLush, uGrassDry, (q - 0.45) / 0.55);
}

float fogAmount(vec3 wpos) {
  float d = distance(wpos, uCam);
  float f = 1.0 - exp(-d * uFogDensity);
  // High ground disappears into the cloud base.
  f = max(f, uCloudFog * smoothstep(110.0, 300.0, wpos.y) * smoothstep(150.0, 650.0, d));
  return clamp(f, 0.0, 1.0);
}
${RIME}
`;

// ---- sky ---------------------------------------------------------------------

export const SKY_VERT = `${HEAD}
out vec2 vNdc;
void main() {
  // One big triangle that covers the screen.
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  vNdc = p;
  gl_Position = vec4(p, 1.0, 1.0);
}
`;

export const SKY_FRAG = `${HEAD}
in vec2 vNdc;
out vec4 outColor;
uniform vec3 uRight, uUp, uFwd;
uniform float uTanHalf, uAspect;
uniform vec3 uZenith, uSkyMid, uHorizon, uFogCol;
uniform float uHaze;
uniform vec3 uSunDir, uSunGlow, uSunDisc;
uniform vec3 uMoonDir;
uniform float uMoonLit, uMoonVis, uStars, uTwinkle;
uniform mat3 uSkyTurn;    // scene direction -> the sky's own frame
uniform vec3 uGalaxy;     // the galaxy's pole, in the scene
uniform vec3 uGalaxyCore; // the galaxy's centre, in the scene
uniform vec4 uStar[96];   // planets and stars in view: direction, then (magnitude + 5) + 20 x colour code
uniform float uStarCount;
uniform vec4 uMeteor;     // a shooting star: where it starts (bearing, height), its heading, how far along (-1 = none)
uniform vec4 uJoinA[24];  // lines joined between stars: where each starts, and how much of it is drawn so far
uniform vec4 uJoinB[24];  // where each ends, and how brightly it shows
uniform float uJoins;
uniform vec4 uRing[8];    // stars with a ring round them: direction, and strength (above 1.5, a double ring)
uniform float uRings;
uniform float uGrain;     // how much sky one pixel covers, as an angle: lines and rings are drawn a pixel wide
uniform vec3 uLayers;     // cloud by height, each 0..1: low, middle, high
uniform vec4 uFront;      // rain or snow on its way: the bearing it comes from, how near (0 none, 1 here), whether it is snow, and how the wind aloft leans its cloud
uniform float uAurora;    // how strong the northern lights are tonight, 0..1
uniform float uAuroraT;   // wraps 0..1
uniform vec4 uBolt;       // lightning: its bearing, how high in the cloud it starts, a number that shapes it, how brightly it shows now
uniform float uBoltKind;  // 0 for a bolt that comes to ground, 1 for a flash that stays inside the cloud
uniform float uCloud;
uniform vec3 uCloudLit, uCloudDark;
uniform vec4 uCloudGlow;  // the colour a low sun paints the undersides of clouds, and how strongly
uniform vec2 uCloudScroll;
uniform float uRain;
uniform float uBow;       // how strongly a rainbow shows
uniform sampler2D uNoise;

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float cloudField(vec2 uv) {
  return texture(uNoise, uv * 0.045 + uCloudScroll).r * 0.55
       + texture(uNoise, uv * 0.11 + uCloudScroll * 2.0).g * 0.3
       + texture(uNoise, uv * 0.31 + uCloudScroll * 4.0).b * 0.15;
}

// How much cloud there is at one point of a bank of cumulus: above 0 inside it.
// q.x runs along the bank and q.y is the height above its level base. The
// masses come from noise, so no two clouds are alike; they are level
// underneath and heaped above, because it takes denser cloud to stand higher.
// "soft" blurs the noise: 0 for the crisp outline, more for the broad forms.
float bankCloud(vec2 q, float cover, float row, float soft) {
  vec2 uv = vec2(q.x * 0.1 + uCloudScroll.x * (1.0 + row), q.y * 0.15 + row * 0.27);
  float mass = textureLod(uNoise, uv, soft).r;                        // broad heaps, with smaller lumps on them
  float crinkle = textureLod(uNoise, uv * 3.0 + 0.37, soft + 1.0).g;  // the cauliflower edge
  float lumpy = mass + 0.22 * (1.0 - abs(2.0 * crinkle - 1.0)) - 0.11;
  return lumpy - mix(0.78, 0.3, cover) - 0.06 * q.y - 0.16 * q.y * q.y;
}

// One bank of cumulus, drifting sideways. Returns 0 for clear sky, otherwise a
// tone from 1 (the dark underside) to 5 (the brightest crowns). The shading is
// relief: where the cloud thins toward the light it is bright, and where it
// thickens toward the light it is in its own shadow. Edges are frayed, not drawn.
float cloudRow(float az, float el, float base, float size, float row, float cover, float lightSide, vec2 fc) {
  vec2 q = vec2(az / size, (el - base) / (size * 1.25));
  if (q.y < 0.0 || q.y > 1.7) return 0.0;
  float lod = max(0.0, log2(0.24 / size)); // far banks are drawn small, so their noise is read coarser
  float d = bankCloud(q, cover, row, lod);
  if (d <= 0.0) return 0.0;
  float grain = bayer(fc);
  if (d < 0.03 && d / 0.03 < grain) return 0.0; // wisps at the edge
  vec2 toLight = normalize(vec2(lightSide * 0.75, 0.7)) * 0.12;
  float relief = bankCloud(q, cover, row, lod + 1.5) - bankCloud(q + toLight, cover, row, lod + 1.5);
  float lum = 0.4 + relief * 4.0 + q.y * 0.45 - 0.32 * exp(-q.y * 7.0) + min(d, 0.3) * 0.4 + (grain - 0.5) * 0.14;
  return lum > 0.86 ? 5.0 : lum > 0.62 ? 4.0 : lum > 0.4 ? 3.0 : lum > 0.2 ? 2.0 : 1.0;
}

// The clouds straight overhead, seen from underneath when you lie back: how much
// cloud there is at a point on the ceiling of the sky (above 0 inside one).
float ceilingCloud(vec2 p, float cover, float soft) {
  vec2 uv = p * 0.21 + uCloudScroll * 3.0 + 0.13;
  float mass = textureLod(uNoise, uv, soft).b;
  float crinkle = textureLod(uNoise, uv * 3.1 + 0.4, soft + 1.0).r;
  return mass + 0.2 * (1.0 - abs(2.0 * crinkle - 1.0)) - 0.1 - mix(0.82, 0.34, cover);
}

// The crooked path a lightning bolt takes: where it is (as a bearing) at each
// height on its way down. It wanders widely, and jitters finely on top of that.
float boltPath(float el) {
  float down = 1.0 - el / uBolt.y; // 0 where it leaves the cloud, 1 at the horizon
  float wander = (texture(uNoise, vec2(uBolt.z, el * 1.9)).r - 0.5) * 0.2
               + (texture(uNoise, vec2(uBolt.z + 0.31, el * 8.0)).g - 0.5) * 0.045;
  return uBolt.x + wander * (0.25 + 0.75 * down);
}

// High ice cloud: long fibrous streaks, combed out by the wind aloft.
float cirrus(float az, float el) {
  vec2 q = vec2(az * 0.9 + el * 1.7, el * 3.4 - az * 0.5); // set at a slant
  float warp = texture(uNoise, q * 0.07 + 0.3).g - 0.5;
  float strands = texture(uNoise, vec2(q.x * 0.11 + uCloudScroll.x * 3.0, q.y * 0.75 + warp * 0.4)).r;
  float patches = texture(uNoise, q * 0.033 + 0.6).b;
  return strands * 0.58 + patches * 0.42;
}

${COVER_ROUND}${EARTH_SHADOW}${HALO}${SHOWER_CLOUD}
void main() {
  vec2 fc = gl_FragCoord.xy;
  float grain = bayer(fc);
  vec3 ray = normalize(uFwd + uRight * (vNdc.x * uTanHalf * uAspect) + uUp * (vNdc.y * uTanHalf));
  float up = max(ray.y, 0.0);
  float az = atan(ray.x, -ray.z);
  float el = asin(clamp(ray.y, -1.0, 1.0));
  float night = clamp(uStars * 1.5 + uMoonVis, 0.0, 1.0);

  // ---- the air itself: three colours from horizon to zenith, in fine stippled bands
  float t = stepped(pow(up, 0.5), 40.0, fc);
  vec3 col = t < 0.4 ? mix(uHorizon, uSkyMid, t / 0.4) : mix(uSkyMid, uZenith, (t - 0.4) / 0.6);
  vec3 layers = layersToward(az, el); // the cloud at each height, as it is in this part of the sky
  // The air and the stars follow the cloud on each side as well: toward a clearer quarter the air is
  // the clear sky's and the stars come out; toward a cloudier one it greys and they are lost.
  float differs = coverDiffers(az, el);
  if (differs < 0.0) col = mix(col, airOf(uSkyClear, t), clamp(-differs / max(uCloud, 0.05), 0.0, 1.0));
  else col = mix(col, airOf(uSkyGrey, t), clamp(differs / max(1.0 - uCloud, 0.05), 0.0, 1.0));
  float starsHere = uStarsClear * pow(clamp(1.0 - uCloud - differs, 0.0, 1.0), 1.3);

  // Round the sun the sky warms: broadly along the horizon toward it, and in rings close to it.
  float sd = max(dot(ray, uSunDir), 0.0);
  vec2 sunFlat = normalize(uSunDir.xz + vec2(1e-5));
  float toward = pow(max(dot(normalize(ray.xz + vec2(1e-5)), sunFlat), 0.0), 3.0) * exp(-up * 5.5);
  col += uSunGlow * (stepped(toward, 9.0, fc) * 0.5 + stepped(pow(sd, 9.0), 6.0, fc) * 0.45 + stepped(pow(sd, 60.0), 4.0, fc) * 0.35);

  // ---- cloud. Worked out first, because it hides what is beyond it.
  // Each kind of cloud follows the real amount of cloud at its own height.
  float cover = clamp(layers.x * 1.25, 0.0, 0.95);
  vec3 lamp = uMoonVis > 0.3 ? uMoonDir : uSunDir;
  float lightSide = clamp((atan(lamp.x, -lamp.z) - az) * 1.5, -0.8, 0.8);
  // (And whether that light stands beyond what you are looking at, 1, or behind you, -1.)
  float lightFront = cos(atan(lamp.x, -lamp.z) - az) * (1.0 - 0.7 * clamp(lamp.y, 0.0, 1.0));
  vec2 plane = ray.xz / (ray.y + 0.1); // the sky as a flat ceiling, seen in perspective

  // Cumulus: four rows, from a far bank on the horizon to big ones overhead.
  float tone = cloudRow(az, el, 0.17, 0.2, 3.0, min(0.95, cover + 0.08), lightSide, fc);
  if (tone < 0.5) tone = cloudRow(az, el, 0.105, 0.11, 2.0, cover, lightSide, fc);
  float nearCloud = tone; // the big cumulus near to: they pass in front of weather that is still far off
  if (tone < 0.5) tone = cloudRow(az, el, 0.05, 0.058, 1.0, cover, lightSide, fc);
  if (tone < 0.5) tone = cloudRow(az, el, 0.016, 0.03, 0.0, min(0.95, cover + 0.25), lightSide, fc);

  // High overhead (which you only see lying back) the same clouds are seen from
  // underneath: bright round their thin edges, greyer where they are thick.
  if (tone < 0.5 && el > 0.5) {
    float d = ceilingCloud(plane, cover, 0.0) - 0.3 * (1.0 - smoothstep(0.5, 0.64, el));
    if (d > 0.0 && !(d < 0.03 && d / 0.03 < grain)) {
      vec2 toLight = normalize(lamp.xz + vec2(1e-4)) * 0.16;
      float relief = ceilingCloud(plane, cover, 1.5) - ceilingCloud(plane + toLight, cover, 1.5);
      float lum = 0.64 + relief * 3.2 - min(d, 0.3) * 1.5 + (grain - 0.5) * 0.14;
      tone = lum > 0.86 ? 5.0 : lum > 0.62 ? 4.0 : lum > 0.4 ? 3.0 : lum > 0.2 ? 2.0 : 1.0;
    }
  }

  // A mackerel sky: a high sheet broken into small ripples and cloudlets, which
  // shrink and crowd together toward the horizon.
  // It is thin: the sky shows through it, and it only dims the stars.
  float veil = 0.0;
  if (tone < 0.5 && ray.y > 0.07 && layers.y > 0.1) {
    float open = texture(uNoise, plane * 0.03 + uCloudScroll).a - (0.86 - 0.62 * layers.y); // above 0 inside the sheet
    if (open > 0.0) {
      // Only the finest ripples of the noise, by taking away a blurred copy of it.
      vec2 q = plane * vec2(0.13, 0.25) + uCloudScroll * 4.0;
      float fine = textureLod(uNoise, q, 0.0).g - textureLod(uNoise, q, 3.0).g;
      float puff = fine * 10.0 + min(open * 4.0, 0.35) - 0.3;
      if (puff > 0.0) veil = puff > 0.36 ? 0.42 : puff > 0.16 ? 0.28 : 0.14;
    }
  }

  // When it is properly overcast a deck of rolled cloud closes in, in four greys.
  if (tone < 0.5 && ray.y > 0.0 && smoothstep(0.66, 0.95, max(layers.x, layers.y * 0.94)) > grain) {
    float n = cloudField(plane * vec2(0.7, 1.5));
    tone = 1.0 + floor(clamp((n - 0.32) * 2.6, 0.0, 0.999) * 4.0 + (grain - 0.5) * 0.9);
    tone = clamp(tone, 1.0, 4.0);
    // Rain hangs below it in curtains, toward the horizon.
    if (uRain > 0.15 && el < 0.16) {
      float curtain = texture(uNoise, vec2(az * 0.35 + uCloudScroll.x * 6.0, 0.43)).r;
      if (curtain > 0.62 - 0.2 * uRain && grain < 0.75) tone = max(1.0, tone - 1.0);
    }
  }
  float hidden = tone > 0.5 ? 1.0 : 0.0;

  // ---- high cirrus, in front of the stars but behind the lower cloud
  float wisp = 0.0;
  if (el > 0.09) {
    float c = cirrus(az, el) - (0.8 - 0.4 * layers.z);
    if (c > 0.0) wisp = floor(min(c * 6.0, 1.0) * (1.0 - smoothstep(0.85, 1.15, el)) * 4.0 + grain) / 4.0;
  }

  // ---- the night sky. Nothing shines through the moon, not even its dark part.
  float md = dot(ray, uMoonDir);
  bool onMoon = uMoonVis > 0.01 && md > 0.99935;
  if (starsHere > 0.01 && hidden < 0.5 && ray.y > 0.015 && !onMoon) {
    float low = smoothstep(0.015, 0.1, ray.y) * (1.0 - 0.7 * max(wisp, veil)); // stars dim near the horizon, and behind thin cloud
    vec3 sky = uSkyTurn * ray; // this direction in the sky's own frame

    // The Milky Way, in the galaxy's own coordinates: brightest and broadest
    // toward its centre, mottled with star clouds, and split along the middle
    // by dark lanes of dust.
    float gLat = asin(clamp(dot(ray, uGalaxy), -1.0, 1.0));
    vec3 third = cross(uGalaxy, uGalaxyCore);
    float gLon = atan(dot(ray, third), dot(ray, uGalaxyCore));
    float core = 0.5 + 0.5 * cos(gLon);
    float width = 0.13 + 0.1 * core * core;
    float clouds = texture(uNoise, vec2(gLon, gLat) * 0.9 + 0.2).g;
    float dust = texture(uNoise, vec2(gLon * 0.7 + 0.5, gLat * 1.4 + 0.7)).r;
    float river = exp(-gLat * gLat / (width * width)) * (0.35 + 0.65 * core) * (0.6 + 0.8 * clouds);
    // The Great Rift wanders along the middle of it.
    float rift = gLat - (texture(uNoise, vec2(gLon * 0.35, 0.83)).b - 0.5) * 0.09;
    river *= 1.0 - 0.7 * smoothstep(0.42, 0.62, dust) * exp(-rift * rift / 0.0028);
    float glow = floor(clamp(river, 0.0, 1.0) * 5.0 + grain) / 5.0;
    col += mix(vec3(0.075, 0.095, 0.18), vec3(0.24, 0.2, 0.19), core * core) * glow * starsHere * low;

    // Faint background stars, fixed to the sky so they turn with the real
    // ones: a scatter of dim ones and a dusting of the dimmest, both thicker
    // in the Milky Way.
    float h = hash3(floor(sky * 250.0));
    float need = 0.9974 - 0.006 * river;
    if (h > need) {
      float tw = sin(uTwinkle * (1.0 + floor(fract(h * 5000.0) * 11.0)) + h * 900.0);
      float kind = fract(h * 771.0);
      vec3 tint = kind < 0.15 ? vec3(0.9, 0.78, 0.66) : kind > 0.8 ? vec3(0.62, 0.72, 0.95) : vec3(0.7, 0.76, 0.9);
      col = mix(col, tint, (h > need + 0.0012 ? 0.62 : 0.36) * (tw > 0.75 ? 0.5 : 1.0) * starsHere * low);
    } else if (hash3(floor(sky * 430.0) + 7.0) > 0.9962 - 0.008 * river) {
      col = mix(col, vec3(0.5, 0.58, 0.78), 0.26 * starsHere * low);
    }

    // The planets and the real stars: bigger and brighter the lower their
    // magnitude, in their own colours. Stars twinkle; planets shine steadily.
    for (int i = 0; i < 96; i++) {
      if (float(i) >= uStarCount) break;
      vec3 off = ray - uStar[i].xyz;
      // (400 is added to mark a star that can be joined to another just now.)
      float listed = uStar[i].w;
      float joinable = step(400.0, listed);
      listed -= 400.0 * joinable;
      float code = floor(listed / 20.0);
      float mag = listed - 20.0 * code - 5.0;
      if (joinable > 0.5) {
        // Four small ticks round it, like a glint, breathing slowly: the stars to click.
        vec2 o = abs(vec2(dot(off, uRight), dot(off, uUp))) / uGrain;
        if ((o.y < 0.6 && o.x > 2.4 && o.x < 5.2) || (o.x < 0.6 && o.y > 2.4 && o.y < 5.2)) {
          col = mix(col, vec3(0.82, 0.92, 1.0), (0.5 + 0.22 * sin(uTwinkle * 2.0 + float(i))) * starsHere * low);
        }
      }
      float reach = mag < -1.0 ? 0.0046 : mag < 0.6 ? 0.0036 : mag < 1.8 ? 0.0026 : mag < 2.9 ? 0.0019 : 0.0014;
      if (dot(off, off) < reach * reach) {
        vec3 tint = code < 0.5 ? vec3(0.96, 0.98, 1.0) : code < 1.5 ? vec3(0.76, 0.86, 1.0)
                  : code < 2.5 ? vec3(1.0, 0.96, 0.8) : code < 3.5 ? vec3(1.0, 0.8, 0.56) : code < 4.5 ? vec3(1.0, 0.62, 0.46)
                  : code < 5.5 ? vec3(1.0, 1.0, 0.96) : code < 6.5 ? vec3(1.0, 0.95, 0.82) : code < 7.5 ? vec3(1.0, 0.56, 0.36) : vec3(1.0, 0.9, 0.66);
        float tw = code > 4.5 ? 0.0 : sin(uTwinkle * (1.0 + mod(float(i), 5.0)) + float(i) * 1.7);
        float bright = (mag < 2.2 ? 1.0 : mag < 3.3 ? 0.78 : 0.58) * (tw > 0.8 ? 0.7 : 1.0);
        col = mix(col, tint, bright * starsHere * low);
      }
    }
  }

  // ---- the northern lights: a curtain standing in the north, its foot rippling,
  // made of fine rays, green below and violet at the tips. The stronger the
  // night's display, the higher it climbs and the further round it spreads.
  if (uAurora > 0.01 && hidden < 0.5 && starsHere > 0.05) {
    float bearing = az - 1.5708; // from north (the scene's north is to your right)
    if (bearing < -3.14159) bearing += 6.28318;
    float spread = 1.0 + 1.7 * uAurora;
    float side = 1.0 - smoothstep(spread * 0.55, spread, abs(bearing));
    float ripple = texture(uNoise, vec2(bearing * 0.35 + uAuroraT, 0.31)).r - 0.5;
    float foot = (0.05 + 0.55 * uAurora * uAurora) * cos(clamp(bearing / spread, -1.0, 1.0) * 1.3) + ripple * 0.09;
    float above = el - foot;
    if (above > 0.0 && side > 0.0) {
      float rays = texture(uNoise, vec2(bearing * 2.3 + ripple * 0.6 - uAuroraT * 2.0, 0.77)).g * 0.6
                 + texture(uNoise, vec2(bearing * 7.0 + uAuroraT * 3.0, 0.13)).b * 0.4;
      float tall = 0.14 + 0.3 * uAurora + 0.22 * rays;
      float light = exp(-above / tall) * smoothstep(0.0, 0.03, above) * (0.3 + 1.0 * rays * rays) * side * uAurora * 1.7;
      light = floor(clamp(light, 0.0, 1.0) * 6.0 + grain) / 6.0;
      vec3 hue = mix(vec3(0.22, 1.0, 0.55), vec3(0.62, 0.3, 0.92), smoothstep(0.25, 1.0, above / tall));
      col += hue * light * smoothstep(0.05, 0.5, starsHere) * 0.9 * (1.0 - 0.6 * max(wisp, veil));
    }
  }

  // ---- the figures joined up star to star, and the rings round stars being pointed at
  if (starsHere > 0.05 && hidden < 0.5 && ray.y > 0.0 && !onMoon) {
    float clear = min(1.0, starsHere * 1.6) * (1.0 - 0.6 * max(wisp, veil));
    for (int i = 0; i < 24; i++) {
      if (float(i) >= uJoins) break;
      vec3 a = uJoinA[i].xyz;
      vec3 ab = uJoinB[i].xyz - a;
      float along = dot(ray - a, ab) / dot(ab, ab);
      // A little space is left round each star, and the line grows from its first star to its second.
      float space = 3.5 * uGrain / length(ab);
      if (along < space || along > min(1.0 - space, uJoinA[i].w)) continue;
      if (length(ray - normalize(a + ab * along)) < 0.6 * uGrain) {
        // A line not yet drawn is shown dotted and faint, as a guide (its brightness is given as a negative number).
        float show = uJoinB[i].w;
        if (show < 0.0) show = fract(along * length(ab) / (7.0 * uGrain)) < 0.45 ? -show : 0.0;
        col = mix(col, vec3(0.76, 0.87, 1.0), 0.85 * show * clear);
      }
    }
    for (int i = 0; i < 8; i++) {
      if (float(i) >= uRings) break;
      float d = length(ray - uRing[i].xyz);
      float strength = uRing[i].w;
      bool on = abs(d - 4.4 * uGrain) < 0.55 * uGrain || (strength > 1.5 && abs(d - 6.8 * uGrain) < 0.55 * uGrain);
      if (on) col = mix(col, vec3(0.86, 0.94, 1.0), clamp(strength, 0.0, 1.0) * clear);
    }
  }

  // Now and then, a shooting star.
  if (uMeteor.w >= 0.0 && hidden < 0.5) {
    vec2 dir = vec2(cos(uMeteor.z), sin(uMeteor.z));
    vec2 fromHead = vec2(az, el) - (uMeteor.xy + dir * (uMeteor.w * 0.5));
    float behind = dot(fromHead, -dir);
    float tail = 0.1 * sin(uMeteor.w * 3.14159);
    if (behind > 0.0 && behind < tail && abs(dot(fromHead, vec2(-dir.y, dir.x))) < 0.0022) {
      col = mix(col, vec3(1.0, 0.97, 0.9), (1.0 - behind / tail) * starsHere);
    }
  }

  // ---- the sun: its disc, and when it is low, rays fanning out between the clouds
  if (sd > 0.99965 && hidden < 0.5) col = uSunDisc;
  if (hidden < 0.5 && uSunDir.y < 0.4 && uSunDir.y > -0.1 && uCloud > 0.08) {
    vec3 sr = normalize(cross(uSunDir, vec3(0.0, 1.0, 0.0)));
    vec2 off = vec2(dot(ray, sr), dot(ray, cross(sr, uSunDir)));
    float spread = length(off);
    float beam = texture(uNoise, vec2(atan(off.y, off.x) * 0.3 + 0.2, 0.61)).r;
    float shaft = smoothstep(0.52, 0.72, beam) * smoothstep(0.04, 0.14, spread) * (1.0 - smoothstep(0.3, 0.85, spread));
    shaft *= clamp(uCloud * 3.0, 0.0, 1.0) * (1.0 - smoothstep(0.7, 0.95, uCloud));
    if (shaft > grain * 1.1 + 0.08) col += uSunGlow * 0.2;
  }

  // ---- the moon. Its lit part is exactly the fraction lit tonight, with the
  // bright limb turned toward the sun, and it carries its real seas: Imbrium and
  // Serenitatis above, Tranquillitatis and Fecunditatis to the right, the great
  // Ocean of Storms on the left, and Tycho's bright crater near the bottom.
  if (uMoonVis > 0.01 && md > 0.998 && hidden < 0.5) {
    vec3 mr = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
    vec3 mu = cross(mr, uMoonDir);
    vec2 m = vec2(dot(ray, mr), dot(ray, mu)) / 0.036;
    float r2 = dot(m, m);
    if (r2 < 1.0) {
      // Which way the sun lies from here, across the sky.
      vec2 sunward = vec2(dot(uSunDir, mr), dot(uSunDir, mu));
      sunward = length(sunward) > 0.001 ? normalize(sunward) : vec2(1.0, 0.0);
      float across = dot(m, sunward);
      float along = dot(m, vec2(-sunward.y, sunward.x));
      // The line between day and night on it is half an ellipse, set by the lit fraction.
      float edge = (1.0 - 2.0 * uMoonLit) * sqrt(max(0.0, 1.0 - along * along));
      float lit = floor(smoothstep(edge - 0.09, edge + 0.09, across) * 4.0 + grain) / 4.0;

      float sea = 0.0;
      sea = max(sea, 1.0 - length((m - vec2(-0.26, 0.48)) / vec2(0.3, 0.26)));  // Imbrium
      sea = max(sea, 1.0 - length((m - vec2(0.2, 0.4)) / vec2(0.2, 0.2)));      // Serenitatis
      sea = max(sea, 1.0 - length((m - vec2(0.4, 0.12)) / vec2(0.24, 0.2)));    // Tranquillitatis
      sea = max(sea, 1.0 - length((m - vec2(0.72, 0.28)) / vec2(0.1, 0.12)));   // Crisium
      sea = max(sea, 1.0 - length((m - vec2(0.6, -0.12)) / vec2(0.14, 0.18)));  // Fecunditatis
      sea = max(sea, 1.0 - length((m - vec2(0.42, -0.28)) / vec2(0.1, 0.1)));   // Nectaris
      sea = max(sea, 1.0 - length((m - vec2(-0.6, 0.12)) / vec2(0.28, 0.42)));  // Procellarum
      sea = max(sea, 1.0 - length((m - vec2(-0.2, -0.36)) / vec2(0.22, 0.17))); // Nubium
      sea = max(sea, 1.0 - length((m - vec2(-0.5, -0.42)) / vec2(0.12, 0.12))); // Humorum
      float rough = texture(uNoise, m * 0.09 + 0.37).r;
      vec3 face = sea + (rough - 0.5) * 0.35 > 0.12 ? vec3(0.7, 0.73, 0.8) : vec3(1.0, 0.98, 0.9);
      // Bright craters: Tycho with its rays in the south, Copernicus and Kepler in the west.
      vec2 ty = m - vec2(-0.1, -0.68);
      if (length(ty) < 0.09) face = vec3(1.0);
      else if (length(ty) < 0.5 && abs(sin(atan(ty.y, ty.x) * 4.0)) > 0.93 && rough > 0.45) face = mix(face, vec3(1.0), 0.6);
      if (length(m - vec2(-0.34, 0.14)) < 0.06 || length(m - vec2(-0.62, 0.13)) < 0.04) face = vec3(0.98, 0.98, 0.94);
      if (r2 > 0.82) face *= 0.93;                                               // it darkens toward the limb
      face = inEarthShadow(face, m, grain);
      // Earthshine: beside a thin crescent the dark part of the disc shows faintly, seas and all, by the light of the Earth; by half moon it is gone.
      vec3 nightSide = col + vec3(0.062, 0.08, 0.125) * (1.0 - smoothstep(0.05, 0.5, uMoonLit)) * (0.45 + 0.55 * dot(face, vec3(0.33)));
      col = mix(col, mix(nightSide, face, lit), uMoonVis);
    }
  }
  // A soft ring of light round the moon.
  col += vec3(0.15, 0.19, 0.3) * stepped(pow(max(md, 0.0), 260.0), 5.0, fc) * uMoonVis * (1.0 - hidden) * (1.0 - 0.9 * uShadow.w);
  // And round the moon or the sun, when thin ice cloud is over them, a halo.
  if (hidden < 0.5) col = haloRound(col, ray, az, el, layers, veil, fc);

  // ---- lay the cloud over all of that
  if (hidden < 0.5) col = mix(col, mix(uCloudLit, uCloudGlow.rgb, 0.5 * uCloudGlow.a), max(wisp * 0.55, veil));
  if (hidden > 0.5) {
    vec3 rim = mix(uCloudLit, vec3(1.0), 0.45);
    vec3 cloudCol = tone > 4.5 ? rim
                  : tone > 3.5 ? uCloudLit
                  : tone > 2.5 ? mix(uCloudLit, uCloudDark, 0.4)
                  : tone > 1.5 ? mix(uCloudLit, uCloudDark, 0.74)
                  : uCloudDark * 0.9;
    // A low sun lights clouds from beneath: their undersides glow.
    if (tone < 2.5) cloudCol = mix(cloudCol, uCloudGlow.rgb, (tone < 1.5 ? 0.8 : 0.5) * uCloudGlow.a);
    else if (tone < 3.5) cloudCol = mix(cloudCol, uCloudGlow.rgb, 0.2 * uCloudGlow.a);
    if (tone > 4.5) cloudCol += uSunGlow * 0.25;
    col = cloudCol;
  }

  // ---- a rainbow, when it rains with the sun low behind you: a ring 42 degrees
  // from the point straight opposite the sun, red on the outside.
  if (uBow > 0.02) {
    float degrees = acos(clamp(dot(ray, -uSunDir), -1.0, 1.0)) * 57.2958;
    float band = (degrees - 40.3) / 2.2; // 0 at the violet edge, 1 at the red
    if (band > 0.0 && band < 1.0 && uBow * 0.7 > grain * 0.8) {
      vec3 hue = band < 0.17 ? vec3(0.55, 0.4, 0.9) : band < 0.34 ? vec3(0.35, 0.55, 1.0) : band < 0.5 ? vec3(0.35, 0.85, 0.5)
               : band < 0.67 ? vec3(1.0, 0.92, 0.35) : band < 0.84 ? vec3(1.0, 0.62, 0.25) : vec3(1.0, 0.36, 0.3);
      col = mix(col, hue, 0.45 * uBow);
    }
  }

  // ---- weather on its way: a bank of shower cloud standing on the horizon in
  // the quarter rain or snow is coming from, or where it is falling already.
  if (nearCloud < 0.5) col = showerBank(col, az, el, lightSide, lightFront, fc);

  // Haze thickens toward the horizon; in fog it takes the whole sky.
  col = mix(col, uFogCol, stepped(exp(-up * uHaze), 28.0, fc));

  // ---- lightning. It is drawn last, because it shines through rain and haze.
  if (uBolt.w > 0.01 && ray.y > -0.03) {
    float aside = az - uBolt.x;
    // The cloud lights up from inside, round where it struck.
    float lit = exp(-aside * aside / 0.22) * exp(-pow(el - uBolt.y * 0.75, 2.0) / 0.07);
    col += vec3(0.5, 0.56, 0.85) * stepped(lit, 7.0, fc) * uBolt.w * (0.4 + 0.75 * uBoltKind);
    if (uBoltKind < 0.5 && el < uBolt.y) {
      // The channel itself, a pixel or two wide, unbroken however sharply it turns.
      float here = boltPath(el + 0.5 * uGrain);
      float below = boltPath(el - 0.5 * uGrain);
      float wide = uGrain * (el > uBolt.y * 0.35 ? 1.0 : 0.7) * (uBolt.y > 0.44 ? 1.6 : 1.0);
      float off = max(max(min(here, below) - az, az - max(here, below)), 0.0);
      float core = off < wide ? 1.0 : 0.0;
      float halo = exp(-off / (uGrain * 3.5)) * 0.55;
      // Forks leave it part-way down and die out before they reach the ground.
      for (int j = 0; j < 3; j++) {
        float n = float(j);
        float from = uBolt.y * (0.78 - 0.2 * n - 0.1 * fract(uBolt.z * (7.0 + n)));
        float reach = uBolt.y * (0.16 + 0.22 * fract(uBolt.z * (13.0 + 3.0 * n)));
        if (el < from && el > from - reach) {
          float along = (from - el) / reach;
          float side = fract(uBolt.z * (3.0 + n)) < 0.5 ? -1.0 : 1.0;
          float fork = boltPath(from) + side * (from - el) * (0.6 + 1.2 * fract(uBolt.z * (5.0 + n)))
                     + (texture(uNoise, vec2(uBolt.z + 0.6 + 0.1 * n, el * 12.0)).b - 0.5) * 0.04 * along;
          if (abs(az - fork) < uGrain * 0.75 && along < 0.55 + 0.45 * grain) core = max(core, 0.75 * (1.0 - 0.6 * along));
        }
      }
      col = mix(col, vec3(0.93, 0.95, 1.0), clamp(core + halo, 0.0, 1.0) * min(1.0, uBolt.w * 1.6));
    }
  }
  outColor = vec4(col, IS_SKY);
}
`;

// ---- land --------------------------------------------------------------------

export const LAND_VERT = `${HEAD}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
uniform mat4 uViewProj;
uniform vec3 uCam;
uniform float uSnowDepth; // metres of snow lying
${THAW}
out vec3 vWorld;
out vec3 vNormal;
void main() {
  // Lying snow raises the ground round you by its real depth, so it banks up
  // against walls, logs and doorsteps. (Only where it can lie, and only close to;
  // and not where the fire has melted it.)
  vec3 pos = aPos;
  if (uSnowDepth > 0.0) pos.y += uSnowDepth * (1.0 - thaw(aPos.xz)) * smoothstep(0.45, 0.75, aNormal.y) * step(distance(aPos, uCam), 320.0); // (NO-SNOW)
  vWorld = pos;
  vNormal = aNormal;
  gl_Position = uViewProj * vec4(pos, 1.0);
}
`;

export const LAND_FRAG = `${HEAD}
${COMMON}
in vec3 vWorld;
in vec3 vNormal;
out vec4 outColor;
uniform vec2 uPath[6];
uniform vec2 uSpill; // fog pouring off the far cliff: how much (0..1), and how far it has slid (wraps 0..1)
uniform vec3 uBeach; // the shingle beach under the meadow: where it is (x, z) and how far it reaches
uniform vec3 uFoamCol; // white water, as the light of the hour has it
uniform vec3 uRocks[31]; // the stones standing on the beach: where each is (x, z) and how big

// The stones of the beach lie as cells: the nearest of nine scattered points
// owns a spot. This says how far the spot is from that stone's middle, how far
// from the border with the next stone, a number that is the stone's own, and
// the way from its middle to the spot.
void stoneAt(vec2 q, out float nearest, out float rim, out float which, out vec2 from) {
  vec2 cellAt = floor(q);
  float second = 9.0;
  nearest = 9.0;
  which = 0.0;
  from = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = cellAt + vec2(float(i), float(j));
      float h = fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453);
      vec2 at = c + 0.5 + 0.38 * vec2(cos(h * 6.283), sin(h * 6.283));
      float away = distance(q, at);
      if (away < nearest) { second = nearest; nearest = away; which = h; from = q - at; }
      else if (away < second) second = away;
    }
  }
  rim = second - nearest;
}

// How far a spot on a beach stone stands above its edge: 0 at the edge (and in
// the gaps between stones), 1 over its crown. Corners are cut off, so stones are round.
float crownOf(float nearest, float rim) {
  return clamp(min(rim / 0.3, (0.54 - nearest) / 0.24), 0.0, 1.0);
}

float pathDistance(vec2 p) {
  float best = 1.0e9;
  for (int i = 0; i < 5; i++) {
    vec2 a = uPath[i];
    vec2 ab = uPath[i + 1] - a;
    best = min(best, distance(p, a + ab * clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0)));
  }
  return best;
}

void main() {
  vec3 N = normalize(vNormal);
  vec2 p = vWorld.xz;
  vec2 fc = gl_FragCoord.xy;
  float d = distance(vWorld, uCam);
  float fine = texture(uNoise, p * 0.23).r;
  float mid = texture(uNoise, p * 0.041).g;
  float tiny = texture(uNoise, p * 0.9).b;
  float grain = bayer(fc);

  // (Turf is drawn the tone of the foot of the grass, so thin patches do not show.)
  vec3 col = grassAlbedo(p, grain) * 0.88;
  // Far across the meadow the grass pales and yellows a little; close to, it is deep and rich.
  if (d < 420.0) col *= mix(vec3(0.93, 0.97, 0.97), vec3(1.1, 1.07, 0.9), smoothstep(6.0, 130.0, d));
  // Tufts and hollows: flecks a tone lighter, damp patches a tone darker.
  if (tiny > 0.72) col *= 1.14;
  else if (fine < 0.24) col *= 0.9;
  // Water runs off the hills in gullies, and the grass in them grows darker.
  float along = abs(N.x) > abs(N.z) ? p.y : p.x;
  float gully = texture(uNoise, vec2(along * 0.013, 0.37)).r * 0.6 + texture(uNoise, vec2(along * 0.06, 0.71)).g * 0.4;
  if (d > 220.0 && N.y < 0.95 && gully > 0.66) col *= 0.84;
  // Higher ground is thinner and browner.
  if (smoothstep(60.0, 380.0, vWorld.y) + (mid - 0.5) * 0.7 > 0.5) col = mix(col, uGrassDry * 0.9, 0.7);
  // A passing gust.
  col = mix(col, uGrassLight, gustBand(p) * 0.55);

  // The footpath: bare earth, ragged at the edges, with a few stones in it.
  if (d < 150.0) {
    float worn = pathDistance(p) + (fine - 0.5) * 0.5 + (grain - 0.5) * 0.22;
    if (worn < 0.5) col = worn < 0.24 ? (tiny > 0.8 ? vec3(0.74, 0.7, 0.62) : vec3(0.7, 0.56, 0.38)) : vec3(0.56, 0.5, 0.3);
    // After rain, puddles lie in it and hold the sky.
    if (worn < 0.2 && uWet > 0.12 && mid > 0.56) col = mix(uFogCol, vec3(0.5, 0.6, 0.75), 0.35) / max(uAmbient + uLightCol * 0.4, vec3(0.05));
  }

  // The village's ground on the far cliff: small walled fields, some mown, and
  // the stream that runs down through them to the waterfall.
  if (vWorld.y > 55.0 && p.x > 4.0 && p.x < 160.0 && p.y < -326.0 && p.y > -452.0) {
    vec2 plot = p / vec2(27.0, 21.0) + (texture(uNoise, p * 0.006).rg - 0.5) * 0.7;
    vec2 wall = abs(fract(plot) - 0.5);
    float kind = fract(sin(dot(floor(plot), vec2(12.9898, 78.233))) * 43758.5453);
    if (kind > 0.62) col = mix(col, uGrassDry * 1.05, 0.75);      // mown for hay
    else if (kind < 0.25) col *= vec3(0.86, 0.95, 0.9);           // rougher pasture
    if (max(wall.x, wall.y) > 0.46) col = vec3(0.34, 0.33, 0.36);  // dry-stone walls between them
    if (abs(p.x - (62.0 + 5.0 * sin(p.y * 0.06))) < 1.5) col = vec3(0.62, 0.8, 0.98) / max(uAmbient + uLightCol * 0.5, vec3(0.05));
  }

  // Hoarfrost: how thickly it lies just here. Shadows keep it (the traced light
  // knows where the sun gets to); far off, the slopes turned from the sun do.
  float rimed = 0.0;
  float rimeSun = 0.0; // the share of the sun's light that gets here
  if (uRime.x > 0.01) {
    rimeSun = mix(sunShare(N), texelFetch(uTraceA, ivec2(fc), 0).a, uTraced * (d < 300.0 ? 1.0 : 0.0));
    rimed = rimeAt(p, sunReach(rimeSun));
  }

  bool shore = vWorld.y + (mid - 0.5) * 2.4 < 1.6;
  // How level the ground is. Down by the sea a cliff can be steeper than its
  // corners admit (a wall that rises between two level places); there the slope
  // of the face itself is asked as well, or grass would grow up a sheer wall.
  float level0 = N.y;
  if (vWorld.y < 40.0) level0 = min(level0, abs(normalize(cross(dFdx(vWorld), dFdy(vWorld))).y) + 0.12);
  if (shore || level0 + (mid - 0.5) * 0.1 < 0.8) {
    // Bare basalt. It lies in level beds, so cliffs are striped, with a dark
    // seam where one bed meets the next.
    // (The beds are of uneven thickness, as real lava flows are.)
    float bed = fract((vWorld.y + 8.0 * sin(vWorld.y / 37.0 + mid * 2.0)) / 23.0 + mid * 0.22);
    col = bed < 0.07 ? vec3(0.12, 0.11, 0.15) : bed < 0.42 ? vec3(0.22, 0.21, 0.26) : bed < 0.8 ? vec3(0.38, 0.36, 0.39) : vec3(0.3, 0.29, 0.34);
    // Gullies run down the face, following whichever way the cliff runs.
    if (gully > 0.64) col *= 0.74;
    else if (gully < 0.33) col *= 1.15;
    if (fine > 0.64) col *= 1.1;
    // Close to (from the beach), a cliff is not stripes. Each bed of basalt is
    // split into columns; some of the seams between beds are red, where ash
    // lay and was baked; grass and thrift hold on along the ledges on top of the
    // beds; and at the foot the sea has drawn its own lines.
    float closeTo = 1.0 - smoothstep(170.0, 245.0, d);
    if (closeTo > 0.0 && !shore) {
      float bedNo = floor((vWorld.y + 8.0 * sin(vWorld.y / 37.0 + mid * 2.0)) / 23.0 + mid * 0.22);
      // Columns: a dark joint every couple of metres along the face, a lit edge beside it.
      float column = fract(along * 0.43 + bedNo * 0.37 + (fine - 0.5) * 0.3);
      if (bed > 0.1 && bed < 0.8) {
        if (column < 0.1) col *= mix(1.0, 0.7, closeTo);
        else if (column < 0.22) col *= mix(1.0, 1.13, closeTo);
        // And they break off unevenly: darker hollows where a block has fallen away.
        if (texture(uNoise, vec2(floor(along * 0.43 + bedNo * 0.37) * 0.137, floor(vWorld.y / 2.4) * 0.211)).g > 0.74) col *= mix(1.0, 0.82, closeTo);
      }
      // A red seam under some of the beds.
      if (bed < 0.075 && fract(bedNo * 0.618) < 0.5) col = mix(col, vec3(0.42, 0.21, 0.15), closeTo);
      // The shadow a bed throws on the top of the one below it.
      if (bed > 0.8 && bed < 0.87) col *= mix(1.0, 0.8, closeTo);
      // Ledges: turf along the top of a bed, in ragged lengths, hanging a little over the edge.
      float ledge = texture(uNoise, vec2(along * 0.021 + bedNo * 0.31, bedNo * 0.47)).r;
      if (bed > 0.9 + (tiny - 0.5) * 0.07 && ledge > 0.46 + 0.5 * (1.0 - closeTo)) col = grassAlbedo(p, grain) * (0.8 + 0.2 * fine);
    }
    if (closeTo > 0.0 && vWorld.y < 3.4) {
      // The foot of it: black and wet where the sea reaches, a pale band of
      // barnacles above that, then the dark green of weed.
      float tide = vWorld.y + (fine - 0.5) * 0.5;
      vec3 foot = tide < 0.55 ? vec3(0.07, 0.07, 0.09) : tide < 1.25 ? (tiny > 0.42 ? vec3(0.6, 0.58, 0.5) : vec3(0.34, 0.33, 0.33)) : tide < 2.3 ? vec3(0.13, 0.19, 0.11) : col;
      col = mix(col, foot, closeTo);
    }
    // In rain, threads of water come down the high faces.
    if (!shore && uWet > 0.25 && vWorld.y > 50.0 && abs(gully - 0.75) < fwidth(gully) * 1.4 * uWet) col = vec3(0.86, 0.93, 1.0);
    // Turf holds on wherever a ledge is wide enough.
    else if (!shore && N.y > 0.64 && bed > 0.84) col = grassAlbedo(p, grain) * 0.92;
  } else {
    // Frost whitens the turf and pales the bare earth of the path: a crust,
    // thicker in the open than down between the tufts, stippled where it thins.
    if (rimed > 0.0) {
      float crust = rimed * (0.72 + 0.56 * fine) + (tiny - 0.5) * 0.22 * rimed;
      col = mix(col, rimeCol(), 0.47 * floor(smoothstep(0.12, 0.85, crust) * 5.0 + grain) / 5.0);
    }
    // Snow lies in patches first, then everywhere, and on the heights before the shore.
    float melted = uSnow > 0.0 ? thaw(p) : 0.0; // (NO-SNOW)
    float snow = (uSnow * 1.4 + uSnow * smoothstep(80.0, 450.0, vWorld.y) * 0.5) * (1.0 - melted) - (1.0 - fine) * 0.4;
    if (snow > 0.5 + (grain - 0.5) * 0.25 && N.y > 0.6) col = SNOW;
    else col *= 1.0 - 0.3 * melted * uSnow; // thawed ground is dark and wet
  }

  // The beach: sea-worn stones, each its own grey and each a rounded thing, lit on
  // one side and dark on the other, with shadow in the gaps between them; wet and
  // darker where the water has just been, drying paler higher up.
  float strand = distance(p, uBeach.xy) / uBeach.z + (mid - 0.5) * 0.3;
  if (strand < 0.74 && vWorld.y < 2.1 + (fine - 0.5) * 0.8 && d < 90.0) {
    // The sea sorts them: cobbles as big as loaves thrown up on the ridge, fine
    // shingle down by the water, in drifts.
    bool cobbles = texture(uNoise, p * 0.043).r + (vWorld.y - 0.55) * 0.55 > 0.52;
    float size = cobbles ? 3.1 : 6.3; // stones to the metre
    float apart = 1.0 - smoothstep(cobbles ? 16.0 : 9.0, cobbles ? 40.0 : 26.0, d); // far enough off they run together into shingle
    // A stone stands up off the beach, and you see it from low down: its crown
    // is nearer to you than its foot, and hides the gap behind it. So the spot
    // looked at is moved toward you by the stone's height, found in two goes.
    vec2 toEye = uCam.xz - p;
    float flatAway = max(length(toEye), 0.01);
    vec2 eyeward = toEye / flatAway;
    float lean = min((cobbles ? 0.06 : 0.028) * flatAway / max(uCam.y - vWorld.y, 0.3), 0.42 / size) * apart;
    float nearest, rim, which;
    vec2 from;
    stoneAt((p + eyeward * lean * 0.55) * size, nearest, rim, which, from);
    stoneAt((p + eyeward * lean * crownOf(nearest, rim)) * size, nearest, rim, which, from);
    float crown = crownOf(nearest, rim);
    vec2 outward = from / max(nearest, 0.001);
    float steep = 1.0 - crown; // level on top, steep at the edge

    float tone = fract(which * 7.31);
    vec3 pebble = tone < 0.3 ? vec3(0.3, 0.31, 0.35) : tone < 0.58 ? vec3(0.42, 0.42, 0.45) : tone < 0.82 ? vec3(0.53, 0.51, 0.5) : tone < 0.94 ? vec3(0.62, 0.6, 0.58) : vec3(0.44, 0.36, 0.31);
    vec2 sunward = normalize(uLightDir.xz + vec2(1.0e-4, 0.0));
    float wet = 1.0 - smoothstep(0.05, 0.42 + (fine - 0.5) * 0.24, vWorld.y - uTide.x);
    // (Where the tide stood and has gone down from, the stones are still dark with it, drying from the top: damp, not running wet, so they do not shine.)
    pebble *= mix(1.0, 0.66, uTide.z * (1.0 - smoothstep(uTide.y - 0.02, uTide.y + 0.16 + (fine - 0.5) * 0.1, vWorld.y)));
    if (crown > 0.06 * apart) {
      // Round: lit as a dome is lit, against how the level beach under it would be.
      vec3 dome = normalize(vec3(outward.x * steep * 1.5, 1.0 - 0.45 * steep, outward.y * steep * 1.5));
      float lit0 = 0.38 + 0.62 * max(uLightDir.y, 0.0);
      float lit1 = 0.38 + 0.62 * max(dot(dome, uLightDir), 0.0);
      pebble *= mix(1.0, clamp(lit1 / lit0, 0.55, 1.5), apart);
      // Darker round its foot, where little light gets in between it and the next.
      pebble *= mix(1.0, mix(0.56, 1.0, smoothstep(0.0, 0.62, crown)), apart);
      // The side of it that faces you is its flank, a tone down; beyond its crown you see its top.
      pebble *= 1.0 - 0.2 * max(dot(outward, eyeward), 0.0) * steep * apart;
      // Its crown catches a glint; wet, it shines.
      if (distance(from, sunward * 0.16) < 0.09 && uLightDir.y > -0.05) pebble = max(wet, uWet) > 0.5 ? vec3(0.82, 0.86, 0.92) : pebble * (1.0 + 0.24 * apart);
    } else {
      // Between the stones: grit, in shadow; and darkest on the side the stone shades.
      pebble = vec3(0.13, 0.13, 0.16) * (0.75 + 0.7 * tiny) * (dot(outward, sunward) < -0.2 ? 0.7 : 1.0);
    }
    pebble *= mix(1.0, 0.56, max(wet, uWet * 0.7));
    // A line of dark weed where the last high water left it, along the seaward side of the ridge.
    vec2 svB = fromShore(p);
    if (abs(svB.x + 3.3 + (fine - 0.5) * 1.1) < 0.07 + 0.13 * tiny && tiny > 0.5) pebble = vec3(0.14, 0.17, 0.1) * (0.8 + 0.6 * crown);
    // (Real stones lie all over this, drawn each as itself; what is painted here is
    // only what shows between them, down in their shadow.)
    pebble *= 0.62;
    // The boulders and loose cobbles standing on the shingle each lay a shadow on it, away from the light.
    for (int i = 0; i < 31; i++) {
      vec3 rock = uRocks[i];
      vec2 off = p - rock.xy + sunward * rock.z * (0.35 + 0.9 * (1.0 - clamp(uLightDir.y, 0.0, 1.0)));
      float shadow = length(off * vec2(1.0, 1.0)) / (rock.z * 1.15);
      if (shadow < 1.0 - 0.25 * grain) pebble *= 0.58;
    }
    // Snow settles on the crowns of the stones first, then fills the gaps between
    // them; the sea keeps the lowest of the beach clear. Under a full fall the
    // bigger stones still show as humps in it.
    float lying = uSnow * 1.3 - 1.15 + crown * 0.9 + (fine - 0.5) * 0.5;
    col = lying > 0.0 && vWorld.y > 0.46 + (tiny - 0.5) * 0.12 ? SNOW * (0.86 + 0.14 * smoothstep(0.0, 0.7, crown)) : pebble;
  }
  // The surf: each wave that lands runs a sheet of water up the shore, white
  // along its leading edge and laced with foam behind, and draws it back again.
  // (What it covers is decided here; it is painted after the light, below.)
  float wash = 0.0; // 1 under clear water, 2 under foam
  float overSea = vWorld.y - uTide.x; // how far above the sea as it stands just now
  if (overSea < 0.75 && distance(p, uBeach.xy) < uBeach.z * 2.6) {
    vec2 sv = fromShore(p);
    float uneven = texture(uNoise, vec2(sv.y * 0.045, 0.83)).r;
    for (int k = 0; k < 2; k++) {
      float life = waveLife(k);
      // (How high up the shingle it comes: a hand's depth for a ripple, knee-high for a big one.)
      float reachTo = runUp(life) * (0.14 + 0.34 * waveSize(k) * crestTall(sv.y, k)) * (0.72 + 0.56 * uneven);
      if (overSea < reachTo) {
        // Metres back from the leading edge, along the shingle: by how steeply the
        // ground climbs just here (on a level patch a finger's depth of water goes a long way).
        float edge = (reachTo - overSea) / clamp(sqrt(max(1.0 - N.y * N.y, 0.0)) / max(N.y, 0.2), 0.035, 0.6);
        float coming = 1.0 - smoothstep(LANDS + 0.1, LANDS + 0.2, life); // 1 while it is still surging up
        float lace = texture(uNoise, vec2(sv.y * 0.23 + float(k) * 0.4, sv.x * 0.5 + life * 0.5)).b * 0.65 + texture(uNoise, vec2(sv.y * 0.6, sv.x * 1.1 - life * 0.4)).r * 0.35;
        // A bright line where it leads, thick while it climbs and thin as it falls back;
        // and behind that, froth that thins as the water drains.
        float lead = 1.0 - edge / (0.12 + 0.3 * coming);
        float froth = (0.8 - 0.7 * smoothstep(LANDS, 0.97, life)) * (1.0 - smoothstep(0.0, 2.4, edge));
        wash = max(wash, lead > 0.0 || froth > lace * 1.15 + 0.14 ? 2.0 : 1.0);
      }
    }
    // Right at the water's edge the stones are always awash.
    if (overSea < 0.03 + 0.03 * uneven && tiny > 0.42) wash = max(wash, 2.0);
  }

  // Light in fine steps, stippled into one another. Close to, the meadow's
  // swells are exaggerated a little so its shape shows; far off, stipple would
  // only read as noise, so the steps there are clean.
  bool close = d < 260.0;
  vec3 Nr = close ? normalize(vec3(N.x * 2.6, N.y, N.z * 2.6)) : N;
  float amount = sunShade(p) * (0.2 + 0.8 * smoothstep(-0.15, 0.45, dot(Nr, uLightDir)));
  float level = close ? floor(amount * 8.0 + grain) / 8.0 : floor(amount * 6.0 + 0.5) / 6.0;
  vec3 byFormula = lit(col, clamp(level, 0.0, 1.0), N, vWorld, grain);
  vec3 byTracing = col * tracedLight(ivec2(fc), p, grain);
  col = mix(byFormula, byTracing, uTraced * (d < 300.0 ? 1.0 : 0.0)) * (1.0 - 0.14 * uWet);
  // While the sun is low, here and there a crystal of the frost catches it: one
  // pixel, coming and going slowly. (Only close to, where a pixel is small enough to be one.)
  if (rimed * uRime.z > 0.05 && d < 90.0) {
    float own = fract(sin(dot(floor(fc), vec2(12.9898, 78.233))) * 43758.5453);
    float sun = rimeSun * sunShade(p);
    if (own < 0.011 * rimed * uRime.z * smoothstep(0.1, 0.3, sun)) col = mix(col, sparkle(sun), slowGlint(own * 90.0));
  }
  // The surf's water over the stones: they show through it, darker; its foam is the sea's own white.
  if (wash > 1.5) col = uFoamCol + seaGlow(0.55);
  else if (wash > 0.5) col = mix(col * 0.7, uFoamCol * vec3(0.42, 0.6, 0.66), 0.22) + seaGlow(0.0) * 0.5;
  // Fog pouring off the far cliff. On a day of thin fog, or of low still cloud lying on the tops, it comes
  // over the rim in a sheet and slides down the face in slow ragged tongues, thinning as it falls.
  if (uSpill.x > 0.01 && p.x > -45.0 && p.y < -226.0 && d > 150.0) {
    float rim = 80.0;
    float reach = 24.0 + 48.0 * uSpill.x; // how far down the face it gets before it is gone
    float run = abs(N.x) > abs(N.z) ? p.y : p.x;
    float tongues = texture(uNoise, vec2(run * 0.011, vWorld.y * 0.016 + uSpill.y)).r * 0.65
                  + texture(uNoise, vec2(run * 0.037 + 0.3, vWorld.y * 0.045 + uSpill.y * 2.0)).g * 0.35;
    float onFace = smoothstep(rim - reach, rim - 3.0, vWorld.y) * (1.0 - smoothstep(rim + 8.0, rim + 46.0, vWorld.y));
    float sheet = uSpill.x * onFace * smoothstep(0.3, 0.72, tongues + 0.6 * onFace - 0.28);
    col = mix(col, min(uFogCol * 1.12 + 0.03, vec3(1.0)), stepped(clamp(sheet, 0.0, 0.94), 10.0, fc));
  }
  float fog = fogAmount(vWorld);
  outColor = vec4(mix(col, uFogCol, close ? stepped(fog, 28.0, fc) : floor(fog * 28.0 + 0.5) / 28.0), IS_LAND);
}
`;

// ---- grass: one small curved strip per blade ----------------------------------------

export const GRASS_VERT = `${HEAD}
${COMMON}
layout(location = 0) in vec2 aTpl;    // side (-1..1), height along the blade (0..1)
layout(location = 1) in vec4 aRoot;   // xyz, blade height
layout(location = 2) in vec4 aParams; // facing, half-width, phase, tint
layout(location = 3) in vec2 aSlope;  // which way the ground under it faces
uniform float uFlutter;
uniform float uPixel; // size of one screen pixel, per metre of distance
uniform vec2 uRes;    // the picture's size in pixels
uniform float uSnowDepth; // metres of snow lying
uniform float uBead;      // 1 while the beads of dew and glints of frost are drawn: a point on the tip of a blade
flat out vec3 vColor;
void main() {
  vec3 root = aRoot.xyz;
  float H = aRoot.w;
  float t = aTpl.y;
  vec2 p = root.xz;
  float px = uPixel * distance(root, uCam);

  float g = gust(p);
  vec2 face = vec2(cos(aParams.x), sin(aParams.x));
  float flutter = sin(uFlutter + aParams.z) + 0.5 * sin(uFlutter * 3.0 + aParams.z * 1.7);
  float lean = 0.05 + uWindAmt * (0.3 + 1.0 * g) + 0.035 * flutter * (0.5 + uWindAmt);
  vec2 bend = face * 0.24 + uWindDir * lean;
  float bl = min(length(bend), 1.25);

  // Lying snow buries the grass by its real depth: only what stands taller shows.
  // (A blade is otherwise never drawn smaller than a few pixels.)
  float left = uSnowDepth > 0.0 || uSnow > 0.0 ? 1.0 - thaw(root.xz) : 1.0; // how much of the snow is still there (NO-SNOW: not asked when there is none)
  float above = H - uSnowDepth * left;
  H = clamp(above, 3.2 * px, 26.0 * px);
  root.y += uSnowDepth * left;
  p = root.xz;
  float w = max(aParams.y, 0.52 * px);

  vec3 pos = root;
  pos.xz += bend * (H * t * t);
  pos.y += H * t * (1.0 - 0.36 * bl * bl * t);
  vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), uCam - root));
  pos += side * (aTpl.x * w * (1.0 - 0.8 * t * t));

  // Three tones up each blade. Its foot is the colour of the turf, so the
  // meadow reads as one mass; the middle is a touch brighter; and the tip is
  // brightest, flashing pale when a gust bends it.
  vec3 N = normalize(vec3(aSlope.x, sqrt(max(0.0, 1.0 - dot(aSlope, aSlope))), aSlope.y));
  float grain = fract(aParams.z * 7.31); // each blade its own, so nothing bands
  float tone = t < 0.5 ? 0.86 : t < 0.9 ? 1.05 : 1.24;
  vec3 alb = grassAlbedo(p, grain) * tone;
  if (aParams.w < 0.06) alb = uGrassLush * vec3(0.5, 0.74, 0.64) * (0.7 + 0.4 * tone); // a rush: dark and blue-green
  else if (aParams.w < 0.14) alb = mix(alb, uGrassDry * 1.2, 0.75);                    // a dry stalk
  if (t > 0.5) alb = mix(alb, uGrassLight, gustBand(p) * (t > 0.9 ? 1.0 : 0.5));
  alb = mix(alb, SNOW, uSnow * left * (t > 0.5 ? 0.35 : 1.0));

  float level = lightLevel(p, N, grain);
  // Each blade takes the traced light of the ground it stands on.
  vec4 footClip = uViewProj * vec4(root, 1.0);
  ivec2 foot = ivec2(clamp((footClip.xy / footClip.w * 0.5 + 0.5) * uRes, vec2(0.0), uRes - 1.0));
  // Hoarfrost whitens a blade from its tip down: the tip in any frost, the
  // middle in a thicker one, the whole blade in the thickest. (Each blade to
  // its own measure, so a frost thinning in the sun goes blade by blade.)
  float share = mix(sunShare(N), texelFetch(uTraceA, foot, 0).a, uTraced);
  float reach = sunReach(share);
  float rimed = rimeAt(p, reach) * (0.78 + 0.44 * grain);
  if (rimed > 0.0) {
    float white = t > 0.9 ? smoothstep(0.05, 0.42, rimed) : t > 0.5 ? 0.78 * smoothstep(0.28, 0.72, rimed) : 0.4 * smoothstep(0.5, 1.0, rimed);
    alb = mix(alb, rimeCol(), 0.8 * white);
  }
  vec3 c = mix(lit(alb, level, N, root, grain), alb * tracedLight(foot, p, grain), uTraced);
  // A flower head, drawn as a dot on top of its stem: yellow, white, pink or violet.
  if (aParams.w > 0.96) {
    vec3 petal = aParams.w < 0.975 ? vec3(1.0, 0.86, 0.22) : aParams.w < 0.985 ? vec3(0.99, 0.98, 0.93)
               : aParams.w < 0.995 ? vec3(1.0, 0.58, 0.72) : vec3(0.74, 0.58, 1.0);
    c = petal * (uAmbient * 0.95 + uLightCol * (0.3 + 0.7 * level) + warmLight(root, grain)) * (1.0 - 0.8 * uSnow * left);
    // (A frosted flower head is furred white, with only a little of its colour showing.)
    c = mix(c, rimeCol() * (uAmbient + uLightCol * level), 0.8 * smoothstep(0.1, 0.5, rimed));
  }
  gl_PointSize = clamp(floor(0.1 / px + 0.5), 1.0, 3.0);
  c *= 1.0 - 0.14 * uWet;
  vColor = mix(c, uFogCol, floor(fogAmount(pos) * 28.0 + grain) / 28.0);
  // Snap each corner to the pixel grid, so a swaying blade moves a whole pixel
  // at a time instead of shimmering.
  bool gone = above < 0.02 || (aParams.w > 0.96 && uSnow * left > 0.3); // buried, or a flower in the snow
  if (uBead > 0.5) {
    // Dew hangs a bead on the tips of many of the blades close to, and fewer
    // further off (where they would run together into a haze). In the sun a
    // bead is bright; in the shade it only holds the sky. On frost there are no
    // beads, but while the sun is low a few of its crystals catch it, slowly.
    float own = fract(aParams.z * 23.17 + aParams.x * 3.71);
    float nearTo = 1.0 - smoothstep(6.0, 48.0, distance(root, uCam));
    float sun = share * sunShade(p);
    float bead = dewAt(p, reach) * mix(0.05, 0.55, nearTo);
    float spark = rimed * uRime.z * smoothstep(0.1, 0.3, sun) * mix(0.012, 0.07, nearTo);
    vec3 drop = c;
    if (own < bead) {
      // (One bead in four brightens and dims a little, slowly, as the blade and the sun move.)
      float lit = sun * uDew.z * (fract(own * 91.7) < 0.25 ? 0.55 + 0.45 * slowGlint(fract(own * 37.1)) : 0.8);
      drop = sparkle(lit) * (0.82 + 0.18 * lit);
    } else if (1.0 - own < spark) {
      float lit = slowGlint(fract(own * 53.9));
      drop = mix(c, sparkle(sun), lit);
      if (lit < 0.2) gone = true;
    } else {
      gone = true;
    }
    vColor = mix(drop, uFogCol, floor(fogAmount(pos) * 28.0 + grain) / 28.0);
    gl_PointSize = 1.0;
    pos += normalize(uCam - pos) * 0.04; // a hair nearer than the tip it sits on
  }
  vec4 clip = gone ? vec4(2.0, 2.0, 2.0, 1.0) : uViewProj * vec4(pos, 1.0);
  vec2 grid = uRes * 0.5;
  clip.xy = floor(clip.xy / clip.w * grid + 0.5) / grid * clip.w;
  gl_Position = clip;
}
`;

export const GRASS_FRAG = `${HEAD}
flat in vec3 vColor;
out vec4 outColor;
void main() { outColor = vec4(vColor, IS_LAND); }
`;

// ---- houses, sheep and boulders ----------------------------------------------------

export const PROP_VERT = `${HEAD}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv;
layout(location = 3) in float aMat;
uniform mat4 uViewProj;
uniform vec3 uShift; // moves whatever is being drawn: a log hopping into the fire, a stone dropping onto the cairn
uniform vec2 uTurn;  // and turns it first, about the upright line through the origin: cosine and sine (1, 0 for no turn)
uniform float uGrow; // and before that makes it bigger or smaller about the origin (1 for as built): the lamb grows
uniform float uNod;  // and tips it up, by this angle, about the level line across it through the origin (0 for none): a head lifted to the sky
out vec3 vWorld;
out vec3 vNormal;
out vec2 vUv;
flat out float vMat;
void main() {
  vec2 nod = vec2(cos(uNod), sin(uNod));
  vec3 sized = vec3(aPos.x * nod.x - aPos.y * nod.y, aPos.x * nod.y + aPos.y * nod.x, aPos.z) * uGrow;
  vec3 facing = vec3(aNormal.x * nod.x - aNormal.y * nod.y, aNormal.x * nod.y + aNormal.y * nod.x, aNormal.z);
  vWorld = vec3(sized.x * uTurn.x + sized.z * uTurn.y, sized.y, sized.z * uTurn.x - sized.x * uTurn.y) + uShift;
  vNormal = vec3(facing.x * uTurn.x + facing.z * uTurn.y, facing.y, facing.z * uTurn.x - facing.x * uTurn.y);
  vUv = aUv;
  vMat = aMat;
  gl_Position = uViewProj * vec4(vWorld, 1.0);
}
`;

/**
 * The time the stone's recarving keeps: the length of a beat in seconds, how
 * many beats pass before the chisel first lands on a sign, and how many between
 * one blow and the next. (The page starts each sign on the same beat, so that
 * all the blows land together.)
 */
export const CARVE = { beat: 1 / 12, firstBlow: 4, blowGap: 3 };

export const PROP_FRAG = `${HEAD}
${COMMON}
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
flat in float vMat;
out vec4 outColor;
uniform float uLamp;
uniform float uRune;   // how brightly the carving on the stone glows
uniform vec3 uSign[9]; // each of the nine signs cut in the stone, in reading order: what it spells, what it spelled before, and how many seconds ago its recutting began
uniform float uBeacon; // the lighthouse lamp, as it turns
uniform vec4 uHome[17];    // each household: where it stands (x, z), the way its ridge runs, and half its length
uniform vec3 uHomeLit[17]; // and how brightly its three rooms are lit: behind either gable, and beside the door
uniform vec2 uCoat;        // for the lamb: how wet its wool is, and how much snow lies on its back (0, 0 for everything else)
uniform float uEmber;  // how hot the embers in the fire pit are
uniform float uMusic;  // 1 while the gramophone is playing
uniform vec3 uFill;    // where the soft second light comes from
uniform vec3 uHorizon;
uniform vec4 uBottle;  // the bottle on the beach: how wet it is (0..1), how much your pointer has picked it out (0..1), and where its glint is in its slow coming and going (0..1); the last is spare
uniform vec4 uTask;    // for a lantern by the path, or the paper lantern rising from one: how brightly it burns, how much of it is there, how far its candle has burned down with waiting, and how mossy it has grown (all 0..1)

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// ---- the carving on the standing stone ----
// Nine signs, three to a row, each a stem with strokes off it (or a ring), in a
// script nobody reads any more. A sign is 3 x 5 small marks with a gap after it.
const vec2 RUNE_AT = vec2(0.36, 0.62);   // the lower left corner of the carving on the stone's face
const vec2 RUNE_SIGN = vec2(0.3, 0.37);  // the room one sign takes
const float BEAT = ${CARVE.beat.toFixed(6)};           // the carving moves in twelfths of a second, like the grass and the flame
const float FIRST_BLOW = ${CARVE.firstBlow.toFixed(1)};            // beats before the chisel first lands: the old sign closes in that time
const float BLOW_GAP = ${CARVE.blowGap.toFixed(1)};              // beats between one blow and the next

/** Whether a small mark of a sign is cut, and by which blow of the chisel (0 to 3). */
bool cutAt(vec2 sign, ivec2 mark, float writ, out int blow) {
  blow = 0;
  if (mark.x < 0 || mark.x > 2 || mark.y < 0 || mark.y > 4) return false;
  float h1 = hash21(sign + 3.7 + writ * 37.0);
  float h2 = hash21(sign + 11.3 + writ * 91.0);
  float h3 = hash21(sign + 29.1 + writ * 53.0);
  if (fract(h3 * 17.0) < 0.22) {
    // A ring, cut from the top down.
    blow = 3 - mark.y;
    return mark.y >= 1 && mark.y <= 3 && !(mark.x == 1 && mark.y == 2);
  }
  int sideA = h2 < 0.5 ? 0 : 2;
  int sideB = fract(h2 * 7.0) < 0.5 ? 0 : 2;
  int rowA = int(h1 * 5.0);
  int rowB = int(h3 * 5.0);
  if (mark.x == 1) {
    blow = mark.y >= 3 ? 0 : 1; // the stem, in two blows from the top
    return true;
  }
  if (mark.x == sideA && (mark.y == rowA || (fract(h1 * 13.0) < 0.4 && mark.y == min(rowA + 1, 4)))) {
    blow = 2; // a stroke off it
    return true;
  }
  if (mark.x == sideB && mark.y == rowB) {
    blow = 3; // and another
    return true;
  }
  return false;
}

/**
 * How deep the stone is cut at a place in the carving (g counts signs across
 * and up), 0..1, and how hot the cut still is from the chisel.
 * A sign that is being recut first closes over, and is then struck in again
 * blow by blow; each blow leaves its marks hot, and they cool to a steady glow.
 */
float carved(vec2 g, out float heat) {
  heat = 0.0;
  if (g.x < 0.0 || g.x >= 3.0 || g.y < 0.0 || g.y >= 3.0) return 0.0;
  vec2 sign = floor(g);
  ivec2 mark = ivec2(fract(g) * vec2(4.0, 6.0));
  vec3 s = uSign[int(2.0 - sign.y) * 3 + int(sign.x)];
  float beats = floor(s.z / BEAT);
  int blow;
  if (cutAt(sign, mark, s.x, blow)) {
    float since = beats - FIRST_BLOW - BLOW_GAP * float(blow);
    if (since >= 0.0) {
      heat = exp(-since * BEAT / 0.32);
      return 1.0;
    }
  }
  // What was cut here before closes over in three beats.
  if (beats < 3.0 && cutAt(sign, mark, s.y, blow)) return 1.0 - beats / 3.0;
  return 0.0;
}

// Every household keeps its own hours. A pane of glass belongs to the house it
// is nearest, and to one of that house's rooms: behind either gable, or beside
// the door. Glass that is nobody's window (the candle in the stone, the boat's wheelhouse) is lit with the lamps.
float windowLight() {
  float lit = uLamp;
  float nearest = 150.0;
  for (int i = 0; i < 17; i++) {
    vec2 d = vWorld.xz - uHome[i].xy;
    float far = dot(d, d);
    if (far < nearest) {
      nearest = far;
      float along = d.x * cos(uHome[i].z) - d.y * sin(uHome[i].z);
      lit = abs(along) < 0.75 * uHome[i].w ? uHomeLit[i].z : along > 0.0 ? uHomeLit[i].x : uHomeLit[i].y;
    }
  }
  return lit;
}

void main() {
  vec3 N = normalize(vNormal);
  int m = int(vMat + 0.5);
  // A lantern that is coming or going is there in part: more of its pixels, in a fixed scatter, the more of it there is.
  if (m >= 40 && m <= 43 && bayer(gl_FragCoord.xy) > uTask.y) discard;
  vec3 col;
  vec3 glow = vec3(0.0);

  // Far-off buildings are drawn plainly: fine detail there would only turn to noise.
  bool distant = distance(vWorld, uCam) > 200.0;
  if (m == 0) {
    // Tarred boards, with a seam between each.
    col = !distant && fract(vUv.x / 0.36) < 0.14 ? vec3(0.075, 0.07, 0.09) : vec3(0.14, 0.13, 0.165);
  } else if (m == 1) {
    // Dry stone, in three greys.
    float cells = texture(uNoise, vUv * vec2(0.3, 0.46)).g;
    col = distant ? vec3(0.46, 0.45, 0.47) : cells < 0.4 ? vec3(0.29, 0.29, 0.33) : cells < 0.6 ? vec3(0.43, 0.42, 0.45) : vec3(0.58, 0.56, 0.55);
  } else if (m == 2) {
    col = vec3(0.2, 0.15, 0.1); // the cut edge of the turf
  } else if (m == 3) {
    col = vec3(0.93, 0.93, 0.89); // white-painted wood
  } else if (m == 4) {
    // Glass: a dull piece of sky by day, lamplight after dark.
    col = mix(vec3(0.08, 0.14, 0.22), uHorizon, 0.3);
    glow = vec3(1.0, 0.72, 0.3) * windowLight();
  } else if (m == 47) {
    // The lantern by a door: lit while anyone in the house is up.
    col = mix(vec3(0.08, 0.14, 0.22), uHorizon, 0.3);
    glow = vec3(1.0, 0.72, 0.3) * uLamp * lanternAt(vWorld.xz);
  } else if (m == 48) {
    col = vec3(0.97, 0.44, 0.12); // a puffin's bill and feet; the net floats on the boat
  } else if (m == 5) {
    // Turf roof.
    float fine = texture(uNoise, vWorld.xz * 0.23).r;
    col = grassAlbedo(vWorld.xz, bayer(gl_FragCoord.xy)) * (fine > 0.7 ? 1.1 : fine < 0.3 ? 0.88 : 1.0);
  } else if (m == 6) {
    // Wool: cream, with the shadowed hollows between its curls close to.
    col = !distant && texture(uNoise, vUv * 3.0).g > 0.55 ? vec3(0.66, 0.62, 0.56) : vec3(0.84, 0.81, 0.75);
    // Rained on, a fleece darkens and hangs in wet locks.
    if (uCoat.x > 0.0) col = mix(col, texture(uNoise, vUv * vec2(1.3, 5.0)).r > 0.5 ? vec3(0.69, 0.65, 0.59) : vec3(0.53, 0.5, 0.47), uCoat.x * 0.9);
  } else if (m == 7) {
    col = vec3(0.15, 0.13, 0.15); // a sheep's face
  } else if (m == 10) {
    col = vec3(0.42, 0.3, 0.22); // peat-brown wool
  } else if (m == 11) {
    col = vec3(0.62, 0.62, 0.64); // grey wool
  } else if (m == 12) {
    // Boards painted iron-oxide red.
    col = !distant && fract(vUv.x / 0.36) < 0.14 ? vec3(0.4, 0.11, 0.11) : vec3(0.66, 0.2, 0.17);
  } else if (m == 13) {
    // Whitewash, weathered in places.
    col = texture(uNoise, vUv * 0.33).g > 0.63 ? vec3(0.8, 0.81, 0.8) : vec3(0.93, 0.93, 0.89);
  } else if (m == 14) {
    // The cut end of a log: pale wood, a darker heart, bark round the edge.
    vec2 logs = fract(vUv / 0.27) - 0.5;
    float ring = length(logs);
    col = ring > 0.44 ? vec3(0.24, 0.16, 0.11) : ring > 0.17 ? vec3(0.86, 0.68, 0.44) : vec3(0.62, 0.43, 0.27);
  } else if (m == 15) {
    col = fract(vUv.y / 0.9) < 0.12 ? vec3(0.16, 0.17, 0.22) : vec3(0.24, 0.26, 0.32); // slate
  } else if (m == 16) {
    // The lighthouse lamp.
    col = vec3(0.5, 0.55, 0.6);
    glow = vec3(1.0, 0.96, 0.72) * uBeacon * 2.0;
  } else if (m == 61) {
    // A bottle of sea-green glass. You see into it where it faces you and along
    // the glass at its edges, so it is clear down its middle and deep round its
    // rim. The paper rolled up inside lies along its lower side, tied with a red
    // thread. The sky lies along its upper side as one pale streak, which is all
    // the light it has of its own: by night it is as dark as the stones.
    vec3 V = normalize(uCam - vWorld);
    float facing = max(dot(N, V), 0.0);
    float wet = uBottle.x;
    col = facing > 0.78 ? vec3(0.17, 0.74, 0.5) : facing > 0.42 ? vec3(0.07, 0.5, 0.37) : vec3(0.02, 0.25, 0.22);
    if (vUv.x > 0.04 && vUv.x < 0.23 && dot(N, normalize(V - vec3(0.0, 0.42, 0.0))) > 0.93) {
      col = abs(vUv.x - 0.135) < 0.009 ? vec3(0.7, 0.18, 0.13) : vec3(0.86, 0.8, 0.56);
    }
    // Wet glass is darker, and shines the more for it; so does glass you have noticed.
    col *= (1.0 - 0.22 * wet) * (1.0 + 0.25 * uBottle.y);
    float streak = dot(N, normalize(V + vec3(0.0, 1.5, 0.0)));
    if (streak > 0.978 - 0.012 * wet - 0.02 * uBottle.y) {
      // (Glass finds what light there is: under the moon the streak is fainter, but it is still there.)
      vec3 sky = uAmbient + uLightCol * 0.6;
      sky /= 0.2 + dot(sky, vec3(0.3, 0.5, 0.2));
      col = mix(col, vec3(0.66, 0.92, 0.8), 0.74 + 0.2 * max(wet, uBottle.y));
      glow = vec3(0.34, 0.44, 0.4) * sky * (0.55 + 0.45 * max(wet, uBottle.y));
      // Fresh from the sea it glints: a few points along that streak brighten and fade, slowly.
      // (An empty one waiting to be written glints too, more faintly: it is how you find it.)
      if (fract(vUv.x * 9.0 + 0.2) < 0.22) glow += vec3(0.5, 0.6, 0.58) * sky * (0.45 + 0.55 * wet) * uBottle.z;
    }
  } else if (m == 62) {
    // Its cork.
    col = texture(uNoise, vUv * vec2(60.0, 2.0)).g > 0.6 ? vec3(0.62, 0.44, 0.26) : vec3(0.86, 0.66, 0.42);
  } else if (m == 40) {
    // The iron of a lantern by the path: blackened, rusting a little where the rain sits, and holding snow on its roof.
    col = texture(uNoise, vUv * 2.3).g > 0.6 ? vec3(0.21, 0.14, 0.11) : vec3(0.11, 0.11, 0.135);
    // A lantern left standing for days gathers moss: on its roof first, then creeping over the rest.
    if (uTask.w > 0.0 && texture(uNoise, vUv * 3.7 + 0.31).r + (N.y > 0.3 ? 0.28 : 0.0) > 1.08 - 0.72 * uTask.w) col = mix(uGrassLush, vec3(0.15, 0.3, 0.12), 0.5) * (0.8 + 0.4 * texture(uNoise, vUv * 9.0).g);
    if (uSnow > 0.35 && N.y > 0.45 && uSnow * (1.0 - thaw(vWorld.xz)) > 0.35) col = SNOW;
  } else if (m == 41) {
    // Its glass, and the candle inside. Unlit, the glass is a dull piece of sky
    // and the candle a pale stub. Lit, it is a deep amber, brightest round the
    // flame and darker toward the corners, and it never burns out to yellow.
    // (A candle that has waited for days has burned down: its flame sits lower in the glass, and is smaller.)
    vec2 fromWick = vec2(vUv.x - 0.085, vUv.y - 0.12 + 0.075 * uTask.z);
    bool candle = abs(fromWick.x) < 0.021 && fromWick.y < -0.015;
    col = (candle ? vec3(0.84, 0.8, 0.68) : mix(vec3(0.08, 0.14, 0.22), uHorizon, 0.3)) * (1.0 - 0.8 * uTask.x);
    float near = 1.0 - clamp(length(fromWick * vec2(1.0, 0.8)) / (0.15 - 0.06 * uTask.z), 0.0, 1.0);
    float warm = floor(near * 3.0 + bayer(gl_FragCoord.xy)) / 3.0;
    glow = mix(vec3(0.66, 0.22, 0.03), vec3(1.0, 0.5, 0.13), warm) * uTask.x;
  } else if (m == 42) {
    // A paper lantern rising away: thin orange paper lit from inside by the
    // flame at its mouth, so deepest in colour over its crown; and a darker
    // hoop round the mouth, which holds it open.
    float up = clamp(vUv.y / 0.455, 0.0, 1.0);
    float warm = floor((1.0 - up * up) * 3.0 + bayer(gl_FragCoord.xy)) / 3.0;
    bool hoop = vUv.y < 0.03;
    col = (hoop ? vec3(0.3, 0.17, 0.09) : vec3(0.86, 0.5, 0.24)) * (1.0 - 0.7 * uTask.x);
    glow = (hoop ? vec3(0.4, 0.12, 0.02) : mix(vec3(0.6, 0.19, 0.03), vec3(1.0, 0.49, 0.12), warm)) * uTask.x;
  } else if (m == 43) {
    // The stake a lantern stands on: weathered wood.
    col = texture(uNoise, vUv * vec2(2.5, 0.3)).r > 0.55 ? vec3(0.5, 0.39, 0.29) : vec3(0.38, 0.29, 0.22);
    // (Moss climbs the stake from the grass.)
    if (uTask.w > 0.0 && texture(uNoise, vUv * vec2(5.0, 1.3) + 0.6).g > 1.0 - 0.7 * uTask.w) col = mix(uGrassLush, vec3(0.15, 0.3, 0.12), 0.5);
  } else if (m >= 44 && m <= 46) {
    // A pebble laid on the old stone for something remembered: white, cream or
    // pale grey, flecked a little. In winter snow sits only on the very top of
    // it, so that the pebbles can still be counted.
    col = m == 44 ? vec3(0.93, 0.92, 0.87) : m == 45 ? vec3(0.87, 0.8, 0.67) : vec3(0.7, 0.72, 0.76);
    if (texture(uNoise, vUv * 3.1).g > 0.6) col *= 0.87;
    if (uSnow > 0.35 && N.y > 0.8 && uSnow * (1.0 - thaw(vWorld.xz)) > 0.35) col = SNOW;
  } else if (m == 23) {
    // Brass: bright where it turns up to the sky, deep gold in its folds, and
    // never quite dull, because polished metal gives back the sky all round it.
    col = N.y > 0.5 ? vec3(1.0, 0.88, 0.5) : N.y > -0.2 ? vec3(0.95, 0.72, 0.3) : vec3(0.7, 0.48, 0.18);
    glow = col * uAmbient * 0.45;
  } else if (m == 24) {
    // Down the throat of the horn: dark, and warm while it plays.
    col = vec3(0.4, 0.26, 0.1);
    glow = vec3(1.0, 0.66, 0.26) * uMusic * 0.25;
  } else if (m == 25) {
    // The inside of the bell: polished, and brighter than the outside.
    col = vec3(1.0, 0.84, 0.44);
    glow = col * uAmbient * 0.6 + vec3(1.0, 0.7, 0.3) * uMusic * 0.08;
  } else if (m == 26) {
    // Walnut, with a little grain.
    col = texture(uNoise, vUv * vec2(0.4, 3.0)).r > 0.5 ? vec3(0.52, 0.31, 0.17) : vec3(0.43, 0.25, 0.14);
  } else if (m == 17) {
    col = vec3(0.72, 0.2, 0.17); // red paint
  } else if (m == 21) {
    col = vec3(0.86, 0.66, 0.3); // ochre paint, and hay
  } else if (m == 22) {
    col = vec3(0.36, 0.5, 0.66); // blue-grey paint
  } else if (m == 20) {
    col = vec3(0.9, 0.72, 0.47); // freshly cut wood
  } else if (m == 19) {
    col = texture(uNoise, vUv * vec2(2.5, 0.2)).r > 0.55 ? vec3(0.56, 0.4, 0.27) : vec3(0.42, 0.29, 0.2); // bark
  } else if (m == 18) {
    // Charred wood and ash in the fire pit. It glows while there are embers.
    float ash = texture(uNoise, vUv * 1.7).r;
    col = ash > 0.66 ? vec3(0.34, 0.32, 0.31) : vec3(0.09, 0.075, 0.07);
    glow = vec3(1.0, 0.36, 0.07) * uEmber * (ash < 0.5 ? 1.0 : 0.35);
  } else {
    // Boulders and the standing stone: weathered rock, with moss where it stays damp.
    col = texture(uNoise, vUv * 0.5).r > 0.55 ? vec3(0.47, 0.45, 0.47) : vec3(0.36, 0.35, 0.39);
    float damp = texture(uNoise, vWorld.xz * 0.8 + vWorld.y * 0.31).a + N.y * 0.3;
    if (m == 9) {
      col *= 1.5;
      damp += smoothstep(1.6, 2.0, vUv.y) * 0.34 + rstep(0.5, 0.05, vUv.y) * 0.3;
      // The carving. Its light is a deep amber that never burns out to yellow:
      // lit harder, it spills onto the rock beside the cuts instead.
      vec2 g = (vUv - RUNE_AT) / RUNE_SIGN;
      vec2 cell = fract(g * vec2(4.0, 6.0)); // where this pixel sits inside its small mark
      float heat;
      float deep = carved(g, heat);
      float lit = min(uRune, 1.0);
      float over = max(uRune - 1.0, 0.0);
      if (deep > 0.0) {
        // A cut holds the light, except along its upper edge, where the wall of
        // the groove stands in its own shadow.
        float hA;
        float wall = carved(g + vec2(0.0, 1.0 / 6.0), hA) <= 0.0 && cell.y > 0.5 ? 1.0 : 0.0;
        col *= mix(1.0, mix(0.34, 0.18, wall), deep);
        glow = (vec3(1.0, 0.44, 0.1) * lit * mix(1.0, 0.5, wall) + vec3(0.0, 0.05, 0.03) * over) * deep * deep
             + vec3(0.3, 0.24, 0.3) * heat * mix(1.0, 0.6, wall); // fresh from the chisel: paler, never yellow
        damp = 0.0;
      } else if (g.x > -0.3 && g.x < 3.3 && g.y > -0.3 && g.y < 3.3) {
        // Uncut rock beside a cut: the lip under a groove catches the light, and
        // the heat and the glow of the cuts spill a little way onto it.
        float hU, hD, hL, hR;
        float up = carved(g + vec2(0.0, 1.0 / 6.0), hU);
        float down = carved(g - vec2(0.0, 1.0 / 6.0), hD);
        float left = carved(g - vec2(0.25, 0.0), hL);
        float right = carved(g + vec2(0.25, 0.0), hR);
        if (up > 0.0 && cell.y > 0.5) col *= 1.0 + 0.3 * up;
        float near = max(max(up, down), max(left, right));
        float warm = max(max(hU, hD), max(hL, hR));
        if (near > 0.0) {
          glow = vec3(0.34, 0.11, 0.02) * (0.35 * lit + over) * near + vec3(0.42, 0.15, 0.06) * warm;
          damp = 0.0;
        }
      }
      // Chips fly from each blow and fall down the face of the stone.
      if (g.x > -0.6 && g.x < 3.6 && g.y > -2.0 && g.y < 3.2) {
        float chip = 0.0;
        float spark = 0.0;
        vec2 here = floor(vUv / 0.032); // one chip is one pixel of the picture
        for (int i = 0; i < 9; i++) {
          vec3 s = uSign[i];
          float beats = floor(s.z / BEAT);
          if (beats > FIRST_BLOW + BLOW_GAP * 3.0 + 9.0) continue;
          vec2 home = vec2(float(i % 3), 2.0 - float(i / 3));
          for (int k = 0; k < 4; k++) {
            float since = (beats - FIRST_BLOW - BLOW_GAP * float(k)) * BEAT;
            if (since < 0.0 || since > 0.7) continue;
            for (int j = 0; j < 3; j++) {
              vec2 r = vec2(hash21(home + float(k) * 7.3 + float(j) * 3.1 + s.x * 19.0), hash21(home.yx + float(k) * 2.9 + float(j) * 5.7 + s.x * 43.0));
              vec2 from = home + vec2(0.2 + 0.4 * r.x, 0.78 - 0.17 * float(k));
              // Thrown a little way out, then down: slowly at first, then faster.
              vec2 at = from + vec2((r.y - 0.5) * 1.5 * since, (0.5 + 0.6 * r.x) * since - 4.6 * since * since);
              if (all(equal(here, floor((RUNE_AT + at * RUNE_SIGN) / 0.032)))) {
                chip = 1.0;
                spark = max(spark, 1.0 - since / 0.2);
              }
            }
          }
        }
        if (chip > 0.0) {
          col = vec3(0.92, 0.88, 0.82);
          glow = vec3(1.0, 0.5, 0.3) * spark;
          damp = 0.0;
        }
      }
    }
    if (damp > 0.82) col = mix(uGrassLush, vec3(0.15, 0.3, 0.12), 0.45);
  }

  // Hoarfrost on whatever looks up at the sky: the turf and slate of the roofs,
  // the tops of the walls and the boulders, the cap of the standing stone. It
  // thins down their shoulders, and goes first from the side the sun is on.
  float rimed = 0.0;
  float rimeSun = 0.0;
  if (uRime.x > 0.01 && (m == 0 || m == 1 || m == 5 || m == 8 || m == 9 || m == 15)) {
    rimeSun = mix(sunShare(N), texelFetch(uTraceA, ivec2(gl_FragCoord.xy), 0).a, uTraced * (distance(vWorld, uCam) < 300.0 ? 1.0 : 0.0));
    float hoar = texture(uNoise, vWorld.xz * 0.9 + vWorld.y * 0.37).b;
    rimed = rimeAt(vWorld.xz, sunReach(rimeSun)) * smoothstep(0.1, 0.7, N.y) * (0.7 + 0.6 * hoar);
    col = mix(col, rimeCol(), 0.66 * floor(smoothstep(0.14, 0.8, rimed) * 4.0 + bayer(gl_FragCoord.xy)) / 4.0);
  }
  if (uSnow > 0.35 && (m == 5 || m == 8 || m == 9 || m == 15) && N.y > 0.45 && uSnow * (1.0 - thaw(vWorld.xz)) > 0.35) col = SNOW;
  // Falling snow settles on the lamb's back: on what faces the sky first, and further down its sides as more gathers.
  if (m == 6 && uCoat.y > 0.02 && N.y + 0.3 * texture(uNoise, vUv * 2.2).b > mix(1.28, 0.45, uCoat.y)) col = SNOW;

  // Besides the sun, things are lit softly from over your left shoulder, in
  // three steps, so their roundness shows even when they stand in shade.
  float form = floor(smoothstep(-0.4, 0.75, dot(N, uFill)) * 5.0 + bayer(gl_FragCoord.xy)) / 5.0;
  float grain = bayer(gl_FragCoord.xy);
  vec3 light = uAmbient * mix(0.66, 1.18, form) + uLightCol * lightLevel(vWorld.xz, N, grain) + warmLight(vWorld, grain);
  vec3 traced = tracedLight(ivec2(gl_FragCoord.xy), vWorld.xz, grain) * mix(0.88, 1.08, form);
  col = col * mix(light, traced, uTraced * (distance(vWorld, uCam) < 300.0 ? 1.0 : 0.0)) * (1.0 - 0.1 * uWet) + glow;
  // A crystal of the frost catching the low sun, here and there.
  if (rimed * uRime.z > 0.05 && distance(vWorld, uCam) < 90.0) {
    float own = hash21(floor(gl_FragCoord.xy) + 7.0);
    float sun = rimeSun * sunShade(vWorld.xz);
    if (own < 0.02 * rimed * uRime.z * smoothstep(0.1, 0.3, sun)) col = mix(col, sparkle(sun), slowGlint(own * 50.0));
  }
  outColor = vec4(mix(col, uFogCol, stepped(fogAmount(vWorld), 28.0, gl_FragCoord.xy)), IS_OBJECT);
  // (A lantern that is only partly there is given no dark line round each of its scattered pixels.)
  if (m >= 40 && m <= 43 && uTask.y < 0.97) outColor.a = IS_LAND;
}
`;

// ---- sea ---------------------------------------------------------------------

export const SEA_VERT = `${HEAD}
${COMMON}
layout(location = 0) in vec2 aXZ;
uniform vec3 uRocks[31];
// COMBERS. A rock standing in the water breaks the wave that meets it: in its lee, toward the shore,
// the wave is lower, and closes in again behind it only gradually. 0 in the open, up to 0.55 close in
// behind a rock. The place is given as measured from the water's edge (x out to sea, y along the shore).
float lee(vec2 sv) {
  float calm = 0.0;
  for (int i = 0; i < 31; i++) {
    vec2 rs = fromShore(uRocks[i].xy);
    if (rs.x < 0.5) continue; // it stands on the beach, not in the sea
    float edge = uRocks[i].z * 0.74;
    float behind = rs.x - sv.x;
    float reach = 7.0 * edge + 1.5;
    if (behind < -edge || behind > reach) continue;
    float wide = edge * (1.15 - 0.75 * max(behind, 0.0) / reach) + 0.15;
    calm = max(calm, 0.55 * (1.0 - smoothstep(0.15 * wide, 1.35 * wide, abs(sv.y - rs.y))) * (1.0 - smoothstep(0.25 * reach, reach, behind)) * smoothstep(-edge, 0.5 * edge, behind));
  }
  return calm;
}
uniform float uSwell; // 1 for the fine piece of sea off the beach, which rises and falls with the waves; 2 for the piece round the boat when you are out in her, which rises and falls with the swell (AFLOAT: see afloat.ts); 0 for the rest, which lies level
uniform vec4 uWaveA, uWaveB;
${SWELL}
out vec3 vWorld;
void main() {
  // (The fine piece lies a hair above the level sea, so the two never fight over a pixel.)
  if (uSwell > 1.5) vWorld = vec3(aXZ.x, openSwell(aXZ).x + 0.006 + uTide.x, aXZ.y);
  else vWorld = vec3(aXZ.x, (uSwell > 0.5 ? seaRise(aXZ) * (1.0 - lee(fromShore(aXZ))) + 0.006 : 0.0) + uTide.x, aXZ.y);
  gl_Position = uViewProj * vec4(vWorld, 1.0);
}
`;

export const SEA_FRAG = `${HEAD}
${COMMON}
in vec3 vWorld;
out vec4 outColor;
uniform vec3 uSeaDeep, uSeaPale, uGlint;
uniform vec2 uSeaA;          // drifting patches of ruffled water
uniform vec4 uWaveA, uWaveB; // where each of eight wave trains has got to
uniform float uSwell;        // (AFLOAT) 2 for the piece of sea round the boat when you are out in her
${SWELL}
${IN_BOAT}
uniform vec4 uRipple[8];     // rings spreading where a stone has touched: x, z, age (0..1), size
uniform vec3 uRocks[31];     // the stones standing on the beach and in the shallows: where each is (x, z) and how big
// COMBERS. A rock standing in the water breaks the wave that meets it: in its lee, toward the shore,
// the wave is lower, and closes in again behind it only gradually. 0 in the open, up to 0.55 close in
// behind a rock. The place is given as measured from the water's edge (x out to sea, y along the shore).
float lee(vec2 sv) {
  float calm = 0.0;
  for (int i = 0; i < 31; i++) {
    vec2 rs = fromShore(uRocks[i].xy);
    if (rs.x < 0.5) continue; // it stands on the beach, not in the sea
    float edge = uRocks[i].z * 0.74;
    float behind = rs.x - sv.x;
    float reach = 7.0 * edge + 1.5;
    if (behind < -edge || behind > reach) continue;
    float wide = edge * (1.15 - 0.75 * max(behind, 0.0) / reach) + 0.15;
    calm = max(calm, 0.55 * (1.0 - smoothstep(0.15 * wide, 1.35 * wide, abs(sv.y - rs.y))) * (1.0 - smoothstep(0.25 * reach, reach, behind)) * smoothstep(-edge, 0.5 * edge, behind));
  }
  return calm;
}

// Swell comes in from the open sea toward the shore, whatever the local wind is doing.
const float LEN[8] = float[8](300.0, 120.0, 47.0, 29.0, 17.0, 9.0, 5.3, 3.1);
const float ANG[8] = float[8](1.4, 1.1, 1.25, 1.62, 0.95, 1.9, 1.45, 0.7);
const float AMP[8] = float[8](0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.0, 0.9);
// The small waves and ripples that only show close to: their lengths, the way
// each runs, and how fast its phase turns (as the square root of 1 / length).
uniform vec3 uFoamCol; // white water, as the light of the hour has it
uniform float uFine; // an angle that each of them turns a whole number of times as fast as, so all come round together
const float FINE_LEN[6] = float[6](6.1, 3.7, 2.1, 1.2, 0.66, 0.37);
const float FINE_ANG[6] = float[6](1.15, 1.75, 0.8, 2.05, 1.4, 0.55);
const float FINE_RUN[6] = float[6](2.0, 3.0, 4.0, 5.0, 7.0, 9.0);

void main() {
  // (AFLOAT) There is no water inside a boat.
  if (inBoat(vWorld)) discard;
  vec2 p = vWorld.xz;
  vec2 fc = gl_FragCoord.xy;
  vec3 V = normalize(uCam - vWorld);
  float d = distance(uCam, vWorld);
  // How much water one pixel covers. Waves smaller than that are left out.
  float reach = max(length(dFdx(p)), length(dFdy(p)));

  float wave = 0.0;
  float total = 0.001;
  for (int i = 0; i < 8; i++) {
    float phase = i < 4 ? uWaveA[i] : uWaveB[i - 4];
    vec2 dir = vec2(cos(ANG[i]), sin(ANG[i]));
    float keep = AMP[i] * (1.0 - smoothstep(0.12, 0.5, reach / LEN[i]));
    wave += keep * cos(dot(dir, p) * (6.2831853 / LEN[i]) - phase);
    total += keep;
  }
  wave /= max(total, 1.6); // roughly -1..1, fading to nothing where no wave is big enough to see

  // The wind ruffles the surface in moving patches.
  float ruffle = texture(uNoise, mat2(0.866, 0.5, -0.5, 0.866) * p * 0.0035 + uSeaA).r;
  float rough = (0.55 + 1.1 * uWindAmt + 0.3 * uWet) * (0.6 + 0.8 * ruffle);

  float shade = sunShade(p);
  float shadeHere = shade;

  // Dark where you look down into it, pale toward the horizon where it mirrors the sky.
  // (AFLOAT: round the boat the water has slopes of its own. The face of a swell that leans toward you is
  // looked into, and is dark; its back, leaning away, mirrors the sky.)
  float seen = max(V.y, 0.0);
  if (uSwell > 1.5) {
    vec3 sw = openSwell(p);
    seen = max(dot(V, normalize(vec3(-sw.y, 1.0, -sw.z))), 0.0);
  }
  float mirror = stepped(pow(1.0 - seen, 2.5), 7.0, fc);
  vec3 col = mix(uSeaDeep, uSeaPale, 0.12 + 0.8 * mirror);

  // The sea cliff stands in the water under it: where the line from your eye,
  // glancing off the surface, would climb into the cliff, the water is dark with it.
  if (p.y < -150.0 && p.y > -2500.0 && p.x > -260.0) {
    vec2 run = normalize(-V.xz + vec2(1.0e-5, 0.0));
    float climb = V.y / max(length(V.xz), 1.0e-4); // metres the glanced line rises for each metre it goes
    float reached = 12.0 + 6.0 * bayer(fc);
    float over = 0.0;
    for (int i = 0; i < 9; i++) {
      vec2 q = p + run * reached;
      if (q.y < -236.0) {
        float cx = 15.0 + 100.0 * smoothstep(-332.0, -320.0, q.y);
        float cliff = smoothstep(cx - 2.0, cx + 9.0, q.x) * (1.0 - smoothstep(-256.0, -236.0, q.y)) * (76.0 + 0.36 * clamp((q.x < 115.0 ? -328.0 : -246.0) - q.y, 0.0, 95.0));
        if (climb * reached < cliff) { over = 1.0; break; }
      }
      reached *= 1.55;
    }
    // (Broken by the waves on it: more of it shows in the troughs than on the crests.)
    if (over > 0.0) col = mix(col, uSeaDeep * 0.62 + uAmbient * vec3(0.05, 0.05, 0.065), 0.72 * mirror);
  }

  // Wave marks: crests a tone paler, troughs a tone darker.
  float w = wave * rough;
  if (w > 0.13) col = mix(col, uSeaPale, 0.62);
  else if (w < -0.17) col = mix(col, uSeaDeep, 0.5);

  // Close to, the water is not smooth between those marks: small waves and
  // ripples, each drawn only where a pixel is fine enough to hold it.
  float chop = 0.0;
  if (d < 140.0) {
    float had = 0.001;
    for (int i = 0; i < 6; i++) {
      vec2 dir = vec2(cos(FINE_ANG[i]), sin(FINE_ANG[i]));
      float keep = 1.0 - smoothstep(0.1, 0.42, reach / FINE_LEN[i]);
      // (They run at the speed water gives a wave of their length, so the short ones hurry.)
      chop += keep * cos(dot(dir, p) * (6.2831853 / FINE_LEN[i]) - uFine * FINE_RUN[i] + float(i) * 1.7);
      had += keep;
    }
    chop = chop / max(had, 2.2) * (0.7 + 0.9 * uWindAmt + 0.5 * ruffle);
    float near = 1.0 - smoothstep(60.0, 140.0, d);
    if (chop > 0.2) col = mix(col, uSeaPale, 0.5 * near);
    else if (chop < -0.24) col = mix(col, uSeaDeep, 0.42 * near);
    // And the very crests of the small ones catch the light.
    if (chop > 0.46 && shadeHere > 0.5) col = mix(col, uGlint, 0.35 * near * step(0.0, uLightDir.y));
  }

  // Off the beach the bottom shelves away gently: the water over it is paler and greener.
  vec2 sv = fromShore(p);
  float span = 1.0 - smoothstep(0.75, 1.3, abs(sv.y) / uSurf.w);
  float shallow = (1.0 - smoothstep(0.0, 8.0, sv.x)) * span;
  col = mix(col, mix(uSeaDeep, uSeaPale, 0.72) * vec3(0.86, 1.07, 1.0), 0.42 * shallow);

  // Cloud shadow.
  if (shade < 0.5) col *= 0.88;

  // Glitter: the light's path on the water, as scattered bright dashes.
  vec3 R = reflect(-V, vec3(0.0, 1.0, 0.0));
  float path = pow(max(dot(R, uLightDir), 0.0), 22.0) * shade;
  float dash = textureLod(uNoise, vec2(p.x * 0.07, p.y * 0.012) + uSeaA * 7.0, 0.0).g * 0.55 + (wave * 0.5 + 0.5) * 0.45;
  // (Close to, it is the ripples that carry it: flecks on their crests, never a sheet of light.)
  float flecks = 1.0 - smoothstep(25.0, 110.0, d);
  dash = mix(dash, dash * 0.45 + clamp(chop * 1.4 + 0.5, 0.0, 1.0) * 0.5, flecks);
  if (dash > 0.99 - mix(0.6, 0.42, flecks) * path) col = uGlint;

  // Whitecaps when it blows.
  if (uWindAmt > 0.3 && d < 1500.0) {
    float crest = textureLod(uNoise, mat2(0.391, -0.92, 0.92, 0.391) * p * 0.03 + uSeaA * 3.0, 0.0).g * 0.6 + ruffle * 0.4;
    if (crest > 1.0 - 0.28 * uWindAmt && w > -0.05) col = mix(uSeaPale, vec3(1.0), 0.6) * (uAmbient + uLightCol * 0.5);
  }

  // Where a wave stands up out of the sea, light comes through the top of it.
  float lifted = vWorld.y - uTide.x;
  if (uSwell > 1.5) lifted -= SW_MEAN * uAfloat.z * swellFade(p); // (AFLOAT: only the crests of the swell, not the whole of it)
  if (lifted > 0.05) col = mix(col, mix(uSeaPale, uSeaDeep, 0.25) * vec3(0.88, 1.08, 1.02), min(0.55, (lifted - 0.05) * 1.5));

  // Surf. A wave comes in as a dark face with a pale back; as the bottom rises
  // under it the crest whitens and it breaks, trailing white water, and when it
  // lands it leaves the shallows frothing while its sheet runs up the stones.
  if (sv.x > -1.0 && sv.x < 22.0 && span > 0.0) {
    float calm = lee(sv);
    for (int k = 0; k < 2; k++) {
      float life = waveLife(k);
      // (COMBERS: each wave by its own size and shape; lower in the lee of a rock.)
      float size = waveSize(k) * crestTall(sv.y, k) * (1.0 - calm);
      // The crest is not ruled straight: its ends lag behind its middle, it lies aslant, and it wavers.
      float at = 17.0 * pow(max(1.0 - life / LANDS, 0.0), 1.2);
      float off = sv.x - at - crestLag(sv.y, k) * (0.2 + at / 17.0); // behind the crest (+) or in front of it (-), in metres
      float broke = 1.0 - smoothstep(2.2 + 3.5 * size, 4.2 + 5.5 * size, at);
      float foam = 0.0;
      if (life < LANDS) {
        float wide = 0.45 + 0.5 * size;
        float tall = 1.0 - smoothstep(9.0, 17.0, at); // it stands up out of the swell as it nears
        if (off > -wide && off <= 0.0) col = mix(col, uSeaDeep * 0.8, 0.62 * tall * span);
        else if (off > 0.0 && off < wide * 1.5) col = mix(col, uSeaPale, 0.5 * tall * span * (1.0 - broke));
        // The crest itself: a thread of white as it steepens, a solid line once it has broken...
        foam = (1.0 - smoothstep(0.0, 0.14 + 0.3 * broke, abs(off + 0.08))) * (0.5 * size * tall + 1.1 * broke);
        // ...and behind it the white water it leaves, thinning with distance.
        foam = max(foam, step(0.0, off) * broke * (1.0 - smoothstep(0.0, 1.0 + 3.6 * broke, off)) * 0.78);
        // As a big one goes over, its lip is thrown forward of the face and comes down in front of it:
        // white for a moment where the water was dark, most at the peak, where it breaks hardest.
        float going = broke * (1.0 - broke) * 4.0; // 1 in the middle of breaking, 0 before and after
        foam = max(foam, step(off, 0.0) * going * smoothstep(0.35, 0.8, size) * (1.0 - smoothstep(0.0, 0.5 + 1.3 * size, -off)) * 1.05);
      } else {
        // Landed: what is left of it seethes between the shore and a few metres out, and thins as it drains.
        foam = (1.0 - smoothstep(LANDS, 0.94, life)) * (1.0 - smoothstep(0.4, 2.4 + 3.0 * size, sv.x)) * 0.78;
      }
      foam *= span;
      // Foam is lace, not a sheet: long streaks lying along the shore, with water between.
      float lace = texture(uNoise, vec2(sv.y * 0.16 + float(k) * 0.31, sv.x * 0.36 + life * 0.9)).b * 0.65 + texture(uNoise, vec2(sv.y * 0.47, sv.x * 0.9 - life * 0.6)).r * 0.35;
      // (On a glowing night it is brightest where the wave has only just broken, and dies down as the foam goes slack.)
      float stirred = life < LANDS ? 1.0 : 1.0 - smoothstep(LANDS, 0.9, life);
      if (foam > 0.9) col = uFoamCol + seaGlow(stirred);
      else if (foam > lace * 1.15 + 0.13) col = mix(col, uFoamCol + seaGlow(stirred * foam), 0.86);
      // (And the water between the streaks of foam is faintly lit from within.)
      else if (uSeaGlow > 0.02 && foam > lace * 0.8 + 0.08) col += seaGlow(0.0) * stirred;
    }
  }

  // Where a wave meets a rock standing in the water. As the crest strikes, white
  // water bursts round it; it closes in a seething ring that spreads and thins;
  // and it streams away on the shoreward side, the longer the bigger the wave.
  // Between waves the swell still laps a thin collar round each rock.
  if (sv.x > 0.2 && sv.x < 24.0 && span > 0.0) {
    for (int i = 0; i < 31; i++) {
      vec3 rock = uRocks[i];
      vec2 rs = fromShore(rock.xy);
      if (rs.x < 0.5) continue; // it stands on the beach, not in the sea
      vec2 dd = sv - rs;        // from the rock: x out to sea, y along the shore
      float edge = rock.z * 0.74; // about where its waterline is
      if (abs(dd.y) > edge + 3.5 || dd.x > edge + 2.5 || dd.x < -edge - 11.0) continue;
      float round = length(dd) - edge;
      float white = 0.4 * (1.0 - smoothstep(0.0, 0.18 + 0.22 * uSurf.y, round));
      for (int k = 0; k < 2; k++) {
        vec2 hit = crestPast(rs, k);
        if (hit.x < -0.3 || hit.y <= 0.0) continue;
        float fresh = 1.0 - smoothstep(0.0, 4.5 + 4.0 * hit.y, hit.x); // 1 as it strikes, 0 once the crest is well past
        float force = min(hit.y, 1.3);
        white = max(white, 1.25 * fresh * force * (1.0 - smoothstep(0.15 + 0.7 * force, 0.5 + 2.4 * force * (1.25 - fresh), round)));
        float shoreward = -dd.x;
        if (shoreward > 0.0) {
          white = max(white, 1.1 * fresh * force * (1.0 - smoothstep(edge * 0.6, edge * 0.85 + 0.22 * shoreward, abs(dd.y))) * (1.0 - smoothstep(1.0, 2.5 + 7.5 * force, shoreward)));
        }
      }
      if (white > 0.0) {
        float lace = texture(uNoise, vec2(dd.y * 0.5 + float(i) * 0.37, dd.x * 0.5 + uSurf.x * 2.0)).b * 0.6 + texture(uNoise, vec2(dd.y * 1.3, dd.x * 1.1 - uSurf.x * 3.0)).r * 0.4;
        if (white > 0.95) col = uFoamCol + seaGlow(1.0);
        else if (white > lace * 1.1 + 0.12) col = mix(col, uFoamCol + seaGlow(white), 0.86);
      }
    }
  }

  // Where a skipping stone has touched, rings spread and fade: two of them, one inside the other.
  for (int i = 0; i < 8; i++) {
    float age = uRipple[i].z;
    if (age >= 1.0 || uRipple[i].w <= 0.0) continue;
    float out1 = length(p - uRipple[i].xy);
    float reach = (1.0 + 11.0 * sqrt(age)) * uRipple[i].w;
    // (Seen at a low angle, a ring far out must be drawn thick to cover even one
    // row of pixels: the lower your eye and the further the ring, the thicker.)
    float thick = (0.25 + 0.4 * age) * min(1.0, uRipple[i].w * 2.0) + 0.0015 * d * d / uCam.y;
    if (abs(out1 - reach) < thick || (age > 0.12 && abs(out1 - reach * 0.55) < thick * 0.8)) col = mix(col, uGlint + seaGlow(1.0 - age), (1.0 - age) * (1.0 - age) * 0.9);
  }

  // PATH-TRACE: off the beach the water lies in the same shadows as the stones under it. (Only there:
  // further out what is under the water is the coarse bottom, which rays know nothing of.)
  col *= mix(1.0, mix(0.7, 1.0, tracedSun(fc)), span * (1.0 - smoothstep(16.0, 24.0, sv.x)));
  outColor = vec4(mix(col, uFogCol, stepped(fogAmount(vWorld), 14.0, fc)), IS_SEA);
}
`;

// ---- the waterfall -----------------------------------------------------------------

// The wind at the fall, shared by its two shaders. The face the water comes
// down looks toward you (+z). Wind blowing onto that face is turned upward by
// it, wind along it carries the water sideways, and wind off the top throws it
// outward. The wind comes in the broad gusts that cross the grass (not the
// quick small ones: the fall changes over seconds, never in a moment).
const FALL_WIND = `
const int FALL_ROWS = 36; // as many as the ribbon is built with (see buildFall)
// How hard it blows at the lip just now, 0 to a little over 1.
float fallWind() {
  float g = textureLod(uNoise, uLip.xz * 0.0045 + uScrollA, 0.0).r;
  return clamp(uWindAmt * (0.9 + 0.2 * smoothstep(0.25, 0.75, g)), 0.0, 1.2);
}
// How far down the fall the water holds together before the wind tears it to
// spray: past its foot in a breeze, half way in a strong wind, and above the
// lip in a gale (so that all of it is spray from the start).
float tearAt(float w) {
  return mix(1.15, -0.14, smoothstep(0.2, 1.0, w));
}
float tornAt(float s, float w) {
  float tear = tearAt(w);
  return smoothstep(tear - 0.12, tear + 0.2, s);
}
`;

export const FALL_VERT = `${HEAD}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUv; // across 0..1, down 0..1
uniform mat4 uViewProj;
uniform vec2 uWindDir;
uniform float uWindAmt;
uniform sampler2D uNoise;
uniform vec2 uScrollA;
uniform vec3 uLip;    // where the water leaves the rim of the cliff
uniform float uSpray; // 0 for the ribbon of water, 1 for the spray at its foot
out vec2 vUv;
out vec3 vWorld;
out vec2 vBlown; // how far the water here is torn to spray (0..1), and how hard it blows
${FALL_WIND}
// Which way the water is going at a point of its path (s runs from 0 at the lip to 1 at its end), and how fast.
vec3 streamWay(float s, vec3 at, float w) {
  // The face runs a little aslant: this is the way along it (left to right as you look at it) and the way out from it.
  const vec2 FACE = vec2(0.993, 0.119);
  const vec2 OUT = vec2(-0.119, 0.993);
  float along = dot(uWindDir, FACE);
  float onto = max(-dot(uWindDir, OUT), 0.0);
  float off = max(dot(uWindDir, OUT), 0.0);
  // Whole water falls, arcing a little outward, and leans downwind the further it has fallen.
  vec3 whole = vec3(0.0, -uLip.y, 3.75 / sqrt(s + 0.03));
  whole.xz += (FACE * along + OUT * off) * (w * 40.0 * s);
  // Spray goes with the air: sideways along the face (standing a little off
  // it) and only slowly down; up the face where the wind is turned by it; and,
  // once it is clear of the rim, back over the top of the cliff.
  float above = smoothstep(uLip.y - 4.0, uLip.y + 12.0, at.y);
  float sink = 1.0 - 0.9 * min(w, 1.0) + 0.35 * off * w;
  vec3 spray = vec3(0.0, 1.7 * onto * w * (1.0 - 0.35 * above) - sink, 0.0);
  spray.xz = FACE * (along * w * 1.5) + OUT * (off * w * 0.8 + 0.24 * abs(along) * w - onto * w * 0.75 * above);
  return mix(whole, spray * ((26.0 + 44.0 * w) * (1.0 - 0.38 * onto)), tornAt(s, w));
}
void main() {
  float w = fallWind();
  vec3 pos = aPos;
  vBlown = vec2(0.0, w);
  if (uSpray < 0.5) {
    // The ribbon follows the water: its path is walked down from the lip, a row at a time.
    float s = aUv.y;
    vec3 at = uLip;
    float pace = 1.0 / float(FALL_ROWS);
    for (int i = 0; i < FALL_ROWS; i++) {
      float si = (float(i) + 0.5) * pace;
      if (si > s) break;
      at += streamWay(si, at, w) * pace;
    }
    // It lies across the way the water is going, as you see it from in front; and spray spreads as it goes.
    vec3 way = streamWay(s, at, w);
    vec2 across = normalize(vec2(-way.y, way.x) + vec2(1.0e-4, 0.0));
    float wide = 3.2 + 3.4 * s * (1.0 - 0.6 * tornAt(s, w)) + (2.0 + 6.0 * w) * max(s - max(tearAt(w), 0.0), 0.0);
    pos = at + vec3(across * ((aUv.x * 2.0 - 1.0) * wide), 0.0);
    vBlown.x = tornAt(s, w);
  } else {
    // The spray at its foot stands where the leaning water lands.
    pos.x += uWindDir.x * w * 20.0 * aUv.y * aUv.y;
    pos.z += max(uWindDir.y, 0.0) * w * 20.0 * aUv.y * aUv.y;
  }
  vUv = aUv;
  vWorld = pos;
  gl_Position = uViewProj * vec4(pos, 1.0);
}
`;

export const FALL_FRAG = `${HEAD}
${COMMON}
in vec2 vUv;
in vec3 vWorld;
in vec2 vBlown; // how far the water here is torn to spray (0..1), and how hard it blows
out vec4 outColor;
uniform float uFallT; // wraps 0..1
uniform float uSpray; // 0 for the ribbon of water, 1 for the spray at its foot
uniform vec3 uLip;    // where the water leaves the rim of the cliff
${FALL_WIND}
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec3 light = uAmbient * 1.15 + uLightCol * 0.55 * sunShade(vWorld.xz);
  float w = vBlown.y;
  float tear = tearAt(w);
  vec3 col;
  if (uSpray < 0.5) {
    float torn = vBlown.x;
    float middle = 1.0 - abs(vUv.x - 0.5) * 2.0;
    // Streaks sliding down. Thin at the edges and broken into strands, the more so the harder it blows.
    float streak = texture(uNoise, vec2(vUv.x * 0.42 + 0.1, vUv.y * 0.35 - uFallT)).r * 0.6
                 + texture(uNoise, vec2(vUv.x * 1.1 + 0.6, vUv.y * 0.9 - uFallT * 3.0)).g * 0.4;
    float body = streak + middle * 0.6 - (0.42 + 0.3 * min(w, 1.0)) * vUv.y;
    // Torn water: wisps of spray drifting away along its path, fewer and smaller the further they have gone.
    float wisp = texture(uNoise, vec2(vUv.x * 2.3 + 0.2, vUv.y * 2.0 - uFallT)).b * 0.6
               + texture(uNoise, vec2(vUv.x * 4.1 + 0.5, vUv.y * 5.0 - uFallT * 2.0)).r * 0.4;
    float gone = max(vUv.y - tear, 0.0) / max(1.0 - tear, 0.25);
    float mist = wisp * 1.25 + middle * 0.28 - 0.04 - 0.5 * gone;
    float shape = mix(body, mist, torn);
    if (shape < 0.52) discard;
    // (The last of the spray is stippled away.)
    if (torn > 0.5 && shape < 0.6 && bayer(fc) > 0.5) discard;
    vec3 water = body > 0.86 ? vec3(1.0) : body > 0.68 ? vec3(0.86, 0.93, 1.0) : vec3(0.62, 0.78, 0.95);
    vec3 spray = shape > 0.84 ? vec3(0.97, 0.99, 1.0) : shape > 0.66 ? vec3(0.87, 0.93, 0.99) : vec3(0.76, 0.85, 0.95);
    // (Spray thrown up into the light is brighter than the falling water.)
    col = torn > 0.5 ? spray * 1.16 : water;
  } else {
    // Spray: a stippled puff that churns. There is less of it the less of the water gets down to the sea.
    float puff = 1.0 - length((vUv - vec2(0.5, 0.72)) * vec2(2.0, 2.6));
    puff += (texture(uNoise, vUv * 0.5 + vec2(0.0, uFallT * 2.0)).r - 0.5) * 0.7;
    puff -= 1.5 * (1.0 - smoothstep(0.55, 1.0, tear));
    if (puff * 1.3 < bayer(fc) + 0.15) discard;
    col = vec3(0.9, 0.95, 1.0);
  }
  col *= light;
  outColor = vec4(mix(col, uFogCol, stepped(fogAmount(vWorld), 14.0, fc)), IS_WATERFALL);
}
`;

// ---- rain and snow ---------------------------------------------------------------

export const RAIN_VERT = `${HEAD}
layout(location = 0) in vec4 aSeed; // position in a box (0..1), speed
layout(location = 1) in float aEnd; // 0 = head of the streak, 1 = tail
uniform mat4 uViewProj;
uniform vec3 uHome;   // where the box of rain is centred
uniform vec2 uSlant;  // how far the wind pushes a drop per metre it falls
uniform float uFall;  // wraps 0..1
out float vAlpha;
void main() {
  vec3 box = vec3(64.0, 30.0, 64.0);
  float k = 3.0 + floor(aSeed.w * 3.0); // whole-number speeds, so the wrap never shows
  float fall = fract(aSeed.y + uFall * k);
  vec3 p = vec3(aSeed.x - 0.5, 0.62 - fall, aSeed.z - 0.82) * box;
  vec3 dir = normalize(vec3(uSlant.x, -1.0, uSlant.y));
  p.xz += uSlant * (fall * box.y);
  p -= dir * (aEnd * (0.7 + 0.6 * aSeed.w));
  vAlpha = 0.6 - 0.35 * aEnd;
  gl_Position = uViewProj * vec4(uHome + p, 1.0);
}
`;

export const RAIN_FRAG = `${HEAD}
in float vAlpha;
out vec4 outColor;
uniform vec3 uTint;
void main() { outColor = vec4(uTint, vAlpha); }
`;

export const SNOW_VERT = `${HEAD}
layout(location = 0) in vec4 aSeed;
uniform mat4 uViewProj;
uniform vec3 uHome;
uniform vec3 uCam;
uniform vec2 uSlant;
uniform float uFall;
uniform float uSway;
uniform float uPixel;
void main() {
  vec3 box = vec3(64.0, 30.0, 64.0);
  float k = 3.0 + floor(aSeed.w * 3.0);
  float fall = fract(aSeed.y + uFall * k);
  vec3 p = vec3(aSeed.x - 0.5, 0.62 - fall, aSeed.z - 0.82) * box;
  p.xz += uSlant * (fall * box.y);
  p.x += 0.5 * sin(uSway + aSeed.w * 40.0);
  p.z += 0.4 * sin(uSway * 2.0 + aSeed.x * 50.0);
  vec3 w = uHome + p;
  gl_Position = uViewProj * vec4(w, 1.0);
  // Near flakes are two or three pixels, far ones a single pixel.
  gl_PointSize = clamp(floor(0.06 / (uPixel * max(distance(w, uCam), 0.5))), 1.0, 3.0);
}
`;

export const SNOW_FRAG = `${HEAD}
out vec4 outColor;
uniform vec3 uTint;
void main() { outColor = vec4(uTint, 0.92); }
`;

// ---- the campfire's flames -----------------------------------------------------------

export const FLAME_VERT = `${HEAD}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUv; // across 0..1, up 0..1
uniform mat4 uViewProj;
out vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;

export const FLAME_FRAG = `${HEAD}
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uNoise;
uniform float uFlameT; // wraps 0..1
uniform float uHeat;   // 0 = out, 1 = a full blaze (a little over when it flares)
uniform float uLean;   // how far the wind pushes the flames sideways
uniform float uSeed;   // each sheet of flame has its own, so no two lick alike
uniform float uLayer;  // 0 for the flames at the back of the fire (deeper in colour), 1 for those in front
void main() {
  float y = vUv.y;
  float reach = 0.1 + 0.72 * uHeat; // how high the flames stand
  float h = y / reach;
  // The wind leans them, more toward the tips, and the whole fire wavers from side to side.
  float waver = texture(uNoise, vec2(0.37 + uSeed, y * 0.22 - uFlameT)).g - 0.5;
  // Across, in units of the fire's own half-width: the sheet is much wider than
  // the flames, so that they have room to lean, but their foot stays inside the stones.
  float x = (vUv.x - 0.5) * 4.4 - uLean * h * h * 1.9 + waver * 1.5 * h;
  // Tongues of flame: two layers of licking shapes, sliding upward at different speeds.
  float lick = texture(uNoise, vec2(vUv.x * 0.55 + 0.2 + uSeed, y * 0.3 - uFlameT)).r * 0.55
             + texture(uNoise, vec2(vUv.x * 1.3 + 0.5 + uSeed, y * 0.7 - uFlameT * 2.0)).g * 0.3
             + texture(uNoise, vec2(vUv.x * 3.0 + 0.1 + uSeed, y * 1.5 - uFlameT * 3.0)).b * 0.15;
  // Broad at the base, drawn to a point above; ragged at the edges.
  // Separate tongues: tall streaks that rise through it, so the top is forked, not a single point.
  float tongue = texture(uNoise, vec2(vUv.x * 1.9 + 0.13 + uSeed, y * 0.2 - uFlameT * 2.0)).r - 0.5;
  // It swells a little just above the stones, and its foot hardly wanders.
  float girth = 0.95 + 1.8 * h - 0.5 * smoothstep(0.0, 0.14, h) * (1.0 - smoothstep(0.14, 0.5, h));
  float body = 1.0 - h * (0.7 + 0.36 * h) - abs(x) * girth + (lick - 0.5) * (0.35 + 1.55 * min(h * 2.5, 1.0)) + tongue * 0.9 * h;
  if (body < 0.1) discard;
  // The flames at the back are seen through the others: deeper, redder.
  body -= (1.0 - uLayer) * 0.24;
  // White-hot at the heart, through yellow and orange, to dark red at the tips.
  vec3 col = body > 0.86 ? vec3(1.0, 0.99, 0.86)
           : body > 0.62 ? vec3(1.0, 0.88, 0.4)
           : body > 0.42 ? vec3(1.0, 0.62, 0.16)
           : body > 0.24 ? vec3(0.95, 0.38, 0.08)
           : vec3(0.68, 0.16, 0.07);
  outColor = vec4(col, IS_LAND);
}
`;

// The warm haze of light in the air round the fire, most visible after dark.
export const GLOW_FRAG = `${HEAD}
in vec2 vUv;
out vec4 outColor;
uniform float uGlow;
void main() {
  float r = length(vUv - vec2(0.5, 0.3)) * 2.0;
  float a = clamp(1.0 - r, 0.0, 1.0);
  a = a * a * uGlow;
  // Stippled, so it stays pixel art; added to whatever is behind it.
  if (a < bayer(gl_FragCoord.xy) * 0.55 + 0.02) discard;
  outColor = vec4(vec3(1.0, 0.5, 0.16) * (0.1 + 0.22 * a), 1.0);
}
`;

// Sparks that fly up out of the fire.
export const SPARK_VERT = `${HEAD}
layout(location = 0) in vec4 aSeed; // phase, bearing, speed, how readily it shows
uniform mat4 uViewProj;
uniform vec3 uFirePos;
uniform vec2 uWindDir;
uniform float uWindAmt;
uniform float uSparkT; // wraps 0..1
uniform float uSparks; // how many are flying, 0..1
out float vAge;
void main() {
  float k = 3.0 + floor(aSeed.z * 4.0);
  float age = fract(aSeed.x + uSparkT * k);
  float bearing = aSeed.y * 6.2831853;
  float spread = (0.15 + 0.55 * aSeed.z) * age;
  vec3 p = uFirePos;
  p.xz += vec2(cos(bearing + age * 4.0), sin(bearing + age * 3.0)) * spread + uWindDir * (uWindAmt * 5.0 * age * age);
  p.y += 0.3 + age * (1.4 + 2.6 * aSeed.z) - 0.6 * age * age;
  vAge = age;
  gl_Position = aSeed.w < uSparks ? uViewProj * vec4(p, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = 1.0;
}
`;

export const SPARK_FRAG = `${HEAD}
in float vAge;
out vec4 outColor;
void main() {
  if (vAge > 0.92) discard;
  outColor = vec4(vAge < 0.3 ? vec3(1.0, 0.95, 0.6) : vAge < 0.62 ? vec3(1.0, 0.62, 0.16) : vec3(0.85, 0.28, 0.08), IS_LAND);
}
`;

// ---- the skipping stone: a dark fleck two pixels across, out over the water
// ---- the kite ------------------------------------------------------------------
// Its cloth, sticks, tail and line arrive as plain coloured corners, already
// in the places they have this twelfth of a second.

export const KITE_VERT = `${HEAD}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aCol;
uniform mat4 uViewProj;
out vec3 vCol;
out vec3 vWorld;
void main() {
  vCol = aCol;
  vWorld = aPos;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;

export const KITE_FRAG = `${HEAD}
in vec3 vCol;
in vec3 vWorld;
out vec4 outColor;
uniform vec3 uCam;
uniform vec3 uTint;       // the light on it: the sky's and the sun's or moon's together (a colour with 2 added is itself a light, and takes none)
uniform vec3 uFogCol;
uniform float uFogDensity;
void main() {
  vec3 col = vCol.r >= 1.5 ? vCol - 2.0 : vCol * uTint;
  float fog = 1.0 - exp(-distance(vWorld, uCam) * uFogDensity);
  outColor = vec4(mix(col, uFogCol, floor(fog * 14.0 + 0.5) / 14.0), IS_OBJECT);
}
`;

// ---- the shingle: every stone of the beach drawn as a stone ----------------------------

export const SHINGLE_VERT = `${HEAD}
${COMMON}
layout(location = 0) in vec3 aPos;   // a corner of the stone's shape, on a ball
layout(location = 1) in vec3 aFace;  // the way that face of it looks
layout(location = 2) in vec4 aRoot;  // where the stone lies, and how big it is
layout(location = 3) in vec4 aShape; // how it is turned, how flat it is, its tone, and a number of its own
layout(location = 4) in vec4 aTumble; // for a stone that is being handled (stacked, held, falling): tipped about this axis (x, y, z) by this angle (w). The beach's own stones are not.
out vec3 vWorld;
out vec3 vNormal;
out float vUp;        // 0 at the stone's foot, 1 on its crown
flat out vec2 vKind;  // its tone, and its own number
void main() {
  // No two are alike: each corner is pushed in or out a little, by the stone's own number.
  // (Only a little: the sea has rounded them.)
  float knob = 1.0 + 0.17 * (fract(sin(dot(aPos, vec3(12.9898, 78.233, 37.719)) + aShape.w * 43.1) * 43758.5453) - 0.5);
  vec3 squash = vec3(1.0, aShape.y, 0.66 + 0.34 * fract(aShape.w * 7.3));
  vec3 q = aPos * knob * squash * aRoot.w;
  // Each face keeps a little of its own flatness, but mostly the stone is lit as the round thing it is.
  vec3 n = normalize(mix(aFace, aPos, 0.62) / squash);
  float c = cos(aShape.x);
  float s = sin(aShape.x);
  vec3 placed = vec3(q.x * c + q.z * s, q.y, q.z * c - q.x * s);
  vec3 facing = vec3(n.x * c + n.z * s, n.y, n.z * c - n.x * s);
  if (aTumble.w != 0.0) {
    vec3 k = normalize(aTumble.xyz);
    float ca = cos(aTumble.w);
    float sa = sin(aTumble.w);
    placed = placed * ca + cross(k, placed) * sa + k * dot(k, placed) * (1.0 - ca);
    facing = facing * ca + cross(k, facing) * sa + k * dot(k, facing) * (1.0 - ca);
  }
  vWorld = aRoot.xyz + placed;
  vNormal = facing;
  vUp = aPos.y * 0.5 + 0.5;
  vKind = aShape.zw;
  gl_Position = uViewProj * vec4(vWorld, 1.0);
}
`;

export const SHINGLE_FRAG = `${HEAD}
${COMMON}
in vec3 vWorld;
in vec3 vNormal;
in float vUp;
flat in vec2 vKind;
out vec4 outColor;
uniform float uHeld; // 1 for the stones you stack: they are things in their own right, and get the dark line things have round them
void main() {
  vec3 N = normalize(vNormal);
  vec2 p = vWorld.xz;
  vec2 fc = gl_FragCoord.xy;
  float grain = bayer(fc);
  // Sea-worn stone in a handful of greys, one of them brown.
  float tone = vKind.x;
  vec3 col = tone < 0.3 ? vec3(0.3, 0.31, 0.35) : tone < 0.58 ? vec3(0.42, 0.42, 0.45) : tone < 0.82 ? vec3(0.53, 0.51, 0.5) : tone < 0.94 ? vec3(0.62, 0.6, 0.58) : vec3(0.44, 0.36, 0.31);
  col *= 0.78 + 0.14 * fract(vKind.y * 3.7);
  // Wet where the sea has just been, and in rain: darker, and it shines where it faces the light.
  float wet = max(1.0 - smoothstep(0.08, 0.44, vWorld.y - uTide.x), uWet * 0.75);
  col *= mix(1.0, 0.55, wet);
  // (Left damp by the tide as it went down: darker, but not running wet, so they do not shine. And along the mark it reached, weed it has left draped on them.)
  col *= mix(1.0, 0.68, uTide.z * (1.0 - wet) * (1.0 - smoothstep(uTide.y - 0.02, uTide.y + 0.18, vWorld.y)));
  float mark = uTide.y + 0.05 + (fract(vKind.y * 9.1) - 0.5) * 0.07;
  if (abs(vWorld.y - mark) < 0.035 && fract(vKind.y * 17.3) > 0.5 && uTide.y - uTide.x > 0.06) col = mix(col, vec3(0.2, 0.19, 0.09), 0.75 * smoothstep(0.06, 0.14, uTide.y - uTide.x));
  // Snow sits on the upward faces first.
  bool snowy = uSnow > 0.04 && uSnow * 1.6 - 1.0 + N.y * 0.7 + (fract(vKind.y * 5.3) - 0.5) * 0.4 > 0.0 && N.y > 0.35 && vWorld.y > 0.46;
  if (snowy) col = SNOW;

  // Lit as everything is, in a few clean steps.
  float facing = smoothstep(-0.25, 0.8, dot(N, uLightDir));
  float amount = sunShade(p) * (0.15 + 0.85 * facing);
  vec3 byFormula = lit(col, clamp(floor(amount * 6.0 + grain) / 6.0, 0.0, 1.0), N, vWorld, grain);
  // PATH-TRACE: each stone takes the traced light of the ground it lies on (as each blade of grass does),
  // a little more of it on the side that looks at the sun and a little less on the side that looks away.
  vec3 byTracing = col * tracedLight(ivec2(fc), p, grain) * mix(0.74, 1.1, facing);
  col = mix(byFormula, byTracing, uTraced * (distance(vWorld, uCam) < 300.0 ? 1.0 : 0.0));
  // Its underside, and its foot down among the others, see little of the sky.
  col *= (0.64 + 0.36 * smoothstep(-0.5, 0.6, N.y)) * (0.66 + 0.34 * smoothstep(0.1, 0.62, vUp));
  if (wet > 0.5 && !snowy && dot(N, normalize(uLightDir + normalize(uCam - vWorld))) > 0.94 && uLightDir.y > -0.05) col = mix(col, uLightCol + uAmbient, 0.6);
  outColor = vec4(mix(col, uFogCol, stepped(fogAmount(vWorld), 28.0, fc)), uHeld > 0.5 ? IS_OBJECT : IS_LAND);
}
`;

// ---- the wash: the water each wave runs up the beach, as a sheet lying on it ----------
// It follows the ground a finger or two deep, so the small stones go under it
// and the cobbles stand out of it with the water running round them.

export const WASH_VERT = `${HEAD}
${COMMON}
layout(location = 0) in vec3 aPos; // a point on the beach
out vec3 vWorld;
out float vGround; // how high the beach is there
void main() {
  vGround = aPos.y - uTide.x;
  vWorld = aPos;
  // The deepest either wave has it just now: thin at its leading edge, deeper behind, with a low bore while it is still climbing.
  vec2 sv = fromShore(aPos.xz);
  float uneven = textureLod(uNoise, vec2(sv.y * 0.045, 0.83), 0.0).r;
  float deep = 0.0;
  for (int k = 0; k < 2; k++) {
    float life = waveLife(k);
    float reachTo = runUp(life) * (0.14 + 0.34 * waveSize(k) * crestTall(sv.y, k)) * (0.72 + 0.56 * uneven);
    float under = reachTo - vGround;
    if (under > 0.0) {
      float coming = 1.0 - smoothstep(LANDS + 0.1, LANDS + 0.2, life);
      deep = max(deep, 0.012 + min(under * 0.55, 0.05 + 0.07 * coming) + 0.05 * coming * (1.0 - smoothstep(0.0, 0.05, under)));
    }
  }
  vWorld.y = max(aPos.y, uTide.x - 0.02) + deep;
  gl_Position = uViewProj * vec4(vWorld, 1.0);
}
`;

export const WASH_FRAG = `${HEAD}
${COMMON}
in vec3 vWorld;
in float vGround;
out vec4 outColor;
uniform vec3 uFoamCol;
uniform vec3 uSeaDeep, uSeaPale;
void main() {
  vec2 p = vWorld.xz;
  vec2 fc = gl_FragCoord.xy;
  float grain = bayer(fc);
  vec2 sv = fromShore(p);
  float uneven = texture(uNoise, vec2(sv.y * 0.045, 0.83)).r;
  float foam = 0.0;
  float water = 0.0;
  for (int k = 0; k < 2; k++) {
    float life = waveLife(k);
    float reachTo = runUp(life) * (0.14 + 0.34 * waveSize(k) * crestTall(sv.y, k)) * (0.72 + 0.56 * uneven);
    float under = reachTo - vGround;
    if (under <= 0.0) continue;
    float edge = under / 0.13; // metres back from the leading edge, taking the beach at its usual slope
    float coming = 1.0 - smoothstep(LANDS + 0.1, LANDS + 0.2, life);
    float lace = texture(uNoise, vec2(sv.y * 0.23 + float(k) * 0.4, sv.x * 0.5 + life * 0.5)).b * 0.65 + texture(uNoise, vec2(sv.y * 0.6, sv.x * 1.1 - life * 0.4)).r * 0.35;
    float lead = 1.0 - edge / (0.1 + 0.28 * coming);
    float froth = (0.8 - 0.7 * smoothstep(LANDS, 0.97, life)) * (1.0 - smoothstep(0.0, 2.4, edge));
    if (lead > 0.0 || froth > lace * 1.15 + 0.14) foam = 1.0;
    // Clear water: thin as glass at its edge (the stones show through it), thicker further in.
    water = max(water, smoothstep(0.0, 0.9, edge) * 0.82);
  }
  if (foam < 0.5) {
    if (water <= grain) discard;
    vec3 col = (mix(uSeaDeep, uSeaPale, 0.55) * vec3(0.9, 1.05, 1.0)) * mix(0.72, 1.0, tracedSun(fc)) + seaGlow(0.0) * 0.6;
    outColor = vec4(mix(col, uFogCol, stepped(fogAmount(vWorld), 14.0, fc)), IS_LAND);
    return;
  }
  // (PATH-TRACE: the sheet of water on the beach, and its foam, are in the beach's own light and shade.)
  outColor = vec4(mix(uFoamCol * mix(0.72, 1.0, tracedSun(fc)) + seaGlow(0.6), uFogCol, stepped(fogAmount(vWorld), 14.0, fc)), IS_LAND);
}
`;

// ---- spray off the rocks ------------------------------------------------------------
// When a wave's crest strikes a rock standing in the water, spray goes up off
// it: a ragged plume thrown up and a little way on, hanging a moment, and
// falling back. One upright sheet for each rock, facing you, with the plume
// stippled onto it; it is worked out from the same waves as the sea itself, so
// the two cannot fall out of step.

export const SPRAY_VERT = `${HEAD}
${COMMON}
uniform vec3 uRock; // the rock: where it is (x, z) and how big
out vec2 vUv;       // across the plume (-1..1) and up it (0..1)
out vec2 vBurst;    // how far through its rise and fall the plume is (0..1), and how hard the wave struck
out vec3 vWorld;
void main() {
  vec2 rs = fromShore(uRock.xy);
  float through = -1.0;
  float force = 0.0;
  for (int k = 0; k < 2; k++) {
    vec2 hit = crestPast(rs, k);
    float lasts = 2.4 + 3.2 * hit.y; // metres the crest travels while the spray is in the air
    if (hit.x > 0.0 && hit.x < lasts && hit.y > force) {
      through = hit.x / lasts;
      force = hit.y;
    }
  }
  vec2 corner = vec2(float(gl_VertexID == 1 || gl_VertexID == 2 || gl_VertexID == 4), float(gl_VertexID == 2 || gl_VertexID == 4 || gl_VertexID == 5));
  vUv = vec2(corner.x * 2.0 - 1.0, corner.y);
  vBurst = vec2(through, force);
  // Small waves only wet a rock; a big one throws spray well over it.
  float tall = (0.12 + 3.1 * force * force) * (0.55 + 0.45 * uRock.z);
  float wide = uRock.z * (0.9 + 0.5 * force) + 0.3;
  vec3 middle = vec3(uRock.x, 0.02 + uTide.x, uRock.y);
  vec3 across = normalize(cross(vec3(uCam.x - middle.x, 0.0, uCam.z - middle.z), vec3(0.0, 1.0, 0.0)));
  // (Blown a little along with the wind as it goes up.)
  float blown = dot(vec3(uWindDir.x, 0.0, uWindDir.y), across) * uWindAmt * 0.9 * corner.y * tall;
  vWorld = middle + across * (vUv.x * wide + blown) + vec3(0.0, corner.y * tall, 0.0);
  gl_Position = through < 0.0 || rs.x < 0.5 ? vec4(2.0, 2.0, 2.0, 1.0) : uViewProj * vec4(vWorld, 1.0);
}
`;

export const SPRAY_FRAG = `${HEAD}
${COMMON}
in vec2 vUv;
in vec2 vBurst;
in vec3 vWorld;
out vec4 outColor;
uniform vec3 uFoamCol;
void main() {
  vec2 fc = gl_FragCoord.xy;
  float through = vBurst.x;
  // It goes up fast and comes down slower: how high the plume stands just now, 0..1.
  float up = through < 0.3 ? sqrt(through / 0.3) : 1.0 - (through - 0.3) / 0.7 * 0.55;
  // Narrow where it leaves the rock, spreading as it rises. Its top is torn: some
  // columns of it are flung much higher than others, differently every moment.
  float beat = floor(through * 8.0);
  float flung = texture(uNoise, vec2(vUv.x * 1.9 + beat * 0.13, 0.37 + beat * 0.07)).g;
  float ragged = texture(uNoise, vUv * vec2(2.7, 2.1) + vec2(beat * 0.21, through)).b;
  float top = up * (0.42 + 0.72 * flung);
  float spread = 0.22 + 0.78 * smoothstep(0.0, 1.0, vUv.y / max(up, 0.05));
  float body = 1.0 - vUv.y / max(top, 0.01);
  float sides = 1.0 - abs(vUv.x) / spread;
  // Thick at the foot while it is fresh; thinning to scattered drops as it hangs and falls.
  float thick = min(body, sides * 1.5) * (1.9 - 1.45 * through) + (ragged - 0.5) * 0.75;
  if (vUv.y > top || sides < 0.0 || thick < bayer(fc) * 0.85 + 0.2) discard;
  vec3 col = uFoamCol * (0.92 + 0.08 * ragged) + seaGlow(1.0 - 0.7 * through);
  outColor = vec4(mix(col, uFogCol, stepped(fogAmount(vWorld), 14.0, fc)), IS_WATERFALL);
}
`;

export const PEBBLE_VERT = `${HEAD}
uniform mat4 uViewProj;
uniform vec3 uPebble;
void main() {
  gl_Position = uViewProj * vec4(uPebble, 1.0);
  // Thrown from the water's edge it is close at first, and shrinks as it goes.
  gl_PointSize = clamp(34.0 / gl_Position.w, 2.0, 5.0);
}
`;

export const PEBBLE_FRAG = `${HEAD}
out vec4 outColor;
void main() {
  outColor = vec4(0.2, 0.2, 0.23, IS_OBJECT);
}
`;

// ---- music ---------------------------------------------------------------------
// While the gramophone plays, little notes leave its horn, rise, sway and fade.

export const NOTE_VERT = `${HEAD}
layout(location = 0) in vec4 aSeed; // phase, sway, speed, how readily it shows
uniform mat4 uViewProj;
uniform vec3 uMouth;   // the mouth of the horn
uniform vec3 uWay;     // the way the horn points
uniform vec2 uWindDir;
uniform float uWindAmt;
uniform float uNoteT;  // wraps 0..1
uniform float uNotes;  // how many are in the air, 0..1
out float vAge;
flat out float vKind;
void main() {
  float age = fract(aSeed.x + uNoteT * (1.0 + floor(aSeed.z * 2.0)));
  vec3 p = uMouth + uWay * (0.1 + 0.8 * age);
  p.y += age * (1.3 + 1.0 * aSeed.z);
  // They sway from side to side as they climb, and lean with the wind.
  vec2 across = normalize(vec2(-uWay.z, uWay.x) + 1e-5);
  p.xz += across * sin(age * 9.0 + aSeed.y * 40.0) * (0.1 + 0.14 * age);
  p.xz += uWindDir * (uWindAmt * 1.6 * age * age);
  vAge = age;
  vKind = aSeed.y;
  gl_Position = aSeed.w < uNotes ? uViewProj * vec4(p, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = 9.0;
}
`;

export const NOTE_FRAG = `${HEAD}
in float vAge;
flat in float vKind;
out vec4 outColor;
void main() {
  // A quaver, or a pair of them beamed together: seven pixels by nine, drawn
  // boldly enough to be read against grass or sky. Each row is a set of bits.
  const int ONE[9] = int[9](56, 104, 72, 8, 8, 14, 15, 15, 6);
  const int TWO[9] = int[9](124, 124, 68, 68, 68, 102, 119, 119, 34);
  ivec2 c = ivec2(floor(gl_PointCoord * 9.0)) - ivec2(1, 0);
  if (c.x < 0 || c.x > 6 || c.y < 0 || c.y > 8) discard;
  int row = vKind > 0.66 ? TWO[c.y] : ONE[c.y];
  if (((row >> c.x) & 1) == 0) discard;
  // They thin out as they rise, and are gone before they wrap.
  float fade = vAge < 0.06 ? vAge / 0.06 : 1.0 - smoothstep(0.62, 0.95, vAge);
  if (fade < bayer(gl_FragCoord.xy) + 0.02) discard;
  outColor = vec4(vKind < 0.33 ? vec3(1.0, 0.93, 0.74) : vec3(0.98, 0.98, 0.92), IS_OBJECT);
}
`;

// ---- chimney smoke ------------------------------------------------------------------

export const SMOKE_VERT = `${HEAD}
layout(location = 0) in vec4 aSeed; // which chimney, phase, wobble, speed
uniform mat4 uViewProj;
uniform vec3 uCam;
uniform vec3 uSource[3];
uniform vec2 uWindDir;
uniform float uWindAmt;
uniform float uSmokeT; // wraps 0..1
uniform float uPixel;
void main() {
  float k = 2.0 + floor(aSeed.w * 3.0);
  float age = fract(aSeed.y + uSmokeT * k);
  vec3 p = uSource[int(aSeed.x * 2.999)];
  // It rises, then the wind takes it; a strong wind lays it nearly flat.
  p.y += age * (4.0 + 3.0 * aSeed.z) * (1.0 - 0.55 * uWindAmt);
  p.xz += uWindDir * ((0.8 + 26.0 * uWindAmt) * age * age);
  p.xz += vec2(sin(aSeed.z * 40.0 + age * 5.0), cos(aSeed.w * 30.0 + age * 4.0)) * (0.45 * age);
  gl_Position = uViewProj * vec4(p, 1.0);
  // Each puff swells as it leaves the chimney and dwindles as it thins.
  float swell = sin(3.14159 * pow(age, 0.6));
  gl_PointSize = clamp(floor((0.2 + 0.85 * swell) / (uPixel * distance(p, uCam))), 1.0, 6.0);
}
`;

export const SMOKE_FRAG = `${HEAD}
out vec4 outColor;
uniform vec3 uTint;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  if (dot(q, q) > 0.27) discard; // round
  outColor = vec4(uTint * (q.y > 0.1 ? 0.8 : 1.0), IS_LAND); // darker underneath
}
`;

// ---- breath in the cold -----------------------------------------------------------------
// A puff is a handful of small wisps. Each is breathed out ahead of the muzzle,
// quickly at first; then it hangs, lifts a little, spreads, and goes with the wind.

export const BREATH_VERT = `${HEAD}
layout(location = 0) in vec4 aSeed; // each wisp's own numbers
uniform mat4 uViewProj;
uniform vec3 uCam;
uniform vec4 uPuff[3];    // each breath: where it left the muzzle, and how far through its life it is (past 1 it is gone)
uniform vec4 uPuffWay[3]; // and the way the muzzle pointed (x, z)
uniform vec2 uCarry;      // how far the wind carries a breath in its life (x, z)
uniform float uPixel;
out float vAge;
void main() {
  int k = gl_VertexID / 5;
  float age = uPuff[k].w;
  vec3 p = uPuff[k].xyz;
  p.xz += uPuffWay[k].xy * ((0.16 + 0.14 * aSeed.x) * (1.0 - exp(-age * 4.0))) + uCarry * (age * age);
  p.xz += (aSeed.zw - 0.5) * (0.2 * age);
  p.y += 0.01 + (0.07 + 0.16 * aSeed.y) * age;
  // The wisps of a puff do not all last as long as each other.
  bool gone = age >= 0.62 + 0.38 * aSeed.y;
  gl_Position = gone ? vec4(2.0, 2.0, 2.0, 1.0) : uViewProj * vec4(p, 1.0);
  float swell = sin(3.14159 * pow(min(age, 1.0), 0.5));
  gl_PointSize = clamp(floor((0.05 + 0.12 * swell * (0.6 + 0.8 * aSeed.z)) / (uPixel * distance(p, uCam)) + 0.5), 1.0, 4.0);
  vAge = age;
}
`;

export const BREATH_FRAG = `${HEAD}
in float vAge;
out vec4 outColor;
uniform vec3 uTint;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  if (dot(q, q) > 0.27) discard; // round
  // It thins as it goes: more and more of it is stippled away.
  if (vAge * 1.2 - 0.22 > bayer(gl_FragCoord.xy)) discard;
  outColor = vec4(uTint, IS_LAND);
}
`;

// ---- gulls -------------------------------------------------------------------------

export const BIRD_VERT = `${HEAD}
layout(location = 0) in vec4 aSeed;
uniform mat4 uViewProj;
uniform float uBirdT; // wraps 0..1
uniform float uFlap;  // wraps a full turn
out float vWing;
void main() {
  // Each gull wheels round its own lazy circle over the bay.
  float turn = (aSeed.y < 0.5 ? 1.0 : -1.0) * 6.2831853 * (aSeed.x + uBirdT * (1.0 + floor(aSeed.w * 2.0)));
  vec2 centre = vec2(-50.0 + 190.0 * (aSeed.z - 0.5), -235.0 - 70.0 * aSeed.y);
  float r = 30.0 + 75.0 * aSeed.w;
  vec3 p = vec3(centre.x + cos(turn) * r * 1.5, 26.0 + 34.0 * aSeed.z + 6.0 * sin(turn * 2.0), centre.y + sin(turn) * r);
  gl_Position = uViewProj * vec4(p, 1.0);
  gl_PointSize = 5.0;
  vWing = sin(uFlap * (1.0 + floor(aSeed.x * 2.0)) + aSeed.y * 20.0);
}
`;

export const BIRD_FRAG = `${HEAD}
in float vWing;
out vec4 outColor;
uniform vec3 uTint;
void main() {
  // Five pixels wide: wings up is a shallow V, wings down a shallow arch.
  ivec2 q = ivec2(gl_PointCoord * 5.0);
  int out2 = abs(q.x - 2);
  int row = vWing > 0.0 ? (out2 == 2 ? 1 : out2 == 1 ? 2 : 3) : (out2 == 2 ? 3 : 2);
  if (q.y != row) discard;
  outColor = vec4(uTint, IS_LAND);
}
`;

// ---- tracing the light ---------------------------------------------------------------
//
// PATH-TRACE. The camera never moves, so the light falling on each pixel of the picture can be worked
// out the true way, by following paths of light backwards from it, and letting the answer build up over
// time. Every time it is that pixel's turn, one more path sets out from the spot it shows:
//   - a ray toward some point of the sun's disc (or the moon's), which either gets there or is stopped:
//     that is the cast shadows, soft at the edge by as much as the sun is wide;
//   - a ray in a random direction, which either reaches the open sky, or strikes something. What it
//     strikes is lit in its turn (by the sun if the sun reaches it, by the fire and the lamps), takes its
//     colour, and sends the path on in another random direction; and so on for three bounces. That is the
//     darkness of corners and hollows, the red of a painted wall on the grass beside it, the light the
//     snow throws back up under the eaves;
//   - rays to the fire, to the lanterns by the doors and to those by the path: their light, and the
//     shadows they cast.
// The rays are followed over the true ground and against the very triangles the houses, walls, stones
// and sheep are drawn with (see rays.ts). What is kept for each pixel is how much of each light arrives
// there, apart from how bright that light is just now: so a cloud crossing the sun or the fire flaring
// shows at once, and only the sun's slow journey has to be gathered afresh.

// Where everything fixed is, and which way it faces: drawn once per frame, plainly.
export const SHAPE_VERT = `${HEAD}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
uniform mat4 uViewProj;
uniform vec3 uCam;
uniform float uSnowDepth;
uniform float uGround; // 1 for the land (which lying snow raises), 0 for things standing on it
${THAW}
out vec3 vNormal;
void main() {
  vec3 pos = aPos;
  if (uSnowDepth > 0.0) pos.y += uGround * uSnowDepth * (1.0 - thaw(aPos.xz)) * smoothstep(0.45, 0.75, aNormal.y) * step(distance(aPos, uCam), 320.0); // (NO-SNOW)
  vNormal = aNormal;
  gl_Position = uViewProj * vec4(pos, 1.0);
}
`;

export const SHAPE_FRAG = `${HEAD}
in vec3 vNormal;
out vec4 outColor;
void main() { outColor = vec4(normalize(vNormal) * 0.5 + 0.5, 1.0); }
`;

// The rows of the picture whose turn it is, two by two, each pair as a strip two pixels high (LIGHT-WORK:
// only those rows are worked on at all; the rest of the picture is not so much as copied. In pairs,
// because a picture is worked out in blocks of two pixels by two, and half a block costs a whole one).
// They are worked out into a spare set of pictures (a picture cannot be read and written at once), and
// then carried back, those rows only, into the kept ones: so each place's light is kept once, not twice.
export const TRACE_VERT = `${HEAD}
precision highp int;
uniform vec3 uRows; // every so-many-th pair of rows (x), beginning with this pair (y); and how many rows the picture has (z)
void main() {
  const float ACROSS[6] = float[6](-1.0, 1.0, -1.0, -1.0, 1.0, 1.0);
  const float UP[6] = float[6](0.0, 0.0, 1.0, 1.0, 0.0, 1.0);
  int corner = gl_VertexID % 6;
  float row = (uRows.y + float(gl_VertexID / 6) * uRows.x + UP[corner]) * 2.0;
  gl_Position = vec4(ACROSS[corner], row / uRows.z * 2.0 - 1.0, 0.0, 1.0);
}
`;

// The rows just worked out, carried back from the spare pictures into the kept ones.
export const CARRY_FRAG = `${HEAD}
precision highp sampler2D;
layout(location = 0) out vec4 outA;
layout(location = 1) out vec4 outB;
layout(location = 2) out vec4 outC;
layout(location = 3) out vec4 outD;
uniform sampler2D uPrevA, uPrevB, uPrevC, uPrevD;
void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  outA = texelFetch(uPrevA, at, 0);
  outB = texelFetch(uPrevB, at, 0);
  outC = texelFetch(uPrevC, at, 0);
  outD = texelFetch(uPrevD, at, 0);
}
`;

export const TRACE_FRAG = `${HEAD}
precision highp int;
precision highp sampler2D;
layout(location = 0) out vec4 outA; // the sky's light, straight and bounced (rgb, for a sky of brightness 1); how much of the sun arrives straight (a)
layout(location = 1) out vec4 outB; // the sun's light arriving after a bounce or more (rgb, for a sun of brightness 1); the door lanterns' light (a)
layout(location = 2) out vec4 outC; // the fire's light, straight and bounced (rgb, for a fire of brightness 1); the path lanterns' light (a)
layout(location = 3) out vec4 outD; // (only the room uses the fourth: out of doors it is carried along as it is)
uniform sampler2D uDepth, uNormal, uPrevA, uPrevB, uPrevC, uPrevD, uHeight;
uniform mat4 uInvViewProj;
uniform vec2 uRes;
uniform vec3 uCam, uLightDir, uFirePos, uGrass;
uniform vec3 uLampPos[4];
uniform vec3 uTaskPos[8]; // the flames of the lanterns by the path, and of the storm lantern on its post
uniform vec4 uField;      // the mapped ground: x0, z0, 1 / width, 1 / depth
uniform float uSnowDepth;
uniform float uSnow;      // how much of the ground the snow covers, 0..1
${THAW}
${RAY_MESH}
uniform vec4 uCount;      // how many samples each pixel has had; and how much weight a new one gets: of the sun's own light (y), of the sun's light bounced (z), of the light that never moves (w)
uniform float uStill;     // 1 while the lights that never move are still being gathered
uniform float uSunSize;   // how wide the sun's disc is to a ray (its radius, radians): wider through thin cloud
uniform float uGlow;      // how much brighter the sky is round the sun

// Random numbers (each pixel its own run of them, and a new run every time).
uint seed;
float rnd() {
  seed = seed * 747796405u + 2891336453u;
  uint w = ((seed >> ((seed >> 28u) + 4u)) ^ seed) * 277803737u;
  w = (w >> 22u) ^ w;
  return float(w >> 8u) * (1.0 / 16777216.0);
}

bool inField(vec2 xz) {
  vec2 u = (xz - uField.xy) * uField.zw;
  return u.x > 0.0 && u.x < 1.0 && u.y > 0.0 && u.y < 1.0;
}

float groundAt(vec2 xz) {
  // NO-SNOW: with none lying, where it has melted is not worked out (this is asked at every step of every ray).
  float ground = texture(uHeight, (xz - uField.xy) * uField.zw).r;
  return uSnowDepth > 0.0 ? ground + uSnowDepth * (1.0 - thaw(xz)) : ground;
}

vec3 groundNormal(vec2 xz) {
  const float e = 0.9;
  return normalize(vec3(groundAt(xz - vec2(e, 0.0)) - groundAt(xz + vec2(e, 0.0)), 2.0 * e, groundAt(xz - vec2(0.0, e)) - groundAt(xz + vec2(0.0, e))));
}

// Follow a ray over the ground. Returns how far it gets before going under, or -1.
float groundHit(vec3 ro, vec3 rd, float reach) {
  float t = 0.15;
  float before = 0.0;
  for (int i = 0; i < 48; i++) {
    vec3 p = ro + rd * t;
    if (t > reach || !inField(p.xz) || (p.y > 75.0 && rd.y > 0.0)) return -1.0;
    float clear = p.y - groundAt(p.xz);
    if (clear < 0.0) {
      // It went under between the last step and this: close in on where.
      float under = t;
      for (int k = 0; k < 4; k++) {
        float mid = 0.5 * (before + under);
        vec3 q = ro + rd * mid;
        if (q.y - groundAt(q.xz) < 0.0) under = mid; else before = mid;
      }
      return before;
    }
    before = t;
    t += max(0.25, clear * 0.55 + t * 0.035); // longer strides when well clear of it
  }
  return -1.0;
}
// The same, only to know whether the ground is in the way.
bool groundBlocks(vec3 ro, vec3 rd, float reach) {
  float t = 0.15;
  for (int i = 0; i < 48; i++) {
    vec3 p = ro + rd * t;
    if (t > reach || !inField(p.xz) || (p.y > 75.0 && rd.y > 0.0)) return false;
    float clear = p.y - groundAt(p.xz);
    if (clear < 0.0) return true;
    t += max(0.25, clear * 0.55 + t * 0.035);
  }
  return false;
}

bool blocked(vec3 ro, vec3 rd, float reach) {
  return meshAny(ro, rd, reach) || groundBlocks(ro, rd, reach);
}

// What a ray strikes first: how far off (or -1 for nothing), which way that surface faces, and its colour.
float struck(vec3 ro, vec3 rd, float reach, out vec3 n, out vec3 colour) {
  float tm = meshHit(ro, rd, reach, n, colour);
  float tg = groundHit(ro, rd, tm > 0.0 ? tm : reach);
  if (tg > 0.0) {
    vec2 at = (ro + rd * tg).xz;
    n = groundNormal(at);
    // Turf; the bare rock and earth of a steep bank; and snow where it lies.
    colour = n.y > 0.72 ? uGrass : vec3(0.3, 0.29, 0.27);
    if (uSnow > 0.0 && n.y > 0.6) colour = mix(colour, vec3(0.8, 0.84, 0.9), uSnow * (1.0 - thaw(at)));
    return tg;
  }
  if (tm > 0.0 && colour.r < 0.0) colour = uGrass; // (a turf roof is the colour of the grass that day)
  return tm;
}

// A direction somewhere on the sun's disc.
vec3 sunWay(float u, float v) {
  vec3 a = normalize(cross(uLightDir, abs(uLightDir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 b = cross(uLightDir, a);
  float turn = 6.2831853 * v;
  return normalize(uLightDir + (a * cos(turn) + b * sin(turn)) * (uSunSize * sqrt(u)));
}

// A direction out from a surface: any way at all, but oftener the nearer to straight out (as much oftener
// as light arriving that way counts for more).
vec3 outWay(vec3 n, float u, float v) {
  vec3 side = normalize(abs(n.y) < 0.99 ? cross(n, vec3(0.0, 1.0, 0.0)) : vec3(1.0, 0.0, 0.0));
  float turn = 6.2831853 * v;
  return normalize((side * cos(turn) + cross(n, side) * sin(turn)) * sqrt(u) + n * sqrt(1.0 - u));
}

// The fire's light on a place that faces n: from a point taken at random in the flames.
float fireOn(vec3 x, vec3 n, float least) {
  vec3 to = uFirePos + vec3((rnd() - 0.5) * 0.5, 0.25 + rnd() * 0.5, (rnd() - 0.5) * 0.5) - x;
  float far = length(to);
  vec3 way = to / far;
  float f = (0.35 + 0.65 * max(dot(n, way), 0.0)) / (1.0 + far * far * 0.07);
  if (f < least || blocked(x, way, far - 0.35)) return 0.0;
  return f;
}

// The light of the lanterns by the doors.
float lampsOn(vec3 x, vec3 n, float least) {
  float sum = 0.0;
  for (int i = 0; i < 4; i++) {
    vec3 to = uLampPos[i] + (vec3(rnd(), rnd(), rnd()) - 0.5) * 0.1 - x;
    float far = length(to);
    vec3 way = to / far;
    float f = (0.3 + 0.7 * max(dot(n, way), 0.0)) / (1.0 + far * far * 0.2);
    if (f > least && !blocked(x, way, far - 0.25)) sum += f;
  }
  return sum;
}

// And of those by the path: a small pool round each, which is all a candle behind glass can do.
float tasksOn(vec3 x, vec3 n) {
  float sum = 0.0;
  for (int i = 0; i < 8; i++) {
    vec3 to = uTaskPos[i] + (vec3(rnd(), rnd(), rnd()) - 0.5) * 0.06 - x;
    float far = length(to);
    float l = clamp(1.0 - sqrt(far * far + 0.3) / 3.3, 0.0, 1.0);
    if (l <= 0.0) continue;
    vec3 way = to / far;
    if (!blocked(x, way, max(far - 0.1, 0.0))) sum += l * l * (0.55 + 0.45 * max(dot(n, way), 0.0));
  }
  return sum;
}

void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  vec4 prevA = texelFetch(uPrevA, at, 0);
  vec4 prevB = texelFetch(uPrevB, at, 0);
  vec4 prevC = texelFetch(uPrevC, at, 0);
  float depth = texelFetch(uDepth, at, 0).r;
  outA = prevA;
  outB = prevB;
  outC = prevC;
  outD = texelFetch(uPrevD, at, 0);
  if (depth >= 1.0) return; // sky

  vec3 N = normalize(texelFetch(uNormal, at, 0).rgb * 2.0 - 1.0);
  vec4 w = uInvViewProj * vec4(gl_FragCoord.xy / uRes * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec3 P = w.xyz / w.w;
  float wrap = 0.2 + 0.8 * smoothstep(-0.15, 0.45, dot(N, uLightDir));

  if (distance(P, uCam) > 300.0 || !inField(P.xz)) {
    // Too far to trace: light it by the plain rule instead.
    outA = vec4(vec3(N.y > 0.55 ? 1.0 : 0.76), wrap);
    outB = vec4(0.0);
    outC = vec4(0.0);
    return;
  }

  seed = uint(at.x) * 1973u + uint(at.y) * 9277u + uint(uCount.x) * 26699u + 1u;
  rnd();
  // (The first choices of each path are not left to chance alone: they follow a run of numbers that
  // spreads itself evenly, begun at a different place for every pixel. Fewer samples then give a smooth answer.)
  vec2 shift = vec2(rnd(), rnd());
  vec2 evenA = fract(shift + uCount.x * vec2(0.7548776662, 0.5698402910));
  vec2 evenB = fract(shift.yx + uCount.x * vec2(0.6180339887, 0.3247179572));

  // (A thin thing seen from its back, as the inside of the gramophone's horn is: the side you see is
  // the side the light is wanted for, so the paths leave from that side.)
  if (dot(N, P - uCam) > 0.0) {
    N = -N;
    wrap = 0.2 + 0.8 * smoothstep(-0.15, 0.45, dot(N, uLightDir));
  }
  vec3 from = P + N * 0.07;
  // (The ground as it is drawn and the ground as rays know it differ by a hand's breadth here and there:
  // a ray leaving the ground starts from above both.)
  if (N.y > 0.5) {
    float g = groundAt(P.xz);
    if (abs(P.y - g) < 0.6) from.y = max(from.y, g + 0.07);
  }

  // Toward the sun (or moon): some point of its disc.
  float sun = blocked(from, sunWay(evenB.x, evenB.y), 280.0) ? 0.0 : wrap;

  // The fire and the lanterns, straight. (They never move: once enough of their light is gathered, no more is.)
  vec3 fire = prevC.rgb;
  float lamp = prevB.a;
  float task = prevC.a;
  if (uStill > 0.5) {
    fire = vec3(fireOn(from, N, 0.004));
    lamp = lampsOn(from, N, 0.008);
    task = tasksOn(from, N);
  }

  // And a path out into the world, three bounces long.
  vec3 sky = vec3(0.0);
  vec3 bounce = vec3(0.0);
  vec3 through = vec3(1.0); // what is left of the light by the time it has come back along the path
  vec3 o = from;
  vec3 n = N;
  for (int leg = 0; leg < 3; leg++) {
    vec3 way = leg == 0 ? outWay(n, evenA.x, evenA.y) : outWay(n, rnd(), rnd());
    vec3 hn;
    vec3 colour;
    float t = struck(o, way, leg == 0 ? 90.0 : 60.0, hn, colour);
    if (t < 0.0) {
      // Out into the open: the sky that way (brighter overhead, and round the sun), or far ground and sea below.
      if (way.y > 0.0) {
        sky += through * mix(0.78, 1.3, way.y);
        bounce += through * (uGlow * pow(max(dot(way, uLightDir), 0.0), 8.0));
      } else {
        sky += through * 0.35;
        bounce += through * (0.3 * max(uLightDir.y, 0.0));
      }
      break;
    }
    through *= colour;
    if (leg == 2) {
      // The last stretch: what it strikes is taken to be lit as a thing in the open is.
      sky += through * 0.5;
      bounce += through * (0.5 * max(dot(hn, uLightDir), 0.0));
      break;
    }
    o = o + way * t + hn * 0.05;
    n = hn;
    float facing = max(dot(n, uLightDir), 0.0);
    if (facing > 0.0 && !blocked(o, sunWay(rnd(), rnd()), 200.0)) bounce += through * facing;
    if (uStill > 0.5 && leg == 0) {
      fire += through * fireOn(o, n, 0.03);
      lamp += dot(through, vec3(0.3, 0.5, 0.2)) * lampsOn(o, n, 0.05);
    }
  }

  outA = vec4(mix(prevA.rgb, sky, uCount.w), mix(prevA.a, sun, uCount.y));
  outB = vec4(mix(prevB.rgb, bounce, uCount.z), mix(prevB.a, lamp, uCount.w));
  outC = vec4(mix(prevC.rgb, fire, uCount.w), mix(prevC.a, task, uCount.w));
}
`;

// ---- the final pass: outlines and foam -----------------------------------------------

export const POST_FRAG = `${HEAD}
out vec4 outColor;
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform sampler2D uNoise;
uniform float uNear, uFar;
uniform vec3 uFoam;
uniform vec3 uFogCol;
uniform float uFogDensity;
uniform float uLap; // wraps 0..1
uniform float uHeat;    // how hot the day is, 0..1
uniform float uShimmer; // wraps 0..1

uniform float uRoomDepth; // indoors, the room is drawn in the nearest sliver of the depth (this much of it) and the rest of the scene behind; else 0
uniform vec4 uBeams;      // SUNBEAMS: the point in the picture the low sun's beams run toward (x, y, in its own pixels), how strong they are (0 for none), and how far their pattern has drifted (0..1, and round again)
uniform vec3 uBeamCol;    // their light
float metres(float depth) {
  // (Each of the two is unsqueezed to the whole range again before it is read as a distance.)
  if (uRoomDepth > 0.0) depth = depth < uRoomDepth ? depth / uRoomDepth : (depth - uRoomDepth) / (1.0 - uRoomDepth);
  return 2.0 * uNear * uFar / (uFar + uNear - (depth * 2.0 - 1.0) * (uFar - uNear));
}

void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  ivec2 limit = textureSize(uColor, 0) - 1;
  // Heat haze: on a hot day everything far off, and the sky just above it,
  // wavers. Whole rows slip a pixel to one side and back, the more the farther.
  if (uHeat > 0.02) {
    float far = metres(texelFetch(uDepth, at, 0).r);
    float row = gl_FragCoord.y;
    float wave = sin(row * 0.61 + uShimmer * 6.2832 * 3.0 + 2.0 * sin(row * 0.17 + uShimmer * 6.2832));
    float much = uHeat * smoothstep(25.0, 140.0, far) * (far > 9000.0 ? 0.6 : 1.0);
    at.x = clamp(at.x + int(floor(wave * 1.45 * much + 0.5)), 0, limit.x);
  }
  vec4 c = texelFetch(uColor, at, 0);
  float depth = texelFetch(uDepth, at, 0).r;
  const ivec2 around[4] = ivec2[4](ivec2(1, 0), ivec2(-1, 0), ivec2(0, 1), ivec2(0, -1));

  if (c.a > 0.9) {
    // A dark line round houses, sheep and boulders, and along their creases.
    float here = metres(depth);
    if (here < 560.0) {
      bool edge = false;
      for (int i = 0; i < 4; i++) {
        ivec2 q = clamp(at + around[i], ivec2(0), limit);
        float there = metres(texelFetch(uDepth, q, 0).r);
        bool object = texelFetch(uColor, q, 0).a > 0.9;
        if (there > here && (!object || there - here > max(0.5, here * 0.035))) edge = true;
      }
      // Lighter on the far village, so it does not blacken it; and fading into fog like everything else.
      if (edge) c.rgb = mix(c.rgb * (here < 220.0 ? 0.42 : 0.6), c.rgb, clamp(1.0 - exp(-here * uFogDensity * 1.5), 0.0, 1.0));
    }
  } else if (abs(c.a - IS_SEA) < 0.05) {
    // White water where the sea meets land that lies beyond it.
    bool touching = false;
    bool close = false;
    for (int i = 0; i < 3; i++) {
      ivec2 q = clamp(at + around[i], ivec2(0), limit);
      if (texelFetch(uColor, q, 0).a > 0.3 && texelFetch(uDepth, q, 0).r > depth) touching = true;
    }
    ivec2 two = clamp(at + ivec2(0, 2), ivec2(0), limit);
    if (texelFetch(uColor, two, 0).a > 0.3 && texelFetch(uDepth, two, 0).r > depth) close = true;
    // It laps in and out.
    float lap = texture(uNoise, vec2(gl_FragCoord.x * 0.021, uLap)).r;
    // (Faded by the same fog as the water it sits on, so it does not shine through mist.)
    if (touching || (close && lap > 0.52)) c.rgb = mix(uFoam, uFogCol, clamp(1.0 - exp(-metres(depth) * uFogDensity), 0.0, 1.0));
  }
  // SUNBEAMS. With the sun low behind you its light comes over your shoulder in beams, between the hills
  // and the clouds, and runs away from you toward the point of the sky opposite the sun. They show in the
  // air: against the sky and against whatever is far off, not on things close to. Broad, soft, and few.
  if (uBeams.z > 0.01) {
    vec2 d = gl_FragCoord.xy - uBeams.xy;
    float len = length(d) / float(textureSize(uColor, 0).y);
    float turn = atan(d.y, d.x) / 6.2831853;
    float n = textureLod(uNoise, vec2(turn * 3.0 + uBeams.w, 0.37), 0.0).r * 0.62 + textureLod(uNoise, vec2(turn * 7.0 - uBeams.w * 2.0, 0.71), 0.0).g * 0.38;
    float beam = smoothstep(0.49, 0.6, n);
    float far = c.a < 0.1 ? 1.0 : 0.9 * smoothstep(40.0, 420.0, metres(depth));
    float reach = smoothstep(0.1, 0.42, len) * (1.0 - smoothstep(1.1, 1.9, len));
    float much = beam * far * reach * uBeams.z;
    // (Laid in evenly. Stippled in steps, as the rest of the light is, something this faint showed as a
    // grid of single dots over the sky and the far mountain: NO-GRID.)
    c.rgb += uBeamCol * 0.3 * much;
  }
  outColor = vec4(c.rgb, 1.0);
}
`;
