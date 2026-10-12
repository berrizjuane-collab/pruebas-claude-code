/**
 * Tensor de Riemann numérico en Kerr–Schild y tensor de marea de un observador.
 *
 *   R^ρ_σμν = ∂_μ Γ^ρ_νσ − ∂_ν Γ^ρ_μσ + Γ^ρ_μλ Γ^λ_νσ − Γ^ρ_νλ Γ^λ_μσ      (convención MTW)
 *
 * Las Γ se evalúan analíticamente (KerrSchild.christoffel) y sus derivadas espaciales por
 * diferencias centradas con extrapolación de Richardson (error O(h⁴)); ∂_t Γ = 0 (estacionaria).
 * Se valida contra el escalar de Kretschmann analítico de Kerr (también dentro del horizonte).
 *
 * Desviación geodésica en el marco ortonormal (u, e₁, e₂, e₃) de un observador en caída libre:
 *   d²ξⁱ/dτ² = −Eⁱ_j ξʲ,   E_ij = R_{μνρσ} e_iᵘ uᵛ e_jᵖ uˢ   (parte eléctrica)
 * En Schwarzschild, para observadores radiales: E = diag(−2M/r³, M/r³, M/r³) en (r, θ, φ):
 * estiramiento radial y compresión transversal («espaguetificación»).
 */
import { KerrSchild } from '../metrics/kerrSchild';

/** Riemann R^ρ_σμν en out[64 ρ + 16 σ + 4 μ + ν]. */
export function riemannTensor(ks: KerrSchild, x: number, y: number, z: number, out = new Float64Array(256)): Float64Array {
  const r = ks.geometry(x, y, z).r;
  const h = 1e-3 * Math.max(0.05, Math.min(r, 10));
  const G0 = ks.christoffel(x, y, z, new Float64Array(64));
  // dG[μ][ρνσ] = ∂_μ Γ^ρ_νσ
  const dG: Float64Array[] = [new Float64Array(64)];
  const p = [x, y, z];
  for (let i = 0; i < 3; i++) {
    const at = (s: number) => {
      const q = [...p];
      q[i] += s;
      return ks.christoffel(q[0], q[1], q[2], new Float64Array(64));
    };
    const p1 = at(h);
    const m1 = at(-h);
    const p2 = at(2 * h);
    const m2 = at(-2 * h);
    const d = new Float64Array(64);
    for (let k = 0; k < 64; k++) {
      // Richardson: (8(f₁ − f₋₁) − (f₂ − f₋₂)) / (12 h)
      d[k] = (8 * (p1[k] - m1[k]) - (p2[k] - m2[k])) / (12 * h);
    }
    dG.push(d);
  }
  for (let rho = 0; rho < 4; rho++)
    for (let sig = 0; sig < 4; sig++)
      for (let mu = 0; mu < 4; mu++)
        for (let nu = 0; nu < 4; nu++) {
          let v = dG[mu][16 * rho + 4 * nu + sig] - dG[nu][16 * rho + 4 * mu + sig];
          for (let lam = 0; lam < 4; lam++) {
            v += G0[16 * rho + 4 * mu + lam] * G0[16 * lam + 4 * nu + sig] - G0[16 * rho + 4 * nu + lam] * G0[16 * lam + 4 * mu + sig];
          }
          out[64 * rho + 16 * sig + 4 * mu + nu] = v;
        }
  return out;
}

/** Baja el primer índice: R_ρσμν = g_ρα R^α_σμν. */
export function lowerRiemann(ks: KerrSchild, x: number, y: number, z: number, R: Float64Array): Float64Array {
  const g = ks.metric(x, y, z);
  const out = new Float64Array(256);
  for (let rho = 0; rho < 4; rho++)
    for (let k = 0; k < 64; k++) {
      let v = 0;
      for (let al = 0; al < 4; al++) v += g[4 * rho + al] * R[64 * al + k];
      out[64 * rho + k] = v;
    }
  return out;
}

/** Escalar de Kretschmann K = R_abcd R^abcd a partir del Riemann numérico. */
export function kretschmannNumeric(ks: KerrSchild, x: number, y: number, z: number): number {
  const Rup = riemannTensor(ks, x, y, z);
  const Rlow = lowerRiemann(ks, x, y, z, Rup);
  const gi = ks.inverseMetric(x, y, z);
  // R^a_bcd con índices b, c, d subidos: R^{abcd} = g^{bβ} g^{cγ} g^{dδ} R^a_βγδ
  let K = 0;
  const T1 = new Float64Array(256); // R^a_b^c_d … se sube paso a paso
  for (let a = 0; a < 4; a++)
    for (let b = 0; b < 4; b++)
      for (let c = 0; c < 4; c++)
        for (let d = 0; d < 4; d++) {
          let v = 0;
          for (let be = 0; be < 4; be++) v += gi[4 * b + be] * Rup[64 * a + 16 * be + 4 * c + d];
          T1[64 * a + 16 * b + 4 * c + d] = v;
        }
  const T2 = new Float64Array(256);
  for (let a = 0; a < 4; a++)
    for (let b = 0; b < 4; b++)
      for (let c = 0; c < 4; c++)
        for (let d = 0; d < 4; d++) {
          let v = 0;
          for (let ga = 0; ga < 4; ga++) v += gi[4 * c + ga] * T1[64 * a + 16 * b + 4 * ga + d];
          T2[64 * a + 16 * b + 4 * c + d] = v;
        }
  for (let a = 0; a < 4; a++)
    for (let b = 0; b < 4; b++)
      for (let c = 0; c < 4; c++)
        for (let d = 0; d < 4; d++) {
          let v = 0;
          for (let de = 0; de < 4; de++) v += gi[4 * d + de] * T2[64 * a + 16 * b + 4 * c + de];
          K += Rlow[64 * a + 16 * b + 4 * c + d] * v;
        }
  return K;
}

/**
 * Tensor de marea E_ij (simétrico 3×3, por filas) en el marco (u, e₁, e₂, e₃).
 * Unidades: M⁻² (aceleración relativa por unidad de separación, en unidades geométricas).
 */
export function tidalTensor(
  ks: KerrSchild,
  x: number,
  y: number,
  z: number,
  u: ArrayLike<number>,
  e: [ArrayLike<number>, ArrayLike<number>, ArrayLike<number>],
): Float64Array {
  const Rlow = lowerRiemann(ks, x, y, z, riemannTensor(ks, x, y, z));
  // A_{ρμ} = R_{ρσμν} u^σ u^ν
  const A = new Float64Array(16);
  for (let rho = 0; rho < 4; rho++)
    for (let mu = 0; mu < 4; mu++) {
      let v = 0;
      for (let sig = 0; sig < 4; sig++)
        for (let nu = 0; nu < 4; nu++) v += Rlow[64 * rho + 16 * sig + 4 * mu + nu] * u[sig] * u[nu];
      A[4 * rho + mu] = v;
    }
  const E = new Float64Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      let v = 0;
      for (let rho = 0; rho < 4; rho++) for (let mu = 0; mu < 4; mu++) v += A[4 * rho + mu] * e[i][rho] * e[j][mu];
      E[3 * i + j] = v;
    }
  // Simetriza (elimina el ruido numérico antisimétrico)
  for (let i = 0; i < 3; i++)
    for (let j = i + 1; j < 3; j++) {
      const s = 0.5 * (E[3 * i + j] + E[3 * j + i]);
      E[3 * i + j] = s;
      E[3 * j + i] = s;
    }
  return E;
}

/** Autovalores de una matriz simétrica 3×3 (método de Jacobi), ordenados de menor a mayor. */
export function symmetricEigen3(m: ArrayLike<number>): { values: [number, number, number]; vectors: Float64Array } {
  const a = Float64Array.from(m);
  const v = Float64Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1);
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = Math.abs(a[1]) + Math.abs(a[2]) + Math.abs(a[5]);
    if (off < 1e-300) break;
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ]) {
      const apq = a[3 * p + q];
      if (Math.abs(apq) < 1e-300) continue;
      const app = a[3 * p + p];
      const aqq = a[3 * q + q];
      const th = (aqq - app) / (2 * apq);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = a[3 * k + p];
        const akq = a[3 * k + q];
        a[3 * k + p] = c * akp - s * akq;
        a[3 * k + q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[3 * p + k];
        const aqk = a[3 * q + k];
        a[3 * p + k] = c * apk - s * aqk;
        a[3 * q + k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[3 * k + p];
        const vkq = v[3 * k + q];
        v[3 * k + p] = c * vkp - s * vkq;
        v[3 * k + q] = s * vkp + c * vkq;
      }
    }
  }
  const idx = [0, 1, 2].sort((i, j) => a[4 * i] - a[4 * j]);
  const values = idx.map((i) => a[4 * i]) as [number, number, number];
  const vectors = new Float64Array(9);
  idx.forEach((i, col) => {
    for (let k = 0; k < 3; k++) vectors[3 * k + col] = v[3 * k + i];
  });
  return { values, vectors };
}
