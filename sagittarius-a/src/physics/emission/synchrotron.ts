/**
 * Emisión sincrotrón térmica (electrones con distribución de Maxwell–Jüttner) y cuerpo negro.
 *
 * Emisividad (ajuste de Leung, Gammie & Noble 2011, ApJ 737, 21; el mismo que usa grmonty):
 *   j_ν = n_e √2 π e² ν_s / (3 K₂(1/Θ_e) c) · (X^{1/2} + 2^{11/12} X^{1/6})² · exp(−X^{1/3})
 *   ν_s = (2/9) ν_c Θ_e² sinθ_B,   ν_c = eB/(2π m_e c),   X = ν/ν_s,   Θ_e = k T_e/(m_e c²)
 * en erg s⁻¹ cm⁻³ Hz⁻¹ sr⁻¹. Absorción por la ley de Kirchhoff: α_ν = j_ν / B_ν(T_e).
 *
 * K₀, K₁ (y K₂ = K₀ + 2K₁/x) con las aproximaciones polinómicas de Abramowitz & Stegun 9.8.1–9.8.8.
 */
import { C_CGS, E_CGS, H_CGS, KB_CGS, ME_CGS } from '../constants';

function besselI0(x: number): number {
  const t = (x / 3.75) ** 2;
  return 1 + t * (3.5156229 + t * (3.0899424 + t * (1.2067492 + t * (0.2659732 + t * (0.0360768 + t * 0.0045813)))));
}

function besselI1(x: number): number {
  const t = (x / 3.75) ** 2;
  return x * (0.5 + t * (0.87890594 + t * (0.51498869 + t * (0.15084934 + t * (0.02658733 + t * (0.00301532 + t * 0.00032411))))));
}

export function besselK0(x: number): number {
  if (x <= 2) {
    const y = (x * x) / 4;
    return (
      -Math.log(x / 2) * besselI0(x) +
      (-0.57721566 + y * (0.4227842 + y * (0.23069756 + y * (0.0348859 + y * (0.00262698 + y * (0.0001075 + y * 0.0000074))))))
    );
  }
  const y = 2 / x;
  return (
    (Math.exp(-x) / Math.sqrt(x)) *
    (1.25331414 + y * (-0.07832358 + y * (0.02189568 + y * (-0.01062446 + y * (0.00587872 + y * (-0.0025154 + y * 0.00053208))))))
  );
}

export function besselK1(x: number): number {
  if (x <= 2) {
    const y = (x * x) / 4;
    return (
      Math.log(x / 2) * besselI1(x) +
      (1 / x) * (1 + y * (0.15443144 + y * (-0.67278579 + y * (-0.18156897 + y * (-0.01919402 + y * (-0.00110404 + y * -0.00004686))))))
    );
  }
  const y = 2 / x;
  return (
    (Math.exp(-x) / Math.sqrt(x)) *
    (1.25331414 + y * (0.23498619 + y * (-0.0365562 + y * (0.01504268 + y * (-0.00780353 + y * (0.00325614 + y * -0.00068245))))))
  );
}

export function besselK2(x: number): number {
  return besselK0(x) + (2 / x) * besselK1(x);
}

/** Temperatura electrónica adimensional Θ_e = k T / (m_e c²). */
export function thetaE(T: number): number {
  return (KB_CGS * T) / (ME_CGS * C_CGS * C_CGS);
}

/** Función de Planck B_ν(T) [erg s⁻¹ cm⁻² Hz⁻¹ sr⁻¹]. */
export function planck(nu: number, T: number): number {
  const x = (H_CGS * nu) / (KB_CGS * T);
  const em1 = x < 1e-5 ? x * (1 + 0.5 * x) : Math.expm1(x);
  return (2 * H_CGS * nu * nu * nu) / (C_CGS * C_CGS) / em1;
}

/** Emisividad sincrotrón térmica j_ν [erg s⁻¹ cm⁻³ Hz⁻¹ sr⁻¹]. */
export function thermalSynchrotronJ(nu: number, ne: number, Te: number, B: number, sinTheta: number): number {
  const th = thetaE(Te);
  if (th < 1e-3 || ne <= 0 || B <= 0) return 0;
  const nuc = (E_CGS * B) / (2 * Math.PI * ME_CGS * C_CGS);
  const s = Math.max(Math.abs(sinTheta), 1e-3);
  const nus = (2 / 9) * nuc * th * th * s;
  const X = nu / nus;
  const K2 = th > 50 ? 2 * th * th : besselK2(1 / th);
  const f = Math.sqrt(X) + Math.pow(2, 11 / 12) * Math.pow(X, 1 / 6);
  return ((ne * Math.SQRT2 * Math.PI * E_CGS * E_CGS * nus) / (3 * K2 * C_CGS)) * f * f * Math.exp(-Math.cbrt(X));
}

/** Coeficiente de absorción α_ν = j_ν / B_ν [cm⁻¹]. */
export function thermalSynchrotronAlpha(nu: number, j: number, Te: number): number {
  return j / planck(nu, Te);
}

/** Temperatura de brillo de Rayleigh–Jeans T_b = I c² / (2 k ν²) [K]. */
export function brightnessTemperature(I: number, nu: number): number {
  return (I * C_CGS * C_CGS) / (2 * KB_CGS * nu * nu);
}
