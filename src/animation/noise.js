/**
 * noise.js — value noise + fbm, mirrored 1:1 with the GLSL in BurnShader.js.
 *
 * The particle system needs to know *where* the burn front is so sparks can
 * detach from it. Rather than reading pixels back from the GPU, we evaluate the
 * same field on the CPU. Float precision differs slightly from the GPU but the
 * result is visually identical.
 *
 * KEEP IN SYNC with the shader source (constants: 2.2, 7.0, 1.7, 0.60, 0.55, 0.14, 0.28).
 */

const fract = (x) => x - Math.floor(x);

export function hash12(x, y) {
  let px = fract(x * 0.1031);
  let py = fract(y * 0.1030);
  let pz = fract(x * 0.0973);
  const d = px * (py + 33.33) + py * (pz + 33.33) + pz * (px + 33.33);
  px += d; py += d; pz += d;
  return fract((px + py) * pz);
}

export function valueNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash12(ix, iy), b = hash12(ix + 1, iy);
  const c = hash12(ix, iy + 1), d = hash12(ix + 1, iy + 1);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}

export function fbm(x, y) {
  let v = 0, a = 0.5;
  for (let i = 0; i < 5; i++) {
    v += a * valueNoise(x, y);
    const nx = 1.6 * x - 1.2 * y;
    const ny = 1.2 * x + 1.6 * y;
    x = nx; y = ny;
    a *= 0.5;
  }
  return v;
}

/**
 * The burn field. u,v in [0,1] with v = 0 at the BOTTOM of the paper.
 * Pixels burn when field < threshold; the threshold sweeps -0.15 → 1.35.
 */
export function burnField(u, v, aspect, seed) {
  const qx = u * aspect, qy = v;
  const big = fbm(qx * 2.2 + seed, qy * 2.2 + seed);
  const fine = fbm(qx * 7.0 - seed * 1.7, qy * 7.0 - seed * 1.7);
  return v * 0.60 + (big - 0.5) * 0.55 + (fine - 0.5) * 0.14 + 0.28;
}

/**
 * Estimate v (0 = bottom, 1 = top) of the burn front at horizontal position u
 * for a given threshold. Fixed-point iteration; 4 rounds is plenty.
 * Returns null when the front is outside the paper at this u.
 */
export function frontV(u, threshold, aspect, seed) {
  let v = (threshold - 0.28) / 0.60;
  for (let i = 0; i < 4; i++) {
    const qx = u * aspect, qy = Math.min(Math.max(v, 0), 1);
    const big = fbm(qx * 2.2 + seed, qy * 2.2 + seed);
    const fine = fbm(qx * 7.0 - seed * 1.7, qy * 7.0 - seed * 1.7);
    v = (threshold - 0.28 - (big - 0.5) * 0.55 - (fine - 0.5) * 0.14) / 0.60;
  }
  if (!(v >= 0 && v <= 1)) return null; // also rejects NaN
  return v;
}

export const THRESHOLD_START = -0.15;
export const THRESHOLD_END = 1.35;
