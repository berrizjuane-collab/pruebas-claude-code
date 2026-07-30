/**
 * Every full-screen or modal layer: title, pause, death, dialogue, the weapon
 * comparison prompt, the vendor, area cards and the ending.
 */

import { TAU, clamp, rand } from '../core/util';
import { C, withAlpha } from '../art/palette';
import {
  FONT_DISPLAY,
  FONT_MONO,
  VIEW_H,
  VIEW_W,
  disc,
  fillRoundRect,
  glow,
  poly,
  ring,
  strokeRoundRect,
  text,
  wrapText,
} from '../core/render';
import { WEAPONS } from './weapons';
import { UPGRADES } from '../world/levels';
import type { Game } from './game';

// ------------------------------------------------------------------ portraits

export function drawPortrait(
  ctx: CanvasRenderingContext2D,
  face: string,
  x: number,
  y: number,
  s: number,
  color: string,
  time: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  // Frame
  ctx.fillStyle = 'rgba(6,8,20,0.9)';
  ctx.beginPath();
  ctx.roundRect?.(-30, -30, 60, 60, 8);
  if (!ctx.roundRect) ctx.rect(-30, -30, 60, 60);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect?.(-30, -30, 60, 60, 8);
  if (!ctx.roundRect) ctx.rect(-30, -30, 60, 60);
  ctx.clip();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 0, 6, 46, color, 0.22);
  ctx.restore();

  switch (face) {
    case 'vanta':
      // Hooded head, visor band.
      ctx.fillStyle = '#161f3d';
      ctx.beginPath();
      ctx.moveTo(-19, 26);
      ctx.quadraticCurveTo(-22, -14, 0, -20);
      ctx.quadraticCurveTo(22, -14, 19, 26);
      ctx.fill();
      ctx.strokeStyle = withAlpha(C.player, 0.85);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = '#0b1226';
      ctx.beginPath();
      ctx.ellipse(0, 2, 12, 13, 0, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = withAlpha(C.player, 0.95);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-11, 0);
      ctx.lineTo(11, 0);
      ctx.stroke();
      glow(ctx, 0, 0, 20, C.player, 0.45);
      ctx.restore();
      break;
    case 'signal': {
      // A waveform that never quite resolves into a face.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = withAlpha(C.ally, 0.85);
      ctx.lineWidth = 1.6;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        for (let i = -28; i <= 28; i++) {
          const yy =
            Math.sin(i * 0.28 + time * 3 + k * 2) * (7 - k * 2) +
            Math.sin(i * 0.1 + time) * 4 +
            k * 6 -
            6;
          if (i === -28) ctx.moveTo(i, yy);
          else ctx.lineTo(i, yy);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = withAlpha(C.ally, 0.6);
      ctx.beginPath();
      ctx.ellipse(0, 2, 13, 16, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'aurelion':
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) ring(ctx, 0, -6, 20 - i * 5, 1.5, '#ffe3a3', 0.5 - i * 0.12);
      glow(ctx, 0, 0, 34, '#fff7e0', 0.4);
      ctx.restore();
      ctx.fillStyle = '#fffdf5';
      ctx.beginPath();
      ctx.ellipse(0, 2, 12, 17, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(10,10,18,0.7)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 5; i++) {
        const yy = -12 + i * 7;
        ctx.beginPath();
        ctx.moveTo(-14, yy + Math.sin(time * 2 + i) * 1.5);
        ctx.lineTo(14, yy + Math.sin(time * 2 + i + 1) * 1.5);
        ctx.stroke();
      }
      break;
    case 'madrigal':
      ctx.fillStyle = '#33261a';
      poly(ctx, 0, 2, 20, 8, time * 0.2);
      ctx.fill();
      ctx.strokeStyle = withAlpha(C.amber, 0.9);
      ctx.lineWidth = 2;
      ctx.stroke();
      disc(ctx, 0, 0, 6, withAlpha(C.danger, 0.95));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, 0, 26, C.danger, 0.4);
      ctx.restore();
      break;
    case 'mnemosyne':
      ctx.fillStyle = '#f5eef2';
      ctx.beginPath();
      ctx.ellipse(0, 2, 14, 19, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = withAlpha(C.magenta, 0.9);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-4, -16);
      ctx.lineTo(2, -3);
      ctx.lineTo(-3, 6);
      ctx.lineTo(3, 18);
      ctx.stroke();
      ctx.fillStyle = '#1a0a1e';
      disc(ctx, -5, 0, 2.2, '#1a0a1e');
      disc(ctx, 5, 0, 2.2, '#1a0a1e');
      break;
    case 'verdant':
      ctx.fillStyle = '#e4efe8';
      ctx.beginPath();
      ctx.ellipse(0, 4, 13, 18, 0, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const a = -1.6 + i * 1.05;
        glow(ctx, Math.cos(a) * 16, Math.sin(a) * 12 - 6, 12, '#ff9ee8', 0.4);
      }
      ctx.restore();
      break;
    case 'archivist':
      ctx.fillStyle = '#1a2148';
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.lineTo(16, -2);
      ctx.lineTo(11, 22);
      ctx.lineTo(-11, 22);
      ctx.lineTo(-16, -2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = withAlpha('#8b9cff', 0.9);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = withAlpha('#8b9cff', 0.95);
      ctx.fillRect(-9, -6, 18, 4);
      break;
    case 'collector':
      ctx.fillStyle = '#2b2038';
      ctx.fillRect(-20, -14, 40, 34);
      ctx.strokeStyle = withAlpha(C.amber, 0.9);
      ctx.lineWidth = 2;
      ctx.strokeRect(-20, -14, 40, 34);
      disc(ctx, 0, 2, 7, withAlpha(C.amber, 0.9));
      break;
    case 'twins':
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(s * 10, 2);
        ctx.fillStyle = '#331630';
        poly(ctx, 0, 0, 11, 6, 0);
        ctx.fill();
        ctx.strokeStyle = withAlpha(s < 0 ? C.magenta : C.elite, 0.95);
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.restore();
      }
      break;
    case 'city':
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const h = 12 + ((i * 37) % 30);
        ctx.fillStyle = withAlpha(color, 0.35);
        ctx.fillRect(-26 + i * 8, 24 - h, 6, h);
      }
      glow(ctx, 0, 10, 34, color, 0.28);
      ctx.restore();
      break;
    case 'ui':
    default:
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ring(ctx, 0, 0, 15, 2, color, 0.8);
      ring(ctx, 0, 0, 9 + Math.sin(time * 3) * 2, 1.5, color, 0.5);
      glow(ctx, 0, 0, 26, color, 0.3);
      ctx.restore();
      break;
  }
  ctx.restore();
  strokeRoundRect(ctx, -30, -30, 60, 60, 8, withAlpha(color, 0.7), 1.5);
  ctx.restore();
}

// ------------------------------------------------------------------- dialogue

export function drawDialogue(ctx: CanvasRenderingContext2D, g: Game): void {
  const d = g.dialogue;
  if (!d) return;
  const line = d.lines[d.index];
  if (!line) return;
  const boxH = 132;
  const y = VIEW_H - boxH - 16;
  const x = 60;
  const w = VIEW_W - 120;

  ctx.save();
  ctx.globalAlpha = clamp(d.fade, 0, 1);
  // Backing
  fillRoundRect(ctx, x, y, w, boxH, 10, 'rgba(5,7,16,0.92)');
  strokeRoundRect(ctx, x, y, w, boxH, 10, withAlpha(line.color ?? C.ui, 0.75), 1.6);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x + 60, y + boxH / 2, 130, line.color ?? C.ui, 0.08);
  ctx.restore();

  drawPortrait(ctx, line.face ?? 'ui', x + 52, y + boxH / 2, 0.95, line.color ?? C.ui, g.time);

  text(ctx, line.speaker, x + 104, y + 26, {
    size: 14,
    color: line.color ?? C.ui,
    weight: '800',
    font: FONT_DISPLAY,
    glowColor: line.color,
    glowBlur: 10,
  });

  const shown = line.text.slice(0, Math.floor(d.chars));
  const lines = wrapText(ctx, shown, w - 140, 15, undefined, '500');
  lines.forEach((l, i) => {
    text(ctx, l, x + 104, y + 52 + i * 21, { size: 15, color: C.ui, weight: '500' });
  });

  // Choices
  if (line.choices && d.chars >= line.text.length) {
    line.choices.forEach((c, i) => {
      const cy = y + 56 + i * 22;
      const sel = d.choice === i;
      text(ctx, (sel ? '▸ ' : '  ') + c, x + w - 300, cy, {
        size: 13,
        color: sel ? C.white : withAlpha(C.uiDim, 0.9),
        weight: sel ? '800' : '600',
        glowColor: sel ? C.player : undefined,
        glowBlur: 10,
      });
    });
  } else {
    const done = d.chars >= line.text.length;
    text(ctx, done ? '[E] continuar' : '[E] acelerar', x + w - 14, y + boxH - 12, {
      size: 10,
      color: withAlpha(C.uiDim, 0.7 + (done ? 0.3 * Math.sin(g.time * 5) : 0)),
      align: 'right',
      weight: '700',
      font: FONT_MONO,
    });
  }
  text(ctx, '[ESC] omitir', x + 14, y + boxH - 12, {
    size: 10,
    color: withAlpha(C.uiDim, 0.5),
    weight: '700',
    font: FONT_MONO,
  });
  ctx.restore();
}

// ------------------------------------------------------------- area title card

export function drawAreaCard(ctx: CanvasRenderingContext2D, g: Game): void {
  const a = g.areaCardTimer;
  if (a <= 0) return;
  const k = clamp(a > 2.4 ? (3 - a) / 0.6 : a / 0.8, 0, 1);
  ctx.save();
  ctx.globalAlpha = k;
  const y = VIEW_H * 0.34;
  ctx.fillStyle = 'rgba(4,5,14,0.55)';
  ctx.fillRect(0, y - 46, VIEW_W, 96);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createLinearGradient(0, y, VIEW_W, y);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.5, withAlpha(g.theme.accent, 0.35));
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, y + 26, VIEW_W, 2);
  ctx.restore();
  text(ctx, g.areaCardTitle, VIEW_W / 2, y, {
    size: 34,
    color: C.white,
    align: 'center',
    baseline: 'middle',
    weight: '800',
    font: FONT_DISPLAY,
    glowColor: g.theme.accent,
    glowBlur: 24,
  });
  if (g.areaCardSub) {
    text(ctx, g.areaCardSub.toUpperCase(), VIEW_W / 2, y + 44, {
      size: 12,
      color: withAlpha(C.ui, 0.85),
      align: 'center',
      baseline: 'middle',
      weight: '700',
      font: FONT_MONO,
    });
  }
  ctx.restore();
}

// ------------------------------------------------------------- weapon compare

export function drawWeaponPrompt(ctx: CanvasRenderingContext2D, g: Game): void {
  const wp = g.weaponPrompt;
  if (!wp) return;
  const def = WEAPONS[wp.weaponId];
  const w = 660;
  const h = 300;
  const x = (VIEW_W - w) / 2;
  const y = (VIEW_H - h) / 2 - 10;
  ctx.save();
  ctx.fillStyle = 'rgba(2,3,10,0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  fillRoundRect(ctx, x, y, w, h, 12, 'rgba(7,9,20,0.97)');
  strokeRoundRect(ctx, x, y, w, h, 12, withAlpha(def.color, 0.9), 2);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x + w / 2, y, w * 0.6, def.color, 0.1);
  ctx.restore();

  text(ctx, 'ARMA ENCONTRADA', x + 26, y + 30, {
    size: 11,
    color: withAlpha(C.uiDim, 0.9),
    weight: '800',
    font: FONT_MONO,
  });
  text(ctx, def.name, x + 26, y + 58, {
    size: 24,
    color: C.white,
    weight: '800',
    font: FONT_DISPLAY,
    glowColor: def.color,
    glowBlur: 16,
  });
  text(ctx, def.type.toUpperCase(), x + 26, y + 78, {
    size: 11,
    color: def.color,
    weight: '800',
    font: FONT_MONO,
  });
  const flavour = wrapText(ctx, def.flavor, 330, 13, undefined, '500');
  flavour.forEach((l, i) =>
    text(ctx, l, x + 26, y + 104 + i * 18, { size: 13, color: withAlpha(C.ui, 0.85), weight: '500' }),
  );

  const stat = (label: string, value: number, sy: number, col: string): void => {
    text(ctx, label, x + 26, sy, { size: 11, color: C.uiDim, weight: '700', font: FONT_MONO });
    for (let i = 0; i < 5; i++) {
      const on = i < value;
      fillRoundRect(ctx, x + 100 + i * 18, sy - 8, 14, 8, 3, on ? col : 'rgba(255,255,255,0.12)');
    }
  };
  stat('DAÑO', def.dmgRating, y + 166, def.color);
  stat('ALCANCE', def.rangeRating, y + 188, def.color);
  stat('VELOCIDAD', def.speedRating, y + 210, def.color);

  text(ctx, `ESPECIAL · ${def.specialName}`, x + 26, y + 240, {
    size: 12,
    color: def.color,
    weight: '800',
    font: FONT_MONO,
  });
  const sp = wrapText(ctx, def.specialDesc, 330, 12, undefined, '500');
  sp.forEach((l, i) =>
    text(ctx, l, x + 26, y + 258 + i * 16, { size: 12, color: withAlpha(C.ui, 0.8), weight: '500' }),
  );

  // Slot choices on the right
  text(ctx, '¿DÓNDE LA EQUIPAS?', x + 400, y + 30, {
    size: 11,
    color: withAlpha(C.uiDim, 0.9),
    weight: '800',
    font: FONT_MONO,
  });
  wp.options.forEach((opt, i) => {
    const oy = y + 54 + i * 62;
    const sel = wp.index === i;
    const cur = opt.slot >= 0 ? g.player.slots[opt.slot] : null;
    const curDef = cur ? WEAPONS[cur] : null;
    fillRoundRect(ctx, x + 400, oy, 230, 52, 8, sel ? 'rgba(20,26,52,0.95)' : 'rgba(10,12,26,0.7)');
    strokeRoundRect(
      ctx,
      x + 400,
      oy,
      230,
      52,
      8,
      withAlpha(sel ? def.color : C.uiDim, sel ? 0.95 : 0.3),
      sel ? 2 : 1,
    );
    text(ctx, opt.label, x + 414, oy + 20, {
      size: 13,
      color: sel ? C.white : withAlpha(C.ui, 0.8),
      weight: '800',
    });
    text(
      ctx,
      opt.slot < 0 ? 'Dejarla aquí' : curDef ? `Sustituye: ${curDef.name}` : 'Ranura vacía',
      x + 414,
      oy + 38,
      {
        size: 11,
        color: opt.slot >= 0 && curDef ? withAlpha(C.danger, 0.9) : withAlpha(C.uiDim, 0.85),
        weight: '600',
        font: FONT_MONO,
      },
    );
  });
  text(ctx, '↑↓ elegir · [E] confirmar', x + 400, y + h - 16, {
    size: 11,
    color: withAlpha(C.uiDim, 0.8),
    weight: '700',
    font: FONT_MONO,
  });
  ctx.restore();
}

// ----------------------------------------------------------------------- shop

export function drawShop(ctx: CanvasRenderingContext2D, g: Game): void {
  const s = g.shop;
  if (!s) return;
  const w = 560;
  const h = 330;
  const x = (VIEW_W - w) / 2;
  const y = (VIEW_H - h) / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(2,3,10,0.75)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  fillRoundRect(ctx, x, y, w, h, 12, 'rgba(7,9,20,0.97)');
  strokeRoundRect(ctx, x, y, w, h, 12, withAlpha(C.pickup, 0.9), 2);
  text(ctx, 'KESH, EL DESPIERTO', x + 24, y + 34, {
    size: 20,
    color: C.pickup,
    weight: '800',
    font: FONT_DISPLAY,
    glowColor: C.pickup,
    glowBlur: 14,
  });
  text(ctx, `CRÉDITOS: ¤${g.progress.credits}`, x + w - 24, y + 34, {
    size: 13,
    color: C.white,
    align: 'right',
    weight: '800',
    font: FONT_MONO,
  });

  s.items.forEach((id, i) => {
    const u = UPGRADES[id];
    const oy = y + 58 + i * 48;
    const sel = s.index === i;
    const owned = g.progress.upgrades[id] ?? 0;
    const maxed = owned >= u.max;
    const afford = g.progress.credits >= u.price && !maxed;
    fillRoundRect(ctx, x + 20, oy, w - 40, 42, 8, sel ? 'rgba(20,26,52,0.95)' : 'rgba(10,12,26,0.6)');
    strokeRoundRect(ctx, x + 20, oy, w - 40, 42, 8, withAlpha(sel ? u.color : C.uiDim, sel ? 0.9 : 0.25), sel ? 2 : 1);
    text(ctx, u.name, x + 34, oy + 18, {
      size: 13,
      color: maxed ? withAlpha(C.uiDim, 0.7) : sel ? C.white : withAlpha(C.ui, 0.9),
      weight: '800',
    });
    text(ctx, u.desc, x + 34, oy + 34, {
      size: 11,
      color: withAlpha(C.uiDim, 0.85),
      weight: '500',
    });
    text(ctx, maxed ? 'MÁX.' : `¤${u.price}`, x + w - 34, oy + 24, {
      size: 14,
      color: maxed ? withAlpha(C.uiDim, 0.6) : afford ? C.pickup : withAlpha(C.danger, 0.9),
      align: 'right',
      weight: '800',
      font: FONT_MONO,
    });
    text(ctx, `${owned}/${u.max}`, x + w - 34, oy + 38, {
      size: 10,
      color: withAlpha(C.uiDim, 0.7),
      align: 'right',
      weight: '700',
      font: FONT_MONO,
    });
  });
  text(ctx, '↑↓ elegir · [E] comprar · [ESC] salir', x + 24, y + h - 18, {
    size: 11,
    color: withAlpha(C.uiDim, 0.8),
    weight: '700',
    font: FONT_MONO,
  });
  ctx.restore();
}

// ---------------------------------------------------------------------- pause

const CONTROLS: [string, string][] = [
  ['Mover', 'WASD / Flechas / Stick'],
  ['Atacar', 'Espacio · J · A'],
  ['Esquivar', 'Mayús · K · B'],
  ['Especial', 'F · L · X'],
  ['Interactuar', 'E · Enter · Y'],
  ['Cambiar arma', 'Q · Tab · RB'],
  ['Curar', 'H · R · LB'],
  ['Pausa', 'ESC · P · Start'],
];

export function drawPause(ctx: CanvasRenderingContext2D, g: Game): void {
  ctx.save();
  ctx.fillStyle = 'rgba(2,3,10,0.82)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  text(ctx, 'PAUSA', VIEW_W / 2, 82, {
    size: 42,
    color: C.white,
    align: 'center',
    weight: '800',
    font: FONT_DISPLAY,
    glowColor: C.magenta,
    glowBlur: 24,
  });

  // Menu
  g.pauseOptions.forEach((opt, i) => {
    const sel = g.pauseIndex === i;
    const y = 150 + i * 34;
    text(ctx, (sel ? '▸ ' : '') + opt, VIEW_W / 2 - 200, y, {
      size: 17,
      color: sel ? C.white : withAlpha(C.ui, 0.7),
      align: 'center',
      weight: sel ? '800' : '600',
      glowColor: sel ? C.player : undefined,
      glowBlur: 12,
    });
  });
  text(
    ctx,
    `Música ${g.settings.music ? 'ON' : 'OFF'} · SFX ${g.settings.sfx ? 'ON' : 'OFF'} · Bloom ${
      g.settings.bloom ? 'ON' : 'OFF'
    }`,
    VIEW_W / 2 - 200,
    150 + g.pauseOptions.length * 34 + 16,
    { size: 11, color: withAlpha(C.uiDim, 0.8), align: 'center', weight: '700', font: FONT_MONO },
  );

  // Controls
  text(ctx, 'CONTROLES', VIEW_W / 2 + 180, 140, {
    size: 12,
    color: C.uiDim,
    align: 'center',
    weight: '800',
    font: FONT_MONO,
  });
  CONTROLS.forEach(([k, v], i) => {
    const y = 168 + i * 22;
    text(ctx, k, VIEW_W / 2 + 70, y, { size: 12, color: withAlpha(C.ui, 0.9), weight: '700' });
    text(ctx, v, VIEW_W / 2 + 300, y, {
      size: 11,
      color: withAlpha(C.uiDim, 0.9),
      align: 'right',
      weight: '600',
      font: FONT_MONO,
    });
  });

  // Progress summary
  text(
    ctx,
    `Fragmentos ${g.progress.fragments}/4 · Créditos ¤${g.progress.credits} · ${g.areaLabel}`,
    VIEW_W / 2,
    VIEW_H - 34,
    { size: 12, color: withAlpha(C.uiDim, 0.9), align: 'center', weight: '700', font: FONT_MONO },
  );
  ctx.restore();
}

// ---------------------------------------------------------------------- death

export function drawDeath(ctx: CanvasRenderingContext2D, g: Game): void {
  const k = clamp(g.deathFade, 0, 1);
  ctx.save();
  ctx.fillStyle = `rgba(8,2,6,${0.86 * k})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.globalAlpha = k;
  text(ctx, 'SEÑAL PERDIDA', VIEW_W / 2, VIEW_H / 2 - 60, {
    size: 46,
    color: C.danger,
    align: 'center',
    weight: '800',
    font: FONT_DISPLAY,
    glowColor: C.danger,
    glowBlur: 28,
  });
  text(ctx, g.deathLine, VIEW_W / 2, VIEW_H / 2 - 18, {
    size: 14,
    color: withAlpha(C.ui, 0.85),
    align: 'center',
    weight: '500',
  });
  g.deathOptions.forEach((opt, i) => {
    const sel = g.deathIndex === i;
    text(ctx, (sel ? '▸ ' : '') + opt, VIEW_W / 2, VIEW_H / 2 + 36 + i * 32, {
      size: 18,
      color: sel ? C.white : withAlpha(C.ui, 0.65),
      align: 'center',
      weight: sel ? '800' : '600',
      glowColor: sel ? C.player : undefined,
      glowBlur: 12,
    });
  });
  text(ctx, 'Reaparecerás en el último anclaje con la vida al máximo.', VIEW_W / 2, VIEW_H - 60, {
    size: 12,
    color: withAlpha(C.uiDim, 0.8),
    align: 'center',
    weight: '600',
    font: FONT_MONO,
  });
  ctx.restore();
}

// ---------------------------------------------------------------------- title

export function drawTitle(ctx: CanvasRenderingContext2D, g: Game): void {
  const t = g.time;
  // Backdrop is already drawn; add a dark scrim for text legibility.
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, 'rgba(3,2,10,0.55)');
  grad.addColorStop(0.55, 'rgba(3,2,10,0.8)');
  grad.addColorStop(1, 'rgba(3,2,10,0.95)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Logo
  const cx = VIEW_W / 2;
  const ly = 128;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, cx, ly, 300, C.magenta, 0.12);
  ctx.restore();
  // Chromatic offset title
  for (const [dx, dy, col, a] of [
    [-3, 0, C.magenta, 0.75],
    [3, 0, C.cyan, 0.75],
    [0, 0, '#ffffff', 1],
  ] as const) {
    text(ctx, 'NEON WRAITHS', cx + dx + Math.sin(t * 1.3) * 1.2, ly + dy, {
      size: 74,
      color: withAlpha(col, a),
      align: 'center',
      baseline: 'middle',
      weight: '800',
      font: FONT_DISPLAY,
    });
  }
  text(ctx, 'N E X U S — 9', cx, ly + 52, {
    size: 15,
    color: withAlpha(C.ui, 0.85),
    align: 'center',
    baseline: 'middle',
    weight: '700',
    font: FONT_MONO,
  });

  const desc =
    'Una IA llamada AURELION está borrando los recuerdos de una ciudad entera. ' +
    'Eres Vanta: cruza cuatro estratos de Nexus-9, recupera el Protocolo Fantasma y llega al núcleo.';
  wrapText(ctx, desc, 620, 14, undefined, '500').forEach((l, i) => {
    text(ctx, l, cx, 208 + i * 20, {
      size: 14,
      color: withAlpha(C.ui, 0.78),
      align: 'center',
      weight: '500',
    });
  });

  // Menu
  g.titleOptions.forEach((opt, i) => {
    const sel = g.titleIndex === i;
    const y = 290 + i * 40;
    if (sel) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, cx, y, 160, C.player, 0.14);
      ctx.restore();
      // Selection brackets
      const wSel = 150;
      ctx.strokeStyle = withAlpha(C.player, 0.9);
      ctx.lineWidth = 2;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + s * wSel - s * 12, y - 14);
        ctx.lineTo(cx + s * wSel, y - 14);
        ctx.lineTo(cx + s * wSel, y + 14);
        ctx.lineTo(cx + s * wSel - s * 12, y + 14);
        ctx.stroke();
      }
    }
    text(ctx, opt, cx, y, {
      size: 22,
      color: sel ? C.white : withAlpha(C.ui, 0.6),
      align: 'center',
      baseline: 'middle',
      weight: '800',
      font: FONT_DISPLAY,
    });
  });

  if (g.titleIndex === 1) {
    // Controls panel
    const px = cx - 230;
    const py = 380;
    fillRoundRect(ctx, px, py, 460, 130, 10, 'rgba(6,8,20,0.85)');
    strokeRoundRect(ctx, px, py, 460, 130, 10, withAlpha(C.player, 0.5), 1.4);
    CONTROLS.forEach(([k, v], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      text(ctx, k, px + 20 + col * 230, py + 26 + row * 26, {
        size: 12,
        color: withAlpha(C.ui, 0.9),
        weight: '700',
      });
      text(ctx, v, px + 215 + col * 230, py + 26 + row * 26, {
        size: 10,
        color: withAlpha(C.uiDim, 0.9),
        align: 'right',
        weight: '600',
        font: FONT_MONO,
      });
    });
  } else if (g.titleIndex === 2) {
    const px = cx - 230;
    const py = 380;
    fillRoundRect(ctx, px, py, 460, 130, 10, 'rgba(6,8,20,0.85)');
    strokeRoundRect(ctx, px, py, 460, 130, 10, withAlpha(C.magenta, 0.5), 1.4);
    const rows: [string, string][] = [
      ['Música', g.settings.music ? 'ACTIVADA' : 'SILENCIADA'],
      ['Efectos de sonido', g.settings.sfx ? 'ACTIVADOS' : 'SILENCIADOS'],
      ['Bloom / resplandor', g.settings.bloom ? 'ACTIVADO' : 'DESACTIVADO'],
      ['Sacudida de cámara', g.settings.shake ? 'ACTIVADA' : 'REDUCIDA'],
    ];
    rows.forEach(([k, v], i) => {
      const sel = g.optionIndex === i;
      text(ctx, (sel ? '▸ ' : '  ') + k, px + 20, py + 28 + i * 26, {
        size: 13,
        color: sel ? C.white : withAlpha(C.ui, 0.85),
        weight: sel ? '800' : '600',
      });
      text(ctx, v, px + 440, py + 28 + i * 26, {
        size: 11,
        color: withAlpha(C.magenta, 0.9),
        align: 'right',
        weight: '700',
        font: FONT_MONO,
      });
    });
    text(ctx, '←→ o [E] para alternar', px + 20, py + 122, {
      size: 10,
      color: withAlpha(C.uiDim, 0.7),
      weight: '600',
      font: FONT_MONO,
    });
  }

  text(ctx, 'Hecho con Canvas 2D y WebAudio. Sin dependencias externas.', cx, VIEW_H - 24, {
    size: 10,
    color: withAlpha(C.uiDim, 0.55),
    align: 'center',
    weight: '600',
    font: FONT_MONO,
  });
}

// -------------------------------------------------------------------- ending

export function drawEnding(ctx: CanvasRenderingContext2D, g: Game): void {
  const t = g.endingTimer;
  ctx.save();
  // Sky turning from night to a real sunrise.
  const k = clamp((t - 1) / 16, 0, 1);
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, `rgb(${Math.round(6 + k * 40)},${Math.round(4 + k * 22)},${Math.round(18 + k * 30)})`);
  grad.addColorStop(0.6, `rgb(${Math.round(12 + k * 210)},${Math.round(8 + k * 96)},${Math.round(28 + k * 44)})`);
  grad.addColorStop(1, `rgb(${Math.round(20 + k * 235)},${Math.round(12 + k * 150)},${Math.round(34 + k * 70)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Sun
  const sunY = VIEW_H * 0.72 - k * VIEW_H * 0.22;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, VIEW_W * 0.62, sunY, 260 * (0.4 + k), '#ffd08a', 0.4 * k);
  disc(ctx, VIEW_W * 0.62, sunY, 46 * (0.5 + k * 0.6), withAlpha('#fff2cf', 0.9 * k));
  ctx.restore();

  // Skyline silhouette
  ctx.fillStyle = 'rgba(4,3,10,0.92)';
  let x = -30;
  let i = 0;
  while (x < VIEW_W + 40) {
    const h = 60 + ((i * 97) % 170);
    const w = 30 + ((i * 53) % 60);
    ctx.fillRect(x, VIEW_H - h, w, h);
    // A few windows lighting up as memories return
    for (let j = 0; j < 5; j++) {
      const lit = Math.sin(t * 0.7 + i * 2 + j) > 0.2 - k;
      if (!lit) continue;
      ctx.fillStyle = withAlpha('#ffd166', 0.55);
      ctx.fillRect(x + 6 + ((j * 13) % Math.max(1, w - 12)), VIEW_H - h + 12 + j * 18, 4, 5);
      ctx.fillStyle = 'rgba(4,3,10,0.92)';
    }
    x += w + 8;
    i++;
  }

  // Vanta on the ledge, looking out
  const vx = VIEW_W * 0.3;
  const vy = VIEW_H - 132;
  ctx.fillStyle = 'rgba(3,2,8,0.95)';
  ctx.fillRect(vx - 90, vy + 34, 200, 120);
  ctx.save();
  ctx.translate(vx, vy);
  ctx.fillStyle = '#0d1226';
  ctx.beginPath();
  ctx.moveTo(-11, 34);
  ctx.quadraticCurveTo(-15, -6, 0, -14);
  ctx.quadraticCurveTo(15, -6, 11, 34);
  ctx.fill();
  disc(ctx, 0, -18, 8, '#0d1226');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 4, -18, 16, C.player, 0.5);
  ctx.restore();
  // Coat edge catching the sunrise
  ctx.strokeStyle = withAlpha('#ffb877', 0.6 * k);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(11, 34);
  ctx.quadraticCurveTo(15, -6, 0, -14);
  ctx.stroke();
  ctx.restore();

  // Rain stopping: fewer and fewer drops
  if (k < 0.7) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = withAlpha('#9fd8ff', 0.35 * (1 - k / 0.7));
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let d = 0; d < 60; d++) {
      const dx = (d * 137 + t * 400) % VIEW_W;
      const dy = (d * 271 + t * 900) % VIEW_H;
      ctx.moveTo(dx, dy);
      ctx.lineTo(dx - 2, dy + 14);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

export function drawCredits(ctx: CanvasRenderingContext2D, g: Game): void {
  const t = g.creditsTimer;
  ctx.save();
  ctx.fillStyle = 'rgba(3,2,10,0.9)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const lines: [string, number][] = [
    ['NEON WRAITHS', 34],
    ['', 10],
    ['Nexus-9 recuerda.', 16],
    ['', 24],
    [`Fragmentos recuperados: ${g.progress.fragments}/4`, 14],
    [`Créditos acumulados: ¤${g.progress.credits}`, 14],
    [`Enemigos derrotados: ${g.progress.kills}`, 14],
    [`Muertes: ${g.progress.deaths}`, 14],
    ['', 24],
    ['Diseño, código y arte generados en tiempo real', 12],
    ['Canvas 2D · WebAudio · sin assets externos', 12],
    ['', 24],
    ['[E] volver al inicio', 14],
  ];
  let y = 120 - Math.max(0, (t - 6) * 12);
  for (const [l, size] of lines) {
    if (l)
      text(ctx, l, VIEW_W / 2, y, {
        size,
        color: size > 20 ? C.white : withAlpha(C.ui, 0.85),
        align: 'center',
        weight: size > 20 ? '800' : '600',
        font: size > 20 ? FONT_DISPLAY : undefined,
        glowColor: size > 20 ? C.magenta : undefined,
        glowBlur: 18,
      });
    y += size + 12;
  }
  ctx.restore();
}

/** Small animated flourish used behind the title screen. */
export function drawTitleAmbience(ctx: CanvasRenderingContext2D, time: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 12; i++) {
    const a = time * 0.25 + i;
    const x = ((i * 97 + time * 22) % (VIEW_W + 120)) - 60;
    const y = 60 + ((i * 53) % (VIEW_H - 120));
    disc(ctx, x, y + Math.sin(a) * 12, 1.4, withAlpha(i % 2 ? C.magenta : C.cyan, 0.4));
  }
  ctx.restore();
  void rand;
}
