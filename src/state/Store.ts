/**
 * A tiny typed observable store. No framework: components subscribe to changes
 * and get the (immutable-by-convention) state back.
 *
 * Only the viewer-facing choices persist to localStorage — framing, camera mode,
 * speed and the accessibility flags. The physics parameters are fixed to a single
 * preset in this build, so there is nothing else worth remembering.
 */

import { derive } from '../physics/NeutronStarModel';
import { DEFAULT_PRESET_ID, getPreset } from '../physics/presets';
import type { AppState } from './types';

type Listener = (state: AppState) => void;
type Selector<T> = (state: AppState) => T;

const STORAGE_KEY = 'nso.cinematic.v1';

interface PersistedPrefs {
  speed: number;
  cameraMode: AppState['cameraMode'];
  viewAngle: AppState['viewAngle'];
  quality: AppState['quality'];
  reducedMotion: boolean;
  reducedFlashing: boolean;
}

function loadPrefs(): Partial<PersistedPrefs> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<PersistedPrefs>) : {};
  } catch {
    return {};
  }
}

function savePrefs(state: AppState): void {
  try {
    const prefs: PersistedPrefs = {
      speed: state.speed,
      cameraMode: state.cameraMode,
      viewAngle: state.viewAngle,
      quality: state.quality,
      reducedMotion: state.reducedMotion,
      reducedFlashing: state.reducedFlashing,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable — ignore */
  }
}

function initialState(): AppState {
  const preset = getPreset(DEFAULT_PRESET_ID);
  const prefs = loadPrefs();
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  return {
    params: { ...preset.params },
    derived: derive(preset.params),

    speed: prefs.speed ?? 1,
    playing: true,

    cameraMode: prefs.cameraMode ?? 'free',
    viewAngle: prefs.viewAngle ?? 'threeQuarter',

    // Chosen so a beam sweeps the observer and the flare is visible.
    observerInclination: Math.PI / 5,
    beamIntensity: 0.9,
    beamWidth: 0.22,

    quality: prefs.quality ?? 'adaptive',
    reducedMotion: prefs.reducedMotion ?? Boolean(prefersReducedMotion),
    reducedFlashing: prefs.reducedFlashing ?? false,
  };
}

export class Store {
  private state: AppState;
  private listeners = new Set<Listener>();

  constructor() {
    this.state = initialState();
  }

  get(): AppState {
    return this.state;
  }

  /** Shallow-merge a patch and notify subscribers. */
  set(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Subscribe to a derived slice; only fires when the selected value changes. */
  select<T>(selector: Selector<T>, listener: (value: T) => void): () => void {
    let prev = selector(this.state);
    return this.subscribe((s) => {
      const next = selector(s);
      if (next !== prev) {
        prev = next;
        listener(next);
      }
    });
  }

  private emit(): void {
    savePrefs(this.state);
    for (const l of this.listeners) l(this.state);
  }
}
