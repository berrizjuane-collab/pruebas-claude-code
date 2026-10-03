/**
 * Tarjeta del modo de medición (`?perf=`, VAL-03): recuerda las condiciones, inicia la medición
 * y ofrece el informe JSON. Con `&auto=1` empieza sola (la usa `npm run perf` en C0); con
 * `&fotogramas=` y `&repeticiones=` se acorta (en C0 los fotogramas no cuentan).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { descargar } from '../export/json';
import { T } from '../i18n/es';
import { Boton } from '../ui/controls/Boton';
import { parametrosUrl } from './pruebas';
import { medirRendimiento, type ContextoMedicion, type InformeRendimiento } from './rendimiento';

declare global {
  interface Window {
    /** Informe de la última medición (o su error), para `npm run perf`. */
    __perfInforme?: InformeRendimiento | { error: string };
  }
}

type Fase = 'espera' | 'midiendo' | 'hecho' | 'error';

export function PanelRendimiento({ contexto }: { contexto: ContextoMedicion | null }) {
  const [opciones] = useState(() => {
    const q = parametrosUrl();
    return {
      equipo: q.get('equipo') ?? 'R1',
      fotogramas: Number(q.get('fotogramas')) || 600,
      repeticiones: Number(q.get('repeticiones')) || 10,
      auto: q.get('auto') === '1',
    };
  });
  const [fase, setFase] = useState<Fase>('espera');
  const [texto, setTexto] = useState('');
  const [informe, setInforme] = useState<InformeRendimiento | null>(null);
  const arrancado = useRef(false);

  const iniciar = useCallback(async () => {
    if (!contexto) return;
    setFase('midiendo');
    setInforme(null);
    try {
      const r = await medirRendimiento(contexto, { ...opciones, progreso: setTexto });
      setInforme(r);
      setFase('hecho');
      window.__perfInforme = r;
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      setTexto(mensaje);
      setFase('error');
      window.__perfInforme = { error: mensaje };
    }
  }, [contexto, opciones]);

  // Inicio automático, una sola vez, cuando la escena está lista.
  useEffect(() => {
    if (!opciones.auto || !contexto || arrancado.current) return;
    arrancado.current = true;
    const id = setTimeout(() => void iniciar(), 0);
    return () => clearTimeout(id);
  }, [opciones.auto, contexto, iniciar]);

  const guardar = () => {
    if (!informe) return;
    const nombre = `${informe.fecha.slice(0, 10)}-${informe.equipo}-${informe.escena}.json`;
    descargar(nombre, new Blob([JSON.stringify(informe, null, 2)], { type: 'application/json' }));
  };

  const id = contexto?.escena.id;
  const f = informe?.fotogramas;
  const estadoTexto = fase === 'espera' ? (contexto ? T.rendimiento.listo : T.rendimiento.preparando) : texto;
  return (
    <section className="panel-rendimiento" aria-labelledby="titulo-rendimiento" data-prueba="panel-rendimiento">
      <h2 id="titulo-rendimiento" className="seccion-titulo">
        {id ? T.rendimiento.titulo(id, T.rendimiento.nombres[id]) : T.rendimiento.preparando}
      </h2>
      <p className="panel-rendimiento-nota">{T.rendimiento.condiciones(opciones.equipo, window.innerWidth, window.innerHeight)}</p>
      <p className="panel-rendimiento-estado" role="status" data-prueba="estado-rendimiento">
        {estadoTexto}
      </p>
      {informe ? (
        <div className="panel-rendimiento-resultados" data-prueba="resultados-rendimiento">
          {f ? <p>{T.rendimiento.resumenFotogramas(f.p50, f.p95, f.p99, f.porEncimaDe33ms)}</p> : null}
          {Object.entries(informe.calculo).map(([trabajo, v]) => (
            <p key={trabajo}>{T.rendimiento.resumenCalculo(v.descripcion, v.medianaMs)}</p>
          ))}
          {informe.interaccion ? (
            <p>{T.rendimiento.resumenInteraccion(informe.interaccion.tareasLargas.length, informe.interaccion.latencias?.p95 ?? null)}</p>
          ) : null}
        </div>
      ) : null}
      <div className="panel-rendimiento-acciones">
        <Boton variante="primario" onClick={() => void iniciar()} deshabilitado={!contexto || fase === 'midiendo'} motivo={T.rendimiento.motivoIniciar}>
          {fase === 'hecho' ? T.rendimiento.repetir : T.rendimiento.iniciar}
        </Boton>
        <Boton onClick={guardar} deshabilitado={!informe} motivo={T.rendimiento.motivoDescargar}>
          {T.rendimiento.descargar}
        </Boton>
      </div>
    </section>
  );
}
