/**
 * Rueda de paletas en P (REN-07, DESIGN §9.7; SPEC §3.4): cuatro palas en planos que contienen
 * el eje ∇×F(P), que giran a ω = ½‖∇×F(P)‖ rad por unidad de t, en la misma escala temporal τ
 * que las partículas. Rótulo «ω = 1.000 rad/t». En pausa (y con movimiento reducido) queda
 * quieta y una flecha curva marca el sentido de giro por la regla de la mano derecha.
 */
import * as THREE from 'three';
import { escena } from '../../design/tokens';
import type { Vec3 } from '../../math/tipos';
import { formatear } from '../../numerics/format';
import { Etiqueta } from '../text/etiquetas';
import { materialHalo } from './flechas3d';

export interface DatosRueda {
  centro: Vec3;
  /** Eje unitario: sentido de ∇×F(P). */
  eje: Vec3;
  /** Radio de las palas (unidades de Ω). */
  radio: number;
  /** ω = ½‖∇×F(P)‖, en rad por unidad de t. */
  omega: number;
}

const EJE_Z = new THREE.Vector3(0, 0, 1);

/** Rótulo de la velocidad angular: «ω = 1.000 rad/t». */
export const rotuloOmega = (omega: number) => `ω = ${formatear(omega, { cifras: 4 })} rad/t`;

export class CapaRueda {
  readonly grupo = new THREE.Group();
  /** Gira alrededor de su eje z local (el eje de la rueda). */
  private readonly rotor = new THREE.Group();
  private readonly orientado = new THREE.Group();
  private readonly flechaCurva = new THREE.Group();
  private readonly etiqueta = new Etiqueta('', { px: 12, color: escena.seleccion, peso: 500, ancla: [0, 0.5] });
  private readonly material = new THREE.MeshBasicMaterial({ toneMapped: false });
  private readonly halo = materialHalo();
  private readonly geometrias: THREE.BufferGeometry[] = [];
  private datos: DatosRueda | null = null;
  private pausa = true;
  angulo = 0;

  constructor() {
    this.material.color.setStyle(escena.seleccion, THREE.SRGBColorSpace);
    const conHalo = (g: THREE.BufferGeometry, padre: THREE.Object3D) => {
      this.geometrias.push(g);
      const halo = new THREE.Mesh(g, this.halo);
      const m = new THREE.Mesh(g, this.material);
      halo.frustumCulled = false;
      m.frustumCulled = false;
      padre.add(halo, m);
    };
    // Geometría de radio 1 (se escala con el grupo): palas de 0.15 a 1 en radio y 0.7 de alto.
    for (let k = 0; k < 4; k++) {
      const pala = new THREE.BoxGeometry(0.85, 0.05, 0.7).translate(0.575, 0, 0).rotateZ((k * Math.PI) / 2);
      conHalo(pala, this.rotor);
    }
    // Eje (con su sentido): varilla y punta en +z.
    conHalo(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 8).rotateX(Math.PI / 2), this.orientado);
    conHalo(new THREE.ConeGeometry(0.09, 0.25, 12).rotateX(Math.PI / 2).translate(0, 0, 0.875), this.orientado);
    // Flecha curva (en pausa): arco de 270° antihorario alrededor de +z que acaba en una punta.
    conHalo(new THREE.TorusGeometry(1.2, 0.03, 4, 36, 1.5 * Math.PI), this.flechaCurva);
    conHalo(new THREE.ConeGeometry(0.09, 0.26, 12).rotateZ(-Math.PI / 2).translate(0.05, -1.2, 0), this.flechaCurva);
    this.orientado.add(this.rotor, this.flechaCurva);
    this.grupo.add(this.orientado, this.etiqueta.sprite);
    this.grupo.visible = false;
    this.grupo.name = 'rueda';
  }

  fijar(d: DatosRueda | null): void {
    this.datos = d;
    this.grupo.visible = !!d;
    if (!d) return;
    this.orientado.position.set(d.centro[0], d.centro[1], d.centro[2]);
    this.orientado.quaternion.setFromUnitVectors(EJE_Z, new THREE.Vector3(d.eje[0], d.eje[1], d.eje[2]));
    this.orientado.scale.setScalar(d.radio);
    this.etiqueta.fijarTexto(rotuloOmega(d.omega));
    this.fijarAngulo(this.angulo);
  }

  /** Ángulo girado (rad) desde que se colocó la rueda. */
  fijarAngulo(theta: number): void {
    this.angulo = theta;
    this.rotor.rotation.set(0, 0, theta);
  }

  /** En pausa la rueda queda quieta y se ve la flecha curva de sentido. */
  fijarPausa(pausa: boolean): void {
    this.pausa = pausa;
    this.flechaCurva.visible = pausa;
  }

  /** Por fotograma: el rótulo, a la derecha de la rueda en pantalla. */
  ajustar(camara: THREE.Camera, factorSprites: number, pxPorUnidad: number): void {
    if (!this.datos || pxPorUnidad <= 0) return;
    const derecha = new THREE.Vector3().setFromMatrixColumn(camara.matrixWorld, 0);
    const d = this.datos;
    const separacion = 1.35 * d.radio + 10 / pxPorUnidad;
    this.etiqueta.sprite.position.set(d.centro[0] + derecha.x * separacion, d.centro[1] + derecha.y * separacion, d.centro[2] + derecha.z * separacion);
    this.etiqueta.escalar(factorSprites);
  }

  rerasterizar(): void {
    this.etiqueta.rerasterizar();
  }

  setResolucion(anchoPx: number, altoPx: number, pixelRatio: number): void {
    (this.halo.uniforms.uResolucion as THREE.IUniform<THREE.Vector2>).value.set(anchoPx, altoPx);
    (this.halo.uniforms.uAncho as THREE.IUniform<number>).value = 1.5 * pixelRatio;
  }

  get estadisticas() {
    const d = this.datos;
    return d ? { visible: this.grupo.visible, angulo: this.angulo, omega: d.omega, eje: [...d.eje], rotulo: rotuloOmega(d.omega), pausa: this.pausa } : null;
  }

  dispose(): void {
    for (const g of this.geometrias) g.dispose();
    this.material.dispose();
    this.halo.dispose();
    this.etiqueta.dispose();
  }
}
