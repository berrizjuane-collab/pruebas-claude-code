/**
 * Botón de menú (patrón ARIA *menu button*): Intro, Espacio o ↓ abren y enfocan la primera
 * opción; ↑ abre en la última; ↑↓ recorren (con vuelta), Inicio/Fin, Esc cierra y devuelve
 * el foco; Tab cierra. Las opciones deshabilitadas son enfocables y explican el motivo.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Forzado, Icono } from './Boton';
import { useDescripcion } from './Descripcion';

export interface OpcionMenu {
  id: string;
  texto: string;
  atajo?: string;
  icono?: Icono;
  deshabilitado?: boolean;
  motivo?: string;
  alElegir: () => void;
}

interface Props {
  /** Texto del botón (o nombre accesible si `soloIcono`). */
  etiqueta: string;
  icono?: Icono;
  soloIcono?: boolean;
  opciones: readonly OpcionMenu[];
  alineacion?: 'izquierda' | 'derecha';
  /** Abierto desde el inicio (galería). */
  abiertoInicial?: boolean;
  forzar?: Forzado;
  datosPrueba?: string;
}

export function Menu({ etiqueta, icono: I, soloIcono, opciones, alineacion = 'izquierda', abiertoInicial = false, forzar, datosPrueba }: Props) {
  const id = useId();
  const [abierto, setAbierto] = useState(abiertoInicial);
  const [activa, setActiva] = useState(0);
  const boton = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const d = useDescripcion({ texto: etiqueta });

  const abrir = (indice: number) => {
    setActiva(indice);
    setAbierto(true);
  };
  const cerrar = (devolverFoco: boolean) => {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  };

  useEffect(() => {
    if (abierto && !abiertoInicial) items.current[activa]?.focus();
  }, [abierto, activa, abiertoInicial]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (!lista.current?.contains(e.target as Node) && !boton.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [abierto]);

  // Intro y Espacio llegan como clic nativo del botón (abre y enfoca la primera opción).
  const alTeclearBoton = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      abrir(0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      abrir(opciones.length - 1);
    }
  };
  const alTeclearLista = (e: KeyboardEvent) => {
    const n = opciones.length;
    const mover = { ArrowDown: (activa + 1) % n, ArrowUp: (activa - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (mover !== undefined) {
      e.preventDefault();
      setActiva(mover);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cerrar(true);
    } else if (e.key === 'Tab') {
      setAbierto(false);
    }
  };

  return (
    <div className={`menu menu-${alineacion}`} data-prueba={datosPrueba}>
      <button
        ref={boton}
        type="button"
        id={`${id}-boton`}
        className={soloIcono ? 'boton-icono' : 'boton boton-secundario'}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={`${id}-lista`}
        aria-label={soloIcono ? etiqueta : undefined}
        data-forzar={forzar}
        {...(soloIcono ? d.props : {})}
        onClick={() => (abierto ? cerrar(false) : abrir(0))}
        onKeyDown={alTeclearBoton}
      >
        {I ? <I size={16} strokeWidth={1.5} aria-hidden="true" /> : null}
        {soloIcono ? null : (
          <>
            <span className="boton-texto">{etiqueta}</span>
            <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" className="menu-flecha" />
          </>
        )}
      </button>
      {soloIcono ? d.elemento : null}
      <div
        ref={lista}
        id={`${id}-lista`}
        role="menu"
        aria-labelledby={`${id}-boton`}
        className="menu-lista"
        hidden={!abierto}
        onKeyDown={alTeclearLista}
      >
        {opciones.map((o, i) => (
          <OpcionDeMenu
            key={o.id}
            opcion={o}
            refBoton={(b) => {
              items.current[i] = b;
            }}
            tabIndex={i === activa ? 0 : -1}
            alElegir={() => {
              cerrar(true);
              o.alElegir();
            }}
            alEnfocar={() => setActiva(i)}
          />
        ))}
      </div>
    </div>
  );
}

function OpcionDeMenu({
  opcion: o,
  refBoton,
  tabIndex,
  alElegir,
  alEnfocar,
}: {
  opcion: OpcionMenu;
  refBoton: (b: HTMLButtonElement | null) => void;
  tabIndex: number;
  alElegir: () => void;
  alEnfocar: () => void;
}) {
  const d = useDescripcion({ texto: o.motivo ?? '', lado: 'derecha' });
  const I = o.icono;
  const conMotivo = o.deshabilitado && !!o.motivo;
  return (
    <>
      <button
        ref={refBoton}
        type="button"
        role="menuitem"
        className="menu-opcion"
        tabIndex={tabIndex}
        aria-disabled={o.deshabilitado || undefined}
        data-opcion={o.id}
        {...(conMotivo ? d.props : {})}
        onFocus={(e) => {
          alEnfocar();
          if (conMotivo) d.props.onFocus(e);
        }}
        onClick={() => {
          if (!o.deshabilitado) alElegir();
        }}
      >
        <span className="menu-opcion-icono" aria-hidden="true">
          {I ? <I size={16} strokeWidth={1.5} aria-hidden="true" /> : null}
        </span>
        <span className="menu-opcion-texto">{o.texto}</span>
        {o.atajo ? <kbd aria-hidden="true">{o.atajo}</kbd> : null}
      </button>
      {conMotivo ? d.elemento : null}
    </>
  );
}
