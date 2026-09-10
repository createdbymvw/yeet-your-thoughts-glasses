/**
 * BurnShader — the paper itself burns.
 *
 * A single fragment shader drives every stage from a scalar threshold:
 *   field(x,y) = height term + fractal noise
 *   d = field - threshold
 *     d  >  0.13 : untouched paper
 *     0 < d < .13: scorch (paper yellows and browns as heat approaches)
 *     |d| small  : the ember line — bright, flickering
 *    -.055< d <0 : char — blackened, developing holes
 *     d < -.055  : gone
 *
 * As the threshold sweeps from -0.15 to 1.35 the front rises through the sheet,
 * irregular because of the noise, taking the text with it.
 *
 * A software (Canvas2D) implementation of the same maths is included as a
 * fallback for environments without WebGL. Both expose the same interface:
 *   init() → boolean, setPaper(canvas), render({ threshold, time, seed }), clear(), dispose()
 *
 * Noise constants must match src/animation/noise.js.
 */

import { burnField, valueNoise } from './noise.js';

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_paper;
uniform float u_threshold;
uniform float u_time;
uniform float u_seed;
uniform float u_aspect;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = v_uv;
  vec2 q = vec2(uv.x * u_aspect, uv.y);
  vec4 paper = texture2D(u_paper, vec2(uv.x, 1.0 - uv.y));

  float big  = fbm(q * 2.2 + u_seed);
  float fine = fbm(q * 7.0 - u_seed * 1.7);
  float field = uv.y * 0.60 + (big - 0.5) * 0.55 + (fine - 0.5) * 0.14 + 0.28;
  float d = field - u_threshold;

  float flick = 0.5 + 0.5 * sin(u_time * 9.0 + fine * 50.0) * sin(u_time * 6.3 + big * 23.0);
  const float charW   = 0.055;
  const float emberW  = 0.016;
  const float scorchW = 0.13;

  vec3 col = paper.rgb;
  float alpha = paper.a;

  // scorch: the sheet warms, yellows and browns ahead of the front
  float s = 1.0 - smoothstep(0.0, scorchW, d);
  s *= s;
  col = mix(col, col * vec3(0.62, 0.42, 0.24), s);

  // char: blackened band behind the front
  float c = smoothstep(0.0, -charW * 0.45, d);
  col = mix(col, vec3(0.05, 0.03, 0.02), c);

  // ember line: bright, flickering, both sides of the front
  float glow = exp(-abs(d) / emberW);
  vec3 emberCol = mix(vec3(1.0, 0.28, 0.03), vec3(1.0, 0.78, 0.35), flick * 0.8);
  col += emberCol * glow * (0.85 + 0.5 * flick);

  // hot spots that keep glowing inside the char
  float spots = smoothstep(0.58, 0.9, vnoise(q * 28.0 + u_seed * 3.0));
  col += vec3(1.0, 0.4, 0.1) * spots * c * smoothstep(-charW, -charW * 0.5, d) * (0.5 + 0.5 * flick);

  // crumble: the char fragments and falls away
  float edge = smoothstep(-charW, -charW * 0.55, d);
  float crumble = vnoise(q * 55.0 + u_seed);
  float holes = step(0.78 - 0.25 * c, crumble) * c;
  alpha *= edge * (1.0 - holes);

  // stage one: a warm ember line along the bottom edge before the front exists
  float startGlow = exp(-uv.y * 24.0)
                  * (0.45 + 0.9 * fine)
                  * smoothstep(-0.15, -0.02, u_threshold)
                  * (1.0 - smoothstep(0.0, 0.22, u_threshold));
  col += emberCol * startGlow * (0.6 + 0.4 * flick);

  if (alpha < 0.02) discard;
  gl_FragColor = vec4(col, alpha);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`shader compile failed: ${log}`);
  }
  return sh;
}

export class GLBurn {
  #canvas; #gl = null; #program = null; #tex = null; #buf = null; #u = {};
  #aspect = 1;

  constructor(canvas) { this.#canvas = canvas; }

  get kind() { return 'webgl'; }

  init() {
    const gl = this.#canvas.getContext('webgl', {
      alpha: true, premultipliedAlpha: false, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: false, powerPreference: 'low-power',
    });
    if (!gl) return false;
    try {
      const vs = compile(gl, gl.VERTEX_SHADER, VERT);
      const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
      const prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.deleteShader(vs); gl.deleteShader(fs);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(prog, 'a_pos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      gl.useProgram(prog);
      this.#u = {
        paper: gl.getUniformLocation(prog, 'u_paper'),
        threshold: gl.getUniformLocation(prog, 'u_threshold'),
        time: gl.getUniformLocation(prog, 'u_time'),
        seed: gl.getUniformLocation(prog, 'u_seed'),
        aspect: gl.getUniformLocation(prog, 'u_aspect'),
      };
      gl.uniform1i(this.#u.paper, 0);

      this.#gl = gl; this.#program = prog; this.#buf = buf;
      return true;
    } catch {
      return false;
    }
  }

  setPaper(source) {
    const gl = this.#gl;
    this.#canvas.width = source.width;
    this.#canvas.height = source.height;
    this.#aspect = source.width / source.height;
    gl.viewport(0, 0, source.width, source.height);
    if (this.#tex) gl.deleteTexture(this.#tex);
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.#tex = tex;
  }

  render({ threshold, time, seed }) {
    const gl = this.#gl;
    if (!gl || !this.#tex) return;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(this.#u.threshold, threshold);
    gl.uniform1f(this.#u.time, time);
    gl.uniform1f(this.#u.seed, seed);
    gl.uniform1f(this.#u.aspect, this.#aspect);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Drop the paper texture (and the words on it). */
  clear() {
    const gl = this.#gl;
    if (!gl) return;
    if (this.#tex) { gl.deleteTexture(this.#tex); this.#tex = null; }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  dispose() {
    this.clear();
    const gl = this.#gl;
    if (!gl) return;
    if (this.#program) gl.deleteProgram(this.#program);
    if (this.#buf) gl.deleteBuffer(this.#buf);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.#gl = null;
  }
}

/**
 * SoftwareBurn — same maths on the CPU at reduced resolution. Used only when
 * WebGL is unavailable. Field values are precomputed once per burn so the
 * per-frame cost is a cheap threshold pass.
 */
export class SoftwareBurn {
  #canvas; #ctx; #w = 0; #h = 0; #field = null; #src = null; #buf = null; #bufCtx = null; #spots = null; #crumble = null;
  #resScale = 0.6;

  constructor(canvas) { this.#canvas = canvas; this.#ctx = canvas.getContext('2d'); }

  get kind() { return 'software'; }
  init() { return Boolean(this.#ctx); }

  setPaper(source, seed = 0) {
    const w = Math.max(8, Math.round(source.width * this.#resScale));
    const h = Math.max(8, Math.round(source.height * this.#resScale));
    this.#w = w; this.#h = h;
    this.#canvas.width = source.width; this.#canvas.height = source.height;

    const buf = document.createElement('canvas');
    buf.width = w; buf.height = h;
    const bctx = buf.getContext('2d', { willReadFrequently: true });
    bctx.drawImage(source, 0, 0, w, h);
    this.#src = bctx.getImageData(0, 0, w, h);
    this.#buf = buf; this.#bufCtx = bctx;

    // precompute field, spots, crumble
    const aspect = w / h;
    const field = new Float32Array(w * h);
    const spots = new Float32Array(w * h);
    const crumble = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const v = 1 - (y + 0.5) / h;
      for (let x = 0; x < w; x++) {
        const u = (x + 0.5) / w;
        const i = y * w + x;
        field[i] = burnField(u, v, aspect, seed);
        const sp = valueNoise(u * aspect * 28 + seed * 3, v * 28 + seed * 3);
        spots[i] = Math.min(1, Math.max(0, (sp - 0.58) / 0.32));
        crumble[i] = valueNoise(u * aspect * 55 + seed, v * 55 + seed);
      }
    }
    this.#field = field; this.#spots = spots; this.#crumble = crumble;
  }

  render({ threshold, time }) {
    if (!this.#src || !this.#field) return;
    const { data } = this.#src;
    const out = this.#bufCtx.createImageData(this.#w, this.#h);
    const o = out.data;
    const n = this.#w * this.#h;
    const charW = 0.055, emberW = 0.016, scorchW = 0.13;
    const flickBase = 0.5 + 0.5 * Math.sin(time * 9.0) * Math.sin(time * 6.3);
    const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

    for (let i = 0; i < n; i++) {
      const d = this.#field[i] - threshold;
      const j = i * 4;
      let a = data[j + 3] / 255;
      if (d < -charW) { o[j + 3] = 0; continue; }
      let r = data[j] / 255, g = data[j + 1] / 255, b = data[j + 2] / 255;
      const flick = flickBase * (0.6 + 0.4 * this.#crumble[i]);

      let s = 1 - smooth(0, scorchW, d); s *= s;
      r = r + (r * 0.62 - r) * s; g = g + (g * 0.42 - g) * s; b = b + (b * 0.24 - b) * s;

      const c = smooth(0, -charW * 0.45, d);
      r += (0.05 - r) * c; g += (0.03 - g) * c; b += (0.02 - b) * c;

      const glow = Math.exp(-Math.abs(d) / emberW) * (0.85 + 0.5 * flick);
      const er = 1.0, eg = 0.28 + (0.78 - 0.28) * flick * 0.8, eb = 0.03 + (0.35 - 0.03) * flick * 0.8;
      r += er * glow; g += eg * glow; b += eb * glow;

      const hot = this.#spots[i] * c * smooth(-charW, -charW * 0.5, d) * (0.5 + 0.5 * flick);
      r += 1.0 * hot; g += 0.4 * hot; b += 0.1 * hot;

      const edge = smooth(-charW, -charW * 0.55, d);
      const holes = (this.#crumble[i] >= 0.78 - 0.25 * c ? 1 : 0) * c;
      a *= edge * (1 - holes);

      const v = 1 - Math.floor(i / this.#w) / this.#h;
      const startGlow = Math.exp(-v * 24) * (0.45 + 0.9 * this.#crumble[i]) * smooth(-0.15, -0.02, threshold) * (1 - smooth(0, 0.22, threshold));
      r += er * startGlow * 0.8; g += eg * startGlow * 0.8; b += eb * startGlow * 0.8;

      o[j] = Math.min(255, r * 255); o[j + 1] = Math.min(255, g * 255); o[j + 2] = Math.min(255, b * 255);
      o[j + 3] = a * 255;
    }
    this.#bufCtx.putImageData(out, 0, 0);
    const ctx = this.#ctx;
    ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.#buf, 0, 0, this.#canvas.width, this.#canvas.height);
  }

  clear() {
    this.#src = null; this.#field = null; this.#spots = null; this.#crumble = null;
    if (this.#buf) { this.#bufCtx.clearRect(0, 0, this.#buf.width, this.#buf.height); this.#buf.width = this.#buf.height = 1; }
    this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
  }

  dispose() { this.clear(); }
}
