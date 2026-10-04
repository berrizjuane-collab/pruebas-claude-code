/**
 * Capa de la vista libre (VL-02, DESIGN §5.5): lo único que puede verse además de la escena.
 * La pista de controles aparece 5 s al entrar (y con H) y se desvanece; el indicador
 * transitorio confirma 1.5 s cada cambio de velocidad, escala o modo. Ninguno captura el
 * puntero ni el foco. Con movimiento reducido no hay desvanecimientos (DESIGN §8.2).
 */
import { memo } from 'react';
import { T } from '../../i18n/es';

interface Props {
  pistaVisible: boolean;
  /** Texto del indicador transitorio y una clave que cambia con cada aviso (null = oculto). */
  indicador: { texto: string; vez: number } | null;
  /** Anuncio para el lector de pantalla (entrar, salir). */
  anuncio: string;
}

function CapaVistaLibreBase({ pistaVisible, indicador, anuncio }: Props) {
  return (
    <>
      <p className="solo-lector" aria-live="polite" data-prueba="vl-anuncio">
        {anuncio}
      </p>
      <p className="vl-pista" data-visible={pistaVisible} aria-hidden={!pistaVisible} data-prueba="vl-pista">
        {T.vistaLibre.pista}
      </p>
      <p key={indicador?.vez ?? 0} className="vl-indicador" data-visible={!!indicador} role="status" data-prueba="vl-indicador">
        {indicador?.texto ?? ''}
      </p>
    </>
  );
}

export const CapaVistaLibre = memo(CapaVistaLibreBase);
