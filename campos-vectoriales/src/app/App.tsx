import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleOff, FileQuestion } from 'lucide-react';
import { ClienteCalculo } from '../compute/client';
import { huellaMalla } from '../compute/huella';
import { FINAL } from '../geometria/lineas';
import { peticionMalla } from '../compute/peticiones';
import { CATALOGO, type IdCampo } from '../math/catalog';
import { compilarCampo } from '../math/field';
import { conDerivadas, inspeccionar } from '../numerics/inspeccion';
import { CLASE } from '../numerics/grid';
import { anillosRotacional, calcularFlechas } from '../geometria/flechas';
import type { ControladorEscena, EstadoCamara, Proyeccion } from '../render/ControladorEscena';
import type { Vista } from '../render/camara';
import { EJES_PLANO, NOMBRE_EJE, type Dominio, type Vec3 } from '../math/tipos';
import { rotuloCorte } from '../render/layers/corte';
import type { DatosEscalar } from '../render/layers/escalar';
import { UMBRAL_CERO } from '../geometria/escalar';
import { centroDominio, fijarCapa, fijarCorte, fijarGlifos, fijarPunto, moverPunto, seleccionarCampo } from '../state/actions';
import { guardarPreferencia, leerPreferencia, recuperarAutoguardado } from '../state/persist';
import { EXPERIMENTO_INICIAL, experimentoDesdeCatalogo, type EstadoExperimento } from '../state/schema';
import { crearAlmacen } from '../state/store';
import { T } from '../i18n/es';
import { nivelPantalla, panelFlotante, useAlmacen, useNivelPantalla, usePrefiereMovimientoReducido } from '../ui/hooks';
import { Panel } from '../ui/panel/Panel';
import { BarraSuperior, type EstadoCalculoBarra } from '../ui/topbar/BarraSuperior';
import { Boton } from '../ui/controls/Boton';
import { crearNotificador, Notificaciones } from '../ui/controls/Notificaciones';
import { DialogoErrores } from '../ui/topbar/DialogoErrores';
import { DialogoPng } from '../ui/topbar/DialogoPng';
import { Ayuda, ContextoAyuda, type EstadoAyuda } from '../ui/help/Ayuda';
import { apartadoPorId, type IdApartado, type Pestana } from '../ui/help/contenido';
import { AvisoEscena, Carga, EstadoVacio } from '../ui/scene/Mensajes';
import { BarraEscena } from '../ui/scene/BarraEscena';
import { Inspector } from '../ui/scene/Inspector';
import { Leyenda } from '../ui/scene/Leyenda';
import { Triedro } from '../ui/scene/Triedro';
import { VistaEscena } from '../ui/scene/VistaEscena';
import { ESTADO_CALCULO_INICIAL, Orquestador, type EstadoCalculo } from './orquestador';
import { modoCaptura, modoPrueba, parametrosUrl, publicarGancho } from './pruebas';
import { Animacion, datosRueda } from './animacion';
import { enCampoDeTexto, useAtajos } from './atajos';
import { useArchivo } from './archivo';
import { useExportarPng } from './imagen';
import { useEdicion } from './edicion';
import { PanelRendimiento } from './PanelRendimiento';
import { escenaPerf, type ContextoMedicion, type EscenaPerf } from './rendimiento';

/**
 * Estado inicial: la escena de medición pedida en la URL (`?perf=PERF-A`, VAL-03); si no, el
 * campo pedido (`?campo=rotacional`); si no, el último experimento autoguardado (salvo en el
 * modo de captura, D-50); si no, el helicoidal.
 */
function estadoInicial(perf: EscenaPerf | null): { estado: EstadoExperimento; recuperado: boolean } {
  if (perf) return { estado: perf.estado, recuperado: false };
  const pedido = parametrosUrl().get('campo');
  const id = CATALOGO.find((c) => c.id === pedido)?.id;
  if (id) return { estado: experimentoDesdeCatalogo(id), recuperado: false };
  const guardado = modoCaptura() ? null : recuperarAutoguardado();
  if (guardado) return { estado: guardado, recuperado: true };
  // Modo consulta (< 768 px): densidad por defecto 7³ (SPEC §9).
  if (nivelPantalla() === 'consulta') return { estado: { ...EXPERIMENTO_INICIAL, muestreo: { ...EXPERIMENTO_INICIAL.muestreo, n: [7, 7, 7] } }, recuperado: false };
  return { estado: EXPERIMENTO_INICIAL, recuperado: false };
}

interface Props {
  fuentes: Promise<void>;
}

const CLAVE_ATAJOS = 'campos-vectoriales:atajos-una-tecla';

/** Signos del escalar que se ven en el mapa (|s| ≥ 2 % V_ref) y si hay curva de nivel cero. */
function signosPresentes(d: DatosEscalar): { positivo: boolean; negativo: boolean; cero: boolean } {
  let positivo = false;
  let negativo = false;
  const umbral = UMBRAL_CERO * d.vRef;
  for (let k = 0; k < d.rejilla.valores.length; k++) {
    if (d.rejilla.estado[k] !== 0) continue;
    const v = d.rejilla.valores[k] as number;
    if (v >= umbral) positivo = true;
    else if (v <= -umbral) negativo = true;
  }
  return { positivo, negativo, cero: !!d.contorno && d.contorno.length > 0 };
}

/** Punto de la rejilla N×N de las flechas «solo corte» (como en numerics/slice: c dentro de Ω). */
function puntoDeRejillaCorte(e: EstadoExperimento, total: number, nodo: number): Vec3 {
  const N = Math.round(Math.sqrt(total));
  const { u, v, n } = EJES_PLANO[e.corte.plano];
  const d = e.dominio;
  const coord = (k: number, i: number) => (N === 1 ? ((d.min[k] as number) + (d.max[k] as number)) / 2 : (d.min[k] as number) + (((d.max[k] as number) - (d.min[k] as number)) * i) / (N - 1));
  const q: [number, number, number] = [0, 0, 0];
  q[u] = coord(u, nodo % N);
  q[v] = coord(v, Math.floor(nodo / N));
  q[n] = Math.min(d.max[n] as number, Math.max(d.min[n] as number, e.corte.c));
  return q;
}

export function App({ fuentes }: Props) {
  const perf = useMemo(() => escenaPerf(), []);
  const inicio = useMemo(() => estadoInicial(perf), [perf]);
  const almacen = useMemo(() => crearAlmacen(inicio.estado), [inicio]);
  const almacenCalculo = useMemo(() => crearAlmacen<EstadoCalculo>(ESTADO_CALCULO_INICIAL), []);
  const edicionInvalida = useMemo(() => crearAlmacen(false), []);
  const notificador = useMemo(() => crearNotificador(), []);
  const estado = useAlmacen(almacen, (s) => s);
  const calculo = useAlmacen(almacenCalculo, (s) => s);
  const hayEdicionInvalida = useAlmacen(edicionInvalida, (s) => s);
  const [controlador, setControlador] = useState<ControladorEscena | null>(null);
  const [errorEscena, setErrorEscena] = useState<string | null>(null);
  const alControlador = useCallback((c: ControladorEscena | null, error?: string) => {
    setControlador(c);
    setErrorEscena(error ?? null);
  }, []);
  const [cliente, setCliente] = useState<ClienteCalculo | null>(null);
  const [orquestador, setOrquestador] = useState<Orquestador | null>(null);
  const [fuentesListas, setFuentesListas] = useState(false);
  const movimientoReducido = usePrefiereMovimientoReducido();

  useEffect(() => {
    fuentes.then(() => setFuentesListas(true));
  }, [fuentes]);

  // Cliente de cálculo (worker o, si no es posible, hilo principal) y orquestador.
  useEffect(() => {
    let vivo = true;
    let cli: ClienteCalculo | null = null;
    let orq: Orquestador | null = null;
    void ClienteCalculo.crear().then((c) => {
      if (!vivo) {
        c.terminar();
        return;
      }
      cli = c;
      orq = new Orquestador(almacen, c, almacenCalculo);
      orq.iniciar();
      setCliente(c);
      setOrquestador(orq);
    });
    return () => {
      vivo = false;
      orq?.detener();
      cli?.terminar();
    };
  }, [almacen, almacenCalculo]);

  // Campo compilado desde las expresiones (MAT-05) para el panel; solo cambia si cambian el texto o los nombres.
  const nombresParametros = estado.parametros.map((p) => p.nombre).join('\u0000');
  const compilado = useMemo(
    () => compilarCampo(estado.campo, nombresParametros ? nombresParametros.split('\u0000') : []),
    [estado.campo, nombresParametros],
  );
  const campo = compilado.ok ? compilado.campo : null;
  const malla = calculo.malla;

  // Al cambiar el dominio, la cámara se reencuadra con transición (salvo movimiento reducido) (F4.3),
  // salvo que se acabe de aplicar una cámara (configuración abierta, autoguardado o «Deshacer»).
  const dominioPrevio = useRef<Dominio | null>(null);
  const camaraPendiente = useRef<(EstadoCamara & { tipo?: Proyeccion }) | null>(inicio.estado.camara);
  const aplicarCamara = useCallback(
    (c: EstadoCamara & { tipo?: Proyeccion }) => {
      camaraPendiente.current = c;
      controlador?.fijarCamara(c);
      if (c.tipo) controlador?.fijarProyeccion(c.tipo);
    },
    [controlador],
  );
  useEffect(() => {
    if (!controlador) return;
    const previo = dominioPrevio.current;
    controlador.fijarDominio(estado.dominio, false);
    const pendiente = camaraPendiente.current;
    if (pendiente) {
      controlador.fijarCamara(pendiente);
      if (pendiente.tipo) controlador.fijarProyeccion(pendiente.tipo);
    }
    else if (previo && previo !== estado.dominio) controlador.reencuadrar(true);
    dominioPrevio.current = estado.dominio;
  }, [controlador, estado.dominio]);
  // La cámara pendiente solo vale para la confirmación en curso.
  useEffect(() => {
    if (controlador) camaraPendiente.current = null;
  });

  useEffect(() => {
    controlador?.fijarMovimientoReducido(movimientoReducido);
  }, [controlador, movimientoReducido]);

  // «Flechas: solo corte» sustituye las flechas del volumen por las del plano (DESIGN §9.5).
  const soloCorte = estado.corte.activo && estado.corte.flechas === 'corte';
  useEffect(() => {
    controlador?.fijarFlechas(estado.capas.flechas && malla && !soloCorte ? malla.instancias : null);
  }, [controlador, malla, estado.capas.flechas, soloCorte]);

  const corte = estado.corte;
  const dominio = estado.dominio;
  useEffect(() => {
    if (!controlador) return;
    const d = corte.activo ? { plano: corte.plano, c: corte.c, dominio } : null;
    controlador.fijarCorte(d, d && soloCorte && estado.capas.flechas ? (malla?.corte?.instancias ?? null) : null);
  }, [controlador, corte, dominio, soloCorte, malla, estado.capas.flechas]);

  const lineas = calculo.lineas;
  useEffect(() => {
    controlador?.fijarLineas(estado.capas.lineas && lineas ? lineas.geometria : null);
  }, [controlador, lineas, estado.capas.lineas]);

  // Animación del campo (REN-08): partículas y rueda de paletas con un reloj común. Con
  // movimiento reducido arranca en pausa (DESIGN §8); en modo captura el reloj es determinista.
  const [animando, setAnimando] = useState(() => !movimientoReducido);
  const [animacion] = useState(() => new Animacion(modoCaptura()));
  useEffect(() => () => animacion.destruir(), [animacion]);
  useEffect(() => {
    animacion.fijarSalida(
      controlador
        ? (f) => {
            controlador.fijarParticulas(f.sistema);
            controlador.fijarAnguloRueda(f.anguloRueda);
          }
        : null,
    );
  }, [animacion, controlador]);
  const valoresParametros = useMemo(() => Float64Array.from(estado.parametros.map((p) => p.valor)), [estado.parametros]);
  const punto = estado.punto;
  // Valores en P (INS-02): se recalculan en vivo con los parámetros.
  const inspeccion = useMemo(() => {
    if (!campo || !punto) return null;
    const L = Math.min(...[0, 1, 2].map((k) => (dominio.max[k] as number) - (dominio.min[k] as number))) / 2;
    return inspeccionar(campo, valoresParametros, punto, L);
  }, [campo, punto, valoresParametros, dominio]);
  // Rueda en P: eje = sentido de ∇×F(P), ω = ½‖∇×F(P)‖ (SPEC §3.4).
  const rueda = useMemo(() => (inspeccion && conDerivadas(inspeccion) ? datosRueda(inspeccion.derivadas.rot) : null), [inspeccion]);
  const capaParticulas = estado.capas.particulas;
  const opcionesParticulas = estado.particulas;
  const definicion = estado.campo;
  useEffect(() => {
    // Con una edición inválida se conserva la última animación válida.
    if (!campo || !malla) return;
    animacion.configurar({
      campo,
      p: valoresParametros,
      dominio,
      n: capaParticulas ? opcionesParticulas.n : 0,
      semilla: opcionesParticulas.semilla,
      tau: opcionesParticulas.tau ?? malla.deltaRef / malla.escala.ref,
      fRef: malla.escala.ref,
      delta: malla.deltaRef,
      omegaRueda: rueda?.omega ?? null,
      clave: JSON.stringify([dominio, opcionesParticulas.n, opcionesParticulas.semilla]),
      claveCampo: JSON.stringify([definicion, Array.from(valoresParametros)]),
    });
  }, [animacion, campo, malla, valoresParametros, dominio, capaParticulas, opcionesParticulas, rueda, definicion]);
  useEffect(() => {
    controlador?.fijarRueda(rueda && punto && malla ? { centro: punto, eje: rueda.eje, radio: 0.45 * malla.deltaRef, omega: rueda.omega } : null);
  }, [controlador, rueda, punto, malla]);
  const hayAnimacion = capaParticulas || rueda !== null;

  // Marcas de P (INS-01): aro, cruz, rótulo y glifo exacto del modo vigente (F o rot F).
  const modoGlifosP = estado.capas.glifos;
  const modoLongitud = estado.flechas.modo;
  const modoLuminancia = estado.flechas.luminancia;
  useEffect(() => {
    if (!controlador) return;
    if (!inspeccion || !malla) {
      controlador.fijarSeleccion(null);
      return;
    }
    let flecha = null;
    const rot = modoGlifosP === 'rotacional';
    const v = !inspeccion.definido ? null : rot ? (conDerivadas(inspeccion) ? inspeccion.derivadas.rot : null) : inspeccion.F;
    if (v) {
      const m = Math.hypot(v[0], v[1], v[2]);
      flecha = calcularFlechas(
        { total: 1, pos: inspeccion.punto, F: v, mag: [m], clase: [CLASE.VALIDO] },
        { fRef: malla.escalaGlifos.ref, modo: modoLongitud, luminancia: modoLuminancia, lMax: malla.lMax },
      );
      if (rot) flecha.anillos = anillosRotacional(flecha, malla.lMax);
    }
    controlador.fijarSeleccion({ punto: inspeccion.punto, dominio, flecha });
  }, [controlador, inspeccion, malla, dominio, modoGlifosP, modoLongitud, modoLuminancia]);

  // Elegir P con un clic (flecha → su nodo exacto; plano de corte → punto del plano) y moverlo
  // con Alt + flechas / Alt + RePág / AvPág en pasos de Δ (F7).
  useEffect(() => {
    if (!controlador) return;
    const quitarClic = controlador.alClic((x, y) => {
      const sel = controlador.elegir(x, y);
      const m = almacenCalculo.obtener().malla;
      let P: Vec3 | null = null;
      if (sel?.tipo === 'flecha' && m) P = [m.pos[3 * sel.nodo] as number, m.pos[3 * sel.nodo + 1] as number, m.pos[3 * sel.nodo + 2] as number];
      else if (sel?.tipo === 'flechaCorte' && m?.corte) P = puntoDeRejillaCorte(almacen.obtener(), m.corte.total, sel.nodo);
      else if (sel?.tipo === 'corte') P = sel.punto;
      if (P) {
        const q = P;
        almacen.fijar((s) => fijarPunto(s, q));
      }
    });
    const quitarTecla = controlador.alTecla((e) => {
      const delta = almacenCalculo.obtener().malla?.deltaRef;
      if (!e.altKey && !e.ctrlKey && !e.metaKey) {
        // Escena enfocada (PLAN §3.1): flechas = orbitar 5°; Mayús + flechas = desplazar; + − = acercar.
        const giro: Record<string, [number, number]> = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] };
        const paso: Record<string, [number, number]> = { ArrowLeft: [-0.05, 0], ArrowRight: [0.05, 0], ArrowUp: [0, 0.05], ArrowDown: [0, -0.05] };
        if (giro[e.key]) {
          e.preventDefault();
          if (e.shiftKey) controlador.desplazar(...(paso[e.key] as [number, number]));
          else controlador.orbitar(...(giro[e.key] as [number, number]));
          return;
        }
        if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '−') {
          e.preventDefault();
          controlador.acercar(e.key === '+' || e.key === '=' ? 0.9 : 1 / 0.9);
          return;
        }
        if (e.key === 'Enter') {
          // El nodo cuya proyección cae más cerca del centro de la vista (a igualdad, el más cercano a la cámara).
          const m = almacenCalculo.obtener().malla;
          if (!m) return;
          e.preventDefault();
          const { ancho, alto } = controlador.tamanoPantalla;
          const cam = controlador.obtenerCamara().posicion;
          let mejor = -1;
          let dMejor = Infinity;
          let profMejor = Infinity;
          for (let i = 0; i < m.total; i++) {
            const p: Vec3 = [m.pos[3 * i] as number, m.pos[3 * i + 1] as number, m.pos[3 * i + 2] as number];
            const [x, y] = controlador.proyectar(p);
            const d = Math.hypot(x - ancho / 2, y - alto / 2);
            const prof = Math.hypot(p[0] - cam[0], p[1] - cam[1], p[2] - cam[2]);
            if (d < dMejor - 0.5 || (Math.abs(d - dMejor) <= 0.5 && prof < profMejor)) {
              mejor = i;
              dMejor = d;
              profMejor = prof;
            }
          }
          if (mejor >= 0) {
            const P: Vec3 = [m.pos[3 * mejor] as number, m.pos[3 * mejor + 1] as number, m.pos[3 * mejor + 2] as number];
            almacen.fijar((s) => fijarPunto(s, P));
          }
          return;
        }
      }
      if (e.altKey && delta) {
        const mov: Record<string, [0 | 1 | 2, number]> = {
          ArrowLeft: [0, -1],
          ArrowRight: [0, 1],
          ArrowDown: [1, -1],
          ArrowUp: [1, 1],
          PageDown: [2, -1],
          PageUp: [2, 1],
        };
        const m = mov[e.key];
        if (m) {
          e.preventDefault();
          almacen.fijar((s) => moverPunto(s, m[0], m[1] * delta));
        }
      }
    });
    return () => {
      quitarClic();
      quitarTecla();
    };
  }, [controlador, almacen, almacenCalculo]);
  const [enfocarInspector, setEnfocarInspector] = useState(0);
  const abrirInspector = useCallback(() => {
    almacen.fijar((s) => (s.punto ? s : fijarPunto(s, centroDominio(s.dominio))));
    setEnfocarInspector((n) => n + 1);
  }, [almacen]);
  const cerrarInspector = useCallback(() => {
    almacen.fijar((s) => fijarPunto(s, null));
    document.querySelector<HTMLElement>('[data-prueba="lienzo"]')?.focus();
  }, [almacen]);
  const alPuntoInspector = useCallback((p: Vec3) => almacen.fijar((s) => fijarPunto(s, p)), [almacen]);
  const copiarValores = useCallback(
    (texto: string) => {
      const avisar = (ok: boolean) => notificador.notificar({ tipo: ok ? 'exito' : 'error', texto: ok ? T.inspector.copiados : T.inspector.noCopiados, clave: 'copiar' });
      // Portapapeles asíncrono y, si no está (algunos navegadores con file://), el método clásico.
      const clasico = () => {
        const area = document.createElement('textarea');
        area.value = texto;
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        area.remove();
        avisar(ok);
      };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(texto).then(() => avisar(true), clasico);
      else clasico();
    },
    [notificador],
  );
  useEffect(() => {
    animacion.fijarEnMarcha(animando);
    controlador?.fijarPausaRueda(!animando);
  }, [animacion, animando, controlador]);
  const conmutarAnimacion = useCallback(() => setAnimando((a) => !a), []);
  // Proyección (RF-13, tecla 5): vive en el controlador, como la pose de la cámara.
  const [ortografica, setOrtografica] = useState(false);
  useEffect(() => {
    if (!controlador) return;
    const actualizar = () => setOrtografica(controlador.proyeccion === 'ortografica');
    actualizar();
    return controlador.alCambiarCamara(actualizar);
  }, [controlador]);
  const conmutarProyeccion = useCallback(() => {
    controlador?.fijarProyeccion(controlador.proyeccion === 'ortografica' ? 'perspectiva' : 'ortografica');
  }, [controlador]);

  // Composición según el ancho (VIS-06): panel lateral, cajón superpuesto u hoja inferior.
  const nivel = useNivelPantalla();
  const modoPanel = nivel === 'consulta' ? 'hoja' : panelFlotante(nivel) ? 'cajon' : 'lateral';
  const [panelAbierto, setPanelAbierto] = useState(nivel !== 'consulta');
  const [nivelPrevio, setNivelPrevio] = useState(nivel);
  if (nivel !== nivelPrevio) {
    // Al cambiar de nivel: el cajón empieza abierto (DESIGN §5.4) y la hoja, plegada.
    setNivelPrevio(nivel);
    setPanelAbierto(nivel !== 'consulta');
  }
  const conmutarPanel = useCallback(() => setPanelAbierto((a) => !a), []);

  // Cajón de ayuda (UI-06): se abre en un apartado desde los «?», con «Ayuda», ? o F1.
  const [ayuda, setAyuda] = useState<EstadoAyuda | null>(null);
  const origenAyuda = useRef<HTMLElement | null>(null);
  const abrirAyuda = useCallback((apartado?: IdApartado) => {
    const activo = document.activeElement;
    if (activo instanceof HTMLElement && !activo.closest('[data-prueba="ayuda"]')) origenAyuda.current = activo;
    const a = apartado ? apartadoPorId(apartado) : undefined;
    // Con el panel como cajón, los dos cajones no caben a la vez: el de ayuda lo pliega (D-53).
    if (panelFlotante(nivelPantalla()) && nivelPantalla() !== 'consulta') setPanelAbierto(false);
    setAyuda((previa) => ({ pestana: a?.pestana ?? previa?.pestana ?? 'conceptos', apartado: a?.id ?? null, vez: (previa?.vez ?? 0) + 1 }));
  }, []);
  const cerrarAyuda = useCallback(() => {
    setAyuda(null);
    const o = origenAyuda.current;
    origenAyuda.current = null;
    if (o?.isConnected) o.focus();
  }, []);
  const abrirAyudaGeneral = useCallback(() => abrirAyuda(), [abrirAyuda]);
  const elegirPestana = useCallback((pestana: Pestana) => setAyuda((a) => (a ? { ...a, pestana, apartado: null } : a)), []);
  const ayudaAbierta = ayuda !== null;
  // Esc cierra lo último abierto (PLAN §3.1): menú y diálogo se cierran solos; luego el cajón y luego
  // el inspector. Los controles que usan Esc (campos, listas, descripciones) lo consumen antes.
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('dialog[open]')) return;
      if (ayudaAbierta) {
        e.preventDefault();
        cerrarAyuda();
      } else if (almacen.obtener().punto && !enCampoDeTexto(e.target)) {
        e.preventDefault();
        almacen.fijar((s) => fijarPunto(s, null));
      }
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [ayudaAbierta, cerrarAyuda, almacen]);

  const { acciones, restablecer, ofrecerDeshacer } = useEdicion(almacen, controlador, notificador);
  const { exportarJson, elegirArchivo, entrada, alElegir, errores: erroresApertura, cerrarErrores, arrastrando } = useArchivo({
    almacen,
    controlador,
    notificador,
    ofrecerDeshacer,
    aplicarCamara,
    // Ni las capturas ni las mediciones deben pisar el experimento autoguardado del usuario.
    autoguardado: !modoCaptura() && !perf,
    recuperado: inicio.recuperado,
  });
  const vista = useCallback((v: Vista) => controlador?.irAVista(v), [controlador]);
  const cancelarLineas = useCallback(() => orquestador?.cancelarLineas(), [orquestador]);
  const atajosLetras = useMemo(
    () => ({
      f: () => almacen.fijar((s) => fijarCapa(s, 'flechas', !s.capas.flechas)),
      l: () => almacen.fijar((s) => fijarCapa(s, 'lineas', !s.capas.lineas)),
      p: () => almacen.fijar((s) => fijarCapa(s, 'particulas', !s.capas.particulas)),
      g: () => almacen.fijar((s) => fijarGlifos(s, s.capas.glifos === 'campo' ? 'rotacional' : 'campo')),
      c: () => almacen.fijar((s) => fijarCorte(s, { activo: !s.corte.activo })),
      i: abrirInspector,
      ' ': conmutarAnimacion,
      '?': () => abrirAyuda(),
      F1: () => abrirAyuda(),
      '5': conmutarProyeccion,
    }),
    [almacen, conmutarAnimacion, abrirInspector, abrirAyuda, conmutarProyeccion],
  );
  // Preferencia de teclado (WCAG 2.1.4), fuera del experimento: se recuerda en el navegador si se puede.
  const [atajosUnaTecla, setAtajosUnaTecla] = useState(() => leerPreferencia(CLAVE_ATAJOS) !== 'no');
  const cambiarAtajos = useCallback((activos: boolean) => {
    setAtajosUnaTecla(activos);
    guardarPreferencia(CLAVE_ATAJOS, activos ? 'si' : 'no');
  }, []);
  useAtajos(restablecer.camara, vista, atajosLetras, atajosUnaTecla);
  const parametrosPorDefecto = estado.parametros.every((p) => p.valor === p.porDefecto);
  const opcionesRestablecer = useMemo(
    () => [
      { id: 'camara', texto: T.restablecer.camara, atajo: 'R', alElegir: restablecer.camara },
      {
        id: 'parametros',
        texto: T.restablecer.parametros,
        deshabilitado: parametrosPorDefecto,
        motivo: T.restablecer.parametrosPorDefecto,
        alElegir: restablecer.parametros,
      },
      { id: 'experimento', texto: T.restablecer.experimento, alElegir: restablecer.experimento },
    ],
    [restablecer, parametrosPorDefecto],
  );

  // Gancho de pruebas: listo cuando hay escena, fuentes, cliente de cálculo y una malla dibujada.
  const hayMalla = malla !== null;
  // Medición de rendimiento (VAL-03): contexto en cuanto la interfaz es interactiva; el arranque
  // se mide desde el inicio de la navegación hasta ese momento (V-PERF-06).
  const [contextoMedicion, setContextoMedicion] = useState<ContextoMedicion | null>(null);
  useEffect(() => {
    if (!perf || contextoMedicion || !controlador || !fuentesListas || !cliente || !orquestador || !hayMalla) return;
    const arranqueMs = performance.now();
    const id = requestAnimationFrame(() =>
      setContextoMedicion({ escena: perf, controlador, cliente, orquestador, almacen, calculo: almacenCalculo, animacion, arranqueMs }),
    );
    return () => cancelAnimationFrame(id);
  }, [perf, contextoMedicion, controlador, fuentesListas, cliente, orquestador, hayMalla, almacen, almacenCalculo, animacion]);
  useEffect(() => {
    if (!modoPrueba() || !controlador || !fuentesListas || !cliente || !orquestador || !hayMalla) return;
    controlador.dibujar();
    const mallaActual = () => almacenCalculo.obtener().malla;
    publicarGancho({
      listo: true,
      modoCalculo: cliente.modo,
      estado: () => almacen.obtener(),
      escena: () => controlador.estadisticas(),
      seleccionarCampo: (id: IdCampo) => almacen.fijar((s) => seleccionarCampo(s, id)),
      fijarEstado: (f: (s: EstadoExperimento) => EstadoExperimento) => almacen.fijar(f),
      vista: (v: Vista) => controlador.irAVista(v, false),
      resultados: () => almacenCalculo.obtener(),
      suscribirCalculo: (escucha: (s: EstadoCalculo) => void) => almacenCalculo.suscribir(() => escucha(almacenCalculo.obtener())),
      cancelarLineas: () => orquestador.cancelarLineas(),
      camara: () => controlador.obtenerCamara(),
      fijarCamara: (c: EstadoCamara) => controlador.fijarCamara(c),
      proyectar: (x: number, y: number, z: number) => controlador.proyectar([x, y, z]),
      auditarEscena: () => controlador.auditarEscena(),
      elegir: (x: number, y: number) => controlador.elegir(x, y),
      conosProyectados: () => controlador.conosProyectados(),
      flechaDibujada: (k: number, seleccion?: boolean) => controlador.flechaDibujada(k, seleccion),
      /** Reloj determinista de la animación: avanza `segundos` en pasos de 1/60 s. */
      avanzarAnimacion: (segundos: number) => animacion.avanzarFijo(segundos),
      animacion: () => ({ enMarcha: animacion.enMarcha, tau: animacion.tau, tiempo: animacion.tiempo, anguloRueda: animacion.anguloRueda }),
      /** Posición y edad de cada partícula (para seguirlas entre pasos del reloj). */
      particulas: () => {
        const s = animacion.particulas;
        return s ? { n: s.n, pos: Array.from(s.pos), edad: Array.from(s.edad), renacimientos: s.renacimientos } : null;
      },
      dibujar: () => controlador.dibujar(),
      /** Programas de shader vivos (ids): cambiar el dominio no debe obligar a recompilarlos. */
      programas: () => (controlador.renderer.info.programs ?? []).map((p) => p.id),
      notificaciones: () => notificador.almacen.obtener().map((n) => ({ tipo: n.tipo, texto: n.texto, accion: n.accion?.texto ?? null })),
      medidasCancelacion: () => [...cliente.medidasCancelacion],
      pendiente: () => orquestador.pendiente,
      calculo: () => {
        const r = mallaActual();
        return r && { fRef: r.escala.ref, origen: r.escala.origen, lMax: r.lMax, recuento: r.recuento, ms: r.ms };
      },
      /** Huella exacta de la malla aplicada en la escena. */
      huellaMallaAplicada: () => {
        const r = mallaActual();
        return r && huellaMalla(r);
      },
      /** Huella de la malla de un estado calculada aparte, en un worker nuevo o en el hilo principal. */
      huellaMallaCon: async (modo: 'worker' | 'local', e?: EstadoExperimento) => {
        const cli = modo === 'local' ? ClienteCalculo.local() : await ClienteCalculo.crear();
        try {
          if (cli.modo !== (modo === 'local' ? 'hilo-principal' : 'worker')) throw new Error(`sin ${modo}`);
          const r = await cli.malla(peticionMalla(e ?? almacen.obtener()));
          return r && huellaMalla(r);
        } finally {
          cli.terminar();
        }
      },
      /** Geometría de las líneas aplicadas (cheurones, tangentes, semillas y finales) y sus motivos. */
      lineasDibujadas: () => {
        const l = almacenCalculo.obtener().lineas;
        if (!l) return null;
        const g = l.geometria;
        return {
          nLineas: l.nLineas,
          vertices: l.posiciones.length / 3,
          limiteVertices: l.limiteVertices,
          recuentoMotivos: l.recuentoMotivos,
          cheurones: Array.from(g.cheurones),
          tangentes: Array.from(g.tangentes),
          semillas: Array.from(g.semillas),
          formasFinales: Array.from(g.formasFinales),
        };
      },
      /** F en un punto cualquiera con el campo aplicado (null si no compila). */
      campoEn: (x: number, y: number, z: number) => {
        const r = compilarCampo(almacen.obtener().campo, almacen.obtener().parametros.map((p) => p.nombre));
        if (!r.ok) return null;
        const out = new Float64Array(3);
        r.campo.F(x, y, z, Float64Array.from(almacen.obtener().parametros.map((p) => p.valor)), out, 0);
        return Array.from(out);
      },
      /** F y ‖F‖ en el nodo de coordenadas exactas (x, y, z), o null si no es un nodo. */
      campoEnNodo: (x: number, y: number, z: number) => {
        const r = mallaActual();
        if (!r) return null;
        for (let i = 0; i < r.total; i++) {
          if (r.pos[3 * i] === x && r.pos[3 * i + 1] === y && r.pos[3 * i + 2] === z) {
            return { F: [r.F[3 * i], r.F[3 * i + 1], r.F[3 * i + 2]], mag: r.mag[i] };
          }
        }
        return null;
      },
      /** Anillos de rot F tal como se dibujan: centro, eje y puntas orientadas hacia la cámara. */
      anillos: () => {
        const inst = controlador.flechas.instancias;
        const a = inst?.anillos;
        if (!inst || !a) return null;
        const d = controlador.flechas.puntasDibujadas;
        return { n: a.n, centro: Array.from(a.centro), dir: Array.from(inst.dir.subarray(0, 3 * a.n)), punta: d.punta, tangente: d.tangente, dibujados: controlador.flechas.anillos.count };
      },
      /** Flechas «solo corte»: centro (nodo del plano) y dirección de cada una. */
      flechasCorte: () => {
        const inst = mallaActual()?.corte?.instancias;
        if (!inst) return null;
        const centros: number[] = [];
        for (let k = 0; k < inst.n; k++) {
          for (let j = 0; j < 3; j++) centros.push((inst.cola[3 * k + j] as number) + ((inst.dir[3 * k + j] as number) * (inst.largo[k] as number)) / 2);
        }
        return { n: inst.n, centros, dir: Array.from(inst.dir.subarray(0, 3 * inst.n)) };
      },
      flecha: (k: number) => {
        const r = mallaActual();
        if (!r || k >= r.instancias.n) return null;
        const inst = r.instancias;
        const i = inst.nodo[k] as number;
        return {
          nodo: i,
          pos: [r.pos[3 * i], r.pos[3 * i + 1], r.pos[3 * i + 2]],
          F: [r.F[3 * i], r.F[3 * i + 1], r.F[3 * i + 2]],
          mag: r.mag[i],
          dir: [inst.dir[3 * k], inst.dir[3 * k + 1], inst.dir[3 * k + 2]],
          largo: inst.largo[k],
          gris: inst.gris[k],
        };
      },
    });
  }, [controlador, fuentesListas, cliente, orquestador, hayMalla, almacen, almacenCalculo, notificador, animacion]);

  const modoFlechas = estado.flechas.modo;
  const luminancia = estado.flechas.luminancia;
  // La escala de los glifos dibujados: F_ref con «Glifos: F», C_ref con «Glifos: rot F».
  const modoGlifos = estado.capas.glifos;
  const escalaEstado = modoGlifos === 'rotacional' ? estado.flechas.escalaRot : estado.flechas.escala;
  const deltaFija = escalaEstado.tipo === 'fija' ? (escalaEstado.delta ?? null) : null;
  const capaFlechas = estado.capas.flechas;
  const escalaActual = useMemo(() => (malla ? { fRef: malla.escala.ref, delta: malla.deltaRef } : null), [malla]);
  // Candado de la leyenda: congela la escala de los glifos dibujados (F_ref o C_ref) y Δ, o
  // vuelve a la automática (DESIGN §9.10).
  const fijarEscala = useCallback(
    (fija: boolean) => {
      const m = almacenCalculo.obtener().malla;
      const escala = fija && m ? { tipo: 'fija' as const, valor: m.escalaGlifos.ref, delta: m.deltaRef } : { tipo: 'auto' as const };
      acciones.alFlechas(m?.glifos === 'rotacional' ? { escalaRot: escala } : { escala });
    },
    [almacenCalculo, acciones],
  );
  const capaLineas = estado.capas.lineas;
  const actualizandoLineas = calculo.progresoLineas !== null;
  // «Detalles del cálculo» de las líneas (UI-08).
  const detallesLineas = useMemo(
    () =>
      lineas
        ? {
            nLineas: lineas.nLineas,
            semillas: lineas.semillas,
            recuentoMotivos: lineas.recuentoMotivos,
            vertices: lineas.posiciones.length / 3,
            limiteVertices: lineas.limiteVertices,
            paso: lineas.paso,
            ms: lineas.ms,
          }
        : null,
    [lineas],
  );

  // Mapa escalar del corte (REN-06): V_ref automática (P95 del corte) o fijada en la leyenda.
  const resultadoCorte = calculo.corte;
  const nodosMalla = estado.muestreo.n;
  const datosEscalar = useMemo<DatosEscalar | null>(() => {
    const e = resultadoCorte?.escalar;
    if (!corte.activo || corte.escalar === 'ninguno' || !resultadoCorte || !e) return null;
    const { u, v } = EJES_PLANO[resultadoCorte.plano];
    const N = Math.max(nodosMalla[u], nodosMalla[v]);
    return {
      tipo: e.tipo,
      nulo: e.nulo && corte.escala.tipo === 'auto',
      rejilla: { plano: resultadoCorte.plano, c: resultadoCorte.c, dominio: resultadoCorte.dominio, lado: e.lado, valores: e.valores, estado: e.estado },
      vRef: corte.escala.tipo === 'fija' ? corte.escala.valor : e.vRef,
      contorno: resultadoCorte.contorno,
      // Los glifos se apartan de los nodos de las flechas que se ven (las del plano o las del volumen).
      nodos: corte.flechas === 'corte' ? [N, N] : [nodosMalla[u], nodosMalla[v]],
    };
  }, [resultadoCorte, corte.activo, corte.escalar, corte.escala, corte.flechas, nodosMalla]);
  useEffect(() => {
    controlador?.fijarEscalarCorte(datosEscalar);
  }, [controlador, datosEscalar]);
  const fijarVRef = useCallback(
    (fija: boolean) => {
      acciones.alCorte({ escala: fija && datosEscalar ? { tipo: 'fija', valor: datosEscalar.vRef } : { tipo: 'auto' } });
    },
    [acciones, datosEscalar],
  );

  const datosLeyenda = useMemo(() => {
    if (!malla) return null;
    const finales = lineas?.geometria.formasFinales;
    const contar = (f: number) => (finales ? finales.reduce((n, x) => n + (x === f ? 1 : 0), 0) : 0);
    // Con «solo corte» se ven las flechas del plano: sus marcas, su recuento y su ℓmax.
    const conCorte = soloCorte && malla.corte;
    const inst = conCorte ? malla.corte!.instancias : malla.instancias;
    const d = datosEscalar;
    return {
      glifos: malla.glifos,
      escala: malla.escalaGlifos,
      lMax: conCorte ? malla.corte!.lMax : malla.lMax,
      modo: modoFlechas,
      luminancia,
      deltaRef: malla.deltaRef,
      deltaFija,
      ceros: inst.ceros.length / 3,
      indefinidos: inst.indefinidos.length / 3,
      saturadas: inst.nSaturadas,
      flechas: capaFlechas,
      nFlechas: inst.n,
      lineas:
        capaLineas && lineas && lineas.nLineas > 0
          ? { finalesCero: contar(FINAL.ROMBO), finalesIndefinidos: contar(FINAL.ASPA), actualizando: actualizandoLineas }
          : null,
      particulas: capaParticulas ? { tau: opcionesParticulas.tau ?? malla.deltaRef / malla.escala.ref, enPausa: !animando } : null,
      corte: d
        ? {
            tipo: d.tipo,
            rotulo: rotuloCorte(d.rejilla.plano, d.rejilla.c),
            eje: NOMBRE_EJE[EJES_PLANO[d.rejilla.plano].n],
            vRef: d.vRef,
            fija: corte.escala.tipo === 'fija',
            sinValor: Array.prototype.some.call(d.rejilla.estado, (x: number) => x !== 0),
            signos: signosPresentes(d),
            nulo: d.nulo,
          }
        : null,
    };
  }, [malla, modoFlechas, luminancia, deltaFija, capaFlechas, capaLineas, lineas, actualizandoLineas, soloCorte, datosEscalar, corte.escala, capaParticulas, opcionesParticulas, animando]);


  const png = useExportarPng({ controlador, estado, campo, datosLeyenda, notificador });
  const { abrir: abrirPng, ultima: ultimaPng } = png;
  const opcionesExportar = useMemo(
    () => [
      { id: 'png', texto: T.archivo.imagen, alElegir: abrirPng },
      { id: 'json', texto: T.archivo.configuracion, alElegir: exportarJson },
    ],
    [abrirPng, exportarJson],
  );
  useEffect(() => {
    if (modoPrueba()) publicarGancho({ ultimaExportacionPng: () => ultimaPng.current });
  }, [ultimaPng]);

  const estadoBarra: EstadoCalculoBarra = useMemo(() => {
    if (calculo.error) return { tipo: 'error', texto: calculo.error };
    if (calculo.progresoLineas !== null) {
      return { tipo: 'calculando', texto: `${T.estado.calculandoLineas} ${Math.round(100 * calculo.progresoLineas)} %`, cancelable: true };
    }
    if (!malla) return { tipo: 'calculando', texto: T.estado.calculando };
    if (malla.escala.nulo) return { tipo: 'aviso', texto: T.estado.campoNulo };
    const r = malla.recuento;
    const sinDefinir = r.noDefinidos + r.singulares;
    if (sinDefinir > 0) return { tipo: 'aviso', texto: T.estado.sinDefinir(sinDefinir, malla.total) };
    if (calculo.lineasCanceladas) return { tipo: 'aviso', texto: T.estado.lineasCanceladas };
    return { tipo: 'listo', texto: `${T.estado.listo} · ${T.estado.nodos(malla.total)}` };
  }, [calculo.error, calculo.progresoLineas, calculo.lineasCanceladas, malla]);

  return (
    <ContextoAyuda.Provider value={abrirAyuda}>
      <div className={ayuda ? 'app con-ayuda' : 'app'} data-nivel={nivel} data-panel={modoPanel === 'lateral' || panelAbierto ? 'abierto' : 'cerrado'}>
        <a className="saltar" href="#escena">
          {T.saltarEscena}
        </a>
        <BarraSuperior
          nombre={estado.nombre}
          estadoCalculo={estadoBarra}
          restablecer={opcionesRestablecer}
          exportar={opcionesExportar}
          alAbrir={elegirArchivo}
          alAyuda={abrirAyudaGeneral}
        nivel={nivel}
        panelAbierto={panelAbierto}
        alPanel={conmutarPanel}
          alCancelar={cancelarLineas}
        />
        <input ref={entrada} type="file" accept=".json,application/json" hidden onChange={alElegir} data-prueba="entrada-archivo" />
        {erroresApertura ? (
          <DialogoErrores
            {...erroresApertura}
            alCerrar={cerrarErrores}
            alElegirOtro={() => {
              cerrarErrores();
              elegirArchivo();
            }}
          />
        ) : null}
        {png.abierto ? (
          <DialogoPng
            opciones={png.opciones}
            pantalla={png.pantalla}
            vistaPrevia={png.vistaPrevia}
            progreso={png.progreso}
            exportando={png.exportando}
            alCambiar={png.setOpciones}
            alExportar={png.exportar}
            alCerrar={png.cerrar}
          />
        ) : null}
        {arrastrando ? (
          <div className="soltar-archivo" aria-hidden="true">
            <p>{T.archivo.soltar}</p>
          </div>
        ) : null}
        <Panel estado={estado} campo={campo} acciones={acciones} edicionInvalida={edicionInvalida} escalaActual={escalaActual} detallesLineas={detallesLineas} atajos={atajosUnaTecla} alAtajos={cambiarAtajos} modo={modoPanel} abierto={panelAbierto} alConmutar={conmutarPanel} />
        <VistaEscena
          fuentes={fuentes}
          movimientoReducido={movimientoReducido}
          resumen={T.escena.resumen(estado.nombre, malla?.instancias.n ?? 0)}
          error={errorEscena}
          alControlador={alControlador}
        >
          {(hayEdicionInvalida || calculo.error) && malla ? <AvisoEscena>{T.escena.ultimoValido}</AvisoEscena> : null}
          {!malla && !calculo.error ? <Carga /> : null}
          {malla && malla.recuento.validos + malla.recuento.ceros === 0 ? (
            <EstadoVacio
              icono={FileQuestion}
              titulo={T.escena.sinDatosTitulo}
              texto={T.escena.sinDatosTexto}
              acciones={
                <Boton variante="secundario" onClick={restablecer.experimento}>
                  {T.escena.restablecerEjemplo}
                </Boton>
              }
            />
          ) : malla?.escala.nulo ? (
            <EstadoVacio
              icono={CircleOff}
              titulo={T.escena.nuloTitulo}
              texto={T.escena.nuloTexto}
              acciones={
                <Boton variante="secundario" onClick={restablecer.experimento}>
                  {T.escena.restablecerEjemplo}
                </Boton>
              }
            />
          ) : null}
          <Notificaciones notificador={notificador} />
          {hayAnimacion ? (
            <p className="solo-lector" aria-live="polite" data-prueba="anuncio-animacion">
              {animando ? T.vistas.enMarcha : T.vistas.enPausa}
            </p>
          ) : null}
          {inspeccion && malla ? (
            <Inspector
              inspeccion={inspeccion}
              cifras={estado.cifras}
              fRef={malla.escala.ref}
              dominio={dominio}
              enfocar={enfocarInspector}
              alPunto={alPuntoInspector}
              alCerrar={cerrarInspector}
              alCopiar={copiarValores}
              jacobianaAbierta={nivel === 'amplio'}
            />
          ) : null}
          {ayuda ? <Ayuda estado={ayuda} alPestana={elegirPestana} alCerrar={cerrarAyuda} /> : null}
          {perf ? <PanelRendimiento contexto={contextoMedicion} /> : null}
          {datosLeyenda ? <Leyenda datos={datosLeyenda} controlador={controlador} alFijarEscala={fijarEscala} alFijarVRef={fijarVRef} plegadaInicial={nivel === 'compacto' || nivel === 'consulta'} /> : null}
          <div className="esquina-inferior-derecha">
            <BarraEscena alEncuadrar={restablecer.camara} alVista={vista} ortografica={ortografica} alProyeccion={conmutarProyeccion} animando={animando} hayAnimacion={hayAnimacion} alAnimar={conmutarAnimacion} alInspeccionar={abrirInspector} />
            <Triedro controlador={controlador} />
          </div>
        </VistaEscena>
      </div>
    </ContextoAyuda.Provider>
  );
}
