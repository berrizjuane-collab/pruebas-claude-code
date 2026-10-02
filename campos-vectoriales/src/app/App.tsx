import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleOff, FileQuestion } from 'lucide-react';
import { ClienteCalculo } from '../compute/client';
import { huellaMalla } from '../compute/huella';
import { FINAL } from '../geometria/lineas';
import { peticionMalla } from '../compute/peticiones';
import { CATALOGO, type IdCampo } from '../math/catalog';
import { compilarCampo } from '../math/field';
import type { ControladorEscena } from '../render/ControladorEscena';
import type { Vista } from '../render/camara';
import { EJES_PLANO, NOMBRE_EJE, type Dominio } from '../math/tipos';
import { rotuloCorte } from '../render/layers/corte';
import type { DatosEscalar } from '../render/layers/escalar';
import { UMBRAL_CERO } from '../geometria/escalar';
import { fijarCapa, fijarCorte, fijarGlifos, seleccionarCampo } from '../state/actions';
import { EXPERIMENTO_INICIAL, experimentoDesdeCatalogo, type EstadoExperimento } from '../state/schema';
import { crearAlmacen } from '../state/store';
import { T } from '../i18n/es';
import { useAlmacen, usePrefiereMovimientoReducido } from '../ui/hooks';
import { Panel } from '../ui/panel/Panel';
import { BarraSuperior, type EstadoCalculoBarra } from '../ui/topbar/BarraSuperior';
import { Boton } from '../ui/controls/Boton';
import { crearNotificador, Notificaciones } from '../ui/controls/Notificaciones';
import { AvisoEscena, Carga, EstadoVacio } from '../ui/scene/Mensajes';
import { BarraEscena } from '../ui/scene/BarraEscena';
import { Leyenda } from '../ui/scene/Leyenda';
import { Triedro } from '../ui/scene/Triedro';
import { VistaEscena } from '../ui/scene/VistaEscena';
import { ESTADO_CALCULO_INICIAL, Orquestador, type EstadoCalculo } from './orquestador';
import { modoPrueba, parametrosUrl, publicarGancho } from './pruebas';
import { useAtajos } from './atajos';
import { useEdicion } from './edicion';

/** Estado inicial: el helicoidal, o el campo pedido en la URL (`?campo=rotacional`). */
function estadoInicial(): EstadoExperimento {
  const pedido = parametrosUrl().get('campo');
  const id = CATALOGO.find((c) => c.id === pedido)?.id;
  return id ? experimentoDesdeCatalogo(id) : EXPERIMENTO_INICIAL;
}

interface Props {
  fuentes: Promise<void>;
}

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

export function App({ fuentes }: Props) {
  const almacen = useMemo(() => crearAlmacen(estadoInicial()), []);
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

  // Al cambiar el dominio, la cámara se reencuadra con transición (salvo movimiento reducido) (F4.3).
  const dominioPrevio = useRef<Dominio | null>(null);
  useEffect(() => {
    if (!controlador) return;
    const previo = dominioPrevio.current;
    controlador.fijarDominio(estado.dominio, false);
    if (previo && previo !== estado.dominio) controlador.reencuadrar(true);
    dominioPrevio.current = estado.dominio;
  }, [controlador, estado.dominio]);

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

  const { acciones, restablecer } = useEdicion(almacen, controlador, notificador);
  const vista = useCallback((v: Vista) => controlador?.irAVista(v), [controlador]);
  const cancelarLineas = useCallback(() => orquestador?.cancelarLineas(), [orquestador]);
  const atajosLetras = useMemo(
    () => ({
      f: () => almacen.fijar((s) => fijarCapa(s, 'flechas', !s.capas.flechas)),
      l: () => almacen.fijar((s) => fijarCapa(s, 'lineas', !s.capas.lineas)),
      p: () => almacen.fijar((s) => fijarCapa(s, 'particulas', !s.capas.particulas)),
      g: () => almacen.fijar((s) => fijarGlifos(s, s.capas.glifos === 'campo' ? 'rotacional' : 'campo')),
      c: () => almacen.fijar((s) => fijarCorte(s, { activo: !s.corte.activo })),
    }),
    [almacen],
  );
  useAtajos(restablecer.camara, vista, atajosLetras);
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
      proyectar: (x: number, y: number, z: number) => controlador.proyectar([x, y, z]),
      dibujar: () => controlador.dibujar(),
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
  }, [controlador, fuentesListas, cliente, orquestador, hayMalla, almacen, almacenCalculo, notificador]);

  const modoFlechas = estado.flechas.modo;
  const luminancia = estado.flechas.luminancia;
  const escalaEstado = estado.flechas.escala;
  const deltaFija = escalaEstado.tipo === 'fija' ? (escalaEstado.delta ?? null) : null;
  const capaFlechas = estado.capas.flechas;
  const escalaActual = useMemo(() => (malla ? { fRef: malla.escala.ref, delta: malla.deltaRef } : null), [malla]);
  // Candado de la leyenda: congela F_ref y Δ actuales o vuelve a la escala automática (DESIGN §9.10).
  const fijarEscala = useCallback(
    (fija: boolean) => {
      const m = almacenCalculo.obtener().malla;
      acciones.alFlechas({ escala: fija && m ? { tipo: 'fija', valor: m.escala.ref, delta: m.deltaRef } : { tipo: 'auto' } });
    },
    [almacenCalculo, acciones],
  );
  const capaLineas = estado.capas.lineas;
  const actualizandoLineas = calculo.progresoLineas !== null;

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
      escala: malla.escala,
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
  }, [malla, modoFlechas, luminancia, deltaFija, capaFlechas, capaLineas, lineas, actualizandoLineas, soloCorte, datosEscalar, corte.escala]);

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
    <div className="app">
      <a className="saltar" href="#escena">
        {T.saltarEscena}
      </a>
      <BarraSuperior nombre={estado.nombre} estadoCalculo={estadoBarra} restablecer={opcionesRestablecer} alCancelar={cancelarLineas} />
      <Panel estado={estado} campo={campo} acciones={acciones} edicionInvalida={edicionInvalida} escalaActual={escalaActual} />
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
        {datosLeyenda ? <Leyenda datos={datosLeyenda} controlador={controlador} alFijarEscala={fijarEscala} alFijarVRef={fijarVRef} /> : null}
        <div className="esquina-inferior-derecha">
          <BarraEscena alEncuadrar={restablecer.camara} alVista={vista} />
          <Triedro controlador={controlador} />
        </div>
      </VistaEscena>
    </div>
  );
}
