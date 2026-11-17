// Parts of the sky that are drawn by the sky shader but are too long to sit in
// the middle of it. Each is a piece of GLSL that the sky shader takes in after
// its own uniforms and helpers, and calls from its main().

// ---- weather on its way ---------------------------------------------------------
// Before rain or snow arrives its cloud stands on the horizon in the quarter
// it is coming from (or where it is really falling): a bank of shower cloud
// seen from a long way off. Far away it is a low line of small heads. As it
// nears, the same bank is simply seen larger: its base lifts off the horizon,
// its heads stand up into towers with cauliflower crowns, rain or snow can be
// seen hanging under it, and at last the tallest towers spread into an anvil.
//
// Everything is measured in "heaps": the size of one of the lumps the cloud is
// built from. q.x runs along the bank and q.y is the height above its base.
export const SHOWER_CLOUD = `
vec4 showerMean;     // the noise's own average (its smallest copy), which the shapes are measured against
float showerTall;    // how far the towers have grown, 0..1
float showerAnvil;   // how far the anvil has spread, 0..1
float showerLean;    // how the wind aloft leans it: -1 to the left, 1 to the right, 0 not at all

// Where a point of the sky is in the cloud's own shape, once its broad lobes
// have pushed it about (sideways as much as up and down, so that the towers
// bulge and overhang and are not a row of hills).
vec2 showerPushed(vec2 q, float soft) {
  vec4 n = textureLod(uNoise, vec2(q.x * 0.085 + uCloudScroll.x * 1.105 + 0.61, q.y * 0.12 + q.x * 0.011 + 0.43), soft + 1.0);
  return q + (n.ga - showerMean.ga) * vec2(1.6, 1.2);
}

// How high the cloud stands at a point along the bank, before anything holds
// it down: low heaps for the most part, and here and there a tower, steep
// sided, with turrets of its own. (Read at a slant through the noise, so that
// the same towers do not come round again.) The middle of the bank always has some.
float showerHeight(float x, float fill, float soft) {
  float column = textureLod(uNoise, vec2(x * 0.05 + uCloudScroll.x * 0.65 + 0.27, x * 0.019 + 0.71), soft + 1.0).b - showerMean.b;
  float turret = textureLod(uNoise, vec2(x * 0.16 + uCloudScroll.x * 2.08 + 0.57, x * 0.045 + 0.19), soft + 1.0).r - showerMean.r;
  return 0.9 + 2.2 * showerTall * smoothstep(0.3, 0.65, 0.45 + 2.0 * column + 0.3 * smoothstep(0.75, 1.0, fill)) * (1.0 + 1.2 * turret);
}
float showerCeiling() { return (0.9 + 2.2 * showerTall) * 0.8; }

// The smooth shape the cloud is heaped inside: how far inside it a point is,
// in heaps (above 0 inside). "fill" is how solid the bank is at this point
// along it: it dwindles toward its ends.
float showerShape(vec2 q, float fill, float soft) {
  vec2 p = showerPushed(q, soft);
  float ceiling = showerCeiling();
  float top = showerHeight(p.x, fill, soft);
  float beside = showerHeight(p.x + 0.4, fill, soft);
  // The tallest towers can climb no higher than the ceiling: they are held down under their anvils, and stand up into them.
  top = mix(top, ceiling + 0.6 * showerAnvil, clamp((top - ceiling + 0.3) / 0.3, 0.0, 1.0)) * fill;
  beside = mix(beside, ceiling + 0.6 * showerAnvil, clamp((beside - ceiling + 0.3) / 0.3, 0.0, 1.0)) * fill;
  float slope = (beside - top) / 0.4;
  // (Measured squarely to the cloud's side where a tower rises steeply; but never less than the depth below the lower ground beside it.)
  return max((top - p.y) / sqrt(1.0 + slope * slope), min(top, beside) - p.y);
}

// The heaps themselves: rounded lumps of noise, with a finer crinkle on them
// that is rounded outward and creased between, like a cauliflower.
float showerLumps(vec2 q, float soft) {
  vec2 uv = vec2(q.x * 0.26 + uCloudScroll.x * 3.38 + 0.61, q.y * 0.364 + q.x * 0.034 + 0.43);
  float mass = textureLod(uNoise, uv, soft).r;
  float crinkle = textureLod(uNoise, uv * 3.0 + 0.37, soft + 1.0).g;
  return mass + 0.22 * abs(2.0 * crinkle - 2.0 * showerMean.g) - 0.066;
}

// How much cloud there is at a point: above 0 inside it. Deep inside the
// shape it is solid; out through its skin it takes denser and denser heaps to
// be cloud at all, so that the outline is made of whole heaps and not drawn.
float showerMass(vec2 q, float fill, float soft) {
  float inside = showerShape(q, fill, soft);
  return showerLumps(q, soft) - mix(1.5, 0.0, smoothstep(-1.1, 0.5, inside)) + 0.6 * smoothstep(-0.1, 0.5, inside);
}

// The anvil. Where the tallest towers reach the ceiling the cloud spreads out
// sideways in a shield of ice: thick over the tower and thinning to its tips,
// nearly level on top and ragged beneath, drawn out in long strands, and
// reaching further on the side the wind aloft carries it to. Returns how far
// inside it a point is (above 0 inside), and how far down through it: 0 at
// its top, 1 at its underside.
vec2 showerAnvilAt(vec2 q, float fill, float soft) {
  vec2 p = showerPushed(q, soft + 1.0);
  float ceiling = showerCeiling();
  if (p.y > ceiling + 1.7 || p.y < ceiling - 1.5) return vec2(-1.0, 0.0);
  // How near this is to a tower that reaches the ceiling: 1 over the tower, 0 at the anvil's tip.
  float span = 0.0;
  // (It spreads a long way: four or five heaps to either side of its tower, and further downwind.)
  for (int k = -6; k <= 6; k++) {
    float off = float(k) * 0.8;
    float reaches = clamp((showerHeight(p.x + off, fill, soft) * fill - ceiling + 0.1) / 0.2, 0.0, 1.0);
    span = max(span, reaches * (1.0 - abs(off) / (4.4 - sign(off) * 1.5 * showerLean)));
  }
  span = clamp(span * 1.25, 0.0, 1.0) * showerAnvil;
  if (span <= 0.0) return vec2(-1.0, 0.0);
  float fibre = textureLod(uNoise, vec2(q.x * 0.022 + uCloudScroll.x * 0.286 + 0.4, q.y * 0.55 + 0.2), soft).a - showerMean.a
              + 0.5 * (textureLod(uNoise, vec2(q.x * 0.06 + uCloudScroll.x * 0.78 + 0.1, q.y * 1.3 + 0.6), soft).r - showerMean.r);
  float swell = textureLod(uNoise, vec2(q.x * 0.05 + uCloudScroll.x * 0.65 + 0.83, 0.47), soft + 1.0).g - showerMean.g;
  float up = p.y - (ceiling + 0.95 * (0.7 + 0.3 * span) + swell * 0.4);
  // Thick over the tower, and still a good half of that well out along it, before it thins to strands at the tips.
  float thick = 1.55 * pow(span, 0.7) * (1.0 + fibre * 0.9) + fibre * 0.3 * span;
  return vec2(min(-up * 1.6, thick + up), clamp(-up / max(thick, 0.05), 0.0, 1.0));
}

// The bank laid over the sky behind it.
vec3 showerBank(vec3 col, float az, float el, float lightSide, float lightFront, vec2 fc) {
  float near = uFront.y;
  if (near < 0.01 || el < -0.03) return col;
  float aside = az - uFront.x;
  aside = atan(sin(aside), cos(aside));
  float reachAlong = 0.45 + 0.95 * near; // how far along the horizon it stretches either way
  if (abs(aside) > reachAlong) return col;
  float grain = bayer(fc);

  // Coming nearer, the whole of it is seen larger, as anything is.
  float size = 0.016 + 0.046 * pow(near, 1.5);
  // Its base rides well clear of the horizon and of the far land, with air and falling rain under it:
  // that, more than anything, is what tells it from a range of snowy hills.
  float baseEl = 0.03 + 1.3 * size;
  // Where the light is: behind you (the whole face of the cloud is lit) or behind the cloud (it is dark, with a bright rim).
  float facing = smoothstep(0.1, -0.7, lightFront);
  float against = smoothstep(0.25, 0.9, lightFront);
  float fill = 1.0 - smoothstep(0.3 * reachAlong, reachAlong, abs(aside));
  float lod = max(0.0, log2(0.24 / size));
  showerMean = textureLod(uNoise, vec2(0.5), 8.0);
  showerTall = smoothstep(0.08, 0.7, near);
  showerAnvil = smoothstep(0.5, 0.86, near);
  showerLean = clamp(uFront.w, -1.0, 1.0);
  vec2 q = vec2(aside / size, (el - baseEl) / (size * 1.25));
  // The base is level, but not ruled: it sags and lifts a little along the bank.
  q.y -= (textureLod(uNoise, vec2(q.x * 0.043 + uCloudScroll.x * 0.56 + 0.5, 0.33), lod + 1.0).a - 0.5) * 0.5;

  // Its colours: the body in blue-grey shadow, darkest along the base, and the
  // crowns in whatever light the sun or the moon is giving. Snow cloud is paler and greyer.
  vec3 shade = mix(uCloudDark, vec3(dot(uCloudLit, vec3(0.33))) * vec3(0.66, 0.69, 0.76), 0.45 * uFront.z);
  vec3 lit = mix(uCloudLit, uCloudGlow.rgb, 0.3 * uCloudGlow.a);
  // Seen through a great deal of air, it is paler and flatter the further off it is.
  float faint = 0.28 * (1.0 - smoothstep(0.15, 0.75, near));
  vec3 airCol = mix(uHorizon, uFogCol, 0.5);
  float show = min(1.0, near * 5.0); // it fades in as it first shows over the horizon
  vec2 toLight = normalize(vec2(lightSide * 1.5, 0.6));

  if (q.y > 0.0) {
    float lum = -1.0;
    float d = showerMass(q, fill, lod);
    // (Wisps at its edges, and a base that is soft, not cut.)
    if (d > 0.0 && !(d < 0.03 && d / 0.03 < grain) && !(q.y < 0.14 && q.y / 0.14 < grain)) {
      // The small relief: each heap has a side toward the light and a side away from it.
      float relief = showerLumps(q, lod + 1.5) - showerLumps(q + toLight * 0.14, lod + 1.5);
      // And the large: cloud within reach of the light, on the side it comes from, is lit; the rest lies in the cloud's own shadow.
      float sunlit = 1.0 - smoothstep(-0.2, 1.6, showerShape(q + toLight * 1.5, fill, lod + 1.0));
      lum = 0.32 + sunlit * 0.36 * (1.0 - 0.6 * against) + 0.2 * facing - 0.1 * against
          + relief * 2.4 * (0.55 + 0.45 * sunlit) + 0.03 * q.y - 0.4 * exp(-q.y * 1.1) * (1.0 - 0.3 * facing) + (grain - 0.5) * 0.12;
      // A lining of light along its edge when the sun or the moon stands behind it.
      lum += 0.62 * against * (1.0 - smoothstep(0.0, 0.2, d)) * smoothstep(0.2, 1.0, q.y);
      lum = max(0.01, lum);
    } else if (showerAnvil > 0.0) {
      vec2 a = showerAnvilAt(q, fill, lod);
      if (a.x > 0.0 && !(a.x < 0.3 && a.x / 0.3 < grain)) {
        // Smooth where the towers are lumpy: pale above, grey beneath, streaked along its length.
        float streak = textureLod(uNoise, vec2(q.x * 0.03 + uCloudScroll.x * 0.39 + 0.9, q.y * 1.1 + 0.3), lod).b - showerMean.b;
        // (Lit along its top, and dark under its shelf, as the towers' own shadow falls on it.)
        lum = clamp(mix(0.9, 0.27, smoothstep(0.05, 0.8, a.y)) + streak * 0.4 + (grain - 0.5) * 0.18 - 0.12 * against, 0.2, 0.93);
      }
    }
    if (lum < 0.0) return col;
    vec3 c = lum > 0.92 ? mix(lit, vec3(1.0), 0.4) + uSunGlow * 0.2
           : lum > 0.78 ? lit * 0.96
           : lum > 0.64 ? mix(shade, lit, 0.5)
           : lum > 0.48 ? shade * 0.9
           : lum > 0.32 ? shade * 0.74
           : lum > 0.16 ? shade * 0.58
           : shade * 0.44;
    return mix(col, mix(c, airCol, faint), show);
  }

  // Under the base: paler air, and what is falling from the cloud, seen from
  // a long way off. Soft slanting shafts that leave the base dark and thin
  // out toward the sea, some reaching it and some not.
  float under = smoothstep(0.0, 0.3, showerMass(vec2(q.x, 0.3), fill, lod + 1.0));
  if (under <= 0.0) return col;
  float drop = clamp(-q.y / (baseEl / (size * 1.25) + 0.25), 0.0, 1.0); // 0 at the base, 1 down at the sea
  float s = q.x - q.y * 0.45 * showerLean; // the shafts trail behind the cloud as it goes
  float where = textureLod(uNoise, vec2(s * 0.09 + uCloudScroll.x * 1.17 + 0.3, 0.87), lod + 1.0).b - showerMean.b;
  float strands = textureLod(uNoise, vec2(s * 0.55 + uCloudScroll.x * 7.15 + 0.1, 0.29 + q.y * 0.02), lod).g - showerMean.g;
  float reachDown = 0.5 + 1.6 * textureLod(uNoise, vec2(s * 0.07 + uCloudScroll.x * 0.91 + 0.7, 0.12), lod + 1.0).r;
  float fall = smoothstep(-0.08, 0.12, where + strands * 0.25) * (1.0 - smoothstep(0.35 * reachDown, reachDown, drop)) * under;
  vec3 hazed = mix(col, mix(airCol, shade, 0.25), 0.3 * under * (1.0 - 0.6 * drop));
  vec3 rainCol = mix(shade * 0.5, airCol, 0.1 + 0.5 * drop);
  vec3 snowCol = mix(vec3(dot(uCloudLit, vec3(0.33))), airCol, 0.3 + 0.3 * drop);
  fall = floor(fall * 4.0 + grain) / 4.0;
  return mix(col, mix(hazed, mix(rainCol, snowCol, uFront.z), fall * 0.9), show);
}
`;

// ---- cloud by direction -----------------------------------------------------------
// The sky low down on any side is cloud tens of kilometres off, and it need
// not be the cloud overhead. The amount of cloud toward each of the eight
// compass bearings is known (see weather/cloudRound.ts); looking that way,
// each kind of cloud follows it, the more so the nearer the horizon, and
// straight overhead it is the cloud of the place itself.
export const COVER_ROUND = `
uniform vec4 uCoverBy[2]; // how cloudy it is toward each compass bearing, 0..1: north, north-east, east, south-east, then south, south-west, west, north-west
uniform vec3 uSkyClear[3]; // the colours of the air (zenith, middle, horizon) as they would be with no cloud at all
uniform vec3 uSkyGrey[3];  // and under full cloud
uniform float uStarsClear; // how well the stars would show with no cloud

// How cloudy it is out toward the horizon on one bearing. The eight readings
// run into one another smoothly all the way round: each counts most on its
// own bearing and for nothing a quarter turn away.
float coverToward(float az) {
  float sum = 0.0;
  float weight = 0.0;
  for (int i = 0; i < 8; i++) {
    // (You face west: north is a quarter turn to your right.)
    float w = pow(max(cos(az - 1.5708 - float(i) * 0.7854), 0.0), 6.0);
    sum += w * uCoverBy[i / 4][i % 4];
    weight += w;
  }
  return sum / weight;
}

// How much cloudier (above 0) or clearer (below) one part of the sky is than the sky overhead.
float coverDiffers(float az, float el) {
  return (coverToward(az) - uCloud) * (1.0 - smoothstep(0.12, 0.95, el));
}

// The air's colour at a height in the sky, from three colours (zenith, middle, horizon).
vec3 airOf(vec3 three[3], float t) {
  return t < 0.4 ? mix(three[2], three[1], t / 0.4) : mix(three[1], three[0], (t - 0.4) / 0.6);
}

// The cloud at each height (low, middle, high) as it is in one part of the sky.
vec3 layersToward(float az, float el) {
  float farOff = 1.0 - smoothstep(0.12, 0.95, el); // 1 along the horizon, 0 overhead
  float differs = (coverToward(az) - uCloud) * farOff;
  // Cloudier out there than here: every layer fills in, the low cloud first. Clearer: every layer thins alike.
  return differs > 0.0
    ? uLayers + (1.0 - uLayers) * vec3(1.0, 0.7, 0.45) * (differs / max(1.0 - uCloud, 0.05))
    : uLayers * (1.0 + differs / max(uCloud, 0.05));
}
`;

// ---- a halo -------------------------------------------------------------------------
// Thin high cloud is ice, and ice bends the light of the sun or the moon into
// a ring 22 degrees from it: sharp and faintly red along its inner edge,
// fading away outward. No high cloud, no ring; nor through thick cloud.
export const HALO = `
float haloRing(vec3 ray, vec3 lamp) {
  float from = degrees(acos(clamp(dot(ray, lamp), -1.0, 1.0)));
  return smoothstep(21.2, 21.9, from) * exp(-max(from - 21.9, 0.0) / 1.7);
}

vec3 haloRound(vec3 col, vec3 ray, float az, float el, vec3 layers, float veil, vec2 fc) {
  float ice = smoothstep(0.06, 0.3, layers.z) * (1.0 - smoothstep(0.6, 0.92, layers.z)) * (1.0 - smoothstep(0.45, 0.85, layers.x)) * (1.0 - 1.4 * veil);
  if (ice < 0.02) return col;
  // It is brighter where the ice cloud itself is thicker.
  ice *= 0.4 + 0.6 * smoothstep(0.35, 0.7, cirrus(az, el));
  float byMoon = haloRing(ray, uMoonDir) * uMoonVis * smoothstep(0.15, 0.7, uMoonLit) * (1.0 - uShadow.w);
  float bySun = haloRing(ray, uSunDir) * smoothstep(0.0, 0.1, uSunDir.y) * (1.0 - uMoonVis);
  float grain = bayer(fc);
  col += vec3(0.14, 0.18, 0.27) * (floor(byMoon * ice * 5.0 + grain) / 5.0);
  col += vec3(0.15, 0.135, 0.12) * (floor(bySun * ice * 5.0 + grain) / 5.0);
  return col;
}
`;

// ---- the moon in the Earth's shadow --------------------------------------------------
// During an eclipse the shadow's dark core crosses the moon from one edge.
// Its rim is soft (it is the shadow of the Earth's air, not of its rock);
// round it lies the half-shadow, which only dims. Inside the core the one
// light left is what the air bends round into the shadow, every sunset on
// Earth at once: a deep copper red, hardly to be seen until the bright part
// of the moon is nearly gone.
export const EARTH_SHADOW = `
uniform vec4 uShadow; // the Earth's shadow on the moon: its middle, measured from the moon's middle in moon radii (x, y), its radius in moon radii (0 for none), and how much of the moon's light it has taken (0..1)

// The face of the moon at a point on its disc (m, in moon radii), as the shadow leaves it.
vec3 inEarthShadow(vec3 face, vec2 m, float grain) {
  if (uShadow.z <= 0.0) return face;
  float from = length(m - uShadow.xy);
  float halfShadow = 1.0 - smoothstep(uShadow.z, uShadow.z + 2.0, from);
  face *= 1.0 - 0.32 * halfShadow * halfShadow;
  float core = floor((1.0 - smoothstep(uShadow.z - 0.24, uShadow.z + 0.08, from)) * 5.0 + grain) / 5.0;
  float deep = 1.0 - smoothstep(0.0, uShadow.z, from); // darker toward the middle of the shadow
  vec3 copper = mix(vec3(0.55, 0.2, 0.08), vec3(0.27, 0.075, 0.035), deep) * (0.3 + 0.7 * smoothstep(0.55, 0.95, uShadow.w));
  return mix(face, copper * (0.35 + 0.65 * dot(face, vec3(0.33))), core);
}
`;
