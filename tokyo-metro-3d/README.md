# Tokyo Metro — Graph Control

Interactive 3D visualizer of the **complete Tokyo Metro network** (all 9 lines,
141 unique stations, 173 segments) fused with an **educational graph-algorithm
engine**: Dijkstra, Prim and Kruskal run over the real network graph and are
animated **step by step from their actual execution trace** — nothing is staged.

![stack](https://img.shields.io/badge/stack-React%20%2B%20React%20Three%20Fiber%20%2B%20zustand-blue)

## Run it

```bash
npm install
npm run dev      # local dev server
npm test         # algorithm rigor tests (node --test)
npm run build    # production bundle in dist/
```

## What's inside

| Layer | Where | Notes |
|---|---|---|
| Dataset | `src/data/` | 9 Tokyo Metro lines, official colors, per-segment travel times (hand-estimated from timetables), approximate geographic coordinates, Japanese names, simulated numbered exits |
| Graph | `src/graph/buildGraph.js` | Single adjacency-list structure shared by renderer **and** algorithms |
| Algorithms | `src/graph/algorithms.js` | Real implementations — binary min-heap with lazy deletion (Dijkstra/Prim), union–find with path compression + rank (Kruskal). Each run records an execution trace |
| Playback | `src/state/` | The view at step N is a pure fold of the first N trace events → scrubbing, manual stepping and speed control are trivially correct |
| 3D scene | `src/three/` | React Three Fiber: tube edges bowed to per-line depth layers (construction era), glow sprites, HDR colors + bloom, orbit camera |
| HUD | `src/ui/` | Command-center panels: line roster/legend, algorithm console with live priority queue, station dossier, cursor tooltip |
| Tests | `test/algorithms.test.js` | Dijkstra vs independent Bellman–Ford oracle; Prim total ≡ Kruskal total from any seed; trace invariants (non-decreasing settle order, real cycle rejections) |

## The three modes

- **Dijkstra** — pick origin (green) + destination (red). Watch stations settle
  in true priority order, edges pulse as they relax, and the frontier's
  tentative distances tick down in the priority-queue HUD. Final path in gold
  with total time, distance and transfer count.
- **Prim** — pick **one seed only** (no destination: Prim builds the cheapest
  network that reaches every station, it does not answer routes — the UI says
  so). The tree grows greedily, always absorbing the cheapest boundary edge.
- **Kruskal** — no inputs. All 173 segments sorted by weight, evaluated one by
  one; union–find rejections flash red and fade from focus.

**Cross-validation on screen:** the HUD shows `MST — PRIM X | KRUSKAL X ✓`,
computed independently at runtime. If the implementations ever disagreed the
chip would turn red. Both weight criteria (time / distance) are supported and
switchable.

## Honest-data notes

- Coverage: all 9 Tokyo Metro lines. Excluded: the Marunouchi Hōnanchō branch
  and the entire Toei Subway (different operator).
- Travel times: hand-estimated (±1 min) from published local timetables;
  end-to-end sums land close to official run times.
- Coordinates: approximate real geography (±300 m), hand-placed.
- Distances: straight-line km between stations (real track is slightly longer).
- Exits: simulated (deterministic per station), labeled as such in the UI.
- The Wakōshi–Kotake-Mukaihara corridor is physically shared by Yūrakuchō and
  Fukutoshin; it is modeled as parallel edges — true to the service pattern,
  and it hands Kruskal genuine cycles to reject.

## Controls

`drag` orbit · `scroll` zoom · `right-drag` pan · `click station` dossier /
algorithm input · `SPACE` play-pause · `→` single step · `R` reset ·
scrub slider to jump anywhere in the execution.

Console access: `window.metroStore` exposes the zustand store
(e.g. `metroStore.getState().setMode('dijkstra')`).
