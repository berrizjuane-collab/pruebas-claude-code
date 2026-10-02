import { memo, useEffect, useId, useState, type ReactNode } from 'react';
import { ChevronDown, Lock, LockOpen } from 'lucide-react';
import type { ControladorEscena } from '../../render/ControladorEscena';
import { BotonIcono } from '../controls/Boton';
import { grisDeLstar, hexGris } from '../../design/color';
import { escena, rampa } from '../../design/tokens';
import { grisRampaMagnitud } from '../../geometria/flechas';
import { formatearCorto } from '../../numerics/format';
import type { Escala } from '../../numerics/grid';
import type { TipoEscalar } from '../../numerics/slice';
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
  /** Mapa escalar del corte (null si no hay): rótulo del plano, eje normal y V_ref. */
  corte: {
    tipo: TipoEscalar;
    rotulo: string;
    eje: string;
    vRef: number;
    fija: boolean;
    sinValor: boolean;
    /** Lo que de verdad aparece en el mapa: solo eso entra en la leyenda (DESIGN §9.12). */
    signos: { positivo: boolean; negativo: boolean; cero: boolean };
    /** El escalar es nulo en todo el corte (con V_ref automática): no hay escala que mostrar. */
    nulo: boolean;
  } | null;
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

/** Gris sRGB de una luminancia L*. */
const grisL = (l: number) => hexGris(grisDeLstar(l));

/** Banda oscura del mapa escalar (L* 6 → 32, DESIGN §2.2). */
function degradadoEscalar(): string {
  const { lMin, lMax } = rampa.escalar;
  const paradas = Array.from({ length: 11 }, (_, i) => `${grisL(lMin + ((lMax - lMin) * i) / 10)} ${i * 10}%`);
  return `linear-gradient(to right, ${paradas.join(', ')})`;
}

/** Trazo del glifo de signo centrado en (11, 6), como en la escena (gris `escena.cero` sobre halo). */
const TRAZO_SIGNO: Record<Exclude<TipoEscalar, 'magnitud'>, { pos: ReactNode; neg: ReactNode }> = {
  divergencia: { pos: <path d="M7.5 6h7M11 2.5v7" />, neg: <path d="M7.5 6h7" /> },
  normal: {
    pos: (
      <>
        <circle cx="11" cy="6" r="4.25" />
        <circle cx="11" cy="6" r="1.4" fill="currentColor" />
      </>
    ),
    neg: (
      <>
        <circle cx="11" cy="6" r="4.25" />
        <path d="M8.6 3.6l4.8 4.8M13.4 3.6l-4.8 4.8" />
      </>
    ),
  },
  // Arco de 300° con punta arriba: hacia la izquierda = antihorario; hacia la derecha = horario.
  rotacional: {
    pos: <path d="M7.88 4.2A3.6 3.6 0 1 0 11 2.4M12.9 0.9 11 2.4l1.9 1.6" />,
    neg: <path d="M14.12 4.2A3.6 3.6 0 1 1 11 2.4M9.1 0.9 11 2.4l-1.9 1.6" />,
  },
};

/** Muestra del mapa: base de la banda oscura con puntos (+) o rayado (−) y el glifo encima. */
function MuestraSigno({ signo, trazo }: { signo: 1 | -1; trazo: ReactNode }) {
  const base = grisL(22);
  const patron = grisL(22 + rampa.patronDeltaL);
  return (
    <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true">
      <rect width="22" height="12" rx="2" fill={base} />
      {signo > 0 ? (
        <g fill={patron}>
          {[2, 6, 10, 14, 18].flatMap((x) => [2, 6, 10].map((y) => <circle key={`${x}-${y}`} cx={x + (y === 6 ? 2 : 0)} cy={y} r="0.9" />))}
        </g>
      ) : (
        <path d="M-12 12 0 0M-6 12 6 0M0 12 12 0M6 12 18 0M12 12 24 0M18 12 30 0" stroke={patron} strokeWidth="0.8" />
      )}
      <g fill="none" strokeLinecap="round" stroke={escena.halo} strokeWidth="3.5" style={{ color: escena.halo }}>
        {trazo}
      </g>
      <g fill="none" strokeLinecap="round" stroke={escena.cero} strokeWidth="1.3" style={{ color: escena.cero }}>
        {trazo}
      </g>
    </svg>
  );
}

const NIVEL_CERO = (
  <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true">
    <path d="M1 6h20" stroke={escena.cero} strokeWidth="1.5" strokeDasharray="4.5 3" />
  </svg>
);

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
  alFijarVRef: (fija: boolean) => void;
}

function LeyendaBase({ datos, controlador, alFijarEscala, alFijarVRef }: Props) {
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
  // «× no definido» aparece una sola vez en toda la leyenda.
  const indefinidoListado = (datos.flechas && datos.indefinidos > 0) || (datos.lineas?.finalesIndefinidos ?? 0) > 0;
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
        {datos.corte ? <BloqueCorte corte={datos.corte} indefinidoYaListado={indefinidoListado} alFijarVRef={alFijarVRef} /> : null}
      </div>
    </section>
  );
}

/** Bloque del mapa escalar del corte (DESIGN §9.6–9.8 y §9.12: va el último). */
function BloqueCorte({
  corte,
  indefinidoYaListado,
  alFijarVRef,
}: {
  corte: NonNullable<DatosLeyenda['corte']>;
  indefinidoYaListado: boolean;
  alFijarVRef: (fija: boolean) => void;
}) {
  const nombre = T.leyenda.escalarCorte[corte.tipo];
  const v = formatearCorto(corte.vRef);
  const conSigno = corte.tipo !== 'magnitud';
  if (corte.nulo) {
    return (
      <div className="leyenda-bloque" data-prueba="leyenda-corte">
        <span className="leyenda-rampa-titulo">{T.leyenda.tituloCorte(nombre, false, corte.rotulo)}</span>
        <p className="leyenda-pie num" data-prueba="leyenda-vref">
          {T.leyenda.corteNulo(nombre)}
        </p>
      </div>
    );
  }
  return (
    <div className="leyenda-bloque" data-prueba="leyenda-corte">
      <div className="leyenda-rampa">
        <span className="leyenda-rampa-titulo">{T.leyenda.tituloCorte(nombre, conSigno, corte.rotulo)}</span>
        <div className="leyenda-barra" style={{ backgroundImage: degradadoEscalar() }} data-prueba="barra-escalar" />
        <div className="leyenda-marcas num" aria-hidden="true">
          <span>0</span>
          <span>{formatearCorto(Number((corte.vRef / 2).toPrecision(3)))}</span>
          <span>≥ {v}</span>
        </div>
      </div>
      <ul className="leyenda-lista" data-prueba="leyenda-signos">
        {corte.tipo !== 'magnitud' ? (
          <>
            {corte.signos.positivo ? (
              <li>
                <MuestraSigno signo={1} trazo={TRAZO_SIGNO[corte.tipo].pos} />
                <span>{T.leyenda.signoPositivo[corte.tipo](corte.eje)}</span>
              </li>
            ) : null}
            {corte.signos.negativo ? (
              <li>
                <MuestraSigno signo={-1} trazo={TRAZO_SIGNO[corte.tipo].neg} />
                <span>{T.leyenda.signoNegativo[corte.tipo](corte.eje)}</span>
              </li>
            ) : null}
            {corte.signos.cero ? (
              <li>
                {NIVEL_CERO}
                <span>{T.leyenda.nivelCero(nombre)}</span>
              </li>
            ) : null}
          </>
        ) : null}
        {corte.sinValor && !indefinidoYaListado ? (
          <li>
            {GLIFO.aspa}
            <span>{T.leyenda.indefinido}</span>
          </li>
        ) : null}
      </ul>
      <div className="leyenda-pie-fila">
        <p className="leyenda-pie num" data-prueba="leyenda-vref">
          {T.leyenda.vRef(v, corte.fija ? T.leyenda.escalaFija : T.leyenda.escalaAuto)}
          {conSigno ? (
            <>
              <br />
              {T.leyenda.casiCero(nombre)}
            </>
          ) : null}
        </p>
        <BotonIcono
          etiqueta={corte.fija ? T.leyenda.liberarVRef : T.leyenda.fijarVRef}
          icono={corte.fija ? Lock : LockOpen}
          presionado={corte.fija}
          className="boton-candado"
          onClick={() => alFijarVRef(!corte.fija)}
        />
      </div>
    </div>
  );
}

export const Leyenda = memo(LeyendaBase);
