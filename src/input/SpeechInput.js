/**
 * SpeechInput — optional browser dictation via the Web Speech API.
 *
 * Privacy note: browsers implement SpeechRecognition with their own service
 * (Chrome sends audio to Google, Safari to Apple). The recognized *text* stays
 * in this page, but the *audio* does leave the device while the mic is on.
 * The mic button is opt-in and labelled accordingly. On glasses, the native
 * dictation composer replaces this entirely.
 */
export class SpeechInput {
  #Recognition;
  #recognition = null;
  #listening = false;
  #handlers = { result: new Set(), start: new Set(), end: new Set(), error: new Set() };
  #baseText = '';

  constructor() {
    this.#Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
  }

  static isSupported() {
    return Boolean(globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition)
      && (globalThis.isSecureContext ?? true);
  }

  get isListening() { return this.#listening; }

  on(evt, fn) { this.#handlers[evt]?.add(fn); return () => this.#handlers[evt]?.delete(fn); }

  /**
   * Start listening. `baseText` is what's already in the field; recognized
   * speech is appended to it and delivered via 'result' as the full string.
   */
  start(baseText = '') {
    if (!this.#Recognition || this.#listening) return false;
    this.#baseText = baseText;
    const r = new this.#Recognition();
    r.lang = navigator.language || 'en-US';
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onstart = () => { this.#listening = true; this.#emit('start'); };
    r.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t; else interim += t;
      }
      const spoken = (final || interim).trim();
      const sep = this.#baseText && !/\s$/.test(this.#baseText) ? ' ' : '';
      this.#emit('result', { text: this.#baseText + sep + spoken, isFinal: Boolean(final) });
      if (final) this.#baseText = this.#baseText + sep + final.trim();
    };
    r.onerror = (event) => { this.#emit('error', { error: event.error }); };
    r.onend = () => { this.#listening = false; this.#recognition = null; this.#emit('end'); };

    this.#recognition = r;
    try { r.start(); } catch { this.#listening = false; this.#recognition = null; return false; }
    return true;
  }

  stop() {
    try { this.#recognition?.stop(); } catch { /* already stopped */ }
  }

  abort() {
    try { this.#recognition?.abort(); } catch { /* already stopped */ }
    this.#listening = false;
    this.#recognition = null;
  }

  #emit(evt, detail = {}) { for (const fn of this.#handlers[evt]) fn(detail); }
}
