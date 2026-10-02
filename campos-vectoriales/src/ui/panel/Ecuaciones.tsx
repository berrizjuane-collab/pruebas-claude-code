/**
 * Editor de ecuaciones (UI-02, PLAN F2, SPEC §5.3).
 *
 * - La vista previa se actualiza con cada tecla.
 * - «Incompleta» es informativo mientras se escribe; tras 800 ms sin teclear o al salir del
 *   campo pasa a error, con la posición subrayada.
 * - Con las tres componentes válidas, se aplican 300 ms después de la última tecla (o al
 *   salir del campo).
 * - Con alguna inválida se mantiene el último campo válido (y la escena lo avisa).
 * - Esc devuelve el campo a su último valor válido.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { analizarExpresion, COMPONENTES, type Componente } from '../../math/field';
import { tex } from '../../math/expr/tex';
import type { Almacen } from '../../state/store';
import { T } from '../../i18n/es';
import { Boton } from '../controls/Boton';
import { CampoExpresion, type EstadoExpresion } from '../controls/CampoExpresion';

type Ecuacion = Record<Componente, string>;

export const RETRASO_APLICAR = 300;
export const RETRASO_INCOMPLETA = 800;

const igual = (a: Ecuacion, b: Ecuacion) => a.P === b.P && a.Q === b.Q && a.R === b.R;
const NINGUNO: Record<Componente, boolean> = { P: false, Q: false, R: false };

interface Props {
  campo: Ecuacion;
  parametros: readonly string[];
  alAplicar: (c: Ecuacion) => void;
  /** Añade el parámetro y, si con él las ecuaciones son válidas, las aplica. */
  alAnadirParametro: (nombre: string, borrador: Ecuacion) => void;
  /** Hay un error confirmado: la escena muestra el último campo válido. */
  edicionInvalida: Almacen<boolean>;
}

function EcuacionesBase({ campo, parametros, alAplicar, alAnadirParametro, edicionInvalida }: Props) {
  const [borrador, setBorrador] = useState<Ecuacion>(campo);
  const [confirmado, setConfirmado] = useState(NINGUNO);
  // Ajuste de estado al cambiar el campo desde fuera (ejemplo, deshacer…): patrón de React
  // «estado derivado de props» durante el render, sin efectos.
  const [previo, setPrevio] = useState<Ecuacion>(campo);
  if (!igual(previo, campo)) {
    setPrevio(campo);
    setBorrador(campo);
    setConfirmado(NINGUNO);
  }

  const temporizadores = useRef<{ aplicar?: ReturnType<typeof setTimeout>; incompleta?: ReturnType<typeof setTimeout> }>({});
  useEffect(() => {
    const t = temporizadores.current;
    return () => {
      clearTimeout(t.aplicar);
      clearTimeout(t.incompleta);
    };
  }, []);

  const analisis = useMemo(
    () => Object.fromEntries(COMPONENTES.map((c) => [c, analizarExpresion(borrador[c], parametros)])) as Record<Componente, ReturnType<typeof analizarExpresion>>,
    [borrador, parametros],
  );
  const todasValidas = COMPONENTES.every((c) => analisis[c].ok);

  const estados = Object.fromEntries(
    COMPONENTES.map((c): [Componente, EstadoExpresion] => {
      const a = analisis[c];
      if (a.ok) return [c, { tipo: 'valida', tex: tex(a.arbol), aviso: a.avisos[0]?.mensaje }];
      if (a.error.incompleta && !confirmado[c]) return [c, { tipo: 'incompleta', mensaje: a.error.mensaje }];
      return [c, { tipo: 'error', mensaje: a.error.mensaje, ini: a.error.ini, fin: a.error.fin }];
    }),
  ) as Record<Componente, EstadoExpresion>;
  const hayError = COMPONENTES.some((c) => estados[c].tipo === 'error');

  useEffect(() => {
    edicionInvalida.fijar(hayError);
  }, [hayError, edicionInvalida]);
  useEffect(() => () => edicionInvalida.fijar(false), [edicionInvalida]);

  // Aplicar: se programa con cada tecla y se ejecuta con el borrador vigente en ese momento.
  const actual = useRef({ borrador, todasValidas, campo, alAplicar });
  useEffect(() => {
    actual.current = { borrador, todasValidas, campo, alAplicar };
  });
  const aplicarSiProcede = () => {
    clearTimeout(temporizadores.current.aplicar);
    const a = actual.current;
    if (a.todasValidas && !igual(a.borrador, a.campo)) a.alAplicar(a.borrador);
  };

  const cambiar = (c: Componente, texto: string) => {
    const nuevo = { ...borrador, [c]: texto };
    setBorrador(nuevo);
    setConfirmado((x) => ({ ...x, [c]: false }));
    const t = temporizadores.current;
    clearTimeout(t.aplicar);
    clearTimeout(t.incompleta);
    t.aplicar = setTimeout(aplicarSiProcede, RETRASO_APLICAR);
    t.incompleta = setTimeout(() => setConfirmado((x) => ({ ...x, [c]: true })), RETRASO_INCOMPLETA);
  };

  return (
    <section className="seccion" aria-labelledby="titulo-ecuaciones" data-prueba="ecuaciones">
      <h2 className="seccion-titulo" id="titulo-ecuaciones">
        {T.editor.titulo}
      </h2>
      <div className="ecuaciones">
        {COMPONENTES.map((c) => {
          const e = estados[c];
          const a = analisis[c];
          const sugerencia = !a.ok ? a.error.sugerencias.find((s) => s.tipo === 'parametro') : undefined;
          return (
            <CampoExpresion
              key={c}
              componente={c}
              descripcion={T.editor.descripcion[c]}
              texto={borrador[c]}
              estado={e}
              alCambiar={(t) => cambiar(c, t)}
              alSalir={() => {
                clearTimeout(temporizadores.current.incompleta);
                setConfirmado((x) => ({ ...x, [c]: true }));
                aplicarSiProcede();
              }}
              alEscape={() => {
                clearTimeout(temporizadores.current.aplicar);
                setBorrador((b) => ({ ...b, [c]: campo[c] }));
                setConfirmado((x) => ({ ...x, [c]: false }));
              }}
              accion={
                sugerencia && sugerencia.tipo === 'parametro' && e.tipo === 'error' ? (
                  <Boton variante="fantasma" className="boton-compacto" onClick={() => alAnadirParametro(sugerencia.nombre, borrador)}>
                    {T.editor.anadirParametro(sugerencia.nombre)}
                  </Boton>
                ) : undefined
              }
            />
          );
        })}
      </div>
    </section>
  );
}

export const Ecuaciones = memo(EcuacionesBase);
