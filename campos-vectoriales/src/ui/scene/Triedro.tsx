import { useEffect, useState } from 'react';
import type { ControladorEscena } from '../../render/ControladorEscena';

const ESTILO = ['', '4 3', '1.2 2.4'];
const LETRA = ['x', 'y', 'z'];

/** Triedro de orientación: gira con la cámara; mismo estilo de línea que los ejes. */
export function Triedro({ controlador }: { controlador: ControladorEscena | null }) {
  const [dirs, setDirs] = useState<[number, number, number][]>([
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]);
  useEffect(() => {
    if (!controlador) return;
    const actualizar = () => setDirs(controlador.direccionesEjes());
    actualizar();
    return controlador.alCambiarCamara(actualizar);
  }, [controlador]);

  const c = 36;
  const r = 22;
  const orden = [0, 1, 2].sort((a, b) => (dirs[a]?.[2] ?? 0) - (dirs[b]?.[2] ?? 0));
  return (
    <svg className="triedro flotante" data-flotante="triedro" width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
      {orden.map((k) => {
        const d = dirs[k] ?? [0, 0, 0];
        const x = c + r * d[0];
        const y = c - r * d[1];
        const lx = c + (r + 9) * d[0];
        const ly = c - (r + 9) * d[1];
        return (
          <g key={k}>
            <line x1={c} y1={c} x2={x} y2={y} stroke="#8C8C8C" strokeWidth="1.5" strokeDasharray={ESTILO[k]} strokeLinecap="round" />
            <text x={lx} y={ly} fill="#B0B0B0" fontSize="11" fontWeight="600" textAnchor="middle" dominantBaseline="central">
              {LETRA[k]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
