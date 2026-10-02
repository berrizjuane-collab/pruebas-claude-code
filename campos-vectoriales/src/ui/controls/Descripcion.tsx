/**
 * Descripción emergente propia (DESIGN §6.1; sin `title` nativo, §2.4). Aparece tras
 * 400 ms con el puntero **o** con el foco del teclado, se puede recorrer con el puntero sin
 * que desaparezca y se cierra con Esc (WCAG 1.4.13). El disparador la referencia con
 * `aria-describedby`. Se pinta en un portal con posición fija para que no la recorte el
 * desplazamiento del panel.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type Lado = 'arriba' | 'abajo' | 'izquierda' | 'derecha';

const RETARDO = 400;
const GRACIA = 120;
const MARGEN = 8;

export interface PropsDisparador {
  'aria-describedby': string;
  onPointerEnter: (e: { currentTarget: Element }) => void;
  onPointerLeave: () => void;
  onFocus: (e: { currentTarget: Element }) => void;
  onBlur: () => void;
  onKeyDown: (e: { key: string }) => void;
}

interface Opciones {
  texto: ReactNode;
  atajo?: string;
  lado?: Lado;
  /** Siempre visible (galería de estados). */
  abierta?: boolean;
}

/** Engancha una descripción emergente a un disparador: devuelve sus props y el elemento. */
export function useDescripcion({ texto, atajo, lado = 'arriba', abierta = false }: Opciones) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const ancla = useRef<Element | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const limpiar = () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
  };
  const mostrar = useCallback((el?: Element | null) => {
    if (el) ancla.current = el;
    limpiar();
    temporizador.current = setTimeout(() => setVisible(true), RETARDO);
  }, []);
  const ocultar = useCallback((conGracia = false) => {
    limpiar();
    if (conGracia) temporizador.current = setTimeout(() => setVisible(false), GRACIA);
    else setVisible(false);
  }, []);
  useEffect(() => limpiar, []);

  const props: PropsDisparador = {
    'aria-describedby': id,
    onPointerEnter: (e) => mostrar(e.currentTarget),
    onPointerLeave: () => ocultar(true),
    onFocus: (e) => {
      ancla.current = e.currentTarget;
      // Solo con el teclado: un clic no debe abrir la descripción.
      if (e.currentTarget.matches(':focus-visible')) mostrar();
    },
    onBlur: () => ocultar(),
    onKeyDown: (e) => {
      if (e.key === 'Escape') ocultar();
    },
  };

  const elemento = (
    <Burbuja
      id={id}
      texto={texto}
      atajo={atajo}
      lado={lado}
      forzada={abierta}
      visible={visible || abierta}
      ancla={ancla}
      alEntrar={limpiar}
      alSalir={() => ocultar(true)}
    />
  );
  return { props, elemento };
}

function Burbuja({
  id,
  texto,
  atajo,
  lado,
  forzada,
  visible,
  ancla,
  alEntrar,
  alSalir,
}: {
  id: string;
  texto: ReactNode;
  atajo?: string;
  lado: Lado;
  forzada: boolean;
  visible: boolean;
  ancla: React.RefObject<Element | null>;
  alEntrar: () => void;
  alSalir: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [estilo, setEstilo] = useState<CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!visible || !ref.current) return;
    // Sin interacción previa (descripción forzada), el disparador es quien la referencia.
    const disparador = ancla.current ?? document.querySelector(`[aria-describedby~="${CSS.escape(id)}"]`);
    if (!disparador) return;
    const a = disparador.getBoundingClientRect();
    const b = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = a.left + a.width / 2 - b.width / 2;
    let y = a.top - b.height - MARGEN;
    if (lado === 'abajo' || (lado === 'arriba' && y < MARGEN)) y = a.bottom + MARGEN;
    if (lado === 'izquierda') {
      x = a.left - b.width - MARGEN;
      y = a.top + a.height / 2 - b.height / 2;
    } else if (lado === 'derecha') {
      x = a.right + MARGEN;
      y = a.top + a.height / 2 - b.height / 2;
    }
    x = Math.min(Math.max(MARGEN, x), vw - b.width - MARGEN);
    y = Math.min(Math.max(MARGEN, y), vh - b.height - MARGEN);
    setEstilo({ left: Math.round(x), top: Math.round(y) });
  }, [visible, lado, ancla, texto, id]);

  // El texto siempre está en el DOM (oculto) para que aria-describedby tenga contenido.
  const contenido = (
    <div
      ref={ref}
      id={id}
      role="tooltip"
      className="descripcion"
      data-visible={visible}
      style={visible ? estilo : undefined}
      onPointerEnter={alEntrar}
      onPointerLeave={alSalir}
    >
      <span>{texto}</span>
      {atajo ? <kbd>{atajo}</kbd> : null}
    </div>
  );
  // Forzada (galería): en línea, dentro de su región. Si no, en un portal sobre todo lo demás.
  return forzada || typeof document === 'undefined' ? contenido : createPortal(contenido, document.body);
}
