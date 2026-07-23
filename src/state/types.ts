/** Application-wide state types. */

import type { DerivedQuantities, StarParams } from '../physics/NeutronStarModel';

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra' | 'adaptive';
export type RotationMode = 'physical' | 'educational';
export type BackgroundMode = 'cinematic' | 'scientific' | 'lab' | 'grid';
export type CameraMode =
  | 'orbit'
  | 'free'
  | 'fixed'
  | 'polar'
  | 'magnetic'
  | 'equatorial'
  | 'observer'
  | 'cinematic'
  | 'closeup';

/** Which optional scene layers are visible. */
export interface LayerVisibility {
  magneticField: boolean;
  magnetosphere: boolean;
  beams: boolean;
  lightCylinder: boolean;
  axes: boolean;
  interior: boolean;
  lensing: boolean;
}

export interface AudioState {
  scientific: boolean;
  cinematic: boolean;
  muted: boolean;
  volume: number; // 0..1
  syncRotation: boolean;
  started: boolean; // AudioContext resumed after a user gesture
}

export interface AppState {
  presetId: string;
  params: StarParams;
  derived: DerivedQuantities;

  // Rotation / simulation
  playing: boolean;
  timeScale: number; // multiplier on simulation speed
  rotationMode: RotationMode;

  // Camera & observer
  cameraMode: CameraMode;
  observerInclination: number; // radians, latitude of the distant observer

  // Scene
  layers: LayerVisibility;
  backgroundMode: BackgroundMode;
  fieldLineDensity: number; // 0..1
  beamIntensity: number; // 0..1
  beamWidth: number; // radians (half-angle)

  // Rendering
  quality: QualityLevel;
  immersive: boolean;
  showFps: boolean;
  reducedMotion: boolean;
  reducedFlashing: boolean;

  audio: AudioState;
}
