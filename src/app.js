import { config } from './config.js';
import { AppState, States } from './core/AppState.js';
import { ThoughtState } from './core/ThoughtState.js';
import { WebInteractionAdapter } from './adapters/WebInteractionAdapter.js';
import { MetaInteractionAdapter } from './adapters/MetaInteractionAdapter.js';
import { GlassesAdapter } from './adapters/GlassesAdapter.js';
import { SpeechInput } from './input/SpeechInput.js';
import { InputController } from './input/InputController.js';
import { BurnAnimation } from './animation/BurnAnimation.js';
import { pickAfterglowLine } from './ui/copy.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * createApp — wires the modules together and runs the ritual.
 *
 *   idle → editing → ready → burning → afterglow → reset → idle
 *
 * Nothing in here touches raw device events; that is the adapters' job.
 */
export function createApp(doc = document) {
  const $ = (id) => doc.getElementById(id);
  const els = {
    root: $('app'),
    viewport: $('viewport'),
    viewportLabel: $('viewport-label'),
    stage: $('stage'),
    paperWrap: $('paper-wrap'),
    paper: $('paper'),
    textarea: $('thought'),
    burnCanvas: $('burn'),
    emberCanvas: $('embers'),
    afterglow: $('afterglow'),
    burnButton: $('burn-btn'),
    mic: $('mic'),
    chrome: $('chrome'),
  };

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const appState = new AppState();
  const thought = new ThoughtState({ maxLength: config.maxLength });
  const glasses = new GlassesAdapter({ viewport: els.viewport, app: els.root, label: els.viewportLabel });

  // Adapter selection: the Meta adapter only when a verified device API exists.
  const adapter = MetaInteractionAdapter.isAvailable()
    ? new MetaInteractionAdapter()
    : new WebInteractionAdapter({ root: els.root, textInput: els.textarea });

  const speech = SpeechInput.isSupported() ? new SpeechInput() : null;

  const burn = new BurnAnimation({
    stage: els.stage,
    paperWrap: els.paperWrap,
    burnCanvas: els.burnCanvas,
    emberCanvas: els.emberCanvas,
    reducedMotion,
    getScale: () => glasses.scale,
  });

  // --- state → DOM -------------------------------------------------------
  appState.subscribe((state) => {
    doc.body.dataset.state = state;
    els.paper.setAttribute('aria-hidden', String(state === States.BURNING || state === States.AFTERGLOW));
  });

  // --- the ritual --------------------------------------------------------
  let ritualRunning = false;

  async function runRitual() {
    if (ritualRunning || !appState.can(States.BURNING)) return;
    ritualRunning = true;

    const text = thought.text;
    const style = readPaperStyle(els);

    appState.transition(States.BURNING);
    // The thought leaves application state the moment the burn begins.
    input.clear();

    await burn.burn({ text, style });

    appState.transition(States.AFTERGLOW);
    const glow = burn.afterglow(reducedMotion ? config.timing.reducedAfterglow / 3 : config.timing.afterglowEmbers);
    await glow;

    showAfterglow(els.afterglow, pickAfterglowLine());
    await sleep(reducedMotion ? config.timing.reducedAfterglow : config.timing.afterglowCopy);
    hideAfterglow(els.afterglow);
    await sleep(reducedMotion ? 200 : 500);

    appState.transition(States.RESET);
    burn.clear();
    input.clear();
    await sleep(config.timing.resetGap);

    appState.transition(States.IDLE);
    burn.setAmbient(true);
    if (glasses.isGlasses) input.focusPaper();
    ritualRunning = false;
  }

  const input = new InputController({
    elements: els, thought, appState, adapter, speech, onBurn: runRitual,
  });

  // --- preview mode ------------------------------------------------------
  for (const btn of els.chrome.querySelectorAll('[data-mode-btn]')) {
    btn.addEventListener('click', () => glasses.setMode(btn.dataset.modeBtn));
  }
  glasses.onChange((mode) => {
    for (const btn of els.chrome.querySelectorAll('[data-mode-btn]')) {
      btn.classList.toggle('is-active', btn.dataset.modeBtn === mode);
    }
    burn.setBudget(mode === 'glasses');
    burn.setAmbient(appState.is(States.IDLE, States.EDITING, States.READY));
    // On glasses there is no pointer: the paper starts focused so the first pinch begins writing.
    if (mode === 'glasses' && appState.is(States.IDLE)) input.focusPaper();
    try { const u = new URL(location.href); u.searchParams.set('mode', mode); history.replaceState(null, '', u); } catch { /* file:// */ }
  });
  doc.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'g' && (e.metaKey || e.ctrlKey) && e.shiftKey) { e.preventDefault(); glasses.toggle(); }
  });

  // --- privacy: nothing survives leaving the page --------------------------
  window.addEventListener('pagehide', () => { input.clear(); burn.clear(); });
  window.addEventListener('beforeunload', () => { input.clear(); burn.clear(); });

  // --- boot --------------------------------------------------------------
  async function start() {
    input.attach();
    burn.init();
    burn.setBudget(false);

    const params = new URLSearchParams(location.search);
    if (params.get('mode') === 'glasses') glasses.setMode('glasses');

    try { await doc.fonts?.ready; } catch { /* fonts optional */ }
    input.layout();
    burn.setAmbient(true);
  }

  window.addEventListener('resize', () => input.layout());
  glasses.onChange(() => input.layout());

  return { start, appState, thought, glasses, adapter, burn, input, speech };
}

function readPaperStyle(els) {
  const cs = getComputedStyle(els.textarea);
  const ps = getComputedStyle(els.paper);
  const fontSize = parseFloat(cs.fontSize);
  const lh = parseFloat(cs.lineHeight);
  return {
    fontFamily: cs.fontFamily,
    fontSize,
    lineHeight: Number.isFinite(lh) ? lh : fontSize * 1.22,
    color: cs.color,
    paper: ps.backgroundColor,
    padding: parseFloat(ps.paddingLeft),
  };
}

function showAfterglow(el, line) {
  el.textContent = line;
  el.classList.add('is-entering');
  // force a layout so the transition runs from the entering offset
  void el.offsetWidth;
  el.classList.remove('is-entering');
  el.classList.add('is-visible');
}

function hideAfterglow(el) {
  el.classList.remove('is-visible');
}
