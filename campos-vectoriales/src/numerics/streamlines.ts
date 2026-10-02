/**
 * Líneas de corriente (NUM-03, SPEC §3.5, §5.5, §5.7): RK4 de paso fijo en longitud de
 * arco σ sobre el campo normalizado ±F/‖F‖, en ambos sentidos desde la semilla, con
 * motivos de parada explícitos.
 */
import type { Dominio, EvaluadorCampo, Vec3 } from '../math/tipos';
import { F_MAX } from './grid';

export const MOTIVOS = ['SALE_DOMINIO', 'CERO', 'NO_DEFINIDO', 'ORBITA_CERRADA', 'LONGITUD_MAX', 'PASOS_MAX', 'ESTANCADA'] as const;
export type MotivoParada = (typeof MOTIVOS)[number];

/** Resultado de evaluar la derivada normalizada: 0 bien, 1 cero, 2 no definido. */
export const OK = 0;
export const FALLO_CERO = 1;
export const FALLO_NO_DEFINIDO = 2;
/** La dirección gira más de 90° dentro de un paso (se cruza un equilibrio o una discontinuidad). */
export const FALLO_GIRO = 3;
/** Por debajo de esta fracción de F_ref, un estancamiento o un giro se clasifica como «CERO». */
export const FRACCION_EQUILIBRIO = 0.05;

/** Derivada de la integración: escribe la dirección en out[o..o+2] y devuelve 0, 1 o 2. */
export type Derivada = (x: number, y: number, z: number, out: Float64Array, o: number) => number;

/** Campo normalizado ±F/‖F‖ con los umbrales de SPEC §5.7. */
export function derivadaNormalizada(F: EvaluadorCampo, p: Float64Array, sentido: 1 | -1, umbralCero: number): Derivada {
  const f = new Float64Array(3);
  return (x, y, z, out, o) => {
    F(x, y, z, p, f, 0);
    const fx = f[0] as number;
    const fy = f[1] as number;
    const fz = f[2] as number;
    if (!Number.isFinite(fx) || !Number.isFinite(fy) || !Number.isFinite(fz)) return FALLO_NO_DEFINIDO;
    const m = Math.hypot(fx, fy, fz);
    if (m > F_MAX) return FALLO_NO_DEFINIDO;
    if (m < umbralCero) return FALLO_CERO;
    const s = sentido / m;
    out[o] = fx * s;
    out[o + 1] = fy * s;
    out[o + 2] = fz * s;
    return OK;
  };
}

/** Paso de RK4 clásico. Escribe r + h·Φ en `sal`; devuelve el código de la primera etapa que falla. */
export class PasoRK4 {
  private readonly k = new Float64Array(12);
  /** Coseno entre la primera y la última etapa del último paso correcto. */
  coseno = 1;

  paso(G: Derivada, r: ArrayLike<number>, h: number, sal: Float64Array): number {
    const k = this.k;
    const x = r[0] as number;
    const y = r[1] as number;
    const z = r[2] as number;
    let c = G(x, y, z, k, 0);
    if (c) return c;
    c = G(x + 0.5 * h * (k[0] as number), y + 0.5 * h * (k[1] as number), z + 0.5 * h * (k[2] as number), k, 3);
    if (c) return c;
    c = G(x + 0.5 * h * (k[3] as number), y + 0.5 * h * (k[4] as number), z + 0.5 * h * (k[5] as number), k, 6);
    if (c) return c;
    c = G(x + h * (k[6] as number), y + h * (k[7] as number), z + h * (k[8] as number), k, 9);
    if (c) return c;
    this.coseno = (k[0] as number) * (k[9] as number) + (k[1] as number) * (k[10] as number) + (k[2] as number) * (k[11] as number);
    const s = h / 6;
    sal[0] = x + s * ((k[0] as number) + 2 * (k[3] as number) + 2 * (k[6] as number) + (k[9] as number));
    sal[1] = y + s * ((k[1] as number) + 2 * (k[4] as number) + 2 * (k[7] as number) + (k[10] as number));
    sal[2] = z + s * ((k[2] as number) + 2 * (k[5] as number) + 2 * (k[8] as number) + (k[11] as number));
    return OK;
  }
}

export interface OpcionesIntegracion {
  dominio: Dominio;
  /** Paso h en longitud de arco (SPEC §5.5: por defecto Δ/8). */
  paso: number;
  longitudMax: number;
  pasosMax: number;
  /** Magnitud de referencia: el umbral de cero es epsStop·fRef. */
  fRef: number;
  epsStop?: number;
}

export interface Rama {
  puntos: Float64Array;
  /** Número de puntos (incluida la semilla). */
  n: number;
  motivo: MotivoParada;
  /** Longitud de arco σ recorrida. */
  longitud: number;
}

/** Acumulador creciente de puntos 3D. */
class Polilinea {
  datos = new Float64Array(3 * 256);
  n = 0;
  agregar(x: number, y: number, z: number) {
    if (3 * (this.n + 1) > this.datos.length) {
      const mas = new Float64Array(this.datos.length * 2);
      mas.set(this.datos);
      this.datos = mas;
    }
    this.datos[3 * this.n] = x;
    this.datos[3 * this.n + 1] = y;
    this.datos[3 * this.n + 2] = z;
    this.n++;
  }
}

/** ¿Está el punto dentro de Ω (con tolerancia relativa al tamaño)? */
function dentro(d: Dominio, r: ArrayLike<number>): boolean {
  for (let k = 0; k < 3; k++) {
    const tol = 1e-12 * ((d.max[k] as number) - (d.min[k] as number));
    const v = r[k] as number;
    if (v < (d.min[k] as number) - tol || v > (d.max[k] as number) + tol) return false;
  }
  return true;
}

const ITERACIONES_BISECCION = 30;
const REDUCCIONES_PASO = 4;
const VENTANA_ESTANCAMIENTO = 50;

/** Pasos entre cesiones de la versión troceada (≈ 1–10 ms incluso con expresiones largas). */
export const PASOS_POR_TROZO = 256;

/** Ejecuta un generador troceado hasta el final, sin ceder (versión síncrona). */
function completar<T>(g: Generator<void, T>): T {
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
  }
}

/**
 * Integra una rama desde `semilla` en el sentido dado. `cierre` (la semilla de la línea)
 * activa la detección de órbitas cerradas.
 */
export function integrarRama(
  F: EvaluadorCampo,
  p: Float64Array,
  semilla: Vec3,
  sentido: 1 | -1,
  o: OpcionesIntegracion,
  cierre: Vec3 | null,
): Rama {
  return completar(ramaTroceada(F, p, semilla, sentido, o, cierre));
}

/**
 * Versión troceada de `integrarRama`: cede cada PASOS_POR_TROZO pasos para que el
 * llamante pueda atender una cancelación sin esperar al final de la rama (CMP-02).
 */
export function* ramaTroceada(
  F: EvaluadorCampo,
  p: Float64Array,
  semilla: Vec3,
  sentido: 1 | -1,
  o: OpcionesIntegracion,
  cierre: Vec3 | null,
): Generator<void, Rama> {
  const G = derivadaNormalizada(F, p, sentido, (o.epsStop ?? 1e-3) * o.fRef);
  const rk = new PasoRK4();
  const linea = new Polilinea();
  linea.agregar(semilla[0], semilla[1], semilla[2]);
  const r = Float64Array.from(semilla);
  const nuevo = new Float64Array(3);
  const tmp = new Float64Array(3);
  const mejor = new Float64Array(3);
  const h0 = o.paso;
  const fEval = new Float64Array(3);
  /** ¿Es pequeño ‖F‖ en r (equilibrio aproximado)? */
  const cercaDeEquilibrio = () => {
    F(r[0] as number, r[1] as number, r[2] as number, p, fEval, 0);
    return Math.hypot(fEval[0] as number, fEval[1] as number, fEval[2] as number) < FRACCION_EQUILIBRIO * o.fRef;
  };
  let sigma = 0;
  let pasos = 0;
  let motivo: MotivoParada;
  for (;;) {
    if (pasos >= o.pasosMax) {
      motivo = 'PASOS_MAX';
      break;
    }
    if (pasos > 0 && pasos % PASOS_POR_TROZO === 0) yield;
    let h = h0;
    let codigo: number;
    for (let intento = 0; ; intento++) {
      codigo = rk.paso(G, r, h, nuevo);
      if (codigo === OK && rk.coseno < 0) codigo = FALLO_GIRO;
      if (codigo === OK || intento >= REDUCCIONES_PASO) break;
      h /= 2;
    }
    if (codigo !== OK) {
      motivo =
        codigo === FALLO_CERO ? 'CERO' : codigo === FALLO_NO_DEFINIDO ? 'NO_DEFINIDO' : cercaDeEquilibrio() ? 'CERO' : 'ESTANCADA';
      break;
    }
    if (!dentro(o.dominio, nuevo)) {
      // Bisección del paso hasta el borde de Ω (SPEC §5.5).
      let lo = 0;
      let hi = h;
      mejor.set(r);
      for (let i = 0; i < ITERACIONES_BISECCION; i++) {
        const medio = 0.5 * (lo + hi);
        if (rk.paso(G, r, medio, tmp) === OK && dentro(o.dominio, tmp)) {
          lo = medio;
          mejor.set(tmp);
        } else hi = medio;
      }
      // Tras 30 bisecciones el punto queda a menos de h/2³⁰ del borde (T-16); no se fuerza
      // la coordenada al borde para no apartar el extremo de la curva integrada.
      if (lo > 0) {
        linea.agregar(mejor[0] as number, mejor[1] as number, mejor[2] as number);
        sigma += lo;
      }
      motivo = 'SALE_DOMINIO';
      break;
    }
    if (cierre && sigma + h > 8 * h0) {
      // ¿Pasa este paso a menos de h/2 de la semilla? Entonces la línea termina exactamente en
      // la semilla desde r, sin sobrepasarla (antes quedaba un pequeño retroceso de hasta h/2
      // y la longitud se alargaba casi un paso; hallazgo de H3).
      const ex = (nuevo[0] as number) - (r[0] as number);
      const ey = (nuevo[1] as number) - (r[1] as number);
      const ez = (nuevo[2] as number) - (r[2] as number);
      const cx = cierre[0] - (r[0] as number);
      const cy = cierre[1] - (r[1] as number);
      const cz = cierre[2] - (r[2] as number);
      const e2 = ex * ex + ey * ey + ez * ez;
      const t = e2 > 0 ? Math.min(1, Math.max(0, (cx * ex + cy * ey + cz * ez) / e2)) : 0;
      if (t > 0 && Math.hypot(cx - t * ex, cy - t * ey, cz - t * ez) < h0 / 2) {
        linea.agregar(cierre[0], cierre[1], cierre[2]);
        sigma += Math.hypot(cx, cy, cz);
        motivo = 'ORBITA_CERRADA';
        break;
      }
    }
    linea.agregar(nuevo[0] as number, nuevo[1] as number, nuevo[2] as number);
    sigma += h;
    pasos++;
    r.set(nuevo);
    if (sigma >= o.longitudMax) {
      motivo = 'LONGITUD_MAX';
      break;
    }
    if (pasos >= VENTANA_ESTANCAMIENTO) {
      const j = 3 * (linea.n - 1 - VENTANA_ESTANCAMIENTO);
      const d = Math.hypot(
        (r[0] as number) - (linea.datos[j] as number),
        (r[1] as number) - (linea.datos[j + 1] as number),
        (r[2] as number) - (linea.datos[j + 2] as number),
      );
      if (d < h0) {
        motivo = cercaDeEquilibrio() ? 'CERO' : 'ESTANCADA';
        break;
      }
    }
  }
  return { puntos: linea.datos.subarray(0, 3 * linea.n), n: linea.n, motivo, longitud: sigma };
}

export interface LineaCorriente {
  /** Puntos de la línea: rama hacia atrás invertida + semilla + rama hacia delante. */
  puntos: Float64Array;
  n: number;
  indiceSemilla: number;
  motivoAtras: MotivoParada | null;
  motivoAdelante: MotivoParada;
  longitud: number;
}

export type DescarteSemilla = 'fuera' | 'cero' | 'no-definido';

/** Línea completa desde una semilla, o el motivo por el que la semilla se descarta. */
export function integrarLinea(
  F: EvaluadorCampo,
  p: Float64Array,
  semilla: Vec3,
  o: OpcionesIntegracion,
): LineaCorriente | { descartada: DescarteSemilla } {
  return completar(lineaTroceada(F, p, semilla, o));
}

/** Versión troceada de `integrarLinea` (véase `ramaTroceada`). */
export function* lineaTroceada(
  F: EvaluadorCampo,
  p: Float64Array,
  semilla: Vec3,
  o: OpcionesIntegracion,
): Generator<void, LineaCorriente | { descartada: DescarteSemilla }> {
  if (!dentro(o.dominio, semilla)) return { descartada: 'fuera' };
  const G = derivadaNormalizada(F, p, 1, (o.epsStop ?? 1e-3) * o.fRef);
  const c = G(semilla[0], semilla[1], semilla[2], new Float64Array(3), 0);
  if (c === FALLO_CERO) return { descartada: 'cero' };
  if (c === FALLO_NO_DEFINIDO) return { descartada: 'no-definido' };
  const adelante = yield* ramaTroceada(F, p, semilla, 1, o, semilla);
  const atras = adelante.motivo === 'ORBITA_CERRADA' ? null : yield* ramaTroceada(F, p, semilla, -1, o, null);
  const nAtras = atras ? atras.n - 1 : 0;
  const n = nAtras + adelante.n;
  const puntos = new Float64Array(3 * n);
  for (let i = 0; i < nAtras; i++) {
    const src = 3 * (atras!.n - 1 - i);
    puntos[3 * i] = atras!.puntos[src] as number;
    puntos[3 * i + 1] = atras!.puntos[src + 1] as number;
    puntos[3 * i + 2] = atras!.puntos[src + 2] as number;
  }
  puntos.set(adelante.puntos, 3 * nAtras);
  return {
    puntos,
    n,
    indiceSemilla: nAtras,
    motivoAtras: atras ? atras.motivo : null,
    motivoAdelante: adelante.motivo,
    longitud: adelante.longitud + (atras?.longitud ?? 0),
  };
}

/** Opciones por defecto a partir del dominio y de la separación de la malla. */
export function opcionesPorDefecto(dominio: Dominio, deltaRef: number, fRef: number, paso?: number | null, longitudMax?: number | null): OpcionesIntegracion {
  const diagonal = Math.hypot(dominio.max[0] - dominio.min[0], dominio.max[1] - dominio.min[1], dominio.max[2] - dominio.min[2]);
  return {
    dominio,
    paso: paso ?? deltaRef / 8,
    longitudMax: longitudMax ?? 4 * diagonal,
    pasosMax: 4000,
    fRef,
  };
}
