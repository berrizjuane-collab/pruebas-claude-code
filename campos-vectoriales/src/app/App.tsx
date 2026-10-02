import { useCallback, useEffect, useMemo, useState } from 'react';
import { crearTrabajador, sondearTrabajador, type ModoCalculo } from '../compute/client';
import { CATALOGO, type IdCampo } from '../math/catalog';
import type { ControladorEscena } from '../render/ControladorEscena';
import type { Vista } from '../render/camara';
import { seleccionarCampo } from '../state/actions';
import { EXPERIMENTO_INICIAL, experimentoDesdeCatalogo, type EstadoExperimento } from '../state/schema';
import { crearAlmacen } from '../state/store';
import { T } from '../i18n/es';
import { useAlmacen, usePrefiereMovimientoReducido } from '../ui/hooks';
import { Panel } from '../ui/panel/Panel';
import { BarraSuperior, type EstadoCalculo } from '../ui/topbar/BarraSuperior';
import { BarraEscena } from '../ui/scene/BarraEscena';
import { Leyenda } from '../ui/scene/Leyenda';
import { Triedro } from '../ui/scene/Triedro';
import { VistaEscena } from '../ui/scene/VistaEscena';
import '../ui/ui.css';
import { calcularMalla } from './orquestador';
import { compilarCampo } from '../math/field';
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
  const estado = useAlmacen(almacen, (s) => s);
  const [controlador, setControlador] = useState<ControladorEscena | null>(null);
  const [errorEscena, setErrorEscena] = useState<string | null>(null);
  const alControlador = useCallback((c: ControladorEscena | null, error?: string) => {
    setControlador(c);
    setErrorEscena(error ?? null);
  }, []);
  const [modo, setModo] = useState<ModoCalculo | 'sondeando'>('sondeando');
  const [fuentesListas, setFuentesListas] = useState(false);
  const movimientoReducido = usePrefiereMovimientoReducido();

  useEffect(() => {
    const trabajador = crearTrabajador();
    sondearTrabajador(trabajador).then(setModo);
    fuentes.then(() => setFuentesListas(true));
    return () => trabajador?.terminate();
  }, [fuentes]);

  // Campo compilado desde las expresiones (MAT-05); solo cambia si cambian el texto o los nombres.
  const nombresParametros = estado.parametros.map((p) => p.nombre).join('\u0000');
  const compilado = useMemo(
    () => compilarCampo(estado.campo, nombresParametros ? nombresParametros.split('\u0000') : []),
    [estado.campo, nombresParametros],
  );
  const campo = compilado.ok ? compilado.campo : null;

  // Cálculo de la malla de flechas (hilo principal hasta CMP-01).
  const resultado = useMemo(
    () => calcularMalla(estado, campo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [campo, estado.parametros, estado.dominio, estado.muestreo, estado.flechas],
  );

  useEffect(() => {
    controlador?.fijarDominio(estado.dominio, false);
  }, [controlador, estado.dominio]);

  useEffect(() => {
    controlador?.fijarMovimientoReducido(movimientoReducido);
  }, [controlador, movimientoReducido]);

  useEffect(() => {
    controlador?.fijarFlechas(estado.capas.flechas && resultado ? resultado.instancias : null);
  }, [controlador, resultado, estado.capas.flechas]);

  const elegirCampo = useCallback((id: IdCampo) => almacen.fijar((s) => seleccionarCampo(s, id)), [almacen]);
  const encuadrar = useCallback(() => controlador?.encuadrar(), [controlador]);
  const vista = useCallback((v: Vista) => controlador?.irAVista(v), [controlador]);
  useAtajos(encuadrar, vista);

  // Gancho de pruebas: lista cuando hay escena, fuentes, sondeo del worker y un fotograma dibujado.
  useEffect(() => {
    if (!modoPrueba() || !controlador || !fuentesListas || modo === 'sondeando') return;
    controlador.dibujar();
    publicarGancho({
      listo: true,
      modoCalculo: modo,
      estado: () => almacen.obtener(),
      escena: () => controlador.estadisticas(),
      seleccionarCampo: (id: IdCampo) => almacen.fijar((s) => seleccionarCampo(s, id)),
      fijarEstado: (f: (s: EstadoExperimento) => EstadoExperimento) => almacen.fijar(f),
      vista: (v: Vista) => controlador.irAVista(v, false),
      calculo: () =>
        resultado && {
          fRef: resultado.escala.ref,
          origen: resultado.escala.origen,
          lMax: resultado.lMax,
          recuento: resultado.muestra.recuento,
          ms: resultado.ms,
        },
      flecha: (k: number) => {
        const inst = controlador.flechas.instancias;
        if (!inst || !resultado || k >= inst.n) return null;
        const i = inst.nodo[k] as number;
        const m = resultado.muestra;
        return {
          nodo: i,
          pos: [m.pos[3 * i], m.pos[3 * i + 1], m.pos[3 * i + 2]],
          F: [m.F[3 * i], m.F[3 * i + 1], m.F[3 * i + 2]],
          mag: m.mag[i],
          dir: [inst.dir[3 * k], inst.dir[3 * k + 1], inst.dir[3 * k + 2]],
          largo: inst.largo[k],
          gris: inst.gris[k],
        };
      },
    });
  }, [controlador, fuentesListas, modo, almacen, resultado]);

  const estadoCalculo: EstadoCalculo = useMemo(() => {
    if (!resultado) return { tipo: 'calculando', texto: T.estado.calculando };
    const r = resultado.muestra.recuento;
    const total = resultado.muestra.total;
    if (resultado.escala.nulo) return { tipo: 'aviso', texto: T.estado.campoNulo };
    const sinDefinir = r.noDefinidos + r.singulares;
    if (sinDefinir > 0) return { tipo: 'aviso', texto: T.estado.sinDefinir(sinDefinir, total) };
    return { tipo: 'listo', texto: `${T.estado.listo} · ${T.estado.nodos(total)}` };
  }, [resultado]);

  return (
    <div className="app">
      <a className="saltar" href="#escena">
        {T.saltarEscena}
      </a>
      <BarraSuperior nombre={estado.nombre} estadoCalculo={estadoCalculo} alRestablecerCamara={encuadrar} />
      <Panel estado={estado} campo={campo} alElegirCampo={elegirCampo} />
      <VistaEscena
        fuentes={fuentes}
        movimientoReducido={movimientoReducido}
        resumen={T.escena.resumen(estado.nombre, resultado?.instancias.n ?? 0)}
        error={errorEscena}
        alControlador={alControlador}
      >
        {resultado ? (
          <Leyenda
            datos={{
              escala: resultado.escala,
              lMax: resultado.lMax,
              modo: estado.flechas.modo,
              ceros: resultado.instancias.ceros.length / 3,
              indefinidos: resultado.instancias.indefinidos.length / 3,
              saturadas: resultado.instancias.nSaturadas,
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
