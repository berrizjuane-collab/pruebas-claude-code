/**
 * Entrada de expresión (DESIGN §6.1, SPEC §5.3): etiqueta lateral P/Q/R, pozo oscuro,
 * monoespaciada; debajo, una línea con la vista previa KaTeX o el mensaje de validación.
 * Un error subraya con una línea ondulada el tramo señalado por el analizador; la capa del
 * subrayado se desplaza con el texto del campo.
 */
import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { TeX } from '../TeX';
import { Aviso } from './Aviso';
import type { Forzado } from './Boton';

export type EstadoExpresion =
  | { tipo: 'valida'; tex: string; aviso?: string }
  | { tipo: 'incompleta'; mensaje: string }
  | { tipo: 'error'; mensaje: string; ini: number; fin: number };

interface Props {
  componente: 'P' | 'Q' | 'R';
  /** Texto para lectores de pantalla tras la letra («componente x de F»). */
  descripcion: string;
  texto: string;
  estado: EstadoExpresion;
  alCambiar: (texto: string) => void;
  alSalir?: () => void;
  alEscape?: () => void;
  /** Acción del mensaje de error (p. ej. «Añadir “k” como parámetro»). */
  accion?: ReactNode;
  deshabilitado?: boolean;
  forzar?: Forzado;
}

export function CampoExpresion({ componente, descripcion, texto, estado, alCambiar, alSalir, alEscape, accion, deshabilitado, forzar }: Props) {
  const id = useId();
  const idMensaje = `${id}-mensaje`;
  const entrada = useRef<HTMLInputElement>(null);
  const capa = useRef<HTMLDivElement>(null);
  const error = estado.tipo === 'error' ? estado : null;

  const sincronizar = () => {
    if (capa.current && entrada.current) capa.current.style.transform = `translateX(${-entrada.current.scrollLeft}px)`;
  };
  useLayoutEffect(sincronizar, [texto, error?.ini, error?.fin]);

  return (
    <div className="expresion" data-estado={estado.tipo}>
      <label className="expresion-etiqueta" htmlFor={id}>
        {componente}
        <span className="solo-lector"> ({descripcion})</span>
      </label>
      <div className="expresion-pozo" data-forzar={forzar}>
        <input
          ref={entrada}
          id={id}
          className="expresion-entrada"
          type="text"
          value={texto}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          readOnly={deshabilitado}
          aria-disabled={deshabilitado || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={idMensaje}
          data-prueba={`expr-${componente}`}
          onChange={(e) => alCambiar(e.target.value)}
          onBlur={alSalir}
          onScroll={sincronizar}
          onSelect={sincronizar}
          onKeyUp={sincronizar}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && alEscape) {
              e.stopPropagation();
              alEscape();
            }
          }}
        />
        {error ? (
          <div className="expresion-subrayado" aria-hidden="true">
            <div ref={capa} className="expresion-subrayado-capa">
              <span className="transparente">{texto.slice(0, error.ini)}</span>
              <span className="ondulado">{texto.slice(error.ini, Math.max(error.fin, error.ini)) || ' '}</span>
            </div>
          </div>
        ) : null}
      </div>
      <div className="expresion-mensaje" id={idMensaje}>
        {estado.tipo === 'valida' ? (
          <>
            <span className="expresion-previa" data-prueba={`previa-${componente}`}>
              <TeX tex={`${componente} = ${estado.tex}`} />
            </span>
            {estado.aviso ? (
              <Aviso tipo="aviso" vivo={false}>
                {estado.aviso}
              </Aviso>
            ) : null}
          </>
        ) : estado.tipo === 'incompleta' ? (
          <Aviso tipo="incompleta" vivo={false}>
            {estado.mensaje}
          </Aviso>
        ) : (
          <Aviso tipo="error" accion={accion} datosPrueba={`error-${componente}`}>
            {estado.mensaje}
          </Aviso>
        )}
      </div>
    </div>
  );
}
