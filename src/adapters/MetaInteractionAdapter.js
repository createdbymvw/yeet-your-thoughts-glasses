import { InteractionAdapter } from './InteractionAdapter.js';

/**
 * MetaInteractionAdapter — placeholder for Meta display-glasses input.
 *
 * Intended mapping (see docs/meta-glasses.md for what is actually supported):
 *   look + pinch on the paper  → select { target: 'paper' }
 *   arrow / swipe gesture      → navigate { direction }
 *   pinch on "Burn This"       → select { target: 'burn' }
 *   native composer dismissed  → commit
 *   back gesture               → back
 *
 * This class is intentionally empty of device calls. Nothing here may invent
 * an API: hardware bindings are only added once they are verified against the
 * official Meta developer documentation. Until then isAvailable() is false and
 * the app falls back to WebInteractionAdapter, which is also what runs when a
 * glasses browser renders the page with its own cursor/pinch → click mapping.
 */
export class MetaInteractionAdapter extends InteractionAdapter {
  get name() { return 'meta'; }

  static isAvailable() {
    // No public, verified JavaScript gesture API exists for Meta display glasses
    // at the time of writing. Keep false until docs/meta-glasses.md says otherwise.
    return false;
  }

  attach() {
    throw new Error('MetaInteractionAdapter: no verified device API available. See docs/meta-glasses.md.');
  }

  detach() {}
}
