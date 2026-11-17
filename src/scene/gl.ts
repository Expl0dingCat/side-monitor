// Small WebGL2 helpers: matrices, shader programs and the shared noise texture.

export type V3 = [number, number, number];
export type Rgb = [number, number, number];
export type Mat4 = Float32Array;

export const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

/** View matrix for a camera at `eye` with the given axes (right, up, and back = -forward). */
export function viewMatrix(eye: V3, right: V3, up: V3, back: V3): Mat4 {
  return new Float32Array([
    right[0], up[0], back[0], 0,
    right[1], up[1], back[1], 0,
    right[2], up[2], back[2], 0,
    -dot(right, eye), -dot(up, eye), -dot(back, eye), 1,
  ]);
}

/** a * b, both column-major. */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

/** The inverse of a 4x4 matrix (column-major). */
export function invert(m: Mat4): Mat4 {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  const det = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
  return new Float32Array([
    (a11 * b11 - a12 * b10 + a13 * b09) * det, (a02 * b10 - a01 * b11 - a03 * b09) * det,
    (a31 * b05 - a32 * b04 + a33 * b03) * det, (a22 * b04 - a21 * b05 - a23 * b03) * det,
    (a12 * b08 - a10 * b11 - a13 * b07) * det, (a00 * b11 - a02 * b08 + a03 * b07) * det,
    (a32 * b02 - a30 * b05 - a33 * b01) * det, (a20 * b05 - a22 * b02 + a23 * b01) * det,
    (a10 * b10 - a11 * b08 + a13 * b06) * det, (a01 * b08 - a00 * b10 - a03 * b06) * det,
    (a30 * b04 - a31 * b02 + a33 * b00) * det, (a21 * b02 - a20 * b04 - a23 * b00) * det,
    (a11 * b07 - a10 * b09 - a12 * b06) * det, (a00 * b09 - a01 * b07 + a02 * b06) * det,
    (a31 * b01 - a30 * b03 - a32 * b00) * det, (a20 * b03 - a21 * b01 + a22 * b00) * det,
  ]);
}

export class Program {
  readonly handle: WebGLProgram;
  private locations = new Map<string, WebGLUniformLocation | null>();

  /** `attribs` are bound to locations 0, 1, 2... in the order given. */
  constructor(private gl: WebGL2RenderingContext, name: string, vert: string, frag: string, attribs: string[]) {
    const program = gl.createProgram()!;
    for (const [type, src] of [[gl.VERTEX_SHADER, vert], [gl.FRAGMENT_SHADER, frag]] as const) {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(`${name} shader failed to compile: ${gl.getShaderInfoLog(shader)}`);
      }
      gl.attachShader(program, shader);
    }
    attribs.forEach((a, i) => gl.bindAttribLocation(program, i, a));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`${name} program failed to link: ${gl.getProgramInfoLog(program)}`);
    }
    this.handle = program;
  }

  use(): this {
    this.gl.useProgram(this.handle);
    return this;
  }

  private loc(name: string): WebGLUniformLocation | null {
    let l = this.locations.get(name);
    if (l === undefined) {
      l = this.gl.getUniformLocation(this.handle, name);
      this.locations.set(name, l);
    }
    return l;
  }

  /** Set uniforms by name. Numbers are floats; arrays of 2, 3 or 4 are vectors; 16 is a matrix. */
  set(values: Record<string, number | ArrayLike<number>>): this {
    const gl = this.gl;
    for (const name in values) {
      const l = this.loc(name);
      if (l === null) continue; // unused in this shader
      const v = values[name];
      if (typeof v === 'number') gl.uniform1f(l, v);
      else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
      else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
      else if (v.length === 4) gl.uniform4f(l, v[0], v[1], v[2], v[3]);
      else if (v.length === 9) gl.uniformMatrix3fv(l, false, v as Float32Array);
      else gl.uniformMatrix4fv(l, false, v as Float32Array);
    }
    return this;
  }

  /** Set an array of 2-, 3- or 4-part vectors from a flat list of numbers. */
  list(name: string, size: 2 | 3 | 4, values: number[]): this {
    const l = this.loc(name);
    if (l === null) return this;
    if (size === 2) this.gl.uniform2fv(l, values);
    else if (size === 3) this.gl.uniform3fv(l, values);
    else this.gl.uniform4fv(l, values);
    return this;
  }

  sampler(name: string, unit: number): this {
    this.gl.uniform1i(this.loc(name), unit);
    return this;
  }
}

/**
 * A 256x256 texture holding four independent layers of soft, tileable noise.
 * Everything that drifts (gusts in the grass, cloud shadows, clouds, the sea)
 * is read from it, scrolled at different speeds and scales.
 */
let noiseKept: Uint8Array | null = null;
/** The numbers of that texture (256 x 256, four to a place), for anything that must do in the page the same sum a shader does with it. */
export function noiseBytes(): Uint8Array {
  if (noiseKept) return noiseKept;
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  let seed = 1234567;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
  const octaves: [number, number][] = [[4, 0.5], [8, 0.25], [16, 0.13], [32, 0.07], [64, 0.05]];
  for (let ch = 0; ch < 4; ch++) {
    const field = new Float32Array(size * size);
    for (const [period, weight] of octaves) {
      const lattice = new Float32Array(period * period);
      for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
      const cell = size / period;
      for (let y = 0; y < size; y++) {
        const gy = y / cell;
        const y0 = Math.floor(gy);
        const fy = gy - y0;
        const sy = fy * fy * (3 - 2 * fy);
        for (let x = 0; x < size; x++) {
          const gx = x / cell;
          const x0 = Math.floor(gx);
          const fx = gx - x0;
          const sx = fx * fx * (3 - 2 * fx);
          const a = lattice[(y0 % period) * period + (x0 % period)];
          const b = lattice[(y0 % period) * period + ((x0 + 1) % period)];
          const c = lattice[((y0 + 1) % period) * period + (x0 % period)];
          const d = lattice[((y0 + 1) % period) * period + ((x0 + 1) % period)];
          field[y * size + x] += weight * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
        }
      }
    }
    // Stretch to the full 0..1 range so thresholds behave predictably.
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of field) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    for (let i = 0; i < field.length; i++) data[i * 4 + ch] = Math.round(((field[i] - lo) / (hi - lo)) * 255);
  }
  noiseKept = data;
  return data;
}

/** Its first layer at a place (each way 0..1, and round again), read as a shader reads it at full size: blended between the four nearest. */
export function noiseR(u: number, v: number): number {
  const data = noiseBytes();
  const x = u * 256 - 0.5;
  const y = v * 256 - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const at = (i: number, j: number) => data[((((j % 256) + 256) % 256) * 256 + (((i % 256) + 256) % 256)) * 4] / 255;
  return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
}

export function noiseTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const size = 256;
  const data = noiseBytes();

  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return tex;
}
