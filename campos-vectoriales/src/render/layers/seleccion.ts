/**
 * Punto inspeccionado P (INS-01, DESIGN §9.5): aro en pantalla de 14 px (trazo de 2 px
 * `#F5F5F5` con halo, siempre visible), cruz de líneas discontinuas `#B0B0B0` paralelas a los
 * ejes hasta las caras de la caja y etiqueta «P». En P se dibuja el glifo **exacto** del modo
 * vigente (F(P), o ∇×F(P) con «Glifos: rot F»), aunque P no sea un nodo. Su identificación no
 * depende del tono: es una forma (aro), una geometría (cruz) y un texto.
 */
import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { hexARgb } from '../../design/color';
import { escena } from '../../design/tokens';
import type { InstanciasFlechas } from '../../geometria/flechas';
import type { Dominio, Vec3 } from '../../math/tipos';
import { CapaGlifos, FORMA } from '../glifos';
import { Etiqueta } from '../text/etiquetas';
import { CapaFlechas } from './flechas3d';

export interface DatosSeleccion {
  punto: Vec3;
  dominio: Dominio;
  /** Glifo exacto en P (una sola flecha, con la escala vigente) o null si no está definido. */
  flecha: InstanciasFlechas | null;
}

export class CapaSeleccion {
  readonly grupo = new THREE.Group();
  readonly flecha = new CapaFlechas(1);
  private readonly aro = new CapaGlifos({ siempreVisible: true, orden: 30 });
  private readonly matCruz: LineMaterial;
  private cruz: LineSegments2;
  private readonly etiqueta = new Etiqueta('P', { px: 13, color: escena.seleccion, peso: 600, ancla: [-0.35, -0.2] });
  private datos: DatosSeleccion | null = null;

  constructor() {
    this.matCruz = new LineMaterial({ linewidth: 1, dashed: true, dashSize: 0.1, gapSize: 0.07, toneMapped: false });
    this.matCruz.color.setStyle(escena.cruz, THREE.SRGBColorSpace);
    this.cruz = new LineSegments2(new LineSegmentsGeometry(), this.matCruz);
    this.cruz.name = 'seleccion-cruz';
    this.cruz.frustumCulled = false;
    this.grupo.add(this.cruz, this.flecha.grupo, this.aro.objeto, this.etiqueta.sprite);
    this.grupo.visible = false;
    this.grupo.name = 'seleccion';
  }

  fijar(d: DatosSeleccion | null): void {
    this.datos = d;
    this.grupo.visible = !!d;
    if (!d) return;
    const [x, y, z] = d.punto;
    const { min, max } = d.dominio;
    // Tres segmentos por P, de cara a cara de la caja: la discontinuidad es regular en cada uno.
    const geo = new LineSegmentsGeometry().setPositions([
      min[0] as number, y, z, max[0] as number, y, z,
      x, min[1] as number, z, x, max[1] as number, z,
      x, y, min[2] as number, x, y, max[2] as number,
    ]);
    this.cruz.geometry.dispose();
    this.cruz.geometry = geo;
    this.cruz.computeLineDistances();
    const gris = hexARgb(escena.seleccion)[0] / 255;
    this.aro.actualizar({ n: 1, pos: [x, y, z], forma: [FORMA.ARO], tam: [14], gris: [gris] });
    this.etiqueta.sprite.position.set(x, y, z);
    if (d.flecha) this.flecha.actualizar(d.flecha);
    this.flecha.setVisible(!!d.flecha);
  }

  /** Por fotograma: discontinuidad de ≈ 6-4 px y tamaño del rótulo. */
  ajustar(factorSprites: number, pxPorUnidad: number, anchoCss: number, altoCss: number): void {
    this.matCruz.resolution.set(anchoCss, altoCss);
    if (!this.datos || pxPorUnidad <= 0) return;
    this.matCruz.dashSize = 6 / pxPorUnidad;
    this.matCruz.gapSize = 4 / pxPorUnidad;
    this.etiqueta.escalar(factorSprites);
  }

  rerasterizar(): void {
    this.etiqueta.rerasterizar();
  }

  setResolucion(anchoPx: number, altoPx: number, pixelRatio: number): void {
    this.aro.setResolucion(anchoPx, altoPx, pixelRatio);
    this.flecha.setResolucion(anchoPx, altoPx, pixelRatio);
  }

  get estadisticas() {
    const d = this.datos;
    if (!d) return null;
    // Extremos de los tres tramos de la cruz, tal como están en la geometría dibujada.
    const inicio = this.cruz.geometry.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute;
    const fin = this.cruz.geometry.getAttribute('instanceEnd') as THREE.InterleavedBufferAttribute;
    const cruz = Array.from({ length: inicio.count }, (_, k) => [
      [inicio.getX(k), inicio.getY(k), inicio.getZ(k)],
      [fin.getX(k), fin.getY(k), fin.getZ(k)],
    ]);
    return { visible: this.grupo.visible, punto: [...d.punto], flecha: this.flecha.grupo.visible, cruz, discontinua: this.matCruz.dashed, rotulo: this.etiqueta.sprite.visible };
  }

  dispose(): void {
    this.cruz.geometry.dispose();
    this.matCruz.dispose();
    this.aro.dispose();
    this.etiqueta.dispose();
    this.flecha.dispose();
  }
}
