/**
 * Sonido ambiental opcional (desactivado por defecto): un pedal grave muy suave y clics discretos
 * en las acciones. Es puramente estético: el sonido no se propaga por el vacío y ningún sonido
 * representa un fenómeno del agujero negro.
 */
import { store } from './store';

class Ambient {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private nodes: AudioScheduledSourceNode[] = [];
  private on = false;

  constructor() {
    store.subscribe(() => this.sync(store.get().audioOn));
  }

  private sync(want: boolean): void {
    if (want === this.on) return;
    this.on = want;
    if (want) this.start();
    else this.stop();
  }

  private start(): void {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) this.ctx = new AC();
    const ctx = this.ctx;
    void ctx.resume();
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    lp.Q.value = 0.4;
    lp.connect(master);
    master.connect(ctx.destination);
    // Pedal: La grave con una quinta y una octava, ligeramente desafinados
    for (const [f, g] of [
      [55, 0.5],
      [55.35, 0.4],
      [82.4, 0.22],
      [110.3, 0.1],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const gn = ctx.createGain();
      gn.gain.value = g;
      o.connect(gn);
      gn.connect(lp);
      o.start();
      this.nodes.push(o);
    }
    // Respiración lenta del filtro
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lg = ctx.createGain();
    lg.gain.value = 120;
    lfo.connect(lg);
    lg.connect(lp.frequency);
    lfo.start();
    this.nodes.push(lfo);
    this.master = master;
  }

  private stop(): void {
    const ctx = this.ctx;
    const m = this.master;
    if (!ctx || !m) return;
    m.gain.cancelScheduledValues(ctx.currentTime);
    m.gain.setValueAtTime(m.gain.value, ctx.currentTime);
    m.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
    const nodes = this.nodes;
    this.nodes = [];
    this.master = null;
    setTimeout(() => {
      for (const n of nodes) n.stop();
      m.disconnect();
    }, 700);
  }

  /** Clic breve (lanzamiento) o tono suave (evento registrado). */
  click(kind: 'launch' | 'event' = 'launch'): void {
    if (!this.on || !this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const t = ctx.currentTime;
    o.type = kind === 'launch' ? 'triangle' : 'sine';
    o.frequency.setValueAtTime(kind === 'launch' ? 660 : 392, t);
    o.frequency.exponentialRampToValueAtTime(kind === 'launch' ? 330 : 294, t + (kind === 'launch' ? 0.12 : 0.5));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(kind === 'launch' ? 0.035 : 0.025, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'launch' ? 0.25 : 0.9));
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + 1);
  }
}

export const ambient = new Ambient();
