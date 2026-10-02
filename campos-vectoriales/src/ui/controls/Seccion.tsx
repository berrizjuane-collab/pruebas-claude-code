/**
 * Sección desplegable del panel (DESIGN §6.1, patrón *disclosure*): cabecera de 32 px con
 * chevrón que gira 90°, título 13/600 y un control opcional a la derecha (p. ej. el
 * interruptor del corte).
 */
import { useId, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { BotonAyuda } from '../help/Ayuda';
import type { Forzado } from './Boton';

interface Props {
  titulo: string;
  children: ReactNode;
  abiertaInicial?: boolean;
  /** Control a la derecha de la cabecera (fuera del botón, para no anidar controles). */
  control?: ReactNode;
  /** Apartado de la ayuda para el «?» contextual de la cabecera (UI-06). */
  ayuda?: string;
  forzar?: Forzado;
  datosPrueba?: string;
}

export function Seccion({ titulo, children, abiertaInicial = false, control, ayuda, forzar, datosPrueba }: Props) {
  const [abierta, setAbierta] = useState(abiertaInicial);
  const id = useId();
  return (
    <section className="seccion seccion-plegable" aria-labelledby={`${id}-titulo`} data-prueba={datosPrueba}>
      <div className="seccion-cabecera">
        <h2 className="seccion-titulo">
          <button
            type="button"
            id={`${id}-titulo`}
            className="seccion-boton"
            aria-expanded={abierta}
            aria-controls={`${id}-cuerpo`}
            data-forzar={forzar}
            onClick={() => setAbierta((a) => !a)}
          >
            <ChevronRight className="chevron" size={16} strokeWidth={1.5} aria-hidden="true" />
            {titulo}
          </button>
        </h2>
        {control || ayuda ? (
          <div className="seccion-control">
            {ayuda ? <BotonAyuda apartado={ayuda} /> : null}
            {control}
          </div>
        ) : null}
      </div>
      <div id={`${id}-cuerpo`} className="seccion-cuerpo" hidden={!abierta}>
        {children}
      </div>
    </section>
  );
}
