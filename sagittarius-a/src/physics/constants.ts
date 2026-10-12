/**
 * Constantes físicas (SI y cgs). Fuentes: CODATA 2018 (valores exactos desde la redefinición
 * del SI de 2019) y la Resolución B3 de la IAU 2015 (parámetro de masa solar nominal).
 *
 * Internamente el núcleo físico trabaja en unidades geometrizadas G = c = 1 con M = 1:
 * longitudes en r_g = GM/c² y tiempos en t_g = GM/c³. Las conversiones a SI viven en units.ts.
 */

/** Velocidad de la luz [m/s] (exacta). */
export const C_SI = 299_792_458;
/** Constante de gravitación [m³ kg⁻¹ s⁻²] (CODATA 2018). */
export const G_SI = 6.674_30e-11;
/** Parámetro de masa solar nominal 𝒢M☉ [m³ s⁻²] (IAU 2015 B3). */
export const GM_SUN_SI = 1.327_124_4e20;
/** Masa solar derivada de 𝒢M☉ y G [kg]. */
export const M_SUN_SI = GM_SUN_SI / G_SI;
/** Unidad astronómica [m] (exacta, IAU 2012). */
export const AU_SI = 149_597_870_700;
/** Pársec [m] = 648000/π au (IAU 2015). */
export const PC_SI = (648_000 / Math.PI) * AU_SI;
/** Microsegundos de arco por radián. */
export const MUAS_PER_RAD = (180 / Math.PI) * 3600 * 1e6;

// --- cgs (para la emisión sincrotrón y la transferencia radiativa) ---
/** Carga elemental [statC]. */
export const E_CGS = 4.803_204_71e-10;
/** Masa del electrón [g]. */
export const ME_CGS = 9.109_383_7e-28;
/** Masa del protón [g]. */
export const MP_CGS = 1.672_621_92e-24;
/** Velocidad de la luz [cm/s]. */
export const C_CGS = 2.997_924_58e10;
/** Constante de Planck [erg s] (exacta). */
export const H_CGS = 6.626_070_15e-27;
/** Constante de Boltzmann [erg/K] (exacta). */
export const KB_CGS = 1.380_649e-16;
/** 1 Jansky [erg s⁻¹ cm⁻² Hz⁻¹]. */
export const JY_CGS = 1e-23;
