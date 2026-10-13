/**
 * Estado de la aplicación compartido por la interfaz (React) y el motor. El estado de alta
 * frecuencia (pose de la cámara, tiempo de simulación) vive en el motor, que publica aquí
 * instantáneas a baja frecuencia para la interfaz.
 */
import { useRef, useSyncExternalStore } from 'react';
import type { Profile } from '../rendering/raytracer/RayTracer';
import type { Quality } from '../rendering/raytracer/settings';
import type { CameraObserver } from '../camera/RelativisticCamera';
import type { NavMode } from '../camera/CameraController';
import type { LaunchConfig, ExperimentSummary } from '../simulation/types';
import { DEFAULT_LAUNCH } from '../simulation/types';
import { MODEL_HYPOTHESES } from '../physics/sgra';
import type { TelemetrySnapshot } from './Observatory';

export type Units = 'km' | 'rg' | 'rs';
export type View = 'exterior' | 'object' | 'diagram';
export type PanelId = 'fisica' | 'camara' | 'visualizacion' | 'info' | 'ajustes' | 'investigacion';

export interface OverlayToggles {
  trajectories: boolean;
  coordMarkers: boolean;
  horizon: boolean;
  ergosphere: boolean;
  isco: boolean;
  photonOrbits: boolean;
  geoPhotons: boolean;
  geoMassive: boolean;
  geoCapture: boolean;
  geoCritical: boolean;
  embedding: boolean;
  lightCones: boolean;
  grid: boolean;
  labels: boolean;
}

export interface LiveSnapshot {
  t: number;
  camR: number;
  camTheta: number;
  camObserver: string;
  camNote: string | null;
  camInside: boolean;
  camTau: number;
  fps: number;
  frameMs: number;
  renderScale: number;
  samples: number;
  steps: number;
  rayRate: number;
  gpu: string;
  ehtFluxJy: number | null;
  ehtRingMuas: number | null;
  diving: boolean;
  diveInfo: string | null;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'evento' | 'aviso';
  at: number;
}

export interface AppState {
  paramSetId: string;
  massSolar: number;
  distanceKpc: number;
  spin: number;
  profile: Profile;
  quality: Quality;
  plasmaOn: boolean;
  starsOn: boolean;
  gridOn: boolean;
  turbulence: number;
  hotspot: boolean;
  riaf: { ne0: number; te0: number; beta: number; h: number; kappa: number };
  markerScale: number;
  fixedScale: number | null;
  autoExposure: boolean;
  exposureEV: number;
  bloom: number;
  ehtBeam: boolean;
  beamFwhmMuas: number;
  ehtFovM: number;
  overlay: OverlayToggles;
  observer: CameraObserver;
  navMode: NavMode;
  fovDeg: number;
  sensitivity: number;
  moveSpeed: number;
  inertia: boolean;
  units: Units;
  view: View;
  uiHidden: boolean;
  panel: PanelId | null;
  research: boolean;
  introDone: boolean;
  running: boolean;
  timeScale: number;
  launch: LaunchConfig;
  experiments: ExperimentSummary[];
  selectedExperiment: string | null;
  followExperiment: string | null;
  deformExaggeration: number;
  /** Banda de la vista B: óptica (el plasma de Sgr A* es transparente y no emite) o milimétrica. */
  objectBand: 'optico' | 'mm';
  live: LiveSnapshot;
  telemetry: TelemetrySnapshot | null;
  toasts: Toast[];
  audioOn: boolean;
  busy: string | null;
}

export const DEFAULT_OVERLAY: OverlayToggles = {
  trajectories: true,
  coordMarkers: true,
  horizon: false,
  ergosphere: false,
  isco: false,
  photonOrbits: false,
  geoPhotons: false,
  geoMassive: false,
  geoCapture: false,
  geoCritical: false,
  embedding: false,
  lightCones: false,
  grid: false,
  labels: true,
};

export const INITIAL_STATE: AppState = {
  paramSetId: 'nominal',
  massSolar: 4.0e6,
  distanceKpc: 8.2,
  spin: MODEL_HYPOTHESES.spin,
  profile: 'cinematic',
  quality: 'interactive',
  plasmaOn: true,
  starsOn: true,
  gridOn: false,
  turbulence: 0.45,
  hotspot: false,
  riaf: { ne0: 1.56e7, te0: 3e11, beta: 10, h: 1, kappa: 1 },
  markerScale: 1.8,
  fixedScale: null,
  autoExposure: true,
  exposureEV: 0,
  bloom: 0.12,
  ehtBeam: true,
  beamFwhmMuas: 20,
  ehtFovM: 18,
  overlay: { ...DEFAULT_OVERLAY },
  observer: 'zamo',
  navMode: 'orbit',
  fovDeg: 34,
  sensitivity: 1,
  moveSpeed: 1,
  inertia: true,
  units: 'rg',
  view: 'exterior',
  uiHidden: false,
  panel: null,
  research: false,
  introDone: false,
  running: true,
  timeScale: 100,
  launch: { ...DEFAULT_LAUNCH },
  experiments: [],
  selectedExperiment: null,
  followExperiment: null,
  deformExaggeration: 1,
  objectBand: 'optico',
  live: {
    t: 0,
    camR: 34,
    camTheta: 30,
    camObserver: 'ZAMO',
    camNote: null,
    camInside: false,
    camTau: 0,
    fps: 0,
    frameMs: 0,
    renderScale: 1,
    samples: 0,
    steps: 0,
    rayRate: 0,
    gpu: '',
    ehtFluxJy: null,
    ehtRingMuas: null,
    diving: false,
    diveInfo: null,
  },
  telemetry: null,
  toasts: [],
  audioOn: false,
  busy: null,
};

type Listener = () => void;

export class Store<T extends object> {
  private state: T;
  private listeners = new Set<Listener>();
  constructor(initial: T) {
    this.state = initial;
  }
  get = (): T => this.state;
  set = (patch: Partial<T> | ((s: T) => Partial<T>)): void => {
    const p = typeof patch === 'function' ? patch(this.state) : patch;
    let changed = false;
    for (const k in p) {
      if (!Object.is(this.state[k as keyof T], p[k as keyof T])) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.state = { ...this.state, ...p };
    for (const l of this.listeners) l();
  };
  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
}

export const store = new Store<AppState>(INITIAL_STATE);

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}

/** Suscripción a una parte del estado; los selectores que devuelven objetos se comparan en superficie. */
export function useApp<S>(selector: (s: AppState) => S): S {
  const ref = useRef<{ v: S } | null>(null);
  const get = () => {
    const next = selector(store.get());
    if (ref.current && shallowEqual(ref.current.v, next)) return ref.current.v;
    ref.current = { v: next };
    return next;
  };
  return useSyncExternalStore(store.subscribe, get, get);
}

let toastId = 1;
export function toast(text: string, kind: Toast['kind'] = 'info'): void {
  const t: Toast = { id: toastId++, text, kind, at: Date.now() };
  store.set((s) => ({ toasts: [...s.toasts.slice(-3), t] }));
  setTimeout(() => store.set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), kind === 'evento' ? 6000 : 4200);
}
