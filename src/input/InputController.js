import { Intent } from '../adapters/InteractionAdapter.js';
import { States } from '../core/AppState.js';

/**
 * InputController — turns semantic intents + text field events into changes
 * on ThoughtState and AppState. Knows nothing about mice, gestures or fire.
 *
 * Callbacks:
 *   onBurn()  — the user selected "Burn This" while READY
 */
export class InputController {
  #els;
  #thought;
  #app;
  #adapter;
  #speech;
  #onBurn;
  #unsubs = [];

  constructor({ elements, thought, appState, adapter, speech = null, onBurn }) {
    this.#els = elements;
    this.#thought = thought;
    this.#app = appState;
    this.#adapter = adapter;
    this.#speech = speech;
    this.#onBurn = onBurn;
  }

  attach() {
    const { textarea, mic, burnButton, paper } = this.#els;

    // text field → thought state
    textarea.addEventListener('input', this.#onInput);
    textarea.addEventListener('focus', this.#onFocus);
    textarea.addEventListener('blur', this.#onBlur);

    // thought state → text field + burn availability
    this.#unsubs.push(this.#thought.subscribe(this.#onThoughtChange));

    // semantic intents
    this.#unsubs.push(this.#adapter.on(Intent.SELECT, this.#onSelect));
    this.#unsubs.push(this.#adapter.on(Intent.NAVIGATE, this.#onNavigate));
    this.#unsubs.push(this.#adapter.on(Intent.COMMIT, this.#onCommit));
    this.#unsubs.push(this.#adapter.on(Intent.BACK, this.#onBack));

    // speech (the mic button does not exist on the glasses build)
    if (this.#speech && mic) {
      mic.hidden = false;
      this.#unsubs.push(this.#speech.on('result', ({ text }) => {
        this.#thought.set(text);
      }));
      this.#unsubs.push(this.#speech.on('start', () => {
        mic.classList.add('is-listening');
        mic.setAttribute('aria-pressed', 'true');
      }));
      this.#unsubs.push(this.#speech.on('end', () => {
        mic.classList.remove('is-listening');
        mic.setAttribute('aria-pressed', 'false');
        if (!this.#thought.isEmpty) burnButton.focus({ preventScroll: true });
      }));
      this.#unsubs.push(this.#speech.on('error', () => {
        mic.classList.remove('is-listening');
        mic.setAttribute('aria-pressed', 'false');
      }));
    } else if (mic) {
      mic.hidden = true;
    }

    this.#adapter.attach();
    this.#syncTextarea('');
    paper.setAttribute('aria-label', 'write a thought');
  }

  detach() {
    const { textarea } = this.#els;
    textarea.removeEventListener('input', this.#onInput);
    textarea.removeEventListener('focus', this.#onFocus);
    textarea.removeEventListener('blur', this.#onBlur);
    for (const u of this.#unsubs) u();
    this.#unsubs = [];
    this.#adapter.detach();
  }

  /** Wipe the field and the state. Called by the ritual at burn + reset. */
  clear() {
    this.#speech?.abort();
    this.#thought.clear();
    this.#syncTextarea('');
  }

  /**
   * Put focus on the paper target. In the browser that is the paper card; on
   * the glasses build the text field itself carries data-target="paper".
   */
  focusPaper() {
    const target = this.#els.root.querySelector('[data-target="paper"]') ?? this.#els.paper;
    target.focus({ preventScroll: true });
  }

  // --- text field --------------------------------------------------------

  #onInput = () => {
    this.#thought.set(this.#els.textarea.value);
    this.#autosize();
  };

  #onFocus = () => {
    if (this.#app.is(States.IDLE)) this.#app.transition(States.EDITING);
    else if (this.#app.is(States.READY)) this.#app.transition(States.EDITING);
  };

  #onBlur = () => {
    if (!this.#app.is(States.EDITING)) return;
    this.#app.transition(this.#thought.isEmpty ? States.IDLE : States.READY);
  };

  #onThoughtChange = (text) => {
    if (this.#els.textarea.value !== text) this.#syncTextarea(text);
    const hasText = text.trim().length > 0;
    this.#els.burnButton.disabled = !hasText;
    this.#els.burnButton.classList.toggle('is-available', hasText);

    // keep the state machine honest while typing
    if (hasText && this.#app.is(States.IDLE)) this.#app.transition(States.READY);
    if (!hasText && this.#app.is(States.READY)) this.#app.transition(States.IDLE);
    if (document.activeElement !== this.#els.textarea) {
      if (hasText && this.#app.is(States.EDITING)) this.#app.transition(States.READY);
      if (!hasText && this.#app.is(States.EDITING)) this.#app.transition(States.IDLE);
    }
  };

  #syncTextarea(text) {
    this.#els.textarea.value = text;
    this.#autosize();
  }

  /** Re-measure the text field (fonts loaded, resize, preview mode change). */
  layout() { this.#autosize(); }

  #autosize() {
    const ta = this.#els.textarea;
    const cs = getComputedStyle(ta);
    const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.22 || 30;
    ta.style.height = '0px';
    const max = this.#els.paper.clientHeight - parseFloat(getComputedStyle(this.#els.paper).paddingTop) * 2;
    const h = Math.max(line, Math.min(ta.scrollHeight, Math.max(max, line)));
    ta.style.height = `${Math.ceil(h)}px`;
  }

  // --- intents -----------------------------------------------------------

  #onSelect = ({ target, element }) => {
    if (this.#app.is(States.BURNING, States.AFTERGLOW, States.RESET)) return;

    switch (target) {
      case 'paper':
        // On the glasses build the textarea is the target itself: the pinch
        // opens the native composer, and focusing again is harmless.
        this.#els.textarea.focus({ preventScroll: true });
        break;

      case 'chip': {
        const preset = element.dataset.preset ?? '';
        this.#thought.set(preset);
        this.#els.burnButton.focus({ preventScroll: true });
        break;
      }

      case 'mic':
        if (!this.#speech) return;
        if (this.#speech.isListening) this.#speech.stop();
        else this.#speech.start(this.#els.textarea.value);
        break;

      case 'burn':
        if (this.#thought.isEmpty) return;
        this.#els.textarea.blur();
        this.#onBurn?.();
        break;

      default:
    }
  };

  #onCommit = () => {
    this.#els.textarea.blur();
    if (!this.#thought.isEmpty) this.#els.burnButton.focus({ preventScroll: true });
    else this.#els.paper.focus({ preventScroll: true });
  };

  #onBack = () => {
    if (document.activeElement === this.#els.textarea) this.#els.textarea.blur();
    else document.activeElement?.blur?.();
  };

  #onNavigate = ({ direction }) => {
    if (this.#app.is(States.BURNING, States.AFTERGLOW, States.RESET)) return;
    const targets = this.#navigableTargets();
    if (targets.length === 0) return;
    const current = document.activeElement?.closest?.('[data-target]');
    let i = targets.indexOf(current);
    if (i === -1) i = direction === 'prev' ? 0 : -1;
    const next = targets[(i + (direction === 'prev' ? -1 : 1) + targets.length) % targets.length];
    next.focus({ preventScroll: true });
  };

  #navigableTargets() {
    return [...this.#els.root.querySelectorAll('[data-target]')].filter((el) => {
      if (el.hidden || el.disabled) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      if (el.dataset.target === 'burn' && !el.classList.contains('is-available')) return false;
      return true;
    });
  }
}
