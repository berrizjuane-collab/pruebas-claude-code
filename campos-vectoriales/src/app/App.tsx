import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClienteCalculo } from '../compute/client';
import { huellaMalla } from '../compute/huella';
import { peticionMalla } from '../compute/peticiones';
import { CATALOGO, type IdCampo } from '../math/catalog';
import { compilarCampo } from '../math/field';
import type { ControladorEscena } from '../render/ControladorEscena';
import type { Vista } from '../render/camara';
import { seleccionarCampo } from '../state/actions';
import { EXPERIMENTO_INICIAL, experimentoDesdeCatalogo, type EstadoExperimento } from '../state/schema';
import { crearAlmacen } from '../state/store';
import { T } from '../i18n/es';
import { useAlmacen, usePrefiereMovimientoReducido } from '../ui/hooks';
import { Panel } from '../ui/panel/Panel';
import { BarraSuperior, type EstadoCalculoBarra } from '../ui/topbar/BarraSuperior';
import { BarraEscena } from '../ui/scene/BarraEscena';
import { Leyenda } from '../ui/scene/Leyenda';
import { Triedro } from '../ui/scene/Triedro';
import { VistaEscena } from '../ui/scene/VistaEscena';
import '../ui/ui.css';
import { ESTADO_CALCULO_INICIAL, Orquestador, type EstadoCalculo } from './orquestador';
import { modoPrueba, parametrosUrl, publicarGancho } from './pruebas';
import { useAtajos } from './atajos';

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
  const estado = useAlmacen(almacen, (s) => s);
  const calculo = useAlmacen(almacenCalculo, (s) => s);
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

  useEffect(() => {
    controlador?.fijarDominio(estado.dominio, false);
  }, [controlador, estado.dominio]);

  useEffect(() => {
    controlador?.fijarMovimientoReducido(movimientoReducido);
  }, [controlador, movimientoReducido]);

  useEffect(() => {
    controlador?.fijarFlechas(estado.capas.flechas && malla ? malla.instancias : null);
  }, [controlador, malla, estado.capas.flechas]);

  const elegirCampo = useCallback((id: IdCampo) => almacen.fijar((s) => seleccionarCampo(s, id)), [almacen]);
  const encuadrar = useCallback(() => controlador?.encuadrar(), [controlador]);
  const vista = useCallback((v: Vista) => controlador?.irAVista(v), [controlador]);
  const cancelarLineas = useCallback(() => orquestador?.cancelarLineas(), [orquestador]);
  useAtajos(encuadrar, vista);

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
  }, [controlador, fuentesListas, cliente, orquestador, hayMalla, almacen, almacenCalculo]);

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
      <BarraSuperior nombre={estado.nombre} estadoCalculo={estadoBarra} alRestablecerCamara={encuadrar} alCancelar={cancelarLineas} />
      <Panel estado={estado} campo={campo} alElegirCampo={elegirCampo} />
      <VistaEscena
        fuentes={fuentes}
        movimientoReducido={movimientoReducido}
        resumen={T.escena.resumen(estado.nombre, malla?.instancias.n ?? 0)}
        error={errorEscena}
        alControlador={alControlador}
      >
        {calculo.error && malla ? (
          <p className="aviso-escena flotante" role="note" data-prueba="aviso-escena">
            {T.escena.ultimoValido}
          </p>
        ) : null}
        {malla ? (
          <Leyenda
            datos={{
              escala: malla.escala,
              lMax: malla.lMax,
              modo: estado.flechas.modo,
              ceros: malla.instancias.ceros.length / 3,
              indefinidos: malla.instancias.indefinidos.length / 3,
              saturadas: malla.instancias.nSaturadas,
              flechas: estado.capas.flechas,
            }}
          />
        ) : null}
        <div className="esquina-inferior-derecha">
          <BarraEscena alEncuadrar={encuadrar} alVista={vista} />
          <Triedro controlador={controlador} />
        </div>
      </VistaEscena>
    </div>
  );
}
