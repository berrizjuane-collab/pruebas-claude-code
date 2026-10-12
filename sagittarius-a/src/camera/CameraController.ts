/**
 * Navegación de la cámara en coordenadas de Kerr–Schild (unidades de M).
 *
 * La navegación es una operación de SOFTWARE: mueve el punto desde el que se observa, no es una
 * trayectoria física. En cada posición la cámara tiene la 4-velocidad de la familia de
 * observadores elegida (RelativisticCamera). La única trayectoria física de la cámara es la
 * «caída libre» (dive), integrada como geodésica.
 *
 * Modos: órbita alrededor de un objetivo, vuelo libre (WASD) y seguimiento de un objeto.
 */
export type Vec3 = [number, number, number];
export type NavMode = 'orbit' | 'free' | 'follow';

export interface Pose {
  pos: Vec3;
  fwd: Vec3;
  up: Vec3;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a: Vec3): Vec3 => scale(a, 1 / (norm(a) || 1));
export const vec3 = { add, sub, scale, dot, cross, norm, normalize };

export interface CameraLimits {
  /** Radio mínimo admisible (KS) para el observador actual en la dirección dada. */
  minRadius: (dir: Vec3) => number;
  maxRadius: number;
}

export interface NavSettings {
  rotateSensitivity: number;
  zoomSensitivity: number;
  moveSpeed: number;
  inertia: boolean;
}

export const DEFAULT_NAV: NavSettings = { rotateSensitivity: 1, zoomSensitivity: 1, moveSpeed: 1, inertia: true };

export class CameraController {
  mode: NavMode = 'orbit';
  /** Órbita: objetivo, distancia, acimut y elevación (latitud sobre el plano ecuatorial). */
  target: Vec3 = [0, 0, 0];
  distance = 26;
  azimuth = -Math.PI / 2;
  elevation = (24 * Math.PI) / 180;
  /** Vuelo libre: posición y orientación (guiñada/cabeceo de la mirada). */
  freePos: Vec3 = [0, -26, 8];
  yaw = Math.PI / 2;
  pitch = -0.3;
  fovY = (50 * Math.PI) / 180;
  settings: NavSettings = { ...DEFAULT_NAV };
  limits: CameraLimits = { minRadius: () => 2.2, maxRadius: 2e4 };
  /** Velocidades para la inercia. */
  private vAz = 0;
  private vEl = 0;
  private vZoom = 0;
  private vPan: Vec3 = [0, 0, 0];
  /** Movimiento continuo por teclado (adelante, derecha, arriba) en [−1, 1]. */
  keyMove: Vec3 = [0, 0, 0];
  boost = false;
  /** Transición suave hacia una pose objetivo (enfocar / restablecer). */
  private tween: { from: Snapshot; to: Snapshot; t: number; dur: number } | null = null;
  /** Deriva lenta automática (movimiento inicial discreto); se anula al interactuar. */
  autoOrbit = 0;
  /** Contador de cambios de pose (para reiniciar la acumulación). */
  version = 0;

  snapshot(): Snapshot {
    return { target: [...this.target], distance: this.distance, azimuth: this.azimuth, elevation: this.elevation, fovY: this.fovY };
  }

  pose(): Pose {
    if (this.mode === 'free') {
      const fwd: Vec3 = [Math.cos(this.pitch) * Math.cos(this.yaw), Math.cos(this.pitch) * Math.sin(this.yaw), Math.sin(this.pitch)];
      const right = normalize(cross(fwd, [0, 0, 1]));
      const up = normalize(cross(right, fwd));
      return { pos: [...this.freePos], fwd, up };
    }
    const ce = Math.cos(this.elevation);
    const dir: Vec3 = [ce * Math.cos(this.azimuth), ce * Math.sin(this.azimuth), Math.sin(this.elevation)];
    const pos = add(this.target, scale(dir, this.distance));
    const fwd = scale(dir, -1);
    const right = normalize(cross(fwd, [0, 0, 1]));
    const up = normalize(cross(right, fwd));
    return { pos, fwd, up };
  }

  private bump(): void {
    this.version++;
  }

  rotate(dx: number, dy: number): void {
    this.autoOrbit = 0;
    this.tween = null;
    const k = 0.005 * this.settings.rotateSensitivity;
    if (this.mode === 'free') {
      this.yaw -= dx * k;
      this.pitch = clamp(this.pitch - dy * k, -1.5, 1.5);
    } else if (this.settings.inertia) {
      this.vAz += -dx * k * 12;
      this.vEl += dy * k * 12;
    } else {
      this.azimuth -= dx * k;
      this.elevation = clamp(this.elevation + dy * k, -1.53, 1.53);
    }
    this.bump();
  }

  pan(dx: number, dy: number): void {
    if (this.mode === 'free') return;
    this.autoOrbit = 0;
    this.tween = null;
    const p = this.pose();
    const right = normalize(cross(p.fwd, p.up));
    const k = 0.0015 * this.distance * this.settings.rotateSensitivity;
    const delta = add(scale(right, -dx * k), scale(p.up, dy * k));
    if (this.settings.inertia) this.vPan = add(this.vPan, scale(delta, 10));
    else this.target = add(this.target, delta);
    if (this.mode === 'follow') this.mode = 'orbit';
    this.bump();
  }

  zoom(delta: number): void {
    this.autoOrbit = 0;
    this.tween = null;
    const k = 0.0012 * this.settings.zoomSensitivity;
    if (this.mode === 'free') {
      this.fovY = clamp(this.fovY * Math.exp(delta * k), (2 * Math.PI) / 180, (120 * Math.PI) / 180);
    } else if (this.settings.inertia) {
      this.vZoom += delta * k * 10;
    } else {
      this.distance *= Math.exp(delta * k);
    }
    this.bump();
  }

  /** Zoom óptico (campo de visión), independiente de la distancia. */
  zoomFov(delta: number): void {
    this.fovY = clamp(this.fovY * Math.exp(delta * 0.001), (1 * Math.PI) / 180, (120 * Math.PI) / 180);
    this.bump();
  }

  setMode(mode: NavMode): void {
    if (mode === this.mode) return;
    const p = this.pose();
    if (mode === 'free') {
      this.freePos = p.pos;
      this.yaw = Math.atan2(p.fwd[1], p.fwd[0]);
      this.pitch = Math.asin(clamp(p.fwd[2], -1, 1));
    } else if (this.mode === 'free') {
      // Volver a órbita alrededor del origen desde la posición actual
      this.target = [0, 0, 0];
      const r = norm(p.pos);
      this.distance = r;
      this.azimuth = Math.atan2(p.pos[1], p.pos[0]);
      this.elevation = Math.asin(clamp(p.pos[2] / r, -1, 1));
    }
    this.mode = mode;
    this.bump();
  }

  /** Transición suave hacia otra pose de órbita. */
  animateTo(to: Partial<Snapshot>, dur = 1.6): void {
    if (this.mode === 'free') this.setMode('orbit');
    const from = this.snapshot();
    const target: Snapshot = { ...from, ...to } as Snapshot;
    // Camino angular más corto
    let dAz = target.azimuth - from.azimuth;
    while (dAz > Math.PI) dAz -= 2 * Math.PI;
    while (dAz < -Math.PI) dAz += 2 * Math.PI;
    target.azimuth = from.azimuth + dAz;
    this.tween = { from, to: target, t: 0, dur };
    this.vAz = this.vEl = this.vZoom = 0;
    this.vPan = [0, 0, 0];
  }

  /** Enfoque automático sobre el agujero negro. */
  focusBlackHole(): void {
    this.mode = 'orbit';
    this.animateTo({ target: [0, 0, 0] });
  }

  update(dt: number, followTarget: Vec3 | null): void {
    let changed = false;
    if (this.tween) {
      const tw = this.tween;
      tw.t += dt / tw.dur;
      const s = tw.t >= 1 ? 1 : easeInOut(tw.t);
      this.target = add(tw.from.target, scale(sub(tw.to.target, tw.from.target), s));
      this.distance = Math.exp(Math.log(tw.from.distance) + (Math.log(tw.to.distance) - Math.log(tw.from.distance)) * s);
      this.azimuth = tw.from.azimuth + (tw.to.azimuth - tw.from.azimuth) * s;
      this.elevation = tw.from.elevation + (tw.to.elevation - tw.from.elevation) * s;
      this.fovY = tw.from.fovY + (tw.to.fovY - tw.from.fovY) * s;
      if (tw.t >= 1) this.tween = null;
      changed = true;
    }
    if (this.mode === 'follow' && followTarget) {
      const k = 1 - Math.exp(-dt * 6);
      const d = sub(followTarget, this.target);
      if (norm(d) > 1e-9) {
        this.target = add(this.target, scale(d, k));
        changed = true;
      }
    }
    if (this.mode !== 'free') {
      const damp = Math.exp(-dt * 7);
      if (Math.abs(this.vAz) + Math.abs(this.vEl) > 1e-6) {
        this.azimuth += this.vAz * dt;
        this.elevation = clamp(this.elevation + this.vEl * dt, -1.53, 1.53);
        this.vAz *= damp;
        this.vEl *= damp;
        changed = true;
      }
      if (Math.abs(this.vZoom) > 1e-6) {
        this.distance *= Math.exp(this.vZoom * dt);
        this.vZoom *= damp;
        changed = true;
      }
      if (norm(this.vPan) > 1e-9) {
        this.target = add(this.target, scale(this.vPan, dt));
        this.vPan = scale(this.vPan, damp);
        changed = true;
      }
      if (this.autoOrbit !== 0 && !this.tween) {
        this.azimuth += this.autoOrbit * dt;
        changed = true;
      }
    } else {
      const km = this.keyMove;
      if (km[0] !== 0 || km[1] !== 0 || km[2] !== 0) {
        const p = this.pose();
        const right = normalize(cross(p.fwd, p.up));
        const r = norm(p.pos);
        const speed = this.settings.moveSpeed * Math.max(0.3, 0.6 * r) * (this.boost ? 4 : 1);
        const v = add(add(scale(p.fwd, km[0]), scale(right, km[1])), scale(p.up, km[2]));
        this.freePos = add(this.freePos, scale(v, speed * dt));
        changed = true;
      }
    }
    if (this.mode !== 'free' && (this.keyMove[0] !== 0 || this.keyMove[1] !== 0)) {
      // En órbita, W/S acercan y alejan; A/D giran
      this.distance *= Math.exp(-this.keyMove[0] * dt * (this.boost ? 2.4 : 0.8) * this.settings.moveSpeed);
      this.azimuth += this.keyMove[1] * dt * (this.boost ? 1.5 : 0.5) * this.settings.moveSpeed;
      changed = true;
    }
    if (this.enforceLimits()) changed = true;
    if (changed) this.bump();
  }

  /** Impide entrar en regiones donde el observador elegido no puede existir. */
  private enforceLimits(): boolean {
    const p = this.pose();
    const r = norm(p.pos);
    const dir = normalize(p.pos);
    const rmin = this.limits.minRadius(dir);
    const rmax = this.limits.maxRadius;
    let target = r;
    if (r < rmin) target = rmin;
    if (r > rmax) target = rmax;
    if (target === r) return false;
    if (this.mode === 'free') {
      this.freePos = scale(dir, target);
    } else {
      // Escalar la distancia al objetivo para que la cámara quede en el radio permitido
      const off = sub(p.pos, this.target);
      const dOff = norm(off);
      const u = normalize(off);
      // |T + s u| = target → s² + 2 s (T·u) + |T|² − target² = 0
      const tu = dot(this.target, u);
      const disc = tu * tu - (dot(this.target, this.target) - target * target);
      const s = disc > 0 ? -tu + Math.sqrt(disc) : dOff * (target / Math.max(r, 1e-9));
      this.distance = Math.max(s, 0.05);
      this.vZoom = 0;
    }
    return true;
  }

  reset(): void {
    this.mode = 'orbit';
    this.animateTo({ target: [0, 0, 0], distance: 26, azimuth: -Math.PI / 2, elevation: (24 * Math.PI) / 180, fovY: (50 * Math.PI) / 180 });
  }
}

export interface Snapshot {
  target: Vec3;
  distance: number;
  azimuth: number;
  elevation: number;
  fovY: number;
}

function clamp(x: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, x));
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
