/**
 * Dominio y muestreo (UI-04, PLAN F4): límites de Ω (enlazados como cubo por defecto), N,
 * nodos o centros y resolución del corte, con validación en línea. Un valor inválido no se
 * aplica (lo explica el mensaje del campo). Alcance (1.1, ALC-01, PLAN F13): «Ampliar ×2» y
 * «Estrechar ÷2» alrededor del centro, conservando Δ mientras N lo permita.
 */
import { memo, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { Dominio as TipoDominio } from '../../math/tipos';
import { formatearCorto } from '../../numerics/format';
import { alcance, motivoIntervalo } from '../../state/actions';
import { Boton } from '../controls/Boton';
import { LIMITES, type EstadoExperimento } from '../../state/schema';
import { T } from '../../i18n/es';
import { CampoNumerico } from '../controls/CampoNumerico';
import { Interruptor } from '../controls/Interruptor';
import { Seccion } from '../controls/Seccion';
import { Segmentado } from '../controls/Segmentado';

interface Props {
  dominio: TipoDominio;
  muestreo: EstadoExperimento['muestreo'];
  alDominio: (d: TipoDominio) => void;
  alMuestreo: (m: Partial<EstadoExperimento['muestreo']>) => void;
  /** Ampliar (2) o estrechar (½) Ω alrededor de su centro (RF-21). */
  alAlcance: (factor: number) => void;
}

/** Ω en texto: [a, b]³ si es un cubo; si no, el producto de los tres intervalos. */
function textoDominio(d: TipoDominio): string {
  const intervalo = (k: number) => `[${formatearCorto(d.min[k] as number)}, ${formatearCorto(d.max[k] as number)}]`;
  return esCubo(d) ? `${intervalo(0)}³` : [0, 1, 2].map(intervalo).join(' × ');
}

const EJES = ['x', 'y', 'z'] as const;
const esCubo = (d: TipoDominio) => [1, 2].every((k) => d.min[k] === d.min[0] && d.max[k] === d.max[0]);

function DominioBase({ dominio, muestreo, alDominio, alMuestreo, alAlcance }: Props) {
  const [enlazado, setEnlazado] = useState(() => esCubo(dominio));
  const [resultado, setResultado] = useState('');
  const escalar = (f: number) => {
    const a = alcance(dominio, muestreo, f);
    if (!a.ok) {
      setResultado(T.dominio.alcanceImposible(a.motivo));
      return;
    }
    setResultado(T.dominio.alcanceResultado(textoDominio(a.dominio), Math.max(...a.n), formatearCorto(Number(a.delta.toPrecision(4))), a.conservaDelta));
    alAlcance(f);
  };
  const ampliar = alcance(dominio, muestreo, 2);
  const estrechar = alcance(dominio, muestreo, 0.5);
  const fijarLimite = (ejes: readonly number[], extremo: 'min' | 'max', v: number) => {
    const min = [...dominio.min] as [number, number, number];
    const max = [...dominio.max] as [number, number, number];
    for (const k of ejes) (extremo === 'min' ? min : max)[k] = v;
    alDominio({ min, max });
  };
  const validar = (k: number, extremo: 'min' | 'max') => (v: number) =>
    motivoIntervalo(extremo === 'min' ? v : (dominio.min[k] as number), extremo === 'max' ? v : (dominio.max[k] as number));
  const filas = enlazado ? [{ etiqueta: T.dominio.cubo3, ejes: [0, 1, 2] }] : EJES.map((e, k) => ({ etiqueta: e, ejes: [k] }));
  const n = muestreo.n[0];
  return (
    <Seccion titulo={T.dominio.titulo} ayuda="supuestos-muestreo" datosPrueba="seccion-dominio">
      <Interruptor etiqueta={T.dominio.enlazar} activado={enlazado} alCambiar={setEnlazado} />
      <div className="limites" role="group" aria-label={T.dominio.limites}>
        <span className="limites-cabecera" aria-hidden="true" />
        <span className="limites-cabecera">{T.dominio.min}</span>
        <span className="limites-cabecera">{T.dominio.max}</span>
        {filas.map((f) => (
          <div className="limites-fila" key={f.etiqueta}>
            <span className="limites-eje">{f.etiqueta}</span>
            <CampoNumerico
              etiqueta={T.dominio.limite(T.dominio.min, f.etiqueta)}
              valor={dominio.min[f.ejes[0] as number] as number}
              paso={0.5}
              ancho="ancho"
              validar={(v) => f.ejes.map((k) => validar(k, 'min')(v)).find(Boolean) ?? null}
              alCambiar={(v) => fijarLimite(f.ejes, 'min', v)}
              datosPrueba={`min-${f.etiqueta}`}
            />
            <CampoNumerico
              etiqueta={T.dominio.limite(T.dominio.max, f.etiqueta)}
              valor={dominio.max[f.ejes[0] as number] as number}
              paso={0.5}
              ancho="ancho"
              validar={(v) => f.ejes.map((k) => validar(k, 'max')(v)).find(Boolean) ?? null}
              alCambiar={(v) => fijarLimite(f.ejes, 'max', v)}
              datosPrueba={`max-${f.etiqueta}`}
            />
          </div>
        ))}
      </div>
      <div className="fila-control" data-prueba="alcance">
        <span className="fila-etiqueta">{T.dominio.alcance}</span>
        <Boton
          variante="secundario"
          icono={Maximize2}
          descripcion={T.dominio.ampliarLargo}
          deshabilitado={!ampliar.ok}
          motivo={ampliar.ok ? undefined : ampliar.motivo}
          onClick={() => escalar(2)}
          data-prueba="ampliar"
        >
          {T.dominio.ampliar}
        </Boton>
        <Boton
          variante="secundario"
          icono={Minimize2}
          descripcion={T.dominio.estrecharLargo}
          deshabilitado={!estrechar.ok}
          motivo={estrechar.ok ? undefined : estrechar.motivo}
          onClick={() => escalar(0.5)}
          data-prueba="estrechar"
        >
          {T.dominio.estrechar}
        </Boton>
        <p className="fila-pista num alcance-resultado" role="status" data-prueba="alcance-resultado">
          {resultado}
        </p>
      </div>
      <div className="fila-control">
        <span className="fila-etiqueta">{T.dominio.n}</span>
        <CampoNumerico
          etiqueta={T.dominio.nLargo}
          valor={n}
          paso={1}
          min={LIMITES.nMin}
          max={LIMITES.nMax}
          validar={(v) => (Number.isInteger(v) ? null : T.dominio.entero)}
          alCambiar={(v) => alMuestreo({ n: [v, v, v] })}
          datosPrueba="n"
        />
        <span className="fila-pista num">{T.dominio.flechas(n * n * n)}</span>
      </div>
      <div className="fila-control">
        <span className="fila-etiqueta">{T.dominio.posicion}</span>
        <Segmentado
          etiqueta={T.dominio.posicion}
          valor={muestreo.posicion}
          opciones={[
            { valor: 'nodos', texto: T.dominio.nodos },
            { valor: 'centros', texto: T.dominio.centros },
          ]}
          alCambiar={(posicion) => alMuestreo({ posicion })}
        />
      </div>
      <div className="fila-control">
        <span className="fila-etiqueta">{T.dominio.corte}</span>
        <CampoNumerico
          etiqueta={T.dominio.corteLargo}
          valor={muestreo.corteResolucion}
          paso={2}
          min={LIMITES.corteMin}
          max={LIMITES.corteMax}
          validar={(v) => (Number.isInteger(v) ? null : T.dominio.entero)}
          alCambiar={(v) => alMuestreo({ corteResolucion: v })}
          datosPrueba="corte-resolucion"
        />
      </div>
    </Seccion>
  );
}

export const Dominio = memo(DominioBase);
