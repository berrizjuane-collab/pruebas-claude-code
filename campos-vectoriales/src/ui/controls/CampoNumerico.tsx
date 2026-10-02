/**
 * Entrada numérica (DESIGN §6.1): acepta `-` y `−`, punto decimal y expresiones constantes
 * (`pi/2`, `2^-3`), evaluadas con el mismo analizador que las ecuaciones. ↑/↓ cambian en un
 * paso (Mayús ×10); Intro o salir del campo aplican; Esc deshace lo escrito. Un valor
 * inválido no se aplica: el campo lo indica con borde, `aria-invalid` y un mensaje.
 */
import { useId, useState, type KeyboardEvent } from 'react';
import { analizarExpresion } from '../../math/field';
import { dependeDeVariables } from '../../math/expr/ast';
import { evaluar } from '../../math/expr/compile';
import { Aviso } from './Aviso';
import type { Forzado } from './Boton';
import { ajustarAPaso } from './Deslizador';
import { useDescripcion } from './Descripcion';

/** Texto de edición de un número: sin ruido de coma flotante y con el signo menos tipográfico. */
export function textoNumero(v: number): string {
  if (!Number.isFinite(v)) return '';
  return String(Number(v.toPrecision(10))).replace('-', '−');
}

export type LecturaNumero = { ok: true; valor: number } | { ok: false; mensaje: string };

/** Lee un número o una expresión constante. */
export function leerNumero(texto: string): LecturaNumero {
  const t = texto.trim();
  if (!t) return { ok: false, mensaje: 'Escribe un número, por ejemplo 2, −0.5 o pi/2' };
  const r = analizarExpresion(t, []);
  if (!r.ok) return { ok: false, mensaje: 'Escribe un número, por ejemplo 2, −0.5 o pi/2' };
  if (dependeDeVariables(r.arbol)) return { ok: false, mensaje: 'Debe ser una constante (sin x, y ni z)' };
  const v = evaluar(r.arbol, 0, 0, 0, new Float64Array(0));
  if (!Number.isFinite(v)) return { ok: false, mensaje: 'El valor no es finito' };
  return { ok: true, valor: v };
}

interface Props {
  etiqueta: string;
  valor: number;
  alCambiar: (v: number) => void;
  paso?: number;
  min?: number;
  max?: number;
  /** Validación adicional: devuelve el mensaje de error o null. */
  validar?: (v: number) => string | null;
  deshabilitado?: boolean;
  /** Por qué está deshabilitado (DESIGN §7). */
  motivo?: string;
  forzar?: Forzado;
  /** Error forzado (galería). */
  errorForzado?: string;
  ancho?: 'normal' | 'ancho';
  /** Ajustar a la rejilla del paso al usar ↑/↓. */
  ajustarPaso?: boolean;
  datosPrueba?: string;
}

export function CampoNumerico({
  etiqueta,
  valor,
  alCambiar,
  paso = 1,
  min,
  max,
  validar,
  deshabilitado,
  motivo,
  forzar,
  errorForzado,
  ancho = 'normal',
  ajustarPaso = false,
  datosPrueba,
}: Props) {
  const idMensaje = useId();
  const d = useDescripcion({ texto: motivo ?? '' });
  const conMotivo = deshabilitado && !!motivo;
  const [borrador, setBorrador] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const texto = borrador ?? textoNumero(valor);
  const mensaje = errorForzado ?? error;

  const comprobar = (v: number): string | null => {
    if (min !== undefined && v < min) return `Debe ser ≥ ${textoNumero(min)}`;
    if (max !== undefined && v > max) return `Debe ser ≤ ${textoNumero(max)}`;
    return validar?.(v) ?? null;
  };
  const aplicar = () => {
    if (borrador === null) return;
    const l = leerNumero(borrador);
    if (!l.ok) {
      setError(l.mensaje);
      return;
    }
    const e = comprobar(l.valor);
    if (e) {
      setError(e);
      return;
    }
    setError(null);
    setBorrador(null);
    if (l.valor !== valor) alCambiar(l.valor);
  };
  const alTeclear = (e: KeyboardEvent<HTMLInputElement>) => {
    if (deshabilitado) return;
    if (e.key === 'Enter') {
      aplicar();
      e.preventDefault();
    } else if (e.key === 'Escape') {
      if (borrador !== null || error) e.stopPropagation();
      setBorrador(null);
      setError(null);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const base = borrador !== null ? leerNumero(borrador) : ({ ok: true, valor } as const);
      if (!base.ok) return;
      let v = base.valor + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1) * paso;
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
      v = ajustarPaso && min !== undefined && max !== undefined ? ajustarAPaso(v, min, max, paso) : Number(v.toPrecision(12));
      if (comprobar(v)) return;
      setBorrador(null);
      setError(null);
      if (v !== valor) alCambiar(v);
    }
  };

  return (
    <>
      <input
        type="text"
        inputMode="decimal"
        role="spinbutton"
        className={`campo-numerico${ancho === 'ancho' ? ' campo-numerico-ancho' : ''} num`}
        aria-label={etiqueta}
        aria-valuenow={Number.isFinite(valor) ? valor : undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-invalid={mensaje ? true : undefined}
        {...(conMotivo ? d.props : {})}
        aria-describedby={mensaje ? idMensaje : conMotivo ? d.props['aria-describedby'] : undefined}
        aria-disabled={deshabilitado || undefined}
        readOnly={deshabilitado}
        spellCheck={false}
        autoComplete="off"
        data-forzar={forzar}
        data-prueba={datosPrueba}
        value={texto}
        onChange={(e) => {
          setBorrador(e.target.value);
          if (error) setError(null);
        }}
        onBlur={() => {
          if (conMotivo) d.props.onBlur();
          aplicar();
        }}
        onKeyDown={alTeclear}
      />
      {conMotivo ? d.elemento : null}
      {mensaje ? (
        <div className="mensaje-campo">
          <Aviso tipo="error" id={idMensaje}>
            {mensaje}
          </Aviso>
        </div>
      ) : null}
    </>
  );
}
