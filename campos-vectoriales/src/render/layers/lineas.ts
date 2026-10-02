/**
 * Capa de líneas de corriente (REN-03, DESIGN §9.4): trazo continuo de 1.5 px y luminancia
 * constante (`#A0A0A0`, nunca magnitud) sobre un halo oscuro de 4.5 px; cheurones › de
 * sentido cada 1.5 Δ, semillas ○ y marcas finales ◇ (≈ 0) y × (no definido). Las líneas se
 * dibujan antes que las flechas, que quedan encima.
 */
import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { hexARgb } from '../../design/color';
import { escena } from '../../design/tokens';
import { FINAL, type GeometriaLineas } from '../../geometria/lineas';
import { CapaGlifos, FORMA } from '../glifos';

const ANCHO_LINEA = 1.5;
const ANCHO_HALO = ANCHO_LINEA + 2 * 1.5;

const gris = (hex: string) => hexARgb(hex)[0] / 255;

export class CapaLineas {
  readonly grupo = new THREE.Group();
  private geometria = new LineSegmentsGeometry();
  private readonly matHalo: LineMaterial;
  private readonly matLinea: LineMaterial;
  private readonly halo: LineSegments2;
  private readonly linea: LineSegments2;
  // Cheurones, semillas y finales están sobre su propia línea: se adelantan un 2 % de la
  // distancia para no quedar cortados por ella (las semillas se leían como «C»).
  private readonly glifos = new CapaGlifos({ orden: 3, sesgo: 0.02 });
  private cuentas = { segmentos: 0, cheurones: 0, semillas: 0, finales: 0 };

  constructor() {
    this.matHalo = new LineMaterial({ linewidth: ANCHO_HALO, toneMapped: false });
    this.matHalo.color.setStyle(escena.halo, THREE.SRGBColorSpace);
    // El halo, un poco más lejos en profundidad: sin esto, en cada unión el «capuchón» del
    // halo del segmento siguiente tapaba el trazo y la línea parecía discontinua (hallazgo de
    // REN-03). Los capuchones tienen profundidad constante (pendiente 0), así que el
    // desplazamiento útil es el de las unidades: 256 × 2⁻²⁴ ≈ 1.5·10⁻⁵ (≈ 0.12 unidades de Ω a la
    // distancia de encuadre), mucho menor que la separación de dos líneas que se cruzan.
    this.matHalo.polygonOffset = true;
    this.matHalo.polygonOffsetFactor = 4;
    this.matHalo.polygonOffsetUnits = 256;
    this.matLinea = new LineMaterial({ linewidth: ANCHO_LINEA, toneMapped: false });
    this.matLinea.color.setStyle(escena.linea, THREE.SRGBColorSpace);
    this.halo = new LineSegments2(this.geometria, this.matHalo);
    this.linea = new LineSegments2(this.geometria, this.matLinea);
    // El halo se dibuja antes y la línea pasa el test de profundidad (misma profundidad).
    this.halo.renderOrder = 0;
    this.linea.renderOrder = 1;
    this.halo.name = 'lineas-halo';
    this.linea.name = 'lineas';
    for (const o of [this.halo, this.linea]) o.frustumCulled = false;
    this.grupo.add(this.halo, this.linea, this.glifos.objeto);
    this.grupo.visible = false;
  }

  actualizar(g: GeometriaLineas | null): void {
    if (!g || g.segmentos.length === 0) {
      this.grupo.visible = false;
      this.cuentas = { segmentos: 0, cheurones: 0, semillas: 0, finales: 0 };
      return;
    }
    const nueva = new LineSegmentsGeometry().setPositions(g.segmentos);
    this.halo.geometry = nueva;
    this.linea.geometry = nueva;
    this.geometria.dispose();
    this.geometria = nueva;

    const nc = g.cheurones.length / 3;
    const ns = g.semillas.length / 3;
    const nf = g.formasFinales.length;
    const n = nc + ns + nf;
    const pos = new Float32Array(3 * n);
    const forma = new Float32Array(n);
    const tam = new Float32Array(n);
    const gr = new Float32Array(n);
    const tangente = new Float32Array(3 * n);
    pos.set(g.cheurones, 0);
    tangente.set(g.tangentes, 0);
    forma.fill(FORMA.CHEURON, 0, nc);
    tam.fill(10, 0, nc);
    gr.fill(gris(escena.linea), 0, nc);
    pos.set(g.semillas, 3 * nc);
    forma.fill(FORMA.CIRCULO_HUECO, nc, nc + ns);
    tam.fill(9, nc, nc + ns);
    gr.fill(gris(escena.semilla), nc, nc + ns);
    pos.set(g.finales, 3 * (nc + ns));
    for (let i = 0; i < nf; i++) forma[nc + ns + i] = g.formasFinales[i] === FINAL.ROMBO ? FORMA.ROMBO : FORMA.ASPA;
    tam.fill(9, nc + ns);
    gr.fill(gris(escena.cero), nc + ns);
    this.glifos.actualizar({ n, pos, forma, tam, gris: gr, tangente });
    this.cuentas = { segmentos: g.segmentos.length / 6, cheurones: nc, semillas: ns, finales: nf };
    this.grupo.visible = true;
  }

  setVisible(v: boolean): void {
    this.grupo.visible = v && this.cuentas.segmentos > 0;
  }

  /** Los anchos de `LineMaterial` se expresan en píxeles CSS (como los de los ejes). */
  setResolucion(anchoCss: number, altoCss: number, pixelRatio: number): void {
    this.matHalo.resolution.set(anchoCss, altoCss);
    this.matLinea.resolution.set(anchoCss, altoCss);
    this.glifos.setResolucion(anchoCss * pixelRatio, altoCss * pixelRatio, pixelRatio);
  }

  get estadisticas() {
    return { ...this.cuentas, visible: this.grupo.visible };
  }

  dispose(): void {
    this.geometria.dispose();
    this.matHalo.dispose();
    this.matLinea.dispose();
    this.glifos.dispose();
  }
}
