/* Annapurna — el aire.
   Motas que cruzan por delante de la pintura: polen en la pradera, nieve en el
   campo base, ventisca en la arista, pétalos de rododendro al amanecer. Son
   pocas y pequeñas a propósito: tienen que leerse como grano del papel que se
   mueve, no como un efecto. Se apagan con «reducir movimiento». */
(function (A) {
  'use strict';

  /* cuántas (en una pantalla de 1440×900), velocidad en px/s, tamaño en px */
  var AMBIENTES = {
    polen:    { n: 26, vx: [14, 34],   vy: [-10, 6],  r: [0.8, 1.9], color: '240,236,224', alfa: [0.35, 0.8], vaiven: 16, forma: 'mota' },
    nieve:    { n: 70, vx: [-26, -8],  vy: [34, 78],  r: [0.9, 2.3], color: '244,241,232', alfa: [0.4, 0.9],  vaiven: 12, forma: 'mota' },
    copos:    { n: 20, vx: [-10, 4],   vy: [16, 34],  r: [0.8, 1.8], color: '226,230,240', alfa: [0.3, 0.7],  vaiven: 10, forma: 'mota' },
    ventisca: { n: 64, vx: [190, 420], vy: [-16, 34], r: [0.7, 1.6], color: '244,241,232', alfa: [0.25, 0.7], vaiven: 6,  forma: 'racha' },
    petalos:  { n: 14, vx: [10, 30],   vy: [14, 34],  r: [1.8, 3.2], color: '206,84,92',   alfa: [0.6, 0.95], vaiven: 22, forma: 'petalo' }
  };

  function entre(par) { return par[0] + Math.random() * (par[1] - par[0]); }

  function Aire(lienzo) {
    this.lienzo = lienzo;
    this.ctx = lienzo.getContext('2d');
    this.capas = [];            // { amb, motas, peso, destino }
    this.w = 1; this.h = 1; this.dpr = 1;
    this.antes = 0;
    this.medir();
  }

  Aire.prototype.medir = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = this.lienzo.clientWidth || 1;
    this.h = this.lienzo.clientHeight || 1;
    this.dpr = dpr;
    this.lienzo.width = Math.round(this.w * dpr);
    this.lienzo.height = Math.round(this.h * dpr);
  };

  Aire.prototype._sembrar = function (nombre) {
    var amb = AMBIENTES[nombre];
    var n = Math.round(amb.n * Math.min(1.4, Math.max(0.45, (this.w * this.h) / (1440 * 900))));
    var motas = [];
    for (var i = 0; i < n; i++) {
      motas.push({
        x: Math.random() * this.w, y: Math.random() * this.h,
        vx: entre(amb.vx), vy: entre(amb.vy), r: entre(amb.r), a: entre(amb.alfa),
        f: Math.random() * 6.283, w: 0.5 + Math.random() * 1.2
      });
    }
    return { nombre: nombre, amb: amb, motas: motas, peso: 0, destino: 1 };
  };

  /* Cambia de ambiente con un fundido. `nombre` puede ser null (aire quieto). */
  Aire.prototype.poner = function (nombre) {
    if (this.actual === nombre) return;
    this.actual = nombre;
    this.capas.forEach(function (c) { c.destino = 0; });
    if (nombre && AMBIENTES[nombre]) this.capas.push(this._sembrar(nombre));
  };

  Aire.prototype.paso = function (ahora) {
    var dt = Math.min(0.05, (ahora - (this.antes || ahora)) / 1000);
    this.antes = ahora;
    var ctx = this.ctx, w = this.w, h = this.h, t = ahora / 1000;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (var k = this.capas.length - 1; k >= 0; k--) {
      var c = this.capas[k], amb = c.amb;
      c.peso += (c.destino - c.peso) * Math.min(1, dt * 1.6);
      if (c.destino === 0 && c.peso < 0.02) { this.capas.splice(k, 1); continue; }
      ctx.lineCap = 'round';
      for (var i = 0; i < c.motas.length; i++) {
        var m = c.motas[i];
        var sx = Math.sin(t * m.w + m.f) * amb.vaiven;
        m.x += (m.vx + sx) * dt;
        m.y += (m.vy + Math.cos(t * m.w * 0.7 + m.f) * amb.vaiven * 0.5) * dt;
        if (m.x > w + 20) m.x = -20; else if (m.x < -20) m.x = w + 20;
        if (m.y > h + 20) m.y = -20; else if (m.y < -20) m.y = h + 20;
        var alfa = m.a * c.peso;
        if (amb.forma === 'racha') {
          ctx.strokeStyle = 'rgba(' + amb.color + ',' + alfa + ')';
          ctx.lineWidth = m.r;
          ctx.beginPath();
          ctx.moveTo(m.x, m.y);
          ctx.lineTo(m.x - m.vx * 0.035, m.y - m.vy * 0.035);
          ctx.stroke();
        } else if (amb.forma === 'petalo') {
          ctx.fillStyle = 'rgba(' + amb.color + ',' + alfa + ')';
          ctx.beginPath();
          ctx.ellipse(m.x, m.y, m.r, m.r * 0.55, t * m.w + m.f, 0, 6.283);
          ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(' + amb.color + ',' + alfa + ')';
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.r, 0, 6.283);
          ctx.fill();
        }
      }
    }
    return this.capas.length > 0;
  };

  A.Aire = Aire;
})(window.Annapurna);
