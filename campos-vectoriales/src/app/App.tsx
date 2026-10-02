import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleOff, FileQuestion } from 'lucide-react';
import { ClienteCalculo } from '../compute/client';
import { huellaMalla } from '../compute/huella';
import { peticionMalla } from '../compute/peticiones';
import { CATALOGO, type IdCampo } from '../math/catalog';
import { compilarCampo } from '../math/field';
import type { ControladorEscena } from '../render/ControladorEscena';
import type { Vista } from '../render/camara';
import type { Dominio } from '../math/tipos';
import { seleccionarCampo } from '../state/actions';
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

  useEffect(() => {
    controlador?.fijarFlechas(estado.capas.flechas && malla ? malla.instancias : null);
  }, [controlador, malla, estado.capas.flechas]);

  const { acciones, restablecer } = useEdicion(almacen, controlador, notificador);
  const vista = useCallback((v: Vista) => controlador?.irAVista(v), [controlador]);
  const cancelarLineas = useCallback(() => orquestador?.cancelarLineas(), [orquestador]);
  useAtajos(restablecer.camara, vista);
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
  const capaFlechas = estado.capas.flechas;
  const datosLeyenda = useMemo(
    () =>
      malla && {
        escala: malla.escala,
        lMax: malla.lMax,
        modo: modoFlechas,
        ceros: malla.instancias.ceros.length / 3,
        indefinidos: malla.instancias.indefinidos.length / 3,
        saturadas: malla.instancias.nSaturadas,
        flechas: capaFlechas,
        nFlechas: malla.instancias.n,
      },
    [malla, modoFlechas, capaFlechas],
  );

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
      <Panel estado={estado} campo={campo} acciones={acciones} edicionInvalida={edicionInvalida} />
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
        {datosLeyenda ? <Leyenda datos={datosLeyenda} /> : null}
        <div className="esquina-inferior-derecha">
          <BarraEscena alEncuadrar={restablecer.camara} alVista={vista} />
          <Triedro controlador={controlador} />
        </div>
      </VistaEscena>
    </div>
  );
}
