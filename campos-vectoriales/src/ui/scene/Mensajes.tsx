/**
 * Mensajes en la escena (UI-07, DESIGN §6.2): aviso arriba al centro (uno a la vez),
 * estado vacío centrado con causa y acciones, e indicador de carga inicial.
 */
import type { ComponentType, ReactNode } from 'react';
import { Aviso } from '../controls/Aviso';
import { T } from '../../i18n/es';

/** Aviso de escena: «Mostrando el último campo válido», límites alcanzados… */
export function AvisoEscena({ children }: { children: ReactNode }) {
  return (
    <div className="aviso-escena flotante" data-flotante="aviso-escena" data-prueba="aviso-escena">
      <Aviso tipo="aviso" forma="bloque">
        {children}
      </Aviso>
    </div>
  );
}

interface PropsVacio {
  icono: ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean | 'true' }>;
  titulo: string;
  texto: ReactNode;
  acciones?: ReactNode;
  /** `alert` si sustituye a la escena por un fallo (sin WebGL2); `status` si informa. */
  rol?: 'alert' | 'status';
}

/** Estado vacío (DESIGN §6.1): icono de 24 px, título 16/500, explicación 13 px y acciones. */
export function EstadoVacio({ icono: I, titulo, texto, acciones, rol = 'status' }: PropsVacio) {
  return (
    <div className="estado-vacio" role={rol} data-prueba="estado-vacio">
      {/* Tarjeta opaca: el mensaje debe leerse sobre la escena (aspas, ejes, caja). */}
      <div className="estado-vacio-tarjeta">
        <I size={24} strokeWidth={1.5} aria-hidden="true" />
        <p className="estado-vacio-titulo">{titulo}</p>
        <p className="estado-vacio-texto">{texto}</p>
        {acciones ? <div className="estado-vacio-acciones">{acciones}</div> : null}
      </div>
    </div>
  );
}

/** Carga inicial: «Preparando la escena…» con barra indeterminada de 2 px (estática con movimiento reducido). */
export function Carga() {
  return (
    <div className="carga" role="status" data-prueba="carga">
      <span>{T.escena.preparando}</span>
      <span className="carga-barra" aria-hidden="true">
        <span className="carga-progreso" />
      </span>
    </div>
  );
}
