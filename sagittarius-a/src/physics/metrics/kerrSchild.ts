/**
 * Métrica de Kerr en coordenadas cartesianas de Kerr–Schild entrantes (G = c = M = 1).
 *
 *   g_μν = η_μν + f l_μ l_ν,        g^μν = η^μν − f l^μ l^ν,     η = diag(−1, 1, 1, 1)
 *   f = 2 r³ / (r⁴ + a² z²)
 *   l_μ = (1, (r x + a y)/(r² + a²), (r y − a x)/(r² + a²), z/r),   l^μ = (−1, l_x, l_y, l_z)
 *   x² + y² + z² = r² + a² (1 − z²/r²)  (define r implícitamente)
 *
 * Relación con Boyer–Lindquist: x + i y = (r + i a) e^{iφ̃} sinθ, z = r cosθ,
 * dt = dt_BL + (2r/Δ) dr, dφ̃ = dφ_BL + (a/Δ) dr. Estas coordenadas son regulares en el
 * horizonte futuro r = r₊: las geodésicas que caen lo atraviesan sin singularidades de
 * coordenadas (Visser 2007, «The Kerr spacetime: a brief introduction», §4).
 *
 * El hamiltoniano de las geodésicas H = ½ g^μν p_μ p_ν da
 *   dx^μ/dλ = η^μν p_ν − f L l^μ,      L ≡ l^μ p_μ = −p_t + l_i p_i
 *   dp_t/dλ = 0,   dp_i/dλ = L [½ (∂_i f) L + f (∂_i l_j) p_j]
 */

/** Geometría local de Kerr–Schild y sus primeras derivadas espaciales. */
export interface KSGeometry {
  r: number;
  f: number;
  /** l_x, l_y, l_z (covariantes; l_t = 1). */
  l: Float64Array; // 3
  /** ∂_i r. */
  dr: Float64Array; // 3
  /** ∂_i f. */
  df: Float64Array; // 3
  /** ∂_i l_j en dl[3 i + j]. */
  dl: Float64Array; // 9
}

export function createKSGeometry(): KSGeometry {
  return {
    r: 0,
    f: 0,
    l: new Float64Array(3),
    dr: new Float64Array(3),
    df: new Float64Array(3),
    dl: new Float64Array(9),
  };
}

/** Radio de Kerr–Schild r(x, y, z) ≥ 0, forma numéricamente estable en ambos signos de ρ² − a². */
export function ksRadius(x: number, y: number, z: number, a: number): number {
  const rho2 = x * x + y * y + z * z;
  const b = rho2 - a * a;
  const disc = Math.sqrt(b * b + 4 * a * a * z * z);
  const r2 = b >= 0 ? 0.5 * (b + disc) : (2 * a * a * z * z) / (disc - b);
  return Math.sqrt(Math.max(r2, 0));
}

export class KerrSchild {
  readonly a: number;
  private readonly geo = createKSGeometry();

  constructor(a: number) {
    if (!(a >= 0 && a < 1)) throw new RangeError(`espín fuera de rango [0, 1): ${a}`);
    this.a = a;
  }

  /** Calcula r, f, l y sus derivadas espaciales en (x, y, z). */
  geometry(x: number, y: number, z: number, out: KSGeometry = this.geo): KSGeometry {
    const a = this.a;
    const r = ksRadius(x, y, z, a);
    const r2 = r * r;
    const a2 = a * a;
    const z2 = z * z;
    const D = r2 * r2 + a2 * z2; // r⁴ + a² z²
    const S = r2 + a2; // r² + a²
    out.r = r;
    out.f = (2 * r2 * r) / D;
    const lx = (r * x + a * y) / S;
    const ly = (r * y - a * x) / S;
    const lz = z / r;
    out.l[0] = lx;
    out.l[1] = ly;
    out.l[2] = lz;
    // ∂_i r
    const r3D = (r2 * r) / D;
    const drx = r3D * x;
    const dry = r3D * y;
    const drz = (r * S * z) / D;
    out.dr[0] = drx;
    out.dr[1] = dry;
    out.dr[2] = drz;
    // ∂_i f = 2 r² [ r_i (3 a² z² − r⁴) − 2 a² r z δ_iz ] / D²
    const pref = (2 * r2) / (D * D);
    const c1 = 3 * a2 * z2 - r2 * r2;
    out.df[0] = pref * drx * c1;
    out.df[1] = pref * dry * c1;
    out.df[2] = pref * (drz * c1 - 2 * a2 * r * z);
    // ∂_i l_x = [(r_i x + r δ_ix + a δ_iy) S − (r x + a y) 2 r r_i] / S²
    // ∂_i l_y = [(r_i y + r δ_iy − a δ_ix) S − (r y − a x) 2 r r_i] / S²
    // ∂_i l_z = (r δ_iz − z r_i) / r²
    const S2 = S * S;
    const nx = r * x + a * y;
    const ny = r * y - a * x;
    const drs = [drx, dry, drz];
    for (let i = 0; i < 3; i++) {
      const ri = drs[i];
      const dix = i === 0 ? 1 : 0;
      const diy = i === 1 ? 1 : 0;
      const diz = i === 2 ? 1 : 0;
      out.dl[3 * i + 0] = ((ri * x + r * dix + a * diy) * S - nx * 2 * r * ri) / S2;
      out.dl[3 * i + 1] = ((ri * y + r * diy - a * dix) * S - ny * 2 * r * ri) / S2;
      out.dl[3 * i + 2] = (r * diz - z * ri) / r2;
    }
    return out;
  }

  /** g_μν en (x, y, z) como matriz 4×4 por filas. */
  metric(x: number, y: number, z: number, out = new Float64Array(16)): Float64Array {
    const g = this.geometry(x, y, z);
    const L = [1, g.l[0], g.l[1], g.l[2]];
    for (let m = 0; m < 4; m++) {
      for (let n = 0; n < 4; n++) {
        const eta = m === n ? (m === 0 ? -1 : 1) : 0;
        out[4 * m + n] = eta + g.f * L[m] * L[n];
      }
    }
    return out;
  }

  /** g^μν en (x, y, z) como matriz 4×4 por filas. */
  inverseMetric(x: number, y: number, z: number, out = new Float64Array(16)): Float64Array {
    const g = this.geometry(x, y, z);
    const L = [-1, g.l[0], g.l[1], g.l[2]];
    for (let m = 0; m < 4; m++) {
      for (let n = 0; n < 4; n++) {
        const eta = m === n ? (m === 0 ? -1 : 1) : 0;
        out[4 * m + n] = eta - g.f * L[m] * L[n];
      }
    }
    return out;
  }

  /**
   * Ecuaciones de Hamilton para y = [t, x, y, z, p_t, p_x, p_y, p_z] con parámetro afín λ.
   * Para partículas masivas normalizadas con g^μν p_μ p_ν = −1, λ es el tiempo propio.
   */
  hamiltonianRHS(y: ArrayLike<number>, dy: Float64Array): void {
    const g = this.geometry(y[1], y[2], y[3]);
    const pt = y[4];
    const px = y[5];
    const py = y[6];
    const pz = y[7];
    const lx = g.l[0];
    const ly = g.l[1];
    const lz = g.l[2];
    const f = g.f;
    const L = -pt + lx * px + ly * py + lz * pz;
    const fL = f * L;
    dy[0] = -pt + fL; // η^tt p_t − f L l^t,  l^t = −1
    dy[1] = px - fL * lx;
    dy[2] = py - fL * ly;
    dy[3] = pz - fL * lz;
    dy[4] = 0;
    const dl = g.dl;
    for (let i = 0; i < 3; i++) {
      const dlp = dl[3 * i] * px + dl[3 * i + 1] * py + dl[3 * i + 2] * pz;
      dy[5 + i] = L * (0.5 * g.df[i] * L + f * dlp);
    }
  }

  /** H = ½ g^μν p_μ p_ν en el estado y (−½ para masivas normalizadas, 0 para fotones). */
  hamiltonian(y: ArrayLike<number>): number {
    const g = this.geometry(y[1], y[2], y[3]);
    const pt = y[4];
    const px = y[5];
    const py = y[6];
    const pz = y[7];
    const L = -pt + g.l[0] * px + g.l[1] * py + g.l[2] * pz;
    return 0.5 * (-pt * pt + px * px + py * py + pz * pz - g.f * L * L);
  }

  /** Producto escalar g(u, v) de vectores contravariantes en (x, y, z). */
  dot(x: number, y: number, z: number, u: ArrayLike<number>, v: ArrayLike<number>): number {
    const g = this.geometry(x, y, z);
    const lu = u[0] + g.l[0] * u[1] + g.l[1] * u[2] + g.l[2] * u[3];
    const lv = v[0] + g.l[0] * v[1] + g.l[1] * v[2] + g.l[2] * v[3];
    return -u[0] * v[0] + u[1] * v[1] + u[2] * v[2] + u[3] * v[3] + g.f * lu * lv;
  }

  /** Baja el índice: v_μ = g_μν v^ν. */
  lower(x: number, y: number, z: number, v: ArrayLike<number>, out = new Float64Array(4)): Float64Array {
    const g = this.geometry(x, y, z);
    const lv = v[0] + g.l[0] * v[1] + g.l[1] * v[2] + g.l[2] * v[3];
    const fl = g.f * lv;
    out[0] = -v[0] + fl;
    out[1] = v[1] + fl * g.l[0];
    out[2] = v[2] + fl * g.l[1];
    out[3] = v[3] + fl * g.l[2];
    return out;
  }

  /** Sube el índice: v^μ = g^μν v_ν. */
  raise(x: number, y: number, z: number, w: ArrayLike<number>, out = new Float64Array(4)): Float64Array {
    const g = this.geometry(x, y, z);
    const lw = -w[0] + g.l[0] * w[1] + g.l[1] * w[2] + g.l[2] * w[3];
    const fl = g.f * lw;
    out[0] = -w[0] + fl; // l^t = −1
    out[1] = w[1] - fl * g.l[0];
    out[2] = w[2] - fl * g.l[1];
    out[3] = w[3] - fl * g.l[2];
    return out;
  }

  /**
   * Símbolos de Christoffel Γ^μ_αβ en out[16 μ + 4 α + β], a partir de
   * ∂_α g_μν = (∂_α f) l_μ l_ν + f (∂_α l_μ) l_ν + f l_μ (∂_α l_ν)   (∂_t ≡ 0).
   */
  christoffel(x: number, y: number, z: number, out = new Float64Array(64)): Float64Array {
    const g = this.geometry(x, y, z);
    const f = g.f;
    const L = [1, g.l[0], g.l[1], g.l[2]];
    // dg[α][μ][ν] → dg[16 α + 4 μ + ν]
    const dg = new Float64Array(64);
    for (let al = 1; al < 4; al++) {
      const i = al - 1;
      const dfi = g.df[i];
      const dL = [0, g.dl[3 * i], g.dl[3 * i + 1], g.dl[3 * i + 2]];
      for (let m = 0; m < 4; m++) {
        for (let n = 0; n < 4; n++) {
          dg[16 * al + 4 * m + n] = dfi * L[m] * L[n] + f * (dL[m] * L[n] + L[m] * dL[n]);
        }
      }
    }
    // Γ_{ν α β} = ½(∂_α g_νβ + ∂_β g_να − ∂_ν g_αβ)
    const low = new Float64Array(64);
    for (let n = 0; n < 4; n++) {
      for (let al = 0; al < 4; al++) {
        for (let be = al; be < 4; be++) {
          const v = 0.5 * (dg[16 * al + 4 * n + be] + dg[16 * be + 4 * n + al] - dg[16 * n + 4 * al + be]);
          low[16 * n + 4 * al + be] = v;
          low[16 * n + 4 * be + al] = v;
        }
      }
    }
    // Γ^μ_αβ = g^μν Γ_ναβ
    const Lu = [-1, g.l[0], g.l[1], g.l[2]];
    for (let m = 0; m < 4; m++) {
      for (let al = 0; al < 4; al++) {
        for (let be = al; be < 4; be++) {
          let s = 0;
          for (let n = 0; n < 4; n++) {
            const eta = m === n ? (m === 0 ? -1 : 1) : 0;
            s += (eta - f * Lu[m] * Lu[n]) * low[16 * n + 4 * al + be];
          }
          out[16 * m + 4 * al + be] = s;
          out[16 * m + 4 * be + al] = s;
        }
      }
    }
    return out;
  }
}
