/**
 * Diálogo modal (DESIGN §6.1, F9): `<dialog>` nativo abierto con `showModal()`, de modo que
 * el navegador pone el resto de la página inerte y encierra el foco. Título en `<h2>`
 * (nombre accesible), × y Esc cierran, y el foco vuelve a donde estaba al abrirlo.
 * Se abre al montarse y se cierra al desmontarse. El foco inicial va al elemento con
 * `data-autofoco` (p. ej. el botón primario).
 */
import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { BotonIcono } from './Boton';

interface Props {
  titulo: string;
  /** Texto del botón × (nombre accesible). */
  cerrar: string;
  alCerrar: () => void;
  children: ReactNode;
  /** Botones del pie (el primario, a la derecha). */
  acciones?: ReactNode;
  datosPrueba?: string;
}

export function Dialogo({ titulo, cerrar, alCerrar, children, acciones, datosPrueba }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  useLayoutEffect(() => {
    const d = ref.current;
    const previo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (d && !d.open) {
      d.showModal();
      // Foco inicial: la acción marcada con data-autofoco (si no, el navegador elige la primera).
      d.querySelector<HTMLElement>('[data-autofoco]')?.focus();
    }
    return () => {
      if (d?.open) d.close();
      if (previo?.isConnected) previo.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialogo"
      aria-labelledby={idTitulo}
      data-prueba={datosPrueba}
      onCancel={(e) => {
        // Esc: el cierre lo decide el dueño (que desmonta el diálogo).
        e.preventDefault();
        alCerrar();
      }}
    >
      <div className="dialogo-cabecera">
        <h2 id={idTitulo} className="dialogo-titulo">
          {titulo}
        </h2>
        <BotonIcono etiqueta={cerrar} icono={X} atajo="Esc" onClick={alCerrar} />
      </div>
      <div className="dialogo-cuerpo">{children}</div>
      {acciones ? <div className="dialogo-acciones">{acciones}</div> : null}
    </dialog>
  );
}
