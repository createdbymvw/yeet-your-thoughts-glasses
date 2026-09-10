# Architecture

Yeet Your Thoughts is a dependency-free web app: plain HTML, CSS and ES modules.
No bundler, no framework, no backend. The code is split so that the browser
prototype and a future glasses build share everything except the input layer.

```
index.html                 markup: one paper, four chips, one action
styles/main.css            editorial styling, glasses preview, reduced motion
src/
  main.js                  entry point (creates the app, nothing on window)
  app.js                   wires modules together and runs the ritual sequence
  config.js                timings, limits, particle budgets, display size
  core/
    AppState.js            explicit finite state machine
    ThoughtState.js        the only place the thought lives (volatile)
  input/
    InputController.js     intents + text field → ThoughtState / AppState
    SpeechInput.js         optional Web Speech API dictation
  adapters/
    InteractionAdapter.js  base class + the intent vocabulary
    WebInteractionAdapter.js   mouse / touch / keyboard → intents
    MetaInteractionAdapter.js  placeholder for glasses gestures (see docs/meta-glasses.md)
    GlassesAdapter.js      display mode: browser vs 600×600 glasses preview
  animation/
    BurnAnimation.js       orchestrates the burn, embers and afterglow; owns the loop
    BurnShader.js          WebGL fragment shader + Canvas2D software fallback
    PaperRaster.js         draws a bitmap replica of the DOM paper (with the text)
    Embers.js              particle system: sparks, embers, ash, ambient, resting
    noise.js               CPU mirror of the shader's noise, to locate the burn front
  ui/
    copy.js                afterglow lines
dev/
  burn-lab.html            tuning page: render the burn at any threshold
  serve.py                 no-cache static server
docs/
  architecture.md          this file
  meta-glasses.md          Stage 2 research and device integration notes
```

## State machine

```
idle ──► editing ──► ready ──► burning ──► afterglow ──► reset ──► idle
  ▲        │  ▲        │
  └────────┘  └────────┘
```

`AppState` holds a transition table. Any transition not in the table is
rejected, so a stray click during the burn cannot restart the ritual or
resurrect the paper. `document.body[data-state]` mirrors the state; the CSS
uses it to show/hide the hint, the chips and the Burn This action.

## The intent vocabulary

Adapters translate device input into four intents:

| intent     | meaning                                  | browser              | glasses (intended)          |
|------------|------------------------------------------|----------------------|-----------------------------|
| `select`   | activate the target under focus/pointer  | click, tap, Enter    | pinch                       |
| `navigate` | move focus prev/next                     | arrow keys           | swipe / arrow gesture       |
| `commit`   | done writing                             | Enter in the field   | native composer dismissed   |
| `back`     | leave the field / cancel                 | Escape               | back gesture                |

Targets are DOM elements marked `[data-target="paper|chip|mic|burn"]`.
`InputController` is the only consumer. It never sees a mouse event or a gesture.

Swapping `WebInteractionAdapter` for `MetaInteractionAdapter` is the whole
device port on the input side; the rest of the app is untouched.

## The burn

1. `PaperRaster` draws the sheet (colour, grain, shading) and word-wraps the
   thought with the same font as the DOM paper.
2. `BurnShader` uploads that bitmap as a texture. A scalar *threshold* sweeps
   from −0.15 to 1.35 over four seconds (cosine-eased). Each pixel has a
   *field* value = height + fractal noise. The difference `d = field − threshold`
   selects the zone: untouched → scorch → ember line → char → gone.
3. `Embers` evaluates the same noise on the CPU (`noise.js`) to find where the
   front is, and emits sparks, glowing fragments and ash from it. It also
   paints a soft halo under the front.
4. When the sweep completes, `afterglow()` drops resting embers along the
   ground line, deletes the texture, and the copy line appears.

If WebGL is unavailable, `SoftwareBurn` runs the same maths on a reduced
resolution `ImageData`. If `prefers-reduced-motion` is set, no canvas is used
at all: the CSS crossfades the paper to dark with a brief glow.

The render loop uses `requestAnimationFrame` with a timer fallback, so the
ritual always completes even if frames stop (hidden tab, throttled device).

## Glasses preview mode

`GlassesAdapter` toggles `body[data-mode="glasses"]`. The `.app` element is
rendered at the display's native 600 × 600 px and scaled to fit the window
with a CSS transform, so recordings match the target pixel grid. The chrome
(mode toggle, privacy note) lives outside `.app` and never appears on device.

## Privacy by construction

- `ThoughtState` keeps the text in a private field; `toJSON()` redacts it.
- Nothing is written to `localStorage`, `sessionStorage`, cookies or IndexedDB.
- No `fetch`, no beacons, no analytics, no `console.*` calls anywhere in `src/`.
- The burn starts by clearing the field and the state; the text survives only
  inside the paper texture until the burn finishes, then the texture is deleted.
- `pagehide`/`beforeunload` clear everything.
