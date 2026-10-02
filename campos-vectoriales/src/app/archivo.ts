/**
 * Exportar y recuperar (PLAN F9; EXP-01 y EXP-02):
 * - «Exportar ▾ → Configuración (.json)»: descarga directa con la cámara actual y
 *   notificación con el nombre del archivo.
 * - «Abrir» o arrastrar un archivo a la ventana: se valida antes de tocar nada. Si es válido,
 *   se aplica (con su cámara) y se ofrece «Deshacer»; si no, un diálogo lista los errores y el
 *   experimento no cambia.
 * - Autoguardado en `localStorage` 1 s después del último cambio (estado o cámara), salvo en
 *   el modo de captura, cuyas escenas deben ser reproducibles (D-50).
 */
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { descargar, nombreArchivo } from '../export/json';
import type { ControladorEscena, EstadoCamara, Proyeccion } from '../render/ControladorEscena';
import { autoguardar, borrarAutoguardado, importarConfiguracion, serializar, TAMANO_MAX, type ErrorImportacion } from '../state/persist';
import { EXPERIMENTO_INICIAL, type EstadoExperimento } from '../state/schema';
import type { Almacen } from '../state/store';
import { T } from '../i18n/es';
import type { Notificador } from '../ui/controls/Notificaciones';

/** Rebote del autoguardado (SPEC §7.2). */
export const MS_AUTOGUARDADO = 1000;

export interface ErroresApertura {
  archivo: string;
  errores: ErrorImportacion[];
}

interface Opciones {
  almacen: Almacen<EstadoExperimento>;
  controlador: ControladorEscena | null;
  notificador: Notificador;
  ofrecerDeshacer: (texto: string, restaurar: () => void) => void;
  /** Aplica una cámara al controlador sin que el reencuadre por cambio de dominio la pise. */
  aplicarCamara: (c: EstadoCamara & { tipo?: Proyeccion }) => void;
  autoguardado: boolean;
  /** El estado inicial salió del autoguardado: se avisa con «Empezar de cero». */
  recuperado: boolean;
}

export function useArchivo({ almacen, controlador, notificador, ofrecerDeshacer, aplicarCamara, autoguardado, recuperado }: Opciones) {
  const [errores, setErrores] = useState<ErroresApertura | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  /** Estado con la cámara actual (la cámara vive en el controlador). */
  const conCamara = useCallback((): EstadoExperimento => {
    const s = almacen.obtener();
    return controlador ? { ...s, camara: { tipo: controlador.proyeccion, ...controlador.obtenerCamara() } } : s;
  }, [almacen, controlador]);

  const exportarJson = useCallback(() => {
    const s = conCamara();
    const nombre = nombreArchivo(s.nombre, new Date(), 'json');
    descargar(nombre, new Blob([serializar(s)], { type: 'application/json' }));
    notificador.notificar({ tipo: 'exito', texto: T.archivo.exportada(nombre), clave: 'exportada' });
  }, [conCamara, notificador]);

  const abrirArchivo = useCallback(
    async (archivo: File) => {
      // Un archivo demasiado grande ni se lee.
      const texto = archivo.size > TAMANO_MAX ? '' : await archivo.text();
      const r = importarConfiguracion(texto, archivo.size);
      if (!r.ok) {
        setErrores({ archivo: archivo.name, errores: r.errores });
        return;
      }
      const previo = almacen.obtener();
      const camaraPrevia = controlador ? { ...controlador.obtenerCamara(), tipo: controlador.proyeccion } : null;
      almacen.fijar(r.estado);
      if (r.estado.camara) aplicarCamara(r.estado.camara);
      ofrecerDeshacer(T.archivo.abierta(archivo.name), () => {
        almacen.fijar(previo);
        if (camaraPrevia) aplicarCamara(camaraPrevia);
      });
      if (r.avisos.length) notificador.notificar({ tipo: 'aviso', texto: T.archivo.avisos(r.avisos.length, r.avisos[0]!), duracion: 8000 });
    },
    [almacen, controlador, aplicarCamara, ofrecerDeshacer, notificador],
  );

  const elegirArchivo = useCallback(() => entrada.current?.click(), []);
  const alElegir = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const archivo = e.target.files?.[0];
      e.target.value = '';
      if (archivo) void abrirArchivo(archivo);
    },
    [abrirArchivo],
  );

  // Arrastrar un archivo a la ventana (F9).
  useEffect(() => {
    const conArchivos = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    let profundidad = 0;
    const entrar = (e: DragEvent) => {
      if (!conArchivos(e)) return;
      profundidad++;
      setArrastrando(true);
    };
    const sobre = (e: DragEvent) => {
      if (!conArchivos(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const salir = (e: DragEvent) => {
      if (!conArchivos(e)) return;
      profundidad = Math.max(0, profundidad - 1);
      if (profundidad === 0) setArrastrando(false);
    };
    const soltar = (e: DragEvent) => {
      if (!conArchivos(e)) return;
      e.preventDefault();
      profundidad = 0;
      setArrastrando(false);
      const archivo = e.dataTransfer?.files[0];
      if (archivo) void abrirArchivo(archivo);
    };
    window.addEventListener('dragenter', entrar);
    window.addEventListener('dragover', sobre);
    window.addEventListener('dragleave', salir);
    window.addEventListener('drop', soltar);
    return () => {
      window.removeEventListener('dragenter', entrar);
      window.removeEventListener('dragover', sobre);
      window.removeEventListener('dragleave', salir);
      window.removeEventListener('drop', soltar);
    };
  }, [abrirArchivo]);

  // Autoguardado con rebote de 1 s tras el último cambio del estado o de la cámara.
  useEffect(() => {
    if (!autoguardado || !controlador) return;
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    const programar = () => {
      if (temporizador) clearTimeout(temporizador);
      temporizador = setTimeout(() => {
        temporizador = null;
        autoguardar(conCamara());
      }, MS_AUTOGUARDADO);
    };
    const quitarEstado = almacen.suscribir(programar);
    const quitarCamara = controlador.alCambiarCamara(programar);
    return () => {
      quitarEstado();
      quitarCamara();
      if (temporizador) {
        clearTimeout(temporizador);
        autoguardar(conCamara());
      }
    };
  }, [autoguardado, controlador, almacen, conCamara]);

  // Aviso de recuperación, una sola vez al arrancar.
  const avisado = useRef(false);
  useEffect(() => {
    if (!recuperado || avisado.current || !controlador) return;
    avisado.current = true;
    notificador.notificar({
      tipo: 'info',
      texto: T.archivo.recuperado,
      clave: 'recuperado',
      accion: {
        texto: T.archivo.empezarDeCero,
        alElegir: () => {
          borrarAutoguardado();
          almacen.fijar(EXPERIMENTO_INICIAL);
          controlador?.fijarProyeccion('perspectiva');
          controlador?.encuadrar(false);
        },
      },
    });
  }, [recuperado, notificador, almacen, controlador]);

  return { exportarJson, abrirArchivo, elegirArchivo, entrada, alElegir, errores, cerrarErrores: () => setErrores(null), arrastrando };
}
