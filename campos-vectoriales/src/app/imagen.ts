/**
 * Exportación PNG compuesta (EXP-03, F9): la escena se vuelve a dibujar al tamaño pedido
 * (`ControladorEscena.capturar`) y se compone con la leyenda y las ecuaciones en Canvas 2D
 * (`export/png`). Tamaños: como en pantalla (px reales del lienzo), 1920 × 1080 (escala 1) y
 * 3840 × 2160 (escala 2: el mismo encuadre que 1920 × 1080 con el doble de detalle).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CampoCompilado } from '../math/field';
import { unicodeNombreParametro } from '../math/expr/tex';
import { aPng, componer, type BloqueLeyenda } from '../export/png';
import { descargar, nombreArchivo } from '../export/json';
import { formatearCorto } from '../numerics/format';
import type { ControladorEscena } from '../render/ControladorEscena';
import type { EstadoExperimento } from '../state/schema';
import { T } from '../i18n/es';
import type { Notificador } from '../ui/controls/Notificaciones';
import { bloquesLeyenda, type DatosLeyenda } from '../ui/scene/Leyenda';
import type { OpcionesPng } from '../ui/topbar/DialogoPng';

/** Progreso visible solo si la exportación tarda (DESIGN §6.2). */
const MS_PROGRESO = 300;
/** Ancho de la vista previa en px reales. */
const ANCHO_PREVIA = 448;

export interface Exportacion {
  nombre: string;
  ancho: number;
  alto: number;
  escala: number;
  leyenda: { x: number; y: number; ancho: number; alto: number } | null;
  ecuaciones: { x: number; y: number; ancho: number; alto: number } | null;
  textosLeyenda: string[];
  lineasEcuaciones: string[];
}

interface Opciones {
  controlador: ControladorEscena | null;
  estado: EstadoExperimento;
  campo: CampoCompilado | null;
  datosLeyenda: DatosLeyenda | null;
  notificador: Notificador;
}

/** Tamaño real, escala y tamaño CSS equivalente de cada opción. */
function medidas(o: OpcionesPng, c: ControladorEscena): { ancho: number; alto: number; escala: number } {
  if (o.tamano === 'fhd') return { ancho: 1920, alto: 1080, escala: 1 };
  if (o.tamano === 'uhd') return { ancho: 3840, alto: 2160, escala: 2 };
  const p = c.tamanoPantalla;
  return { ancho: Math.round(p.ancho * p.pixelRatio), alto: Math.round(p.alto * p.pixelRatio), escala: p.pixelRatio };
}

/** Ecuaciones en notación Unicode lineal a partir del árbol (SPEC §7.1). */
function ecuacionesTexto(estado: EstadoExperimento, campo: CampoCompilado): { titulo: string; lineas: string[] } {
  const lineas = [`P = ${campo.unicode.P}`, `Q = ${campo.unicode.Q}`, `R = ${campo.unicode.R}`];
  if (estado.parametros.length) lineas.push(estado.parametros.map((p) => `${unicodeNombreParametro(p.nombre)} = ${formatearCorto(p.valor)}`).join(' · '));
  const { min, max } = estado.dominio;
  lineas.push(`Ω = ${[0, 1, 2].map((k) => `[${formatearCorto(min[k] as number)}, ${formatearCorto(max[k] as number)}]`).join(' × ')}`);
  return { titulo: estado.nombre, lineas };
}

export function useExportarPng({ controlador, estado, campo, datosLeyenda, notificador }: Opciones) {
  const [abierto, setAbierto] = useState(false);
  const [opciones, setOpciones] = useState<OpcionesPng>({ contenido: 'leyenda', tamano: 'fhd' });
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [progreso, setProgreso] = useState(false);
  const ultima = useRef<Exportacion | null>(null);

  /** Compone la imagen; con `previa`, al tamaño CSS equivalente (escala 1) para que sea rápida. */
  const generar = useCallback(
    (o: OpcionesPng, previa: boolean) => {
      if (!controlador) return null;
      const m = medidas(o, controlador);
      const escala = previa ? 1 : m.escala;
      const ancho = previa ? Math.round(m.ancho / m.escala) : m.ancho;
      const alto = previa ? Math.round(m.alto / m.escala) : m.alto;
      const escenaLienzo = controlador.capturar(ancho, alto, escala);
      let leyenda: BloqueLeyenda[] | null = null;
      if (o.contenido !== 'escena' && datosLeyenda) {
        // Flecha de referencia: ℓmax a la distancia del objetivo, en px CSS de la imagen.
        const pantalla = controlador.tamanoPantalla;
        const px = controlador.pixelesPorUnidad() * (alto / escala / pantalla.alto);
        const largoRef = Math.round(Math.min(184, Math.max(16, (datosLeyenda.modo === 'normalizado' ? 0.75 : 1) * datosLeyenda.lMax * px)));
        leyenda = bloquesLeyenda(datosLeyenda, largoRef);
      }
      const ecuaciones = o.contenido === 'ecuaciones' && campo ? ecuacionesTexto(estado, campo) : null;
      const r = componer({ escena: escenaLienzo, escala, leyenda, ecuaciones });
      return { r, leyenda, ecuaciones, escala };
    },
    [controlador, datosLeyenda, campo, estado],
  );

  // Vista previa: se rehace al abrir y al cambiar las opciones o la escena.
  useEffect(() => {
    if (!abierto) return;
    const id = requestAnimationFrame(() => {
      const g = generar(opciones, true);
      if (!g) return;
      const mini = document.createElement('canvas');
      mini.width = ANCHO_PREVIA;
      mini.height = Math.round((ANCHO_PREVIA * g.r.lienzo.height) / g.r.lienzo.width);
      const ctx = mini.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(g.r.lienzo, 0, 0, mini.width, mini.height);
      setVistaPrevia(mini.toDataURL('image/png'));
    });
    return () => cancelAnimationFrame(id);
  }, [abierto, opciones, generar]);

  const exportar = useCallback(async () => {
    if (exportando) return;
    setExportando(true);
    const temporizador = setTimeout(() => setProgreso(true), MS_PROGRESO);
    try {
      // Un fotograma para que la interfaz pueda pintar el estado «exportando».
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const g = generar(opciones, false);
      if (!g) return;
      const nombre = nombreArchivo(estado.nombre, new Date(), 'png');
      const blob = await aPng(g.r.lienzo);
      descargar(nombre, blob);
      ultima.current = {
        nombre,
        ancho: g.r.lienzo.width,
        alto: g.r.lienzo.height,
        escala: g.escala,
        leyenda: g.r.leyenda,
        ecuaciones: g.r.ecuaciones,
        textosLeyenda: (g.leyenda ?? []).flatMap((b) => [...(b.rampa ? [b.rampa.titulo, ...b.rampa.marcas] : []), ...b.filas.map((f) => f.texto), ...b.pie]),
        lineasEcuaciones: g.ecuaciones ? [g.ecuaciones.titulo, ...g.ecuaciones.lineas] : [],
      };
      setAbierto(false);
      notificador.notificar({ tipo: 'exito', texto: T.imagen.exportada(nombre), clave: 'exportada' });
    } catch {
      notificador.notificar({ tipo: 'error', texto: T.imagen.error });
    } finally {
      clearTimeout(temporizador);
      setProgreso(false);
      setExportando(false);
    }
  }, [exportando, generar, opciones, estado.nombre, notificador]);

  const pantalla = controlador ? medidas({ contenido: 'escena', tamano: 'pantalla' }, controlador) : { ancho: 0, alto: 0 };
  return {
    abierto,
    abrir: useCallback(() => {
      setVistaPrevia(null);
      setAbierto(true);
    }, []),
    cerrar: useCallback(() => setAbierto(false), []),
    opciones,
    setOpciones,
    vistaPrevia,
    exportando,
    progreso,
    exportar,
    pantalla: { ancho: pantalla.ancho, alto: pantalla.alto },
    ultima,
  };
}
