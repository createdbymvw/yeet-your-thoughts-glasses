import { InteractionAdapter, Intent } from './InteractionAdapter.js';

/**
 * MetaInteractionAdapter — input for Meta Ray-Ban Display "Web Apps".
 *
 * Everything here is based on Meta's official Web Apps documentation
 * (see docs/meta-glasses.md for sources). The runtime translates Neural Band
 * and temple-captouch gestures into ordinary DOM keyboard events:
 *
 *   swipe up/down/left/right → keydown ArrowUp / ArrowDown / ArrowLeft / ArrowRight
 *   index-finger pinch       → keydown Enter (on document.activeElement)
 *   back                     → keydown Escape
 *
 * There is no cursor and no pointer events by default, so this adapter does
 * not listen for clicks. Text entry: per Meta's starter repo, pinching a
 * focused <textarea> opens the on-glasses composer (handwriting or voice);
 * the committed text arrives through standard `input` / `change` events, and
 * no keydown reaches the page. We therefore:
 *   - never intercept keys while the composer is up (we can't see them anyway)
 *   - treat `change` on the text field as `commit`
 *   - still map Enter inside the field to `commit`, which only ever fires on a
 *     desktop simulator where there is no composer
 *
 * Nothing in this file calls a Meta-specific API, because none is exposed to
 * web apps. If Meta adds one, this is the only file that should change.
 */
export class MetaInteractionAdapter extends InteractionAdapter {
  #textInput;
  #targetSelector;

  constructor({ textInput, targetSelector = '[data-target]' }) {
    super();
    this.#textInput = textInput;
    this.#targetSelector = targetSelector;
  }

  get name() { return 'meta-webapp'; }

  /**
   * Meta documents no user-agent string, media query or JS API for detecting
   * the glasses runtime, so availability is decided by the entry page
   * (glasses.html) rather than by sniffing.
   */
  static isAvailable() { return false; }

  attach() {
    document.addEventListener('keydown', this.#onKeyDown);
    this.#textInput?.addEventListener('change', this.#onChange);
  }

  detach() {
    document.removeEventListener('keydown', this.#onKeyDown);
    this.#textInput?.removeEventListener('change', this.#onChange);
  }

  #onChange = () => {
    // the on-glasses composer committed text
    this.emit(Intent.COMMIT, { source: 'composer' });
  };

  #onKeyDown = (event) => {
    if (event.defaultPrevented) return;
    const inText = event.target === this.#textInput;

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.emit(Intent.BACK, {});
        return;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        this.emit(Intent.NAVIGATE, { direction: 'prev' });
        return;
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        this.emit(Intent.NAVIGATE, { direction: 'next' });
        return;
      case 'Enter': {
        if (inText) {
          // desktop simulator only — on device the composer swallows this
          if (!event.shiftKey) { event.preventDefault(); this.emit(Intent.COMMIT, { source: 'keyboard' }); }
          return;
        }
        const el = event.target.closest?.(this.#targetSelector);
        if (!el || el.disabled) return;
        event.preventDefault();
        this.emit(Intent.SELECT, { target: el.dataset.target, element: el, source: 'pinch' });
        return;
      }
      default:
    }
  };
}
