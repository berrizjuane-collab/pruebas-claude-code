/**
 * Cajón de ayuda (UI-06, DESIGN §5.2 y §6.1): a la derecha, 400 px, nivel 2; se superpone a
 * la escena sin redimensionarla. Pestañas Conceptos · Sintaxis · Atajos · Supuestos (patrón
 * ARIA *tabs*, activación automática con ← → Inicio Fin). No es modal: el resto sigue
 * operativo. Al abrirse desde un «?» muestra y enfoca su apartado; Esc o × lo cierran y el
 * foco vuelve a donde estaba.
 */
import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { CircleHelp, X } from 'lucide-react';
import { T } from '../../i18n/es';
import { BotonIcono } from '../controls/Boton';
import { TextoMat } from '../TeX';
import { APARTADOS, PESTANAS, apartadoPorId, type IdApartado, type Pestana } from './contenido';

export interface EstadoAyuda {
  pestana: Pestana;
  /** Apartado que se muestra y enfoca al abrir (desde un «?»). */
  apartado: IdApartado | null;
  /** Cambia en cada apertura para volver a enfocar aunque el apartado sea el mismo. */
  vez: number;
}

/** Abre la ayuda en un apartado (los «?» contextuales del panel y del inspector). */
export const ContextoAyuda = createContext<(apartado?: IdApartado) => void>(() => {});

/** Botón «?» contextual: abre la ayuda en su apartado. */
export function BotonAyuda({ apartado }: { apartado: IdApartado }) {
  const abrir = useContext(ContextoAyuda);
  const a = apartadoPorId(apartado);
  return (
    <BotonIcono
      etiqueta={T.ayuda.sobre(a?.titulo ?? '')}
      icono={CircleHelp}
      tamanoIcono={16}
      className="boton-ayuda"
      onClick={() => abrir(apartado)}
      data-ayuda={apartado}
    />
  );
}

interface Props {
  estado: EstadoAyuda;
  alPestana: (p: Pestana) => void;
  alCerrar: () => void;
}

export function Ayuda({ estado, alPestana, alCerrar }: Props) {
  const id = useId();
  const raiz = useRef<HTMLElement>(null);
  const pestanas = useRef<(HTMLButtonElement | null)[]>([]);
  const cuerpo = useRef<HTMLDivElement>(null);
  // Foco al abrir: el apartado pedido o la pestaña activa.
  useLayoutEffect(() => {
    if (estado.apartado) {
      const h = cuerpo.current?.querySelector<HTMLElement>(`[data-apartado="${CSS.escape(estado.apartado)}"]`);
      if (h) {
        h.scrollIntoView({ block: 'start' });
        h.focus({ preventScroll: true });
        return;
      }
    }
    pestanas.current[PESTANAS.findIndex((p) => p.id === estado.pestana)]?.focus();
    // Solo al abrir (cada apertura cambia `vez`); cambiar de pestaña no mueve el foco al cuerpo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado.vez]);
  useEffect(() => {
    if (cuerpo.current && !estado.apartado) cuerpo.current.scrollTop = 0;
  }, [estado.pestana, estado.apartado]);

  const teclaPestanas = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = PESTANAS.findIndex((p) => p.id === estado.pestana);
    const n = PESTANAS.length;
    const destino = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    alPestana(PESTANAS[destino]!.id);
    pestanas.current[destino]?.focus();
  };

  const apartados = APARTADOS.filter((a) => a.pestana === estado.pestana);
  return (
    <aside
      ref={raiz}
      className="ayuda"
      aria-labelledby={`${id}-titulo`}
      data-prueba="ayuda"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          e.preventDefault();
          alCerrar();
        }
      }}
    >
      <div className="ayuda-cabecera">
        <h2 id={`${id}-titulo`} className="ayuda-titulo">
          {T.ayuda.titulo}
        </h2>
        <BotonIcono etiqueta={T.ayuda.cerrar} icono={X} atajo="Esc" onClick={alCerrar} />
      </div>
      <div className="ayuda-pestanas" role="tablist" aria-label={T.ayuda.apartados} onKeyDown={teclaPestanas}>
        {PESTANAS.map((p, k) => (
          <button
            key={p.id}
            ref={(el) => {
              pestanas.current[k] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-pestana-${p.id}`}
            aria-selected={p.id === estado.pestana}
            aria-controls={`${id}-panel`}
            tabIndex={p.id === estado.pestana ? 0 : -1}
            className="ayuda-pestana"
            onClick={() => alPestana(p.id)}
          >
            {p.titulo}
          </button>
        ))}
      </div>
      <div ref={cuerpo} id={`${id}-panel`} className="ayuda-cuerpo" role="tabpanel" aria-labelledby={`${id}-pestana-${estado.pestana}`} tabIndex={0}>
        {apartados.map((a) => (
          <section key={a.id} className="ayuda-apartado" aria-labelledby={`${id}-${a.id}`}>
            <h3 id={`${id}-${a.id}`} className="ayuda-apartado-titulo" data-apartado={a.id} tabIndex={-1}>
              {a.titulo}
            </h3>
            {a.parrafos.map((p, k) => (
              <p key={k}>
                <TextoMat texto={p} />
              </p>
            ))}
            {a.tabla ? (
              <table className="ayuda-tabla" data-prueba={`tabla-${a.id}`}>
                <thead>
                  <tr>
                    {a.tabla.cabecera.map((c) => (
                      <th key={c} scope="col">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {a.tabla.filas.map((f, i) => (
                    <tr key={i}>
                      {f.map((c, j) => (
                        <td key={j} className={a.tabla!.mono?.includes(j) ? 'num' : undefined}>
                          <TextoMat texto={c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </section>
        ))}
      </div>
    </aside>
  );
}
