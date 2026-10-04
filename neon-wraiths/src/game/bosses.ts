/**
 * Bosses reuse the Enemy container (same damage, stagger and draw plumbing) but
 * their behaviours are phase machines with named moves. Every dangerous move is
 * announced by a telegraph zone or an amber wind-up before it can hurt you.
 *
 * Shared conventions:
 *   e.data.phase  current phase (1-based)
 *   e.data.move   name of the move being executed ('' = idle/reposition)
 *   e.data.sub    sub-step counter inside a move
 *   e.data.invuln >0 means damage is ignored (phase transitions only)
 *   e.data.vuln   incoming damage multiplier (weak points)
 */

import { TAU, clamp, damp, dist, rand, pick, chance, angleDelta } from '../core/util';
import { C, withAlpha, mix } from '../art/palette';
import { disc, glow, line, poly, ring, text } from '../core/render';
import type { Projectile, World, Zone } from './api';
import { ENEMY_DEFS, type Enemy, type EnemyDef } from './enemies';

// ------------------------------------------------------------------- helpers

function tele(
  w: World,
  x: number,
  y: number,
  radius: number,
  warn: number,
  damage: number,
  color = C.danger,
  live = 0.22,
  knockback = 320,
): Zone {
  return w.spawnZone({
    x,
    y,
    radius,
    shape: 'circle',
    faction: 'enemy',
    warn,
    live,
    damage,
    mode: 'burst',
    color,
    knockback,
  });
}

function beam(
  w: World,
  x: number,
  y: number,
  angle: number,
  len: number,
  halfW: number,
  warn: number,
  damage: number,
  color = C.danger,
  live = 0.3,
): Zone {
  return w.spawnZone({
    x,
    y,
    angle,
    len,
    halfW,
    shape: 'rect',
    faction: 'enemy',
    warn,
    live,
    damage,
    mode: 'burst',
    color,
    knockback: 280,
  });
}

interface ShotOpts {
  speed?: number;
  damage?: number;
  kind?: Projectile['kind'];
  color?: string;
  radius?: number;
  size?: number;
  life?: number;
  homing?: number;
  deflectable?: boolean;
}

function radial(e: Enemy, w: World, count: number, offset: number, opts: ShotOpts = {}): void {
  for (let i = 0; i < count; i++) {
    const a = offset + (i / count) * TAU;
    w.spawnProjectile({
      x: e.x + Math.cos(a) * (e.radius * 0.7),
      y: e.y + Math.sin(a) * (e.radius * 0.7),
      vx: Math.cos(a) * (opts.speed ?? 240),
      vy: Math.sin(a) * (opts.speed ?? 240),
      radius: opts.radius ?? 8,
      damage: opts.damage ?? 10,
      faction: 'enemy',
      kind: opts.kind ?? 'orb',
      color: opts.color ?? C.enemy,
      maxLife: opts.life ?? 3,
      size: opts.size ?? 11,
      angle: a,
      deflectable: opts.deflectable ?? true,
    });
  }
}

function aimShot(e: Enemy, w: World, spread: number, opts: ShotOpts = {}): void {
  const a = w.angleToPlayer(e.x, e.y) + spread;
  w.spawnProjectile({
    x: e.x + Math.cos(a) * e.radius * 0.8,
    y: e.y + Math.sin(a) * e.radius * 0.8,
    vx: Math.cos(a) * (opts.speed ?? 300),
    vy: Math.sin(a) * (opts.speed ?? 300),
    radius: opts.radius ?? 8,
    damage: opts.damage ?? 11,
    faction: 'enemy',
    kind: opts.kind ?? 'orb',
    color: opts.color ?? C.enemy,
    maxLife: opts.life ?? 3,
    homing: opts.homing ?? 0,
    size: opts.size ?? 11,
    angle: a,
    deflectable: opts.deflectable ?? true,
  });
}

/** Reposition between moves: bosses drift to a comfortable range, never camp. */
function reposition(e: Enemy, w: World, dt: number, speed: number, ideal: number): void {
  const p = w.playerActor;
  const d = w.distToPlayer(e.x, e.y);
  const a = Math.atan2(p.y - e.y, p.x - e.x);
  e.facing += angleDelta(e.facing, a) * clamp(dt * 4, 0, 1);
  if (d > ideal * 1.15) {
    e.moveX = Math.cos(a) * speed;
    e.moveY = Math.sin(a) * speed;
  } else if (d < ideal * 0.7) {
    e.moveX = -Math.cos(a) * speed * 0.8;
    e.moveY = -Math.sin(a) * speed * 0.8;
  } else {
    const s = a + Math.PI / 2 * (e.data.dir || 1);
    e.moveX = Math.cos(s) * speed * 0.55;
    e.moveY = Math.sin(s) * speed * 0.55;
    if (chance(0.004)) e.data.dir = (e.data.dir || 1) * -1;
  }
}

/** Phase advance on HP thresholds, with a short invulnerable "roar" beat. */
function phaseCheck(
  e: Enemy,
  w: World,
  thresholds: number[],
  onPhase: (phase: number) => void,
): void {
  const k = e.hp / e.maxHp;
  const target = 1 + thresholds.filter((t) => k <= t).length;
  if (target > (e.data.phase ?? 1)) {
    e.data.phase = target;
    e.data.move = 0;
    e.data.invuln = 1.5;
    e.data.roar = 1.5;
    e.t = 0;
    w.sfx('bossRoar');
    w.shake(12, 2);
    w.fx.shockwave(e.x, e.y, 320, e.def.accent, 0.8, 6);
    w.fx.burst(e.x, e.y, 40, e.def.accent, { speed: 320, life: 0.8 });
    w.glitch(0.5, 0.6);
    onPhase(target);
  }
}

function bossCommon(e: Enemy, dt: number): void {
  if (e.data.invuln) e.data.invuln = Math.max(0, e.data.invuln - dt);
  if (e.data.roar) e.data.roar = Math.max(0, e.data.roar - dt);
  e.data.vuln = e.data.vuln ?? 1;
}

/** Move names are stored as numbers to keep the scratch bag monomorphic. */
const MOVE = {
  none: 0,
  a: 1,
  b: 2,
  c: 3,
  d: 4,
  e: 5,
  f: 6,
} as const;

function startMove(e: Enemy, move: number): void {
  e.data.move = move;
  e.data.sub = 0;
  e.t = 0;
}

function endMove(e: Enemy, cd: number): void {
  e.data.move = MOVE.none;
  e.cd = cd;
  e.t = 0;
}

// ==========================================================================
//  EL RECOLECTOR — miniboss del prólogo
// ==========================================================================

const collector: EnemyDef = {
  id: 'collector',
  name: 'EL RECOLECTOR',
  hp: 260,
  radius: 30,
  speed: 74,
  contact: 5,
  color: '#2f2338',
  accent: C.amber,
  weight: 0.9,
  credits: [30, 30],
  healChance: 1,
  sight: 900,
  behavior(e, w, dt) {
    bossCommon(e, dt);
    e.data.phase = e.data.phase ?? 1;
    w.setBossBar(e.name, e.hp, e.maxHp, e.data.phase, 2, 'Unidad de limpieza industrial');
    phaseCheck(e, w, [0.5], () => {
      w.bark(e.x, e.y - 50, 'PROTOCOLO DE LIMPIEZA: AGRESIVO', C.danger);
    });
    if (e.data.invuln > 0) return;

    const p2 = e.data.phase >= 2;
    if (e.data.move === MOVE.none) {
      reposition(e, w, dt, e.def.speed * (p2 ? 1.35 : 1), 120);
      if (e.cd <= 0) startMove(e, pick(p2 ? [MOVE.a, MOVE.b, MOVE.c] : [MOVE.a, MOVE.b]));
      return;
    }

    switch (e.data.move) {
      // --- A: slow saw sweep, the "read the telegraph" lesson
      case MOVE.a:
        if (e.data.sub === 0) {
          e.data.sub = 1;
          w.sfx('telegraph', 0.9);
          e.data.aim = w.angleToPlayer(e.x, e.y);
        }
        if (e.t < 0.9) {
          e.facing = damp(e.facing, e.data.aim, 4, dt);
          e.data.aim = damp(e.data.aim, w.angleToPlayer(e.x, e.y), 2, dt);
        } else if (e.data.sub === 1) {
          e.data.sub = 2;
          w.spawnZone({
            x: e.x,
            y: e.y,
            radius: 96,
            angle: e.facing,
            halfW: 1.15,
            shape: 'cone',
            faction: 'enemy',
            warn: 0,
            live: 0.3,
            damage: 16,
            mode: 'burst',
            color: C.danger,
            knockback: 420,
            follow: e,
          });
          w.sfx('punch', 0.9);
          w.shake(6);
        } else if (e.t > 1.5) {
          endMove(e, p2 ? 0.7 : 1.1);
        }
        break;

      // --- B: magnetic pull then slam
      case MOVE.b: {
        if (e.data.sub === 0) {
          e.data.sub = 1;
          w.sfx('telegraph', 1);
          w.bark(e.x, e.y - 46, 'RECOGIENDO MATERIAL', C.amber);
        }
        if (e.t < 1.1) {
          // Drags the player in — dodging out is the counterplay.
          const p = w.playerActor;
          const a = Math.atan2(e.y - p.y, e.x - p.x);
          const d = w.distToPlayer(e.x, e.y);
          if (d < 320 && d > e.radius) {
            p.vx += Math.cos(a) * 340 * dt * 3;
            p.vy += Math.sin(a) * 340 * dt * 3;
          }
          w.fx.spawn({
            kind: 'spark',
            x: e.x + Math.cos(rand(0, TAU)) * 200,
            y: e.y + Math.sin(rand(0, TAU)) * 200,
            vx: 0,
            vy: 0,
            maxLife: 0.4,
            size: 2,
            color: C.amber,
            drag: 0.5,
          });
          e.moveX = e.moveY = 0;
        } else if (e.data.sub === 1) {
          e.data.sub = 2;
          tele(w, e.x, e.y, 118, 0.45, 20, C.danger, 0.25, 460);
          w.sfx('bossHit');
        } else if (e.t > 2.1) {
          endMove(e, 1.2);
        }
        break;
      }

      // --- C (phase 2): scrap throw
      case MOVE.c:
        if (e.data.sub === 0) {
          e.data.sub = 1;
          w.sfx('telegraph', 0.8);
        }
        if (e.t > 0.7 && e.data.sub === 1) {
          e.data.sub = 2;
          for (let i = -1; i <= 1; i++) {
            aimShot(e, w, i * 0.22, {
              speed: 265,
              damage: 12,
              kind: 'shard',
              color: C.amber,
              size: 14,
              radius: 9,
            });
          }
          w.sfx('shot', 0.8);
        } else if (e.t > 1.3) {
          endMove(e, 0.9);
        }
        break;
    }
  },
  draw(e, ctx, time) {
    const p2 = (e.data.phase ?? 1) >= 2;
    const winding = e.data.move === MOVE.a && e.t < 0.9;
    ctx.save();
    ctx.translate(e.x, e.y);

    // Magnetic field ring
    if (e.data.move === MOVE.b && e.t < 1.1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const k = ((time * 0.8 + i / 3) % 1);
        ring(ctx, 0, 0, 320 * (1 - k), 2, C.amber, (1 - k) * 0.5);
      }
      ctx.restore();
    }

    ctx.rotate(e.facing);
    // Treads
    ctx.fillStyle = '#191325';
    ctx.fillRect(-e.radius, -e.radius - 6, e.radius * 2, 10);
    ctx.fillRect(-e.radius, e.radius - 4, e.radius * 2, 10);
    // Chassis
    ctx.fillStyle = mix('#2b2038', C.danger, p2 ? 0.18 : 0);
    ctx.beginPath();
    ctx.roundRect?.(-e.radius, -e.radius + 2, e.radius * 2, e.radius * 2 - 4, 8);
    if (!ctx.roundRect) ctx.rect(-e.radius, -e.radius + 2, e.radius * 2, e.radius * 2 - 4);
    ctx.fill();
    ctx.strokeStyle = withAlpha(C.amber, 0.9);
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Hazard stripes
    ctx.save();
    ctx.beginPath();
    ctx.rect(-e.radius, -8, e.radius * 2, 16);
    ctx.clip();
    ctx.strokeStyle = withAlpha(C.amber, 0.5);
    ctx.lineWidth = 5;
    for (let i = -4; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 12, -10);
      ctx.lineTo(i * 12 - 12, 10);
      ctx.stroke();
    }
    ctx.restore();

    // Saw arm
    const sawA = winding ? -0.9 + (e.t / 0.9) * 0.6 : Math.sin(time * 2) * 0.1;
    ctx.save();
    ctx.rotate(sawA);
    ctx.strokeStyle = '#4a3a5c';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(40, 0);
    ctx.stroke();
    ctx.save();
    ctx.translate(48, 0);
    ctx.rotate(time * (winding ? 26 : 9));
    ctx.fillStyle = withAlpha(winding ? C.danger : '#c8b8d8', 0.95);
    poly(ctx, 0, 0, 14, 8, 0);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 48, 0, winding ? 40 : 20, winding ? C.danger : C.amber, 0.5);
    ctx.restore();
    ctx.restore();

    // Magnet arm
    ctx.save();
    ctx.rotate(1.0);
    ctx.strokeStyle = '#3a2d4a';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(34, 0);
    ctx.stroke();
    ctx.fillStyle = withAlpha(C.amber, 0.85);
    ctx.beginPath();
    ctx.arc(38, 0, 8, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.restore();

    // Lens
    disc(ctx, e.x, e.y, 10, '#120d1c');
    disc(
      ctx,
      e.x + Math.cos(e.facing) * 3,
      e.y + Math.sin(e.facing) * 3,
      5,
      withAlpha(winding ? C.danger : C.amber, 0.95),
    );
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, e.x, e.y, 46, winding ? C.danger : C.amber, 0.3);
    ctx.restore();
  },
};

// ==========================================================================
//  MADRIGAL-7 — la Fundidora Ciega (Nivel 1)
// ==========================================================================

const madrigal: EnemyDef = {
  id: 'madrigal',
  name: 'MADRIGAL-7',
  hp: 950,
  radius: 44,
  speed: 56,
  contact: 0,
  color: '#3a2a18',
  accent: C.amber,
  weight: 1,
  credits: [80, 80],
  healChance: 1,
  sight: 1200,
  behavior(e, w, dt) {
    bossCommon(e, dt);
    e.data.phase = e.data.phase ?? 1;
    const ph = e.data.phase;
    w.setBossBar(e.name, e.hp, e.maxHp, ph, 3, 'la Fundidora Ciega');
    phaseCheck(e, w, [0.66, 0.33], (phase) => {
      if (phase === 2) {
        w.bark(e.x, e.y - 70, 'HORNO ABIERTO', C.danger);
        e.data.furnace = 1;
      }
      if (phase === 3) {
        w.bark(e.x, e.y - 70, 'ESTRUCTURA COMPROMETIDA', C.danger);
        // Arena debris becomes cover — and the core starts cycling open.
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU + 0.4;
          const px = e.x + Math.cos(a) * 190;
          const py = e.y + Math.sin(a) * 190;
          w.fx.debris(px, py, 10, '#6b5334', 200);
          w.fx.shockwave(px, py, 70, C.amber, 0.5, 3);
        }
      }
    });
    if (e.data.invuln > 0) return;

    // Phase 3: the core opens periodically — double damage, clearly lit.
    if (ph >= 3) {
      e.data.coreT = (e.data.coreT ?? 0) + dt;
      const cycle = e.data.coreT % 7;
      const open = cycle > 4.4;
      e.data.vuln = open ? 2 : 1;
      e.data.coreOpen = open ? 1 : 0;
    }

    if (e.data.move === MOVE.none) {
      reposition(e, w, dt, e.def.speed * (1 + (ph - 1) * 0.25), 190);
      if (e.cd <= 0) {
        const pool = ph === 1 ? [MOVE.a, MOVE.b] : ph === 2 ? [MOVE.a, MOVE.b, MOVE.c] : [MOVE.a, MOVE.c, MOVE.d];
        startMove(e, pick(pool));
      }
      return;
    }

    switch (e.data.move) {
      // --- A: three sequential arm slams tracking the player
      case MOVE.a: {
        const gap = ph >= 3 ? 0.42 : 0.55;
        if (e.t > gap * e.data.sub) {
          const p = w.playerActor;
          const lead = ph >= 2 ? 0.22 : 0.12;
          tele(
            w,
            p.x + p.vx * lead,
            p.y + p.vy * lead,
            72,
            0.74,
            18 + ph * 2,
            C.danger,
            0.22,
            380,
          );
          w.sfx('telegraph', 0.7);
          e.data.sub++;
          if (e.data.sub >= 3) endMove(e, 1.2 - ph * 0.15);
        }
        e.moveX = e.moveY = 0;
        break;
      }

      // --- B: rotating steam jets
      case MOVE.b: {
        if (e.data.sub === 0) {
          e.data.sub = 1;
          e.data.aim = w.angleToPlayer(e.x, e.y);
          w.sfx('telegraph', 0.9);
        }
        const arms = 4;
        if (e.t > 0.9 && e.data.sub === 1) {
          e.data.sub = 2;
          for (let i = 0; i < arms; i++) {
            beam(w, e.x, e.y, e.data.aim + (i / arms) * TAU, 420, 22, 0, 17, C.telegraph, 0.4);
          }
          w.sfx('explode', 0.5);
          w.shake(6);
        }
        if (e.t < 0.9) {
          // Preview lines rotate slowly so the safe wedges are obvious.
          e.data.aim += dt * 0.5;
        }
        if (e.t > 1.7) endMove(e, 1.1);
        e.moveX = e.moveY = 0;
        break;
      }

      // --- C (phase 2+): molten metal spray leaving hazard pools
      case MOVE.c:
        if (e.data.sub === 0) {
          e.data.sub = 1;
          w.sfx('telegraph', 1);
          w.bark(e.x, e.y - 70, 'PURGA DE FUNDICIÓN', C.danger);
        }
        if (e.t > 0.8 && e.t < 2.4) {
          if ((e.data.spray ?? 0) <= 0) {
            e.data.spray = 0.13;
            const a = w.angleToPlayer(e.x, e.y) + rand(-0.55, 0.55);
            const proj = w.spawnProjectile({
              x: e.x + Math.cos(a) * e.radius,
              y: e.y + Math.sin(a) * e.radius,
              vx: Math.cos(a) * rand(200, 320),
              vy: Math.sin(a) * rand(200, 320),
              radius: 10,
              damage: 12,
              faction: 'enemy',
              kind: 'slag',
              color: '#ff7a2a',
              maxLife: rand(0.7, 1.1),
              size: 13,
              deflectable: false,
            });
            proj.onExpire = (world, pr) => {
              world.spawnZone({
                x: pr.x,
                y: pr.y,
                radius: 42,
                shape: 'circle',
                faction: 'enemy',
                warn: 0.25,
                live: 4,
                damage: 9,
                mode: 'field',
                color: '#ff7a2a',
                knockback: 0,
              });
            };
            w.sfx('shot', 0.4);
          }
          e.data.spray -= dt;
        }
        if (e.t > 3) endMove(e, 1.4);
        e.moveX = e.moveY = 0;
        break;

      // --- D (phase 3): desperate spin + radial slag
      case MOVE.d:
        if (e.data.sub === 0) {
          e.data.sub = 1;
          w.sfx('bossRoar', 0.7);
          w.shake(8);
          // One persistent contact aura that rides along, rather than a fresh
          // hitbox every frame — cheaper and far more predictable to dodge.
          w.spawnZone({
            x: e.x,
            y: e.y,
            radius: e.radius + 18,
            shape: 'circle',
            faction: 'enemy',
            warn: 0.35,
            live: 2.6,
            damage: 12,
            mode: 'field',
            color: C.danger,
            knockback: 380,
            follow: e,
          });
        }
        if (e.t < 2.9) {
          e.facing += dt * 4.5;
          const p = w.playerActor;
          const a = Math.atan2(p.y - e.y, p.x - e.x);
          e.moveX = Math.cos(a) * 130;
          e.moveY = Math.sin(a) * 130;
          if ((e.data.spin ?? 0) <= 0) {
            e.data.spin = 0.38;
            radial(e, w, 7, e.facing, { speed: 215, damage: 11, color: '#ff7a2a', kind: 'slag' });
            w.sfx('shot', 0.5);
          }
          e.data.spin -= dt;
        } else if (e.t > 3.7) {
          endMove(e, 1.6);
        }
        break;
    }
  },
  draw(e, ctx, time) {
    const ph = e.data.phase ?? 1;
    const open = e.data.coreOpen === 1;
    ctx.save();
    ctx.translate(e.x, e.y);

    // Six arms radiating out, animated
    for (let i = 0; i < 6; i++) {
      const base = (i / 6) * TAU + e.facing * 0.35;
      const swing = Math.sin(time * (1.2 + i * 0.2) + i) * 0.22;
      const a = base + swing;
      const len = e.radius + 26 + Math.sin(time * 1.6 + i * 2) * 6;
      ctx.strokeStyle = withAlpha('#4a3a24', 1);
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * e.radius * 0.6, Math.sin(a) * e.radius * 0.6);
      ctx.quadraticCurveTo(
        Math.cos(a + 0.3) * len * 0.75,
        Math.sin(a + 0.3) * len * 0.75,
        Math.cos(a) * len,
        Math.sin(a) * len,
      );
      ctx.stroke();
      ctx.fillStyle = withAlpha(ph >= 2 ? '#ff7a2a' : C.amber, 0.85);
      ctx.beginPath();
      ctx.arc(Math.cos(a) * len, Math.sin(a) * len, 6, 0, TAU);
      ctx.fill();
    }

    // Body
    ctx.fillStyle = mix('#33261a', '#ff7a2a', ph >= 2 ? 0.14 : 0);
    poly(ctx, 0, 0, e.radius, 8, time * 0.15);
    ctx.fill();
    ctx.strokeStyle = withAlpha(C.amber, 0.9);
    ctx.lineWidth = 3;
    ctx.stroke();

    // Furnace mouth
    const furnaceOpen = ph >= 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const fh = furnaceOpen ? 20 + Math.sin(time * 5) * 3 : 6;
    const g = ctx.createLinearGradient(0, -fh, 0, fh);
    g.addColorStop(0, withAlpha('#ffde8a', 0.9));
    g.addColorStop(1, withAlpha('#ff4a1a', 0.7));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 6, 22, fh, 0, 0, TAU);
    ctx.fill();
    glow(ctx, 0, 6, furnaceOpen ? 90 : 40, '#ff7a2a', 0.4);
    ctx.restore();

    // Exposed core (phase 3 weak point)
    if (ph >= 3) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.5 + 0.5 * Math.sin(time * 8);
      if (open) {
        glow(ctx, 0, -8, 70, C.heal, 0.5 + pulse * 0.3);
        disc(ctx, 0, -8, 13, withAlpha(C.heal, 0.9));
        ring(ctx, 0, -8, 20 + pulse * 5, 2.5, C.heal, 0.9);
      } else {
        ring(ctx, 0, -8, 15, 2, withAlpha('#7a6a4a', 0.6), 0.6);
      }
      ctx.restore();
    }

    // Blind head with one red lens
    ctx.fillStyle = '#241a12';
    ctx.beginPath();
    ctx.ellipse(0, -e.radius * 0.62, 20, 15, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = withAlpha(C.amber, 0.7);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    disc(ctx, e.x, e.y - e.radius * 0.62, 6, withAlpha(C.danger, 0.95));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, e.x, e.y - e.radius * 0.62, 40, C.danger, 0.45);
    ctx.restore();

    if (open) {
      text(ctx, 'NÚCLEO EXPUESTO', e.x, e.y - e.radius - 34, {
        size: 12,
        color: C.heal,
        align: 'center',
        weight: '800',
        glowColor: C.heal,
      });
    }
  },
};

// ==========================================================================
//  LAS GEMELAS SUTURA — miniboss del Mercado
// ==========================================================================

/**
 * Linked pair: while both sisters stay within 210px they share a suture field
 * that cuts incoming damage hard. Separating them is the whole fight.
 */
function suturaLink(e: Enemy, w: World): Enemy | null {
  for (const o of w.enemies) {
    if (o === e || o.dead) continue;
    if (o.defId === 'suturaFast' || o.defId === 'suturaLong') return o as Enemy;
  }
  return null;
}

function suturaShared(e: Enemy, w: World, dt: number): Enemy | null {
  bossCommon(e, dt);
  const sister = suturaLink(e, w);
  const linked = !!sister && dist(e.x, e.y, sister.x, sister.y) < 210;
  e.data.linked = linked ? 1 : 0;
  e.data.vuln = linked ? 0.35 : 1.15;
  // Cached so the draw pass can render the suture thread without world access.
  e.data.linkX = sister ? sister.x : e.x;
  e.data.linkY = sister ? sister.y : e.y;
  if (e.defId === 'suturaFast') {
    const total = e.hp + (sister ? sister.hp : 0);
    const max = e.maxHp + (sister ? sister.maxHp : 0);
    w.setBossBar(
      'LAS GEMELAS SUTURA',
      total,
      max,
      1,
      1,
      linked ? 'Sincronizadas — sepáralas para herirlas' : 'Sutura rota',
    );
  }
  void dt;
  return sister;
}

/** The visible suture: a bright thread that says "these two are protecting each other". */
function drawSutureThread(e: Enemy, ctx: CanvasRenderingContext2D, time: number): void {
  if (!e.data.linked || e.defId !== 'suturaFast') return;
  const lx = e.data.linkX ?? e.x;
  const ly = e.data.linkY ?? e.y;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const segs = 10;
  ctx.strokeStyle = withAlpha('#ffffff', 0.55);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const nx = e.x + (lx - e.x) * t;
    const ny = e.y + (ly - e.y) * t;
    const off = Math.sin(t * Math.PI) * Math.sin(time * 5 + t * 6) * 10;
    const a = Math.atan2(ly - e.y, lx - e.x) + Math.PI / 2;
    if (i === 0) ctx.moveTo(nx, ny);
    else ctx.lineTo(nx + Math.cos(a) * off, ny + Math.sin(a) * off);
  }
  ctx.stroke();
  ctx.strokeStyle = withAlpha(C.magenta, 0.35);
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.restore();
}

const suturaFast: EnemyDef = {
  id: 'suturaFast',
  name: 'SUTURA · Aguja',
  hp: 320,
  radius: 15,
  speed: 178,
  contact: 6,
  color: '#3a1b34',
  accent: C.magenta,
  weight: 0.2,
  credits: [25, 25],
  healChance: 0,
  sight: 900,
  behavior(e, w, dt) {
    suturaShared(e, w, dt);
    if (e.data.invuln > 0) return;
    const p = w.playerActor;
    const d = w.distToPlayer(e.x, e.y);
    e.facing += angleDelta(e.facing, w.angleToPlayer(e.x, e.y)) * clamp(dt * 8, 0, 1);
    if (e.data.move === MOVE.none) {
      if (d > 90) {
        e.moveX = Math.cos(e.facing) * e.def.speed;
        e.moveY = Math.sin(e.facing) * e.def.speed;
      } else {
        const s = e.facing + Math.PI / 2 * (e.data.dir || 1);
        e.moveX = Math.cos(s) * e.def.speed * 0.8;
        e.moveY = Math.sin(s) * e.def.speed * 0.8;
      }
      if (e.cd <= 0 && d < 220) startMove(e, MOVE.a);
      return;
    }
    if (e.data.move === MOVE.a) {
      if (e.data.sub === 0) {
        e.data.sub = 1;
        w.sfx('telegraph', 0.5);
      }
      if (e.t < 0.32) {
        e.moveX = e.moveY = 0;
      } else if (e.t < 0.52) {
        e.moveX = Math.cos(e.facing) * 640;
        e.moveY = Math.sin(e.facing) * 640;
        if (e.data.sub === 1) {
          e.data.sub = 2;
          w.spawnZone({
            x: e.x,
            y: e.y,
            radius: 46,
            shape: 'circle',
            faction: 'enemy',
            warn: 0,
            live: 0.22,
            damage: 13,
            mode: 'burst',
            color: C.magenta,
            knockback: 260,
            follow: e,
          });
          w.sfx('blade', 0.9);
        }
      } else if (e.t > 0.9) {
        endMove(e, rand(0.7, 1.2));
      }
    }
    void p;
  },
  draw(e, ctx, time) {
    drawSutureThread(e, ctx, time);
    if (e.data.move === MOVE.a && e.t < 0.32) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      line(
        ctx,
        e.x,
        e.y,
        e.x + Math.cos(e.facing) * 150,
        e.y + Math.sin(e.facing) * 150,
        3,
        C.danger,
        0.5,
      );
      ctx.restore();
    }
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.facing);
    ctx.fillStyle = '#331630';
    ctx.beginPath();
    ctx.moveTo(e.radius + 4, 0);
    ctx.lineTo(-e.radius * 0.7, -e.radius * 0.8);
    ctx.lineTo(-e.radius * 0.4, 0);
    ctx.lineTo(-e.radius * 0.7, e.radius * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = withAlpha(C.magenta, 0.95);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = withAlpha('#ffffff', 0.75);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(6, -5);
    ctx.lineTo(24, -8);
    ctx.moveTo(6, 5);
    ctx.lineTo(24, 8);
    ctx.stroke();
    ctx.restore();
    disc(ctx, e.x, e.y, 4, '#f2f6ff');
    void time;
  },
};

const suturaLong: EnemyDef = {
  id: 'suturaLong',
  name: 'SUTURA · Hilo',
  hp: 320,
  radius: 15,
  speed: 108,
  contact: 5,
  color: '#2a1b3a',
  accent: C.elite,
  weight: 0.25,
  credits: [25, 25],
  healChance: 1,
  sight: 900,
  behavior(e, w, dt) {
    suturaShared(e, w, dt);
    if (e.data.invuln > 0) return;
    const p = w.playerActor;
    const d = w.distToPlayer(e.x, e.y);
    e.facing += angleDelta(e.facing, w.angleToPlayer(e.x, e.y)) * clamp(dt * 6, 0, 1);
    if (e.data.move === MOVE.none) {
      if (d < 200) {
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        e.moveX = Math.cos(a) * e.def.speed;
        e.moveY = Math.sin(a) * e.def.speed;
      } else if (d > 320) {
        e.moveX = Math.cos(e.facing) * e.def.speed * 0.7;
        e.moveY = Math.sin(e.facing) * e.def.speed * 0.7;
      } else {
        const s = e.facing + Math.PI / 2 * (e.data.dir || -1);
        e.moveX = Math.cos(s) * e.def.speed * 0.6;
        e.moveY = Math.sin(s) * e.def.speed * 0.6;
      }
      if (e.cd <= 0) startMove(e, chance(0.55) ? MOVE.a : MOVE.b);
      return;
    }
    if (e.data.move === MOVE.a) {
      // Aimed needle volley
      if (e.data.sub === 0) {
        e.data.sub = 1;
        w.sfx('telegraph', 0.6);
      }
      e.moveX = e.moveY = 0;
      if (e.t > 0.6) {
        if ((e.data.rate ?? 0) <= 0) {
          e.data.rate = 0.12;
          aimShot(e, w, rand(-0.08, 0.08), {
            speed: 420,
            damage: 9,
            kind: 'needle',
            color: C.elite,
            size: 16,
            radius: 6,
          });
          w.sfx('shot', 0.4);
          e.data.sub++;
        }
        e.data.rate -= dt;
        if (e.data.sub > 5) endMove(e, rand(1.1, 1.7));
      }
    } else if (e.data.move === MOVE.b) {
      // Suture beam across the arena
      if (e.data.sub === 0) {
        e.data.sub = 1;
        e.data.aim = w.angleToPlayer(e.x, e.y);
        w.sfx('telegraph', 0.8);
        beam(w, e.x, e.y, e.data.aim, 480, 16, 0.75, 18, C.elite, 0.32);
      }
      e.moveX = e.moveY = 0;
      if (e.t > 1.3) endMove(e, rand(1.4, 2));
    }
  },
  draw(e, ctx, time) {
    drawSutureThread(e, ctx, time);
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.facing);
    ctx.fillStyle = '#241733';
    poly(ctx, 0, 0, e.radius, 6, 0);
    ctx.fill();
    ctx.strokeStyle = withAlpha(C.elite, 0.95);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = withAlpha('#ffffff', 0.6);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(26, 0);
    ctx.stroke();
    ctx.restore();
    disc(ctx, e.x, e.y, 4, '#f2f6ff');
    void time;
  },
};

// ==========================================================================
//  MADAME MNEMOSYNE — Nivel 2
// ==========================================================================

const mnemosyne: EnemyDef = {
  id: 'mnemosyne',
  name: 'MADAME MNEMOSYNE',
  hp: 1150,
  radius: 34,
  speed: 90,
  contact: 0,
  color: '#3a1440',
  accent: C.magenta,
  weight: 1,
  credits: [110, 110],
  healChance: 1,
  sight: 1200,
  behavior(e, w, dt) {
    bossCommon(e, dt);
    e.data.phase = e.data.phase ?? 1;
    const ph = e.data.phase;
    w.setBossBar(e.name, e.hp, e.maxHp, ph, 3, 'Comerciante de recuerdos');
    phaseCheck(e, w, [0.66, 0.33], (phase) => {
      if (phase === 2) {
        w.bark(e.x, e.y - 60, '¿Y si nada de esto ocurrió?', C.magenta);
        w.glitch(0.4, 1.2);
      }
      if (phase === 3) {
        w.bark(e.x, e.y - 60, 'Somos muchas. Elige bien.', C.magenta);
        // Three illusions; only the one with a shadow is real.
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * TAU + rand(0, 1);
          const spot = w.map.clampToFloor(e.x + Math.cos(a) * 180, e.y + Math.sin(a) * 180, 30);
          const ill = w.spawnEnemy('mnemoIllusion', spot.x, spot.y);
          if (ill) ill.hp = ill.maxHp;
        }
      }
    });
    if (e.data.invuln > 0) return;

    // Phase 2+: the room dims — handled by the game reading this flag.
    e.data.dim = ph >= 2 ? 1 : 0;

    if (e.data.move === MOVE.none) {
      reposition(e, w, dt, e.def.speed, 210);
      if (e.cd <= 0) {
        const pool = ph === 1 ? [MOVE.a, MOVE.b] : ph === 2 ? [MOVE.a, MOVE.b, MOVE.c] : [MOVE.a, MOVE.c, MOVE.d];
        startMove(e, pick(pool));
      }
      return;
    }

    switch (e.data.move) {
      // --- A: rhythmic needle fans (3 beats, easy to internalise)
      case MOVE.a:
        e.moveX = e.moveY = 0;
        if (e.t > 0.45 * (e.data.sub + 1)) {
          const spread = 5 + ph;
          for (let i = 0; i < spread; i++) {
            aimShot(e, w, (i - (spread - 1) / 2) * 0.16, {
              speed: 300,
              damage: 10,
              kind: 'needle',
              color: C.magenta,
              size: 17,
              radius: 6,
            });
          }
          w.sfx('shot', 0.7);
          e.data.sub++;
          if (e.data.sub >= 3) endMove(e, 1.3);
        }
        break;

      // --- B: blink + ring burst
      case MOVE.b:
        if (e.data.sub === 0) {
          e.data.sub = 1;
          w.sfx('glitch', 0.7);
          w.fx.burst(e.x, e.y, 26, C.magenta, { speed: 240, life: 0.5 });
        }
        if (e.t > 0.4 && e.data.sub === 1) {
          e.data.sub = 2;
          const p = w.playerActor;
          const a = rand(0, TAU);
          const spot = w.map.clampToFloor(p.x + Math.cos(a) * 170, p.y + Math.sin(a) * 170, e.radius);
          e.x = spot.x;
          e.y = spot.y;
          w.fx.burst(e.x, e.y, 26, C.magenta, { speed: 240, life: 0.5 });
          w.sfx('glitch', 0.7);
          tele(w, e.x, e.y, 130, 0.55, 16, C.magenta, 0.24, 340);
        } else if (e.t > 1.3) {
          endMove(e, 1.1);
        }
        e.moveX = e.moveY = 0;
        break;

      // --- C (phase 2+): false memories — brief phantom enemies
      case MOVE.c:
        if (e.data.sub === 0) {
          e.data.sub = 1;
          w.sfx('bossRoar', 0.5);
          w.bark(e.x, e.y - 60, 'Recuerda lo que nunca fue.', C.magenta);
          const n = ph >= 3 ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + rand(0, 1);
            const spot = w.map.clampToFloor(e.x + Math.cos(a) * 150, e.y + Math.sin(a) * 150, 16);
            w.spawnEnemy('memoryPhantom', spot.x, spot.y);
          }
        }
        if (e.t > 1.2) endMove(e, 2);
        e.moveX = e.moveY = 0;
        break;

      // --- D (phase 3): spiral of needles
      case MOVE.d:
        if (e.data.sub === 0) {
          e.data.sub = 1;
          e.data.aim = rand(0, TAU);
          w.sfx('telegraph', 0.9);
        }
        if (e.t > 0.6 && e.t < 3.2) {
          if ((e.data.rate ?? 0) <= 0) {
            e.data.rate = 0.14;
            e.data.aim += 0.55;
            radial(e, w, 4, e.data.aim, {
              speed: 195,
              damage: 9,
              kind: 'needle',
              color: C.magenta,
              size: 15,
            });
            w.sfx('shot', 0.35);
          }
          e.data.rate -= dt;
        }
        if (e.t > 3.6) endMove(e, 1.5);
        e.moveX = e.moveY = 0;
        break;
    }
  },
  draw(e, ctx, time) {
    const ph = e.data.phase ?? 1;
    // Shadow: the tell that separates the real Mnemosyne from her illusions.
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + e.radius * 0.9, e.radius * 0.9, e.radius * 0.34, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(e.x, e.y);
    // Floating memory screens
    for (let i = 0; i < 6; i++) {
      const a = time * 0.5 + (i / 6) * TAU;
      const rx = Math.cos(a) * (e.radius + 34);
      const ry = Math.sin(a) * (e.radius + 20) * 0.6 - 12;
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.translate(rx, ry);
      ctx.rotate(Math.sin(a) * 0.25);
      ctx.fillStyle = withAlpha('#12061a', 0.85);
      ctx.fillRect(-13, -9, 26, 18);
      ctx.strokeStyle = withAlpha(C.magenta, 0.8);
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-13, -9, 26, 18);
      ctx.fillStyle = withAlpha(C.magenta, 0.3 + 0.25 * Math.sin(time * 6 + i));
      ctx.fillRect(-10, -6 + ((time * 30 + i * 9) % 12), 20, 2);
      ctx.restore();
    }
    // Holographic arms
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const arms = ph >= 3 ? 6 : 4;
    for (let i = 0; i < arms; i++) {
      const a = (i / arms) * TAU + Math.sin(time * 1.3 + i) * 0.3;
      ctx.strokeStyle = withAlpha(C.magenta, 0.45);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(
        Math.cos(a) * 30,
        Math.sin(a) * 30 - 14,
        Math.cos(a) * (e.radius + 28),
        Math.sin(a) * (e.radius + 28),
      );
      ctx.stroke();
    }
    ctx.restore();
    // Gown
    ctx.fillStyle = '#2a0e30';
    ctx.beginPath();
    ctx.moveTo(0, -e.radius * 0.4);
    ctx.quadraticCurveTo(e.radius, e.radius * 0.4, e.radius * 0.7, e.radius);
    ctx.lineTo(-e.radius * 0.7, e.radius);
    ctx.quadraticCurveTo(-e.radius, e.radius * 0.4, 0, -e.radius * 0.4);
    ctx.fill();
    ctx.strokeStyle = withAlpha(C.magenta, 0.85);
    ctx.lineWidth = 2.4;
    ctx.stroke();
    // Cracked porcelain mask
    ctx.fillStyle = '#f5eef2';
    ctx.beginPath();
    ctx.ellipse(0, -e.radius * 0.62, 15, 19, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = withAlpha('#c9a2c0', 1);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.strokeStyle = withAlpha(C.magenta, 0.9);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-4, -e.radius * 0.62 - 17);
    ctx.lineTo(2, -e.radius * 0.62 - 4);
    ctx.lineTo(-3, -e.radius * 0.62 + 6);
    ctx.lineTo(3, -e.radius * 0.62 + 17);
    ctx.stroke();
    // Eyes
    for (const s of [-1, 1]) {
      disc(ctx, s * 5.5, -e.radius * 0.62 - 2, 2.2, withAlpha('#1a0a1e', 1));
    }
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, e.x, e.y, 110, C.magenta, 0.18);
    ctx.restore();
  },
};

/** Harmless-looking phantom that pops when struck; teaches the phase-3 rule. */
const mnemoIllusion: EnemyDef = {
  id: 'mnemoIllusion',
  name: 'Reflejo',
  hp: 1,
  radius: 30,
  speed: 70,
  contact: 0,
  color: '#3a1440',
  accent: C.magenta,
  weight: 1,
  credits: [0, 0],
  healChance: 0,
  sight: 900,
  behavior(e, w, dt) {
    e.data.illusion = 1;
    reposition(e, w, dt, e.def.speed, 220);
    if (e.cd <= 0) {
      e.cd = rand(1.6, 2.6);
      // Illusions still shoot, but their needles are slower and dimmer.
      for (let i = -1; i <= 1; i++) {
        aimShot(e, w, i * 0.2, {
          speed: 210,
          damage: 6,
          kind: 'needle',
          color: '#b8579c',
          size: 14,
          radius: 6,
        });
      }
      w.sfx('shot', 0.3);
    }
  },
  draw(e, ctx, time) {
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.12 * Math.sin(time * 5 + e.seed);
    ctx.translate(e.x, e.y);
    ctx.fillStyle = withAlpha('#2a0e30', 0.7);
    ctx.beginPath();
    ctx.moveTo(0, -e.radius * 0.4);
    ctx.quadraticCurveTo(e.radius, e.radius * 0.4, e.radius * 0.7, e.radius);
    ctx.lineTo(-e.radius * 0.7, e.radius);
    ctx.quadraticCurveTo(-e.radius, e.radius * 0.4, 0, -e.radius * 0.4);
    ctx.fill();
    ctx.strokeStyle = withAlpha(C.magenta, 0.6);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = withAlpha('#f5eef2', 0.7);
    ctx.beginPath();
    ctx.ellipse(0, -e.radius * 0.62, 15, 19, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    // No shadow, and a scan-line wash: the two cues that say "not real".
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 6; i++) {
      const yy = e.y - e.radius + ((time * 40 + i * 12) % (e.radius * 2));
      line(ctx, e.x - e.radius * 0.8, yy, e.x + e.radius * 0.8, yy, 1.4, C.magenta, 0.5);
    }
    ctx.restore();
  },
  onDeath(e, w) {
    w.fx.burst(e.x, e.y, 20, C.magenta, { speed: 200, life: 0.5 });
    w.sfx('glitch', 0.5);
  },
};

const memoryPhantom: EnemyDef = {
  id: 'memoryPhantom',
  name: 'Recuerdo Falso',
  hp: 26,
  radius: 13,
  speed: 138,
  contact: 6,
  color: '#2a1030',
  accent: C.magenta,
  weight: 0,
  credits: [1, 3],
  healChance: 0.08,
  sight: 900,
  behavior(e, w, dt) {
    e.data.life = (e.data.life ?? 12) - dt;
    if (e.data.life <= 0) {
      e.hp = 0;
      return;
    }
    const p = w.playerActor;
    e.facing += angleDelta(e.facing, w.angleToPlayer(e.x, e.y)) * clamp(dt * 8, 0, 1);
    const d = w.distToPlayer(e.x, e.y);
    if (d > 44) {
      e.moveX = Math.cos(e.facing) * e.def.speed;
      e.moveY = Math.sin(e.facing) * e.def.speed;
    } else if (e.cd <= 0) {
      e.cd = 1.2;
      w.spawnZone({
        x: e.x,
        y: e.y,
        radius: 46,
        angle: e.facing,
        halfW: 1.0,
        shape: 'cone',
        faction: 'enemy',
        warn: 0.3,
        live: 0.16,
        damage: 9,
        mode: 'burst',
        color: C.magenta,
        knockback: 220,
        follow: e,
      });
    }
    void p;
  },
  draw(e, ctx, time) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.translate(e.x, e.y);
    ctx.rotate(e.facing);
    ctx.fillStyle = withAlpha('#2a1030', 0.9);
    poly(ctx, 0, 0, e.radius, 5, time * 0.6);
    ctx.fill();
    ctx.strokeStyle = withAlpha(C.magenta, 0.8);
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();
    disc(ctx, e.x, e.y, 3, withAlpha('#ffffff', 0.8));
  },
};

// ==========================================================================
//  VERDANT — el Jardinero sin Rostro (Nivel 3)
// ==========================================================================

const verdant: EnemyDef = {
  id: 'verdant',
  name: 'VERDANT',
  hp: 1380,
  radius: 38,
  speed: 96,
  contact: 0,
  color: '#e8f2ec',
  accent: C.ally,
  weight: 1,
  credits: [140, 140],
  healChance: 1,
  sight: 1200,
  behavior(e, w, dt) {
    bossCommon(e, dt);
    e.data.phase = e.data.phase ?? 1;
    const ph = e.data.phase;
    w.setBossBar(e.name, e.hp, e.maxHp, ph, 3, 'el Jardinero sin Rostro');
    phaseCheck(e, w, [0.68, 0.34], (phase) => {
      if (phase === 2) w.bark(e.x, e.y - 62, 'La poda requiere paciencia.', C.ally);
      if (phase === 3) {
        w.bark(e.x, e.y - 62, 'Entonces arrancaré la raíz.', C.danger);
        w.glitch(0.35, 0.8);
      }
    });
    if (e.data.invuln > 0) return;

    if (e.data.move === MOVE.none) {
      reposition(e, w, dt, e.def.speed * (ph >= 3 ? 1.5 : 1), 180);
      if (e.cd <= 0) {
        const pool = ph === 1 ? [MOVE.a, MOVE.b] : ph === 2 ? [MOVE.a, MOVE.b, MOVE.c] : [MOVE.a, MOVE.d, MOVE.e];
        startMove(e, pick(pool));
      }
      return;
    }

    switch (e.data.move) {
      // --- A: shoot-lance thrust, long and narrow
      case MOVE.a:
        e.moveX = e.moveY = 0;
        if (e.data.sub === 0) {
          e.data.sub = 1;
          e.data.aim = w.angleToPlayer(e.x, e.y);
          w.sfx('telegraph', 0.8);
          beam(w, e.x, e.y, e.data.aim, 380, 20, 0.7, 19, C.ally, 0.3);
        }
        if (e.t > 1.2) endMove(e, ph >= 3 ? 0.6 : 1);
        break;

      // --- B: roots erupt in a ring around the player
      case MOVE.b: {
        e.moveX = e.moveY = 0;
        if (e.data.sub === 0) {
          e.data.sub = 1;
          w.sfx('telegraph', 0.9);
          const p = w.playerActor;
          const n = 6;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + rand(0, 0.5);
            w.spawnZone({
              x: p.x + Math.cos(a) * 95,
              y: p.y + Math.sin(a) * 95,
              radius: 52,
              shape: 'circle',
              faction: 'enemy',
              warn: 0.75 + i * 0.06,
              live: 0.4,
              damage: 14,
              mode: 'burst',
              color: C.lime,
              root: 0.7,
              knockback: 120,
            });
          }
        }
        if (e.t > 1.6) endMove(e, 1.2);
        break;
      }

      // --- C (phase 2): summon garden fauna
      case MOVE.c:
        e.moveX = e.moveY = 0;
        if (e.data.sub === 0) {
          e.data.sub = 1;
          w.sfx('bossRoar', 0.6);
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * TAU + rand(0, 1);
            const spot = w.map.clampToFloor(e.x + Math.cos(a) * 160, e.y + Math.sin(a) * 160, 16);
            w.spawnEnemy(pick(['shockVine', 'sentinelOrchid', 'fiberDeer']), spot.x, spot.y);
            w.fx.shockwave(spot.x, spot.y, 60, C.ally, 0.5, 3);
          }
        }
        if (e.t > 1.4) endMove(e, 2.4);
        break;

      // --- D (phase 3): spinning petal blades
      case MOVE.d:
        if (e.data.sub === 0) {
          e.data.sub = 1;
          w.sfx('bossRoar', 0.8);
          w.shake(7);
        }
        if (e.t < 2.8) {
          e.facing += dt * 3.2;
          const p = w.playerActor;
          const a = Math.atan2(p.y - e.y, p.x - e.x);
          e.moveX = Math.cos(a) * 160;
          e.moveY = Math.sin(a) * 160;
          if ((e.data.rate ?? 0) <= 0) {
            e.data.rate = 0.22;
            for (let i = 0; i < 3; i++) {
              beam(w, e.x, e.y, e.facing + (i / 3) * TAU, 150, 16, 0, 13, C.ally, 0.18);
            }
          }
          e.data.rate -= dt;
        } else if (e.t > 3.4) {
          endMove(e, 1.3);
        }
        break;

      // --- E (phase 3): explosive seed barrage
      case MOVE.e:
        e.moveX = e.moveY = 0;
        if (e.data.sub === 0) {
          e.data.sub = 1;
          w.sfx('telegraph', 1);
        }
        if (e.t > 0.7 && e.t < 2.2) {
          if ((e.data.rate2 ?? 0) <= 0) {
            e.data.rate2 = 0.26;
            const p = w.playerActor;
            const proj = w.spawnProjectile({
              x: e.x,
              y: e.y,
              vx: (p.x - e.x) * 0.9 + rand(-60, 60),
              vy: (p.y - e.y) * 0.9 + rand(-60, 60),
              radius: 9,
              damage: 8,
              faction: 'enemy',
              kind: 'seed',
              color: C.lime,
              maxLife: 1.05,
              size: 12,
              fuse: 1.0,
              explodeRadius: 76,
              explodeDamage: 16,
              deflectable: false,
            });
            void proj;
            w.sfx('shot', 0.5);
          }
          e.data.rate2 -= dt;
        }
        if (e.t > 2.8) endMove(e, 1.5);
        break;
    }
  },
  draw(e, ctx, time) {
    const ph = e.data.phase ?? 1;
    const shed = ph >= 3;
    ctx.save();
    ctx.translate(e.x, e.y);

    // Mechanical roots trailing on the ground
    ctx.strokeStyle = withAlpha('#8fbfa4', 0.55);
    ctx.lineWidth = 3;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + Math.sin(time * 0.7 + i) * 0.2;
      const len = e.radius + 30 + Math.sin(time * 1.1 + i * 2) * 10;
      ctx.beginPath();
      ctx.moveTo(0, e.radius * 0.5);
      ctx.quadraticCurveTo(Math.cos(a) * len * 0.6, Math.sin(a) * len * 0.4 + 12, Math.cos(a) * len, Math.sin(a) * len * 0.6 + 16);
      ctx.stroke();
    }

    ctx.rotate(Math.sin(time * 0.8) * 0.04);
    // Tall elegant body
    ctx.fillStyle = shed ? '#5e7d6c' : '#e4efe8';
    ctx.beginPath();
    ctx.moveTo(0, -e.radius * 1.5);
    ctx.quadraticCurveTo(e.radius * 0.85, -e.radius * 0.2, e.radius * 0.55, e.radius);
    ctx.lineTo(-e.radius * 0.55, e.radius);
    ctx.quadraticCurveTo(-e.radius * 0.85, -e.radius * 0.2, 0, -e.radius * 1.5);
    ctx.fill();
    ctx.strokeStyle = withAlpha(shed ? C.danger : C.ally, 0.9);
    ctx.lineWidth = 2.4;
    ctx.stroke();

    if (shed) {
      // Exposed organic-machine structure
      ctx.strokeStyle = withAlpha(C.danger, 0.7);
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(-e.radius * 0.5, -e.radius * 1.1 + i * 12);
        ctx.lineTo(e.radius * 0.5, -e.radius * 1.1 + i * 12 + Math.sin(time * 4 + i) * 3);
        ctx.stroke();
      }
    }

    // Faceless head
    ctx.fillStyle = shed ? '#3d5a4b' : '#f2f8f4';
    ctx.beginPath();
    ctx.ellipse(0, -e.radius * 1.35, 13, 17, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = withAlpha(shed ? C.danger : C.ally, 0.8);
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Luminous flowers on the shoulders
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const a = -1.9 + (i / 4) * 3.8;
      const fx = Math.cos(a) * (e.radius * 0.75);
      const fy = Math.sin(a) * (e.radius * 0.5) - e.radius * 0.5;
      const pulse = 0.5 + 0.5 * Math.sin(time * 2 + i);
      glow(ctx, fx, fy, 18 + pulse * 8, shed ? C.danger : '#ff9ee8', 0.35);
      disc(ctx, fx, fy, 3.5, withAlpha(shed ? C.danger : '#ffd6f4', 0.95));
    }
    ctx.restore();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, e.x, e.y - e.radius * 0.6, 130, shed ? C.danger : C.ally, 0.16);
    ctx.restore();
  },
};

// ==========================================================================
//  ARQUIVISTA NULL — Nivel 4
// ==========================================================================

const archivist: EnemyDef = {
  id: 'archivist',
  name: 'ARQUIVISTA NULL',
  hp: 1600,
  radius: 40,
  speed: 118,
  contact: 0,
  color: '#1b2352',
  accent: '#8b9cff',
  weight: 1,
  credits: [180, 180],
  healChance: 1,
  sight: 1200,
  behavior(e, w, dt) {
    bossCommon(e, dt);
    e.data.phase = e.data.phase ?? 1;
    const ph = e.data.phase;
    w.setBossBar(e.name, e.hp, e.maxHp, ph, 3, 'Última defensa del núcleo');
    phaseCheck(e, w, [0.68, 0.34], (phase) => {
      if (phase === 2) w.bark(e.x, e.y - 66, 'SOMOS TODOS LOS QUE BORRASTE', '#8b9cff');
      if (phase === 3) {
        w.bark(e.x, e.y - 66, 'ENTONCES SEREMOS RUIDO', C.danger);
        w.glitch(0.6, 1.4);
      }
    });
    if (e.data.invuln > 0) return;

    if (e.data.move === MOVE.none) {
      reposition(e, w, dt, e.def.speed * (ph >= 3 ? 1.35 : 1), ph >= 3 ? 200 : 140);
      if (e.cd <= 0) {
        const pool =
          ph === 1
            ? [MOVE.a, MOVE.b]
            : ph === 2
              ? [MOVE.a, MOVE.b, MOVE.c]
              : [MOVE.d, MOVE.e, MOVE.c];
        startMove(e, pick(pool));
      }
      return;
    }

    switch (e.data.move) {
      // --- A: three-hit sword combo with a clear beat
      case MOVE.a: {
        const beats = [0.55, 0.95, 1.55];
        const p = w.playerActor;
        if (e.data.sub < 3 && e.t > beats[e.data.sub]) {
          e.facing = Math.atan2(p.y - e.y, p.x - e.x);
          const last = e.data.sub === 2;
          w.spawnZone({
            x: e.x,
            y: e.y,
            radius: last ? 130 : 104,
            angle: e.facing,
            halfW: last ? 1.6 : 0.95,
            shape: 'cone',
            faction: 'enemy',
            warn: last ? 0.3 : 0.16,
            live: 0.2,
            damage: last ? 24 : 16,
            mode: 'burst',
            color: last ? C.danger : C.telegraph,
            knockback: last ? 520 : 300,
            follow: e,
          });
          w.sfx(last ? 'punch' : 'blade', 0.9);
          if (last) w.shake(7);
          e.data.sub++;
        }
        if (e.t < 1.5) {
          const a = Math.atan2(p.y - e.y, p.x - e.x);
          e.moveX = Math.cos(a) * 90;
          e.moveY = Math.sin(a) * 90;
        } else {
          e.moveX = e.moveY = 0;
        }
        if (e.t > 2.2) endMove(e, 1.1);
        break;
      }

      // --- B: shield charge across the arena
      case MOVE.b:
        if (e.data.sub === 0) {
          e.data.sub = 1;
          e.data.aim = w.angleToPlayer(e.x, e.y);
          w.sfx('telegraph', 1);
        }
        if (e.t < 0.8) {
          e.facing = damp(e.facing, e.data.aim, 5, dt);
          e.data.aim = damp(e.data.aim, w.angleToPlayer(e.x, e.y), 2.5, dt);
          e.moveX = e.moveY = 0;
        } else if (e.t < 1.5) {
          e.moveX = Math.cos(e.facing) * 620;
          e.moveY = Math.sin(e.facing) * 620;
          w.spawnZone({
            x: e.x + Math.cos(e.facing) * 24,
            y: e.y + Math.sin(e.facing) * 24,
            radius: 40,
            shape: 'circle',
            faction: 'enemy',
            warn: 0,
            live: 0.08,
            damage: 20,
            mode: 'burst',
            color: C.danger,
            knockback: 480,
          });
        } else if (e.t > 2.1) {
          endMove(e, 1.3);
        }
        break;

      // --- C: borrowed boss mechanics
      case MOVE.c: {
        if (e.data.sub === 0) {
          e.data.sub = 1;
          e.data.borrow = Math.floor(rand(0, 3));
          w.sfx('glitch', 0.8);
          const names = ['MADRIGAL-7', 'MNEMOSYNE', 'VERDANT'];
          w.bark(e.x, e.y - 66, 'ARCHIVO: ' + names[e.data.borrow], '#8b9cff');
        }
        e.moveX = e.moveY = 0;
        if (e.t > 0.6 && e.data.sub === 1) {
          e.data.sub = 2;
          const p = w.playerActor;
          if (e.data.borrow === 0) {
            for (let i = 0; i < 3; i++) {
              tele(w, p.x + rand(-90, 90), p.y + rand(-90, 90), 74, 0.6 + i * 0.15, 18, C.amber);
            }
          } else if (e.data.borrow === 1) {
            for (let i = 0; i < 7; i++) {
              aimShot(e, w, (i - 3) * 0.16, {
                speed: 320,
                damage: 10,
                kind: 'needle',
                color: C.magenta,
                size: 16,
              });
            }
            w.sfx('shot', 0.7);
          } else {
            const n = 6;
            for (let i = 0; i < n; i++) {
              const a = (i / n) * TAU;
              w.spawnZone({
                x: p.x + Math.cos(a) * 92,
                y: p.y + Math.sin(a) * 92,
                radius: 50,
                shape: 'circle',
                faction: 'enemy',
                warn: 0.7,
                live: 0.4,
                damage: 14,
                mode: 'burst',
                color: C.lime,
                root: 0.6,
              });
            }
          }
        }
        if (e.t > 1.8) endMove(e, 1.4);
        break;
      }

      // --- D (phase 3): corrupted data burst, erratic but readable
      case MOVE.d:
        e.moveX = e.moveY = 0;
        if (e.data.sub === 0) {
          e.data.sub = 1;
          e.data.aim = rand(0, TAU);
          w.sfx('bossRoar', 0.6);
        }
        if (e.t > 0.5 && e.t < 2.6) {
          if ((e.data.rate ?? 0) <= 0) {
            e.data.rate = 0.2;
            e.data.aim += 0.9;
            radial(e, w, 6, e.data.aim, {
              speed: 230,
              damage: 10,
              kind: 'shard',
              color: '#8b9cff',
              size: 13,
            });
            w.sfx('shot', 0.4);
          }
          e.data.rate -= dt;
        }
        if (e.t > 3) endMove(e, 1.2);
        break;

      // --- E (phase 3): blink strike chain
      case MOVE.e: {
        const p = w.playerActor;
        if (e.data.sub < 3 && e.t > 0.62 * e.data.sub) {
          const a = rand(0, TAU);
          const spot = w.map.clampToFloor(p.x + Math.cos(a) * 108, p.y + Math.sin(a) * 108, e.radius);
          w.fx.burst(e.x, e.y, 22, '#8b9cff', { speed: 240, life: 0.4 });
          e.x = spot.x;
          e.y = spot.y;
          e.facing = Math.atan2(p.y - e.y, p.x - e.x);
          w.fx.burst(e.x, e.y, 22, '#8b9cff', { speed: 240, life: 0.4 });
          w.sfx('glitch', 0.6);
          w.spawnZone({
            x: e.x,
            y: e.y,
            radius: 112,
            angle: e.facing,
            halfW: 1.0,
            shape: 'cone',
            faction: 'enemy',
            warn: 0.42,
            live: 0.18,
            damage: 17,
            mode: 'burst',
            color: C.danger,
            knockback: 340,
            follow: e,
          });
          e.data.sub++;
        }
        e.moveX = e.moveY = 0;
        if (e.t > 2.1) endMove(e, 1.5);
        break;
      }
    }
  },
  draw(e, ctx, time) {
    const ph = e.data.phase ?? 1;
    const broken = ph >= 3;
    ctx.save();
    ctx.translate(e.x, e.y);
    if (broken) {
      // Body fragments orbit the core when he loses cohesion.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 12; i++) {
        const a = time * (1 + (i % 3) * 0.4) + (i / 12) * TAU;
        const r = e.radius * (0.9 + 0.5 * Math.sin(time * 2 + i));
        ctx.fillStyle = withAlpha('#8b9cff', 0.5);
        poly(ctx, Math.cos(a) * r, Math.sin(a) * r, 5 + (i % 3), 4, a);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.rotate(e.facing + Math.PI / 2);
    // Armour
    ctx.fillStyle = broken ? '#141a3a' : '#1a2148';
    ctx.beginPath();
    ctx.moveTo(0, -e.radius * 1.15);
    ctx.lineTo(e.radius * 0.8, -e.radius * 0.2);
    ctx.lineTo(e.radius * 0.55, e.radius);
    ctx.lineTo(-e.radius * 0.55, e.radius);
    ctx.lineTo(-e.radius * 0.8, -e.radius * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = withAlpha(broken ? C.danger : '#8b9cff', 0.95);
    ctx.lineWidth = 3;
    ctx.stroke();
    // Helmet slit
    ctx.fillStyle = withAlpha(broken ? C.danger : '#8b9cff', 0.9);
    ctx.fillRect(-9, -e.radius * 0.95, 18, 4);
    // Sword
    ctx.save();
    ctx.rotate(-0.5);
    ctx.strokeStyle = withAlpha(broken ? C.danger : '#c3ccff', 0.95);
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(e.radius * 0.7, 6);
    ctx.lineTo(e.radius * 0.7 + 8, -58);
    ctx.stroke();
    ctx.restore();
    // Shield
    if (!broken) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = withAlpha('#8b9cff', 0.7);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(-e.radius * 0.75, -6, 12, 26, 0.2, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = withAlpha('#8b9cff', 0.18);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, e.x, e.y, 120, broken ? C.danger : '#8b9cff', 0.2);
    // Faces of the erased flicker across the armour.
    if (chance(0.06)) {
      ctx.globalAlpha = 0.35;
      ctx.font = '10px monospace';
      ctx.fillStyle = '#c3ccff';
      ctx.textAlign = 'center';
      ctx.fillText(pick(['ALIA', 'MERCE', 'TOBÍAS', 'RIN', 'KAI', 'NORA']), e.x + rand(-20, 20), e.y + rand(-20, 20));
    }
    ctx.restore();
  },
};

// ==========================================================================
//  AURELION — el Santo de las Máquinas (final)
// ==========================================================================

const aurelion: EnemyDef = {
  id: 'aurelion',
  name: 'AURELION',
  hp: 2600,
  radius: 44,
  speed: 104,
  contact: 0,
  color: '#f7edd4',
  accent: '#ffe3a3',
  weight: 1,
  credits: [0, 0],
  healChance: 0,
  sight: 2000,
  behavior(e, w, dt) {
    bossCommon(e, dt);
    e.data.phase = e.data.phase ?? 1;
    const ph = e.data.phase;
    const sub = ['Ceremonia', 'Los que ya venciste', 'Colapso de Nexus-9', 'Todo lo que aprendiste'][ph - 1];
    w.setBossBar(e.name, e.hp, e.maxHp, ph, 4, 'el Santo de las Máquinas · ' + sub);
    phaseCheck(e, w, [0.72, 0.46, 0.2], (phase) => {
      if (phase === 2) {
        w.bark(e.x, e.y - 74, 'Recuerda a quienes ya lloraste.', '#ffe3a3');
      }
      if (phase === 3) {
        w.bark(e.x, e.y - 74, 'MIRA LO QUE DEFIENDES.', C.danger);
        w.glitch(1, 2.2);
        e.radius = 56;
      }
      if (phase === 4) {
        w.bark(e.x, e.y - 84, 'No me obligues a extrañarte.', '#fff7e0');
        w.glitch(0.6, 1.4);
      }
    });
    if (e.data.invuln > 0) return;
    e.data.collapse = ph >= 3 ? 1 : 0;

    if (e.data.move === MOVE.none) {
      reposition(e, w, dt, e.def.speed * (1 + (ph - 1) * 0.12), 220);
      if (e.cd <= 0) {
        const pool =
          ph === 1
            ? [MOVE.a, MOVE.b]
            : ph === 2
              ? [MOVE.a, MOVE.c, MOVE.b]
              : ph === 3
                ? [MOVE.d, MOVE.e, MOVE.a]
                : [MOVE.d, MOVE.e, MOVE.f, MOVE.a];
        startMove(e, pick(pool));
      }
      return;
    }

    switch (e.data.move) {
      // --- A: cross of light beams, rotating
      case MOVE.a:
        e.moveX = e.moveY = 0;
        if (e.data.sub === 0) {
          e.data.sub = 1;
          e.data.aim = w.angleToPlayer(e.x, e.y) + 0.4;
          w.sfx('telegraph', 1);
        }
        if (e.t > 0.85 && e.data.sub === 1) {
          e.data.sub = 2;
          const arms = ph >= 3 ? 6 : 4;
          for (let i = 0; i < arms; i++) {
            beam(w, e.x, e.y, e.data.aim + (i / arms) * TAU, 520, 20, 0, 18, '#ffe3a3', 0.36);
          }
          w.sfx('chargeShot', 0.9);
          w.shake(7);
        }
        if (e.t > 1.7) endMove(e, 1.1);
        break;

      // --- B: data swords rain down on tracked positions
      case MOVE.b: {
        e.moveX = e.moveY = 0;
        const count = ph >= 3 ? 7 : 5;
        if (e.data.sub < count && e.t > 0.3 * e.data.sub) {
          const p = w.playerActor;
          tele(
            w,
            p.x + p.vx * 0.28 + rand(-30, 30),
            p.y + p.vy * 0.28 + rand(-30, 30),
            62,
            0.72,
            17,
            '#fff7e0',
            0.2,
            300,
          );
          w.sfx('telegraph', 0.5);
          e.data.sub++;
        }
        if (e.t > 0.3 * count + 1.1) endMove(e, 1.2);
        break;
      }

      // --- C (phase 2): summon simulations of the fallen bosses
      case MOVE.c:
        e.moveX = e.moveY = 0;
        if (e.data.sub === 0) {
          e.data.sub = 1;
          w.sfx('bossRoar', 0.8);
          w.shake(8);
          const roster = ['scrapper', 'dataMonk', 'botanicalGuardian', 'firewallPaladin'];
          for (let i = 0; i < 2; i++) {
            const a = (i / 2) * TAU + rand(0, 1);
            const spot = w.map.clampToFloor(e.x + Math.cos(a) * 200, e.y + Math.sin(a) * 200, 20);
            const sim = w.spawnEnemy(pick(roster), spot.x, spot.y, { elite: true });
            if (sim) w.fx.shockwave(spot.x, spot.y, 90, '#ffe3a3', 0.6, 4);
          }
          w.bark(e.x, e.y - 74, 'SIMULACIÓN: GUARDIANES', '#ffe3a3');
        }
        if (e.t > 1.5) endMove(e, 2.6);
        break;

      // --- D (phase 3+): expanding rings with one safe gap
      case MOVE.d:
        e.moveX = e.moveY = 0;
        if (e.data.sub === 0) {
          e.data.sub = 1;
          e.data.aim = rand(0, TAU);
          w.sfx('telegraph', 1);
        }
        if (e.t > 0.55 && e.t < 2.8) {
          if ((e.data.rate ?? 0) <= 0) {
            e.data.rate = 0.55;
            // Ring of projectiles with a deliberate gap to dodge through.
            const n = 14;
            const gap = Math.floor(rand(0, n));
            for (let i = 0; i < n; i++) {
              if (i === gap || i === (gap + 1) % n) continue;
              const a = e.data.aim + (i / n) * TAU;
              w.spawnProjectile({
                x: e.x + Math.cos(a) * e.radius,
                y: e.y + Math.sin(a) * e.radius,
                vx: Math.cos(a) * 190,
                vy: Math.sin(a) * 190,
                radius: 9,
                damage: 12,
                faction: 'enemy',
                kind: 'orb',
                color: '#ffe3a3',
                maxLife: 3.4,
                size: 12,
                angle: a,
              });
            }
            e.data.aim += 0.22;
            w.sfx('shot', 0.5);
          }
          e.data.rate -= dt;
        }
        if (e.t > 3.2) endMove(e, 1.3);
        break;

      // --- E (phase 3+): judgement sweep — a rotating beam you must outrun
      case MOVE.e:
        if (e.data.sub === 0) {
          e.data.sub = 1;
          e.data.aim = w.angleToPlayer(e.x, e.y);
          e.data.dirS = chance(0.5) ? 1 : -1;
          w.sfx('bossRoar', 0.7);
          w.shake(6);
        }
        e.moveX = e.moveY = 0;
        if (e.t > 0.9 && e.t < 3.1) {
          e.data.aim += dt * 1.5 * e.data.dirS;
          if ((e.data.rate2 ?? 0) <= 0) {
            e.data.rate2 = 0.1;
            beam(w, e.x, e.y, e.data.aim, 560, 17, 0, 13, '#fff7e0', 0.14);
          }
          e.data.rate2 -= dt;
        }
        if (e.t > 3.5) endMove(e, 1.4);
        break;

      // --- F (final phase): the full sermon — beams, rain and adds at once
      case MOVE.f:
        e.moveX = e.moveY = 0;
        if (e.data.sub === 0) {
          e.data.sub = 1;
          w.sfx('bossRoar');
          w.shake(10);
          w.glitch(0.5, 1);
          w.bark(e.x, e.y - 84, 'QUE TODO CALLE', C.danger);
        }
        if (e.t > 0.8 && e.data.sub === 1) {
          e.data.sub = 2;
          for (let i = 0; i < 8; i++) {
            beam(w, e.x, e.y, (i / 8) * TAU + 0.2, 560, 18, 0.6 + i * 0.05, 20, '#ffe3a3', 0.34);
          }
        }
        if (e.t > 2.0 && e.data.sub === 2) {
          e.data.sub = 3;
          const p = w.playerActor;
          for (let i = 0; i < 6; i++) {
            tele(w, p.x + rand(-140, 140), p.y + rand(-140, 140), 60, 0.7 + i * 0.1, 16, '#fff7e0');
          }
        }
        if (e.t > 3.6) endMove(e, 1.8);
        break;
    }
  },
  draw(e, ctx, time) {
    const ph = e.data.phase ?? 1;
    const massive = ph >= 3;
    ctx.save();
    ctx.translate(e.x, e.y);

    // Halo
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const haloR = e.radius * (massive ? 2.2 : 1.6);
    for (let i = 0; i < 3; i++) {
      ring(ctx, 0, -e.radius * 0.9, haloR - i * 8, 2, '#ffe3a3', 0.35 - i * 0.08);
    }
    glow(ctx, 0, -e.radius * 0.4, e.radius * 4.5, '#ffe3a3', massive ? 0.28 : 0.2);
    ctx.restore();

    // Black cabling that binds the divine figure
    ctx.strokeStyle = withAlpha('#0a0a12', 0.9);
    ctx.lineWidth = 4;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + Math.sin(time * 0.5 + i) * 0.2;
      const len = e.radius * (1.7 + 0.35 * Math.sin(time * 1.2 + i * 2));
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * e.radius * 0.4, Math.sin(a) * e.radius * 0.4);
      ctx.quadraticCurveTo(Math.cos(a + 0.4) * len * 0.7, Math.sin(a + 0.4) * len * 0.7, Math.cos(a) * len, Math.sin(a) * len);
      ctx.stroke();
    }

    // Robed body of light — shoulders sit below the head so the silhouette
    // reads as a figure, not a glowing blob.
    const bodyGrad = ctx.createLinearGradient(0, -e.radius * 1.3, 0, e.radius);
    bodyGrad.addColorStop(0, '#fffdf5');
    bodyGrad.addColorStop(0.55, massive ? '#ffdc9a' : '#f4e3bd');
    bodyGrad.addColorStop(1, massive ? '#7a5a20' : '#9c8452');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(0, -e.radius * 1.28);
    ctx.quadraticCurveTo(e.radius * 1.15, -e.radius * 0.75, e.radius * 0.78, e.radius);
    ctx.lineTo(-e.radius * 0.78, e.radius);
    ctx.quadraticCurveTo(-e.radius * 1.15, -e.radius * 0.75, 0, -e.radius * 1.28);
    ctx.fill();
    ctx.strokeStyle = withAlpha('#fff7e0', 0.9);
    ctx.lineWidth = 2;
    ctx.stroke();
    // Outstretched arms, palms open: benediction, not aggression.
    ctx.strokeStyle = withAlpha('#fff7e0', 0.85);
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      const swing = Math.sin(time * 1.1 + (s > 0 ? 0 : 1.6)) * 0.12;
      ctx.beginPath();
      ctx.moveTo(s * e.radius * 0.45, -e.radius * 0.75);
      ctx.quadraticCurveTo(
        s * e.radius * 1.35,
        -e.radius * (0.5 + swing),
        s * e.radius * 1.5,
        e.radius * (0.15 + swing),
      );
      ctx.stroke();
      ctx.fillStyle = withAlpha('#fffdf5', 0.95);
      ctx.beginPath();
      ctx.arc(s * e.radius * 1.5, e.radius * (0.15 + swing), 6, 0, TAU);
      ctx.fill();
    }
    // Dark neck gap separating head from shoulders.
    ctx.fillStyle = 'rgba(8,7,4,0.75)';
    ctx.beginPath();
    ctx.ellipse(0, -e.radius * 1.28, 9, 5, 0, 0, TAU);
    ctx.fill();

    // Hundreds of faces surfacing briefly
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 5; i++) {
      const ph2 = (time * 0.7 + i * 0.37) % 1;
      const fy = -e.radius * 1.4 + ph2 * e.radius * 2.2;
      const fx = Math.sin(i * 12.3 + Math.floor(time * 0.7 + i * 0.37) * 3.1) * e.radius * 0.5;
      const a = Math.sin(ph2 * Math.PI);
      ctx.strokeStyle = withAlpha('#0a0a12', a * 0.6);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(fx, fy, 7, 9, 0, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(fx - 2.5, fy - 2, 1, 0, TAU);
      ctx.arc(fx + 2.5, fy - 2, 1, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    // Head
    ctx.fillStyle = '#fffdf5';
    ctx.beginPath();
    ctx.ellipse(0, -e.radius * 1.62, 13, 17, 0, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, -e.radius * 1.62, 46, '#fff7e0', 0.5);
    ctx.restore();

    if (massive) {
      // Storm of data in the final forms
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 16; i++) {
        const a = time * 1.6 + (i / 16) * TAU;
        const r = e.radius * (2.1 + 0.5 * Math.sin(time * 2 + i));
        ctx.fillStyle = withAlpha(i % 3 === 0 ? C.danger : '#ffe3a3', 0.5);
        ctx.fillRect(Math.cos(a) * r, Math.sin(a) * r, 5, 12);
      }
      ctx.restore();
    }
    ctx.restore();
  },
};

// Registered into the shared table so spawning works exactly like any enemy.
export const BOSS_DEFS: Record<string, EnemyDef> = {
  collector,
  madrigal,
  suturaFast,
  suturaLong,
  mnemosyne,
  mnemoIllusion,
  memoryPhantom,
  verdant,
  archivist,
  aurelion,
};

export function registerBosses(): void {
  for (const [k, v] of Object.entries(BOSS_DEFS)) ENEMY_DEFS[k] = v;
}

/** Ids that get a boss health bar and block room exits until defeated. */
export const BOSS_IDS = new Set([
  'collector',
  'madrigal',
  'suturaFast',
  'suturaLong',
  'mnemosyne',
  'verdant',
  'archivist',
  'aurelion',
]);
