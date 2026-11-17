// Director: del scroll a la lámina.  Cada elemento con data-shot es un plano:
// qué lámina, con qué encuadre (foco y zoom de entrada → salida, el «Ken
// Burns»), cuánto se oscurece y en qué dirección entra el pincel.  Entre un
// plano y el siguiente hay un tramo de transición atado al scroll: subir y
// bajar la página pinta y despinta la lámina.

const DIRS = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] };
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Director {
  constructor(stage, { reduced = false } = {}) {
    this.stage = stage;
    this.reduced = reduced;
    this.shots = [];
    this.listeners = [];
    this.shift = [0, 0];
    this.shiftTarget = [0, 0];
    this.current = null;
    this.collect();
    if (!reduced && matchMedia('(pointer: fine)').matches) {
      window.addEventListener('pointermove', (e) => {
        this.shiftTarget = [(e.clientX / window.innerWidth - 0.5) * 0.018, (e.clientY / window.innerHeight - 0.5) * 0.012];
      }, { passive: true });
    }
  }

  collect() {
    this.shots = [...document.querySelectorAll('[data-shot]')].map((el, i) => {
      const d = el.dataset;
      const [z0, z1] = (d.zoom || '1,1.06').split(',').map(Number);
      const [fx, fy] = (d.focus || '0.5,0.5').split(',').map(Number);
      return {
        i, el, id: d.shot, z0, z1: this.reduced ? z0 : (z1 ?? z0), fx, fy,
        dim: Number(d.dim || 0), dir: DIRS[d.dir] || DIRS.right,
        labels: d.labels || null, route: d.route || null, cam: d.cam || null,
        camp: d.camp || null, start: 0, len: 1, end: 1,
      };
    });
    this.measure();
  }

  measure() {
    const vh = window.innerHeight;
    const y0 = window.scrollY;
    for (const s of this.shots) s.top = s.el.getBoundingClientRect().top + y0;
    const docEnd = document.documentElement.scrollHeight - vh;
    this.shots.forEach((s, i) => {
      s.start = i === 0 ? 0 : s.top - vh * 0.62;
    });
    this.shots.forEach((s, i) => {
      const next = this.shots[i + 1];
      s.end = next ? next.start : Math.max(docEnd, s.start + 1);
      s.len = i === 0 ? 0 : Math.max(1, Math.min(vh * 0.72, (s.end - s.start) * 0.62));
    });
    this.portrait = window.innerWidth / window.innerHeight < 1.5;
  }

  frame(s, k) {
    let zoom = lerp(s.z0, s.z1, easeInOut(clamp(k)));
    if (s.i === 0 && this.portrait) zoom *= 1.12;          // igual que las capas de la portada
    return { id: s.id, fx: s.fx, fy: s.fy, zoom };
  }

  onChange(fn) { this.listeners.push(fn); }

  update(y) {
    const shots = this.shots;
    if (!shots.length) return;
    let i = 0;
    for (let j = 0; j < shots.length; j++) if (shots[j].start <= y) i = j;
    const cur = shots[i];
    const prev = shots[i - 1];
    const t = cur.len ? clamp((y - cur.start) / cur.len) : 1;
    const k = clamp((y - cur.start) / (cur.end - cur.start));

    // movimiento suave del ratón (parallax de la lámina)
    this.shift[0] = lerp(this.shift[0], this.shiftTarget[0], 0.06);
    this.shift[1] = lerp(this.shift[1], this.shiftTarget[1], 0.06);
    const moving = Math.abs(this.shift[0] - this.shiftTarget[0]) + Math.abs(this.shift[1] - this.shiftTarget[1]) > 1e-4;

    let state;
    const B = this.frame(cur, k);
    if (!prev || t >= 1) {
      state = { a: B, b: null, p: 0, dir: cur.dir, dim: cur.dim };
    } else {
      const A = this.frame(prev, 1);
      if (prev.id === cur.id) {
        // misma lámina: solo cambia el encuadre
        const e = easeInOut(t);
        state = { a: { id: cur.id, fx: lerp(A.fx, B.fx, e), fy: lerp(A.fy, B.fy, e), zoom: lerp(A.zoom, B.zoom, e) }, b: null, p: 0, dir: cur.dir, dim: lerp(prev.dim, cur.dim, e) };
      } else {
        // si la de destino aún no está, esperar con la de origen
        if (!this.stage.isReady(cur.id)) this.stage.load(cur.id);
        state = { a: A, b: B, p: t, dir: cur.dir, dim: lerp(prev.dim, cur.dim, ease(t)), seed: i * 1.37 };
      }
    }
    state.shift = this.shift.slice();
    const key = JSON.stringify([state.a, state.b, state.p.toFixed(4), state.dim.toFixed(3), state.shift[0].toFixed(5), state.shift[1].toFixed(5)]);
    if (key !== this._key || moving) {
      this._key = key;
      this.stage.set(state);
    }
    // anticipar la carga de la siguiente
    const nxt = shots[i + 1];
    if (nxt && !this.stage.isReady(nxt.id)) this.stage.load(nxt.id);

    const settled = !prev || t >= 1;
    const info = { shot: cur, prev, t, k, settled, frame: settled ? B : null, y, dominant: t > 0.5 || !prev ? cur : prev };
    this.current = cur;
    for (const fn of this.listeners) fn(info);         // cada oyente compara y solo toca el DOM si cambia algo
  }
}
