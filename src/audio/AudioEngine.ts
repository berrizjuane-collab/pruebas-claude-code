/**
 * Procedural audio: a data SONIFICATION, not "the sound of a neutron star".
 * Space is a vacuum — nothing acoustic reaches us. What you hear is the pulsar's
 * signal mapped into the audible range:
 *
 *  - Scientific mode: one short enveloped "blip" each time a beam crosses the
 *    observer's line of sight (the World triggers it), amplitude ∝ pulse
 *    intensity, pitch mapped (log) from the real spin frequency. Because the
 *    trigger follows the *visual* rotation, a millisecond pulsar's blips are
 *    slowed exactly like the picture — and the UI shows the conversion factor.
 *  - Cinematic mode: an opt-in, clearly-labelled ambient drone (detuned low
 *    oscillators + filtered noise), never presented as literal.
 *
 * Signal chain: sources → masterGain → limiter(compressor) → analyser → output.
 * The AudioContext is only created/resumed after a user gesture.
 */

import { clamp, mapLog } from '../utils/math.ts';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sciGain: GainNode | null = null;
  private cineGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;

  private droneNodes: Array<OscillatorNode | AudioBufferSourceNode> = [];
  private started = false;
  private volume = 0.6;
  private muted = false;
  private scientific = true;

  /** Create and wire the graph; must be called from a user gesture. */
  async start(): Promise<void> {
    if (this.started) {
      await this.ctx?.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as any).webkitAudioContext;
    this.ctx = new Ctx();
    await this.ctx.resume();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;

    this.sciGain = this.ctx.createGain();
    this.sciGain.gain.value = this.scientific ? 1 : 0;
    this.cineGain = this.ctx.createGain();
    this.cineGain.gain.value = 0;

    // Brick-wall-ish limiter to prevent peaks.
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.8;

    this.sciGain.connect(this.master);
    this.cineGain.connect(this.master);
    this.master.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    this.buildDrone();
    this.started = true;
    this.applyGains(true);
  }

  get isStarted(): boolean {
    return this.started;
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  setVolume(v: number): void {
    this.volume = clamp(v, 0, 1);
    this.applyGains();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyGains();
  }

  setScientific(on: boolean): void {
    this.scientific = on;
    if (this.ctx && this.sciGain) {
      this.sciGain.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.08);
    }
  }

  setCinematic(on: boolean): void {
    if (this.ctx && this.cineGain) {
      this.cineGain.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.4);
    }
  }

  /**
   * Trigger one pulse blip. `intensity` 0..1 scales amplitude; `spinFrequency`
   * (real, Hz) sets the pitch mapping so slow vs. millisecond pulsars sound
   * distinct.
   */
  triggerPulse(intensity: number, spinFrequency: number): void {
    if (!this.ctx || !this.sciGain || !this.scientific || this.muted) return;
    const t = this.ctx.currentTime;
    const pitch = mapLog(clamp(spinFrequency, 0.1, 700), 0.1, 700, 130, 880);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = pitch;

    const partial = this.ctx.createOscillator();
    partial.type = 'triangle';
    partial.frequency.value = pitch * 2.01;

    const env = this.ctx.createGain();
    const amp = clamp(intensity, 0, 1) * 0.6;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(amp, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0008, t + 0.16);

    const partialEnv = this.ctx.createGain();
    partialEnv.gain.value = 0.35;

    osc.connect(env);
    partial.connect(partialEnv).connect(env);
    env.connect(this.sciGain);

    osc.start(t);
    partial.start(t);
    osc.stop(t + 0.2);
    partial.stop(t + 0.2);
    // Auto-cleanup.
    osc.onended = () => {
      osc.disconnect();
      partial.disconnect();
      env.disconnect();
      partialEnv.disconnect();
    };
  }

  /** Build the ambient cinematic drone (runs continuously at zero gain until enabled). */
  private buildDrone(): void {
    if (!this.ctx || !this.cineGain) return;
    const base = 55; // A1
    const freqs = [base, base * 1.5, base * 2.0];
    for (const f of freqs) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      const detune = this.ctx.createOscillator();
      detune.frequency.value = 0.08 + Math.random() * 0.1;
      const detuneGain = this.ctx.createGain();
      detuneGain.gain.value = 2.5;
      detune.connect(detuneGain).connect(osc.detune);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      filter.Q.value = 0.7;

      const g = this.ctx.createGain();
      g.gain.value = 0.14;

      osc.connect(filter).connect(g).connect(this.cineGain);
      osc.start();
      detune.start();
      this.droneNodes.push(osc, detune);
    }

    // Filtered noise bed for airiness.
    const noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 200;
    nf.Q.value = 0.5;
    const ng = this.ctx.createGain();
    ng.gain.value = 0.05;
    noise.connect(nf).connect(ng).connect(this.cineGain);
    noise.start();
    this.droneNodes.push(noise);
  }

  private applyGains(immediate = false): void {
    if (!this.ctx || !this.master) return;
    const target = this.muted ? 0 : this.volume;
    if (immediate) this.master.gain.setValueAtTime(0, this.ctx.currentTime);
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.15);
  }

  dispose(): void {
    for (const n of this.droneNodes) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
      n.disconnect();
    }
    this.droneNodes = [];
    this.analyser?.disconnect();
    this.limiter?.disconnect();
    this.master?.disconnect();
    this.sciGain?.disconnect();
    this.cineGain?.disconnect();
    void this.ctx?.close();
    this.ctx = null;
    this.started = false;
  }
}
