import { memo, useMemo } from 'react';
import { CircleCheck, CircleHelp, Download, EllipsisVertical, FolderOpen, LoaderCircle, OctagonAlert, PanelLeft, RotateCcw, TriangleAlert } from 'lucide-react';
import { T } from '../../i18n/es';
import type { NivelPantalla } from '../hooks';
import { Boton, BotonIcono } from '../controls/Boton';
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
  /** Opciones del menú «Exportar» (F9). */
  exportar: readonly OpcionMenu[];
  alAbrir: () => void;
  alAyuda: () => void;
  alCancelar: () => void;
  /** Composición según el ancho (DESIGN §5.4). */
  nivel: NivelPantalla;
  /** Panel como cajón (1024–1279 y 768–1023): botón «Panel» que lo muestra u oculta. */
  panelAbierto: boolean;
  alPanel: () => void;
}

const ICONO = { listo: CircleCheck, calculando: LoaderCircle, aviso: TriangleAlert, error: OctagonAlert };
const PREFIJO = { listo: '', calculando: '', aviso: 'Aviso: ', error: 'Error: ' };

/**
 * Barra superior (DESIGN §5.2): marca, nombre, estado del cálculo y acciones. Por debajo de
 * 1280 px las acciones quedan solo con icono (con descripción emergente y nombre accesible) y
 * aparece el botón «Panel»; por debajo de 768 px, todas las acciones van en un «Menú».
 */
function BarraSuperiorBase({ nombre, estadoCalculo, restablecer, exportar, alAbrir, alAyuda, alCancelar, nivel, panelAbierto, alPanel }: Props) {
  const Icono = ICONO[estadoCalculo.tipo];
  const soloIcono = nivel === 'cajon' || nivel === 'compacto';
  const consulta = nivel === 'consulta';
  const menuConsulta = useMemo<OpcionMenu[]>(
    () => [
      ...restablecer.map((o) => ({ ...o, id: `restablecer-${o.id}`, texto: T.panel.restablecerOpcion(o.texto) })),
      ...exportar.map((o) => ({ ...o, id: `exportar-${o.id}`, texto: T.panel.exportarOpcion(o.texto) })),
      { id: 'abrir', texto: T.archivo.abrir, icono: FolderOpen, alElegir: alAbrir },
      { id: 'ayuda', texto: T.ayuda.boton, icono: CircleHelp, atajo: '?', alElegir: alAyuda },
    ],
    [restablecer, exportar, alAbrir, alAyuda],
  );
  return (
    <header className="barra" data-region="barra" data-nivel={nivel}>
      {soloIcono ? (
        <BotonIcono
          etiqueta={panelAbierto ? T.panel.ocultar : T.panel.mostrar}
          icono={PanelLeft}
          presionado={panelAbierto}
          aria-controls="panel"
          ladoDescripcion="abajo"
          onClick={alPanel}
          data-prueba="boton-panel"
        />
      ) : null}
      <div className="barra-marca">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="4" />
          <path d="M8 16 16 8M11 8h5v5" />
        </svg>
        <span className={consulta ? 'solo-lector' : undefined}>{T.marca}</span>
      </div>
      <span className="barra-separador" aria-hidden="true" />
      <h1 className="barra-nombre" data-prueba="nombre-experimento" title={nombre}>
        {nombre}
      </h1>
      <p className={`barra-estado barra-estado-${estadoCalculo.tipo}`} role={estadoCalculo.tipo === 'error' ? 'alert' : 'status'} data-prueba="estado-calculo">
        <Icono size={14} strokeWidth={1.5} aria-hidden="true" className={estadoCalculo.tipo === 'calculando' ? 'girando' : undefined} />
        <span className={consulta && estadoCalculo.tipo === 'listo' ? 'solo-lector' : undefined}>
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
        {consulta ? (
          <Menu etiqueta={T.panel.menu} icono={EllipsisVertical} soloIcono opciones={menuConsulta} alineacion="derecha" datosPrueba="menu-consulta" />
        ) : (
          <>
            <Menu etiqueta={T.restablecer.menu} icono={RotateCcw} soloIcono={soloIcono} opciones={restablecer} alineacion="derecha" datosPrueba="menu-restablecer" />
            <Menu etiqueta={T.archivo.exportar} icono={Download} soloIcono={soloIcono} opciones={exportar} alineacion="derecha" datosPrueba="menu-exportar" />
            {soloIcono ? (
              <>
                <BotonIcono etiqueta={T.archivo.abrir} icono={FolderOpen} ladoDescripcion="abajo" onClick={alAbrir} data-prueba="abrir" />
                <BotonIcono etiqueta={T.ayuda.boton} icono={CircleHelp} atajo="?" ladoDescripcion="abajo" onClick={alAyuda} data-prueba="boton-ayuda" />
              </>
            ) : (
              <>
                <Boton icono={FolderOpen} descripcion={T.archivo.abrirDescripcion} ladoDescripcion="abajo" onClick={alAbrir} data-prueba="abrir">
                  {T.archivo.abrir}
                </Boton>
                <Boton icono={CircleHelp} atajo="?" descripcion={T.ayuda.boton} ladoDescripcion="abajo" onClick={alAyuda} data-prueba="boton-ayuda">
                  {T.ayuda.boton}
                </Boton>
              </>
            )}
          </>
        )}
      </div>
    </header>
  );
}

export const BarraSuperior = memo(BarraSuperiorBase);
