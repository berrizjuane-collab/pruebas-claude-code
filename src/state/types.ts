/**
 * Application state.
 *
 * Deliberately small. The physics parameters are fixed to one preset and are no
 * longer user-editable — this build is a cinematic piece, so the only things the
 * viewer controls are the framing, the camera mode and the rotation speed.
 * `params`/`derived` remain because the shaders are still driven by real
 * quantities (compactness, redshift, oblateness, equatorial β).
 */

import type { DerivedQuantities, StarParams } from '../physics/NeutronStarModel';
import type { CameraMode, ViewAngle } from '../camera/CameraRig';

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra' | 'adaptive';
export type { CameraMode, ViewAngle };

export interface AppState {
  params: StarParams;
  derived: DerivedQuantities;

  /** Rotation-speed multiplier applied to the visual spin. */
  speed: number;
  playing: boolean;

  cameraMode: CameraMode;
  viewAngle: ViewAngle;

  /** Latitude of the notional distant observer; sets which way the beams flare. */
  observerInclination: number;
  beamIntensity: number;
  beamWidth: number;

  quality: QualityLevel;
  reducedMotion: boolean;
  reducedFlashing: boolean;
}
