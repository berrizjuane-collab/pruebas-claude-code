/**
 * A tiny typed observable store. No framework: components subscribe to changes
 * and get the (immutable-by-convention) state back. Physics-derived quantities
 * are recomputed automatically whenever the fundamental parameters change.
 *
 * Persistence: user-facing preferences are mirrored to localStorage so settings
 * survive a reload (opt-out friendly — a corrupt/blocked store just no-ops).
 */

import { derive, PARAM_LIMITS, type ParamKey, type StarParams } from '../physics/NeutronStarModel';
import { DEFAULT_PRESET_ID, getPreset } from '../physics/presets';
import { clamp } from '../utils/math';
import type { AppState } from './types';

type Listener = (state: AppState) => void;
type Selector<T> = (state: AppState) => T;

const STORAGE_KEY = 'nso.settings.v1';

/** Preferences we persist (not the physics params, which come from presets). */
interface PersistedPrefs {
  quality: AppState['quality'];
  backgroundMode: AppState['backgroundMode'];
  audio: Partial<AppState['audio']>;
  reducedMotion: boolean;
  reducedFlashing: boolean;
  rotationMode: AppState['rotationMode'];
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
      quality: state.quality,
      backgroundMode: state.backgroundMode,
      audio: {
        scientific: state.audio.scientific,
        cinematic: state.audio.cinematic,
        muted: state.audio.muted,
        volume: state.audio.volume,
        syncRotation: state.audio.syncRotation,
      },
      reducedMotion: state.reducedMotion,
      reducedFlashing: state.reducedFlashing,
      rotationMode: state.rotationMode,
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
    presetId: preset.id,
    params: { ...preset.params },
    derived: derive(preset.params),

    playing: true,
    timeScale: 1,
    rotationMode: prefs.rotationMode ?? 'educational',

    cameraMode: 'orbit',
    // Chosen so the canonical preset's beam sweeps the observer → visible pulses.
    observerInclination: Math.PI / 5,

    layers: {
      magneticField: true,
      magnetosphere: true,
      beams: true,
      lightCylinder: false,
      axes: true,
      interior: false,
      lensing: true,
    },
    backgroundMode: prefs.backgroundMode ?? 'cinematic',
    fieldLineDensity: 0.6,
    beamIntensity: 0.8,
    beamWidth: 0.22,

    quality: prefs.quality ?? 'adaptive',
    immersive: false,
    showFps: false,
    reducedMotion: prefs.reducedMotion ?? Boolean(prefersReducedMotion),
    reducedFlashing: prefs.reducedFlashing ?? false,

    audio: {
      scientific: prefs.audio?.scientific ?? true,
      cinematic: prefs.audio?.cinematic ?? false,
      muted: prefs.audio?.muted ?? false,
      volume: prefs.audio?.volume ?? 0.6,
      syncRotation: prefs.audio?.syncRotation ?? true,
      started: false,
    },
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

  /** Update a single fundamental parameter (clamped to physical limits) and re-derive. */
  setParam(key: ParamKey, rawValue: number): void {
    const limit = PARAM_LIMITS[key];
    // Limits for mass/radius/etc. are quoted in display units; convert on the caller
    // side. Here we clamp in the same units the caller passed (SI for the store).
    const value = clamp(rawValue, limitToSI(key, limit.min), limitToSI(key, limit.max));
    const params: StarParams = { ...this.state.params, [key]: value };
    this.state = { ...this.state, params, derived: derive(params) };
    this.emit();
  }

  /** Load a full preset, replacing the parameters. */
  loadPreset(id: string): void {
    const preset = getPreset(id);
    const params = { ...preset.params };
    this.state = { ...this.state, presetId: id, params, derived: derive(params) };
    this.emit();
  }

  /** Merge audio sub-state. */
  setAudio(patch: Partial<AppState['audio']>): void {
    this.state = { ...this.state, audio: { ...this.state.audio, ...patch } };
    this.emit();
  }

  /** Merge layer visibility. */
  setLayers(patch: Partial<AppState['layers']>): void {
    this.state = { ...this.state, layers: { ...this.state.layers, ...patch } };
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

/** Convert a display-unit limit to SI for clamping. */
function limitToSI(key: ParamKey, v: number): number {
  switch (key) {
    case 'mass':
      return v * 1.98892e30;
    case 'radius':
      return v * 1e3;
    default:
      return v;
  }
}
