# Meta display glasses — research and implementation notes

_Last verified: 9 September 2026. Everything below is taken from Meta's
official documentation or Meta's own GitHub repositories unless it is marked
**secondary** or **unverified**. Nothing here is inferred from third-party SDK
guesses; if a capability is not listed, it is not documented._

## TL;DR

Meta ships a **Developer Preview** of "Web Apps" for **Meta Ray-Ban Display**:
plain HTML/CSS/JavaScript loaded from a public HTTPS URL and rendered by the
glasses' own runtime in a fixed **600 × 600 px** viewport. Input arrives as
ordinary keyboard events (`ArrowUp/Down/Left/Right`, `Enter`, `Escape`). This
project's glasses build is [`glasses.html`](../glasses.html); it reuses every
module of the browser prototype and swaps only the interaction adapter.

Sources:
- Web Apps overview — <https://wearables.developer.meta.com/docs/develop/webapps>
- Setup — <https://wearables.developer.meta.com/docs/develop/webapps/setup>
- Build (technical spec) — <https://wearables.developer.meta.com/docs/develop/webapps/build/>
- Test — <https://wearables.developer.meta.com/docs/develop/webapps/test/>
- Developer FAQ — <https://developers.meta.com/wearables/faq/>
- Announcement (14 May 2026) — <https://developers.meta.com/blog/build-for-display-glasses/>
- Meta's web-app starter/AI kit — <https://github.com/facebookincubator/meta-wearables-webapp>

---

## 1. What Meta officially supports today

Two developer paths exist under the **Meta Wearables Developer Center**
(<https://wearables.developer.meta.com/>):

| path | what it is | runs where | status |
|------|------------|-----------|--------|
| **Wearables Device Access Toolkit (DAT)**, v0.9.0 | Swift / Kotlin SDK for iOS and Android apps: camera stream, microphone/speaker, and (since 0.7.0) a *display* API that serializes layouts from the phone to the glasses over Bluetooth | your **phone app**; the glasses only show content and return tap events | Developer Preview; publishing limited to select partners |
| **Web Apps** | standard HTML/CSS/JS from a public HTTPS URL, rendered on the glasses | **on the glasses** | Developer Preview since 14 May 2026; publishing "not available during the Developer Preview"; up to ~100 testers per app via share link |

There is **no native on-device app SDK and no app store** for the display
glasses. Web Apps are the only documented way to run third-party code on the
device itself, which makes this project's architecture the right one.

Requirements: glasses firmware **v125+**, Meta AI app **v272+**, Developer Mode
enabled. Web Apps need no project registration or organisation; DAT does
(Managed Meta Account org, application ID, Meta review).

## 2. Which parts of the browser prototype run unchanged

Everything except the input adapter and the page shell:

- `AppState`, `ThoughtState`, `InputController` — unchanged.
- `BurnAnimation`, `BurnShader` (WebGL), `Embers`, `PaperRaster`, `noise.js` —
  unchanged. Meta's guidelines list DOM, Canvas 2D and WebGL as available
  rendering APIs (Meta GitHub `display-guidelines.md`, **Meta repo, not the docs site**).
  The software fallback stays in place in case WebGL is absent on a build.
- `GlassesAdapter` — unchanged; the device build sets `platform: 'meta-webapp'`
  which disables the preview frame and scaling.
- CSS — `styles/main.css` is shared; `styles/glasses.css` overrides sizes and
  the background (pure black = transparent on the additive display).

Changed for the device: `glasses.html` (required meta tags, 600 × 600 body,
`focusable` classes, PNG icon, no mic, no mode toggle) and
`MetaInteractionAdapter` (below).

## 3. Text input / dictation

**Verified on hardware (12 Sep 2026)** with `composer-test.html`: pinching a
focused `<textarea>` opens Meta's on-glasses composer and voice input works.
The docs site still lists "Text Input" as unsupported; Meta's starter repo
(`skills/add-text-input/SKILL.md` in facebookincubator/meta-wearables-webapp)
documents the composer, and the hardware agrees with the repo.

How it works, and what the app does:

- Eligible fields: `<textarea>`, text-type `<input>`, `contenteditable`, all
  carrying the `focusable` class and a `placeholder`.
- The trigger is **focus, then pinch**. The pinch arrives as an `Enter`
  keydown; the page must answer it exactly as Meta's sample does, with
  `document.activeElement.click()`. That click on the focused field is what
  opens the composer. Calling `preventDefault()` without the click, or
  blurring the field, cancels it. (This was the original bug in this app.)
- The wearer picks voice or handwriting inside the composer; the page cannot
  choose. Handwriting depends on the Neural Band handwriting feature being
  enabled on the account (early access, US/English at the time of writing);
  only voice was offered on the test device.
- Committed text comes back through the standard `input` and `change`
  events with the whole value. No keydown is delivered for it.
  `InputController` reads `input` into `ThoughtState`; `MetaInteractionAdapter`
  turns `change` into `commit`, which moves focus to Burn This.
- Microphone access is not available to web apps, so the browser's Web Speech
  mic button is absent from the glasses build; the composer is the only
  dictation path.

## 4. Selection / pinch / gesture input

Documented mapping (Build page + FAQ):

| gesture (Neural Band or temple captouch) | DOM event |
|---|---|
| swipe up / down / left / right | `keydown` with `key` = `ArrowUp` / `ArrowDown` / `ArrowLeft` / `ArrowRight` |
| index-finger pinch (or tap) | `keydown` `Enter` on `document.activeElement` |
| back | `keydown` `Escape` |
| middle-finger pinch | opens the **system** Web App menu (Resume / Restart / Permissions); not delivered to the page |

"Every interactive element of your Web App must be reached and activated by
these gestures." Interactive elements should carry the `focusable` class,
be keyboard-activatable, and have visible `:focus` styles; the guide suggests
`min-height: 88px` as a tap target. There is **no continuous cursor**; an
opt-in pointer-drag mode exists (`body { touch-action: none }` at load, then
pointer events — Meta repo `add-gestures` skill) but is not needed here.
Custom gestures, wrist rotation and raw EMG are **not** exposed.

`MetaInteractionAdapter` implements exactly this table and nothing more:
arrows → `navigate`, Enter → `document.activeElement.click()` (a click on a
button becomes `select`; a click on the text field is left to the runtime, which
opens the composer), Escape → `back`, `change` on the field → `commit`.

## 5. Viewport / rendering limitations

- Fixed **600 × 600 px**, "avoid scrolling"; required tags:
  `<meta name="mrbd-web-app-capable" content="yes">`, a `description` meta,
  and `<meta name="viewport" content="width=600, height=600, initial-scale=1.0, user-scalable=no">`;
  `body { width:600px; height:600px; overflow:hidden }`.
- Additive waveguide: **pure black is transparent**. Use dark backgrounds
  and light, high-contrast UI. Body text ≥ 16 px, primary content 20–24 px.
- Icons: Unicode or **PNG ≥ 52 × 52**; **SVG icons unsupported**.
- Unsupported: camera, microphone, text input (per docs; see §3), offline,
  notifications, back navigation, continuous cursor.
- Available: `fetch`/WebSocket, `localStorage`/`sessionStorage` (5 MB; this
  app deliberately uses neither), `DeviceMotion`/`DeviceOrientation` and
  `navigator.geolocation` (with permission; not used).
- **Secondary / unverified** hardware figures from press coverage of Connect
  2025: ~20° field of view, monocular right eye, up to 5,000 nits, 90 Hz panel.
  Meta's own pages say "full-colour, high-resolution", "42 pixels per degree".
- No documented user-agent string, media query or JS API identifies the
  glasses runtime → this project uses a separate entry page.

## 6. Deployment / install / testing

1. Serve `glasses.html` over **HTTPS from a public URL** (any static host).
   `dev/serve.py` is HTTP-only and fine for desktop simulation, not for the device.
2. On the paired phone, Meta AI app → **Settings → App Info → tap the App
   version five times → Enable** Developer Mode.
3. Meta AI app → **App Settings → App Connections → Web Apps → Add a Web App**
   → name + URL → **Connect**. The app appears in the glasses' app grid.
4. Share with testers via the **Share link** button (preview cap ~100).
5. Desktop check: Chrome DevTools at 600 × 600, arrow keys + Enter. Meta's
   **"Meta Ray-Ban Display Simulator"** Chrome extension adds additive
   blending, a D-pad, a QA checklist (viewport meta, favicon, focusable
   elements, overflow, focus styles) and WebM recording —
   <https://chromewebstore.google.com/detail/jpjlmmodokemlepklkdbimceggpbjcll>.
6. Optional: Meta's docs MCP endpoint <https://mcp.developer.meta.com/wearables>
   and the `meta-wearables-webapp` Claude Code plugin.

Developer terms (privacy policy required, no selling/surveillance of device
data, deletion on request) apply — <https://wearables.developer.meta.com/terms/>.
This app collects nothing, so compliance is trivial, but a privacy statement
should still be published with the URL.

## 7. What cannot be implemented today

- **Publishing to the public** — Developer Preview only; share-link testers.
- **Guaranteed text entry** — depends on the composer being present on the
  build (docs say unsupported; Meta's repo says available). Chips are the fallback.
- **Browser-style dictation** — no microphone for web apps; only the native composer.
- **Runtime detection / a single URL for both browser and glasses** — no API;
  hence `index.html` and `glasses.html`.
- **Custom gestures** (e.g. "pinch and hold to burn") — not exposed.
- **Haptics, sound** — not documented for web apps.
- **Offline use** — unsupported; the page must be reachable each launch.
- **Meta Quest / other headsets** — out of scope; no documented bridge.

## Open verification items (need hardware)

- [x] Composer opens on pinch when the textarea is focused; voice input commits into the field (12 Sep 2026, composer-test.html).
- [ ] Same flow inside glasses.html, where the field is focused programmatically at idle rather than by a swipe.
- [ ] Handwriting appears in the composer once the account's handwriting feature is enabled.
- [ ] WebGL context creation and shader performance at 600 × 600 (target 60 fps; fallback is software).
- [ ] The near-black ember glow reads correctly on the additive display.
- [ ] 48–56 px chip/button heights are comfortable; raise to 88 px if not.
