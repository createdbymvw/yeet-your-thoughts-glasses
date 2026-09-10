import { InteractionAdapter, Intent } from './InteractionAdapter.js';

/**
 * WebInteractionAdapter — mouse, touch and keyboard for the browser prototype.
 *
 * Pointer:   click/tap on any [data-target]            → select
 * Keyboard:  ← ↑ / → ↓ (outside the text field)       → navigate prev/next
 *            Enter / Space on a focused target          → select
 *            Enter (no shift) inside the text field     → commit
 *            Escape                                     → back
 *
 * Enter/Space are handled here (with preventDefault) rather than through the
 * browser's native button activation, so "pinch" behaves identically for the
 * paper, chips and Burn This, and no double select can occur.
 */
export class WebInteractionAdapter extends InteractionAdapter {
  #root;
  #textInput;
  #targetSelector;

  constructor({ root, textInput, targetSelector = '[data-target]' }) {
    super();
    this.#root = root;
    this.#textInput = textInput;
    this.#targetSelector = targetSelector;
  }

  get name() { return 'web'; }
  static isAvailable() { return typeof window !== 'undefined' && 'document' in window; }

  attach() {
    this.#root.addEventListener('click', this.#onClick);
    document.addEventListener('keydown', this.#onKeyDown);
    document.addEventListener('keyup', this.#onKeyUp);
  }

  detach() {
    this.#root.removeEventListener('click', this.#onClick);
    document.removeEventListener('keydown', this.#onKeyDown);
    document.removeEventListener('keyup', this.#onKeyUp);
  }

  /** Space activates buttons on keyup in most browsers; swallow it so select fires once. */
  #onKeyUp = (event) => {
    if (event.key === ' ' && event.target !== this.#textInput && event.target.closest?.(this.#targetSelector)) {
      event.preventDefault();
    }
  };

  #onClick = (event) => {
    const el = event.target.closest(this.#targetSelector);
    if (!el || el.disabled || el.hidden) return;
    this.emit(Intent.SELECT, { target: el.dataset.target, element: el, source: 'pointer' });
  };

  #onKeyDown = (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;

    const inText = event.target === this.#textInput;

    if (event.key === 'Escape') {
      event.preventDefault();
      this.emit(Intent.BACK, {});
      return;
    }

    if (inText) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.emit(Intent.COMMIT, {});
      }
      return; // everything else is typing
    }

    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        this.emit(Intent.NAVIGATE, { direction: 'prev' });
        return;
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        this.emit(Intent.NAVIGATE, { direction: 'next' });
        return;
      case 'Enter':
      case ' ': {
        const el = event.target.closest?.(this.#targetSelector);
        if (!el || el.disabled) return;
        event.preventDefault();
        this.emit(Intent.SELECT, { target: el.dataset.target, element: el, source: 'keyboard' });
        return;
      }
      default:
    }
  };
}
