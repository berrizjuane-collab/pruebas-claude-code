import { useEffect, useRef, type ReactNode } from 'react';
import { MonitorX } from 'lucide-react';
import { ControladorEscena } from '../../render/ControladorEscena';
import { T } from '../../i18n/es';

interface Props {
  fuentes: Promise<void>;
  movimientoReducido: boolean;
  resumen: string;
  error: string | null;
  alControlador: (c: ControladorEscena | null, error?: string) => void;
  children?: ReactNode;
}

/** Monta el controlador de la escena sobre un lienzo (REN-01) y aloja los flotantes. */
export function VistaEscena({ fuentes, movimientoReducido, resumen, error, alControlador, children }: Props) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  // El controlador se crea una vez con la preferencia inicial; los cambios llegan por App.
  const movimientoInicial = useRef(movimientoReducido);

  useEffect(() => {
    let c: ControladorEscena | null = null;
    if (!lienzo.current) return;
    try {
      c = new ControladorEscena(lienzo.current, { movimientoReducido: movimientoInicial.current, fuentes });
      alControlador(c);
    } catch (e) {
      alControlador(null, e instanceof Error ? e.message : String(e));
    }
    return () => {
      c?.dispose();
    };
  }, [fuentes, alControlador]);

  return (
    <main className="escena" data-region="escena" id="escena" tabIndex={-1}>
      <canvas
        ref={lienzo}
        className="escena-lienzo"
        tabIndex={0}
        role="application"
        aria-roledescription={T.escena.rol}
        aria-label={T.escena.etiqueta}
        aria-describedby="resumen-escena"
        data-prueba="lienzo"
      />
      <p id="resumen-escena" className="solo-lector" aria-live="polite">
        {resumen}
      </p>
      {error ? (
        <div className="estado-vacio" role="alert">
          <MonitorX size={24} strokeWidth={1.5} aria-hidden="true" />
          <p className="estado-vacio-titulo">{T.escena.sinWebgl}</p>
          <p className="estado-vacio-texto">{T.escena.sinWebglAyuda}</p>
        </div>
      ) : (
        children
      )}
    </main>
  );
}
