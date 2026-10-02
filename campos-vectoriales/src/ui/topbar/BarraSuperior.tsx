import { CircleCheck, LoaderCircle, OctagonAlert, RotateCcw, TriangleAlert } from 'lucide-react';
import { T } from '../../i18n/es';

export interface EstadoCalculoBarra {
  tipo: 'listo' | 'calculando' | 'aviso' | 'error';
  texto: string;
  cancelable?: boolean;
}

interface Props {
  nombre: string;
  estadoCalculo: EstadoCalculoBarra;
  alRestablecerCamara: () => void;
  alCancelar: () => void;
}

const ICONO = { listo: CircleCheck, calculando: LoaderCircle, aviso: TriangleAlert, error: OctagonAlert };
const PREFIJO = { listo: '', calculando: '', aviso: 'Aviso: ', error: 'Error: ' };

export function BarraSuperior({ nombre, estadoCalculo, alRestablecerCamara, alCancelar }: Props) {
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
        <button type="button" className="boton" onClick={alRestablecerCamara} data-ayuda={`${T.acciones.restablecerCamara} (R)`}>
          <RotateCcw size={16} strokeWidth={1.5} aria-hidden="true" />
          <span className="boton-texto">{T.acciones.restablecer}</span>
        </button>
      </div>
    </header>
  );
}
