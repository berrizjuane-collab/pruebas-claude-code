// ============================================================================
// Paisaje sonoro procedural (WebAudio, cero muestras externas):
// drone de órgano grave en quintas + aire filtrado + el tic de reloj
// — el motivo del segundero de la película. Apagado por defecto;
// se enciende con gesto del usuario (política de autoplay).
// ============================================================================

export function createAudio() {
  let ctx = null;
  let master = null;
  let tickTimer = null;
  let enabled = false;

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 320;
    lowpass.connect(master);

    // drone: A1 + E2 + A2 ligeramente desafinados
    for (const [freq, gain, type] of [[55, 0.42, 'sine'], [82.41, 0.26, 'sine'], [110.3, 0.12, 'triangle']]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g).connect(lowpass);
      osc.start();
    }
    // respiración lenta del drone
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.35;
    lfo.connect(lfoGain).connect(lowpass.frequency);
    lfo.start();

    // aire: ruido blanco por pasabanda suave
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 520;
    bp.Q.value = 0.55;
    const ng = ctx.createGain();
    ng.gain.value = 0.05;
    noise.connect(bp).connect(ng).connect(master);
    noise.start();

    // eco para el tic
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.21;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    delay.connect(fb).connect(delay);
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    delay.connect(wet).connect(master);

    // un tic por segundo — "cada tic, un día entero"
    const tick = () => {
      if (!enabled || !ctx) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2100;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.09, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      src.connect(hp).connect(g);
      g.connect(master);
      g.connect(delay);
      src.start(t, Math.random() * 1.5, 0.06);
    };
    tickTimer = setInterval(tick, 1000);
  }

  return {
    setEnabled(on) {
      enabled = on;
      if (on && !ctx) build();
      if (ctx) {
        if (on && ctx.state === 'suspended') ctx.resume();
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.linearRampToValueAtTime(on ? 0.14 : 0, ctx.currentTime + 1.2);
      }
    },
    /** Hinchazón grave al formarse la señal Morse. */
    signalSwell() {
      if (!enabled || !ctx) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(38, t);
      osc.frequency.exponentialRampToValueAtTime(52, t + 1.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 2.5);
    },
    dispose() {
      if (tickTimer) clearInterval(tickTimer);
      if (ctx) ctx.close();
      ctx = null;
    },
  };
}
