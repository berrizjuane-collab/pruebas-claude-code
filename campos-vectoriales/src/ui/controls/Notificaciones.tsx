/**
 * Notificaciones (DESIGN §5.2 y §6.1): tarjetas de nivel 2 abajo al centro de la escena,
 * con icono, texto y acción opcional («Deshacer»). Duran 4 s (8 s con «Deshacer») y se
 * pausan mientras el puntero está encima o el foco dentro. `role="status"` (o `alert` si
 * es un error).
 */
import { memo, useEffect, useRef, useState } from 'react';
import { CircleCheck, Info, OctagonAlert, TriangleAlert, X } from 'lucide-react';
import { crearAlmacen, type Almacen } from '../../state/store';
import { useAlmacen } from '../hooks';
import { PALABRA } from './Aviso';

export interface Notificacion {
  id: number;
  tipo: 'exito' | 'info' | 'aviso' | 'error';
  texto: string;
  accion?: { texto: string; alElegir: () => void };
  /** Duración en ms (por defecto 4000; 8000 con acción). */
  duracion: number;
  /** Notificaciones con la misma clave se sustituyen en lugar de apilarse. */
  clave?: string;
}

export interface Notificador {
  almacen: Almacen<Notificacion[]>;
  notificar: (n: Omit<Notificacion, 'id' | 'duracion'> & { duracion?: number }) => number;
  descartar: (id: number) => void;
}

const MAXIMO = 3;

export function crearNotificador(): Notificador {
  const almacen = crearAlmacen<Notificacion[]>([]);
  let siguiente = 1;
  return {
    almacen,
    notificar(n) {
      const id = siguiente++;
      const nueva: Notificacion = { ...n, id, duracion: n.duracion ?? (n.accion ? 8000 : 4000) };
      almacen.fijar((lista) => [...lista.filter((x) => !n.clave || x.clave !== n.clave), nueva].slice(-MAXIMO));
      return id;
    },
    descartar(id) {
      almacen.fijar((lista) => (lista.some((x) => x.id === id) ? lista.filter((x) => x.id !== id) : lista));
    },
  };
}

const ICONO = { exito: CircleCheck, info: Info, aviso: TriangleAlert, error: OctagonAlert } as const;

function NotificacionesBase({ notificador }: { notificador: Notificador }) {
  const lista = useAlmacen(notificador.almacen, (s) => s);
  return (
    <div className="notificaciones" data-flotante={lista.length ? 'notificaciones' : undefined} aria-label="Notificaciones">
      {lista.map((n) => (
        <Tarjeta key={n.id} n={n} descartar={notificador.descartar} />
      ))}
    </div>
  );
}

function Tarjeta({ n, descartar }: { n: Notificacion; descartar: (id: number) => void }) {
  const [pausada, setPausada] = useState(false);
  const restante = useRef(n.duracion);
  const alCerrar = () => descartar(n.id);

  useEffect(() => {
    if (pausada) return;
    const inicio = performance.now();
    const t = setTimeout(() => descartar(n.id), restante.current);
    return () => {
      clearTimeout(t);
      restante.current = Math.max(0, restante.current - (performance.now() - inicio));
    };
  }, [pausada, descartar, n.id]);

  const I = ICONO[n.tipo];
  return (
    <div
      className={`notificacion notificacion-${n.tipo}`}
      role={n.tipo === 'error' ? 'alert' : 'status'}
      data-prueba="notificacion"
      data-pausada={pausada || undefined}
      onPointerEnter={() => setPausada(true)}
      onPointerLeave={() => setPausada(false)}
      onFocus={() => setPausada(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPausada(false);
      }}
    >
      <I className="aviso-icono" size={16} strokeWidth={1.5} aria-hidden="true" />
      <p className="notificacion-texto">
        {n.tipo !== 'info' ? <strong className="aviso-palabra">{PALABRA[n.tipo]} </strong> : null}
        {n.texto}
      </p>
      {n.accion ? (
        <button
          type="button"
          className="boton boton-fantasma notificacion-accion"
          onClick={() => {
            n.accion?.alElegir();
            alCerrar();
          }}
        >
          {n.accion.texto}
        </button>
      ) : null}
      <button type="button" className="boton-icono boton-cerrar" aria-label="Cerrar notificación" onClick={alCerrar}>
        <X size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  );
}

export const Notificaciones = memo(NotificacionesBase);
