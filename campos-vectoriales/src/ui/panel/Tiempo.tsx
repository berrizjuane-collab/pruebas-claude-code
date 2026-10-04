/**
 * Tiempo (TMP-05, DESIGN §5.3 sección 4b y §6.3; PLAN F12; SPEC §3.10): instante t con
 * deslizador y valor exacto, reproducir/pausar (el mismo estado que la barra de la escena y
 * Espacio), ventana [inicio, fin] y bucle. Con un campo estacionario solo explica cómo
 * obtener uno temporal. Durante la reproducción el deslizador sigue al reloj (10 veces por
 * segundo); mover t a mano hace renacer las partículas (D-69).
 */
import { memo } from 'react';
import { Pause, Play } from 'lucide-react';
import { formatearCorto } from '../../numerics/format';
import { motivoVentana } from '../../state/actions';
import type { EstadoExperimento } from '../../state/schema';
import type { Almacen } from '../../state/store';
import { T } from '../../i18n/es';
import { BotonIcono } from '../controls/Boton';
import { CampoNumerico, textoNumero } from '../controls/CampoNumerico';
import { Deslizador } from '../controls/Deslizador';
import { Interruptor } from '../controls/Interruptor';
import { Seccion } from '../controls/Seccion';
import { useAlmacenEspaciado } from '../hooks';

interface Props {
  tiempo: EstadoExperimento['tiempo'];
  /** ¿Depende del tiempo el campo aplicado? */
  temporal: boolean;
  /** Reloj en vivo (instante de la animación). */
  reloj: Almacen<number>;
  animando: boolean;
  alAnimar: () => void;
  /** τ vigente (unidades de t por segundo real), o null si aún no hay malla. */
  tau: number | null;
  alTiempo: (cambios: Partial<EstadoExperimento['tiempo']>) => void;
}

/** Paso «redondo» del deslizador: unas 500 posiciones en la ventana. */
function pasoDe(inicio: number, fin: number): number {
  const bruto = (fin - inicio) / 500;
  return 10 ** Math.floor(Math.log10(bruto));
}

function TiempoBase({ tiempo, temporal, reloj, animando, alAnimar, tau, alTiempo }: Props) {
  const tVivo = useAlmacenEspaciado(reloj, 100);
  const t = temporal ? Math.min(tiempo.fin, Math.max(tiempo.inicio, tVivo)) : tiempo.t;
  const paso = pasoDe(tiempo.inicio, tiempo.fin);
  return (
    // La sección se abre sola cuando el campo pasa a depender del tiempo (key distinta).
    <Seccion key={temporal ? 'temporal' : 'estacionario'} titulo={T.tiempo.titulo} ayuda="tiempo" abiertaInicial={temporal} datosPrueba="seccion-tiempo">
      {!temporal ? (
        <p className="nota-seccion" data-prueba="tiempo-estacionario">
          {T.tiempo.estacionario}
        </p>
      ) : (
        <>
          <div className="tiempo-fila">
            <BotonIcono
              etiqueta={animando ? T.tiempo.pausar : T.tiempo.reproducir}
              icono={animando ? Pause : Play}
              atajo="Espacio"
              onClick={alAnimar}
              data-prueba="tiempo-reproducir"
            />
            <Deslizador
              etiqueta={T.tiempo.tLargo}
              valor={t}
              min={tiempo.inicio}
              max={tiempo.fin}
              paso={paso}
              valorTexto={T.tiempo.lectura(formatearCorto(t))}
              alCambiar={(v) => alTiempo({ t: v })}
            />
            <CampoNumerico etiqueta={T.tiempo.tLargo} valor={t} paso={paso * 10} min={tiempo.inicio} max={tiempo.fin} alCambiar={(v) => alTiempo({ t: v })} datosPrueba="tiempo-t" />
          </div>
          <div className="fila-control">
            <span className="fila-etiqueta">{T.tiempo.inicio}</span>
            <CampoNumerico
              etiqueta={T.tiempo.inicioLargo}
              valor={tiempo.inicio}
              paso={1}
              ancho="ancho"
              validar={(v) => motivoVentana(v, tiempo.fin)}
              alCambiar={(inicio) => alTiempo({ inicio })}
              datosPrueba="tiempo-inicio"
            />
            <span className="etiqueta-intermedia">{T.tiempo.fin}</span>
            <CampoNumerico
              etiqueta={T.tiempo.finLargo}
              valor={tiempo.fin}
              paso={1}
              ancho="ancho"
              validar={(v) => motivoVentana(tiempo.inicio, v)}
              alCambiar={(fin) => alTiempo({ fin })}
              datosPrueba="tiempo-fin"
            />
          </div>
          <Interruptor etiqueta={T.tiempo.bucle} activado={tiempo.bucle} alCambiar={(bucle) => alTiempo({ bucle })} />
          {tau !== null ? <p className="fila-pista num">{T.tiempo.velocidad(textoNumero(Number(tau.toPrecision(3))))}</p> : null}
          <p className="nota-seccion">{T.tiempo.nota}</p>
        </>
      )}
    </Seccion>
  );
}

export const Tiempo = memo(TiempoBase);
