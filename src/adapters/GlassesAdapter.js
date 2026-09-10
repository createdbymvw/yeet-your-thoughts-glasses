import { config } from '../config.js';

/**
 * GlassesAdapter — everything about *where* the experience is displayed.
 *
 *  - Glasses Preview Mode in the browser: renders the app at the target
 *    display's native size (600 × 600) and scales it to fit the window so the
 *    experience can be recorded/demoed without hardware.
 *  - Hardware detection: currently always false (there is no verified way to
 *    detect a Meta display from a web page). Kept as a single choke point so a
 *    future check lives in one place.
 */
export class GlassesAdapter {
  #body;
  #viewport;
  #app;
  #label;
  #listeners = new Set();
  #mode = 'browser';
  #platform;

  /**
   * platform: 'web' (browser prototype) or 'meta-webapp' (the glasses build,
   * glasses.html). On the device build the app is rendered 1:1 at 600 × 600
   * with no preview frame and no scaling.
   */
  constructor({ body = document.body, viewport, app, label, platform = 'web' }) {
    this.#body = body;
    this.#viewport = viewport;
    this.#app = app;
    this.#label = label;
    this.#platform = platform;
    body.dataset.platform = platform;
    window.addEventListener('resize', this.#fit);
  }

  get platform() { return this.#platform; }
  get isDevice() { return this.#platform === 'meta-webapp'; }

  get mode() { return this.#mode; }
  get isGlasses() { return this.#mode === 'glasses'; }

  /** True if the page is running on real glasses hardware. Not detectable yet. */
  static isHardware() { return false; }

  get display() { return config.glasses; }

  setMode(mode) {
    if (mode !== 'browser' && mode !== 'glasses') return;
    if (this.#mode === mode) return;
    this.#mode = mode;
    this.#body.dataset.mode = mode;
    this.#fit();
    for (const fn of this.#listeners) fn(mode);
  }

  toggle() { this.setMode(this.isGlasses ? 'browser' : 'glasses'); }

  onChange(fn) { this.#listeners.add(fn); return () => this.#listeners.delete(fn); }

  /** Current CSS scale applied to .app (1 in browser mode). */
  get scale() {
    if (!this.isGlasses) return 1;
    const v = getComputedStyle(this.#app).getPropertyValue('--glasses-scale');
    return parseFloat(v) || 1;
  }

  #fit = () => {
    if (!this.isGlasses || this.isDevice) {
      this.#app.style.removeProperty('--glasses-scale');
      return;
    }
    const { width, height } = config.glasses;
    const pad = 64;
    const rect = this.#viewport.getBoundingClientRect();
    const scale = Math.min((rect.width - pad) / width, (rect.height - pad) / height, 1.6);
    this.#app.style.setProperty('--glasses-scale', String(Math.max(0.3, scale)));
    if (this.#label) {
      this.#label.textContent = `glasses preview · ${width} × ${height} · arrows to move · enter to pinch`;
    }
    for (const fn of this.#listeners) fn(this.#mode, 'resize');
  };
}
