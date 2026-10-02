/**
 * Controlador de la escena 3D (REN-01): renderizador WebGL2, cámara con z hacia arriba,
 * órbita, transiciones entre vistas, dibujo bajo demanda y capas. Recibe datos planos;
 * no conoce React ni el almacén (PLAN §1.5).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { escena as colores } from '../design/tokens';
import type { Dominio, Vec3 } from '../math/tipos';
import {
  VISTAS,
  centroDominio,
  distanciaEncuadre,
  esfericaDesdePosicion,
  interpolarEsferica,
  posicionDesdeEsferica,
  radioDominio,
  suavizado,
  type Esferica,
  type Vista,
} from './camara';
import type { InstanciasFlechas } from '../geometria/flechas';
import type { GeometriaLineas } from '../geometria/lineas';
import { CapaEjes } from './layers/ejes';
import { CapaFlechas } from './layers/flechas3d';
import { CapaLineas } from './layers/lineas';
import { CapaCorte, type DatosCorte } from './layers/corte';
import type { DatosEscalar } from './layers/escalar';
import { factorEscalaSprites } from './text/etiquetas';

export interface OpcionesControlador {
  movimientoReducido: boolean;
  fuentes?: Promise<void>;
}

export interface EstadoCamara {
  posicion: Vec3;
  objetivo: Vec3;
}

export interface Seleccion {
  tipo: 'flecha';
  flecha: number;
  nodo: number;
}

const FOV = 35;
const DURACION_TRANSICION = 400;

export class ControladorEscena {
  readonly renderer: THREE.WebGLRenderer;
  readonly escena = new THREE.Scene();
  readonly camara: THREE.PerspectiveCamera;
  readonly controles: OrbitControls;
  readonly flechas = new CapaFlechas();
  readonly lineas = new CapaLineas();
  readonly corte = new CapaCorte();
  private readonly ejes = new CapaEjes();
  private dominio: Dominio = { min: [-2, -2, -2], max: [2, 2, 2] };
  private raf = 0;
  private fotogramasDibujados = 0;
  private transicion: {
    desde: Esferica;
    hasta: Esferica;
    objDesde: Vec3;
    objHasta: Vec3;
    t0: number;
  } | null = null;
  private readonly observador: ResizeObserver;
  private readonly escuchasCamara = new Set<() => void>();
  private anchoCss = 1;
  private altoCss = 1;
  private pixelRatio = 1;
  private destruido = false;
  movimientoReducido: boolean;

  constructor(
    private readonly lienzo: HTMLCanvasElement,
    opciones: OpcionesControlador,
  ) {
    this.movimientoReducido = opciones.movimientoReducido;
    this.renderer = new THREE.WebGLRenderer({
      canvas: lienzo,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.setClearColor(new THREE.Color().setStyle(colores.fondo, THREE.SRGBColorSpace), 1);
    this.camara = new THREE.PerspectiveCamera(FOV, 1, 0.01, 1000);
    this.camara.up.set(0, 0, 1);
    this.controles = new OrbitControls(this.camara, lienzo);
    this.controles.enableDamping = !this.movimientoReducido;
    this.controles.dampingFactor = 0.14;
    this.controles.rotateSpeed = 0.8;
    this.controles.addEventListener('change', () => {
      this.pedirFotograma();
      this.notificarCamara();
    });
    this.controles.addEventListener('start', () => {
      this.transicion = null;
    });
    // Las líneas, antes que las flechas: con ambas capas, las flechas quedan encima (DESIGN §9.4).
    this.escena.add(this.ejes.grupo, this.lineas.grupo, this.flechas.grupo, this.corte.grupo);
    this.observador = new ResizeObserver(() => this.redimensionar());
    this.observador.observe(lienzo.parentElement ?? lienzo);
    this.redimensionar();
    this.fijarDominio(this.dominio, true);
    opciones.fuentes?.then(() => {
      if (this.destruido) return;
      this.ejes.rasterizarDeNuevo();
      this.corte.rerasterizar();
      this.pedirFotograma();
    });
  }

  fijarMovimientoReducido(reducido: boolean): void {
    this.movimientoReducido = reducido;
    this.controles.enableDamping = !reducido;
    if (reducido) this.transicion = null;
  }

  /** Cambia el dominio: caja, ejes, planos de recorte y, si se pide, el encuadre. */
  fijarDominio(d: Dominio, reencuadrar: boolean): void {
    this.dominio = d;
    this.ejes.fijarDominio(d);
    const r = radioDominio(d);
    this.camara.near = r / 200;
    this.camara.far = r * 60;
    this.camara.updateProjectionMatrix();
    this.controles.minDistance = r * 0.3;
    this.controles.maxDistance = r * 12;
    if (reencuadrar) this.irAVista('iso', false);
    this.pedirFotograma();
  }

  fijarFlechas(inst: InstanciasFlechas | null): void {
    if (inst) this.flechas.actualizar(inst);
    this.flechas.setVisible(!!inst);
    this.pedirFotograma();
  }

  /** Plano de corte (o null) y sus flechas «solo corte» (o null para no dibujarlas). */
  fijarCorte(d: DatosCorte | null, flechas: InstanciasFlechas | null): void {
    this.corte.fijar(d, flechas);
    this.pedirFotograma();
  }

  /** Mapa escalar sobre el corte (REN-06) o null. */
  fijarEscalarCorte(d: DatosEscalar | null): void {
    this.corte.fijarEscalar(d);
    this.pedirFotograma();
  }

  /** Geometría de las líneas de corriente (o null para ocultarlas). */
  fijarLineas(g: GeometriaLineas | null): void {
    this.lineas.actualizar(g);
    this.pedirFotograma();
  }

  /** Vista predefinida, a la distancia de encuadre, con transición si procede. */
  irAVista(vista: Vista, animar = true): void {
    const objetivo = centroDominio(this.dominio);
    const radio = distanciaEncuadre(this.dominio, FOV, this.camara.aspect || 1);
    this.transicionA({ radio, ...VISTAS[vista] }, objetivo, animar);
  }

  /**
   * Reencuadra el dominio actual conservando la orientación de la cámara (F4.3): mismo
   * ángulo de vista, objetivo en el centro de Ω y distancia de encuadre.
   */
  reencuadrar(animar = true): void {
    const t = this.controles.target;
    const actual = esfericaDesdePosicion([t.x, t.y, t.z], [this.camara.position.x, this.camara.position.y, this.camara.position.z]);
    const radio = distanciaEncuadre(this.dominio, FOV, this.camara.aspect || 1);
    this.transicionA({ radio, polar: actual.polar, azimut: actual.azimut }, centroDominio(this.dominio), animar);
  }

  /** Encuadra el dominio en la vista isométrica (tecla R). */
  encuadrar(animar = true): void {
    this.irAVista('iso', animar);
  }

  /**
   * Anula la inercia de la órbita sin aplicarla. OrbitControls conserva el giro pendiente de
   * la amortiguación y lo seguiría aplicando sobre una pose fijada por programa (deshacer,
   * encuadrar), que entonces no quedaría exacta (hallazgo de UI-05).
   */
  private anularInercia(): void {
    const c = this.controles as unknown as { _sphericalDelta?: { set(r: number, phi: number, theta: number): void }; _panOffset?: { set(x: number, y: number, z: number): void } };
    c._sphericalDelta?.set(0, 0, 0);
    c._panOffset?.set(0, 0, 0);
  }

  private transicionA(hasta: Esferica, objetivo: Vec3, animar: boolean): void {
    this.anularInercia();
    const objActual: Vec3 = [this.controles.target.x, this.controles.target.y, this.controles.target.z];
    const desde = esfericaDesdePosicion(objActual, [this.camara.position.x, this.camara.position.y, this.camara.position.z]);
    if (!animar || this.movimientoReducido) {
      this.transicion = null;
      this.aplicarCamara(hasta, objetivo);
      return;
    }
    this.transicion = { desde, hasta, objDesde: objActual, objHasta: objetivo, t0: performance.now() };
    this.pedirFotograma();
  }

  private aplicarCamara(e: Esferica, objetivo: Vec3): void {
    const p = posicionDesdeEsferica(objetivo, e);
    this.controles.target.set(objetivo[0], objetivo[1], objetivo[2]);
    this.camara.position.set(p[0], p[1], p[2]);
    this.camara.lookAt(this.controles.target);
    this.controles.update();
    this.pedirFotograma();
    this.notificarCamara();
  }

  obtenerCamara(): EstadoCamara {
    const p = this.camara.position;
    const t = this.controles.target;
    return { posicion: [p.x, p.y, p.z], objetivo: [t.x, t.y, t.z] };
  }

  fijarCamara(c: EstadoCamara): void {
    this.transicion = null;
    this.anularInercia();
    this.controles.target.set(...c.objetivo);
    this.camara.position.set(...c.posicion);
    this.controles.update();
    this.pedirFotograma();
    this.notificarCamara();
  }

  /** Píxeles CSS por unidad del dominio a la distancia del objetivo (flecha de referencia de la leyenda). */
  pixelesPorUnidad(): number {
    const d = this.camara.position.distanceTo(this.controles.target);
    const focal = this.altoCss / 2 / Math.tan(((FOV / 2) * Math.PI) / 180);
    return d > 0 ? focal / d : 0;
  }

  /** Posición en pantalla (px CSS relativos al lienzo) de un punto del dominio. */
  proyectar(p: Vec3): [number, number] {
    this.camara.updateMatrixWorld();
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.camara);
    return [((v.x + 1) / 2) * this.anchoCss, ((1 - v.y) / 2) * this.altoCss];
  }

  /** Direcciones en pantalla (x a la derecha, y arriba) de los ejes x, y, z, para el triedro. */
  direccionesEjes(): [number, number, number][] {
    const inv = new THREE.Matrix4().copy(this.camara.matrixWorld).invert();
    return [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].map((e) => {
      const v = e.transformDirection(inv);
      return [v.x, v.y, v.z];
    });
  }

  alCambiarCamara(fn: () => void): () => void {
    this.escuchasCamara.add(fn);
    return () => this.escuchasCamara.delete(fn);
  }

  private notificarCamara(): void {
    for (const fn of this.escuchasCamara) fn();
  }

  /** Flecha bajo un punto de la pantalla (coordenadas CSS relativas al lienzo). */
  elegir(xCss: number, yCss: number): Seleccion | null {
    const ndc = new THREE.Vector2((xCss / this.anchoCss) * 2 - 1, -(yCss / this.altoCss) * 2 + 1);
    const rayo = new THREE.Raycaster();
    rayo.setFromCamera(ndc, this.camara);
    const impactos = rayo.intersectObjects([this.flechas.conos, this.flechas.cilindros], false);
    for (const i of impactos) {
      const f = this.flechas.flechaDeInterseccion(i.object, i.instanceId);
      const inst = this.flechas.instancias;
      if (f >= 0 && inst) return { tipo: 'flecha', flecha: f, nodo: inst.nodo[f] as number };
    }
    return null;
  }

  pedirFotograma(): void {
    if (this.raf || this.destruido) return;
    this.raf = requestAnimationFrame((t) => this.fotograma(t));
  }

  private fotograma(t: number): void {
    this.raf = 0;
    let seguir = false;
    if (this.transicion) {
      const tr = this.transicion;
      const u = Math.min(1, (t - tr.t0) / DURACION_TRANSICION);
      const k = suavizado(Math.max(0, u));
      const obj: Vec3 = [0, 1, 2].map((i) => tr.objDesde[i]! + (tr.objHasta[i]! - tr.objDesde[i]!) * k) as unknown as Vec3;
      const e = interpolarEsferica(tr.desde, tr.hasta, k);
      const p = posicionDesdeEsferica(obj, e);
      this.controles.target.set(obj[0], obj[1], obj[2]);
      this.camara.position.set(p[0], p[1], p[2]);
      this.notificarCamara();
      if (u >= 1) this.transicion = null;
      else seguir = true;
    }
    if (this.controles.update()) seguir = true;
    this.dibujar();
    if (seguir) this.pedirFotograma();
  }

  /** Dibuja la escena inmediatamente. */
  dibujar(): void {
    const k = factorEscalaSprites(this.camara, this.altoCss);
    this.ejes.ajustar(k, this.anchoCss, this.altoCss, this.camara);
    this.corte.ajustar(this.camara, k, this.pixelesPorUnidad(), this.anchoCss, this.altoCss);
    this.renderer.render(this.escena, this.camara);
    this.fotogramasDibujados++;
  }

  private redimensionar(): void {
    const padre = this.lienzo.parentElement ?? this.lienzo;
    const w = Math.max(1, padre.clientWidth);
    const h = Math.max(1, padre.clientHeight);
    this.anchoCss = w;
    this.altoCss = h;
    this.pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.camara.aspect = w / h;
    this.camara.updateProjectionMatrix();
    this.flechas.setResolucion(w * this.pixelRatio, h * this.pixelRatio, this.pixelRatio);
    this.lineas.setResolucion(w, h, this.pixelRatio);
    this.corte.setResolucion(w * this.pixelRatio, h * this.pixelRatio, this.pixelRatio);
    this.pedirFotograma();
  }

  estadisticas() {
    return {
      fotogramas: this.fotogramasDibujados,
      flechas: this.flechas.cilindros.count,
      flechasVisibles: this.flechas.grupo.visible,
      rotulosEjes: this.ejes.rotulosVisibles,
      conos: this.flechas.conos.count,
      lineas: this.lineas.estadisticas,
      corte: this.corte.estadisticas,
      tamano: [this.anchoCss, this.altoCss, this.pixelRatio],
      camara: this.obtenerCamara(),
    };
  }

  dispose(): void {
    this.destruido = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.observador.disconnect();
    this.controles.dispose();
    this.flechas.dispose();
    this.lineas.dispose();
    this.corte.dispose();
    this.ejes.dispose();
    this.renderer.dispose();
  }
}
