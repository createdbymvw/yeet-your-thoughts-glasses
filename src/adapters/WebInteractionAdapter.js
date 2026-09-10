import { InteractionAdapter, Intent } from './InteractionAdapter.js';

/**
 * WebInteractionAdapter — mouse, touch and keyboard for the browser prototype.
 *
 * Pointer:   click/tap on any [data-target]            → select
 * Keyboard:  ← ↑ / → ↓ (outside the text field)       → navigate prev/next
 *            Enter / Space on a non-button target       → select
 *            Enter (no shift) inside the text field     → commit
 *            Escape                                     → back
 *
 * Native <button> elements already turn Enter/Space into click events, so we
 * only synthesize select for non-button targets (the paper) to avoid doubles.
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
  }

  detach() {
    this.#root.removeEventListener('click', this.#onClick);
    document.removeEventListener('keydown', this.#onKeyDown);
  }

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
        if (!el || el.tagName === 'BUTTON') return; // buttons synthesize click natively
        event.preventDefault();
        this.emit(Intent.SELECT, { target: el.dataset.target, element: el, source: 'keyboard' });
        return;
      }
      default:
    }
  };
}
