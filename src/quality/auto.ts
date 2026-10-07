/**
 * Calidad automática basada en tiempos de fotograma medidos (no en el user agent).
 *
 * Solo se alimenta con intervalos entre fotogramas renderizados de forma continua
 * (interacción, transición, amortiguación). Ventana deslizante, mediana y p95,
 * enfriamiento entre cambios y bloqueo anti-oscilación: si un perfil se abandona
 * por lento dos veces, no se vuelve a subir a él en la sesión.
 */
export type ProfileId = 'baja' | 'media' | 'alta';
export const PROFILE_ORDER: ProfileId[] = ['baja', 'media', 'alta'];

export interface FrameStats {
  median: number;
  p95: number;
  count: number;
}

export function frameStats(samples: number[]): FrameStats {
  if (!samples.length) return { median: 0, p95: 0, count: 0 };
  const s = [...samples].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  return { median: q(0.5), p95: q(0.95), count: s.length };
}

export class AutoQuality {
  private samples: number[] = [];
  private lastChange = -Infinity;
  private downgradesFrom = new Map<ProfileId, number>();
  private lastDowngradeAt = new Map<ProfileId, number>();

  constructor(
    public profile: ProfileId,
    private readonly window = 90,
    private readonly cooldownMs = 4000,
  ) {}

  reset(profile: ProfileId, now: number): void {
    this.profile = profile;
    this.samples = [];
    this.lastChange = now;
  }

  /** Devuelve el nuevo perfil si decide cambiar, o null. */
  addFrame(intervalMs: number, now: number): ProfileId | null {
    if (!(intervalMs > 0) || intervalMs > 500) return null; // pausas, pestaña oculta
    this.samples.push(intervalMs);
    if (this.samples.length > this.window) this.samples.shift();
    if (this.samples.length < this.window || now - this.lastChange < this.cooldownMs) return null;
    const { median, p95 } = frameStats(this.samples);
    const idx = PROFILE_ORDER.indexOf(this.profile);
    const target = this.profile === 'alta' ? 1000 / 60 : 1000 / 30;
    if (median > target * 1.35 && idx > 0) {
      this.downgradesFrom.set(this.profile, (this.downgradesFrom.get(this.profile) ?? 0) + 1);
      this.lastDowngradeAt.set(this.profile, now);
      return this.switchTo(PROFILE_ORDER[idx - 1], now);
    }
    if (idx < PROFILE_ORDER.length - 1) {
      const next = PROFILE_ORDER[idx + 1];
      const blocked = (this.downgradesFrom.get(next) ?? 0) >= 2 || now - (this.lastDowngradeAt.get(next) ?? -Infinity) < 30000;
      // subir exige margen claro: ≥ 50 fps hacia "media", a ritmo de vsync hacia "alta"
      const ok = next === 'media' ? median < 20 : median < 17.8 && p95 < 24;
      if (ok && !blocked && now - this.lastChange > this.cooldownMs * 2) return this.switchTo(next, now);
    }
    return null;
  }

  private switchTo(p: ProfileId, now: number): ProfileId {
    this.profile = p;
    this.samples = [];
    this.lastChange = now;
    return p;
  }
}
