/**
 * Vista libre inmersiva (VL-02, PLAN F11 y §3.2; SPEC RF-20 … RF-23; DESIGN §5.5).
 *
 * - Entrar (botón o V): la cámara pasa a vuelo (render/vuelo), la interfaz desaparece (la
 *   clase `vista-libre` del contenedor) y, si el navegador la concede, pantalla completa.
 * - Teclado mientras está activa (escucha en captura, antes que los atajos globales): W A S D
 *   E Q, flechas y Mayús van al vuelo; + y − dilatan (λ ×1.25); U, espacio sin límites; H, la
 *   pista; R, la pose de entrada; Esc y V salen. 1–5 e I no actúan. F L P C G y Espacio siguen
 *   a los atajos globales.
 * - Salir (también al abandonar la pantalla completa con el navegador): cámara, proyección,
 *   interfaz y foco vuelven exactamente a como estaban (D-65).
 * - Espacio sin límites (ALC-02, SPEC §3.11): la ventana de muestreo acompaña a la cámara
 *   anclada a la red de Ω, con F_ref y C_ref congeladas al activarlo y semillas ancladas.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EstadoCalculo } from './orquestador';
import type { Ventana } from './entradaCalculo';
import { T } from '../i18n/es';
import type { Dominio, Vec3 } from '../math/tipos';
import { crearMalla } from '../numerics/grid';
import { formatearCorto } from '../numerics/format';
import { desplazamientoVentana, ladoCeldaSemillas, ventanaDesplazada, type Desplazamiento } from '../numerics/ventana';
import { centroDominio, radioDominio } from '../render/camara';
import type { ControladorEscena } from '../render/ControladorEscena';
import { FACTOR_PASO } from '../render/vuelo';
import { fijarExploracion } from '../state/actions';
import { LIMITES, type EstadoExperimento } from '../state/schema';
import type { Almacen } from '../state/store';

/** Velocidad de vuelo base: 0.4 radios de Ω por segundo (SPEC §5.11). */
export const RAPIDEZ_BASE = 0.4;
const DURACION_PISTA = 5000;
const DURACION_INDICADOR = 1500;

interface Opciones {
  controlador: ControladorEscena | null;
  almacen: Almacen<EstadoExperimento>;
  almacenCalculo: Almacen<EstadoCalculo>;
  almacenVentana: Almacen<Ventana | null>;
  /** Animación en marcha (para confirmar la pausa con el indicador). */
  animando: boolean;
}

/** Número de semillas de las líneas según su especificación (para la red gruesa de semillas). */
function numeroSemillas(e: EstadoExperimento): number {
  const s = e.lineas.semillas;
  return s.tipo === 'rejilla' ? s.nu * s.nv : s.tipo === 'aleatoria' ? s.n : 32;
}

/** Parámetros fijos del espacio sin límites, tomados al activarlo (SPEC §3.11). */
interface BaseIlimitada {
  dominio: Dominio;
  delta: Vec3;
  ventana: (m: Desplazamiento) => Ventana;
}

function crearBaseIlimitada(e: EstadoExperimento, c: EstadoCalculo): BaseIlimitada | null {
  const m = c.malla;
  if (!m) return null;
  const malla = crearMalla(e.dominio, e.muestreo.n, e.muestreo.posicion);
  const delta = malla.delta as unknown as Vec3;
  // Escalas congeladas: con la automática, el P95 de cada ventana reescalaría las flechas al moverse.
  const escala = { tipo: 'fija' as const, valor: m.escala.ref, delta: m.deltaRef };
  const escalaRot = m.glifos === 'rotacional' ? { tipo: 'fija' as const, valor: m.escalaGlifos.ref, delta: m.deltaRef } : e.flechas.escalaRot;
  const D = ladoCeldaSemillas(e.dominio, Math.min(numeroSemillas(e), LIMITES.semillasMax / 2));
  const semilla = e.lineas.semillas.tipo === 'aleatoria' ? e.lineas.semillas.semilla : 1;
  return {
    dominio: e.dominio,
    delta,
    ventana: (d) => {
      const dominio = ventanaDesplazada(e.dominio, delta, d);
      const k = { XY: 2, XZ: 1, YZ: 0 }[e.corte.plano];
      const corteDentro = e.corte.c >= (dominio.min[k] as number) && e.corte.c <= (dominio.max[k] as number);
      return {
        dominio,
        flechas: { ...e.flechas, escala: e.flechas.escala.tipo === 'fija' ? e.flechas.escala : escala, escalaRot: e.flechas.escalaRot.tipo === 'fija' ? e.flechas.escalaRot : escalaRot },
        lineas: { ...e.lineas, semillas: { tipo: 'red', D, ancla: e.dominio.min, semilla } },
        corte: { ...e.corte, activo: e.corte.activo && corteDentro },
      };
    },
  };
}

export function useVistaLibre({ controlador, almacen, almacenCalculo, almacenVentana, animando }: Opciones) {
  const [activa, setActiva] = useState(false);
  const [pistaVisible, setPistaVisible] = useState(false);
  const [indicador, setIndicador] = useState<{ texto: string; vez: number } | null>(null);
  const [anuncio, setAnuncio] = useState('');
  const origen = useRef<HTMLElement | null>(null);
  const pantallaCompleta = useRef(false);
  const temporizadores = useRef<{ pista: ReturnType<typeof setTimeout> | null; indicador: ReturnType<typeof setTimeout> | null }>({ pista: null, indicador: null });
  const ilimitada = useRef<{ base: BaseIlimitada; m: Desplazamiento | null; baja: () => void } | null>(null);

  const avisar = useCallback((texto: string) => {
    const t = temporizadores.current;
    if (t.indicador) clearTimeout(t.indicador);
    setIndicador((i) => ({ texto, vez: (i?.vez ?? 0) + 1 }));
    t.indicador = setTimeout(() => setIndicador(null), DURACION_INDICADOR);
  }, []);

  const mostrarPista = useCallback((visible: boolean) => {
    const t = temporizadores.current;
    if (t.pista) clearTimeout(t.pista);
    t.pista = null;
    setPistaVisible(visible);
    if (visible) t.pista = setTimeout(() => setPistaVisible(false), DURACION_PISTA);
  }, []);

  /** Recoloca la ventana sin límites según la posición de la cámara (solo si cambia m). */
  const seguirCamara = useCallback(() => {
    const il = ilimitada.current;
    if (!il || !controlador) return;
    const m = desplazamientoVentana(il.base.dominio, il.base.delta, controlador.obtenerCamara().posicion);
    if (il.m && m[0] === il.m[0] && m[1] === il.m[1] && m[2] === il.m[2]) return;
    il.m = m;
    almacenVentana.fijar(il.base.ventana(m));
  }, [controlador, almacenVentana]);

  const fijarIlimitado = useCallback(
    (si: boolean) => {
      if (!controlador) return;
      if (si && !ilimitada.current) {
        const base = crearBaseIlimitada(almacen.obtener(), almacenCalculo.obtener());
        if (!base) return;
        ilimitada.current = { base, m: null, baja: controlador.alCambiarCamara(() => seguirCamara()) };
        seguirCamara();
      } else if (!si && ilimitada.current) {
        ilimitada.current.baja();
        ilimitada.current = null;
        almacenVentana.fijar(null);
      }
      controlador.fijarCentroDilatacion(si ? 'camara' : centroDominio(almacen.obtener().dominio));
    },
    [controlador, almacen, almacenCalculo, almacenVentana, seguirCamara],
  );

  const salir = useCallback(() => {
    if (!controlador?.enVistaLibre) return;
    fijarIlimitado(false);
    controlador.salirVistaLibre();
    setActiva(false);
    mostrarPista(false);
    setIndicador(null);
    setAnuncio(T.vistaLibre.anuncioSalir);
    if (pantallaCompleta.current && document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    pantallaCompleta.current = false;
    const o = origen.current;
    origen.current = null;
    if (o?.isConnected) o.focus();
  }, [controlador, fijarIlimitado, mostrarPista]);

  const entrar = useCallback(() => {
    if (!controlador || controlador.enVistaLibre) return;
    const e = almacen.obtener();
    const activo = document.activeElement;
    origen.current = activo instanceof HTMLElement ? activo : null;
    controlador.entrarVistaLibre({
      rapidez: RAPIDEZ_BASE * radioDominio(e.dominio) * e.exploracion.velocidad,
      lambda: e.exploracion.escala,
      centro: centroDominio(e.dominio),
    });
    setActiva(true);
    setAnuncio(T.vistaLibre.anuncioEntrar);
    mostrarPista(true);
    if (e.exploracion.ilimitado) fijarIlimitado(true);
    // Pantalla completa si el navegador la concede (gesto del usuario: clic o tecla).
    const raiz = document.documentElement;
    if (raiz.requestFullscreen && !document.fullscreenElement) {
      raiz
        .requestFullscreen()
        .then(() => {
          pantallaCompleta.current = true;
        })
        .catch(() => undefined);
    }
    document.querySelector<HTMLElement>('[data-prueba="lienzo"]')?.focus();
  }, [controlador, almacen, mostrarPista, fijarIlimitado]);

  const conmutar = useCallback(() => (controlador?.enVistaLibre ? salir() : entrar()), [controlador, entrar, salir]);

  // Salir con el navegador: abandonar la pantalla completa cierra la vista libre.
  useEffect(() => {
    const alCambiar = () => {
      if (!document.fullscreenElement && pantallaCompleta.current) {
        pantallaCompleta.current = false;
        salir();
      }
    };
    document.addEventListener('fullscreenchange', alCambiar);
    return () => document.removeEventListener('fullscreenchange', alCambiar);
  }, [salir]);

  // Rueda: velocidad ×1.25 por paso (el controlador la recibe y la anuncia).
  useEffect(() => {
    if (!controlador) return;
    return controlador.alRuedaVuelo((signo) => {
      const e = almacen.obtener();
      const velocidad = Math.min(LIMITES.velocidadMax, Math.max(LIMITES.velocidadMin, e.exploracion.velocidad * FACTOR_PASO ** signo));
      almacen.fijar((s) => fijarExploracion(s, { velocidad }));
      controlador.fijarRapidezVuelo(RAPIDEZ_BASE * radioDominio(e.dominio) * velocidad);
      avisar(T.vistaLibre.indicadorVelocidad(formatearCorto(Number(velocidad.toPrecision(3)))));
    });
  }, [controlador, almacen, avisar]);

  // Teclado de la vista libre (PLAN §3.2), en captura: antes que los atajos globales.
  useEffect(() => {
    if (!activa || !controlador) return;
    const abajo = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (controlador.teclaVuelo(e.code, true)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      const tecla = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const parar = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      if (tecla === 'Escape' || tecla === 'v') {
        parar();
        salir();
      } else if (tecla === '+' || tecla === '=' || tecla === '-' || tecla === '−') {
        parar();
        const s = almacen.obtener();
        const lambda = Math.min(LIMITES.escalaMax, Math.max(LIMITES.escalaMin, s.exploracion.escala * FACTOR_PASO ** (tecla === '+' || tecla === '=' ? 1 : -1)));
        almacen.fijar((x) => fijarExploracion(x, { escala: lambda }));
        controlador.fijarLambda(lambda);
        avisar(T.vistaLibre.indicadorEscala(formatearCorto(Number(lambda.toPrecision(3)))));
      } else if (tecla === 'u') {
        parar();
        const si = !ilimitada.current;
        almacen.fijar((x) => fijarExploracion(x, { ilimitado: si }));
        fijarIlimitado(si);
        avisar(si ? T.vistaLibre.indicadorIlimitado : T.vistaLibre.indicadorLimitado);
      } else if (tecla === 'h') {
        parar();
        mostrarPista(!pistaVisibleRef.current);
      } else if (tecla === 'r') {
        parar();
        controlador.volverAPoseEntrada();
        avisar(T.vistaLibre.indicadorRegreso);
      } else if (['1', '2', '3', '4', '5', 'i'].includes(tecla)) {
        // Vistas, proyección e inspector no tienen sentido en el vuelo.
        parar();
      }
    };
    const arriba = (e: KeyboardEvent) => {
      if (controlador.teclaVuelo(e.code, false)) e.preventDefault();
    };
    const perder = () => controlador.soltarTeclasVuelo();
    window.addEventListener('keydown', abajo, true);
    window.addEventListener('keyup', arriba, true);
    window.addEventListener('blur', perder);
    return () => {
      window.removeEventListener('keydown', abajo, true);
      window.removeEventListener('keyup', arriba, true);
      window.removeEventListener('blur', perder);
    };
  }, [activa, controlador, almacen, salir, avisar, fijarIlimitado, mostrarPista]);

  const pistaVisibleRef = useRef(pistaVisible);
  useEffect(() => {
    pistaVisibleRef.current = pistaVisible;
  }, [pistaVisible]);

  // Confirmación de la pausa (Espacio) dentro de la vista libre.
  const animandoPrevio = useRef(animando);
  useEffect(() => {
    if (activa && animandoPrevio.current !== animando) avisar(animando ? T.vistaLibre.indicadorMarcha : T.vistaLibre.indicadorPausa);
    animandoPrevio.current = animando;
  }, [activa, animando, avisar]);

  useEffect(
    () => () => {
      const t = temporizadores.current;
      if (t.pista) clearTimeout(t.pista);
      if (t.indicador) clearTimeout(t.indicador);
      ilimitada.current?.baja();
    },
    [],
  );

  return { activa, entrar, salir, conmutar, pistaVisible, indicador, anuncio };
}
