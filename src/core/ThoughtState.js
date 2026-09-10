/**
 * ThoughtState — the only place the user's words live.
 *
 * Privacy contract:
 *  - held in a private class field (volatile memory only)
 *  - never serialized (toJSON returns nothing useful)
 *  - never logged
 *  - clear() overwrites it and notifies subscribers with an empty string
 */
export class ThoughtState {
  #text = '';
  #listeners = new Set();
  #maxLength;

  constructor({ maxLength = 140 } = {}) {
    this.#maxLength = maxLength;
  }

  get text() { return this.#text; }
  get isEmpty() { return this.#text.trim().length === 0; }
  get maxLength() { return this.#maxLength; }

  set(text) {
    const next = String(text ?? '').slice(0, this.#maxLength);
    if (next === this.#text) return;
    this.#text = next;
    this.#emit();
  }

  clear() {
    if (this.#text === '') return;
    this.#text = '';
    this.#emit();
  }

  subscribe(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  #emit() {
    for (const fn of this.#listeners) fn(this.#text);
  }

  /** Never let a thought leak through JSON.stringify / structured logging. */
  toJSON() { return { redacted: true }; }
  toString() { return '[ThoughtState]'; }
}
