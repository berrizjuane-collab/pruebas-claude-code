/**
 * Controlador de la escena 3D (REN-01): renderizador WebGL2, cámara con z hacia arriba,
 * órbita, transiciones entre vistas, dibujo bajo demanda y capas. Recibe datos planos;
 * no conoce React ni el almacén (PLAN §1.5).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { escena as colores } from '../design/tokens';
import { EJES_PLANO, type Dominio, type Vec3 } from '../math/tipos';
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
  POLAR_MAX,
  POLAR_MIN,
} from './camara';
import type { InstanciasFlechas } from '../geometria/flechas';
import type { GeometriaLineas } from '../geometria/lineas';
import { CapaEjes } from './layers/ejes';
import { CapaFlechas } from './layers/flechas3d';
import { CapaLineas } from './layers/lineas';
import { CapaCorte, type DatosCorte } from './layers/corte';
import type { DatosEscalar } from './layers/escalar';
import { CapaParticulas, type DatosParticulas } from './layers/particulas';
import { CapaRueda, type DatosRueda } from './layers/rueda';
import { CapaSeleccion, type DatosSeleccion } from './layers/seleccion';
import { factorEscalaSprites } from './text/etiquetas';
import {
  acotarElevacion,
  angulosDesdeDireccion,
  dilatar,
  direccion,
  GIRO_PIXEL,
  GIRO_TECLADO,
  suavizarVelocidad,
  velocidadObjetivo,
  type Angulos,
} from './vuelo';

export interface OpcionesControlador {
  movimientoReducido: boolean;
  fuentes?: Promise<void>;
}

export type Proyeccion = 'perspectiva' | 'ortografica';

export interface EstadoCamara {
  posicion: Vec3;
  objetivo: Vec3;
}

/** Lo que hay bajo un punto de la pantalla (INS-01): la intersección más cercana a la cámara. */
export type Seleccion =
  | { tipo: 'flecha'; flecha: number; nodo: number }
  /** Flecha «solo corte»: índice del punto en la rejilla N×N del plano. */
  | { tipo: 'flechaCorte'; flecha: number; nodo: number }
  /** Punto del plano de corte (dentro de su rectángulo). */
  | { tipo: 'corte'; punto: Vec3 };

const FOV = 35;
const DURACION_TRANSICION = 400;

/** Teclas físicas del vuelo (PLAN §3.2): también en distribuciones como AZERTY. */
const TECLAS_VUELO = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyE', 'KeyQ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'ShiftLeft', 'ShiftRight']);

/** Estado de la vista libre (VL-01): pose de vuelo y la pose orbital a la que se vuelve. */
interface EstadoLibre {
  previa: EstadoCamara & { proyeccion: Proyeccion };
  entrada: { posicion: Vec3; angulos: Angulos };
  posicion: Vec3;
  angulos: Angulos;
  velocidad: Vec3;
  teclas: Set<string>;
  /** Rapidez de vuelo en unidades de escena por segundo. */
  rapidez: number;
  /** Dilatación λ (SPEC §3.11) y su centro: un punto fijo (centro de Ω) o el explorador. */
  lambda: number;
  centro: Vec3 | 'camara';
  ultimo: number;
}

export class ControladorEscena {
  readonly renderer: THREE.WebGLRenderer;
  readonly escena = new THREE.Scene();
  readonly camara: THREE.PerspectiveCamera;
  private readonly orto = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
  private proyeccionActual: Proyeccion = 'perspectiva';
  readonly controles: OrbitControls;
  readonly flechas = new CapaFlechas();
  readonly lineas = new CapaLineas();
  readonly corte = new CapaCorte();
  readonly particulas = new CapaParticulas();
  readonly rueda = new CapaRueda();
  readonly seleccion = new CapaSeleccion();
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
  private libre: EstadoLibre | null = null;
  private quitarVuelo: (() => void) | null = null;
  private readonly escuchasRueda = new Set<(signo: 1 | -1) => void>();
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
    this.orto.up.set(0, 0, 1);
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
    this.escena.add(this.ejes.grupo, this.lineas.grupo, this.flechas.grupo, this.corte.grupo, this.particulas.grupo, this.rueda.grupo, this.seleccion.grupo);
    this.observador = new ResizeObserver(() => this.redimensionar());
    this.observador.observe(lienzo.parentElement ?? lienzo);
    this.redimensionar();
    this.fijarDominio(this.dominio, true);
    opciones.fuentes?.then(() => {
      if (this.destruido) return;
      this.ejes.rasterizarDeNuevo();
      this.corte.rerasterizar();
      this.rueda.rerasterizar();
      this.seleccion.rerasterizar();
      this.pedirFotograma();
    });
  }

  fijarMovimientoReducido(reducido: boolean): void {
    this.movimientoReducido = reducido;
    this.controles.enableDamping = !reducido;
    if (reducido) this.transicion = null;
  }

  /** Cambia el dominio: caja, ejes, planos de recorte y, si se pide, el encuadre. */
  fijarDominio(d: Dominio, reencuadrar: boolean, ventana = false): void {
    this.dominio = d;
    // Con la ventana del espacio sin límites, ejes por el origen y sin caja (SPEC §3.11).
    this.ejes.fijarDominio(d, ventana);
    const r = radioDominio(d);
    this.aplicarPlanos();
    this.controles.minDistance = r * 0.3;
    this.controles.maxDistance = r * 12;
    if (reencuadrar && !this.libre) this.irAVista('iso', false);
    this.pedirFotograma();
  }

  /**
   * Planos de recorte: cercano r/200 y lejano 60 r; en la vista libre, el cercano entre λ (la
   * escala del explorador, SPEC §3.11) y el lejano por max(1, 1/λ).
   */
  private aplicarPlanos(): void {
    const r = radioDominio(this.dominio);
    const lambda = this.libre?.lambda ?? 1;
    this.camara.near = r / 200 / lambda;
    this.camara.far = r * 60 * Math.max(1, 1 / lambda);
    this.camara.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ vista libre (VL-01)

  get enVistaLibre(): boolean {
    return this.libre !== null;
  }

  /** Pose de vuelo (pruebas): posición, ángulos, λ y rapidez. */
  get estadoVuelo(): { posicion: Vec3; angulos: Angulos; lambda: number; rapidez: number; velocidad: Vec3 } | null {
    const l = this.libre;
    return l ? { posicion: l.posicion, angulos: l.angulos, lambda: l.lambda, rapidez: l.rapidez, velocidad: l.velocidad } : null;
  }

  /**
   * Entra en la vuelo: guarda la pose orbital y la proyección, desactiva la órbita y vuela
   * desde la pose actual mirando al objetivo.
   */
  entrarVistaLibre(o: { rapidez: number; lambda: number; centro: Vec3 | 'camara' }): void {
    if (this.libre) return;
    this.transicion = null;
    this.anularInercia();
    const previa = { ...this.obtenerCamara(), proyeccion: this.proyeccionActual };
    const p = this.camara.position;
    const t = this.controles.target;
    const posicion: Vec3 = [p.x, p.y, p.z];
    const angulos = angulosDesdeDireccion([t.x - p.x, t.y - p.y, t.z - p.z]);
    this.libre = { previa, entrada: { posicion, angulos }, posicion, angulos, velocidad: [0, 0, 0], teclas: new Set(), rapidez: o.rapidez, lambda: o.lambda, centro: o.centro, ultimo: 0 };
    this.controles.enabled = false;
    this.fijarProyeccion('perspectiva');
    this.aplicarPlanos();
    this.aplicarPoseLibre();
    this.quitarVuelo = this.escucharVuelo();
  }

  /** Sale de la vista libre y restaura exactamente la pose orbital y la proyección de antes (D-65). */
  salirVistaLibre(): void {
    const l = this.libre;
    if (!l) return;
    this.libre = null;
    this.quitarVuelo?.();
    this.quitarVuelo = null;
    this.controles.enabled = true;
    this.aplicarPlanos();
    this.fijarCamara(l.previa);
    this.fijarProyeccion(l.previa.proyeccion);
  }

  /**
   * Tecla de vuelo pulsada o soltada (código físico); devuelve true si es del vuelo. Antes de
   * cambiar el mando se integra hasta este instante: el recorrido corresponde al tiempo que la
   * tecla estuvo pulsada, sea cual sea la frecuencia de fotogramas.
   */
  teclaVuelo(codigo: string, pulsada: boolean): boolean {
    const l = this.libre;
    if (!l || !TECLAS_VUELO.has(codigo)) return false;
    if (pulsada === l.teclas.has(codigo)) return true; // repetición automática del teclado
    const ahora = performance.now();
    if (l.ultimo > 0) this.integrarVuelo(ahora);
    else l.ultimo = ahora;
    if (pulsada) l.teclas.add(codigo);
    else l.teclas.delete(codigo);
    if (l.ultimo === 0) l.ultimo = ahora;
    this.pedirFotograma();
    return true;
  }

  /** Suelta todas las teclas (la ventana pierde el foco). */
  soltarTeclasVuelo(): void {
    this.libre?.teclas.clear();
  }

  fijarRapidezVuelo(rapidez: number): void {
    if (this.libre) this.libre.rapidez = rapidez;
  }

  /** Centro de las dilataciones: el centro de Ω (con la caja) o el explorador (sin límites). */
  fijarCentroDilatacion(centro: Vec3 | 'camara'): void {
    if (this.libre) this.libre.centro = centro;
  }

  /**
   * Dilatación λ (SPEC §3.11): la posición se transforma como la imagen del mundo dilatado
   * alrededor del centro; la velocidad en coordenadas del campo, por λ_antes/λ_después.
   */
  fijarLambda(lambda: number): void {
    const l = this.libre;
    if (!l || lambda === l.lambda) return;
    const f = l.lambda / lambda;
    if (l.centro !== 'camara') l.posicion = dilatar(l.posicion, l.centro, l.lambda, lambda);
    l.velocidad = [l.velocidad[0] * f, l.velocidad[1] * f, l.velocidad[2] * f];
    l.lambda = lambda;
    this.aplicarPlanos();
    this.aplicarPoseLibre();
  }

  volverAPoseEntrada(): void {
    const l = this.libre;
    if (!l) return;
    l.posicion = l.entrada.posicion;
    l.angulos = l.entrada.angulos;
    l.velocidad = [0, 0, 0];
    this.aplicarPoseLibre();
  }

  /** Pasos de la rueda en la vista libre (+1 más rápido, −1 más lento). */
  alRuedaVuelo(fn: (signo: 1 | -1) => void): () => void {
    this.escuchasRueda.add(fn);
    return () => this.escuchasRueda.delete(fn);
  }

  private aplicarPoseLibre(): void {
    const l = this.libre;
    if (!l) return;
    const d = direccion(l.angulos);
    this.camara.position.set(l.posicion[0], l.posicion[1], l.posicion[2]);
    // El objetivo, una unidad por delante: la orientación sale de él (y OrbitControls no actúa).
    this.controles.target.set(l.posicion[0] + d[0], l.posicion[1] + d[1], l.posicion[2] + d[2]);
    this.camara.lookAt(this.controles.target);
    this.pedirFotograma();
    this.notificarCamara();
  }

  /** Arrastre para mirar y rueda para la velocidad, solo en la vista libre. */
  private escucharVuelo(): () => void {
    let previo: { x: number; y: number } | null = null;
    const abajo = (e: PointerEvent) => {
      if (e.button !== 0) return;
      previo = { x: e.clientX, y: e.clientY };
      this.lienzo.setPointerCapture?.(e.pointerId);
    };
    const mover = (e: PointerEvent) => {
      const l = this.libre;
      if (!previo || !l) return;
      const [dx, dy] = [e.clientX - previo.x, e.clientY - previo.y];
      previo = { x: e.clientX, y: e.clientY };
      // Arrastrar a la derecha gira la vista a la derecha (azimut decreciente con z hacia arriba).
      l.angulos = { azimut: l.angulos.azimut - dx * GIRO_PIXEL, elevacion: acotarElevacion(l.angulos.elevacion - dy * GIRO_PIXEL) };
      this.aplicarPoseLibre();
    };
    const arriba = () => {
      previo = null;
    };
    const rueda = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY === 0) return;
      for (const fn of this.escuchasRueda) fn(e.deltaY < 0 ? 1 : -1);
    };
    this.lienzo.addEventListener('pointerdown', abajo);
    this.lienzo.addEventListener('pointermove', mover);
    this.lienzo.addEventListener('pointerup', arriba);
    this.lienzo.addEventListener('pointercancel', arriba);
    this.lienzo.addEventListener('wheel', rueda, { passive: false });
    return () => {
      this.lienzo.removeEventListener('pointerdown', abajo);
      this.lienzo.removeEventListener('pointermove', mover);
      this.lienzo.removeEventListener('pointerup', arriba);
      this.lienzo.removeEventListener('pointercancel', arriba);
      this.lienzo.removeEventListener('wheel', rueda);
    };
  }

  /**
   * Avanza el vuelo hasta `ahora` (SPEC §5.11) en subpasos de 1/60 s (como mucho 0.25 s en
   * total: tras una pausa larga no hay saltos); devuelve true si hay que seguir dibujando.
   */
  private integrarVuelo(ahora: number): boolean {
    const l = this.libre;
    if (!l) return false;
    let resto = l.ultimo > 0 ? Math.min(0.25, Math.max(0, (ahora - l.ultimo) / 1000)) : 0;
    l.ultimo = ahora;
    let seguir: boolean;
    do {
      const dt = Math.min(resto, 1 / 60);
      resto -= dt;
      seguir = this.pasoVuelo(l, dt);
    } while (resto > 1e-9);
    if (!seguir) l.ultimo = 0;
    this.aplicarPoseLibre();
    return seguir;
  }

  /** Un subpaso del vuelo; devuelve false si la cámara queda quieta y sin teclas. */
  private pasoVuelo(l: EstadoLibre, dt: number): boolean {
    const k = l.teclas;
    const eje = (a: string, b: string) => (k.has(a) ? 1 : 0) - (k.has(b) ? 1 : 0);
    const giroAz = eje('ArrowLeft', 'ArrowRight');
    const giroEl = eje('ArrowUp', 'ArrowDown');
    if (giroAz || giroEl) {
      l.angulos = { azimut: l.angulos.azimut + giroAz * GIRO_TECLADO * dt, elevacion: acotarElevacion(l.angulos.elevacion + giroEl * GIRO_TECLADO * dt) };
    }
    const mando = { adelante: eje('KeyW', 'KeyS'), lado: eje('KeyD', 'KeyA'), vertical: eje('KeyE', 'KeyQ'), rapido: k.has('ShiftLeft') || k.has('ShiftRight') };
    const objetivo = velocidadObjetivo(mando, l.angulos, l.rapidez, l.lambda);
    l.velocidad = suavizarVelocidad(l.velocidad, objetivo, dt, this.movimientoReducido);
    const rapidez = Math.hypot(l.velocidad[0], l.velocidad[1], l.velocidad[2]);
    const quieta = k.size === 0 && rapidez < (1e-4 * l.rapidez) / l.lambda;
    if (quieta) l.velocidad = [0, 0, 0];
    else l.posicion = [l.posicion[0] + l.velocidad[0] * dt, l.posicion[1] + l.velocidad[1] * dt, l.posicion[2] + l.velocidad[2] * dt];
    return !quieta;
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

  /** Partículas y estelas del fotograma (o null para ocultarlas). */
  fijarParticulas(d: DatosParticulas | null): void {
    this.particulas.actualizar(d);
    this.pedirFotograma();
  }

  /** Rueda de paletas en P (o null), su ángulo y si está en pausa (flecha curva de sentido). */
  fijarRueda(d: DatosRueda | null): void {
    this.rueda.fijar(d);
    this.pedirFotograma();
  }

  /** Punto inspeccionado P: aro, cruz, rótulo y glifo exacto (o null). */
  fijarSeleccion(d: DatosSeleccion | null): void {
    this.seleccion.fijar(d);
    this.pedirFotograma();
  }

  fijarAnguloRueda(theta: number): void {
    this.rueda.fijarAngulo(theta);
    this.pedirFotograma();
  }

  fijarPausaRueda(pausa: boolean): void {
    this.rueda.fijarPausa(pausa);
    this.pedirFotograma();
  }

  /** Geometría de las líneas de corriente (o null para ocultarlas). */
  fijarLineas(g: GeometriaLineas | null): void {
    this.lineas.actualizar(g);
    this.pedirFotograma();
  }

  /** Vista predefinida, a la distancia de encuadre, con transición si procede. */
  irAVista(vista: Vista, animar = true): void {
    if (this.libre) return;
    const objetivo = centroDominio(this.dominio);
    const radio = distanciaEncuadre(this.dominio, FOV, this.camara.aspect || 1);
    this.transicionA({ radio, ...VISTAS[vista] }, objetivo, animar);
  }

  /**
   * Reencuadra el dominio actual conservando la orientación de la cámara (F4.3): mismo
   * ángulo de vista, objetivo en el centro de Ω y distancia de encuadre.
   */
  reencuadrar(animar = true): void {
    if (this.libre) return;
    const t = this.controles.target;
    const actual = esfericaDesdePosicion([t.x, t.y, t.z], [this.camara.position.x, this.camara.position.y, this.camara.position.z]);
    const radio = distanciaEncuadre(this.dominio, FOV, this.camara.aspect || 1);
    this.transicionA({ radio, polar: actual.polar, azimut: actual.azimut }, centroDominio(this.dominio), animar);
  }

  /**
   * Teclado con la escena enfocada (PLAN §3.1, A11Y-01): orbitar `dAzimut`/`dPolar` grados,
   * sin transición (cada pulsación es un paso). El ángulo polar se mantiene lejos de los polos.
   */
  orbitar(dAzimut: number, dPolar: number): void {
    if (this.libre) return;
    const t = this.controles.target;
    const objetivo: Vec3 = [t.x, t.y, t.z];
    const e = esfericaDesdePosicion(objetivo, [this.camara.position.x, this.camara.position.y, this.camara.position.z]);
    const g = Math.PI / 180;
    this.transicion = null;
    this.anularInercia();
    this.aplicarCamara({ radio: e.radio, polar: Math.min(POLAR_MAX, Math.max(POLAR_MIN, e.polar + dPolar * g)), azimut: e.azimut + dAzimut * g }, objetivo);
  }

  /** Desplaza objetivo y cámara una fracción de la altura visible, en los ejes de la pantalla. */
  desplazar(fx: number, fy: number): void {
    if (this.libre) return;
    this.camara.updateMatrixWorld();
    const d = this.camara.position.distanceTo(this.controles.target);
    const alto = 2 * d * Math.tan(((FOV / 2) * Math.PI) / 180);
    const derecha = new THREE.Vector3().setFromMatrixColumn(this.camara.matrixWorld, 0).multiplyScalar(fx * alto);
    const arriba = new THREE.Vector3().setFromMatrixColumn(this.camara.matrixWorld, 1).multiplyScalar(fy * alto);
    const t = this.controles.target.clone().add(derecha).add(arriba);
    const e = esfericaDesdePosicion([this.controles.target.x, this.controles.target.y, this.controles.target.z], [this.camara.position.x, this.camara.position.y, this.camara.position.z]);
    this.transicion = null;
    this.anularInercia();
    this.aplicarCamara(e, [t.x, t.y, t.z]);
  }

  /** Acerca (factor < 1) o aleja (factor > 1) la cámara del objetivo, dentro de los límites de la órbita. */
  acercar(factor: number): void {
    if (this.libre) return;
    const t = this.controles.target;
    const objetivo: Vec3 = [t.x, t.y, t.z];
    const e = esfericaDesdePosicion(objetivo, [this.camara.position.x, this.camara.position.y, this.camara.position.z]);
    const radio = Math.min(this.controles.maxDistance, Math.max(this.controles.minDistance, e.radio * factor));
    this.transicion = null;
    this.anularInercia();
    this.aplicarCamara({ ...e, radio }, objetivo);
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

  /** Proyección con la que se dibuja (RF-13, tecla 5). La navegación es siempre la de la cámara en perspectiva. */
  get proyeccion(): Proyeccion {
    return this.proyeccionActual;
  }

  fijarProyeccion(p: Proyeccion): void {
    if (p === this.proyeccionActual) return;
    this.proyeccionActual = p;
    this.pedirFotograma();
    this.notificarCamara();
  }

  /**
   * Cámara con la que se dibuja y se proyecta. En ortográfica es una cámara «emparejada» con
   * la de navegación: misma posición y orientación, y semialto d·tan(FOV/2), con d la
   * distancia al objetivo. Así el objetivo se ve del mismo tamaño en las dos proyecciones
   * (mismos píxeles por unidad) y la órbita y el zoom de OrbitControls no cambian.
   */
  private get camaraVista(): THREE.Camera {
    this.camara.updateMatrixWorld();
    if (this.proyeccionActual === 'perspectiva') return this.camara;
    const o = this.orto;
    o.position.copy(this.camara.position);
    o.quaternion.copy(this.camara.quaternion);
    const h = this.camara.position.distanceTo(this.controles.target) * Math.tan(((FOV / 2) * Math.PI) / 180);
    const a = this.camara.aspect || 1;
    o.left = -h * a;
    o.right = h * a;
    o.top = h;
    o.bottom = -h;
    o.near = this.camara.near;
    o.far = this.camara.far;
    o.updateProjectionMatrix();
    o.updateMatrixWorld();
    return o;
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

  /**
   * Auditoría de la escena (VIS-05, DESIGN §9.1 «Prohibido en la escena»): luces, niebla,
   * tipos de material y materiales transparentes de los objetos visibles.
   */
  auditarEscena(): { luces: number; niebla: boolean; materiales: Record<string, number>; transparentes: string[]; conLuz: string[] } {
    let luces = 0;
    const materiales: Record<string, number> = {};
    const transparentes = new Set<string>();
    const conLuz = new Set<string>();
    this.escena.traverseVisible((o) => {
      if ((o as THREE.Light).isLight) luces++;
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) {
        materiales[mat.type] = (materiales[mat.type] ?? 0) + 1;
        if (mat.transparent) transparentes.add(o.name || mat.type);
        // Materiales que se iluminan: prohibidos (la luminancia ya codifica la magnitud).
        if (/Lambert|Phong|Standard|Physical|Toon/.test(mat.type)) conLuz.add(o.name || mat.type);
      }
    });
    return { luces, niebla: this.escena.fog !== null, materiales, transparentes: [...transparentes].sort(), conLuz: [...conLuz] };
  }

  /**
   * Longitud proyectada en pantalla (px CSS) del cono de cada flecha y su distancia a la cámara
   * (VV-05): base y vértice del cono proyectados.
   */
  conosProyectados(): { largo: number; distancia: number; escorzo: number; fraccion: number }[] {
    const inst = this.flechas.instancias;
    if (!inst || !this.flechas.grupo.visible) return [];
    const vista = this.camaraVista;
    const res: { largo: number; distancia: number; escorzo: number; fraccion: number }[] = [];
    // ℓ de la flecha más larga: con escala proporcional, ℓ/ℓmax = min(‖F‖/F_ref, 1).
    let lMax = 0;
    for (let i = 0; i < inst.n; i++) lMax = Math.max(lMax, inst.largo[i] as number);
    const rayo = new THREE.Vector3();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (let i = 0; i < inst.n; i++) {
      const l = inst.largo[i] as number;
      const c = inst.cono[i] as number;
      for (let k = 0; k < 3; k++) {
        a.setComponent(k, (inst.cola[3 * i + k] as number) + (inst.dir[3 * i + k] as number) * (l - c));
        b.setComponent(k, (inst.cola[3 * i + k] as number) + (inst.dir[3 * i + k] as number) * l);
      }
      const distancia = a.distanceTo(this.camara.position);
      // Escorzo: ángulo (0–90°) entre la flecha y el rayo de vista; 90° = paralela a la pantalla.
      rayo.subVectors(a, this.camara.position).normalize();
      const cos = Math.abs(rayo.x * (inst.dir[3 * i] as number) + rayo.y * (inst.dir[3 * i + 1] as number) + rayo.z * (inst.dir[3 * i + 2] as number));
      const escorzo = (Math.acos(Math.min(1, cos)) * 180) / Math.PI;
      a.project(vista);
      b.project(vista);
      const dx = ((b.x - a.x) / 2) * this.anchoCss;
      const dy = ((b.y - a.y) / 2) * this.altoCss;
      res.push({ largo: Math.hypot(dx, dy), distancia, escorzo, fraccion: lMax > 0 ? l / lMax : 0 });
    }
    return res;
  }

  /** Flecha k tal como se envía a la GPU: de la rejilla o, con `seleccion`, el glifo exacto en P. */
  flechaDibujada(k: number, seleccion = false) {
    return (seleccion ? this.seleccion.flecha : this.flechas).dibujada(k);
  }

  /** Posición en pantalla (px CSS relativos al lienzo) de un punto del dominio. */
  proyectar(p: Vec3): [number, number] {
    this.camara.updateMatrixWorld();
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.camaraVista);
    return [((v.x + 1) / 2) * this.anchoCss, ((1 - v.y) / 2) * this.altoCss];
  }

  /** Direcciones en pantalla (x a la derecha, y arriba) de los ejes x, y, z, para el triedro. */
  direccionesEjes(): [number, number, number][] {
    // La matriz del mundo solo se actualiza al dibujar: tras fijar la cámara de golpe, estaría atrasada.
    this.camara.updateMatrixWorld();
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

  /**
   * Lo que hay bajo un punto de la pantalla (coordenadas CSS relativas al lienzo), INS-01: una
   * flecha del volumen, una flecha «solo corte» o el plano de corte, la más cercana a la cámara.
   */
  elegir(xCss: number, yCss: number): Seleccion | null {
    const ndc = new THREE.Vector2((xCss / this.anchoCss) * 2 - 1, -(yCss / this.altoCss) * 2 + 1);
    const rayo = new THREE.Raycaster();
    this.camara.updateMatrixWorld();
    rayo.setFromCamera(ndc, this.camaraVista);
    let mejor: { distancia: number; sel: Seleccion } | null = null;
    const proponer = (distancia: number, sel: Seleccion) => {
      if (!mejor || distancia < mejor.distancia) mejor = { distancia, sel };
    };
    for (const [capa, tipo] of [
      [this.flechas, 'flecha'],
      [this.corte.flechas, 'flechaCorte'],
    ] as const) {
      const inst = capa.instancias;
      if (!inst || !capa.grupo.visible || !capa.grupo.parent?.visible) continue;
      for (const i of rayo.intersectObjects([capa.conos, capa.cilindros], false)) {
        const f = capa.flechaDeInterseccion(i.object, i.instanceId);
        if (f >= 0) {
          proponer(i.distance, { tipo, flecha: f, nodo: inst.nodo[f] as number });
          break;
        }
      }
    }
    const plano = this.corte.planoActivo;
    if (plano) {
      const k = EJES_PLANO[plano.plano].n;
      const o = rayo.ray.origin.getComponent(k);
      const d = rayo.ray.direction.getComponent(k);
      if (Math.abs(d) > 1e-12) {
        const t = (plano.c - o) / d;
        if (t > 0) {
          const p = rayo.ray.at(t, new THREE.Vector3());
          const q: [number, number, number] = [p.x, p.y, p.z];
          q[k] = plano.c;
          const dentro = [0, 1, 2].every((j) => j === k || (q[j] >= (plano.dominio.min[j] as number) && q[j] <= (plano.dominio.max[j] as number)));
          if (dentro) proponer(t, { tipo: 'corte', punto: q });
        }
      }
    }
    return (mejor as { distancia: number; sel: Seleccion } | null)?.sel ?? null;
  }

  /** Teclas pulsadas con el lienzo enfocado (Alt + flechas mueve P, Esc lo descarta). */
  alTecla(fn: (e: KeyboardEvent) => void): () => void {
    this.lienzo.addEventListener('keydown', fn);
    return () => this.lienzo.removeEventListener('keydown', fn);
  }

  /** Clics sobre el lienzo (sin arrastre): para elegir P (INS-01). */
  alClic(fn: (xCss: number, yCss: number) => void): () => void {
    let inicio: { x: number; y: number; t: number } | null = null;
    const abajo = (e: PointerEvent) => {
      inicio = e.button === 0 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
    };
    const arriba = (e: PointerEvent) => {
      if (!inicio || e.button !== 0) return;
      const movido = Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y);
      const rapido = performance.now() - inicio.t < 600;
      inicio = null;
      if (movido > 4 || !rapido) return;
      const r = this.lienzo.getBoundingClientRect();
      fn(e.clientX - r.left, e.clientY - r.top);
    };
    this.lienzo.addEventListener('pointerdown', abajo);
    this.lienzo.addEventListener('pointerup', arriba);
    return () => {
      this.lienzo.removeEventListener('pointerdown', abajo);
      this.lienzo.removeEventListener('pointerup', arriba);
    };
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
    // En la vista libre no actúa OrbitControls: su distancia mínima movería la cámara.
    if (this.libre) {
      if (this.integrarVuelo(t)) seguir = true;
    } else if (this.controles.update()) seguir = true;
    this.dibujar();
    if (seguir) this.pedirFotograma();
  }

  /** Dibuja la escena inmediatamente. */
  dibujar(): void {
    const vista = this.camaraVista;
    const k = factorEscalaSprites(vista, this.altoCss);
    this.ejes.ajustar(k, this.anchoCss, this.altoCss, vista);
    this.flechas.orientarAnillos(this.camara.position);
    this.corte.ajustar(vista, k, this.pixelesPorUnidad(), this.anchoCss, this.altoCss);
    this.rueda.ajustar(vista, k, this.pixelesPorUnidad());
    this.seleccion.ajustar(k, this.pixelesPorUnidad(), this.anchoCss, this.altoCss);
    this.seleccion.flecha.orientarAnillos(this.camara.position);
    this.renderer.render(this.escena, vista);
    this.fotogramasDibujados++;
  }

  private redimensionar(): void {
    const padre = this.lienzo.parentElement ?? this.lienzo;
    this.aplicarTamano(Math.max(1, padre.clientWidth), Math.max(1, padre.clientHeight), Math.min(2, window.devicePixelRatio || 1));
    this.pedirFotograma();
  }

  /** Tamaño del dibujo en px CSS y px reales por px CSS: renderer, cámara y todo lo que depende de la resolución. */
  private aplicarTamano(w: number, h: number, pixelRatio: number): void {
    this.anchoCss = w;
    this.altoCss = h;
    this.pixelRatio = pixelRatio;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(w, h, false);
    this.camara.aspect = w / h;
    this.camara.updateProjectionMatrix();
    this.flechas.setResolucion(w * pixelRatio, h * pixelRatio, pixelRatio);
    this.lineas.setResolucion(w, h, pixelRatio);
    this.corte.setResolucion(w * pixelRatio, h * pixelRatio, pixelRatio);
    this.particulas.setResolucion(w * pixelRatio, h * pixelRatio, pixelRatio);
    this.rueda.setResolucion(w * pixelRatio, h * pixelRatio, pixelRatio);
    this.seleccion.setResolucion(w * pixelRatio, h * pixelRatio, pixelRatio);
  }

  /** Tamaño del lienzo en pantalla: px CSS y px reales por px CSS («como en pantalla», EXP-03). */
  get tamanoPantalla(): { ancho: number; alto: number; pixelRatio: number } {
    return { ancho: this.anchoCss, alto: this.altoCss, pixelRatio: this.pixelRatio };
  }

  /**
   * Imagen de la escena a `ancho` × `alto` px reales con `escala` px por px CSS (EXP-03): se
   * vuelve a dibujar a ese tamaño (glifos, líneas y rótulos con su tamaño en px CSS por
   * `escala`), se copia en la misma tarea (sin `preserveDrawingBuffer`) y se restaura el
   * tamaño de pantalla. La cámara es la misma; solo cambia el encuadre horizontal si cambia
   * la proporción.
   */
  capturar(ancho: number, alto: number, escala: number): HTMLCanvasElement {
    const previo = [this.anchoCss, this.altoCss, this.pixelRatio] as const;
    const copia = document.createElement('canvas');
    copia.width = ancho;
    copia.height = alto;
    try {
      this.aplicarTamano(ancho / escala, alto / escala, escala);
      this.dibujar();
      const ctx = copia.getContext('2d');
      if (!ctx) throw new Error('Sin contexto 2D para copiar la escena');
      ctx.drawImage(this.renderer.domElement, 0, 0, ancho, alto);
    } finally {
      this.aplicarTamano(...previo);
      this.dibujar();
    }
    return copia;
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
      particulas: this.particulas.estadisticas,
      rueda: this.rueda.estadisticas,
      seleccion: this.seleccion.estadisticas,
      tamano: [this.anchoCss, this.altoCss, this.pixelRatio],
      camara: this.obtenerCamara(),
      proyeccion: this.proyeccionActual,
    };
  }

  dispose(): void {
    this.destruido = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.observador.disconnect();
    this.quitarVuelo?.();
    this.controles.dispose();
    this.flechas.dispose();
    this.lineas.dispose();
    this.corte.dispose();
    this.particulas.dispose();
    this.rueda.dispose();
    this.seleccion.dispose();
    this.ejes.dispose();
    this.renderer.dispose();
  }
}
