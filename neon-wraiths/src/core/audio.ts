/**
 * Everything you hear is synthesised at runtime — no audio files, no CDN.
 * A tiny WebAudio graph gives us impacts, energy weapons, UI blips, rain and a
 * generative ambient score that changes key/tempo per zone.
 */

import { clamp, pick, rand } from './util';

export type SfxName =
  | 'slash'
  | 'whip'
  | 'shot'
  | 'chargeShot'
  | 'punch'
  | 'blade'
  | 'spear'
  | 'hit'
  | 'hurt'
  | 'dodge'
  | 'parry'
  | 'pickup'
  | 'heal'
  | 'menu'
  | 'confirm'
  | 'deny'
  | 'door'
  | 'explode'
  | 'bossHit'
  | 'bossRoar'
  | 'telegraph'
  | 'death'
  | 'shard'
  | 'glitch'
  | 'talk';

interface MusicState {
  root: number;
  scale: number[];
  tempo: number;
  mood: string;
  intensity: number;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private ambienceBus!: GainNode;
  private comp!: DynamicsCompressorNode;
  private noiseBuffer!: AudioBuffer;

  private rainSource: AudioBufferSourceNode | null = null;
  private rainGain: GainNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;

  private musicTimer = 0;
  private musicStep = 0;
  private music: MusicState = {
    root: 110,
    scale: [0, 3, 5, 7, 10],
    tempo: 84,
    mood: 'melancholy',
    intensity: 0,
  };

  enabled = true;
  musicVolume = 0.5;
  sfxVolume = 0.7;
  private started = false;
  /** Rate-limits identical sfx so a swarm dying never turns into a wall of noise. */
  private lastPlayed = new Map<string, number>();

  init(): void {
    if (this.ctx) return;
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch {
      this.ctx = null;
      return;
    }
    const ctx = this.ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 6;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.18;

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0;
    this.ambienceBus = ctx.createGain();
    this.ambienceBus.gain.value = 0;

    this.sfxBus.connect(this.comp);
    this.musicBus.connect(this.comp);
    this.ambienceBus.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    // 2 s of white noise, reused by every percussive/textural sound.
    const len = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.startRain();
  }

  /** Browsers require a gesture before audio runs. */
  unlock(): void {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    this.started = true;
  }

  get ready(): boolean {
    return this.enabled && this.started && !!this.ctx && this.ctx.state === 'running';
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.85 : 0;
  }

  setMusicVolume(v: number): void {
    this.musicVolume = clamp(v, 0, 1);
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = clamp(v, 0, 1);
    if (this.sfxBus) this.sfxBus.gain.value = this.sfxVolume;
  }

  private noise(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    return src;
  }

  private startRain(): void {
    if (!this.ctx) return;
    const src = this.noise();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2400;
    filter.Q.value = 0.6;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambienceBus);
    src.start();
    this.rainSource = src;
    this.rainGain = gain;
    this.rainFilter = filter;
  }

  /** `amount` 0..1 — how heavy the rain / ambient hiss is in the current zone. */
  setAmbience(amount: number, brightness = 2400): void {
    if (!this.ctx || !this.rainGain || !this.rainFilter) return;
    const t = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(0.055 * amount, t, 0.8);
    this.rainFilter.frequency.setTargetAtTime(brightness, t, 1.2);
    this.ambienceBus.gain.setTargetAtTime(this.musicVolume > 0 ? 1 : 0, t, 0.5);
  }

  setMusic(state: Partial<MusicState>): void {
    Object.assign(this.music, state);
    if (this.ctx) {
      this.musicBus.gain.setTargetAtTime(this.musicVolume * 0.5, this.ctx.currentTime, 1.2);
    }
  }

  /** 0 = calm exploration, 1 = boss fight. Drives density and register. */
  setIntensity(v: number): void {
    this.music.intensity = clamp(v, 0, 1);
  }

  fadeMusic(target: number, seconds = 1.5): void {
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(this.musicVolume * target, this.ctx.currentTime, seconds / 3);
  }

  private env(
    node: AudioNode,
    peak: number,
    attack: number,
    decay: number,
    start = 0,
  ): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const t = ctx.currentTime + start;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    node.connect(g);
    return g;
  }

  private tone(
    type: OscillatorType,
    freq: number,
    endFreq: number,
    dur: number,
    peak: number,
    dest: AudioNode,
    delay = 0,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    const t = ctx.currentTime + delay;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t + dur);
    const g = this.env(osc, peak, 0.006, dur, delay);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.08);
  }

  private burst(
    freq: number,
    q: number,
    dur: number,
    peak: number,
    dest: AudioNode,
    type: BiquadFilterType = 'bandpass',
    delay = 0,
  ): void {
    const ctx = this.ctx!;
    const src = this.noise();
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    src.connect(filter);
    const g = this.env(filter, peak, 0.004, dur, delay);
    g.connect(dest);
    const t = ctx.currentTime + delay;
    src.start(t);
    src.stop(t + dur + 0.08);
  }

  play(name: SfxName, volume = 1): void {
    if (!this.ready) return;
    const now = this.ctx!.currentTime;
    const last = this.lastPlayed.get(name) ?? -1;
    if (now - last < 0.032) return;
    this.lastPlayed.set(name, now);

    const out = this.sfxBus;
    const v = volume;
    switch (name) {
      case 'slash':
        this.burst(rand(1800, 2600), 1.1, 0.13, 0.32 * v, out);
        this.tone('sawtooth', rand(520, 700), 180, 0.1, 0.1 * v, out);
        break;
      case 'blade':
        this.burst(rand(2600, 3400), 1.6, 0.07, 0.22 * v, out);
        break;
      case 'whip':
        this.burst(rand(900, 1300), 0.8, 0.2, 0.26 * v, out);
        this.tone('square', 160, 60, 0.18, 0.12 * v, out);
        break;
      case 'spear':
        this.tone('triangle', 340, 900, 0.11, 0.2 * v, out);
        this.burst(2000, 2, 0.09, 0.16 * v, out);
        break;
      case 'punch':
        this.tone('sine', 150, 44, 0.22, 0.4 * v, out);
        this.burst(420, 0.9, 0.16, 0.24 * v, out);
        break;
      case 'shot':
        this.tone('square', 880, 220, 0.12, 0.2 * v, out);
        this.burst(3200, 2.4, 0.06, 0.12 * v, out);
        break;
      case 'chargeShot':
        this.tone('sawtooth', 420, 90, 0.42, 0.3 * v, out);
        this.tone('sine', 1400, 300, 0.3, 0.14 * v, out);
        break;
      case 'hit':
        this.burst(rand(1100, 1700), 1.4, 0.08, 0.28 * v, out);
        this.tone('triangle', rand(200, 300), 90, 0.07, 0.16 * v, out);
        break;
      case 'bossHit':
        this.burst(700, 1, 0.14, 0.32 * v, out);
        this.tone('sawtooth', 160, 70, 0.16, 0.2 * v, out);
        break;
      case 'hurt':
        this.tone('sawtooth', 300, 70, 0.3, 0.34 * v, out);
        this.burst(700, 0.7, 0.24, 0.24 * v, out);
        break;
      case 'dodge':
        this.burst(rand(3000, 4200), 0.9, 0.16, 0.14 * v, out, 'highpass');
        break;
      case 'parry':
        this.tone('sine', 1600, 2400, 0.16, 0.26 * v, out);
        this.tone('sine', 2400, 3600, 0.2, 0.16 * v, out, 0.03);
        break;
      case 'pickup':
        this.tone('sine', 660, 990, 0.1, 0.2 * v, out);
        this.tone('sine', 990, 1320, 0.14, 0.16 * v, out, 0.07);
        break;
      case 'shard':
        [523, 659, 784, 1047].forEach((f, i) =>
          this.tone('sine', f, f * 1.5, 0.5, 0.16 * v, out, i * 0.11),
        );
        break;
      case 'heal':
        this.tone('sine', 440, 880, 0.34, 0.2 * v, out);
        this.tone('triangle', 660, 1320, 0.4, 0.12 * v, out, 0.06);
        break;
      case 'menu':
        this.tone('square', 720, 720, 0.045, 0.1 * v, out);
        break;
      case 'confirm':
        this.tone('square', 620, 930, 0.1, 0.16 * v, out);
        break;
      case 'deny':
        this.tone('square', 220, 150, 0.16, 0.16 * v, out);
        break;
      case 'door':
        this.tone('sine', 120, 300, 0.4, 0.16 * v, out);
        this.burst(600, 0.5, 0.4, 0.1 * v, out);
        break;
      case 'explode':
        this.burst(220, 0.4, 0.6, 0.42 * v, out, 'lowpass');
        this.tone('sine', 120, 40, 0.5, 0.3 * v, out);
        break;
      case 'bossRoar':
        this.tone('sawtooth', 90, 42, 1.5, 0.34 * v, out);
        this.tone('square', 61, 34, 1.7, 0.2 * v, out, 0.1);
        this.burst(320, 0.4, 1.4, 0.2 * v, out, 'lowpass');
        break;
      case 'telegraph':
        this.tone('square', 1100, 1100, 0.09, 0.11 * v, out);
        break;
      case 'glitch':
        for (let i = 0; i < 5; i++)
          this.burst(rand(600, 5000), 6, 0.035, 0.14 * v, out, 'bandpass', i * 0.035);
        break;
      case 'death':
        this.tone('sawtooth', 320, 40, 1.2, 0.32 * v, out);
        this.burst(500, 0.4, 1.1, 0.22 * v, out, 'lowpass');
        break;
      case 'talk':
        this.tone(pick(['sine', 'triangle'] as OscillatorType[]), rand(420, 700), rand(380, 640), 0.035, 0.05 * v, out);
        break;
    }
  }

  /** Generative ambient score. Called every frame; emits notes on its own clock. */
  update(dt: number): void {
    if (!this.ready) return;
    const m = this.music;
    const beat = 60 / m.tempo;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer += beat / 2;
    const step = this.musicStep++;
    const bus = this.musicBus;
    const intensity = m.intensity;

    const noteAt = (deg: number, octave: number): number =>
      m.root * Math.pow(2, octave + m.scale[((deg % m.scale.length) + m.scale.length) % m.scale.length] / 12);

    // Bass pulse on the downbeat.
    if (step % 8 === 0) {
      const f = noteAt(0, 0) / 2;
      this.tone('sine', f, f * 0.98, beat * 2.4, 0.16 + intensity * 0.1, bus);
    }
    // Pad chord every bar.
    if (step % 16 === 0) {
      const rootDeg = pick([0, 0, 2, 3, 4]);
      for (const d of [rootDeg, rootDeg + 2, rootDeg + 4]) {
        const f = noteAt(d, 1);
        const osc = this.ctx!.createOscillator();
        osc.type = m.mood === 'sacred' || m.mood === 'apex' ? 'sawtooth' : 'triangle';
        osc.frequency.value = f * rand(0.998, 1.002);
        const filter = this.ctx!.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 700 + intensity * 1800;
        const g = this.ctx!.createGain();
        const t = this.ctx!.currentTime;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05 + intensity * 0.03, t + beat * 1.5);
        g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 7);
        osc.connect(filter);
        filter.connect(g);
        g.connect(bus);
        osc.start(t);
        osc.stop(t + beat * 7.5);
      }
    }
    // Sparse melodic motif — denser and higher as intensity climbs.
    if (Math.random() < 0.22 + intensity * 0.42) {
      const deg = pick([0, 1, 2, 3, 4, 5, 6]);
      const oct = intensity > 0.6 ? pick([2, 3]) : pick([1, 2]);
      const f = noteAt(deg, oct);
      this.tone('triangle', f, f, beat * (0.5 + Math.random()), 0.05 + intensity * 0.04, bus);
    }
    // Percussive tick during fights keeps the pulse readable.
    if (intensity > 0.35 && step % 4 === 2) {
      this.burst(3000, 2, 0.05, 0.05 * intensity, bus, 'highpass');
    }
  }

  suspendForPause(paused: boolean): void {
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(
      paused ? this.musicVolume * 0.12 : this.musicVolume * 0.5,
      this.ctx.currentTime,
      0.15,
    );
  }

  stopAll(): void {
    this.rainSource?.stop();
    this.rainSource = null;
  }
}

export const audio = new AudioEngine();
