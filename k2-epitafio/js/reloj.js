// Un solo reloj para toda la página: mide la ventana, suaviza el scroll y reparte cada cuadro.
//
// El documento se desplaza de forma nativa (nada de secuestrar la rueda); lo que se suaviza es
// la posición que leen las animaciones. Así el texto responde al instante y el escenario lo
// sigue con una inercia corta, como una cámara con peso.

export const estado = {
  y: 0,            // scroll suavizado (px)
  crudo: 0,        // scroll real
  vel: 0,          // px/s, suavizada
  t: 0,            // segundos desde el arranque
  vw: 0, vh: 0,    // ventana visible
  sw: 0, sh: 0,    // escenario (usa la altura grande del viewport en móvil)
  dpr: 1,
  estrecha: false, // < 900 px: maquetación de una columna
  quieto: false,   // prefers-reduced-motion
  puntero: { x: 0, y: 0, tx: 0, ty: 0, fino: false },
};

const cuadros = [];
const medidas = [];
const INERCIA = 0.105; // constante de tiempo del suavizado, en segundos

export const cadaCuadro = (fn) => cuadros.push(fn);
export const alMedir = (fn) => medidas.push(fn);

export function medir() {
  const esc = document.getElementById('escenario');
  estado.vw = document.documentElement.clientWidth;
  estado.vh = window.innerHeight;
  estado.sw = esc.clientWidth;
  estado.sh = esc.clientHeight;
  estado.dpr = Math.min(window.devicePixelRatio || 1, 2);
  estado.estrecha = estado.vw < 900;
  for (const fn of medidas) fn(estado);
}

export function arrancar() {
  const reducido = window.matchMedia('(prefers-reduced-motion: reduce)');
  estado.quieto = reducido.matches;
  reducido.addEventListener('change', (e) => { estado.quieto = e.matches; });
  estado.puntero.fino = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  window.addEventListener('pointermove', (e) => {
    estado.puntero.tx = (e.clientX / estado.vw) * 2 - 1;
    estado.puntero.ty = (e.clientY / estado.vh) * 2 - 1;
  }, { passive: true });

  // Re-medir cuando cambia la ventana o crece el documento (fuentes, imágenes).
  let pendiente = 0;
  const remedir = () => { cancelAnimationFrame(pendiente); pendiente = requestAnimationFrame(medir); };
  window.addEventListener('resize', remedir);
  new ResizeObserver(remedir).observe(document.getElementById('contenido'));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remedir);

  medir();
  estado.crudo = estado.y = window.scrollY;

  let antes = performance.now();
  const t0 = antes;
  const cuadro = (ahora) => {
    const dt = Math.min(0.05, (ahora - antes) / 1000) || 0.016;
    antes = ahora;
    estado.t = (ahora - t0) / 1000;
    estado.crudo = window.scrollY;

    const previo = estado.y;
    const k = estado.quieto ? 1 : 1 - Math.exp(-dt / INERCIA);
    estado.y += (estado.crudo - estado.y) * k;
    if (Math.abs(estado.crudo - estado.y) < 0.05) estado.y = estado.crudo;
    estado.vel += ((estado.y - previo) / dt - estado.vel) * Math.min(1, dt * 8);

    const p = estado.puntero;
    const kp = 1 - Math.exp(-dt / 0.35);
    p.x += (p.tx - p.x) * kp;
    p.y += (p.ty - p.y) * kp;

    for (const fn of cuadros) fn(estado, dt);
    requestAnimationFrame(cuadro);
  };
  requestAnimationFrame(cuadro);
}
