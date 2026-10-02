import { memo, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronRight } from 'lucide-react';
import { CATALOGO, campoPorId, type IdCampo } from '../../math/catalog';
import { texCampo, type CampoCompilado } from '../../math/field';
import { texNombreParametro } from '../../math/expr/tex';
import { formatearCorto } from '../../numerics/format';
import type { EstadoExperimento } from '../../state/schema';
import { T } from '../../i18n/es';
import type { Dominio as TipoDominio } from '../../math/tipos';
import type { Almacen } from '../../state/store';
import { TeX, TextoMat } from '../TeX';
import { Dominio } from './Dominio';
import { Ecuaciones } from './Ecuaciones';
import { Miniatura } from './Miniatura';
import { Parametros } from './Parametros';

/** Acciones del panel (las ejecuta App sobre el almacén). */
export interface AccionesPanel {
  alElegirCampo: (id: IdCampo) => void;
  alAplicarEcuaciones: (c: { P: string; Q: string; R: string }) => void;
  alAnadirParametroDesdeEcuacion: (nombre: string, borrador: { P: string; Q: string; R: string }) => void;
  alCambiarParametro: (nombre: string, valor: number) => void;
  alRangoParametro: (nombre: string, r: { min: number; max: number; paso: number }) => void;
  alRestablecerParametro: (nombre: string) => void;
  alEliminarParametro: (nombre: string) => void;
  alAnadirParametro: (nombre: string) => void;
  alDominio: (d: TipoDominio) => void;
  alMuestreo: (m: Partial<EstadoExperimento['muestreo']>) => void;
}

interface Props {
  estado: EstadoExperimento;
  campo: CampoCompilado | null;
  acciones: AccionesPanel;
  edicionInvalida: Almacen<boolean>;
}

export function Panel({ estado, campo, acciones: a, edicionInvalida }: Props) {
  // Los nombres solo cambian al añadir o quitar parámetros (no con sus valores).
  const claveNombres = estado.parametros.map((p) => p.nombre).join('\u0000');
  const nombres = useMemo(() => (claveNombres ? claveNombres.split('\u0000') : []), [claveNombres]);
  // Con ecuaciones inválidas no se sabe qué parámetros se usan: se consideran todos en uso.
  const usados = useMemo(() => campo?.usados ?? new Set(nombres), [campo, nombres]);
  return (
    <aside className="panel" data-region="panel" aria-label={T.panel.etiqueta}>
      <SeccionCampo estado={estado} campo={campo} />
      <EjemplosMemo activo={estado.base} modificado={estado.modificado} alElegir={a.alElegirCampo} />
      <Ecuaciones
        campo={estado.campo}
        parametros={nombres}
        alAplicar={a.alAplicarEcuaciones}
        alAnadirParametro={a.alAnadirParametroDesdeEcuacion}
        edicionInvalida={edicionInvalida}
      />
      <Parametros
        parametros={estado.parametros}
        usados={usados}
        alCambiar={a.alCambiarParametro}
        alRango={a.alRangoParametro}
        alRestablecer={a.alRestablecerParametro}
        alEliminar={a.alEliminarParametro}
        alAnadir={a.alAnadirParametro}
      />
      <Dominio dominio={estado.dominio} muestreo={estado.muestreo} alDominio={a.alDominio} alMuestreo={a.alMuestreo} />
    </aside>
  );
}

function SeccionCampo({ estado, campo }: { estado: EstadoExperimento; campo: CampoCompilado | null }) {
  const ficha = estado.base ? campoPorId(estado.base) : null;
  return (
    <section className="seccion" aria-labelledby="titulo-campo">
      <h2 className="seccion-titulo" id="titulo-campo">
        {T.panel.campo}
      </h2>
      <div className="formula-campo" data-prueba="formula-campo">
        {campo ? <TeX tex={texCampo(campo)} bloque /> : null}
      </div>
      {estado.parametros.length ? (
        <p className="valores-parametros num">
          {estado.parametros.map((p, i) => (
            <span key={p.nombre}>
              {i > 0 ? ' · ' : ''}
              <TeX tex={`${texNombreParametro(p.nombre)} = ${formatearCorto(p.valor).replace('−', '-')}`} />
            </span>
          ))}
        </p>
      ) : null}
      {ficha ? <FichaCampo id={ficha.id} /> : null}
    </section>
  );
}

function FichaCampo({ id }: { id: IdCampo }) {
  const [abierta, setAbierta] = useState(false);
  const idCuerpo = useId();
  const f = campoPorId(id).ficha;
  const filas: [string, string][] = [
    [T.panel.ficha.divergencia, f.divergencia],
    [T.panel.ficha.rotacional, f.rotacional],
    [T.panel.ficha.equilibrios, f.equilibrios],
    [T.panel.ficha.lineas, f.lineas],
    [T.panel.ficha.potencial, f.potencial],
    [T.panel.ficha.interpretacion, f.interpretacion],
    [T.panel.ficha.supuestos, f.supuestos],
  ];
  return (
    <div className="desplegable">
      <button
        type="button"
        className="desplegable-cabecera"
        aria-expanded={abierta}
        aria-controls={idCuerpo}
        onClick={() => setAbierta((a) => !a)}
      >
        <ChevronRight className="chevron" size={14} strokeWidth={1.5} aria-hidden="true" />
        {T.panel.sobreCampo}
      </button>
      <div id={idCuerpo} className="desplegable-cuerpo ficha" hidden={!abierta}>
        <p className="ficha-resumen">
          <TextoMat texto={f.resumen} />
        </p>
        <dl>
          {filas.map(([titulo, texto]) => (
            <div key={titulo} className="ficha-fila">
              <dt>{titulo}</dt>
              <dd>
                <TextoMat texto={texto} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function Ejemplos({ activo, modificado, alElegir }: { activo: IdCampo | null; modificado: boolean; alElegir: (id: IdCampo) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const indiceActivo = Math.max(0, CATALOGO.findIndex((c) => c.id === activo));
  const mover = (e: KeyboardEvent<HTMLDivElement>) => {
    const columnas = 3;
    const actual = refs.current.findIndex((b) => b === document.activeElement);
    if (actual < 0) return;
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columnas, ArrowUp: -columnas }[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    const n = CATALOGO.length;
    const siguiente = (actual + delta + n) % n;
    refs.current[siguiente]?.focus();
    const c = CATALOGO[siguiente];
    if (c) alElegir(c.id);
  };
  return (
    <section className="seccion" aria-labelledby="titulo-ejemplos">
      <h2 className="seccion-titulo" id="titulo-ejemplos">
        {T.panel.ejemplos}
      </h2>
      <div className="ejemplos" role="radiogroup" aria-labelledby="titulo-ejemplos" onKeyDown={mover}>
        {CATALOGO.map((c, i) => {
          const sel = c.id === activo;
          return (
            <button
              key={c.id}
              ref={(b) => {
                refs.current[i] = b;
              }}
              type="button"
              role="radio"
              aria-checked={sel}
              tabIndex={i === indiceActivo ? 0 : -1}
              className="tarjeta-ejemplo"
              data-campo={c.id}
              onClick={() => alElegir(c.id)}
            >
              <Miniatura id={c.id} />
              <span className="tarjeta-nombre">{c.nombre}</span>
              {sel ? (
                <span className="tarjeta-marca" aria-hidden="true">
                  {modificado ? '•' : '✓'}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

const EjemplosMemo = memo(Ejemplos);
