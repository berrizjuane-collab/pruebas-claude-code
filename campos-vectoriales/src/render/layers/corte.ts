/**
 * Capa del corte (REN-05, DESIGN §9.5): plano XY/XZ/YZ con velo `#F5F5F5` al 3 %, contorno
 * discontinuo (≈ 6-4 px) `#8C8C8C`, rótulo «z = 0.00» en la esquina más cercana a la cámara
 * y flechas propias para «Flechas: solo corte». Las flechas de fuera del corte se ocultan,
 * nunca se atenúan. El mapa escalar (REN-06) se dibuja sobre el mismo plano.
 */
import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { escena } from '../../design/tokens';
import type { InstanciasFlechas } from '../../geometria/flechas';
import { EJES_PLANO, NOMBRE_EJE, type Dominio, type Plano } from '../../math/tipos';
import { Etiqueta } from '../text/etiquetas';
import { CapaEscalar, type DatosEscalar } from './escalar';
import { CapaFlechas } from './flechas3d';

export interface DatosCorte {
  plano: Plano;
  c: number;
  dominio: Dominio;
}

/** Rótulo del plano: «z = 0.00», «x = −0.50» (signo menos tipográfico). */
export function rotuloCorte(plano: Plano, c: number): string {
  const n = EJES_PLANO[plano].n;
  const v = Math.abs(c) < 0.005 ? 0 : c;
  return `${NOMBRE_EJE[n]} = ${v.toFixed(2).replace('-', '−')}`;
}

/** Esquinas del rectángulo del corte (4 × 3). */
export function esquinasCorte(d: DatosCorte): [number, number, number][] {
  const { u, v, n } = EJES_PLANO[d.plano];
  const esquina = (a: 'min' | 'max', b: 'min' | 'max'): [number, number, number] => {
    const q: [number, number, number] = [0, 0, 0];
    q[u] = d.dominio[a][u] as number;
    q[v] = d.dominio[b][v] as number;
    q[n] = d.c;
    return q;
  };
  return [esquina('min', 'min'), esquina('max', 'min'), esquina('max', 'max'), esquina('min', 'max')];
}

export class CapaCorte {
  readonly grupo = new THREE.Group();
  readonly flechas = new CapaFlechas(441);
  readonly escalar = new CapaEscalar();
  readonly velo: THREE.Mesh;
  private readonly matContorno: LineMaterial;
  private contorno: LineSegments2;
  private readonly etiqueta = new Etiqueta('', { px: 12, color: escena.etiqueta, peso: 500 });
  private datos: DatosCorte | null = null;
  private esquinas: [number, number, number][] = [];

  constructor() {
    this.velo = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color().setStyle('#F5F5F5', THREE.SRGBColorSpace),
        transparent: true,
        opacity: 0.03,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    this.velo.name = 'corte-velo';
    this.velo.renderOrder = 4;
    this.matContorno = new LineMaterial({ linewidth: 1.5, dashed: true, dashSize: 0.1, gapSize: 0.07, toneMapped: false });
    this.matContorno.color.setStyle(escena.corte, THREE.SRGBColorSpace);
    this.contorno = new LineSegments2(new LineSegmentsGeometry(), this.matContorno);
    this.contorno.name = 'corte-contorno';
    this.grupo.add(this.velo, this.escalar.grupo, this.contorno, this.etiqueta.sprite, this.flechas.grupo);
    this.grupo.visible = false;
    this.flechas.setVisible(false);
  }

  /** Coloca el plano (o lo oculta) y fija las flechas «solo corte». */
  fijar(d: DatosCorte | null, flechas: InstanciasFlechas | null): void {
    this.datos = d;
    this.grupo.visible = !!d;
    if (flechas) this.flechas.actualizar(flechas);
    this.flechas.setVisible(!!d && !!flechas);
    if (!d) return;
    this.esquinas = esquinasCorte(d);
    const [a, b, c, e] = this.esquinas as [[number, number, number], [number, number, number], [number, number, number], [number, number, number]];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...e], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    this.velo.geometry.dispose();
    this.velo.geometry = g;
    const geo = new LineSegmentsGeometry().setPositions([...a, ...b, ...b, ...c, ...c, ...e, ...e, ...a]);
    this.contorno.geometry.dispose();
    this.contorno.geometry = geo;
    this.contorno.computeLineDistances();
    this.etiqueta.fijarTexto(rotuloCorte(d.plano, d.c));
  }

  /**
   * Mapa escalar del corte (REN-06) o null. Se coloca con el plano de su propia muestra; con
   * mapa, el velo sobra.
   */
  fijarEscalar(d: DatosEscalar | null): void {
    this.escalar.fijar(d, d ? esquinasCorte({ plano: d.rejilla.plano, c: d.rejilla.c, dominio: d.rejilla.dominio }) : []);
    this.velo.visible = !d;
  }

  /**
   * Por fotograma: discontinuidad de ≈ 6-4 px a la distancia del objetivo y rótulo en la
   * esquina más cercana a la cámara, un poco por fuera del rectángulo.
   */
  ajustar(camara: THREE.Camera, factorSprites: number, pxPorUnidad: number, anchoCss: number, altoCss: number): void {
    this.matContorno.resolution.set(anchoCss, altoCss);
    this.escalar.ajustar(pxPorUnidad, anchoCss, altoCss);
    this.flechas.orientarAnillos(camara.position);
    if (!this.datos || pxPorUnidad <= 0) return;
    this.matContorno.dashSize = 6 / pxPorUnidad;
    this.matContorno.gapSize = 4 / pxPorUnidad;
    const p = camara.position;
    let mejor = 0;
    let dMin = Infinity;
    this.esquinas.forEach((q, i) => {
      const dist = Math.hypot(q[0] - p.x, q[1] - p.y, q[2] - p.z);
      if (dist < dMin) {
        dMin = dist;
        mejor = i;
      }
    });
    const q = this.esquinas[mejor] as [number, number, number];
    const centro = [0, 1, 2].map((k) => this.esquinas.reduce((s, e) => s + e[k]!, 0) / 4);
    const fuera = 14 / pxPorUnidad;
    const dx = q[0] - centro[0]!;
    const dy = q[1] - centro[1]!;
    const dz = q[2] - centro[2]!;
    const l = Math.hypot(dx, dy, dz) || 1;
    this.etiqueta.sprite.position.set(q[0] + (dx / l) * fuera, q[1] + (dy / l) * fuera, q[2] + (dz / l) * fuera);
    this.etiqueta.escalar(factorSprites);
  }

  rerasterizar(): void {
    this.etiqueta.rerasterizar();
  }

  setResolucion(anchoPx: number, altoPx: number, pixelRatio: number): void {
    this.flechas.setResolucion(anchoPx, altoPx, pixelRatio);
    this.escalar.setResolucion(anchoPx, altoPx, pixelRatio);
  }

  /** Plano visible (para elegir puntos sobre él), o null. */
  get planoActivo(): DatosCorte | null {
    return this.grupo.visible ? this.datos : null;
  }

  get rotulo(): string | null {
    return this.datos ? rotuloCorte(this.datos.plano, this.datos.c) : null;
  }

  /** Esquinas del rectángulo dibujado (para las pruebas) y posición del rótulo. */
  get estadisticas() {
    const e = this.etiqueta.sprite.position;
    return {
      visible: this.grupo.visible,
      rotulo: this.rotulo,
      esquinas: this.datos ? this.esquinas.map((q) => [...q]) : [],
      posRotulo: [e.x, e.y, e.z],
      velo: this.velo.visible,
      flechas: this.flechas.grupo.visible ? this.flechas.cilindros.count : 0,
      escalar: this.escalar.grupo.visible ? this.escalar.estadisticas : null,
    };
  }

  dispose(): void {
    this.velo.geometry.dispose();
    (this.velo.material as THREE.Material).dispose();
    this.contorno.geometry.dispose();
    this.matContorno.dispose();
    this.etiqueta.dispose();
    this.flechas.dispose();
    this.escalar.dispose();
  }
}
