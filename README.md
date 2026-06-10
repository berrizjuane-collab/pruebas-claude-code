# Linear Transformation Lab

An interactive, educational visualizer of **2D linear transformations**, inspired by
3Blue1Brown's *Essence of Linear Algebra*: watch matrices deform space — grid,
basis vectors, areas, eigendirections — with mathematically honest animations.

```bash
npm install && npm run dev    # open the printed URL
npm test                      # unit tests for the algebra layer
npm run build                 # typecheck + production build
```

---

## Plan

### Product

Two modules sharing one rendering engine:

- **Module A — Matrix & transformation lab:** define a 2×2 matrix (by typing or
  by dragging the basis-vector tips), animate identity → A, and read/see the
  determinant, eigenvectors, rank, kernel and image, presets and compositions.
- **Module B — Deformation of space:** the same engine tuned for *feeling* the
  deformation: dense grid, point field, deformable test figures (square, circle,
  cat), displacement vector field, and a scrubbable time slider.

### Stack (and why)

| Choice | Reason |
| --- | --- |
| Vite + React 18 + TypeScript (strict) | requested; typed `Mat2`/`Vec2` everywhere |
| Canvas 2D | dense grids + 60 fps dragging beat SVG node counts |
| KaTeX | real mathematical notation for matrices/eigenvalues |
| `requestAnimationFrame` + own easing | no animation library needed |
| Vitest | unit tests for the pure algebra layer |

No other runtime dependencies. No backend, no storage — state lives in memory.

### Architecture: three isolated layers

```
src/
├── math/                  # (a) PURE linear algebra — no DOM, no React
│   ├── types.ts           #     Vec2, Mat2 (columns = images of î and ĵ)
│   ├── mat2.ts            #     multiply, apply, det, inverse, vector helpers
│   ├── eigen.ts           #     eigenvalues/eigenvectors: real / repeated / complex
│   ├── kernel.ts          #     rank, kernel and image of singular matrices
│   ├── interpolate.ts     #     linear & rotational interpolation, easing
│   ├── presets.ts         #     rotation, scale, shear, reflection, projection
│   └── *.test.ts          #     Vitest unit tests for all of the above
├── rendering/             # (b) Canvas layer — pure draw functions (ctx in, pixels out)
│   ├── camera.ts          #     world↔screen mapping, zoom/pan, nice grid steps
│   ├── scene.ts           #     Scene spec (plain data) + drawScene orchestrator
│   ├── drawGrid.ts        #     reference grid + transformed grid (always straight lines)
│   ├── drawShapes.ts      #     arrows, parallelogram, eigen/kernel lines, figures, fields
│   └── figures.ts         #     square / circle / cat-silhouette polylines
├── state/                 # (c) state layer — useReducer store + animation loop
├── components/            # React UI: CanvasStage, MatrixInput, InfoPanel, presets…
├── theme.ts               # single source of truth for the color palette
└── App.tsx                # layout + module tabs
```

The algebra layer is import-only-from-`math/` pure TypeScript; the rendering
layer consumes plain data (`Scene`) and never touches React; React components
assemble state into a `Scene` and forward pointer gestures back to the store.

### Milestones (one commit each, app runnable after every one)

- **M0** scaffolding, dark canvas with reference grid, axes, pan/zoom
- **M1** pure algebra layer + unit tests
- **M2** basis vectors î/ĵ, editable matrix, bidirectional dragging, deforming grid
- **M3** identity→A animation with easing; determinant as area (sign = orientation)
- **M4** eigenvalues/eigenvectors incl. complex/repeated; kernel & image when singular
- **M5** presets; composition with visible non-commutativity; custom vectors
- **M6** Module B: live dense deformation, figures, vector field, time scrubbing
- *(extension, deliberately out of scope here: 3D with three.js)*

### Mathematical notes

- **Columns are landing spots.** The matrix inputs are colored like the vectors:
  first column green (image of î), second red (image of ĵ) — dragging a tip
  writes that column.
- **Animation path.** Default interpolation is entrywise,
  `M(t) = (1−t)·I + t·A`. For rotation-like matrices (similarities,
  `a=d, b=−c`) this path would pass through a singular matrix (e.g. at 180°),
  so the app auto-switches to a *rotational* path that interpolates angle and
  scale (equivalently `exp(t·log A)` viewing the similarity as a complex
  number). A note in the UI explains which path is active.
- **Eigenvectors stay put under the default animation.** If `A·v = λ·v` then
  `((1−t)I + tA)·v = ((1−t) + tλ)·v`, so the drawn eigendirections are
  genuinely invariant for *every* frame of the linear animation — not just at
  the endpoints.
- **Complex eigenvalues** (discriminant `tr² − 4·det < 0`) mean no direction is
  mapped to itself; the UI explains this instead of breaking.
- **Composition order.** "Apply A, then B" is the product **B·A** (the matrix
  nearest the vector acts first). The composition panel renders both `B·A` and
  `A·B` and animates the two-stage deformation so non-commutativity is visible.

### Palette

Defined once in `src/theme.ts` (canvas) and mirrored to CSS custom properties:
background `#10131a`, î green `#83c167`, ĵ red `#fc6255`, transformed grid blue
`#58c4dd`, determinant area yellow `#f4d345` (orange when orientation flips),
eigenvectors `#ffd35a`, kernel pink `#ff6fb5`, image violet `#b48cff`.
