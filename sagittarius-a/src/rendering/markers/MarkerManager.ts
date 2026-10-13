/**
 * Sube las líneas de universo de los objetos a la textura de balizas del trazador y calcula
 * sus esferas envolventes en la ventana temporal visible.
 *
 * Cada baliza es una esfera emisora AMPLIADA (radio visual en M, indicado en la interfaz); el
 * objeto real (metros o kilómetros) sería invisible a la escala de Sgr A* (r_g ≈ 5,9 millones de km).
 */
import * as THREE from 'three';
import type { RayTracer } from '../raytracer/RayTracer';
import { MARKER_TEX_WIDTH, MAX_MARKERS } from '../raytracer/markersGlsl';
import type { Experiment } from '../../simulation/client';
import { CATALOG } from '../../simulation/catalog';
import { DT_SAMPLE } from '../../simulation/runner';
import { PARTICLE_SIZE, SAMPLE_SIZE } from '../../simulation/types';

interface Slot {
  key: string;
  exp: Experiment;
  particle: number; // −1 = cuerpo
  uploaded: number; // muestras escritas en la textura
}

export class MarkerManager {
  private slots: Slot[] = [];
  private dirty = false;
  private lastUpload = 0;
  /** Escala visual global de las balizas (1 = tamaño por defecto del catálogo). */
  visualScale = 1;

  /** Reasigna las ranuras a los experimentos visibles (cuerpos y partículas de nubes). */
  sync(experiments: Experiment[], spin: number): void {
    const wanted: Array<[string, Experiment, number]> = [];
    for (const e of experiments) {
      // Solo se trazan ópticamente los experimentos calculados en la métrica actual
      if (Math.abs(e.a - spin) > 1e-12) continue;
      if (e.type === 'body') wanted.push([`${e.id}:b`, e, -1]);
      else if (e.type === 'cloud') for (let j = 0; j < e.nParticles; j++) wanted.push([`${e.id}:${j}`, e, j]);
    }
    const keys = wanted.slice(0, MAX_MARKERS).map((w) => w[0]).join('|');
    const cur = this.slots.map((s) => s.key).join('|');
    if (keys !== cur) {
      this.slots = wanted.slice(0, MAX_MARKERS).map(([key, exp, particle]) => ({ key, exp, particle, uploaded: 0 }));
      this.dirty = true;
    }
  }

  get count(): number {
    return this.slots.length;
  }

  update(tracer: RayTracer, tCam: number, now: number, tg: number): void {
    const tex = tracer.markerTex;
    const data = tex.image.data as Float32Array;
    const W = MARKER_TEX_WIDTH;
    let wrote = false;
    this.slots.forEach((s, m) => {
      const e = s.exp;
      const n = e.nSamples;
      if (n <= s.uploaded) return;
      const from = Math.max(s.uploaded, n - W);
      for (let k = from; k < n; k++) {
        const col = k % W;
        const r0 = (2 * m * W + col) * 4;
        const r1 = ((2 * m + 1) * W + col) * 4;
        if (s.particle < 0) {
          const A = k * SAMPLE_SIZE;
          const d = e.body.data;
          data[r0] = d[A + 1];
          data[r0 + 1] = d[A + 2];
          data[r0 + 2] = d[A + 3];
          data[r0 + 3] = d[A + 8] / 1; // τ (s)
          data[r1] = d[A + 4];
          data[r1 + 1] = d[A + 5];
          data[r1 + 2] = d[A + 6];
          data[r1 + 3] = d[A + 7];
        } else {
          const A = (k * e.nParticles + s.particle) * PARTICLE_SIZE;
          const d = e.particles.data;
          data[r0] = d[A];
          data[r0 + 1] = d[A + 1];
          data[r0 + 2] = d[A + 2];
          data[r0 + 3] = d[A + 3];
          data[r1] = d[A + 4];
          data[r1 + 1] = d[A + 5];
          data[r1 + 2] = d[A + 6];
          data[r1 + 3] = d[A + 7];
        }
      }
      s.uploaded = n;
      wrote = true;
    });
    if (wrote) this.dirty = true;
    if (this.dirty && now - this.lastUpload > 90) {
      tex.needsUpdate = true;
      this.dirty = false;
      this.lastUpload = now;
    }
    // Metadatos (cada fotograma: dependen de t de la cámara)
    const meta = tracer.markerMeta.image.data as Float32Array;
    const bounds = tracer.uniforms.uMkBound.value as THREE.Vector4[];
    this.slots.forEach((s, m) => {
      const e = s.exp;
      const spec = CATALOG[e.cfg.object];
      const n = Math.min(s.uploaded, e.nSamples);
      const gMin = Math.max(0, n - MARKER_TEX_WIDTH + 1);
      const gMax = n - 1;
      meta[8 * m] = e.tLaunch - tCam;
      meta[8 * m + 1] = DT_SAMPLE;
      meta[8 * m + 2] = gMin;
      meta[8 * m + 3] = gMax;
      // B: radio visual, temperatura, parpadeo (en segundos de τ), brillo
      meta[8 * m + 4] = spec.markerRadiusM * this.visualScale;
      meta[8 * m + 5] = spec.beacon.tempK;
      meta[8 * m + 6] = spec.beacon.blinkPeriodM * tg; // τ de la textura en segundos
      meta[8 * m + 7] = spec.beacon.brightness;
      // Esfera envolvente de las muestras válidas hasta t de la cámara
      let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
      const kEnd = Math.min(gMax, Math.floor((tCam - e.tLaunch) / DT_SAMPLE) + 1);
      for (let k = gMin; k <= kEnd; k++) {
        let x: number, y: number, z: number;
        if (s.particle < 0) {
          const A = k * SAMPLE_SIZE;
          x = e.body.data[A + 1];
          y = e.body.data[A + 2];
          z = e.body.data[A + 3];
        } else {
          const A = (k * e.nParticles + s.particle) * PARTICLE_SIZE;
          x = e.particles.data[A];
          y = e.particles.data[A + 1];
          z = e.particles.data[A + 2];
        }
        if (x < mnx) mnx = x;
        if (y < mny) mny = y;
        if (z < mnz) mnz = z;
        if (x > mxx) mxx = x;
        if (y > mxy) mxy = y;
        if (z > mxz) mxz = z;
      }
      const b = bounds[m];
      if (!Number.isFinite(mnx)) b.set(0, 0, 0, -1);
      else b.set((mnx + mxx) / 2, (mny + mxy) / 2, (mnz + mxz) / 2, 0.5 * Math.hypot(mxx - mnx, mxy - mny, mxz - mnz) + meta[8 * m + 4] * 1.05);
    });
    tracer.markerMeta.needsUpdate = true;
    tracer.uniforms.uMarkerCount.value = this.slots.length;
  }
}
