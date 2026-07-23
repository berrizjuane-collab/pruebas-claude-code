# Neutron Star Observatory

An interactive, scientifically-grounded 3D visualization of a rotating **neutron
star / pulsar / magnetar**. It renders a compact, relativistic, magnetized
stellar remnant as a genuine 3D object — procedural surface, dipole
magnetosphere, sweeping pulsar beams, gravitational light bending, a schematic
interior cutaway, live physics read-outs, an interactive maths panel, and a data
sonification of the pulse — with fluid navigation and adaptive performance.

It is built to be **honest**: real physical quantities are computed in SI units
and shown with their units; every approximation and every purely-visual
translation is labelled as such; and the star is always kept strictly on the
neutron-star side of the black-hole boundary.

```bash
npm install       # install dependencies
npm run dev       # start the dev server, then open the printed URL
npm test          # run the physics/maths unit tests (29 tests)
npm run build     # typecheck + production build into dist/
npm run preview   # serve the production build locally
```

Requires a modern browser with **WebGL2** (recent Chrome, Firefox, Edge, Safari).
No network access or external assets are needed at runtime — everything is
procedural or bundled.

---

## Highlights

- **Fully 3D neutron star** with a procedural surface shader that stays crisp
  under extreme close-ups (thermal domains, crust fractures, hot magnetic caps,
  rotation-induced oblateness) — no baked textures to pixelate.
- **Live, correct physics**: mass, radius, spin, temperature and field drive
  compactness, Schwarzschild radius, gravitational redshift, time dilation,
  moment of inertia, rotational energy, light-cylinder radius, spin-down
  luminosity, mean density, surface gravity and more — recomputed in real time.
- **Interactive maths panel** (KaTeX) — each formula shows its symbolic form,
  meaning, variable glossary and current numeric value, with approximations
  flagged.
- **Dipole magnetosphere**: closed field lines following `r = L·sin²θ`, open
  polar lines, and charged particles that stream *along* the field lines.
- **Pulsar beams** that flare as they sweep the observer's line of sight, with a
  live **light curve** and **pulse train**, single- vs double-peak detection.
- **Approximate gravitational lensing** post-process driven by the star's real
  compactness.
- **Interior cross-section**: a schematic layered cutaway with density/pressure/
  enclosed-mass radial profiles and honest certainty labels.
- **Procedural galactic background** (nebula dome + multi-shell parallax star
  field) with cinematic / sober / black / grid modes.
- **Nine camera modes** including free-fly, observer, cinematic and a
  clipping-safe close-up, plus a one-click "Safe view".
- **Procedural audio sonification** (Web Audio) — pulse clicks synced to the
  rotation, optional cinematic drone, limiter, analyser scope.
- **Adaptive quality** targeting ~55 FPS, five graphics tiers, and a clean
  mobile layout.
- Five **scientific presets**: canonical NS, young pulsar, millisecond pulsar,
  magnetar, massive NS.

---

## Controls

| Input | Action |
| --- | --- |
| **Drag** | Orbit the star (orbit mode) |
| **Scroll / pinch** | Zoom |
| **W A S D / Q E** | Fly (free-camera mode) |
| **Space** | Play / pause rotation |
| **H** | Immersive mode (hide all UI) |
| **C** | Cycle camera mode |
| **V** | Safe view (recover if lost) |
| **F** | Fullscreen |
| **P** | Save a PNG snapshot |
| **1 – 5** | Load a preset |
| **?** | Help & shortcuts overlay |

The toolbar (bottom-right on desktop) selects the camera and exposes Safe view,
cinematic play/pause, snapshot, fullscreen, reset parameters, immersive mode and
help. On phones a bottom nav reveals one panel at a time so the scene stays the
hero.

### Cameras

`Orbit` · `Free` (fly) · `Fixed` · `Polar` (down the spin axis) · `Magnetic`
(aligned to the tilted magnetic axis) · `Equator` · `Observer` (the distant
line of sight — watch the pulse arrive) · `Cinematic` (scripted, pausable) ·
`Close-up` (extreme surface zoom with tightened near/far planes).

---

## Architecture

The code is modular, typed and separated into a **pure physics/maths layer**
(unit-tested, no DOM/WebGL) and a **rendering/UI layer**.

```
src/
  physics/            Pure, unit-tested science (SI units)
    constants.ts        Physical constants (CODATA)
    units.ts            SI ↔ human units, number formatting
    NeutronStarModel.ts Fundamental params → derived quantities + warnings
    formulas.ts         Interactive formula catalogue (LaTeX + live evaluators)
    presets.ts          Scientific presets
    pulsar.ts           Beam geometry, observer LOS, light curve
    interior.ts         Schematic layers + radial profiles
    *.test.ts           Vitest unit tests
  core/
    capabilities.ts     WebGL2/WebGPU detection, device tier
    Engine.ts           Renderer, post-processing composer, RAF loop
    QualityManager.ts   Quality tiers + adaptive FPS scaling
    Disposable.ts       WebGL resource tracker (leak prevention)
  state/
    types.ts            App state types
    Store.ts            Tiny observable store (+ localStorage persistence)
  scene/                One module per visual system, each self-disposing
    World.ts            Orchestrates the scene + simulation phase + pulses
    NeutronStar.ts, Axes.ts, MagneticField.ts, Magnetosphere.ts,
    PulsarBeams.ts, LightCylinder.ts, Background.ts, Interior.ts, labels.ts
  shaders/              GLSL (as TS template strings)
    noise.glsl.ts, star.ts, beams.ts, background.ts, field.ts, lensing.ts
  camera/
    CameraRig.ts        All camera modes + transitions + collision + near/far
  audio/
    AudioEngine.ts      Web Audio sonification (pulses + drone + limiter)
  ui/                   Vanilla-TS UI (no framework)
    UI.ts, dom.ts, charts.ts, formulaPanel.ts, science.ts, intro.ts
  main.ts               Bootstrap + loading + cinematic reveal
  style.css
```

### Data flow

`Store` holds the fundamental parameters and visual toggles. On any parameter
change it re-derives all physical quantities (`NeutronStarModel.derive`) and
notifies subscribers. The `World` advances the visual rotation phase each frame
and updates every scene module from the current state; the `UI` refreshes
read-outs, formulas and charts. The `Engine` renders through a post chain
(render → lensing → bloom → output). Nothing pushes SI units into the renderer —
the scene works in normalized world units (star radius = 1).

### Rendering & performance

- Log depth buffer + per-frame dynamic near/far planes for extreme close-ups.
- Instanced/pooled geometry; a single Points cloud for magnetosphere particles
  and for the background star field; one draw call per field-line family.
- Adaptive quality nudges pixel ratio, particle/line counts and effect toggles
  to hold ~55 FPS; five explicit tiers (Low/Medium/High/Ultra/Auto).
- Simulation pauses when the tab is hidden; charts and read-outs update at a
  throttled rate, decoupled from the render loop.
- Every geometry, material, texture, listener and audio node is tracked and
  disposed (`ResourceTracker` + per-module `dispose()`).

### WebGPU fallback

WebGL2 is the primary, stable backend. WebGPU is *detected* and reported but not
used to render (Three.js's WebGPU renderer is still experimental); the capability
layer is structured so a future backend swap needs no scene changes. If WebGL is
unavailable the app shows a clear message instead of failing silently.

---

## Physical model

All physics is computed in SI and is unit-tested. The following are **exact
within the stated model**:

- Compactness `C = GM/Rc²`, Schwarzschild radius `r_s = 2GM/c²`, ratio `r_s/R`.
- Gravitational redshift `z = (1 − 2GM/Rc²)^(−1/2) − 1` and time dilation
  `dτ/dt = √(1 − 2GM/Rc²)` (exterior Schwarzschild — an excellent approximation
  outside a slowly-rotating star).
- Rotation: `Ω = 2πf`, `P = 1/f`, `v = ΩR`, light cylinder `R_lc = c/Ω`.
- `I = kMR²`, `J = IΩ`, `E_rot = ½IΩ²`.
- Mean density, Newtonian and GR-corrected surface gravity.
- Magnetic-dipole spin-down `Ė ≈ B_p²R⁶Ω⁴sin²α / 6c³`, implied `Ṗ`, and
  characteristic age `τ_c ≈ P/2Ṗ`.
- Black-body thermal luminosity `L = 4πR²σT⁴`.

### Approximations (clearly labelled in-app)

- **Rotation effects** (oblateness, `I`, `J`, `E_rot`, light cylinder) are
  treated at the Newtonian level. For millisecond spins this is only qualitative;
  a full treatment needs Hartle–Thorne / numerical relativity. The app does **not**
  claim to use the Kerr metric for the material star.
- **Gravitational lensing** is a *screen-space* approximation whose radial
  deflection follows the weak-field angle `α ≈ 2r_s/b`, driven by the real
  compactness. It reproduces the qualitative limb compression and over-visibility
  of the far side; it is not a geodesic ray trace.
- **Doppler beaming / redshift on the surface** are rendered as color/brightness
  shifts, tuned for legibility rather than radiometric accuracy.
- **Interior structure** is a schematic parametrization (right ordering, right
  orders of magnitude), **not** a TOV solution for a specific nuclear equation of
  state. The Tolman–Oppenheimer–Volkoff equation is explained but not solved in
  real time; the inner-core composition is marked *hypothetical*.
- **Magnetar surface activity** (glowing fractures) is a stylized illustration,
  not a simulation of a specific starquake.
- **Colours and audio** are visual/data translations: real thermal emission
  peaks in X-rays and beams radiate in radio/X-ray/gamma bands; space is a vacuum
  and carries no acoustic sound. The audio is a **sonification**, not literal.

### Parameter limits & warnings

Inputs are clamped to physically sane ranges (mass 1.0–2.3 M☉, radius 9–15 km,
spin 0.1–750 Hz, field 10⁶–10¹¹ T, etc.). Extreme combinations raise **scientific
warnings** (approaching the Buchdahl compactness limit 4/9; equatorial speed
nearing mass-shedding; strong-field regime), not generic errors.

---

## Physical vs. educational rotation

A millisecond pulsar spinning hundreds of times per second cannot be watched
directly. Two modes handle this:

- **Physical** — the star and beams rotate at the true spin frequency.
- **Educational** (default) — rotation is slowed to a viewable rate while the UI
  keeps showing the real frequency, period and RPM. Because the light curve and
  audio follow the *visual* phase, what you see and hear always stay in sync,
  and a conversion is implied by the displayed real numbers.

---

## Accessibility

Keyboard-navigable controls and shortcuts; a "reduce motion" option (slows shader
animation and camera damping); a "reduce flashing / bright pulses" option that
tames pulse brightness; volume/mute; a high-contrast cool palette; a "Safe view"
recovery button; and honest, readable warnings. Respects
`prefers-reduced-motion`. Settings persist in `localStorage`.

---

## Testing

`npm test` runs the Vitest suite over the pure physics layer:

- unit conversions; frequency ↔ period; compactness; Schwarzschild radius;
- gravitational redshift ↔ time-dilation consistency; rotational energy scaling;
- light-cylinder radius; equatorial velocity; parameter-limit warnings;
- formula-catalogue evaluation; interior profile monotonicity;
- pulsar light-curve geometry (peak counts, bounds, single/double peaks).

The rendering path is verified manually and via a headless-Chromium smoke check
(WebGL2 context, zero console errors, panels/formulas rendered).

---

## Credits, licenses & assets

- **[three.js](https://threejs.org/)** (MIT) — WebGL rendering + post-processing.
- **[KaTeX](https://katex.org/)** (MIT) — formula rendering.
- **3D simplex noise** by Ashima Arts / Stefan Gustavson
  ([webgl-noise](https://github.com/ashima/webgl-noise), MIT) — used in the
  procedural shaders (see `src/shaders/noise.glsl.ts`).
- **Vite**, **TypeScript**, **Vitest** (MIT) — build and test tooling.

No external images, fonts (beyond KaTeX's, bundled) or audio files are used — the
star surface, background, field, particles and all audio are generated
procedurally. This project is released under the **MIT License**.

The science is standard textbook neutron-star / pulsar physics; where the field
is genuinely uncertain (dense-matter equation of state, inner-core composition)
the app says so rather than presenting speculation as fact.
