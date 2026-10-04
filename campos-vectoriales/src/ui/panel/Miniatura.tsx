import type { IdCampo } from '../../math/catalog';

/** Miniaturas monocromas de los campos (24 px, trazo 1.5, mismo estilo que Lucide). */
const TRAZOS: Record<IdCampo, React.ReactNode> = {
  uniforme: (
    <>
      <path d="M4 7h13M14 4l3 3-3 3" />
      <path d="M4 17h13M14 14l3 3-3 3" />
    </>
  ),
  'radial-saliente': (
    <>
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <path d="M12 9V3M9.5 5.5 12 3l2.5 2.5" />
      <path d="M12 15v6M9.5 18.5 12 21l2.5-2.5" />
      <path d="M9 12H3M5.5 9.5 3 12l2.5 2.5" />
      <path d="M15 12h6M18.5 9.5 21 12l-2.5 2.5" />
    </>
  ),
  'radial-entrante': (
    <>
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <path d="M12 3v6M9.5 6.5 12 9l2.5-2.5" />
      <path d="M12 21v-6M9.5 17.5 12 15l2.5 2.5" />
      <path d="M3 12h6M6.5 9.5 9 12l-2.5 2.5" />
      <path d="M21 12h-6M17.5 9.5 15 12l2.5 2.5" />
    </>
  ),
  rotacional: (
    <>
      <path d="M19 12a7 7 0 1 1-2.05-4.95" />
      <path d="M17.5 3.8 17 7.2l-3.4-.4" />
    </>
  ),
  helicoidal: (
    <>
      <path d="M7 20c6-1 10-3 10-4.5S7 12.5 7 11s4-3 10-4.5" />
      <path d="M7 6.5C11 5.5 14 4.6 15.5 3.5" />
      <path d="M13 3l2.8.4-.6 2.6" />
    </>
  ),
  silla: (
    <>
      <path d="M4 4c4 4 4 12 0 16M20 4c-4 4-4 12 0 16" />
      <path d="M12 3v18M3 12h18" strokeDasharray="1.5 2" />
    </>
  ),
  // Línea de corriente recta (instante) frente a la trayectoria circular (SPEC §4.9.1).
  'viento-giratorio': (
    <>
      <circle cx="12" cy="12" r="8" strokeDasharray="1.5 2.5" />
      <path d="M5 12h13M15 9l3 3-3 3" />
    </>
  ),
  // Gotas que caen inclinadas por el viento.
  lluvia: (
    <>
      <path d="M7 3.5 5.5 8M13 5.5 11.5 10M19 3.5 17.5 8" />
      <path d="M8.5 13.5 7 18M14.5 15.5 13 20M20 13.5l-1.5 4.5" />
    </>
  ),
  // Silla girada y el sentido del giro.
  'silla-giratoria': (
    <>
      <path d="M6.5 4.5c3 4.5 6.5 6 11.5 5M5 14c5-1 8.5.5 11.5 5" />
      <path d="M20.5 14.5a9 9 0 0 1-3 5.5M17.2 17.6l.3 2.4 2.4-.3" />
    </>
  ),
};

export function Miniatura({ id, tam = 24 }: { id: IdCampo; tam?: number }) {
  return (
    <svg
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {TRAZOS[id]}
    </svg>
  );
}
