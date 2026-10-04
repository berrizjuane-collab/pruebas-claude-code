import { memo, useEffect, useId, useState, type ReactNode } from 'react';
// La leyenda exportada (EXP-03) sigue las mismas reglas: `bloquesLeyenda`, más abajo.
import { ChevronDown, Lock, LockOpen } from 'lucide-react';
import type { BloqueLeyenda } from '../../export/png';
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
  /** Vector de los glifos: F o rot F (DESIGN §9.1: la banda clara tiene un único significado). */
  glifos: 'campo' | 'rotacional';
  /** Escala de los glifos dibujados: F_ref o C_ref. */
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
  /** Partículas visibles: escala temporal τ y si la animación está en pausa (null si apagadas). */
  particulas: { tau: number; enPausa: boolean; emision: boolean } | null;
  /**
   * Campo dependiente del tiempo (DESIGN §9.13): instante de las líneas de corriente
   * instantáneas (null si no hay); null con un campo estacionario.
   */
  tiempo: { tLineas: number | null } | null;
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
  // Partícula: punto claro con halo; estela gris que se estrecha hacia atrás (DESIGN §9.1).
  particula: (
    <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true">
      <circle cx="16" cy="6" r="3.2" fill={escena.particula} stroke={escena.halo} strokeWidth="1.5" />
    </svg>
  ),
  estela: (
    <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true">
      <path d="M2 7.6 15 5 15 7z" fill={escena.estela} />
      <circle cx="16" cy="6" r="2.6" fill={escena.particula} stroke={escena.halo} strokeWidth="1.2" />
    </svg>
  ),
  // Anillo de giro alrededor del eje (visto un poco desde la punta): la mitad delantera
  // queda a la izquierda y su flecha baja, como manda la regla de la mano derecha.
  anillo: (
    <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true">
      <path d="M1 6h13" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13 2l7 4-7 4z" fill="currentColor" />
      <ellipse cx="7" cy="6" rx="2.6" ry="4.7" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.9 4.9 4.4 7.6 5.9 4.9" fill="none" stroke="currentColor" strokeWidth="1.2" />
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
  /** Plegada al empezar (por debajo de 1024 px, DESIGN §5.4). */
  plegadaInicial?: boolean;
}

function LeyendaBase({ datos, controlador, alFijarEscala, alFijarVRef, plegadaInicial = false }: Props) {
  const [plegada, setPlegada] = useState(plegadaInicial);
  const idCuerpo = useId();
  const ref = formatearCorto(datos.escala.ref);
  const hayFlechas = datos.nFlechas > 0;
  const px = usePixelesPorUnidad(controlador);
  const normalizada = datos.modo === 'normalizado';
  // Flecha de referencia: ℓmax (o 0.75 ℓmax en modo normalizado) a la distancia del objetivo.
  const largoRef = Math.round(Math.min(184, Math.max(16, (normalizada ? 0.75 : 1) * datos.lMax * px)));
  const fija = datos.escala.origen === 'fija';
  // Textos del vector dibujado: F (F_ref) o rot F (C_ref).
  const rot = datos.glifos === 'rotacional';
  const texto = rot
    ? { magnitud: T.leyenda.rot.magnitud, magnitudLog: T.leyenda.rot.magnitudLog, sentido: T.leyenda.rot.eje, saturada: T.leyenda.rot.saturada, cero: T.leyenda.rot.cero, referencia: T.leyenda.rot.referencia, escala: T.leyenda.rot.escala }
    : { magnitud: T.leyenda.magnitud, magnitudLog: T.leyenda.magnitudLog, sentido: T.leyenda.sentido, saturada: T.leyenda.saturada, cero: T.leyenda.cero, referencia: T.leyenda.referencia, escala: T.leyenda.escala };
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
                <span className="leyenda-rampa-titulo">{datos.luminancia === 'log' ? texto.magnitudLog : texto.magnitud}</span>
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
                  <span>{texto.sentido}</span>
                </li>
              ) : null}
              {hayFlechas && rot ? (
                <li>
                  {GLIFO.anillo}
                  <span>{T.leyenda.rot.giro}</span>
                </li>
              ) : null}
              {datos.saturadas > 0 && datos.modo === 'proporcional' ? (
                <li>
                  {GLIFO.doble}
                  <span>{texto.saturada(ref)}</span>
                </li>
              ) : null}
              {datos.ceros > 0 ? (
                <li>
                  {GLIFO.rombo}
                  <span>{texto.cero}</span>
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
                  <span className="num">{normalizada ? T.leyenda.normalizada : texto.referencia(ref)}</span>
                </div>
                <div className="leyenda-pie-fila">
                  <p className="leyenda-pie num" data-prueba="leyenda-escala">
                    {texto.escala(ref, origenEscala(datos.escala))}
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
            {pieLineas(datos).length ? (
              <p className="leyenda-pie num" data-prueba={datos.lineas.actualizando ? 'leyenda-actualizando' : 'leyenda-lineas-pie'}>
                {pieLineas(datos).map((linea, k) => (
                  <span key={k}>
                    {k > 0 ? <br /> : null}
                    {linea}
                  </span>
                ))}
              </p>
            ) : null}
          </div>
        ) : null}
        {datos.particulas ? (
          <div className="leyenda-bloque">
            <ul className="leyenda-lista" data-prueba="leyenda-particulas">
              <li>
                {GLIFO.particula}
                <span>{T.leyenda.particula}</span>
              </li>
              <li>
                {GLIFO.estela}
                <span>{T.leyenda.estela}</span>
              </li>
            </ul>
            <p className="leyenda-pie num" data-prueba="leyenda-tau">
              {pieParticulas(datos).map((linea, k) => (
                <span key={k}>
                  {k > 0 ? <br /> : null}
                  {linea}
                </span>
              ))}
            </p>
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

/**
 * La misma leyenda como datos planos para la imagen exportada (EXP-03): mismas entradas, en el
 * mismo orden y con los mismos textos que la de pantalla (sin los controles). `largoRef` es la
 * flecha de referencia en px CSS a la escala de la imagen.
 */
/** Origen de la escala en el pie: fija, auto (P95) o, con un campo temporal, P95 en la ventana. */
function origenEscala(e: Escala): string {
  if (e.origen === 'fija') return T.leyenda.escalaFija;
  return e.ventana ? T.leyenda.escalaAutoVentana(formatearCorto(e.ventana[0]), formatearCorto(e.ventana[1])) : T.leyenda.escalaAuto;
}

/** Pie del bloque de líneas: instante de las líneas instantáneas y si se están actualizando. */
function pieLineas(datos: DatosLeyenda): string[] {
  const pie: string[] = [];
  if (datos.tiempo?.tLineas != null) pie.push(T.leyenda.lineasInstantaneas(formatearCorto(datos.tiempo.tLineas)));
  if (datos.lineas?.actualizando) pie.push(T.leyenda.actualizando);
  return pie;
}

/** Pie del bloque de partículas: trayectorias o líneas de traza (campo temporal o emisión), τ y pausa. */
function pieParticulas(datos: DatosLeyenda): string[] {
  const p = datos.particulas;
  if (!p) return [];
  const pie: string[] = [];
  if (p.emision) pie.push(T.leyenda.lineasTraza);
  else if (datos.tiempo) pie.push(T.leyenda.trayectorias);
  pie.push(T.leyenda.tau(formatearCorto(Number(p.tau.toPrecision(3)))));
  if (p.enPausa) pie.push(T.leyenda.enPausa);
  return pie;
}

export function bloquesLeyenda(datos: DatosLeyenda, largoRef: number): BloqueLeyenda[] {
  const bloques: BloqueLeyenda[] = [];
  const ref = formatearCorto(datos.escala.ref);
  const hayFlechas = datos.nFlechas > 0;
  const rot = datos.glifos === 'rotacional';
  const tx = rot ? T.leyenda.rot : T.leyenda;
  const sentido = rot ? T.leyenda.rot.eje : T.leyenda.sentido;
  const fija = datos.escala.origen === 'fija';
  const paradasMagnitud = Array.from({ length: 11 }, (_, i) => hexGris(grisRampaMagnitud(i / 10) * 255));
  if (datos.flechas) {
    const b: BloqueLeyenda = { filas: [], pie: [] };
    if (hayFlechas) {
      b.rampa = {
        titulo: datos.luminancia === 'log' ? tx.magnitudLog : tx.magnitud,
        paradas: paradasMagnitud,
        marcas: ['0', formatearCorto(Number((datos.escala.ref * FRACCION_CENTRO[datos.luminancia]).toPrecision(3))), `≥ ${ref}`],
      };
      b.filas.push({ glifo: 'flecha', texto: sentido });
      if (rot) b.filas.push({ glifo: 'anillo', texto: T.leyenda.rot.giro });
    }
    if (datos.saturadas > 0 && datos.modo === 'proporcional') b.filas.push({ glifo: 'doble', texto: tx.saturada(ref) });
    if (datos.ceros > 0) b.filas.push({ glifo: 'rombo', texto: tx.cero });
    if (datos.indefinidos > 0) b.filas.push({ glifo: 'aspa', texto: T.leyenda.indefinido });
    if (hayFlechas) {
      b.filas.push({ glifo: { referencia: largoRef }, texto: datos.modo === 'normalizado' ? T.leyenda.normalizada : tx.referencia(ref) });
      b.pie.push(tx.escala(ref, origenEscala(datos.escala)), T.leyenda.longitudMax(formatearCorto(Number(datos.lMax.toPrecision(3)))));
      if (fija && datos.deltaFija !== null && Math.abs(datos.deltaFija - datos.deltaRef) > 1e-9 * datos.deltaRef) b.pie.push(T.leyenda.deltaDistinto);
    }
    bloques.push(b);
  }
  if (datos.lineas) {
    const b: BloqueLeyenda = {
      filas: [
        { glifo: 'linea', texto: T.leyenda.linea },
        { glifo: 'cheuron', texto: T.leyenda.lineaSentido },
        { glifo: 'semilla', texto: T.leyenda.semilla },
      ],
      pie: pieLineas(datos),
    };
    if (datos.lineas.finalesCero > 0 && !(datos.flechas && datos.ceros > 0)) b.filas.push({ glifo: 'rombo', texto: T.leyenda.cero });
    if (datos.lineas.finalesIndefinidos > 0 && !(datos.flechas && datos.indefinidos > 0)) b.filas.push({ glifo: 'aspa', texto: T.leyenda.indefinido });
    bloques.push(b);
  }
  if (datos.particulas) {
    bloques.push({
      filas: [
        { glifo: 'particula', texto: T.leyenda.particula },
        { glifo: 'estela', texto: T.leyenda.estela },
      ],
      pie: pieParticulas(datos),
    });
  }
  const c = datos.corte;
  if (c) {
    const nombre = T.leyenda.escalarCorte[c.tipo];
    const conSigno = c.tipo !== 'magnitud';
    if (c.nulo) {
      bloques.push({ rampa: undefined, filas: [], pie: [T.leyenda.tituloCorte(nombre, false, c.rotulo), T.leyenda.corteNulo(nombre)] });
    } else {
      const v = formatearCorto(c.vRef);
      const { lMin, lMax } = rampa.escalar;
      const b: BloqueLeyenda = {
        rampa: {
          titulo: T.leyenda.tituloCorte(nombre, conSigno, c.rotulo),
          paradas: Array.from({ length: 11 }, (_, i) => grisL(lMin + ((lMax - lMin) * i) / 10)),
          marcas: ['0', formatearCorto(Number((c.vRef / 2).toPrecision(3))), `≥ ${v}`],
        },
        filas: [],
        pie: [T.leyenda.vRef(v, c.fija ? T.leyenda.escalaFija : T.leyenda.escalaAuto), ...(conSigno ? [T.leyenda.casiCero(nombre)] : [])],
      };
      if (c.tipo !== 'magnitud') {
        const muestra = (signo: 1 | -1) => ({ signo, tipo: c.tipo as Exclude<TipoEscalar, 'magnitud'>, base: grisL(22), patron: grisL(22 + rampa.patronDeltaL) });
        if (c.signos.positivo) b.filas.push({ glifo: muestra(1), texto: T.leyenda.signoPositivo[c.tipo](c.eje) });
        if (c.signos.negativo) b.filas.push({ glifo: muestra(-1), texto: T.leyenda.signoNegativo[c.tipo](c.eje) });
        if (c.signos.cero) b.filas.push({ glifo: 'nivelCero', texto: T.leyenda.nivelCero(nombre) });
      }
      const indefinidoListado = (datos.flechas && datos.indefinidos > 0) || (datos.lineas?.finalesIndefinidos ?? 0) > 0;
      if (c.sinValor && !indefinidoListado) b.filas.push({ glifo: 'aspa', texto: T.leyenda.indefinido });
      bloques.push(b);
    }
  }
  return bloques;
}
