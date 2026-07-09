// ============================================================================
// Polvo gravitacional. Dos poblaciones en un mismo buffer:
//   [0, roomCount)    → dentro de la habitación ancla (interactivo + Morse)
//   [roomCount, N)    → ambiente del pasillo (deriva, envuelve en caja grande)
//
// Fuerzas: pseudo-curl de ruido de gradiente (divergencia ~0), pozos de
// gravedad del puntero (atracción + remolino tangencial), amortiguación,
// contención suave. La señal: al acumular suficiente energía de perturbación,
// las partículas de la habitación reciben blancos con resorte crítico y se
// auto-organizan en barras Morse sobre el piso — "S T A Y" — y se dispersan.
// Nada precocinado: los resortes conviven con las demás fuerzas en vivo.
// ============================================================================

import * as THREE from 'three';
import { noise3, curlXZ } from './noise.js';

const MORSE = { S: '...', T: '-', A: '.-', Y: '-.--' };

/** Barras sobre el piso: punto = barra corta, raya = 3× (timing Morse real). */
export function morseBars(word = 'STAY') {
  const u = 0.082, zHalf = 0.34;
  let x = 0;
  const bars = [];
  for (const ch of word) {
    for (const sym of MORSE[ch]) {
      const w = sym === '.' ? u : 3 * u;
      bars.push({ x0: x, x1: x + w, z0: -zHalf, z1: zHalf, dash: sym === '-' });
      x += w + u;
    }
    x += 2 * u;
  }
  const total = x - 3 * u;
  for (const b of bars) { b.x0 -= total / 2; b.x1 -= total / 2; }
  return bars;
}

const ROOM_HALF = 1.62;     // contención (la habitación ancla mide ±1.7)
const AMBIENT_HALF = 13;    // caja de ambiente
const FLOOR_Y = -1.58;

export class DustField {
  constructor(maxCount) {
    this.max = maxCount;
    this.count = maxCount;
    this.roomCount = Math.floor(maxCount * 0.68);
    this.pos = new Float32Array(maxCount * 3);
    this.vel = new Float32Array(maxCount * 3);
    this.bri = new Float32Array(maxCount);
    this.targets = new Float32Array(maxCount * 2); // (x, z) sobre el piso
    this.hasTarget = new Uint8Array(maxCount);
    this.morseK = 0;         // rigidez actual del resorte (0 = sin señal)
    this.phase = 0;
    this._c = [0, 0, 0];

    const r = () => Math.random() * 2 - 1;
    for (let i = 0; i < maxCount; i++) {
      const inRoom = i < this.roomCount;
      const h = inRoom ? ROOM_HALF : AMBIENT_HALF;
      this.pos[i * 3] = r() * h;
      this.pos[i * 3 + 1] = inRoom ? FLOOR_Y + Math.random() * (ROOM_HALF - FLOOR_Y + 1.4) : r() * 7;
      this.pos[i * 3 + 2] = r() * h;
      this.bri[i] = inRoom ? 0.55 + Math.random() * 0.45 : 0.16 + Math.random() * 0.22;
    }

    this.geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.briAttr = new THREE.BufferAttribute(this.bri, 1);
    this.briAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.posAttr);
    this.geometry.setAttribute('bri', this.briAttr);
  }

  setCount(n) {
    this.count = Math.min(n, this.max);
    this.roomCount = Math.floor(this.count * 0.68);
    this.geometry.setDrawRange(0, this.count);
  }

  /** Asigna blancos Morse a las partículas de la habitación. */
  beginSignal(bars) {
    const totalW = bars.reduce((s, b) => s + (b.x1 - b.x0), 0);
    for (let i = 0; i < this.roomCount; i++) {
      // reparto proporcional al ancho de cada barra
      let pick = Math.random() * totalW;
      let bar = bars[0];
      for (const b of bars) { pick -= (b.x1 - b.x0); if (pick <= 0) { bar = b; break; } }
      this.targets[i * 2] = bar.x0 + Math.random() * (bar.x1 - bar.x0);
      this.targets[i * 2 + 1] = bar.z0 + Math.random() * (bar.z1 - bar.z0);
      this.hasTarget[i] = 1;
    }
  }

  endSignal() {
    this.hasTarget.fill(0);
    // pequeño soplo de dispersión al soltar la señal
    for (let i = 0; i < this.roomCount; i++) {
      this.vel[i * 3] += (Math.random() - 0.5) * 0.9;
      this.vel[i * 3 + 1] += Math.random() * 0.7;
      this.vel[i * 3 + 2] += (Math.random() - 0.5) * 0.9;
    }
  }

  /**
   * Paso de simulación.
   * wells: [{x,y,z, f (fuerza, + atrae), r}] — pozos de gravedad del usuario.
   * morseK: rigidez del resorte hacia los blancos (0 = inactivo).
   */
  step(dt, t, wells, morseK) {
    this.morseK = morseK;
    this.phase ^= 1;
    const { pos, vel, bri, count, roomCount } = this;
    const damp = Math.exp(-dt * 2.1);
    const c = this._c;
    const sqrtK = Math.sqrt(Math.max(morseK, 1e-6));

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      let px = pos[i3], py = pos[i3 + 1], pz = pos[i3 + 2];
      let vx = vel[i3], vy = vel[i3 + 1], vz = vel[i3 + 2];
      const inRoom = i < roomCount;

      // campo curl — alternando mitades por frame (coherencia temporal barata)
      if ((i & 1) === this.phase) {
        curlXZ(px * 0.52 + t * 0.11, py * 0.52, pz * 0.52 - t * 0.07, c);
        const amp = inRoom ? 0.30 : 0.55;
        vx += c[0] * amp * dt;
        vz += c[2] * amp * dt;
        vy += (noise3(px * 0.4, t * 0.16 + i * 0.618, pz * 0.4) * 0.16 - 0.028) * dt;
      }

      // pozos de gravedad del puntero
      for (let wi = 0; wi < wells.length; wi++) {
        const w = wells[wi];
        const dx = w.x - px, dy = w.y - py, dz = w.z - pz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > w.r * w.r) continue;
        const d = Math.sqrt(d2) + 1e-4;
        const g = (w.f / (d2 + 0.32)) * dt;
        vx += (dx / d) * g;
        vy += (dy / d) * g;
        vz += (dz / d) * g;
        // remolino tangencial (rotor alrededor del eje Y del pozo)
        const sw = g * 0.62;
        vx += (-dz / d) * sw;
        vz += (dx / d) * sw;
      }

      // resorte crítico hacia el blanco Morse
      if (morseK > 0 && this.hasTarget[i]) {
        const tx = this.targets[i * 2], tz = this.targets[i * 2 + 1];
        vx += ((tx - px) * morseK - vx * 1.9 * sqrtK) * dt;
        vz += ((tz - pz) * morseK - vz * 1.9 * sqrtK) * dt;
        vy += (((FLOOR_Y + 0.05) - py) * morseK - vy * 1.9 * sqrtK) * dt;
      }

      // amortiguación + límite de velocidad
      vx *= damp; vy *= damp; vz *= damp;
      const v2 = vx * vx + vy * vy + vz * vz;
      if (v2 > 9) { const k = 3 / Math.sqrt(v2); vx *= k; vy *= k; vz *= k; }

      px += vx * dt; py += vy * dt; pz += vz * dt;

      if (inRoom) {
        // contención suave dentro de la habitación ancla
        if (px > ROOM_HALF) vx -= (px - ROOM_HALF) * 4 * dt;
        else if (px < -ROOM_HALF) vx -= (px + ROOM_HALF) * 4 * dt;
        if (pz > ROOM_HALF) vz -= (pz - ROOM_HALF) * 4 * dt;
        else if (pz < -ROOM_HALF) vz -= (pz + ROOM_HALF) * 4 * dt;
        if (py > ROOM_HALF) vy -= (py - ROOM_HALF) * 4 * dt;
        else if (py < FLOOR_Y) { py = FLOOR_Y; vy = Math.abs(vy) * 0.3; }
      } else {
        // el ambiente envuelve (pasillo infinito)
        if (px > AMBIENT_HALF) px -= AMBIENT_HALF * 2;
        else if (px < -AMBIENT_HALF) px += AMBIENT_HALF * 2;
        if (pz > AMBIENT_HALF) pz -= AMBIENT_HALF * 2;
        else if (pz < -AMBIENT_HALF) pz += AMBIENT_HALF * 2;
        if (py > 8) py -= 16; else if (py < -8) py += 16;
      }

      pos[i3] = px; pos[i3 + 1] = py; pos[i3 + 2] = pz;
      vel[i3] = vx; vel[i3 + 1] = vy; vel[i3 + 2] = vz;

      // brillo: las partículas en formación se encienden
      const targetBri = (morseK > 0 && this.hasTarget[i]) ? 2.1 : (inRoom ? 0.82 : 0.3);
      bri[i] += (targetBri - bri[i]) * Math.min(dt * 3, 1);
    }

    this.posAttr.needsUpdate = true;
    this.briAttr.needsUpdate = true;
  }
}

/** Material de puntos suaves con niebla exponencial propia. */
export function createDustMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uSize: { value: 3.8 },
      uPixelRatio: { value: 1 },
      uFog: { value: 0.052 },
      uWarm: { value: new THREE.Color(0xd9a45c) },
      uHot: { value: new THREE.Color(0xffe3b0) },
    },
    vertexShader: /* glsl */ `
      attribute float bri;
      varying float vBri;
      varying float vFog;
      uniform float uSize, uPixelRatio, uFog;
      void main() {
        vBri = bri;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float dist = -mv.z;
        gl_PointSize = uSize * uPixelRatio * (34.0 / max(dist, 0.5)) * (0.55 + 0.55 * bri);
        vFog = exp(-dist * dist * uFog * uFog * 18.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vBri;
      varying float vFog;
      uniform vec3 uWarm, uHot;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.06, d);
        vec3 col = mix(uWarm, uHot, clamp(vBri - 0.6, 0.0, 1.0));
        float e = a * vBri * vFog;
        gl_FragColor = vec4(col * e, e * 0.55);
      }
    `,
  });
}
