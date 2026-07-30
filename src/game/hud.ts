/**
 * In-game HUD. Minimal by design: health, charge, the two equipped weapons,
 * the current objective, and a boss bar when one is alive. Nothing else ever
 * covers the play area.
 */

import { clamp } from '../core/util';
import { C, withAlpha } from '../art/palette';
import {
  FONT_DISPLAY,
  FONT_MONO,
  VIEW_H,
  VIEW_W,
  fillRoundRect,
  glow,
  strokeRoundRect,
  text,
} from '../core/render';
import { WEAPONS } from './weapons';
import type { Game } from './game';

const PAD = 18;

function bar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  k: number,
  color: string,
  bg = 'rgba(6,8,18,0.75)',
): void {
  fillRoundRect(ctx, x, y, w, h, h / 2, bg);
  const fw = Math.max(0, w * clamp(k, 0, 1));
  if (fw > 1) {
    ctx.save();
    fillRoundRect(ctx, x, y, fw, h, h / 2, color);
    ctx.globalCompositeOperation = 'lighter';
    fillRoundRect(ctx, x, y, fw, h / 2.2, h / 4, withAlpha('#ffffff', 0.22));
    ctx.restore();
  }
  strokeRoundRect(ctx, x, y, w, h, h / 2, withAlpha('#ffffff', 0.16), 1);
}

export function drawHud(ctx: CanvasRenderingContext2D, g: Game): void {
  const p = g.player;
  const t = g.time;

  // ---- health
  const hpW = 232;
  const hpK = p.hp / p.maxHp;
  const hpCol = hpK > 0.55 ? C.heal : hpK > 0.28 ? C.telegraph : C.danger;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, PAD + 40, PAD + 14, 70, hpCol, 0.1);
  ctx.restore();
  bar(ctx, PAD, PAD, hpW, 14, hpK, hpCol);
  text(ctx, `${Math.ceil(p.hp)}`, PAD + 8, PAD + 7, {
    size: 11,
    color: '#04060f',
    baseline: 'middle',
    weight: '800',
    font: FONT_MONO,
  });
  text(ctx, `/ ${p.maxHp}`, PAD + hpW + 8, PAD + 7, {
    size: 11,
    color: C.uiDim,
    baseline: 'middle',
    weight: '700',
    font: FONT_MONO,
  });

  // ---- energy
  bar(ctx, PAD, PAD + 20, hpW * 0.72, 7, p.energy / p.maxEnergy, C.energy);

  // ---- heal charges
  const charges = p.stats.healCharges;
  for (let i = 0; i < p.stats.maxHealCharges; i++) {
    const cx = PAD + 6 + i * 17;
    const cy = PAD + 42;
    const on = i < charges;
    ctx.save();
    if (on) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, cx, cy, 16, C.heal, 0.5);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.strokeStyle = withAlpha(on ? C.heal : C.uiDim, on ? 0.95 : 0.35);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect?.(cx - 5, cy - 7, 10, 14, 4);
    if (!ctx.roundRect) ctx.rect(cx - 5, cy - 7, 10, 14);
    ctx.stroke();
    if (on) {
      ctx.fillStyle = withAlpha(C.heal, 0.7);
      ctx.fillRect(cx - 3, cy - 2, 6, 7);
    }
    ctx.restore();
  }
  text(ctx, '[H] CURAR', PAD + 6 + p.stats.maxHealCharges * 17 + 6, PAD + 42, {
    size: 9,
    color: C.uiDim,
    baseline: 'middle',
    weight: '700',
    font: FONT_MONO,
  });

  // ---- weapon slots
  const slotY = VIEW_H - PAD - 54;
  for (let i = 0; i < 2; i++) {
    const id = p.slots[i];
    const x = PAD + i * 92;
    const activeSlot = p.active === i;
    const def = id ? WEAPONS[id] : null;
    ctx.save();
    fillRoundRect(ctx, x, slotY, 84, 54, 8, activeSlot ? 'rgba(14,20,42,0.9)' : 'rgba(8,10,22,0.68)');
    strokeRoundRect(
      ctx,
      x,
      slotY,
      84,
      54,
      8,
      withAlpha(def ? def.color : C.uiDim, activeSlot ? 0.95 : 0.28),
      activeSlot ? 2 : 1,
    );
    if (activeSlot && def) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x + 42, slotY + 27, 54, def.color, 0.12);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (def) {
      def.icon(ctx, x + 20, slotY + 22, 1, activeSlot ? def.color : withAlpha(def.color, 0.5));
      const short = def.name.split('«')[1]?.replace('»', '') ?? def.name.split(' ')[0];
      text(ctx, short.toUpperCase(), x + 38, slotY + 18, {
        size: 10,
        color: activeSlot ? C.white : C.uiDim,
        weight: '800',
        font: FONT_DISPLAY,
      });
      // Special readiness
      const ready = p.energy >= def.energyCost;
      text(
        ctx,
        def.energyCost > 0 ? `[F] ${def.specialName}` : `[F] ${def.specialName}`,
        x + 8,
        slotY + 44,
        {
          size: 9,
          color: ready ? withAlpha(def.color, 0.95) : withAlpha(C.uiDim, 0.7),
          weight: '700',
          font: FONT_MONO,
        },
      );
      if (def.energyCost > 0) {
        bar(ctx, x + 8, slotY + 30, 68, 4, clamp(p.energy / def.energyCost, 0, 1), withAlpha(def.color, 0.9));
      }
    } else {
      text(ctx, 'VACÍO', x + 42, slotY + 27, {
        size: 11,
        color: withAlpha(C.uiDim, 0.5),
        align: 'center',
        baseline: 'middle',
        weight: '700',
      });
    }
    text(ctx, `${i + 1}`, x + 74, slotY + 12, {
      size: 10,
      color: withAlpha(C.uiDim, 0.8),
      weight: '800',
      font: FONT_MONO,
    });
    ctx.restore();
  }
  if (p.slots[0] && p.slots[1]) {
    text(ctx, '[Q] cambiar', PAD, VIEW_H - PAD + 2, {
      size: 9,
      color: withAlpha(C.uiDim, 0.75),
      weight: '700',
      font: FONT_MONO,
    });
  }

  // ---- objective + fragments + credits (top right)
  const rx = VIEW_W - PAD;
  text(ctx, g.objective.toUpperCase(), rx, PAD + 6, {
    size: 12,
    color: C.ui,
    align: 'right',
    baseline: 'middle',
    weight: '800',
    font: FONT_DISPLAY,
  });
  text(ctx, g.areaLabel, rx, PAD + 22, {
    size: 10,
    color: withAlpha(C.uiDim, 0.9),
    align: 'right',
    baseline: 'middle',
    weight: '700',
    font: FONT_MONO,
  });

  // fragments
  for (let i = 0; i < 4; i++) {
    const fx = rx - 12 - i * 20;
    const has = g.progress.fragments > 3 - i;
    ctx.save();
    ctx.translate(fx, PAD + 44);
    ctx.rotate(Math.PI / 4 + (has ? t * 0.6 : 0));
    if (has) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, 0, 18, C.ally, 0.55);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fillStyle = has ? withAlpha(C.ally, 0.9) : 'rgba(10,14,28,0.7)';
    ctx.fillRect(-5, -5, 10, 10);
    ctx.strokeStyle = withAlpha(has ? C.ally : C.uiDim, has ? 1 : 0.4);
    ctx.lineWidth = 1.4;
    ctx.strokeRect(-5, -5, 10, 10);
    ctx.restore();
  }
  text(ctx, `¤ ${g.progress.credits}`, rx, PAD + 66, {
    size: 11,
    color: C.pickup,
    align: 'right',
    baseline: 'middle',
    weight: '800',
    font: FONT_MONO,
  });

  // ---- low health warning
  if (hpK < 0.3 && !p.dead) {
    const pulse = 0.28 + 0.18 * Math.sin(t * 6);
    const grad = ctx.createRadialGradient(
      VIEW_W / 2,
      VIEW_H / 2,
      VIEW_H * 0.3,
      VIEW_W / 2,
      VIEW_H / 2,
      VIEW_H * 0.8,
    );
    grad.addColorStop(0, 'rgba(255,39,64,0)');
    grad.addColorStop(1, `rgba(255,39,64,${pulse * (1 - hpK / 0.3)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // ---- boss bar
  if (g.bossBar) {
    const b = g.bossBar;
    const w = 520;
    const x = (VIEW_W - w) / 2;
    const y = VIEW_H - 78;
    ctx.save();
    text(ctx, b.name, VIEW_W / 2, y - 20, {
      size: 20,
      color: C.white,
      align: 'center',
      weight: '800',
      font: FONT_DISPLAY,
      glowColor: C.danger,
      glowBlur: 16,
    });
    if (b.subtitle) {
      text(ctx, b.subtitle, VIEW_W / 2, y - 5, {
        size: 10,
        color: withAlpha(C.ui, 0.8),
        align: 'center',
        weight: '700',
        font: FONT_MONO,
      });
    }
    bar(ctx, x, y + 2, w, 13, b.hp / b.maxHp, C.danger, 'rgba(10,4,12,0.85)');
    // Phase pips
    for (let i = 0; i < b.phases; i++) {
      const px = x + (w * (i + 1)) / b.phases;
      if (i < b.phases - 1) {
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, y + 2);
        ctx.lineTo(px, y + 15);
        ctx.stroke();
      }
    }
    text(ctx, `FASE ${b.phase}/${b.phases}`, x + w, y + 24, {
      size: 10,
      color: withAlpha(C.danger, 0.9),
      align: 'right',
      weight: '800',
      font: FONT_MONO,
    });
    ctx.restore();
  }

  // ---- transient toast (upgrades, fragments…)
  if (g.toast && g.toastTimer > 0) {
    const a = clamp(g.toastTimer, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    const w = 380;
    const x = (VIEW_W - w) / 2;
    fillRoundRect(ctx, x, 96, w, 44, 8, 'rgba(8,10,22,0.9)');
    strokeRoundRect(ctx, x, 96, w, 44, 8, withAlpha(g.toastColor, 0.9), 1.5);
    text(ctx, g.toast, VIEW_W / 2, 118, {
      size: 14,
      color: g.toastColor,
      align: 'center',
      baseline: 'middle',
      weight: '800',
      font: FONT_DISPLAY,
      glowColor: g.toastColor,
      glowBlur: 12,
    });
    ctx.restore();
  }
}

/** Floating enemy/NPC lines, drawn in world space. */
export function drawBarks(ctx: CanvasRenderingContext2D, g: Game): void {
  for (const b of g.barks) {
    const a = clamp(b.life / 0.6, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    text(ctx, b.text, b.x, b.y - (1 - Math.min(1, b.life / b.max)) * 14, {
      size: 12,
      color: b.color,
      align: 'center',
      weight: '700',
      glowColor: '#000000',
      glowBlur: 6,
    });
    ctx.restore();
  }
}
