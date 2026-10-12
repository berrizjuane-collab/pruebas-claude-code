/**
 * Cámara relativista: construye el marco local (tétrada) del observador que mira.
 *
 * Dada una posición y una dirección de mirada «coordenada» (de la navegación), y una familia de
 * observadores (estático, ZAMO, órbita circular, caída libre), se obtiene u y, por Gram–Schmidt
 * con la métrica, la tétrada (e₀ = u, e₁ = derecha, e₂ = arriba, e₃ = adelante). Las direcciones
 * de los píxeles se definen en ese marco: la aberración, el Doppler del cielo y el arrastre de
 * marcos aparecen solos al trazar los rayos.
 *
 * Caída libre (dive): la cámara sigue una geodésica temporal integrada con Dormand–Prince; puede
 * cruzar el horizonte y nunca puede volver a salir por movimiento físico. Solo un «reinicio»
 * (operación de software) la devuelve a una posición anterior.
 */
import { KerrSchild } from '../physics/metrics/kerrSchild';
import { ergosphereRadius, horizons, keplerOmega, photonOrbitRadius } from '../physics/metrics/kerr';
import { circularObserver, gramSchmidtTetrad, rainObserver, staticObserver, zamoObserver, type Vec4 } from '../physics/observers/observers';
import { GeodesicIntegrator, type GeodesicEvent } from '../physics/geodesics/geodesic';
import type { Pose, Vec3 } from './CameraController';

export type CameraObserver = 'static' | 'zamo' | 'circular' | 'rain';

export interface CameraFrame {
  t: number;
  pos: Vec3;
  u: Vec4;
  e: [Vec4, Vec4, Vec4, Vec4];
  observer: CameraObserver | 'dive' | 'comoving';
  /** Aviso si el observador pedido no existe en ese punto y se usó otro. */
  note: string | null;
  r: number;
  inside: boolean;
}

export interface DiveState {
  gi: GeodesicIntegrator;
  tau: number;
  horizon: GeodesicEvent | null;
  ended: GeodesicEvent | null;
  startPose: Pose;
  startT: number;
  /** t coordenado del instante actual de la cámara (λ = τ). */
  tNow: number;
}

export class RelativisticCamera {
  ks: KerrSchild;
  observer: CameraObserver = 'zamo';
  dive: DiveState | null = null;
  private readonly buf = new Float64Array(8);

  constructor(a: number) {
    this.ks = new KerrSchild(a);
  }

  setSpin(a: number): void {
    this.ks = new KerrSchild(a);
    this.dive = null;
  }

  /** |P| mínimo (euclídeo en KS) admisible para el observador elegido en la dirección dir. */
  minRadius(dir: Vec3): number {
    const a = this.ks.a;
    const ct = Math.max(-1, Math.min(1, dir[2]));
    const th = Math.acos(ct);
    const { rPlus } = horizons(a);
    let r: number;
    switch (this.observer) {
      case 'static':
        r = ergosphereRadius(a, th) * 1.03 + 0.05;
        break;
      case 'circular':
        r = photonOrbitRadius(a, true) * 1.15 + 0.1;
        break;
      default:
        r = rPlus * 1.08 + 0.05;
    }
    const st2 = 1 - ct * ct;
    return Math.sqrt(r * r + a * a * st2);
  }

  /** 4-velocidad del observador elegido en pos; si no existe, ZAMO o lluvia como respaldo. */
  observerVelocity(pos: Vec3): { u: Vec4; used: CameraObserver; note: string | null } {
    const ks = this.ks;
    const [x, y, z] = pos;
    let u: Vec4 | null = null;
    let note: string | null = null;
    switch (this.observer) {
      case 'static':
        u = staticObserver(ks, x, y, z);
        if (!u) note = 'Dentro de la ergosfera no existe observador estático: se usa un ZAMO.';
        break;
      case 'zamo':
        u = zamoObserver(ks, x, y, z);
        break;
      case 'circular': {
        const r = ks.geometry(x, y, z).r;
        u = circularObserver(ks, x, y, z, keplerOmega(r, ks.a, true));
        if (!u) note = 'Ahí una órbita con Ω kepleriana no es temporal: se usa un ZAMO.';
        else if (Math.abs(z) > 1e-3 * r) note = 'Fuera del plano ecuatorial la rotación con Ω kepleriana no es geodésica (requiere empuje).';
        break;
      }
      case 'rain':
        u = rainObserver(ks, x, y, z);
        break;
    }
    if (u) return { u, used: this.observer, note };
    const z2 = zamoObserver(ks, x, y, z);
    if (z2) return { u: z2, used: 'zamo', note: note ?? 'Observador no disponible aquí: se usa un ZAMO.' };
    return { u: rainObserver(ks, x, y, z), used: 'rain', note: 'Dentro del horizonte solo existen observadores en caída: se usa la «lluvia».' };
  }

  /** Tétrada a partir de u y de las direcciones coordenadas de la navegación. */
  tetradFor(pos: Vec3, u: Vec4, fwd: Vec3, up: Vec3): [Vec4, Vec4, Vec4, Vec4] {
    const right: Vec3 = [fwd[1] * up[2] - fwd[2] * up[1], fwd[2] * up[0] - fwd[0] * up[2], fwd[0] * up[1] - fwd[1] * up[0]];
    const tet = gramSchmidtTetrad(this.ks, pos[0], pos[1], pos[2], u, [
      [0, fwd[0], fwd[1], fwd[2]],
      [0, up[0], up[1], up[2]],
      [0, right[0], right[1], right[2]],
    ]);
    return [tet.e[0], tet.e[3], tet.e[2], tet.e[1]];
  }

  frame(pose: Pose, t: number): CameraFrame {
    if (this.dive) return this.diveFrame(pose);
    const { u, used, note } = this.observerVelocity(pose.pos);
    const e = this.tetradFor(pose.pos, u, pose.fwd, pose.up);
    const r = this.ks.geometry(pose.pos[0], pose.pos[1], pose.pos[2]).r;
    return { t, pos: [...pose.pos], u, e, observer: used, note, r, inside: r < horizons(this.ks.a).rPlus };
  }

  /** Inicia una caída libre desde el reposo respecto del observador actual. */
  startDive(pose: Pose, t: number): void {
    const { u } = this.observerVelocity(pose.pos);
    const p = this.ks.lower(pose.pos[0], pose.pos[1], pose.pos[2], u);
    const gi = new GeodesicIntegrator(this.ks, 'massive', { rtol: 1e-10, atol: 1e-12 });
    gi.reset(t, pose.pos, p);
    this.dive = { gi, tau: 0, horizon: null, ended: null, startPose: { pos: [...pose.pos], fwd: [...pose.fwd], up: [...pose.up] }, startT: t, tNow: t };
  }

  /** Avanza la caída en tiempo propio dτ; devuelve el nuevo t coordenado. */
  stepDive(dTau: number): number {
    const d = this.dive!;
    if (d.ended) return d.gi.t;
    const target = d.tau + dTau;
    const gi = d.gi;
    while (!gi.terminated && gi.y[7] < target) {
      for (const ev of gi.step()) {
        if (ev.kind === 'horizon') d.horizon = ev;
      }
    }
    if (gi.terminated) {
      d.ended = gi.terminated;
      d.tau = gi.terminated.lambda;
      d.tNow = gi.terminated.t;
      return d.tNow;
    }
    // Interpolar en el último paso el instante con λ = target
    let lo = gi.solver.tPrev;
    let hi = gi.t;
    for (let k = 0; k < 40; k++) {
      const mid = 0.5 * (lo + hi);
      if (gi.denseAt(mid, this.buf)[7] < target) lo = mid;
      else hi = mid;
    }
    d.tau = target;
    d.tNow = 0.5 * (lo + hi);
    return d.tNow;
  }

  diveState(t: number): { pos: Vec3; u: Vec4 } {
    const d = this.dive!;
    const gi = d.gi;
    const y = d.ended ? d.ended.state : t >= gi.solver.tPrev && t <= gi.t ? gi.denseAt(t, this.buf) : gi.y;
    const pos: Vec3 = [y[0], y[1], y[2]];
    const u = this.ks.raise(pos[0], pos[1], pos[2], [y[3], y[4], y[5], y[6]]);
    return { pos, u };
  }

  private diveFrame(pose: Pose): CameraFrame {
    const d = this.dive!;
    const t = d.ended ? d.ended.t : d.tNow;
    const { pos, u } = this.diveState(t);
    const e = this.tetradFor(pos, u, pose.fwd, pose.up);
    const r = this.ks.geometry(pos[0], pos[1], pos[2]).r;
    return { t, pos, u, e, observer: 'dive', note: null, r, inside: r < horizons(this.ks.a).rPlus };
  }

  endDive(): Pose | null {
    const start = this.dive?.startPose ?? null;
    this.dive = null;
    return start;
  }
}

export function staticAvailable(ks: KerrSchild, pos: Vec3): boolean {
  return !!staticObserver(ks, pos[0], pos[1], pos[2]);
}
