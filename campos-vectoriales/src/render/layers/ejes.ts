/**
 * Ejes coordenados y caja del dominio (DESIGN §9.9): ejes por el origen si está dentro de
 * Ω (si no, por la esquina mínima), con punta en el extremo positivo, letra y estilo de
 * línea propio (x continuo, y discontinuo, z punteado); marcas numéricas como sprites.
 */
import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { escena } from '../../design/tokens';
import type { Dominio } from '../../math/tipos';
import { NOMBRE_EJE } from '../../math/tipos';
import { formatearCorto } from '../../numerics/format';
import { marcasEje, radioDominio } from '../camara';
import { Etiqueta } from '../text/etiquetas';

export class CapaEjes {
  readonly grupo = new THREE.Group();
  /*
   * Caja, líneas, puntas, letras y el «0» se crean una sola vez: al cambiar el dominio solo
   * cambian sus geometrías y posiciones. Si se desecharan sus materiales, three.js liberaría
   * los programas de shader que nadie más usa y el siguiente fotograma tendría que volver a
   * compilarlos (≈ 0.5 s con WebGL por software; V-FUN-16).
   */
  private readonly caja: THREE.LineSegments;
  private readonly lineas: LineSegments2[] = [];
  private readonly materialesLinea: LineMaterial[] = [];
  private readonly puntas: THREE.Mesh[] = [];
  private readonly letras: Etiqueta[] = [];
  private readonly cero: Etiqueta;
  /** Marcas numéricas del dominio actual (su número cambia con el dominio). */
  private marcas: Etiqueta[] = [];
  /** Letra y marcas de cada eje: se ocultan cuando el eje apunta a la cámara. */
  private porEje: Etiqueta[][] = [[], [], []];

  constructor() {
    this.caja = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: new THREE.Color().setStyle(escena.caja, THREE.SRGBColorSpace), toneMapped: false }),
    );
    this.caja.name = 'caja-dominio';
    this.grupo.add(this.caja);
    const colorEje = new THREE.Color().setStyle(escena.eje, THREE.SRGBColorSpace);
    const matPunta = new THREE.MeshBasicMaterial({ color: colorEje, toneMapped: false });
    for (let k = 0; k < 3; k++) {
      // x continuo, y discontinuo, z punteado (las longitudes del trazo dependen del dominio).
      const mat = new LineMaterial({ color: colorEje.getHex(), linewidth: 1.5, dashed: k > 0, toneMapped: false });
      mat.color.copy(colorEje);
      this.materialesLinea.push(mat);
      const linea = new LineSegments2(new LineSegmentsGeometry(), mat);
      linea.name = `eje-${NOMBRE_EJE[k]}`;
      this.lineas.push(linea);
      const punta = new THREE.Mesh(new THREE.BufferGeometry(), matPunta);
      punta.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0));
      this.puntas.push(punta);
      this.letras.push(new Etiqueta(NOMBRE_EJE[k], { px: 14, color: escena.etiqueta, peso: 600 }));
      this.grupo.add(linea, punta, this.letras[k]!.sprite);
    }
    this.cero = new Etiqueta('0', { px: 11, color: escena.etiqueta, peso: 500, ancla: [1.3, 1.15] });
    this.grupo.add(this.cero.sprite);
  }

  private get etiquetas(): Etiqueta[] {
    return [...this.letras, this.cero, ...this.marcas];
  }

  fijarDominio(d: Dominio): void {
    const L = radioDominio(d) * 2;
    const origen = [0, 1, 2].map((k) => (d.min[k]! <= 0 && 0 <= d.max[k]! ? 0 : d.min[k]!)) as [number, number, number];

    // Caja del dominio (12 aristas, 1 px, decorativa).
    this.caja.geometry.dispose();
    this.caja.geometry = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(d.max[0] - d.min[0], d.max[1] - d.min[1], d.max[2] - d.min[2]).translate(
        (d.max[0] + d.min[0]) / 2,
        (d.max[1] + d.min[1]) / 2,
        (d.max[2] + d.min[2]) / 2,
      ),
    );

    for (const e of this.marcas) {
      this.grupo.remove(e.sprite);
      e.dispose();
    }
    this.marcas = [];
    this.porEje = [[], [], []];
    const trazos = [
      { dash: 1, gap: 0 },
      { dash: 0.035 * L, gap: 0.022 * L },
      { dash: 0.008 * L, gap: 0.016 * L },
    ];
    for (let k = 0; k < 3; k++) {
      const a = [...origen];
      const b = [...origen];
      a[k] = d.min[k]!;
      const extension = 0.07 * L;
      b[k] = d.max[k]! + extension;
      const linea = this.lineas[k]!;
      linea.geometry.dispose();
      linea.geometry = new LineSegmentsGeometry().setPositions([a[0]!, a[1]!, a[2]!, b[0]!, b[1]!, b[2]!]);
      linea.computeLineDistances();
      const mat = this.materialesLinea[k]!;
      mat.dashSize = trazos[k]!.dash;
      mat.gapSize = trazos[k]!.gap;

      // Punta del eje positivo.
      const largoPunta = 0.026 * L;
      const punta = this.puntas[k]!;
      punta.geometry.dispose();
      punta.geometry = new THREE.ConeGeometry(0.0075 * L, largoPunta, 16).translate(0, largoPunta / 2, 0);
      punta.position.set(b[0]!, b[1]!, b[2]!);

      // Letra del eje.
      const letra = this.letras[k]!;
      const pl = [...b];
      pl[k] = b[k]! + largoPunta + 0.03 * L;
      letra.sprite.position.set(pl[0]!, pl[1]!, pl[2]!);
      this.porEje[k]!.push(letra);

      // Marcas numéricas (sin el 0, que se rotula una sola vez en el origen).
      for (const v of marcasEje(d.min[k]!, d.max[k]!, 4)) {
        if (v === origen[k] && v === 0) continue;
        const e = new Etiqueta(formatearCorto(v), { px: 11, color: escena.etiqueta, peso: 500, ancla: [0.5, 1.15] });
        const pm = [...origen];
        pm[k] = v;
        e.sprite.position.set(pm[0]!, pm[1]!, pm[2]!);
        this.marcas.push(e);
        this.porEje[k]!.push(e);
        this.grupo.add(e.sprite);
      }
    }
    this.cero.sprite.visible = origen.every((c) => c === 0);
  }

  /**
   * Reescala los sprites y las líneas para el tamaño de pantalla actual. Un eje que apunta a
   * la cámara (a menos de 12°, p. ej. z en la vista XY) proyecta todas sus marcas sobre el
   * origen: su letra y sus números se ocultan para no amontonarse («0−2»); el triedro sigue
   * indicando su sentido.
   */
  ajustar(factorSprites: number, anchoPx: number, altoPx: number, camara?: THREE.Camera): void {
    for (const e of this.etiquetas) e.escalar(factorSprites);
    for (const m of this.materialesLinea) m.resolution.set(anchoPx, altoPx);
    if (!camara) return;
    const vista = camara.getWorldDirection(new THREE.Vector3());
    this.porEje.forEach((etiquetas, k) => {
      const visible = Math.abs(vista.getComponent(k)) < Math.cos((12 * Math.PI) / 180);
      for (const e of etiquetas) e.sprite.visible = visible;
    });
  }

  /** Ejes cuyos rótulos se ven (para las pruebas). */
  get rotulosVisibles(): boolean[] {
    return this.porEje.map((l) => l.every((e) => e.sprite.visible));
  }

  /** Re-rasteriza las etiquetas (p. ej. cuando terminan de cargar las fuentes). */
  rasterizarDeNuevo(): void {
    for (const e of this.etiquetas) e.rerasterizar();
  }

  dispose(): void {
    this.caja.geometry.dispose();
    (this.caja.material as THREE.Material).dispose();
    for (const l of this.lineas) l.geometry.dispose();
    for (const m of this.materialesLinea) m.dispose();
    for (const p of this.puntas) p.geometry.dispose();
    (this.puntas[0]?.material as THREE.Material | undefined)?.dispose();
    for (const e of this.etiquetas) e.dispose();
    this.marcas = [];
    this.porEje = [[], [], []];
  }
}
