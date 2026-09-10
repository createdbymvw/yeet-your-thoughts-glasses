/**
 * Tunable constants for the ritual. All durations in milliseconds.
 */
export const config = Object.freeze({
  /** Hard cap on thought length. Short copy is a glasses constraint, not a limitation. */
  maxLength: 140,

  timing: Object.freeze({
    /** The hero burn: ember line → char → travel → fragments → embers. */
    burn: 4000,
    /** Embers linger after the paper is gone, then fade. */
    afterglowEmbers: 900,
    /** The closing line stays visible this long. */
    afterglowCopy: 2400,
    /** Gap before a fresh paper fades back in. */
    resetGap: 350,
    /** Reduced-motion variants: shorter, calmer. */
    reducedBurn: 1500,
    reducedAfterglow: 1800,
  }),

  /** Approximate native resolution of the target monocular display (see docs/meta-glasses.md). */
  glasses: Object.freeze({ width: 600, height: 600 }),

  /** Particle budgets. Glasses mode uses the lower numbers. */
  embers: Object.freeze({
    maxParticlesBrowser: 260,
    maxParticlesGlasses: 120,
    ambientRateBrowser: 2.2, // particles per second
    ambientRateGlasses: 1.2,
  }),
});
