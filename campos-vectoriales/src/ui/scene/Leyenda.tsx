import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { hexGris } from '../../design/color';
import { grisRampaMagnitud } from '../../render/flechas';
import { formatearCorto } from '../../numerics/format';
import type { Escala } from '../../numerics/grid';
import { T } from '../../i18n/es';

export interface DatosLeyenda {
  escala: Escala;
  lMax: number;
  modo: 'proporcional' | 'normalizado';
  ceros: number;
  indefinidos: number;
  saturadas: number;
  flechas: boolean;
}

/** Degradado de la rampa de magnitud con paradas en L* uniforme (11 paradas: el 50 % es exacto). */
function degradadoMagnitud(): string {
  const paradas = Array.from({ length: 11 }, (_, i) => `${hexGris(grisRampaMagnitud(i / 10) * 255)} ${i * 10}%`);
  return `linear-gradient(to right, ${paradas.join(', ')})`;
}

const GLIFO = {
  flecha: (
    <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true">
      <path d="M1 6h13" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13 2l7 4-7 4z" fill="currentColor" />
    </svg>
  ),
  doble: (
    <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true">
      <path d="M1 6h8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 2l7 4-7 4zM13 2l7 4-7 4z" fill="currentColor" />
    </svg>
  ),
  rombo: (
    <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true">
      <path d="M11 1.5 15.5 6 11 10.5 6.5 6z" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  aspa: (
    <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true">
      <path d="M7.5 2.5l7 7M14.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
};

export function Leyenda({ datos }: { datos: DatosLeyenda }) {
  const [plegada, setPlegada] = useState(false);
  const idCuerpo = useId();
  const ref = formatearCorto(datos.escala.ref);
  return (
    <section className="leyenda flotante" data-flotante="leyenda" aria-labelledby="titulo-leyenda">
      <button
        type="button"
        className="leyenda-cabecera"
        aria-expanded={!plegada}
        aria-controls={idCuerpo}
        onClick={() => setPlegada((p) => !p)}
      >
        <span id="titulo-leyenda">{T.leyenda.titulo}</span>
        <ChevronDown className="chevron" size={14} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <div id={idCuerpo} className="leyenda-cuerpo" hidden={plegada}>
        {datos.flechas ? (
          <>
            <div className="leyenda-rampa">
              <span className="leyenda-rampa-titulo">{T.leyenda.magnitud}</span>
              <div className="leyenda-barra" style={{ backgroundImage: degradadoMagnitud() }} data-prueba="barra-magnitud" />
              <div className="leyenda-marcas num" aria-hidden="true">
                <span>0</span>
                <span>{formatearCorto(datos.escala.ref / 2)}</span>
                <span>≥ {ref}</span>
              </div>
            </div>
            <ul className="leyenda-lista">
              <li>
                {GLIFO.flecha}
                <span>{datos.modo === 'normalizado' ? T.leyenda.normalizada : T.leyenda.sentido}</span>
              </li>
              {datos.saturadas > 0 && datos.modo === 'proporcional' ? (
                <li>
                  {GLIFO.doble}
                  <span>{T.leyenda.saturada(ref)}</span>
                </li>
              ) : null}
              {datos.ceros > 0 ? (
                <li>
                  {GLIFO.rombo}
                  <span>{T.leyenda.cero}</span>
                </li>
              ) : null}
              {datos.indefinidos > 0 ? (
                <li>
                  {GLIFO.aspa}
                  <span>{T.leyenda.indefinido}</span>
                </li>
              ) : null}
            </ul>
            <p className="leyenda-pie num" data-prueba="leyenda-escala">
              {T.leyenda.escala(ref, datos.escala.origen === 'auto' ? T.leyenda.escalaAuto : T.leyenda.escalaFija)}
              <br />
              {T.leyenda.longitudMax(formatearCorto(Number(datos.lMax.toPrecision(3))))}
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}
