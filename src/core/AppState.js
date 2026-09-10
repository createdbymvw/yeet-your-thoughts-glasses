/**
 * AppState — an explicit finite state machine for the ritual.
 *
 *   idle → editing → ready → burning → afterglow → reset → idle
 *
 * Only the transitions listed in TRANSITIONS are legal; anything else is
 * ignored (and returns false) so UI glitches can't put the app in a weird state.
 */

export const States = Object.freeze({
  IDLE: 'idle',
  EDITING: 'editing',
  READY: 'ready',
  BURNING: 'burning',
  AFTERGLOW: 'afterglow',
  RESET: 'reset',
});

const TRANSITIONS = Object.freeze({
  [States.IDLE]:      [States.EDITING, States.READY],
  [States.EDITING]:   [States.READY, States.IDLE],
  [States.READY]:     [States.EDITING, States.IDLE, States.BURNING],
  [States.BURNING]:   [States.AFTERGLOW],
  [States.AFTERGLOW]: [States.RESET],
  [States.RESET]:     [States.IDLE],
});

export class AppState {
  #state = States.IDLE;
  #listeners = new Set();

  get state() { return this.#state; }

  is(...states) { return states.includes(this.#state); }

  can(next) { return TRANSITIONS[this.#state]?.includes(next) ?? false; }

  /**
   * Attempt a transition. Returns true if it happened.
   * Listeners receive (next, prev).
   */
  transition(next) {
    if (!this.can(next)) return false;
    const prev = this.#state;
    this.#state = next;
    for (const fn of this.#listeners) fn(next, prev);
    return true;
  }

  subscribe(fn) {
    this.#listeners.add(fn);
    fn(this.#state, null);
    return () => this.#listeners.delete(fn);
  }
}
