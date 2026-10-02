/**
 * Deslizador (DESIGN §6.1, patrón ARIA *slider*): pista de 2 px, tramo recorrido más claro y
 * mando de 14 px con halo oscuro; zona activa de 32 px. Teclado: ←→↑↓ un paso, RePág/AvPág
 * diez pasos, Inicio/Fin los extremos (PLAN F3).
 */
import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import type { Forzado } from './Boton';
import { useDescripcion } from './Descripcion';

/** Decimales de un paso (0.05 → 2; 1e-7 → 7). */
export function decimalesDe(paso: number): number {
  if (!Number.isFinite(paso) || paso <= 0) return 0;
  const s = String(paso);
  const exp = s.match(/e-(\d+)$/);
  if (exp) return Number(exp[1]) + (s.split('e')[0]!.split('.')[1]?.length ?? 0);
  return s.split('.')[1]?.length ?? 0;
}

/** Ajusta v a la rejilla min + k·paso y al intervalo [min, max], sin ruido de coma flotante. */
export function ajustarAPaso(v: number, min: number, max: number, paso: number): number {
  const k = Math.round((v - min) / paso);
  const ajustado = Math.min(max, Math.max(min, min + k * paso));
  return Number(ajustado.toFixed(Math.max(decimalesDe(paso), decimalesDe(Math.abs(min)))));
}

interface Props {
  etiqueta?: string;
  idEtiqueta?: string;
  valor: number;
  min: number;
  max: number;
  paso: number;
  valorTexto?: string;
  alCambiar: (v: number) => void;
  deshabilitado?: boolean;
  /** Por qué está deshabilitado (DESIGN §7). */
  motivo?: string;
  forzar?: Forzado;
}

export function Deslizador({ etiqueta, idEtiqueta, valor, min, max, paso, valorTexto, alCambiar, deshabilitado, motivo, forzar }: Props) {
  const d = useDescripcion({ texto: motivo ?? '' });
  const conMotivo = deshabilitado && !!motivo;
  const pista = useRef<HTMLDivElement>(null);
  const mando = useRef<HTMLDivElement>(null);
  const fraccion = max > min ? Math.min(1, Math.max(0, (valor - min) / (max - min))) : 0;

  const cambiar = (v: number) => {
    const a = ajustarAPaso(v, min, max, paso);
    if (a !== valor) alCambiar(a);
  };
  const desdePuntero = (e: PointerEvent) => {
    const r = pista.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    cambiar(min + ((e.clientX - r.left) / r.width) * (max - min));
  };
  const alTeclear = (e: KeyboardEvent) => {
    if (deshabilitado) return;
    const pasos: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 };
    if (e.key in pasos) cambiar(valor + (pasos[e.key] as number) * paso);
    else if (e.key === 'Home') cambiar(min);
    else if (e.key === 'End') cambiar(max);
    else return;
    e.preventDefault();
  };

  return (
    <div
      className="deslizador"
      data-deshabilitado={deshabilitado || undefined}
      onPointerDown={(e) => {
        if (deshabilitado || e.button !== 0) return;
        mando.current?.focus();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        desdePuntero(e);
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) desdePuntero(e);
      }}
    >
      <div ref={pista} className="deslizador-pista">
        <div className="deslizador-recorrido" style={{ width: `${fraccion * 100}%` }} />
        <div
          ref={mando}
          className="deslizador-mando"
          role="slider"
          tabIndex={0}
          aria-label={etiqueta}
          aria-labelledby={idEtiqueta}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={valor}
          aria-valuetext={valorTexto}
          aria-orientation="horizontal"
          aria-disabled={deshabilitado || undefined}
          data-forzar={forzar}
          style={{ left: `${fraccion * 100}%` }}
          {...(conMotivo ? d.props : {})}
          onKeyDown={alTeclear}
        />
      </div>
      {conMotivo ? d.elemento : null}
    </div>
  );
}
