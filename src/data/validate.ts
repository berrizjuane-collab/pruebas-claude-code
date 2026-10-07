/**
 * Validación en tiempo de ejecución de los datos del atlas. Se ejecuta al cargar
 * (los errores bloquean la escena con un mensaje claro) y en los tests.
 */
import type { AtlasData, Certainty, PoiCategory, RouteSegment } from './types.ts';

const CERTAINTIES: Certainty[] = ['documentado', 'aproximado', 'reconstruido'];
const CATEGORIES: PoiCategory[] = ['campamento', 'hito', 'sector', 'umbral', 'cumbre', 'geografia'];

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

function distToPolyline(x: number, y: number, pts: [number, number, number][]): number {
  let best = Infinity;
  for (let k = 1; k < pts.length; k++) {
    const [ax, ay] = pts[k - 1];
    const [bx, by] = pts[k];
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

/** Polilínea completa de una ruta (tramos concatenados, sin repetir uniones). */
export function routePolyline(data: AtlasData, routeId: string): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const sid of data.routes.rutas[routeId].tramos) {
    const pts = data.routes.tramos[sid]?.puntos;
    if (!pts) continue;
    out.push(...(out.length ? pts.slice(1) : pts));
  }
  return out;
}

export function validateAtlas(data: AtlasData): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { manifest, routes, pois } = data;

  // --- Sistema y rejillas ---------------------------------------------------
  if (!Number.isFinite(manifest.sistema.h0)) errors.push('h0 no es un número');
  const rings = ['core', 'context', 'far'] as const;
  for (const r of rings) {
    const g = manifest.rejillas[r];
    if (!g) {
      errors.push(`falta la rejilla ${r}`);
      continue;
    }
    const n = Math.round((2 * g.semilado) / g.espaciado) + 1;
    if (n !== g.muestras) errors.push(`rejilla ${r}: ${g.muestras} muestras, esperadas ${n}`);
  }
  if (!(manifest.rejillas.core.semilado < manifest.rejillas.context.semilado && manifest.rejillas.context.semilado < manifest.rejillas.far.semilado))
    errors.push('los anillos de terreno no están anidados');
  const coreHalf = manifest.rejillas.core.semilado;
  const ctxHalf = manifest.rejillas.context.semilado;
  const [hMin, hMax] = manifest.rejillas.core.rango;

  // --- Tramos y rutas ---------------------------------------------------------
  const segUse = new Map<string, number>();
  for (const [rid, r] of Object.entries(routes.rutas)) {
    if (!r.tramos.length) errors.push(`ruta ${rid} sin tramos`);
    for (const sid of r.tramos) {
      if (!routes.tramos[sid]) errors.push(`ruta ${rid}: tramo inexistente ${sid}`);
      segUse.set(sid, (segUse.get(sid) ?? 0) + 1);
    }
    for (let k = 1; k < r.tramos.length; k++) {
      const a = routes.tramos[r.tramos[k - 1]]?.puntos.at(-1);
      const b = routes.tramos[r.tramos[k]]?.puntos[0];
      if (a && b && Math.hypot(a[0] - b[0], a[1] - b[1]) > 1) errors.push(`ruta ${rid}: ${r.tramos[k - 1]} y ${r.tramos[k]} no están unidos`);
    }
  }
  const segs = Object.entries(routes.tramos) as [string, RouteSegment][];
  for (const [sid, s] of segs) {
    if (!CERTAINTIES.includes(s.certeza)) errors.push(`tramo ${sid}: certeza no válida`);
    if (s.puntos.length < 2) errors.push(`tramo ${sid}: menos de dos puntos`);
    if (!segUse.has(sid)) warnings.push(`tramo ${sid} no lo usa ninguna ruta`);
    for (const [x, y, a] of s.puntos) {
      if (Math.abs(x) >= coreHalf || Math.abs(y) >= coreHalf) {
        errors.push(`tramo ${sid}: punto fuera del núcleo (${x}, ${y})`);
        break;
      }
      if (a < hMin - 1 || a > hMax + 1) {
        errors.push(`tramo ${sid}: altitud ${a} fuera del rango del DEM`);
        break;
      }
    }
  }
  // tramos duplicados (misma geometría con dos nombres) → líneas superpuestas
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i][1].puntos;
      const b = segs[j][1].puntos;
      if (a.length === b.length && a.every((p, k) => Math.hypot(p[0] - b[k][0], p[1] - b[k][1]) < 0.5))
        errors.push(`tramos duplicados: ${segs[i][0]} y ${segs[j][0]}`);
    }

  // --- POI ------------------------------------------------------------------------
  const refIds = new Set(pois.referencias.map((r) => r.id));
  const seen = new Set<string>();
  for (const p of pois.poi) {
    if (seen.has(p.id)) errors.push(`POI duplicado: ${p.id}`);
    seen.add(p.id);
    if (!CATEGORIES.includes(p.categoria)) errors.push(`POI ${p.id}: categoría ${p.categoria}`);
    if (!CERTAINTIES.includes(p.certeza)) errors.push(`POI ${p.id}: certeza ${p.certeza}`);
    for (const r of p.refs) if (!refIds.has(r)) errors.push(`POI ${p.id}: referencia inexistente ${r}`);
    for (const r of p.rutas) if (!routes.rutas[r]) errors.push(`POI ${p.id}: ruta inexistente ${r}`);
    const lim = p.categoria === 'geografia' ? ctxHalf : coreHalf;
    if (Math.abs(p.posicion.x) >= lim || Math.abs(p.posicion.y) >= lim) errors.push(`POI ${p.id}: fuera del área`);
    // Un campamento de una ruta debe estar sobre esa ruta (no se reutilizan entre vías).
    if (p.categoria === 'campamento')
      for (const r of p.rutas) {
        const d = distToPolyline(p.posicion.x, p.posicion.y, routePolyline(data, r));
        if (d > 60) errors.push(`campamento ${p.id} a ${d.toFixed(0)} m de la ruta ${r}`);
      }
    if (p.altitudRef?.min !== undefined && p.altitudRef?.max !== undefined && p.altitudRef.min > p.altitudRef.max)
      errors.push(`POI ${p.id}: rango de altitud invertido`);
  }
  const summit = pois.poi.find((p) => p.categoria === 'cumbre');
  if (!summit) errors.push('falta la cumbre');
  else if (Math.abs(summit.posicion.altModelo - manifest.cumbre.altitudReferencia) > 1)
    errors.push(`la cumbre del modelo (${summit.posicion.altModelo}) no coincide con ${manifest.cumbre.altitudReferencia}`);
  return { errors, warnings };
}
