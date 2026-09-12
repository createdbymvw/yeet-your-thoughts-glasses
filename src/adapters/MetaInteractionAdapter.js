import { InteractionAdapter, Intent } from './InteractionAdapter.js';

/**
 * MetaInteractionAdapter — input for Meta Ray-Ban Display "Web Apps".
 *
 * Verified on hardware (composer-test.html, Sept 2026) and matching Meta's
 * official Web Apps input sample. The glasses runtime turns Neural Band and
 * temple-captouch gestures into ordinary DOM keyboard events:
 *
 *   swipe up/down/left/right → keydown ArrowUp / ArrowDown / ArrowLeft / ArrowRight
 *   index-finger pinch       → keydown Enter (on document.activeElement)
 *   back                     → keydown Escape
 *
 * The one rule that makes text entry work: on Enter, do exactly what Meta's
 * sample does — `document.activeElement.click()` — and nothing else. A click
 * on a focused <textarea>/<input> is what opens the on-glasses composer
 * (voice / handwriting). Calling preventDefault() without the click, or
 * blurring the field, cancels it. The committed text comes back through the
 * standard `input` and `change` events; no keydown is ever delivered for it.
 *
 * No Meta-specific API is used because none is exposed to web apps.
 */
export class MetaInteractionAdapter extends InteractionAdapter {
  #root;
  #textInput;
  #targetSelector;

  constructor({ root, textInput, targetSelector = '[data-target]' }) {
    super();
    this.#root = root;
    this.#textInput = textInput;
    this.#targetSelector = targetSelector;
  }

  get name() { return 'meta-webapp'; }

  /** Meta documents no runtime detection; glasses.html opts in explicitly. */
  static isAvailable() { return false; }

  attach() {
    document.addEventListener('keydown', this.#onKeyDown);
    this.#root.addEventListener('click', this.#onClick);
    this.#textInput?.addEventListener('change', this.#onChange);
  }

  detach() {
    document.removeEventListener('keydown', this.#onKeyDown);
    this.#root.removeEventListener('click', this.#onClick);
    this.#textInput?.removeEventListener('change', this.#onChange);
  }

  /**
   * Activation. Reached by the synthetic click from #onKeyDown (a pinch) or
   * by a real click when the same page is opened on a desktop. A click on the
   * text field is left to the runtime: that is the composer trigger.
   */
  #onClick = (event) => {
    const el = event.target.closest?.(this.#targetSelector);
    if (!el || el.disabled || el.hidden) return;
    if (el === this.#textInput) return;
    this.emit(Intent.SELECT, { target: el.dataset.target, element: el, source: 'pinch' });
  };

  /** The composer committed text into the field. */
  #onChange = () => {
    this.emit(Intent.COMMIT, { source: 'composer' });
  };

  #onKeyDown = (event) => {
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowLeft':
        this.emit(Intent.NAVIGATE, { direction: 'prev' });
        break;
      case 'ArrowDown':
      case 'ArrowRight':
        this.emit(Intent.NAVIGATE, { direction: 'next' });
        break;
      case 'Enter': {
        // Meta's sample, verbatim in spirit: click whatever has focus.
        const active = document.activeElement;
        if (active?.classList.contains('focusable')) active.click();
        break;
      }
      case 'Escape':
        this.emit(Intent.BACK, {});
        break;
      default:
        return; // don't preventDefault on unhandled keys
    }
    event.preventDefault();
  };
}
