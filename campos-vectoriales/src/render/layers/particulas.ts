/**
 * Capa de partículas (REN-08, DESIGN §9.1): punto `#F5F5F5` con halo en la posición actual y
 * estela `#8C8C8C` de las últimas posiciones que se estrecha con la antigüedad (más fina =
 * más antigua). La estela se dibuja con cuadriláteros en espacio de pantalla, con anchura
 * propia en cada extremo; es opaca (sin transparencias que alteren la luminancia).
 */
import * as THREE from 'three';
import { hexARgb } from '../../design/color';
import { escena } from '../../design/tokens';
import { CapaGlifos, FORMA } from '../glifos';

/** Lo que la capa necesita del sistema de partículas (numerics/particles). */
export interface DatosParticulas {
  n: number;
  largoEstela: number;
  /** Posición actual (3n). */
  pos: ArrayLike<number>;
  /** Estela en anillo: para la partícula i, largoEstela posiciones; la más reciente en `cabeza`. */
  estela: ArrayLike<number>;
  cabeza: number;
  /** Posiciones válidas de la estela de cada partícula. */
  llenado: ArrayLike<number>;
}

/** Anchura de la estela en px CSS: de la cabeza a la cola. */
const ANCHO_ESTELA: [number, number] = [2.5, 0.5];
const TAM_PUNTO = 5;

const vertice = /* glsl */ `
attribute vec3 aInicio;
attribute vec3 aFin;
attribute vec2 aAncho;
uniform vec2 uResolucion;
uniform float uPixelRatio;
void main() {
  // position.x ∈ {0, 1}: extremo; position.y ∈ {−1, 1}: lado.
  vec4 a = projectionMatrix * modelViewMatrix * vec4(aInicio, 1.0);
  vec4 b = projectionMatrix * modelViewMatrix * vec4(aFin, 1.0);
  vec2 sa = a.xy / a.w * uResolucion * 0.5;
  vec2 sb = b.xy / b.w * uResolucion * 0.5;
  vec2 d = sb - sa;
  float l = length(d);
  d = l > 1e-6 ? d / l : vec2(1.0, 0.0);
  vec2 normal = vec2(-d.y, d.x);
  float t = position.x;
  vec4 c = mix(a, b, t);
  float w = 0.5 * mix(aAncho.x, aAncho.y, t) * uPixelRatio;
  // Medio ancho de más en cada extremo: las uniones entre tramos no dejan huecos.
  vec2 desplazamiento = normal * position.y * w + d * (2.0 * t - 1.0) * w;
  c.xy += desplazamiento / (uResolucion * 0.5) * c.w;
  gl_Position = c;
}`;

const fragmento = /* glsl */ `
uniform vec3 uColor;
void main() { gl_FragColor = vec4(uColor, 1.0); }`;

export class CapaParticulas {
  readonly grupo = new THREE.Group();
  private readonly estela: THREE.Mesh;
  private readonly geometria: THREE.InstancedBufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly puntos = new CapaGlifos({ orden: 4, sesgo: 0.01 });
  private capacidad = 0;
  private inicio = new Float32Array(0);
  private fin = new Float32Array(0);
  private ancho = new Float32Array(0);
  private tramos = 0;
  private n = 0;

  constructor() {
    const [r, g, b] = hexARgb(escena.estela);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uResolucion: { value: new THREE.Vector2(1, 1) },
        uPixelRatio: { value: 1 },
        uColor: { value: new THREE.Vector3(r / 255, g / 255, b / 255) },
      },
      vertexShader: vertice,
      fragmentShader: fragmento,
    });
    this.geometria = new THREE.InstancedBufferGeometry();
    // Cuadrilátero: (extremo, lado) en los cuatro vértices, dos triángulos.
    this.geometria.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    this.geometria.setIndex([0, 1, 2, 0, 2, 3]);
    this.reservar(400 * 11);
    this.estela = new THREE.Mesh(this.geometria, this.material);
    this.estela.frustumCulled = false;
    this.estela.name = 'particulas-estela';
    this.estela.renderOrder = 1;
    this.grupo.add(this.estela, this.puntos.objeto);
    this.grupo.visible = false;
  }

  private reservar(tramos: number): void {
    if (tramos <= this.capacidad) return;
    this.capacidad = tramos;
    this.inicio = new Float32Array(3 * tramos);
    this.fin = new Float32Array(3 * tramos);
    this.ancho = new Float32Array(2 * tramos);
    this.geometria.setAttribute('aInicio', new THREE.InstancedBufferAttribute(this.inicio, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometria.setAttribute('aFin', new THREE.InstancedBufferAttribute(this.fin, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometria.setAttribute('aAncho', new THREE.InstancedBufferAttribute(this.ancho, 2).setUsage(THREE.DynamicDrawUsage));
  }

  /** Copia posiciones y estelas (cada fotograma de la animación). */
  actualizar(d: DatosParticulas | null): void {
    if (!d || d.n === 0) {
      this.grupo.visible = false;
      this.n = 0;
      this.tramos = 0;
      return;
    }
    const L = d.largoEstela;
    this.reservar(d.n * (L - 1));
    let k = 0;
    for (let i = 0; i < d.n; i++) {
      const llenas = d.llenado[i] as number;
      for (let j = 0; j + 1 < llenas; j++) {
        // Edad j (0 = la más reciente) hacia j + 1; la anchura baja linealmente con la edad.
        const a = 3 * (i * L + ((d.cabeza - j + L) % L));
        const b = 3 * (i * L + ((d.cabeza - j - 1 + L) % L));
        for (let c = 0; c < 3; c++) {
          this.inicio[3 * k + c] = d.estela[a + c] as number;
          this.fin[3 * k + c] = d.estela[b + c] as number;
        }
        const w = (e: number) => ANCHO_ESTELA[0] + ((ANCHO_ESTELA[1] - ANCHO_ESTELA[0]) * e) / (L - 2 || 1);
        this.ancho[2 * k] = w(j);
        this.ancho[2 * k + 1] = w(j + 1);
        k++;
      }
    }
    this.tramos = k;
    this.geometria.instanceCount = k;
    for (const nombre of ['aInicio', 'aFin', 'aAncho']) (this.geometria.getAttribute(nombre) as THREE.InstancedBufferAttribute).needsUpdate = true;
    const gris = hexARgb(escena.particula)[0] / 255;
    this.puntos.actualizar({
      n: d.n,
      pos: d.pos,
      forma: new Float32Array(d.n).fill(FORMA.CIRCULO),
      tam: new Float32Array(d.n).fill(TAM_PUNTO),
      gris: new Float32Array(d.n).fill(gris),
    });
    this.n = d.n;
    this.grupo.visible = true;
  }

  setVisible(v: boolean): void {
    this.grupo.visible = v && this.n > 0;
  }

  setResolucion(anchoPx: number, altoPx: number, pixelRatio: number): void {
    (this.material.uniforms.uResolucion as THREE.IUniform<THREE.Vector2>).value.set(anchoPx, altoPx);
    (this.material.uniforms.uPixelRatio as THREE.IUniform<number>).value = pixelRatio;
    this.puntos.setResolucion(anchoPx, altoPx, pixelRatio);
  }

  get estadisticas() {
    return { visible: this.grupo.visible, particulas: this.n, tramos: this.tramos };
  }

  dispose(): void {
    this.geometria.dispose();
    this.material.dispose();
    this.puntos.dispose();
  }
}
