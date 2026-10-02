/**
 * Lista desplegable propia (DESIGN §2.4 y §6.1; patrón ARIA *select-only combobox*): el
 * foco se queda en el botón y la opción activa se indica con `aria-activedescendant`.
 * Cerrada: Intro, Espacio, ↓ o ↑ abren. Abierta: ↑↓, Inicio/Fin, Intro o Espacio eligen,
 * Esc cierra sin cambiar. La opción elegida lleva ✓.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { Forzado } from './Boton';
import { useDescripcion } from './Descripcion';
import type { Opcion } from './Segmentado';

interface Props<V extends string> {
  etiqueta: string;
  opciones: readonly Opcion<V>[];
  valor: V;
  alCambiar: (v: V) => void;
  deshabilitado?: boolean;
  /** Por qué está deshabilitada (DESIGN §7). */
  motivo?: string;
  abiertaInicial?: boolean;
  forzar?: Forzado;
  datosPrueba?: string;
}

export function ListaDesplegable<V extends string>({ etiqueta, opciones, valor, alCambiar, deshabilitado, motivo, abiertaInicial = false, forzar, datosPrueba }: Props<V>) {
  const id = useId();
  const d = useDescripcion({ texto: motivo ?? '' });
  const conMotivo = deshabilitado && !!motivo;
  const [abierta, setAbierta] = useState(abiertaInicial);
  const elegida = Math.max(0, opciones.findIndex((o) => o.valor === valor));
  const [activa, setActiva] = useState(elegida);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAbierta(false);
    };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [abierta]);

  const abrir = (i: number) => {
    if (deshabilitado) return;
    setActiva(i);
    setAbierta(true);
  };
  const elegir = (i: number) => {
    const o = opciones[i];
    setAbierta(false);
    if (o && o.valor !== valor) alCambiar(o.valor);
  };
  const alTeclear = (e: KeyboardEvent) => {
    const n = opciones.length;
    if (!abierta) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        abrir(e.key === 'ArrowUp' && elegida === 0 ? 0 : elegida);
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        abrir(e.key === 'Home' ? 0 : n - 1);
      }
      return;
    }
    const mover = { ArrowDown: Math.min(n - 1, activa + 1), ArrowUp: Math.max(0, activa - 1), Home: 0, End: n - 1 }[e.key];
    if (mover !== undefined) {
      e.preventDefault();
      setActiva(mover);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      elegir(activa);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setAbierta(false);
    } else if (e.key === 'Tab') {
      setAbierta(false);
    }
  };

  const actual = opciones[elegida];
  return (
    <div ref={raiz} className="lista" data-prueba={datosPrueba}>
      <div
        role="combobox"
        tabIndex={0}
        className="lista-boton"
        aria-label={etiqueta}
        aria-haspopup="listbox"
        aria-expanded={abierta}
        aria-controls={`${id}-lista`}
        aria-activedescendant={abierta ? `${id}-op-${activa}` : undefined}
        aria-disabled={deshabilitado || undefined}
        data-forzar={forzar}
        {...(conMotivo ? d.props : {})}
        onClick={() => (abierta ? setAbierta(false) : abrir(elegida))}
        onKeyDown={alTeclear}
      >
        <span className="lista-valor">{actual?.texto}</span>
        <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" />
      </div>
      {conMotivo ? d.elemento : null}
      <div role="listbox" id={`${id}-lista`} className="lista-opciones" aria-label={etiqueta} hidden={!abierta}>
        {opciones.map((o, i) => (
          <div
            key={o.valor}
            id={`${id}-op-${i}`}
            role="option"
            aria-selected={i === elegida}
            className="lista-opcion"
            data-activa={i === activa || undefined}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => elegir(i)}
          >
            <span className="lista-marca" aria-hidden="true">
              {i === elegida ? <Check size={14} strokeWidth={1.5} /> : null}
            </span>
            {o.texto}
          </div>
        ))}
      </div>
    </div>
  );
}
