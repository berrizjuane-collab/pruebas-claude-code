/**
 * Acciones de edición del experimento (UI-02 … UI-05) y «Deshacer» temporal (PLAN F8):
 * las acciones que sustituyen trabajo del usuario (restablecer, cambiar de ejemplo con el
 * campo editado) guardan una instantánea y ofrecen «Deshacer» durante 8 s (también Ctrl+Z).
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { IdCampo } from '../math/catalog';
import { compilarCampo } from '../math/field';
import type { ControladorEscena } from '../render/ControladorEscena';
import {
  anadirParametro,
  aplicarEcuaciones,
  eliminarParametro,
  fijarCapa,
  fijarDominio,
  fijarGlifos,
  fijarMuestreo,
  fijarOpcionesFlechas,
  fijarParametro,
  fijarRangoParametro,
  restablecerExperimento,
  restablecerParametro,
  restablecerParametros,
  seleccionarCampo,
} from '../state/actions';
import type { EstadoExperimento } from '../state/schema';
import type { Almacen } from '../state/store';
import { T } from '../i18n/es';
import type { Notificador } from '../ui/controls/Notificaciones';
import type { AccionesPanel } from '../ui/panel/Panel';
import { enCampoDeTexto } from './atajos';

/** Tiempo durante el que se puede deshacer (PLAN F8). */
export const MS_DESHACER = 8000;

export function useEdicion(almacen: Almacen<EstadoExperimento>, controlador: ControladorEscena | null, notificador: Notificador) {
  const deshacer = useRef<{ restaurar: () => void; notificacion: number } | null>(null);

  /**
   * Deshace mientras su notificación siga visible: dura 8 s, pero se pausa con el puntero o
   * el foco encima, y un botón «Deshacer» visible tiene que funcionar.
   */
  const ejecutarDeshacer = useCallback((): boolean => {
    const d = deshacer.current;
    if (!d || !notificador.almacen.obtener().some((n) => n.id === d.notificacion)) return false;
    deshacer.current = null;
    d.restaurar();
    notificador.descartar(d.notificacion);
    return true;
  }, [notificador]);

  const ofrecerDeshacer = useCallback(
    (texto: string, restaurar: () => void) => {
      const notificacion = notificador.notificar({
        tipo: 'info',
        texto,
        clave: 'deshacer',
        duracion: MS_DESHACER,
        accion: { texto: T.acciones.deshacer, alElegir: () => ejecutarDeshacer() },
      });
      deshacer.current = { restaurar, notificacion };
    },
    [notificador, ejecutarDeshacer],
  );

  /** Cambia el estado y, si cambió, ofrece deshacerlo. */
  const conDeshacer = useCallback(
    (texto: (nuevo: EstadoExperimento) => string, cambio: (s: EstadoExperimento) => EstadoExperimento) => {
      const previo = almacen.obtener();
      almacen.fijar(cambio);
      const nuevo = almacen.obtener();
      if (nuevo !== previo) ofrecerDeshacer(texto(nuevo), () => almacen.fijar(previo));
    },
    [almacen, ofrecerDeshacer],
  );

  // Ctrl+Z (⌘Z) fuera de los campos de texto, donde deshace la escritura.
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z' || enCampoDeTexto(e.target)) return;
      if (ejecutarDeshacer()) e.preventDefault();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [ejecutarDeshacer]);

  const restablecerCamara = useCallback(() => {
    if (!controlador) return;
    const previa = controlador.obtenerCamara();
    controlador.encuadrar();
    ofrecerDeshacer(T.restablecer.camaraHecho, () => controlador.fijarCamara(previa));
  }, [controlador, ofrecerDeshacer]);

  const acciones: AccionesPanel = useMemo(
    () => ({
      alElegirCampo: (id: IdCampo) => {
        // F1.3: si el campo estaba editado, cambiar de ejemplo se puede deshacer.
        if (almacen.obtener().modificado) conDeshacer(() => T.restablecer.campoSustituido, (s) => seleccionarCampo(s, id));
        else almacen.fijar((s) => seleccionarCampo(s, id));
      },
      alAplicarEcuaciones: (c) => almacen.fijar((s) => aplicarEcuaciones(s, c)),
      alAnadirParametroDesdeEcuacion: (nombre, borrador) =>
        almacen.fijar((s) => {
          const conParametro = anadirParametro(s, nombre);
          if (conParametro === s) return s;
          const r = compilarCampo(borrador, conParametro.parametros.map((p) => p.nombre));
          return r.ok ? aplicarEcuaciones(conParametro, borrador) : conParametro;
        }),
      alCambiarParametro: (nombre, valor) => almacen.fijar((s) => fijarParametro(s, nombre, valor)),
      alRangoParametro: (nombre, r) => almacen.fijar((s) => fijarRangoParametro(s, nombre, r)),
      alRestablecerParametro: (nombre) => almacen.fijar((s) => restablecerParametro(s, nombre)),
      alEliminarParametro: (nombre) => almacen.fijar((s) => eliminarParametro(s, nombre)),
      alAnadirParametro: (nombre) => almacen.fijar((s) => anadirParametro(s, nombre)),
      alDominio: (d) => almacen.fijar((s) => fijarDominio(s, d)),
      alMuestreo: (m) => almacen.fijar((s) => fijarMuestreo(s, m)),
      alCapa: (capa, activa) => almacen.fijar((s) => fijarCapa(s, capa, activa)),
      alGlifos: (g) => almacen.fijar((s) => fijarGlifos(s, g)),
      alFlechas: (cambios) => almacen.fijar((s) => fijarOpcionesFlechas(s, cambios)),
    }),
    [almacen, conDeshacer],
  );

  const restablecer = useMemo(
    () => ({
      camara: restablecerCamara,
      parametros: () => conDeshacer(() => T.restablecer.parametrosHecho, restablecerParametros),
      experimento: () => conDeshacer((n) => T.restablecer.experimentoHecho(n.nombre), restablecerExperimento),
    }),
    [restablecerCamara, conDeshacer],
  );

  return { acciones, restablecer, ejecutarDeshacer };
}
