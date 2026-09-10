/**
 * InteractionAdapter — base class.
 *
 * Adapters translate device-specific input (mouse, touch, keyboard, glasses
 * gestures) into a tiny vocabulary of semantic intents. The application never
 * listens to raw DOM events for navigation/selection; it listens to these.
 *
 *   select   { target, element, source }   — click / tap / pinch on a target
 *   navigate { direction }                 — arrow key / swipe / glasses arrow gesture
 *   commit   { }                           — "done" while editing (Enter, native composer closed)
 *   back     { }                           — Escape / back gesture
 *
 * Targets are DOM elements marked with [data-target="<name>"].
 */
export const Intent = Object.freeze({
  SELECT: 'select',
  NAVIGATE: 'navigate',
  COMMIT: 'commit',
  BACK: 'back',
});

export class InteractionAdapter {
  #handlers = new Map();

  /** Human-readable adapter name, useful for the docs and debugging. */
  get name() { return 'base'; }

  /** True when this adapter can run in the current environment. */
  static isAvailable() { return false; }

  on(intent, fn) {
    if (!this.#handlers.has(intent)) this.#handlers.set(intent, new Set());
    this.#handlers.get(intent).add(fn);
    return () => this.#handlers.get(intent)?.delete(fn);
  }

  emit(intent, detail = {}) {
    const set = this.#handlers.get(intent);
    if (!set) return;
    for (const fn of set) fn(detail);
  }

  /** Start listening to the device. */
  attach() {}
  /** Stop listening and release resources. */
  detach() {}
}
