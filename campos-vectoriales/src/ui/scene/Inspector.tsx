/**
 * Tarjeta del inspector (INS-02, DESIGN §5.2 y §6; SPEC RF-08): coordenadas de P (editables),
 * F, ‖F‖ y F̂, derivadas (div con su lectura, rot, helicidad y rueda de paletas con sus
 * supuestos), jacobiana con autovalores, método de derivación y «Copiar valores». Esquina
 * superior derecha de la escena; se cierra con × o Esc.
 */
import { memo, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, Copy, X } from 'lucide-react';
import type { Autovalor } from '../../math/derivadas';
import type { Dominio, Vec3 } from '../../math/tipos';
import { formatear } from '../../numerics/format';
import { CERO_VISUAL } from '../../numerics/grid';
import { conDerivadas, type Inspeccion } from '../../numerics/inspeccion';
import { T } from '../../i18n/es';
import { Aviso } from '../controls/Aviso';
import { Boton, BotonIcono } from '../controls/Boton';
import { CampoNumerico } from '../controls/CampoNumerico';

interface Props {
  inspeccion: Inspeccion;
  cifras: number;
  /** F_ref vigente: por debajo del 2 % se escribe «≈ 0» (DESIGN §3.3). */
  fRef: number;
  dominio: Dominio;
  /** Cambia para pedir el foco en la coordenada x (tecla I). */
  enfocar: number;
  alPunto: (p: Vec3) => void;
  alCerrar: () => void;
  alCopiar: (texto: string) => void;
  /** Jacobiana desplegada de entrada (≥ 1600 px, DESIGN §5.4). */
  jacobianaAbierta?: boolean;
}

const EJES = ['x', 'y', 'z'] as const;

/** Valores formateados del inspector y su texto tabulado para copiar. */
export function valoresInspector(i: Inspeccion, cifras: number, fRef: number) {
  const f = (v: number, escala = 1) => formatear(v, { cifras, escala });
  const vec = (v: readonly number[], escala = 1) => v.map((c) => f(c, escala));
  const filas: { clave: string; etiqueta: string; valor: string[] }[] = [];
  filas.push({ clave: 'P', etiqueta: 'P', valor: vec(i.punto) });
  if (!i.definido) return { filas, casiCero: false, texto: tabular(filas) };
  const casiCero = i.mag < CERO_VISUAL * fRef;
  filas.push({ clave: 'F', etiqueta: 'F', valor: vec(i.F, i.mag) });
  filas.push({ clave: 'magF', etiqueta: '‖F‖', valor: [casiCero && i.mag > 0 ? '≈ 0' : f(i.mag)] });
  if (i.unitario) filas.push({ clave: 'Funit', etiqueta: 'F̂', valor: vec(i.unitario) });
  if (conDerivadas(i)) {
    const d = i.derivadas;
    const escalaJ = Math.max(1, ...d.J.map(Math.abs));
    filas.push({ clave: 'div', etiqueta: 'div F', valor: [conSigno(f(d.div, escalaJ))] });
    filas.push({ clave: 'rot', etiqueta: 'rot F', valor: vec(d.rot, escalaJ) });
    filas.push({ clave: 'helicidad', etiqueta: T.inspector.helicidad, valor: [f(d.helicidad, escalaJ * Math.max(1, i.mag))] });
    filas.push({ clave: 'omega', etiqueta: 'ω', valor: [f(d.magRot / 2, escalaJ)] });
    for (let k = 0; k < 3; k++) filas.push({ clave: `J${k}`, etiqueta: `J (fila ${k + 1})`, valor: vec(d.J.slice(3 * k, 3 * k + 3), escalaJ) });
    filas.push({ clave: 'autovalores', etiqueta: T.inspector.autovalores, valor: d.autovalores.map((a) => complejo(a, cifras, escalaJ)) });
  }
  return { filas, casiCero, texto: tabular(filas) };
}

const conSigno = (s: string) => (s === '0' || s.startsWith('−') ? s : `+${s}`);

function complejo(a: Autovalor, cifras: number, escala: number): string {
  const re = formatear(a.re, { cifras, escala });
  if (Math.abs(a.im) <= 1e-12 * escala) return re;
  const im = formatear(Math.abs(a.im), { cifras, escala });
  return `${re} ${a.im < 0 ? '−' : '+'} ${im} i`;
}

function tabular(filas: { etiqueta: string; valor: string[] }[]): string {
  return filas.map((r) => [r.etiqueta, ...r.valor].join('\t')).join('\n');
}

function InspectorBase({ inspeccion: i, cifras, fRef, dominio, enfocar, alPunto, alCerrar, alCopiar, jacobianaAbierta = false }: Props) {
  const idTitulo = useId();
  const refX = useRef<HTMLDivElement>(null);
  const { filas, casiCero, texto } = valoresInspector(i, cifras, fRef);
  const fila = (clave: string) => filas.find((r) => r.clave === clave)?.valor ?? [];
  useEffect(() => {
    if (enfocar > 0) refX.current?.querySelector('input')?.focus();
  }, [enfocar]);
  const d = conDerivadas(i) ? i.derivadas : null;
  const motivo = !d && 'motivo' in i.derivadas ? i.derivadas.motivo : null;
  const metodo = d
    ? d.metodo === 'analiticas'
      ? T.inspector.analiticas
      : (d.metodo === 'numericas' ? T.inspector.numericas : T.inspector.mixtas)(formatear(d.paso ?? 0, { cifras: 2 }))
    : null;
  const escalaJ = d ? Math.max(1, ...d.J.map(Math.abs)) : 1;
  const ceroDiv = d ? formatear(d.div, { cifras, escala: escalaJ }) === '0' : false;
  const ceroRot = d ? formatear(d.magRot, { cifras, escala: escalaJ }) === '0' : false;
  return (
    <section
      className="inspector flotante"
      data-flotante="inspector"
      aria-labelledby={idTitulo}
      data-prueba="inspector"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !(e.target as HTMLElement).closest('[aria-invalid="true"]')) {
          e.stopPropagation();
          alCerrar();
        }
      }}
    >
      <div className="inspector-cabecera">
        <h2 id={idTitulo} className="inspector-titulo">
          {T.inspector.titulo}
        </h2>
        <BotonIcono etiqueta={T.inspector.cerrar} icono={X} atajo="Esc" onClick={alCerrar} />
      </div>
      <div className="inspector-coordenadas" ref={refX}>
        {EJES.map((eje, k) => (
          <label key={eje} className="inspector-coordenada">
            <span className="num">{eje}</span>
            <CampoNumerico
              etiqueta={T.inspector.coordenada(eje)}
              valor={i.punto[k] as number}
              paso={0.1}
              min={dominio.min[k] as number}
              max={dominio.max[k] as number}
              alCambiar={(v) => {
                const p = [...i.punto] as [number, number, number];
                p[k] = v;
                alPunto(p);
              }}
              datosPrueba={`inspector-${eje}`}
            />
          </label>
        ))}
      </div>
      {!i.definido ? (
        <Aviso tipo="aviso" datosPrueba="inspector-no-definido">
          {T.inspector.noDefinido}
        </Aviso>
      ) : (
        <>
          <dl className="inspector-filas num">
            <Fila etiqueta="F" clave="F">
              <Vector valores={fila('F')} />
            </Fila>
            <Fila etiqueta="‖F‖" clave="magF" titulo={casiCero ? formatear(i.mag, { cifras: 8 }) : undefined}>
              {fila('magF')[0]}
            </Fila>
            {i.unitario ? (
              <Fila etiqueta="F̂" clave="Funit">
                <Vector valores={fila('Funit')} />
              </Fila>
            ) : null}
          </dl>
          <Desplegable titulo={T.inspector.derivadas} abierto>
            {d ? (
              <>
                <dl className="inspector-filas num">
                  <Fila etiqueta="div F" clave="div">
                    {fila('div')[0]}
                    <span className="inspector-lectura">
                      {' · '}
                      {ceroDiv ? T.inspector.solenoidal : d.div > 0 ? T.inspector.fuente : T.inspector.sumidero}
                    </span>
                  </Fila>
                  <Fila etiqueta="rot F" clave="rot">
                    <Vector valores={fila('rot')} />
                  </Fila>
                  <Fila etiqueta={T.inspector.helicidad} clave="helicidad">
                    {fila('helicidad')[0]}
                  </Fila>
                  <Fila etiqueta={T.inspector.rueda} clave="omega">
                    {ceroRot ? <span className="inspector-lectura">{T.inspector.sinGiro}</span> : T.inspector.omega(fila('omega')[0] ?? '')}
                  </Fila>
                </dl>
                {!ceroRot ? (
                  <Desplegable titulo={T.inspector.supuestos} pequeno>
                    <p className="inspector-nota">{T.inspector.textoSupuestos}</p>
                  </Desplegable>
                ) : null}
              </>
            ) : (
              <p className="inspector-nota" data-prueba="inspector-sin-derivadas">
                {motivo === 'no-diferenciable' ? T.inspector.noDiferenciable : motivo === 'no-acotadas' ? T.inspector.noAcotadas : T.inspector.noDefinidas}
              </p>
            )}
          </Desplegable>
          {d ? (
            <Desplegable titulo={T.inspector.jacobiana} abierto={jacobianaAbierta}>
              <table className="inspector-matriz num" data-prueba="inspector-jacobiana">
                <tbody>
                  {[0, 1, 2].map((k) => (
                    <tr key={k}>
                      {fila(`J${k}`).map((v, j) => (
                        <td key={j}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="inspector-nota num" data-prueba="inspector-autovalores">
                {T.inspector.autovalores}: {fila('autovalores').join(' · ')}
              </p>
            </Desplegable>
          ) : null}
          {metodo ? (
            <p className="inspector-metodo" data-prueba="inspector-metodo">
              {metodo}
            </p>
          ) : null}
        </>
      )}
      <Boton variante="secundario" icono={Copy} onClick={() => alCopiar(texto)}>
        {T.inspector.copiar}
      </Boton>
    </section>
  );
}

function Fila({ etiqueta, clave, titulo, children }: { etiqueta: string; clave: string; titulo?: string; children: ReactNode }) {
  return (
    <div className="inspector-fila" data-prueba={`inspector-${clave}`} title={titulo}>
      <dt>{etiqueta}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Vector en columna, alineado por el punto decimal (cifras tabulares, DESIGN §3.3). */
function Vector({ valores }: { valores: string[] }) {
  return (
    <span className="inspector-vector">
      {valores.map((v, k) => {
        const [ent, dec] = v.split('.');
        return (
          <span key={k} className="inspector-componente">
            <span className="inspector-entera">{ent}</span>
            <span className="inspector-decimal">{dec !== undefined ? `.${dec}` : ''}</span>
          </span>
        );
      })}
    </span>
  );
}

function Desplegable({ titulo, abierto = false, pequeno = false, children }: { titulo: string; abierto?: boolean; pequeno?: boolean; children: ReactNode }) {
  const [abiertoAhora, setAbierto] = useState(abierto);
  const id = useId();
  return (
    <div className={`desplegable${pequeno ? ' desplegable-pequeno' : ''}`}>
      <button type="button" className="desplegable-cabecera" aria-expanded={abiertoAhora} aria-controls={id} onClick={() => setAbierto((a) => !a)}>
        <ChevronRight className="chevron" size={14} strokeWidth={1.5} aria-hidden="true" />
        {titulo}
      </button>
      <div id={id} className="desplegable-cuerpo" hidden={!abiertoAhora}>
        {children}
      </div>
    </div>
  );
}

export const Inspector = memo(InspectorBase);
