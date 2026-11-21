// Nieve en canvas, por delante de las láminas y por detrás del texto. Cada capítulo fija
// su intensidad y su viento (data-nieve, data-viento); entre capítulos se interpola. El
// scroll arrastra los copos según su profundidad, lo que da relieve al subir.

import { cadaCuadro, alMedir } from './reloj.js';
import { capitulos, escenario } from './escenario.js';
import { mezclar, suave, $ } from './util.js';

const MAXIMO = 260;

export function iniciarNieve() {
  const lienzo = $('#nieve');
  const ctx = lienzo.getContext('2d', { alpha: true });
  let W = 0, H = 0, dpr = 1, tope = MAXIMO;
  let intensidad = 0, viento = 0, visible = true;

  // Cada copo: posición normalizada, profundidad z (cerca = 1), tamaño y fase del bamboleo.
  const copos = Array.from({ length: MAXIMO }, () => ({
    x: Math.random(), y: Math.random(),
    z: 0.25 + Math.random() ** 1.6 * 0.75,
    r: 0.6 + Math.random() * 1.5,
    f: Math.random() * Math.PI * 2,
    v: 0.6 + Math.random() * 0.8,
  }));

  alMedir((e) => {
    dpr = Math.min(e.dpr, 1.5);
    W = e.sw; H = e.sh;
    lienzo.width = Math.round(W * dpr);
    lienzo.height = Math.round(H * dpr);
    tope = e.estrecha ? 130 : MAXIMO;
  });
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; });

  let yPrevio = null;
  cadaCuadro((e, dt) => {
    if (e.quieto || !visible) return;
    // intensidad y viento del momento: mezcla del capítulo entrante con el anterior
    const c = capitulos[escenario.actual];
    const previo = capitulos[c.i - 1];
    const k = previo ? suave(1 - c.w) : 1;
    const metaI = previo ? mezclar(previo.nieve, c.nieve, k) : c.nieve;
    const metaV = previo ? mezclar(previo.viento, c.viento, k) : c.viento;
    intensidad += (metaI - intensidad) * Math.min(1, dt * 2.5);
    viento += (metaV - viento) * Math.min(1, dt * 2.5);

    const dy = yPrevio == null ? 0 : e.y - yPrevio;
    yPrevio = e.y;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const n = Math.round(tope * Math.min(1, intensidad));
    if (n < 1) return;

    const ventisca = Math.max(0, viento - 0.45);        // con viento fuerte los copos dejan estela
    ctx.fillStyle = '#E8EDF2';
    ctx.strokeStyle = '#E8EDF2';
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const p = copos[i];
      const vx = (viento * 0.22 + Math.sin(e.t * p.v + p.f) * 0.012) * p.z;
      const vy = (0.035 + 0.05 * p.v + ventisca * 0.05) * p.z;
      p.x += vx * dt;
      p.y += vy * dt - (dy / H) * 0.32 * p.z;
      if (p.x > 1.03) p.x -= 1.06; else if (p.x < -0.03) p.x += 1.06;
      if (p.y > 1.03) p.y -= 1.06; else if (p.y < -0.03) p.y += 1.06;

      const x = p.x * W, y = p.y * H;
      const radio = p.r * (0.5 + p.z);
      ctx.globalAlpha = 0.16 + 0.6 * p.z * p.z;
      if (ventisca > 0.02) {
        const cola = 46 * ventisca * p.z;
        ctx.lineWidth = radio * 1.3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - cola, y - cola * (vy / Math.max(0.001, vx)) * 0.8);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, radio, 0, 6.2832);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  });
}
