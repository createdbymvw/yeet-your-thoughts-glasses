import { config } from '../config.js';
import { renderPaper, scrubCanvas } from './PaperRaster.js';
import { GLBurn, SoftwareBurn } from './BurnShader.js';
import { Embers } from './Embers.js';
import { THRESHOLD_START, THRESHOLD_END } from './noise.js';

/**
 * BurnAnimation — orchestrates the hero interaction.
 *
 *   burn(text)   → raster the paper, sweep the burn field over ~4 s, emit sparks
 *   afterglow()  → let embers rest and fade
 *   ambient      → idle sparks drifting around the paper
 *
 * Owns the render loop for both canvases. The loop only runs while there is
 * something to draw, so an idle page with ambience off costs nothing.
 */

export class BurnAnimation {
  #stage; #paperWrap; #burnCanvas; #emberCanvas;
  #embers; #burner = null;
  #reduced; #getScale;
  #running = false; #last = 0; #raf = 0; #fallback = 0;
  #burnJob = null;
  #ambientOn = false;

  constructor({ stage, paperWrap, burnCanvas, emberCanvas, reducedMotion, getScale }) {
    this.#stage = stage;
    this.#paperWrap = paperWrap;
    this.#burnCanvas = burnCanvas;
    this.#emberCanvas = emberCanvas;
    this.#reduced = reducedMotion;
    this.#getScale = getScale ?? (() => 1);
    this.#embers = new Embers(emberCanvas);

    window.addEventListener('resize', this.#onResize);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.#kick(); });
  }

  get renderer() { return this.#burner?.kind ?? 'none'; }

  init() {
    const gl = new GLBurn(this.#burnCanvas);
    if (gl.init()) this.#burner = gl;
    else {
      const sw = new SoftwareBurn(this.#burnCanvas);
      if (sw.init()) this.#burner = sw;
    }
    this.#onResize();
    return this.#burner !== null;
  }

  setBudget(glasses) {
    const e = config.embers;
    this.#embers.setBudget(
      glasses ? e.maxParticlesGlasses : e.maxParticlesBrowser,
      glasses ? e.ambientRateGlasses : e.ambientRateBrowser,
    );
  }

  setAmbient(on) {
    this.#ambientOn = on && !this.#reduced;
    this.#embers.setAmbient(this.#ambientOn, this.#paperRect());
    this.#kick();
  }

  /**
   * Burn the paper with `text` on it. Resolves when the sheet is gone.
   * `style` describes the DOM paper so the raster matches.
   */
  burn({ text, style }) {
    if (this.#reduced || !this.#burner) {
      // CSS handles the reduced-motion crossfade; we just keep time.
      return new Promise((resolve) => setTimeout(resolve, config.timing.reducedBurn));
    }

    const rect = this.#paperRect();
    if (!(rect.w > 4 && rect.h > 4)) {
      // degenerate layout (zero-size viewport); skip the visual, keep the ritual's timing
      return new Promise((resolve) => setTimeout(resolve, config.timing.burn));
    }
    const scale = Math.min(3, Math.min(window.devicePixelRatio || 1, 2) * this.#getScale());
    const raster = renderPaper({ width: rect.w, height: rect.h, scale, text, style });
    const seed = Math.random() * 100;
    const aspect = rect.w / rect.h;

    this.#burner.setPaper(raster, seed);
    scrubCanvas(raster); // the words now live only in the burner's texture

    this.#embers.setAmbient(false);

    return new Promise((resolve) => {
      this.#burnJob = {
        start: performance.now(), duration: config.timing.burn, seed, aspect, rect, resolve, lastThreshold: THRESHOLD_START,
      };
      this.#burner.render({ threshold: THRESHOLD_START, time: 0, seed });
      this.#kick();
    });
  }

  /** Embers rest on the ground line and fade. Resolves after `ms`. */
  afterglow(ms = config.timing.afterglowEmbers) {
    if (this.#reduced || !this.#burner) return new Promise((r) => setTimeout(r, Math.min(ms, 400)));
    this.#embers.linger(this.#paperRect(), Math.max(0.8, ms / 1000 * 1.4));
    this.#burner.clear(); // the sheet — and the words — are gone from GPU/CPU memory
    this.#kick();
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Immediately drop everything fire-related (used on reset). */
  clear() {
    this.#burnJob = null;
    this.#burner?.clear();
    this.#embers.clear();
  }

  // --- loop --------------------------------------------------------------

  #kick() {
    if (this.#running) return;
    this.#running = true;
    this.#last = performance.now();
    this.#schedule();
  }

  /**
   * rAF normally; if frames stop arriving (hidden tab, a throttled wearable
   * browser) a timer keeps the ritual moving so the state machine can never
   * get stuck in "burning".
   */
  #schedule() {
    this.#raf = requestAnimationFrame(this.#tick);
    clearTimeout(this.#fallback);
    this.#fallback = setTimeout(() => {
      cancelAnimationFrame(this.#raf);
      this.#tick(performance.now());
    }, 120);
  }

  #tick = (now) => {
    clearTimeout(this.#fallback);
    const dt = Math.min(0.05, (now - this.#last) / 1000);
    this.#last = now;

    const job = this.#burnJob;
    if (job) {
      const t = Math.min(1, (now - job.start) / job.duration);
      const eased = 0.5 - 0.5 * Math.cos(Math.PI * t);
      const threshold = THRESHOLD_START + (THRESHOLD_END - THRESHOLD_START) * eased;
      this.#burner.render({ threshold, time: (now - job.start) / 1000, seed: job.seed });
      // spark strength peaks mid-burn
      const strength = Math.sin(Math.PI * Math.min(1, t * 1.05)) * 0.9 + 0.1;
      this.#embers.emitFromFront(job.rect, threshold, job.aspect, job.seed, dt, strength);
      job.lastThreshold = threshold;
      if (t >= 1) {
        this.#burnJob = null;
        job.resolve();
      }
    }

    this.#embers.update(dt);
    this.#embers.render();

    const keepGoing = this.#burnJob !== null || this.#ambientOn || this.#embers.isBusy;
    if (keepGoing && (!document.hidden || this.#burnJob !== null)) {
      this.#schedule();
    } else {
      this.#running = false;
      if (!this.#ambientOn && !this.#burnJob) this.#embers.clear();
    }
  };

  #onResize = () => {
    const scale = Math.min(3, Math.min(window.devicePixelRatio || 1, 2) * this.#getScale());
    this.#embers.resize(this.#stage.offsetWidth, this.#stage.offsetHeight, scale);
    if (this.#ambientOn) this.#embers.setAmbient(true, this.#paperRect());
    if (this.#running) this.#embers.render();
  };

  /** Paper rect in stage-local CSS px (independent of the preview scale transform). */
  #paperRect() {
    const s = this.#stage.getBoundingClientRect();
    const p = this.#paperWrap.getBoundingClientRect();
    const k = s.width / (this.#stage.offsetWidth || 1) || 1;
    return { x: (p.left - s.left) / k, y: (p.top - s.top) / k, w: p.width / k, h: p.height / k };
  }
}
