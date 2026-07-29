# Neutron Star

A cinematic, real-time 3D visualization of a rotating neutron star and its
magnetosphere. One subject, deep black, and as little interface as the piece can
get away with: a title, a paragraph, and three controls.

```bash
npm install       # install dependencies
npm run dev       # start the dev server, then open the printed URL
npm test          # run the physics unit tests (21 tests)
npm run build     # typecheck + production build into dist/
npm run preview   # serve the production build locally
```

Requires a modern browser with **WebGL2** (recent Chrome, Firefox, Edge, Safari).
No network access or external assets are needed at runtime — everything is
procedural or bundled, including the type.

> **Note on history.** This started as an instrument: parameter sliders, a KaTeX
> formula panel, live light curves, an interior cutaway, layer toggles and a
> sonification of the pulse. That version is in the git history. It was
> deliberately rebuilt as a cinematic piece, so all of that is gone from the
> product — but the physics layer underneath it is unchanged, and still drives
> what you see.

---

## Controls

| Control | What it does |
| --- | --- |
| **Camera — Free** | Drag to orbit, scroll or pinch to zoom. Inertial, damped. |
| **Camera — Fixed** | A locked shot. All input is ignored; the star rotates inside a still frame. |
| **Angle** | Four framings: three-quarter, equatorial (edge-on), polar (down the spin axis), wide. |
| **Rotation** | 0.25× / 1× / 3× on the visual spin. |

Angle presets apply in *both* camera modes: in Free you land on the framing and
can keep moving, in Fixed you land on it and stay. The overlay fades out after a
few seconds of stillness and returns on any pointer movement.

## What is actually being simulated

The look is art-directed, but it is not arbitrary — the shaders are driven by
real quantities computed in SI units from the star's mass, radius, spin,
temperature and magnetic field:

- **Compactness `r_s/R`** sets the strength of the limb ring in the corona, the
  visible signature of light from the far side being bent into view.
- **Gravitational redshift `z`** reddens and dims the surface emission, and feeds
  the rim glow.
- **Rotation-induced oblateness** flattens the body along the spin axis.
- **Equatorial `β = v/c`** drives relativistic Doppler beaming: the limb turning
  toward the viewer is brighter and bluer. At the canonical preset's 2 Hz this is
  correctly almost invisible — it is not exaggerated to make a point.
- **Field strength** ramps the magnetar behaviour: incandescent crust fractures,
  a more agitated halo, faster flow along the field lines.
- **Beam / observer geometry** decides when a beam sweeps the line of sight,
  which flares the beams and pulses the aperture starburst.

Two things are deliberate visual translations rather than literal renderings, and
are worth stating plainly here since the interface no longer does:

- **Colour.** Real neutron-star thermal emission peaks in X-rays. The blue-white
  palette is a translation of a very hot surface into visible light.
- **Rotation rate.** The visual spin is a viewable stand-in (a few seconds per
  revolution), not the real 2 Hz, which would strobe.

The closed magnetosphere geometry is the exact dipole relation `r = L·sin²θ`; the
open polar field lines are schematic. The pulsar beams are hollow cones, which is
the standard core/cone picture and the reason many observed pulse profiles are
double-peaked.

## Architecture

```
src/
  main.ts              boot, frame loop, dev-only camera handle
  core/
    Engine.ts          renderer, post chain, RAF loop, resize
    QualityManager.ts  quality tiers + adaptive scaling
    capabilities.ts    GPU/feature detection
    Disposable.ts      resource tracking
  camera/CameraRig.ts  spherical orbit state; free / fixed modes
  scene/
    NeutronStar.ts     the body
    Corona.ts          limb ring + halo billboard
    PulsarBeams.ts     hollow emission cones
    MagneticField.ts   dipole field lines
    Magnetosphere.ts   charged particles riding the field
    Background.ts      star field + galactic band
  shaders/             star, corona, beams, field, background,
                       lensing, starburst, grade, noise
  physics/             SI model, presets, pulsar geometry (tested)
  state/               tiny observable store
  ui/                  Overlay (title, paragraph, controls), intro
```

### Post-processing chain

```
render → lensing → starburst → bloom → grade → output
```

Starburst sits *before* bloom on purpose: the diffraction spikes and the
anamorphic streak are light, so bloom should bleed off them the way it bleeds off
the star. After bloom they become hard-edged decals.

Render targets are half-float, so the HDR values the star shader emits survive the
chain instead of clipping at 1.0 before tone mapping. Tone mapping is Khronos PBR
Neutral — ACES shears bright blues toward cyan and AgX desaturates the midtones
until the star reads grey.

The star shader keeps the crust below 1.0 and lets only the polar caps, fracture
seams, rim, corona and beams overshoot, so the bloom threshold picks out the
emissive features and leaves the crust crisp.

### The sky

The sky is black. There is no ambient floor and no colour wash; every non-zero
pixel is either a resolved star or unresolved starlight. The Milky Way is rendered
as the integrated light of stars too faint to resolve — a near-neutral cream glow
in a thin disc plus a fainter thick disc, with a warmer bulge — and interstellar
dust is applied as *extinction*, multiplying that glow down rather than painting
dark shapes over it. Granularity comes from the ~30k resolved star points that
share the same galactic plane, not from noise on the dome.

## Testing

`npm test` covers the physics layer (21 tests): the SI model and its derived
quantities, and the pulsar beam/observer geometry. Those are pure functions with
no DOM or WebGL, so they run in node.

The rendering and camera layers are verified by driving a real browser with
Playwright. The camera checks matter most, and are worth describing because a
pixel diff cannot distinguish camera motion from the star's own rotation: the rig
exposes its orbital state through a dev-only `window.__rig` handle (stripped from
production builds by Vite's `import.meta.env.DEV` substitution), and the harness
asserts that each angle preset converges on its exact pose, that Fixed leaves the
pose *bit-identical* through a drag and a wheel, that presets still reposition
while Fixed, that Free responds again afterwards, and that the near-clip and
elevation limits hold.

## Credits & licenses

- **[three.js](https://threejs.org/)** (MIT) — WebGL renderer and
  post-processing passes.
- **3D simplex noise** by Ashima Arts / Stefan Gustavson
  ([webgl-noise](https://github.com/ashima/webgl-noise), MIT) — the `snoise`
  function in `src/shaders/noise.glsl.ts`; `fbm` and `ridged` are layered on top
  here.
- **Vite**, **TypeScript**, **Vitest** (MIT) — build and test tooling.
- Typography is system fonts only. A strict artifact CSP blocks external hosts,
  and a webfont that fails to load is worse than one chosen from what is already
  installed.
- No textures, models, audio or other external assets. Everything is procedural.

Released under the **MIT License** — see `LICENSE`.
