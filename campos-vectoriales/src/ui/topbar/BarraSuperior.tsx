import { memo } from 'react';
import { CircleCheck, LoaderCircle, OctagonAlert, RotateCcw, TriangleAlert } from 'lucide-react';
import { T } from '../../i18n/es';
import { Menu, type OpcionMenu } from '../controls/Menu';

export interface EstadoCalculoBarra {
  tipo: 'listo' | 'calculando' | 'aviso' | 'error';
  texto: string;
  cancelable?: boolean;
}

interface Props {
  nombre: string;
  estadoCalculo: EstadoCalculoBarra;
  /** Opciones del menú «Restablecer» (F8). */
  restablecer: readonly OpcionMenu[];
  alCancelar: () => void;
}

const ICONO = { listo: CircleCheck, calculando: LoaderCircle, aviso: TriangleAlert, error: OctagonAlert };
const PREFIJO = { listo: '', calculando: '', aviso: 'Aviso: ', error: 'Error: ' };

function BarraSuperiorBase({ nombre, estadoCalculo, restablecer, alCancelar }: Props) {
  const Icono = ICONO[estadoCalculo.tipo];
  return (
    <header className="barra" data-region="barra">
      <div className="barra-marca">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="4" />
          <path d="M8 16 16 8M11 8h5v5" />
        </svg>
        <span>{T.marca}</span>
      </div>
      <span className="barra-separador" aria-hidden="true" />
      <h1 className="barra-nombre" data-prueba="nombre-experimento">
        {nombre}
      </h1>
      <p className={`barra-estado barra-estado-${estadoCalculo.tipo}`} role={estadoCalculo.tipo === 'error' ? 'alert' : 'status'} data-prueba="estado-calculo">
        <Icono size={14} strokeWidth={1.5} aria-hidden="true" className={estadoCalculo.tipo === 'calculando' ? 'girando' : undefined} />
        <span>
          {PREFIJO[estadoCalculo.tipo]}
          {estadoCalculo.texto}
        </span>
        {estadoCalculo.cancelable ? (
          <button type="button" className="boton-enlace" onClick={alCancelar} data-prueba="cancelar-calculo">
            {T.acciones.cancelar}
          </button>
        ) : null}
      </p>
      <div className="barra-acciones">
        <Menu etiqueta={T.restablecer.menu} icono={RotateCcw} opciones={restablecer} alineacion="derecha" datosPrueba="menu-restablecer" />
      </div>
    </header>
  );
}

export const BarraSuperior = memo(BarraSuperiorBase);
