// PATH-TRACE: the real shapes of things, laid out so that a ray can find what it strikes.
//
// The light is worked out by following paths of it backwards from each place in the picture: out to the
// sun, the sky, the fire and the lamps, and on from whatever a path strikes, bounce after bounce. For that
// to be true to the scene, a path has to strike the scene itself: the very triangles the houses, walls,
// stones and sheep are drawn with, not boxes standing in for them. There are thousands of those, so they
// are sorted into a tree of boxes within boxes (each box holding the two smaller boxes, or the few
// triangles, inside it); a ray that misses a box need look at nothing in it, and finds its triangle after
// trying a few dozen boxes, not thousands of triangles.
//
// The tree and the triangles are handed to the shader as two pictures of numbers.

type V3 = [number, number, number];

/** How many boxes, and how many triangles, lie along one row of their pictures. */
const BOXES_ACROSS = 256;
const TRIS_ACROSS = 256;
/** The most triangles left in one box. */
const LEAF = 4;

/** Room kept in the two pictures for the things that come and go (the logs in the pile, the stones of the cairn): so many boxes, so many triangles. */
const SPARE_BOX_ROWS = 6;
const SPARE_TRI_ROWS = 3;

export interface RayScene {
  /** The tree, two places to a box: [low corner, where to go next if the ray misses it], [high corner, its triangles if it holds any (first * 8 + how many), else -1]. */
  boxes: Float32Array;
  boxesWide: number;
  boxesHigh: number;
  boxCount: number;
  /** The triangles, three places to each: [a corner, red], [one edge from it, green], [the other edge, blue] (the colours being how much light the thing gives back; red below 0 means turf, which takes the colour of the grass as it is that day). */
  tris: Float32Array;
  trisWide: number;
  trisHigh: number;
  triCount: number;
  /** Where the things that come and go are kept: the row of each picture theirs begin on. */
  spareBoxRow: number;
  spareTriRow: number;
}

/** A second, small tree, of the things that come and go: to be written into the pictures from `spareBoxRow` and `spareTriRow` down. */
export interface RayExtras {
  boxes: Float32Array;
  boxRows: number;
  /** The first box of it, and one past the last, as the shader counts them. */
  from: number;
  to: number;
  tris: Float32Array;
  triRows: number;
}

/** The colour a path picks up from each material it strikes (what share of the light falling on it comes back, in red, green and blue). */
const GIVES_BACK: Record<number, V3> = {
  0: [0.17, 0.14, 0.12], // tarred boards
  1: [0.45, 0.44, 0.42], // dry stone
  2: [0.2, 0.15, 0.1], // soil
  3: [0.86, 0.86, 0.82], // white paint
  4: [0.16, 0.2, 0.26], // glass
  5: [-1, 0, 0], // turf
  6: [0.8, 0.77, 0.72], // wool
  7: [0.15, 0.13, 0.15],
  8: [0.42, 0.42, 0.42], // rock
  9: [0.4, 0.4, 0.4],
  10: [0.42, 0.3, 0.22],
  11: [0.62, 0.62, 0.64],
  12: [0.6, 0.2, 0.17], // red boards
  13: [0.84, 0.84, 0.8], // whitewash
  14: [0.35, 0.25, 0.16], // logs
  15: [0.3, 0.32, 0.36], // slate
  16: [0.5, 0.55, 0.6],
  17: [0.72, 0.2, 0.17], // red paint
  18: [0.1, 0.09, 0.08], // charred wood
  19: [0.28, 0.2, 0.14], // bark
  20: [0.8, 0.64, 0.42], // cut wood
  21: [0.8, 0.62, 0.28], // ochre paint, hay
  22: [0.36, 0.5, 0.66], // blue paint
  23: [0.7, 0.54, 0.26], // brass
  24: [0.4, 0.26, 0.1],
  25: [0.8, 0.67, 0.35],
  26: [0.3, 0.18, 0.1], // walnut
};
/** Materials that are lights themselves (a lantern's glass): a ray goes through them. */
const SHINES = new Set([47, 41, 42]);

/**
 * Sort triangles into a tree. `corners` holds nine numbers to a triangle. Gives back the boxes (eight
 * numbers to each, counted from `boxBase`, their triangles from `triBase`) and the order the triangles
 * are to be written in.
 */
function sortIntoTree(corners: number[], boxBase: number, triBase: number): { boxes: number[]; order: Uint32Array } {
  const n = corners.length / 9;
  // Each triangle's own box, and its middle.
  const lo = new Float32Array(n * 3);
  const hi = new Float32Array(n * 3);
  const mid = new Float32Array(n * 3);
  for (let t = 0; t < n; t++) {
    for (let a = 0; a < 3; a++) {
      const p = corners[t * 9 + a];
      const q = corners[t * 9 + 3 + a];
      const r = corners[t * 9 + 6 + a];
      lo[t * 3 + a] = Math.min(p, q, r);
      hi[t * 3 + a] = Math.max(p, q, r);
      mid[t * 3 + a] = (lo[t * 3 + a] + hi[t * 3 + a]) / 2;
    }
  }

  // The tree, built from the top: a box is cut in two where that leaves the least for a ray to look through
  // (the cut is tried at a dozen places along each of the three ways, and the cheapest kept).
  const order = new Uint32Array(n);
  for (let t = 0; t < n; t++) order[t] = t;
  const boxes: number[] = [];
  const BINS = 12;
  const binN = new Uint32Array(BINS);
  const binL = new Float64Array(BINS * 3);
  const binH = new Float64Array(BINS * 3);
  const farCost = new Float64Array(BINS);
  const l = new Float64Array(3);
  const h = new Float64Array(3);
  const area = (lw: ArrayLike<number>, hw: ArrayLike<number>) => {
    const x = hw[0] - lw[0];
    const y = hw[1] - lw[1];
    const z = hw[2] - lw[2];
    return x * y + y * z + z * x;
  };
  const build = (first: number, many: number): void => {
    const at = boxes.length / 8;
    const bl = [Infinity, Infinity, Infinity];
    const bh = [-Infinity, -Infinity, -Infinity];
    const cl = [Infinity, Infinity, Infinity];
    const ch = [-Infinity, -Infinity, -Infinity];
    for (let i = first; i < first + many; i++) {
      const t = order[i];
      for (let a = 0; a < 3; a++) {
        bl[a] = Math.min(bl[a], lo[t * 3 + a]);
        bh[a] = Math.max(bh[a], hi[t * 3 + a]);
        cl[a] = Math.min(cl[a], mid[t * 3 + a]);
        ch[a] = Math.max(ch[a], mid[t * 3 + a]);
      }
    }
    boxes.push(bl[0], bl[1], bl[2], 0, bh[0], bh[1], bh[2], -1);
    let cutAxis = -1;
    let cutAt = 0;
    if (many > LEAF) {
      const whole = area(bl, bh);
      let best = many * whole; // what it costs to leave them all in one box
      for (let a = 0; a < 3; a++) {
        const span = ch[a] - cl[a];
        if (span < 1e-5) continue;
        binN.fill(0);
        binL.fill(Infinity);
        binH.fill(-Infinity);
        for (let i = first; i < first + many; i++) {
          const t = order[i];
          const b = Math.min(BINS - 1, Math.floor(((mid[t * 3 + a] - cl[a]) / span) * BINS));
          binN[b]++;
          for (let k = 0; k < 3; k++) {
            if (lo[t * 3 + k] < binL[b * 3 + k]) binL[b * 3 + k] = lo[t * 3 + k];
            if (hi[t * 3 + k] > binH[b * 3 + k]) binH[b * 3 + k] = hi[t * 3 + k];
          }
        }
        // The cost of the far side of each cut, gathered from the far end; then the near side as the cut moves along.
        l.fill(Infinity);
        h.fill(-Infinity);
        let c = 0;
        for (let b = BINS - 1; b > 0; b--) {
          c += binN[b];
          for (let k = 0; k < 3; k++) {
            l[k] = Math.min(l[k], binL[b * 3 + k]);
            h[k] = Math.max(h[k], binH[b * 3 + k]);
          }
          farCost[b] = c ? c * area(l, h) : 0;
        }
        l.fill(Infinity);
        h.fill(-Infinity);
        c = 0;
        for (let b = 0; b < BINS - 1; b++) {
          c += binN[b];
          for (let k = 0; k < 3; k++) {
            l[k] = Math.min(l[k], binL[b * 3 + k]);
            h[k] = Math.max(h[k], binH[b * 3 + k]);
          }
          if (c === 0 || c === many) continue;
          const cost = c * area(l, h) + farCost[b + 1] + whole * 1.2;
          if (cost < best) {
            best = cost;
            cutAxis = a;
            cutAt = cl[a] + (span * (b + 1)) / BINS;
          }
        }
      }
      // (More than a box may hold, and no cut is worth it: halve them along the longest way all the same.)
      if (cutAxis < 0 && many > 7) {
        const axis = ch[0] - cl[0] > ch[1] - cl[1] ? (ch[0] - cl[0] > ch[2] - cl[2] ? 0 : 2) : ch[1] - cl[1] > ch[2] - cl[2] ? 1 : 2;
        const sorted = Array.from(order.subarray(first, first + many)).sort((p, q) => mid[p * 3 + axis] - mid[q * 3 + axis]);
        order.set(sorted, first);
        const half = many >> 1;
        build(first, half);
        build(first + half, many - half);
        boxes[at * 8 + 3] = boxBase + boxes.length / 8;
        return;
      }
    }
    if (cutAxis < 0) {
      boxes[at * 8 + 7] = (triBase + first) * 8 + many;
    } else {
      let i = first;
      let j = first + many - 1;
      while (i <= j) {
        if (mid[order[i] * 3 + cutAxis] < cutAt) i++;
        else {
          const swap = order[i];
          order[i] = order[j];
          order[j] = swap;
          j--;
        }
      }
      build(first, i - first);
      build(i, first + many - i);
    }
    // Where a ray goes when it misses this box (or has done with it): the next box that is not inside it.
    boxes[at * 8 + 3] = boxBase + boxes.length / 8;
  };
  if (n > 0) build(0, n);
  return { boxes, order };
}

/** The triangles of part of a mesh, as corners and colours. `vertices` holds `stride` numbers to a corner, the place first and the material at `matAt`. */
function gather(vertices: Float32Array, start: number, count: number, stride: number, matAt: number, within: number[] | null, corners: number[], colours: number[]): void {
  for (let i = start; i + 2 < start + count; i += 3) {
    const mat = Math.round(vertices[i * stride + matAt]);
    if (SHINES.has(mat)) continue;
    if (within) {
      let inside = false;
      for (let k = 0; k < 3; k++) {
        const x = vertices[(i + k) * stride];
        const z = vertices[(i + k) * stride + 2];
        if (x > within[0] && x < within[2] && z > within[1] && z < within[3]) inside = true;
      }
      if (!inside) continue;
    }
    for (let k = 0; k < 3; k++) corners.push(vertices[(i + k) * stride], vertices[(i + k) * stride + 1], vertices[(i + k) * stride + 2]);
    colours.push(...(GIVES_BACK[mat] ?? [0.4, 0.4, 0.4]));
  }
}

function writeTris(into: Float32Array, corners: number[], colours: number[], order: Uint32Array): void {
  for (let i = 0; i < order.length; i++) {
    const t = order[i];
    const c = t * 9;
    into.set(
      [corners[c], corners[c + 1], corners[c + 2], colours[t * 3], corners[c + 3] - corners[c], corners[c + 4] - corners[c + 1], corners[c + 5] - corners[c + 2], colours[t * 3 + 1], corners[c + 6] - corners[c], corners[c + 7] - corners[c + 1], corners[c + 8] - corners[c + 2], colours[t * 3 + 2]],
      i * 12,
    );
  }
}

/** Sort triangles given outright (nine numbers to each for its corners, three for its colour) into the tree. */
export function buildRaySceneOf(corners: number[], colours: number[]): RayScene {
  const n = corners.length / 9;
  const { boxes, order } = sortIntoTree(corners, 0, 0);
  const boxCount = boxes.length / 8;
  const boxesWide = BOXES_ACROSS * 2;
  const spareBoxRow = Math.max(1, Math.ceil(boxCount / BOXES_ACROSS));
  const boxesHigh = spareBoxRow + SPARE_BOX_ROWS;
  const boxData = new Float32Array(boxesWide * boxesHigh * 4);
  boxData.set(boxes);
  const trisWide = TRIS_ACROSS * 3;
  const spareTriRow = Math.max(1, Math.ceil(n / TRIS_ACROSS));
  const trisHigh = spareTriRow + SPARE_TRI_ROWS;
  const triData = new Float32Array(trisWide * trisHigh * 4);
  writeTris(triData, corners, colours, order);
  return { boxes: boxData, boxesWide, boxesHigh, boxCount, tris: triData, trisWide, trisHigh, triCount: n, spareBoxRow, spareTriRow };
}

/**
 * Sort the fixed triangles of a mesh into the tree: the first `count` corners of `vertices`, and of
 * those only triangles with a corner inside `within` ([x0, z0, x1, z1]).
 */
export function buildRayScene(vertices: Float32Array, count: number, stride: number, matAt: number, within: number[]): RayScene {
  const corners: number[] = [];
  const colours: number[] = [];
  gather(vertices, 0, count, stride, matAt, within, corners, colours);
  return buildRaySceneOf(corners, colours);
}

/**
 * The second tree: the things that are there just now of those that come and go. `parts` are the runs of
 * corners to take from `vertices`, each [first corner, how many].
 */
export function buildRayExtras(scene: RayScene, vertices: Float32Array, parts: [number, number][], stride: number, matAt: number): RayExtras {
  const corners: number[] = [];
  const colours: number[] = [];
  for (const [start, count] of parts) gather(vertices, start, count, stride, matAt, null, corners, colours);
  // (No more than there is room for.)
  const most = SPARE_TRI_ROWS * TRIS_ACROSS;
  if (corners.length / 9 > most) {
    corners.length = most * 9;
    colours.length = most * 3;
  }
  const from = scene.spareBoxRow * BOXES_ACROSS;
  const triBase = scene.spareTriRow * TRIS_ACROSS;
  const { boxes, order } = sortIntoTree(corners, from, triBase);
  const count = Math.min(boxes.length / 8, SPARE_BOX_ROWS * BOXES_ACROSS);
  const boxData = new Float32Array(BOXES_ACROSS * 2 * SPARE_BOX_ROWS * 4);
  boxData.set(boxes.slice(0, count * 8));
  const triData = new Float32Array(TRIS_ACROSS * 3 * SPARE_TRI_ROWS * 4);
  writeTris(triData, corners, colours, order);
  return { boxes: boxData, boxRows: SPARE_BOX_ROWS, from, to: from + count, tris: triData, triRows: SPARE_TRI_ROWS };
}

/**
 * For the shader that follows the light: finding what a ray strikes among those triangles.
 * `meshHit` gives the nearest (how far, which way the face looks, and its colour); `meshAny` only says
 * whether anything is in the way, and stops at the first thing that is.
 */
export const RAY_MESH = `
uniform sampler2D uBoxes;
uniform sampler2D uTris;
uniform float uBoxCount; // how many boxes the tree of fixed things has (it starts at box 0)
uniform vec2 uExtras;    // the tree of things that come and go: its first box, and one past its last
vec4 boxPart(int i, int part) { return texelFetch(uBoxes, ivec2((i % ${BOXES_ACROSS}) * 2 + part, i / ${BOXES_ACROSS}), 0); }
vec4 triPart(int i, int part) { return texelFetch(uTris, ivec2((i % ${TRIS_ACROSS}) * 3 + part, i / ${TRIS_ACROSS}), 0); }
vec3 rayInverse(vec3 rd) {
  return 1.0 / vec3(abs(rd.x) < 1e-6 ? 1e-6 : rd.x, abs(rd.y) < 1e-6 ? 1e-6 : rd.y, abs(rd.z) < 1e-6 ? 1e-6 : rd.z);
}
// How far along the ray it strikes triangle i (or -1), by Moller and Trumbore's rule.
float triHit(int i, vec3 ro, vec3 rd, out vec3 e1, out vec3 e2) {
  vec3 v0 = triPart(i, 0).xyz;
  e1 = triPart(i, 1).xyz;
  e2 = triPart(i, 2).xyz;
  vec3 h = cross(rd, e2);
  float det = dot(e1, h);
  if (abs(det) < 1e-10) return -1.0;
  float f = 1.0 / det;
  vec3 s = ro - v0;
  float u = f * dot(s, h);
  if (u < 0.0 || u > 1.0) return -1.0;
  vec3 q = cross(s, e1);
  float v = f * dot(rd, q);
  if (v < 0.0 || u + v > 1.0) return -1.0;
  return f * dot(e2, q);
}
float meshHit(vec3 ro, vec3 rd, float reach, out vec3 n, out vec3 colour) {
  vec3 inv = rayInverse(rd);
  float best = reach;
  int struck = -1;
  n = vec3(0.0, 1.0, 0.0);
  colour = vec3(0.4);
  for (int tree = 0; tree < 2; tree++) {
    int i = tree == 0 ? 0 : int(uExtras.x);
    int count = tree == 0 ? int(uBoxCount) : int(uExtras.y);
    for (int step = 0; step < 640; step++) {
      if (i >= count) break;
      vec4 a = boxPart(i, 0);
      vec4 b = boxPart(i, 1);
      vec3 t0 = (a.xyz - ro) * inv;
      vec3 t1 = (b.xyz - ro) * inv;
      vec3 lowT = min(t0, t1);
      vec3 highT = max(t0, t1);
      float enter = max(max(lowT.x, lowT.y), max(lowT.z, 0.0));
      float leave = min(min(highT.x, highT.y), min(highT.z, best));
      if (enter > leave) {
        i = int(a.w);
      } else if (b.w < 0.0) {
        i++;
      } else {
        int packed = int(b.w);
        int first = packed / 8;
        int many = packed - first * 8;
        for (int k = 0; k < 7; k++) {
          if (k >= many) break;
          vec3 e1, e2;
          float t = triHit(first + k, ro, rd, e1, e2);
          if (t > 0.012 && t < best) {
            best = t;
            struck = first + k;
            n = cross(e1, e2);
          }
        }
        i = int(a.w);
      }
    }
  }
  if (struck < 0) return -1.0;
  n = normalize(n);
  if (dot(n, rd) > 0.0) n = -n;
  colour = vec3(triPart(struck, 0).w, triPart(struck, 1).w, triPart(struck, 2).w);
  return best;
}
bool meshAny(vec3 ro, vec3 rd, float reach) {
  vec3 inv = rayInverse(rd);
  for (int tree = 0; tree < 2; tree++) {
    int i = tree == 0 ? 0 : int(uExtras.x);
    int count = tree == 0 ? int(uBoxCount) : int(uExtras.y);
    for (int step = 0; step < 640; step++) {
      if (i >= count) break;
      vec4 a = boxPart(i, 0);
      vec4 b = boxPart(i, 1);
      vec3 t0 = (a.xyz - ro) * inv;
      vec3 t1 = (b.xyz - ro) * inv;
      vec3 lowT = min(t0, t1);
      vec3 highT = max(t0, t1);
      float enter = max(max(lowT.x, lowT.y), max(lowT.z, 0.0));
      float leave = min(min(highT.x, highT.y), min(highT.z, reach));
      if (enter > leave) {
        i = int(a.w);
      } else if (b.w < 0.0) {
        i++;
      } else {
        int packed = int(b.w);
        int first = packed / 8;
        int many = packed - first * 8;
        for (int k = 0; k < 7; k++) {
          if (k >= many) break;
          vec3 e1, e2;
          float t = triHit(first + k, ro, rd, e1, e2);
          if (t > 0.012 && t < reach) return true;
        }
        i = int(a.w);
      }
    }
  }
  return false;
}
`;
