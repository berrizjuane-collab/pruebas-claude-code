import { memo, useEffect, useId, useState } from 'react';
import { ChevronDown, Lock, LockOpen } from 'lucide-react';
import type { ControladorEscena } from '../../render/ControladorEscena';
import { BotonIcono } from '../controls/Boton';
import { hexGris } from '../../design/color';
import { escena } from '../../design/tokens';
import { grisRampaMagnitud } from '../../geometria/flechas';
import { formatearCorto } from '../../numerics/format';
import type { Escala } from '../../numerics/grid';
import { T } from '../../i18n/es';

export interface DatosLeyenda {
  escala: Escala;
  lMax: number;
  modo: 'proporcional' | 'normalizado';
  luminancia: 'lineal' | 'log';
  /** Δ de la malla y Δ con el que se fijó la escala (aviso si difieren, DESIGN §9.10). */
  deltaRef: number;
  deltaFija: number | null;
  ceros: number;
  indefinidos: number;
  saturadas: number;
  flechas: boolean;
  /** Flechas dibujadas (sin marcas ≈ 0 ni aspas): sin ellas no hay rampa, sentido ni escala. */
  nFlechas: number;
  /** Líneas de corriente visibles (null si la capa está apagada o no hay líneas). */
  lineas: { finalesCero: number; finalesIndefinidos: number; actualizando: boolean } | null;
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
  // Muestras de las líneas en su gris de escena (luminancia constante, DESIGN §9.4).
  linea: (
    <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true" style={{ color: escena.linea }}>
      <path d="M1 8c5-6 12-6 20-2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  cheuron: (
    <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true" style={{ color: escena.linea }}>
      <path d="M1 6h20" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.5 2.5 12.5 6l-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  semilla: (
    <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true" style={{ color: escena.semilla }}>
      <circle cx="11" cy="6" r="3.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
};

/** ‖F‖/F_ref en el centro de la barra: 1/2 (lineal) o (10^½ − 1)/9 ≈ 0.24 (logarítmica). */
export const FRACCION_CENTRO = { lineal: 0.5, log: (Math.sqrt(10) - 1) / 9 } as const;

/** Píxeles por unidad del dominio, actualizados con la cámara (flecha de referencia). */
function usePixelesPorUnidad(controlador: ControladorEscena | null): number {
  const [px, setPx] = useState(0);
  useEffect(() => {
    if (!controlador) return;
    const actualizar = () => setPx(controlador.pixelesPorUnidad());
    actualizar();
    return controlador.alCambiarCamara(actualizar);
  }, [controlador]);
  return px;
}

interface Props {
  datos: DatosLeyenda;
  controlador: ControladorEscena | null;
  alFijarEscala: (fija: boolean) => void;
}

function LeyendaBase({ datos, controlador, alFijarEscala }: Props) {
  const [plegada, setPlegada] = useState(false);
  const idCuerpo = useId();
  const ref = formatearCorto(datos.escala.ref);
  const hayFlechas = datos.nFlechas > 0;
  const px = usePixelesPorUnidad(controlador);
  const normalizada = datos.modo === 'normalizado';
  // Flecha de referencia: ℓmax (o 0.75 ℓmax en modo normalizado) a la distancia del objetivo.
  const largoRef = Math.round(Math.min(184, Math.max(16, (normalizada ? 0.75 : 1) * datos.lMax * px)));
  const fija = datos.escala.origen === 'fija';
  const deltaDistinto = fija && datos.deltaFija !== null && Math.abs(datos.deltaFija - datos.deltaRef) > 1e-9 * datos.deltaRef;
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
          <div className="leyenda-bloque">
            {hayFlechas ? (
              <div className="leyenda-rampa">
                <span className="leyenda-rampa-titulo">{datos.luminancia === 'log' ? T.leyenda.magnitudLog : T.leyenda.magnitud}</span>
                <div className="leyenda-barra" style={{ backgroundImage: degradadoMagnitud() }} data-prueba="barra-magnitud" />
                <div className="leyenda-marcas num" data-prueba="leyenda-marcas" aria-hidden="true">
                  <span>0</span>
                  <span>{formatearCorto(Number((datos.escala.ref * FRACCION_CENTRO[datos.luminancia]).toPrecision(3)))}</span>
                  <span>≥ {ref}</span>
                </div>
              </div>
            ) : null}
            <ul className="leyenda-lista" data-prueba="leyenda-flechas">
              {hayFlechas ? (
                <li>
                  {GLIFO.flecha}
                  <span>{T.leyenda.sentido}</span>
                </li>
              ) : null}
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
            {hayFlechas ? (
              <>
                <div className="leyenda-referencia" data-prueba="leyenda-referencia">
                  <svg width={largoRef + 2} height="12" viewBox={`0 0 ${largoRef + 2} 12`} aria-hidden="true">
                    <path d={`M1 6h${largoRef - 7}`} stroke="currentColor" strokeWidth="1.5" />
                    <path d={`M${largoRef - 7} 2l7 4-7 4z`} fill="currentColor" />
                  </svg>
                  <span className="num">{normalizada ? T.leyenda.normalizada : T.leyenda.referencia(ref)}</span>
                </div>
                <div className="leyenda-pie-fila">
                  <p className="leyenda-pie num" data-prueba="leyenda-escala">
                    {T.leyenda.escala(ref, fija ? T.leyenda.escalaFija : T.leyenda.escalaAuto)}
                    <br />
                    {T.leyenda.longitudMax(formatearCorto(Number(datos.lMax.toPrecision(3))))}
                  </p>
                  <BotonIcono
                    etiqueta={fija ? T.leyenda.liberar : T.leyenda.fijar}
                    icono={fija ? Lock : LockOpen}
                    presionado={fija}
                    className="boton-candado"
                    onClick={() => alFijarEscala(!fija)}
                  />
                </div>
                {deltaDistinto ? (
                  <p className="leyenda-pie leyenda-aviso" data-prueba="leyenda-delta">
                    {T.leyenda.deltaDistinto}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
        {datos.lineas ? (
          <div className="leyenda-bloque">
            <ul className="leyenda-lista" data-prueba="leyenda-lineas">
              <li>
                {GLIFO.linea}
                <span>{T.leyenda.linea}</span>
              </li>
              <li>
                {GLIFO.cheuron}
                <span>{T.leyenda.lineaSentido}</span>
              </li>
              <li>
                {GLIFO.semilla}
                <span>{T.leyenda.semilla}</span>
              </li>
              {datos.lineas.finalesCero > 0 && !(datos.flechas && datos.ceros > 0) ? (
                <li>
                  {GLIFO.rombo}
                  <span>{T.leyenda.cero}</span>
                </li>
              ) : null}
              {datos.lineas.finalesIndefinidos > 0 && !(datos.flechas && datos.indefinidos > 0) ? (
                <li>
                  {GLIFO.aspa}
                  <span>{T.leyenda.indefinido}</span>
                </li>
              ) : null}
            </ul>
            {datos.lineas.actualizando ? (
              <p className="leyenda-pie" data-prueba="leyenda-actualizando">
                {T.leyenda.actualizando}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export const Leyenda = memo(LeyendaBase);
