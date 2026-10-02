/**
 * Etiquetas de texto dentro del lienzo WebGL (D-13): se rasterizan con Canvas 2D sobre
 * fondo transparente (suavizado en escala de grises, D-23) y se dibujan como sprites de
 * tamaño constante en píxeles. Así aparecen también en la exportación PNG.
 */
import * as THREE from 'three';
import { escena, tipo } from '../../design/tokens';

export interface OpcionesEtiqueta {
  /** Tamaño de letra en píxeles CSS. */
  px: number;
  color: string;
  peso?: number;
  /** Ancla del sprite: (0.5, 0.5) centra; (0, 0) esquina inferior izquierda. */
  ancla?: readonly [number, number];
  familia?: string;
}

/** Escala de rasterizado: nítida en pantallas de alta densidad y al exportar. */
const RASTER = 3;

export class Etiqueta {
  readonly sprite: THREE.Sprite;
  anchoCss = 0;
  altoCss = 0;
  private textura: THREE.CanvasTexture | null = null;
  private texto = '';

  constructor(
    texto: string,
    private readonly opciones: OpcionesEtiqueta,
  ) {
    const material = new THREE.SpriteMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: false,
    });
    this.sprite = new THREE.Sprite(material);
    this.sprite.renderOrder = 20;
    const [ax, ay] = opciones.ancla ?? [0.5, 0.5];
    this.sprite.center.set(ax, ay);
    this.fijarTexto(texto);
  }

  fijarTexto(texto: string): void {
    if (texto === this.texto && this.textura) return;
    this.texto = texto;
    const { px, color, peso = 500, familia = tipo.familiaUi } = this.opciones;
    const lienzo = document.createElement('canvas');
    const ctx = lienzo.getContext('2d');
    if (!ctx) return;
    const fuente = `${peso} ${px * RASTER}px ${familia}`;
    ctx.font = fuente;
    const margen = 3 * RASTER;
    const ancho = Math.ceil(ctx.measureText(texto).width) + 2 * margen;
    const alto = Math.ceil(px * 1.4 * RASTER) + 2 * margen;
    lienzo.width = Math.max(1, ancho);
    lienzo.height = Math.max(1, alto);
    ctx.font = fuente;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = escena.halo;
    ctx.lineWidth = 3 * RASTER;
    ctx.strokeText(texto, margen, alto / 2);
    ctx.fillStyle = color;
    ctx.fillText(texto, margen, alto / 2);
    this.textura?.dispose();
    this.textura = new THREE.CanvasTexture(lienzo);
    this.textura.colorSpace = THREE.SRGBColorSpace;
    this.textura.minFilter = THREE.LinearFilter;
    this.textura.generateMipmaps = false;
    const material = this.sprite.material;
    material.map = this.textura;
    material.needsUpdate = true;
    this.anchoCss = lienzo.width / RASTER;
    this.altoCss = lienzo.height / RASTER;
  }

  /** Vuelve a rasterizar el mismo texto (p. ej. cuando terminan de cargar las fuentes). */
  rerasterizar(): void {
    const t = this.texto;
    this.texto = '';
    this.fijarTexto(t);
  }

  /** Ajusta la escala del sprite para que mida anchoCss × altoCss píxeles en pantalla. */
  escalar(k: number): void {
    this.sprite.scale.set(this.anchoCss * k, this.altoCss * k, 1);
  }

  dispose(): void {
    this.textura?.dispose();
    this.sprite.material.dispose();
  }
}

/**
 * Factor de escala de sprites sin atenuación: un sprite de escala s mide
 * s · P₁₁ · H / 2 píxeles de alto, con P₁₁ = proyección[5] y H la altura en CSS px.
 */
export function factorEscalaSprites(camara: THREE.Camera, altoCss: number): number {
  const p11 = camara.projectionMatrix.elements[5] as number;
  return 2 / (p11 * Math.max(1, altoCss));
}
