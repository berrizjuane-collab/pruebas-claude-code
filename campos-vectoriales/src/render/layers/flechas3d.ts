/**
 * Capa de flechas (REN-02): cilindro + cono instanciados, sin iluminación (D-08), con
 * contorno oscuro de anchura constante en píxeles (casco invertido expandido en espacio
 * de pantalla, DESIGN §9.2) y marcas «≈ 0» y «no definido».
 */
import * as THREE from 'three';
import { hexARgb } from '../../design/color';
import { escena } from '../../design/tokens';
import type { InstanciasFlechas } from '../../geometria/flechas';
import { CapaGlifos, FORMA, glifosUniformes } from '../glifos';

const EJE_Y = new THREE.Vector3(0, 1, 0);

const verticeHalo = /* glsl */ `
uniform float uAncho;
uniform vec2 uResolucion;
void main() {
  #ifdef USE_INSTANCING
    mat4 m = modelMatrix * instanceMatrix;
  #else
    mat4 m = modelMatrix;
  #endif
  vec4 pm = m * vec4(position, 1.0);
  vec3 nm = normalize(mat3(m) * normal);
  vec4 c0 = projectionMatrix * viewMatrix * pm;
  vec4 c1 = projectionMatrix * viewMatrix * vec4(pm.xyz + nm * 0.001, 1.0);
  vec2 d = c1.xy / c1.w - c0.xy / c0.w;
  float l = length(d);
  vec2 dir = l > 0.0 ? d / l : vec2(0.0);
  c0.xy += dir * (2.0 * uAncho / uResolucion) * c0.w;
  gl_Position = c0;
}`;

const fragmentoHalo = /* glsl */ `
uniform vec3 uColor;
void main() { gl_FragColor = vec4(uColor, 1.0); }`;

export function materialHalo(anchoCss = 1.5): THREE.ShaderMaterial {
  const [r, g, b] = hexARgb(escena.halo);
  return new THREE.ShaderMaterial({
    uniforms: {
      uAncho: { value: anchoCss },
      uResolucion: { value: new THREE.Vector2(1, 1) },
      uColor: { value: new THREE.Vector3(r / 255, g / 255, b / 255) },
    },
    vertexShader: verticeHalo,
    fragmentShader: fragmentoHalo,
    side: THREE.BackSide,
  });
}

export function geometriaCilindro(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false);
  g.translate(0, 0.5, 0);
  return g;
}

/** Factor sRGB del borde de la base del cono frente al vértice (gradiente fijo de forma). */
export const FACTOR_BASE_CONO = 0.8;

export function geometriaCono(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(1, 1, 16, 1, false);
  g.translate(0, 0.5, 0);
  // Gradiente fijo a lo largo del cono (no depende de la luz ni de la vista): el vértice
  // conserva el gris exacto de la rampa y el borde de la base baja al 80 % (sRGB). Da
  // forma de cono a las flechas que apuntan hacia la cámara (DESIGN §9.2).
  const pos = g.getAttribute('position');
  const colores = new Float32Array(pos.count * 3);
  const base = new THREE.Color().setRGB(FACTOR_BASE_CONO, FACTOR_BASE_CONO, FACTOR_BASE_CONO, THREE.SRGBColorSpace).r;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, pos.getY(i)));
    const f = base + (1 - base) * t;
    colores[3 * i] = f;
    colores[3 * i + 1] = f;
    colores[3 * i + 2] = f;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colores, 3));
  return g;
}

export class CapaFlechas {
  readonly grupo = new THREE.Group();
  readonly cilindros: THREE.InstancedMesh;
  readonly conos: THREE.InstancedMesh;
  private readonly haloCilindros: THREE.InstancedMesh;
  private readonly haloConos: THREE.InstancedMesh;
  private readonly matHalo: THREE.ShaderMaterial;
  private readonly marcas = new CapaGlifos();
  /** Para cada instancia de cono, la flecha a la que pertenece. */
  conoAFlecha = new Uint32Array(0);
  private datos: InstanciasFlechas | null = null;
  readonly capacidad: number;

  constructor(capacidad = 9261) {
    this.capacidad = capacidad;
    const matCil = new THREE.MeshBasicMaterial({ toneMapped: false });
    const matCono = new THREE.MeshBasicMaterial({ toneMapped: false, vertexColors: true });
    // La base del cono solo es visible cuando la flecha se aleja de la cámara: se dibuja más
    // oscura (≈ 55 % en sRGB) para distinguir «hacia mí» de «lejos de mí» sin sombrear la
    // superficie que codifica la magnitud (DESIGN §9.2).
    const matBaseCono = new THREE.MeshBasicMaterial({ toneMapped: false, color: new THREE.Color(0.3, 0.3, 0.3) });
    this.matHalo = materialHalo();
    const gCil = geometriaCilindro();
    const gCono = geometriaCono();
    this.cilindros = new THREE.InstancedMesh(gCil, matCil, capacidad);
    this.conos = new THREE.InstancedMesh(gCono, [matCono, matCono, matBaseCono], 2 * capacidad);
    this.haloCilindros = new THREE.InstancedMesh(gCil, this.matHalo, capacidad);
    this.haloConos = new THREE.InstancedMesh(gCono, this.matHalo, 2 * capacidad);
    // Los halos comparten las matrices de instancia con las flechas.
    this.haloCilindros.instanceMatrix = this.cilindros.instanceMatrix;
    this.haloConos.instanceMatrix = this.conos.instanceMatrix;
    for (const m of [this.cilindros, this.conos, this.haloCilindros, this.haloConos]) {
      m.frustumCulled = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    this.cilindros.name = 'flechas-cilindros';
    this.conos.name = 'flechas-conos';
    this.grupo.add(this.haloCilindros, this.haloConos, this.cilindros, this.conos, this.marcas.objeto);
  }

  actualizar(d: InstanciasFlechas): void {
    if (d.n > this.capacidad) throw new Error(`Demasiadas flechas: ${d.n} > ${this.capacidad}`);
    this.datos = d;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const color = new THREE.Color();
    const conoAFlecha = new Uint32Array(d.n + d.nSaturadas);
    let ic = 0;
    for (let i = 0; i < d.n; i++) {
      v.set(d.dir[3 * i] as number, d.dir[3 * i + 1] as number, d.dir[3 * i + 2] as number);
      q.setFromUnitVectors(EJE_Y, v);
      const largo = d.largo[i] as number;
      const cono = d.cono[i] as number;
      const r = d.radio[i] as number;
      const rc = d.radioCono[i] as number;
      p.set(d.cola[3 * i] as number, d.cola[3 * i + 1] as number, d.cola[3 * i + 2] as number);
      s.set(r, Math.max(1e-6, largo - cono), r);
      m.compose(p, q, s);
      this.cilindros.setMatrixAt(i, m);
      color.setRGB(d.gris[i] as number, d.gris[i] as number, d.gris[i] as number, THREE.SRGBColorSpace);
      this.cilindros.setColorAt(i, color);
      const desplazamientos = d.saturada[i] ? [largo - cono, largo - 1.6 * cono] : [largo - cono];
      for (const t of desplazamientos) {
        p.set(
          (d.cola[3 * i] as number) + (d.dir[3 * i] as number) * t,
          (d.cola[3 * i + 1] as number) + (d.dir[3 * i + 1] as number) * t,
          (d.cola[3 * i + 2] as number) + (d.dir[3 * i + 2] as number) * t,
        );
        s.set(rc, cono, rc);
        m.compose(p, q, s);
        this.conos.setMatrixAt(ic, m);
        this.conos.setColorAt(ic, color);
        conoAFlecha[ic] = i;
        ic++;
      }
    }
    this.conoAFlecha = conoAFlecha;
    this.cilindros.count = d.n;
    this.haloCilindros.count = d.n;
    this.conos.count = ic;
    this.haloConos.count = ic;
    this.cilindros.instanceMatrix.needsUpdate = true;
    this.conos.instanceMatrix.needsUpdate = true;
    if (this.cilindros.instanceColor) this.cilindros.instanceColor.needsUpdate = true;
    if (this.conos.instanceColor) this.conos.instanceColor.needsUpdate = true;

    const gris = hexARgb(escena.cero)[0] / 255;
    const ceros = glifosUniformes(d.ceros, FORMA.ROMBO, 9, gris);
    const indef = glifosUniformes(d.indefinidos, FORMA.ASPA, 9, gris);
    this.marcas.actualizar({
      n: ceros.n + indef.n,
      pos: [...Array.from(d.ceros), ...Array.from(d.indefinidos)],
      forma: [...Array.from(ceros.forma), ...Array.from(indef.forma)],
      tam: [...Array.from(ceros.tam), ...Array.from(indef.tam)],
      gris: [...Array.from(ceros.gris), ...Array.from(indef.gris)],
    });
  }

  /** Índice de flecha de una intersección de rayo, o -1. */
  flechaDeInterseccion(objeto: THREE.Object3D, instanceId: number | undefined): number {
    if (instanceId === undefined) return -1;
    if (objeto === this.cilindros) return instanceId;
    if (objeto === this.conos) return this.conoAFlecha[instanceId] ?? -1;
    return -1;
  }

  get instancias(): InstanciasFlechas | null {
    return this.datos;
  }

  setVisible(v: boolean): void {
    this.grupo.visible = v;
  }

  setResolucion(anchoPx: number, altoPx: number, pixelRatio: number): void {
    (this.matHalo.uniforms.uResolucion as THREE.IUniform<THREE.Vector2>).value.set(anchoPx, altoPx);
    (this.matHalo.uniforms.uAncho as THREE.IUniform<number>).value = 1.5 * pixelRatio;
    this.marcas.setResolucion(anchoPx, altoPx, pixelRatio);
  }

  dispose(): void {
    this.cilindros.geometry.dispose();
    this.conos.geometry.dispose();
    (this.cilindros.material as THREE.Material).dispose();
    for (const m of this.conos.material as THREE.Material[]) m.dispose();
    this.matHalo.dispose();
    this.cilindros.dispose();
    this.conos.dispose();
    this.marcas.dispose();
  }
}
