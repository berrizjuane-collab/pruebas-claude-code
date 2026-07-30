/**
 * Every regular enemy in Nexus-9. Each entry is data (stats, colours) plus two
 * functions: a behaviour state machine and a draw routine. Shared helpers keep
 * the individual behaviours short enough to read at a glance.
 *
 * Readability contract, applied everywhere:
 *   - amber ring / body flash  = an attack is coming
 *   - red zone or projectile   = it will hurt you
 *   - white flash              = staggered, free hits
 */

import { TAU, angleDelta, clamp, damp, dist, rand, randInt, chance, pick } from '../core/util';
import { C, withAlpha, mix } from '../art/palette';
import { disc, glow, line, poly, ring, wedge } from '../core/render';
import type { EnemyLike, World } from './api';
import type { TileMap } from '../world/tiles';

let nextId = 1;

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  radius: number;
  speed: number;
  /** Damage dealt by simply touching the player (0 = harmless on contact). */
  contact: number;
  color: string;
  accent: string;
  /** Knockback resistance 0..1 (1 = immovable). */
  weight: number;
  /** Credits dropped on death. */
  credits: [number, number];
  /** Chance to drop a health pickup. */
  healChance: number;
  /** Aggro radius. */
  sight: number;
  flying?: boolean;
  barks?: string[];
  behavior: (e: Enemy, w: World, dt: number) => void;
  draw: (e: Enemy, ctx: CanvasRenderingContext2D, time: number) => void;
  onDeath?: (e: Enemy, w: World) => void;
}

export class Enemy implements EnemyLike {
  id = nextId++;
  defId: string;
  def: EnemyDef;
  name: string;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  moveX = 0;
  moveY = 0;
  radius: number;
  hp: number;
  maxHp: number;
  dead = false;
  facing = 0;
  elite = false;
  isBoss = false;

  state = 'idle';
  t = 0;
  cd = 0;
  aggro = false;
  hurtTimer = 0;
  staggerTimer = 0;
  slowTimer = 0;
  rootTimer = 0;
  pinTimer = 0;
  spawnTimer = 0.45;
  deathTimer = 0;
  homeX: number;
  homeY: number;
  wanderX = 0;
  wanderY = 0;
  barkCd = rand(3, 12);
  /** Per-type scratch space. */
  data: Record<string, number> = {};
  seed = rand(0, 100);

  constructor(def: EnemyDef, x: number, y: number, elite = false) {
    this.def = def;
    this.defId = def.id;
    this.name = def.name;
    this.x = x;
    this.y = y;
    this.homeX = x;
    this.homeY = y;
    this.wanderX = x;
    this.wanderY = y;
    this.elite = elite;
    this.radius = def.radius * (elite ? 1.25 : 1);
    this.maxHp = Math.round(def.hp * (elite ? 3.4 : 1));
    this.hp = this.maxHp;
    if (elite) this.name = 'ÉLITE · ' + def.name;
  }

  get contactDamage(): number {
    return this.def.contact * (this.elite ? 1.4 : 1);
  }

  hurt(amount: number, w: World): void {
    this.hurtTimer = 0.16;
    this.hp -= amount;
    this.aggro = true;
  }

  update(dt: number, w: World, map: TileMap): void {
    if (this.dead) {
      this.deathTimer += dt;
      return;
    }
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.staggerTimer = Math.max(0, this.staggerTimer - dt);
    this.slowTimer = Math.max(0, this.slowTimer - dt);
    this.rootTimer = Math.max(0, this.rootTimer - dt);
    this.pinTimer = Math.max(0, this.pinTimer - dt);
    this.spawnTimer = Math.max(0, this.spawnTimer - dt);
    this.cd = Math.max(0, this.cd - dt);
    this.t += dt;
    this.barkCd -= dt;

    this.moveX = 0;
    this.moveY = 0;

    if (this.spawnTimer > 0) {
      // Brief materialise window — cannot act, cannot be cheap-shot into a corner.
    } else if (this.staggerTimer > 0 || this.pinTimer > 0) {
      // Punished: no actions.
    } else {
      this.def.behavior(this, w, dt);
      if (this.def.barks && this.barkCd <= 0 && this.aggro && chance(0.5)) {
        this.barkCd = rand(9, 22);
        w.bark(this.x, this.y - this.radius - 12, pick(this.def.barks), this.def.accent);
      } else if (this.barkCd <= 0) {
        this.barkCd = rand(6, 14);
      }
    }

    const slowMul = this.slowTimer > 0 ? 0.42 : 1;
    const rooted = this.rootTimer > 0;
    const tx = rooted ? 0 : this.moveX * slowMul;
    const ty = rooted ? 0 : this.moveY * slowMul;
    this.vx = damp(this.vx, tx, 9, dt);
    this.vy = damp(this.vy, ty, 9, dt);

    if (this.def.flying) {
      // Flyers ignore low barriers but still respect walls.
      const nx = this.x + this.vx * dt;
      const ny = this.y + this.vy * dt;
      if (!map.circleBlocked(nx, this.y, this.radius * 0.6)) this.x = nx;
      else this.vx *= -0.4;
      if (!map.circleBlocked(this.x, ny, this.radius * 0.6)) this.y = ny;
      else this.vy *= -0.4;
    } else {
      map.moveCircle(this, this.vx * dt, this.vy * dt, this.radius);
    }
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    if (this.dead) return;
    const spawnK = this.spawnTimer > 0 ? 1 - this.spawnTimer / 0.45 : 1;
    ctx.save();
    if (spawnK < 1) {
      ctx.globalAlpha = spawnK;
      ctx.translate(this.x, this.y);
      ctx.scale(0.6 + spawnK * 0.4, 0.6 + spawnK * 0.4);
      ctx.translate(-this.x, -this.y);
    }
    // Shadow
    if (!this.def.flying) {
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + this.radius * 0.8, this.radius * 0.9, this.radius * 0.42, 0, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + this.radius * 1.9, this.radius * 0.7, this.radius * 0.3, 0, 0, TAU);
      ctx.fill();
    }
    this.def.draw(this, ctx, time);

    // Damage read-out: minor enemies dim and crack instead of showing a bar.
    const k = this.hp / this.maxHp;
    if (k < 0.999) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.y, this.radius * 1.5, C.danger, (1 - k) * 0.22);
      ctx.restore();
    }
    if (this.hurtTimer > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.hurtTimer / 0.16;
      disc(ctx, this.x, this.y, this.radius * 1.05, withAlpha('#ffffff', 0.75));
      ctx.restore();
    }
    if (this.staggerTimer > 0 || this.pinTimer > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const n = 3;
      for (let i = 0; i < n; i++) {
        const a = time * 6 + (i / n) * TAU;
        disc(
          ctx,
          this.x + Math.cos(a) * (this.radius + 9),
          this.y - this.radius - 8 + Math.sin(a) * 3,
          2,
          withAlpha(this.pinTimer > 0 ? C.ally : C.white, 0.85),
        );
      }
      ctx.restore();
    }
    if (this.elite) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ring(ctx, this.x, this.y, this.radius + 6, 1.6, C.elite, 0.5 + 0.2 * Math.sin(time * 4));
      ctx.restore();
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------------- helpers

function faceTo(e: Enemy, x: number, y: number, rate = 9, dt = 1 / 60): void {
  const target = Math.atan2(y - e.y, x - e.x);
  e.facing += angleDelta(e.facing, target) * clamp(rate * dt, 0, 1);
}

function moveToward(e: Enemy, x: number, y: number, speed: number): void {
  const a = Math.atan2(y - e.y, x - e.x);
  e.moveX = Math.cos(a) * speed;
  e.moveY = Math.sin(a) * speed;
}

function moveAway(e: Enemy, x: number, y: number, speed: number): void {
  const a = Math.atan2(e.y - y, e.x - x);
  e.moveX = Math.cos(a) * speed;
  e.moveY = Math.sin(a) * speed;
}

/** Circle-strafe around a target — makes ranged enemies feel alive. */
function strafe(e: Enemy, x: number, y: number, speed: number, dir: number): void {
  const a = Math.atan2(y - e.y, x - e.x) + (Math.PI / 2) * dir;
  e.moveX = Math.cos(a) * speed;
  e.moveY = Math.sin(a) * speed;
}

/** Hold a preferred band of distance from the player. */
function keepRange(e: Enemy, w: World, ideal: number, speed: number, dt: number): void {
  const p = w.playerActor;
  const d = dist(e.x, e.y, p.x, p.y);
  faceTo(e, p.x, p.y, 7, dt);
  if (d > ideal * 1.25) moveToward(e, p.x, p.y, speed);
  else if (d < ideal * 0.72) moveAway(e, p.x, p.y, speed);
  else {
    e.data.dir = e.data.dir || (chance(0.5) ? 1 : -1);
    strafe(e, p.x, p.y, speed * 0.72, e.data.dir);
    if (chance(0.006)) e.data.dir *= -1;
  }
}

function patrol(e: Enemy, w: World, dt: number, speed: number, radius = 90): void {
  if (dist(e.x, e.y, e.wanderX, e.wanderY) < 18 || (e.data.wanderT ?? 0) <= 0) {
    e.data.wanderT = rand(1.2, 3.2);
    const a = rand(0, TAU);
    const r = rand(30, radius);
    e.wanderX = e.homeX + Math.cos(a) * r;
    e.wanderY = e.homeY + Math.sin(a) * r;
  }
  e.data.wanderT -= dt;
  moveToward(e, e.wanderX, e.wanderY, speed * 0.45);
  faceTo(e, e.wanderX, e.wanderY, 4, dt);
}

function checkAggro(e: Enemy, w: World): boolean {
  if (e.aggro) return true;
  const d = w.distToPlayer(e.x, e.y);
  if (d < e.def.sight && w.canSeePlayer(e.x, e.y)) {
    e.aggro = true;
    return true;
  }
  return false;
}

function shoot(
  e: Enemy,
  w: World,
  angle: number,
  opts: {
    speed?: number;
    damage?: number;
    kind?: 'bolt' | 'plasma' | 'shell' | 'grenade' | 'thorn' | 'needle' | 'orb' | 'slag' | 'seed' | 'shard';
    color?: string;
    radius?: number;
    size?: number;
    life?: number;
    homing?: number;
    fuse?: number;
    explodeRadius?: number;
    explodeDamage?: number;
    deflectable?: boolean;
  } = {},
): void {
  const {
    speed = 260,
    damage = 8,
    kind = 'bolt',
    color = C.enemy,
    radius = 6,
    size = 8,
    life = 2.4,
    homing = 0,
    fuse = 0,
    explodeRadius = 0,
    explodeDamage = 0,
    deflectable = true,
  } = opts;
  w.spawnProjectile({
    x: e.x + Math.cos(angle) * (e.radius + 4),
    y: e.y + Math.sin(angle) * (e.radius + 4),
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius,
    damage,
    faction: 'enemy',
    kind,
    color,
    maxLife: life,
    homing,
    fuse,
    explodeRadius,
    explodeDamage,
    size,
    angle,
    deflectable,
  });
}

/** Standard telegraph→strike melee used by most grounded enemies. */
function meleeAttack(
  e: Enemy,
  w: World,
  opts: {
    reach: number;
    half: number;
    damage: number;
    color?: string;
    knockback?: number;
    warn: number;
    live?: number;
  },
): void {
  w.spawnZone({
    x: e.x,
    y: e.y,
    radius: opts.reach,
    angle: e.facing,
    shape: 'cone',
    halfW: opts.half,
    faction: 'enemy',
    warn: opts.warn,
    live: opts.live ?? 0.16,
    damage: opts.damage,
    mode: 'burst',
    color: opts.color ?? C.danger,
    knockback: opts.knockback ?? 240,
    follow: e,
  });
}

// ------------------------------------------------------------- draw utilities

function bodyColor(e: Enemy, base: string): string {
  const k = e.hp / e.maxHp;
  return k < 0.5 ? mix(base, C.danger, (0.5 - k) * 0.9) : base;
}

/** Amber warning glow every winding enemy shares. */
function telegraphGlow(e: Enemy, ctx: CanvasRenderingContext2D, k: number, cone?: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, e.x, e.y, e.radius * (2.2 + k * 1.6), C.telegraph, 0.28 + k * 0.3);
  ring(ctx, e.x, e.y, e.radius + 6 + (1 - k) * 16, 2 + k * 2, C.telegraph, 0.5 + k * 0.5);
  if (cone !== undefined) {
    wedge(ctx, e.x, e.y, e.radius + 60 * k, e.facing, cone, e.radius);
    ctx.fillStyle = withAlpha(C.telegraph, 0.12 * k);
    ctx.fill();
  }
  ctx.restore();
}

function drawEye(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  intensity = 1,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, y, r * 4, color, 0.4 * intensity);
  ctx.restore();
  disc(ctx, x, y, r, withAlpha(color, 0.95));
  disc(ctx, x, y, r * 0.45, '#ffffff');
}

// ==========================================================================
//  PRÓLOGO — El Callejón de la Señal
// ==========================================================================

const rat: EnemyDef = {
  id: 'rat',
  name: 'Rata Mecánica',
  hp: 14,
  radius: 9,
  speed: 155,
  contact: 6,
  color: '#3a2a4a',
  accent: C.enemy,
  weight: 0,
  credits: [1, 3],
  healChance: 0.05,
  sight: 300,
  behavior(e, w, dt) {
    const p = w.playerActor;
    if (!checkAggro(e, w)) {
      patrol(e, w, dt, e.def.speed, 70);
      return;
    }
    const d = w.distToPlayer(e.x, e.y);
    faceTo(e, p.x, p.y, 10, dt);
    switch (e.state) {
      case 'idle':
        // Scurry in erratic arcs instead of a straight line — reads as vermin.
        if (d < 46 && e.cd <= 0) {
          e.state = 'wind';
          e.t = 0;
        } else {
          const wobble = Math.sin(e.t * 9 + e.seed) * 0.5;
          const a = Math.atan2(p.y - e.y, p.x - e.x) + wobble;
          e.moveX = Math.cos(a) * e.def.speed;
          e.moveY = Math.sin(a) * e.def.speed;
        }
        break;
      case 'wind':
        if (e.t > 0.28) {
          meleeAttack(e, w, { reach: 30, half: 1.0, damage: 7, warn: 0, live: 0.14, knockback: 180 });
          w.sfx('blade', 0.4);
          e.moveX = Math.cos(e.facing) * 420;
          e.moveY = Math.sin(e.facing) * 420;
          e.state = 'recover';
          e.t = 0;
        }
        break;
      case 'recover':
        if (e.t > 0.4) {
          e.state = 'idle';
          e.cd = rand(0.5, 1.1);
        }
        break;
    }
  },
  draw(e, ctx, time) {
    const col = bodyColor(e, '#2b1f3d');
    if (e.state === 'wind') telegraphGlow(e, ctx, clamp(e.t / 0.28, 0, 1));
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.facing);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(0, 0, e.radius * 1.15, e.radius * 0.78, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = withAlpha(C.enemy, 0.75);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // Skittering legs
    ctx.strokeStyle = withAlpha('#6b4f7d', 0.9);
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) {
      const ph = Math.sin(time * 18 + i * 2 + e.seed) * 3;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-3 + i * 4, s * 4);
        ctx.lineTo(-4 + i * 4 + ph * 0.4, s * (9 + Math.abs(ph) * 0.3));
        ctx.stroke();
      }
    }
    // Tail
    ctx.strokeStyle = withAlpha(C.enemy, 0.5);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-e.radius, 0);
    ctx.quadraticCurveTo(-e.radius - 8, Math.sin(time * 10 + e.seed) * 5, -e.radius - 13, 0);
    ctx.stroke();
    ctx.restore();
    drawEye(ctx, e.x + Math.cos(e.facing) * 6, e.y + Math.sin(e.facing) * 6, 2.1, C.enemy);
  },
};

const drone: EnemyDef = {
  id: 'drone',
  name: 'Dron de Vigilancia',
  hp: 24,
  radius: 12,
  speed: 92,
  contact: 0,
  color: '#22203c',
  accent: C.cyan,
  weight: 0,
  credits: [2, 5],
  healChance: 0.1,
  sight: 340,
  flying: true,
  barks: [
    'Ciudadano: detenga su identidad no autorizada.',
    'Registro facial… corrupto. Reintentando.',
    'Su expediente ha sido optimizado.',
  ],
  behavior(e, w, dt) {
    if (!checkAggro(e, w)) {
      patrol(e, w, dt, e.def.speed, 110);
      return;
    }
    const p = w.playerActor;
    keepRange(e, w, 165, e.def.speed, dt);
    switch (e.state) {
      case 'idle':
        if (e.cd <= 0 && w.canSeePlayer(e.x, e.y) && w.distToPlayer(e.x, e.y) < 320) {
          e.state = 'wind';
          e.t = 0;
          w.sfx('telegraph', 0.5);
        }
        break;
      case 'wind':
        e.moveX *= 0.2;
        e.moveY *= 0.2;
        faceTo(e, p.x, p.y, 12, dt);
        if (e.t > 0.55) {
          shoot(e, w, e.facing, { speed: 285, damage: 9, color: C.cyan, kind: 'bolt' });
          w.sfx('shot', 0.5);
          e.state = 'idle';
          e.cd = rand(1.6, 2.4);
          e.t = 0;
        }
        break;
    }
  },
  draw(e, ctx, time) {
    const hover = Math.sin(time * 3 + e.seed) * 3;
    const k = e.state === 'wind' ? clamp(e.t / 0.55, 0, 1) : 0;
    if (k > 0) telegraphGlow(e, ctx, k);
    ctx.save();
    ctx.translate(e.x, e.y + hover);
    // Rotor blur
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = withAlpha(C.cyan, 0.18);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, e.radius + 6, 0, TAU);
    ctx.stroke();
    ctx.restore();
    ctx.rotate(e.facing);
    ctx.fillStyle = bodyColor(e, '#1d1b34');
    poly(ctx, 0, 0, e.radius, 6, time * 1.5);
    ctx.fill();
    ctx.strokeStyle = withAlpha(C.cyan, 0.8);
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();
    // Aiming laser makes the shot unmissable to read.
    if (k > 0.25) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      line(
        ctx,
        e.x,
        e.y + hover,
        e.x + Math.cos(e.facing) * 300,
        e.y + hover + Math.sin(e.facing) * 300,
        1 + k,
        C.danger,
        0.28 + k * 0.4,
      );
      ctx.restore();
    }
    drawEye(ctx, e.x + Math.cos(e.facing) * 7, e.y + hover + Math.sin(e.facing) * 7, 3, k > 0 ? C.danger : C.cyan);
  },
};

const civilian: EnemyDef = {
  id: 'civilian',
  name: 'Civil Aumentado',
  hp: 32,
  radius: 13,
  speed: 82,
  contact: 5,
  color: '#2c2140',
  accent: C.magenta,
  weight: 0.15,
  credits: [2, 6],
  healChance: 0.18,
  sight: 300,
  barks: [
    'Yo no pedí olvidar su nombre.',
    '¿Dónde… dónde vivo?',
    'Duele menos. Duele menos. Duele menos.',
  ],
  behavior(e, w, dt) {
    if (!checkAggro(e, w)) {
      patrol(e, w, dt, e.def.speed, 60);
      return;
    }
    const p = w.playerActor;
    const d = w.distToPlayer(e.x, e.y);
    faceTo(e, p.x, p.y, 6, dt);
    switch (e.state) {
      case 'idle':
        moveToward(e, p.x, p.y, e.def.speed);
        if (d < 44 && e.cd <= 0) {
          e.state = 'wind';
          e.t = 0;
          w.sfx('telegraph', 0.4);
        }
        break;
      case 'wind':
        if (e.t > 0.5) {
          meleeAttack(e, w, { reach: 52, half: 0.9, damage: 12, warn: 0, live: 0.18, knockback: 300 });
          w.sfx('punch', 0.5);
          e.state = 'recover';
          e.t = 0;
        }
        break;
      case 'recover':
        if (e.t > 0.55) {
          e.state = 'idle';
          e.cd = rand(0.8, 1.4);
        }
        break;
    }
  },
  draw(e, ctx, time) {
    if (e.state === 'wind') telegraphGlow(e, ctx, clamp(e.t / 0.5, 0, 1), 0.9);
    const sway = Math.sin(time * 4 + e.seed) * 0.1;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.facing + Math.PI / 2 + sway);
    ctx.fillStyle = bodyColor(e, '#241a36');
    ctx.beginPath();
    ctx.ellipse(0, 0, e.radius * 0.8, e.radius * 1.1, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = withAlpha(C.magenta, 0.7);
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // Dangling arms
    ctx.strokeStyle = withAlpha('#3b2c55', 1);
    ctx.lineWidth = 3;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 8, -2);
      ctx.lineTo(s * 11, 9 + Math.sin(time * 3 + s) * 2);
      ctx.stroke();
    }
    ctx.restore();
    // Neural implant on the temple, flickering
    const hx = e.x + Math.cos(e.facing) * 4;
    const hy = e.y + Math.sin(e.facing) * 4 - 5;
    disc(ctx, hx, hy, 5.5, bodyColor(e, '#312348'));
    drawEye(ctx, hx + Math.cos(e.facing) * 3, hy + Math.sin(e.facing) * 3, 2, C.magenta, Math.sin(time * 7 + e.seed) > -0.6 ? 1 : 0.2);
  },
};

// ==========================================================================
//  NIVEL 1 — Distrito de la Lluvia Ácida
// ==========================================================================

const harvestDrone: EnemyDef = {
  id: 'harvestDrone',
  name: 'Dron Cosecha',
  hp: 32,
  radius: 13,
  speed: 88,
  contact: 0,
  color: '#1d2c22',
  accent: C.lime,
  weight: 0,
  credits: [3, 7],
  healChance: 0.12,
  sight: 380,
  flying: true,
  barks: ['Cosecha en curso.', 'Material orgánico: reciclable.'],
  behavior(e, w, dt) {
    if (!checkAggro(e, w)) {
      patrol(e, w, dt, e.def.speed, 120);
      return;
    }
    keepRange(e, w, 215, e.def.speed, dt);
    const p = w.playerActor;
    switch (e.state) {
      case 'idle':
        if (e.cd <= 0 && w.canSeePlayer(e.x, e.y)) {
          e.state = 'wind';
          e.t = 0;
          e.data.shots = 0;
          w.sfx('telegraph', 0.5);
        }
        break;
      case 'wind':
        faceTo(e, p.x, p.y, 10, dt);
        e.moveX *= 0.3;
        e.moveY *= 0.3;
        if (e.t > 0.6) {
          e.state = 'fire';
          e.t = 0;
        }
        break;
      case 'fire':
        e.moveX *= 0.1;
        e.moveY *= 0.1;
        if (e.t > 0.16) {
          e.t = 0;
          shoot(e, w, e.facing + rand(-0.06, 0.06), {
            speed: 215,
            damage: 10,
            color: C.lime,
            kind: 'orb',
            radius: 8,
            size: 11,
          });
          w.sfx('shot', 0.45);
          e.data.shots++;
          if (e.data.shots >= 3) {
            e.state = 'idle';
            e.cd = rand(2, 2.9);
          }
        }
        break;
    }
  },
  draw(e, ctx, time) {
    const hover = Math.sin(time * 2.6 + e.seed) * 3.5;
    if (e.state === 'wind') telegraphGlow(e, ctx, clamp(e.t / 0.6, 0, 1));
    ctx.save();
    ctx.translate(e.x, e.y + hover);
    ctx.rotate(e.facing);
    // Harvest claws
    ctx.strokeStyle = withAlpha('#5c7a54', 0.95);
    ctx.lineWidth = 2.5;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(2, s * 6);
      ctx.quadraticCurveTo(12, s * 12, 16, s * 5);
      ctx.stroke();
    }
    ctx.fillStyle = bodyColor(e, '#1b2a20');
    poly(ctx, 0, 0, e.radius, 5, Math.PI / 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha(C.lime, 0.8);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    drawEye(ctx, e.x + Math.cos(e.facing) * 6, e.y + hover + Math.sin(e.facing) * 6, 3, e.state === 'fire' ? C.danger : C.lime);
  },
};

const scrapper: EnemyDef = {
  id: 'scrapper',
  name: 'Chatarrero Aumentado',
  hp: 62,
  radius: 17,
  speed: 96,
  contact: 8,
  color: '#2e2418',
  accent: C.amber,
  weight: 0.5,
  credits: [5, 11],
  healChance: 0.2,
  sight: 330,
  barks: ['Todo lo que cae es mío.', 'Quieta. Vales más entera.'],
  behavior(e, w, dt) {
    if (!checkAggro(e, w)) {
      patrol(e, w, dt, e.def.speed, 70);
      return;
    }
    const p = w.playerActor;
    const d = w.distToPlayer(e.x, e.y);
    switch (e.state) {
      case 'idle':
        faceTo(e, p.x, p.y, 5, dt);
        moveToward(e, p.x, p.y, e.def.speed);
        if (d < 58 && e.cd <= 0) {
          e.state = 'wind';
          e.t = 0;
          e.data.swings = 0;
          w.sfx('telegraph', 0.6);
        }
        break;
      case 'wind':
        faceTo(e, p.x, p.y, 3, dt);
        moveToward(e, p.x, p.y, e.def.speed * 0.25);
        if (e.t > 0.55) {
          meleeAttack(e, w, {
            reach: 70,
            half: 1.1,
            damage: 17,
            warn: 0,
            live: 0.18,
            knockback: 380,
          });
          w.sfx('punch', 0.7);
          w.shake(3);
          e.moveX = Math.cos(e.facing) * 260;
          e.moveY = Math.sin(e.facing) * 260;
          e.data.swings++;
          e.state = e.data.swings < 2 && d < 90 ? 'wind2' : 'recover';
          e.t = 0;
        }
        break;
      case 'wind2':
        // Second swing comes fast: teaches the player not to greed a punish.
        faceTo(e, p.x, p.y, 4, dt);
        if (e.t > 0.42) {
          meleeAttack(e, w, { reach: 74, half: 1.3, damage: 19, warn: 0, live: 0.18, knockback: 420 });
          w.sfx('punch', 0.8);
          w.shake(4);
          e.state = 'recover';
          e.t = 0;
        }
        break;
      case 'recover':
        if (e.t > 0.75) {
          e.state = 'idle';
          e.cd = rand(0.7, 1.3);
        }
        break;
    }
  },
  draw(e, ctx, time) {
    const winding = e.state === 'wind' || e.state === 'wind2';
    if (winding) telegraphGlow(e, ctx, clamp(e.t / (e.state === 'wind' ? 0.55 : 0.42), 0, 1), 1.1);
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.facing);
    ctx.fillStyle = bodyColor(e, '#2a2116');
    ctx.beginPath();
    ctx.ellipse(0, 0, e.radius * 0.95, e.radius * 1.05, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = withAlpha(C.amber, 0.8);
    ctx.lineWidth = 2.2;
    ctx.stroke();
    // Oversized hydraulic arm
    const swingK = winding ? clamp(e.t / 0.5, 0, 1) : 0;
    ctx.save();
    ctx.rotate(-0.6 - swingK * 1.1);
    ctx.strokeStyle = withAlpha('#6b5334', 1);
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(24, 0);
    ctx.stroke();
    ctx.fillStyle = withAlpha(winding ? C.telegraph : '#8a6b42', 1);
    ctx.beginPath();
    ctx.arc(27, 0, 7, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.restore();
    drawEye(ctx, e.x + Math.cos(e.facing) * 8, e.y + Math.sin(e.facing) * 8, 2.6, winding ? C.telegraph : C.amber);
    void time;
  },
};

const cableSpider: EnemyDef = {
  id: 'cableSpider',
  name: 'Araña de Cable',
  hp: 22,
  radius: 11,
  speed: 195,
  contact: 6,
  color: '#241a2e',
  accent: C.magenta,
  weight: 0,
  credits: [2, 5],
  healChance: 0.06,
  sight: 340,
  behavior(e, w, dt) {
    if (!checkAggro(e, w)) {
      patrol(e, w, dt, e.def.speed, 80);
      return;
    }
    const p = w.playerActor;
    const d = w.distToPlayer(e.x, e.y);
    faceTo(e, p.x, p.y, 11, dt);
    switch (e.state) {
      case 'idle':
        if (d < 165 && d > 40 && e.cd <= 0) {
          e.state = 'crouch';
          e.t = 0;
          w.sfx('telegraph', 0.35);
        } else {
          moveToward(e, p.x, p.y, e.def.speed * (d < 60 ? 0.5 : 1));
        }
        break;
      case 'crouch':
        e.moveX = e.moveY = 0;
        if (e.t > 0.42) {
          // Pounce: fast, short, and clearly signposted by the crouch.
          e.state = 'leap';
          e.t = 0;
          e.data.lx = Math.cos(e.facing) * 620;
          e.data.ly = Math.sin(e.facing) * 620;
          w.sfx('dodge', 0.6);
        }
        break;
      case 'leap':
        e.moveX = e.data.lx;
        e.moveY = e.data.ly;
        if (e.t > 0.05 && e.t < 0.3) {
          if (w.distToPlayer(e.x, e.y) < e.radius + p.radius + 4) {
            w.damagePlayer(9, e.x, e.y, { knockback: 300 });
            e.state = 'recover';
            e.t = 0;
          }
        }
        if (e.t > 0.32) {
          e.state = 'recover';
          e.t = 0;
        }
        break;
      case 'recover':
        if (e.t > 0.4) {
          e.state = 'idle';
          e.cd = rand(0.9, 1.6);
        }
        break;
    }
  },
  draw(e, ctx, time) {
    if (e.state === 'crouch') telegraphGlow(e, ctx, clamp(e.t / 0.42, 0, 1));
    const crouch = e.state === 'crouch' ? 0.75 : 1;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.facing);
    ctx.scale(crouch, crouch);
    ctx.strokeStyle = withAlpha('#4b3560', 1);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const base = -0.9 + i * 0.6;
      const wig = Math.sin(time * 16 + i * 1.5 + e.seed) * 0.25;
      for (const s of [-1, 1]) {
        const a = (base + wig) * s;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(
          Math.cos(a) * 10,
          Math.sin(a) * 10 + s * 4,
          Math.cos(a) * 17,
          Math.sin(a) * 17 + s * 3,
        );
        ctx.stroke();
      }
    }
    ctx.fillStyle = bodyColor(e, '#211830');
    ctx.beginPath();
    ctx.ellipse(0, 0, e.radius * 0.85, e.radius * 0.72, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = withAlpha(C.magenta, 0.8);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    for (const s of [-1, 1]) {
      drawEye(
        ctx,
        e.x + Math.cos(e.facing) * 5 + Math.cos(e.facing + Math.PI / 2) * 3 * s,
        e.y + Math.sin(e.facing) * 5 + Math.sin(e.facing + Math.PI / 2) * 3 * s,
        1.6,
        C.magenta,
      );
    }
  },
};

const technician: EnemyDef = {
  id: 'technician',
  name: 'Técnico Poseído',
  hp: 38,
  radius: 13,
  speed: 110,
  contact: 4,
  color: '#22303a',
  accent: C.cyan,
  weight: 0.1,
  credits: [4, 9],
  healChance: 0.16,
  sight: 360,
  barks: ['La red me dijo que era necesario.', 'Cierro la fuga. Cierro la fuga.'],
  behavior(e, w, dt) {
    if (!checkAggro(e, w)) {
      patrol(e, w, dt, e.def.speed, 90);
      return;
    }
    const p = w.playerActor;
    const d = w.distToPlayer(e.x, e.y);
    // Backs off aggressively — you have to commit to close the gap.
    if (d < 130) moveAway(e, p.x, p.y, e.def.speed * 1.1);
    else keepRange(e, w, 210, e.def.speed, dt);
    faceTo(e, p.x, p.y, 7, dt);
    switch (e.state) {
      case 'idle':
        if (e.cd <= 0 && d < 340 && w.canSeePlayer(e.x, e.y)) {
          e.state = 'wind';
          e.t = 0;
          w.sfx('telegraph', 0.5);
        }
        break;
      case 'wind':
        if (e.t > 0.7) {
          const a = Math.atan2(p.y - e.y, p.x - e.x);
          shoot(e, w, a, {
            speed: 230,
            damage: 6,
            color: C.cyan,
            kind: 'grenade',
            radius: 8,
            size: 10,
            fuse: 0.85,
            explodeRadius: 74,
            explodeDamage: 16,
            deflectable: false,
          });
          w.sfx('shot', 0.5);
          e.state = 'idle';
          e.cd = rand(2.2, 3.2);
          e.t = 0;
        }
        break;
    }
  },
  draw(e, ctx, time) {
    if (e.state === 'wind') telegraphGlow(e, ctx, clamp(e.t / 0.7, 0, 1));
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.facing + Math.PI / 2);
    ctx.fillStyle = bodyColor(e, '#1e2b34');
    ctx.beginPath();
    ctx.roundRect?.(-e.radius * 0.7, -e.radius, e.radius * 1.4, e.radius * 2, 5);
    if (!ctx.roundRect) ctx.rect(-e.radius * 0.7, -e.radius, e.radius * 1.4, e.radius * 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha(C.cyan, 0.75);
    ctx.lineWidth = 1.8;
    ctx.stroke();
    // Backpack tank with a live charge
    ctx.fillStyle = withAlpha(C.cyan, 0.25 + 0.2 * Math.sin(time * 6 + e.seed));
    ctx.beginPath();
    ctx.arc(0, 7, 5, 0, TAU);
    ctx.fill();
    ctx.restore();
    drawEye(ctx, e.x + Math.cos(e.facing) * 6, e.y + Math.sin(e.facing) * 6, 2.4, C.cyan);
  },
};

// ==========================================================================
//  NIVEL 2 — Mercado de los Recuerdos
// ==========================================================================

const mirrorMerc: EnemyDef = {
  id: 'mirrorMerc',
  name: 'Mercenario de Espejo',
  hp: 46,
  radius: 14,
  speed: 148,
  contact: 6,
  color: '#2b1f3e',
  accent: C.elite,
  weight: 0.2,
  credits: [6, 12],
  healChance: 0.16,
  sight: 360,
  barks: ['No es personal. Bueno… casi nunca lo es.', '¿Cuál soy? Adivina.'],
  behavior(e, w, dt) {
    if (!checkAggro(e, w)) {
      patrol(e, w, dt, e.def.speed, 80);
      return;
    }
    const p = w.playerActor;
    const d = w.distToPlayer(e.x, e.y);
    faceTo(e, p.x, p.y, 8, dt);
    switch (e.state) {
      case 'idle':
        if (d > 70) moveToward(e, p.x, p.y, e.def.speed);
        else strafe(e, p.x, p.y, e.def.speed * 0.7, e.data.dir || 1);
        if (e.cd <= 0 && d < 230) {
          e.state = 'split';
          e.t = 0;
          e.data.dir = chance(0.5) ? 1 : -1;
          // The decoy marks where it *was*: the real one always moves.
          e.data.ghostX = e.x;
          e.data.ghostY = e.y;
          w.sfx('glitch', 0.4);
        }
        break;
      case 'split':
        if (e.t > 0.3) {
          e.state = 'dash';
          e.t = 0;
          const a = Math.atan2(p.y - e.y, p.x - e.x);
          e.data.dx = Math.cos(a) * 520;
          e.data.dy = Math.sin(a) * 520;
          e.facing = a;
        }
        break;
      case 'dash':
        e.moveX = e.data.dx;
        e.moveY = e.data.dy;
        if (e.t > 0.22) {
          meleeAttack(e, w, { reach: 62, half: 1.0, damage: 14, warn: 0.16, live: 0.16, knockback: 300 });
          w.sfx('blade', 0.7);
          e.state = 'recover';
          e.t = 0;
        }
        break;
      case 'recover':
        if (e.t > 0.55) {
          e.state = 'idle';
          e.cd = rand(1.6, 2.6);
        }
        break;
    }
  },
  draw(e, ctx, time) {
    // Decoy afterimage during split/dash — visibly fading so it is never unfair.
    if ((e.state === 'split' || e.state === 'dash') && e.data.ghostX !== undefined) {
      const life = e.state === 'split' ? 1 - e.t / 0.3 : clamp(1 - e.t / 0.4, 0, 1);
      ctx.save();
      ctx.globalAlpha = life * 0.45;
      ctx.translate(e.data.ghostX, e.data.ghostY);
      ctx.rotate(e.facing);
      ctx.fillStyle = withAlpha(C.elite, 0.5);
      poly(ctx, 0, 0, e.radius, 4, 0.5);
      ctx.fill();
      ctx.restore();
    }
    if (e.state === 'split') telegraphGlow(e, ctx, clamp(e.t / 0.3, 0, 1));
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.facing);
    ctx.fillStyle = bodyColor(e, '#281d3a');
    poly(ctx, 0, 0, e.radius, 4, 0.5);
    ctx.fill();
    ctx.strokeStyle = withAlpha(C.elite, 0.9);
    ctx.lineWidth = 2;
    ctx.stroke();
    // Mirror shard blade
    ctx.strokeStyle = withAlpha('#ffffff', 0.8);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(22, -4);
    ctx.stroke();
    ctx.restore();
    drawEye(ctx, e.x + Math.cos(e.facing) * 7, e.y + Math.sin(e.facing) * 7, 2.4, C.elite);
    void time;
  },
};

const pulseSmuggler: EnemyDef = {
  id: 'pulseSmuggler',
  name: 'Contrabandista de Pulso',
  hp: 48,
  radius: 14,
  speed: 106,
  contact: 5,
  color: '#3a2130',
  accent: C.amber,
  weight: 0.25,
  credits: [6, 13],
  healChance: 0.2,
  sight: 340,
  barks: ['Mercancía sensible, apártate.', 'Esto lo pagas tú.'],
  behavior(e, w, dt) {
    if (!checkAggro(e, w)) {
      patrol(e, w, dt, e.def.speed, 70);
      return;
    }
    const p = w.playerActor;
    keepRange(e, w, 145, e.def.speed, dt);
    faceTo(e, p.x, p.y, 7, dt);
    switch (e.state) {
      case 'idle':
        if (e.cd <= 0 && w.distToPlayer(e.x, e.y) < 210 && w.canSeePlayer(e.x, e.y)) {
          e.state = 'wind';
          e.t = 0;
          w.sfx('telegraph', 0.6);
        }
        break;
      case 'wind':
        e.moveX *= 0.15;
        e.moveY *= 0.15;
        faceTo(e, p.x, p.y, 9, dt);
        if (e.t > 0.62) {
          for (let i = -2; i <= 2; i++) {
            shoot(e, w, e.facing + i * 0.14, {
              speed: 330 + Math.abs(i) * 18,
              damage: 6,
              color: C.amber,
              kind: 'shell',
              radius: 5,
              size: 7,
              life: 0.55,
            });
          }
          w.sfx('shot', 0.9);
          w.shake(2);
          e.moveX = -Math.cos(e.facing) * 220;
          e.moveY = -Math.sin(e.facing) * 220;
          e.state = 'idle';
          e.cd = rand(1.9, 2.8);
          e.t = 0;
        }
        break;
    }
  },
  draw(e, ctx, time) {
    const k = e.state === 'wind' ? clamp(e.t / 0.62, 0, 1) : 0;
    if (k > 0) telegraphGlow(e, ctx, k, 0.42);
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.facing);
    ctx.fillStyle = bodyColor(e, '#341e2c');
    ctx.beginPath();
    ctx.ellipse(0, 0, e.radius, e.radius * 0.92, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = withAlpha(C.amber, 0.85);
    ctx.lineWidth = 2;
    ctx.stroke();
    // Stubby energy shotgun
    ctx.strokeStyle = withAlpha(k > 0 ? C.telegraph : '#7a5c3a', 1);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(4, 3);
    ctx.lineTo(18, 3);
    ctx.stroke();
    if (k > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 20, 3, 10 + k * 12, C.telegraph, 0.5 * k);
      ctx.restore();
    }
    ctx.restore();
    drawEye(ctx, e.x + Math.cos(e.facing) * 6, e.y + Math.sin(e.facing) * 6 - 4, 2.2, C.amber);
    void time;
  },
};

const dataMonk: EnemyDef = {
  id: 'dataMonk',
  name: 'Monje de Datos',
  hp: 68,
  radius: 16,
  speed: 62,
  contact: 4,
  color: '#241a3c',
  accent: C.data,
  weight: 0.6,
  credits: [7, 14],
  healChance: 0.25,
  sight: 380,
  barks: ['Recordar es una forma de dolor.', 'Suelta lo que fuiste.'],
  behavior(e, w, dt) {
    if (!checkAggro(e, w)) return;
    const p = w.playerActor;
    faceTo(e, p.x, p.y, 3, dt);
    moveToward(e, p.x, p.y, e.def.speed);
    if (e.cd <= 0 && w.distToPlayer(e.x, e.y) < 300) {
      e.cd = rand(3.4, 4.6);
      e.state = 'chant';
      e.t = 0;
      w.sfx('telegraph', 0.5);
      // Drops a slow-field on the player's position: forces you to reposition.
      w.spawnZone({
        x: p.x,
        y: p.y,
        radius: 96,
        shape: 'circle',
        faction: 'enemy',
        warn: 0.85,
        live: 4.5,
        damage: 3,
        mode: 'field',
        color: C.data,
        slow: 0.5,
        knockback: 0,
      });
    }
    if (e.state === 'chant' && e.t > 1.1) e.state = 'idle';
  },
  draw(e, ctx, time) {
    const float = Math.sin(time * 1.6 + e.seed) * 3;
    if (e.state === 'chant') telegraphGlow(e, ctx, clamp(e.t / 0.85, 0, 1));
    ctx.save();
    ctx.translate(e.x, e.y + float);
    // Robe
    ctx.fillStyle = bodyColor(e, '#201736');
    ctx.beginPath();
    ctx.moveTo(0, -e.radius);
    ctx.quadraticCurveTo(e.radius, 0, e.radius * 0.8, e.radius);
    ctx.lineTo(-e.radius * 0.8, e.radius);
    ctx.quadraticCurveTo(-e.radius, 0, 0, -e.radius);
    ctx.fill();
    ctx.strokeStyle = withAlpha(C.data, 0.8);
    ctx.lineWidth = 2;
    ctx.stroke();
    // Orbiting glyph rings
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const a = time * (0.8 + i * 0.4) + i * 2;
      disc(ctx, Math.cos(a) * (e.radius + 8), Math.sin(a) * (e.radius + 8) * 0.5, 2.4, withAlpha(C.data, 0.85));
    }
    ctx.restore();
    ctx.restore();
    drawEye(ctx, e.x, e.y + float - 4, 3, C.data, 0.8);
  },
};

const chameleonDrone: EnemyDef = {
  id: 'chameleonDrone',
  name: 'Dron Camaleón',
  hp: 30,
  radius: 12,
  speed: 132,
  contact: 0,
  color: '#1c2438',
  accent: C.cyan,
  weight: 0,
  credits: [4, 9],
  healChance: 0.12,
  sight: 420,
  flying: true,
  behavior(e, w, dt) {
    const p = w.playerActor;
    const d = w.distToPlayer(e.x, e.y);
    if (!e.aggro) {
      // Lurks cloaked until you walk into its ambush range.
      e.data.cloak = 1;
      if (d < 190) {
        e.aggro = true;
        w.sfx('glitch', 0.5);
      }
      patrol(e, w, dt, e.def.speed * 0.5, 50);
      return;
    }
    e.data.cloak = damp(e.data.cloak ?? 1, e.state === 'strike' ? 0 : 0.55, 6, dt);
    faceTo(e, p.x, p.y, 8, dt);
    switch (e.state) {
      case 'idle':
        keepRange(e, w, 170, e.def.speed, dt);
        if (e.cd <= 0 && d < 260) {
          e.state = 'mark';
          e.t = 0;
          w.sfx('telegraph', 0.5);
        }
        break;
      case 'mark':
        e.moveX *= 0.2;
        e.moveY *= 0.2;
        if (e.t > 0.5) {
          e.state = 'strike';
          e.t = 0;
          const a = Math.atan2(p.y - e.y, p.x - e.x);
          e.data.sx = Math.cos(a) * 620;
          e.data.sy = Math.sin(a) * 620;
        }
        break;
      case 'strike':
        e.moveX = e.data.sx;
        e.moveY = e.data.sy;
        if (e.t > 0.06 && d < e.radius + p.radius + 6) {
          w.damagePlayer(11, e.x, e.y, { knockback: 280 });
          e.state = 'recover';
          e.t = 0;
        }
        if (e.t > 0.3) {
          e.state = 'recover';
          e.t = 0;
        }
        break;
      case 'recover':
        moveAway(e, p.x, p.y, e.def.speed);
        if (e.t > 0.7) {
          e.state = 'idle';
          e.cd = rand(1.8, 2.8);
        }
        break;
    }
  },
  draw(e, ctx, time) {
    const cloak = clamp(e.data.cloak ?? 1, 0, 1);
    const vis = 1 - cloak * 0.82;
    if (e.state === 'mark') telegraphGlow(e, ctx, clamp(e.t / 0.5, 0, 1));
    ctx.save();
    ctx.globalAlpha = vis;
    ctx.translate(e.x, e.y + Math.sin(time * 3 + e.seed) * 2);
    ctx.rotate(e.facing);
    ctx.fillStyle = bodyColor(e, '#1a2134');
    poly(ctx, 0, 0, e.radius, 3, 0);
    ctx.fill();
    ctx.strokeStyle = withAlpha(C.cyan, 0.9);
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();
    // Even fully cloaked it leaves a shimmer: never an invisible ambush.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ring(ctx, e.x, e.y, e.radius + 3 + Math.sin(time * 5 + e.seed) * 2, 1.2, C.cyan, 0.18 + vis * 0.4);
    ctx.restore();
    if (vis > 0.4) drawEye(ctx, e.x + Math.cos(e.facing) * 5, e.y + Math.sin(e.facing) * 5, 2.2, C.cyan, vis);
  },
};

// ==========================================================================
//  NIVEL 3 — Jardines de Cromo
// ==========================================================================

const sentinelOrchid: EnemyDef = {
  id: 'sentinelOrchid',
  name: 'Orquídea Centinela',
  hp: 46,
  radius: 15,
  speed: 0,
  contact: 0,
  color: '#1d3326',
  accent: C.ally,
  weight: 1,
  credits: [4, 8],
  healChance: 0.14,
  sight: 380,
  behavior(e, w, dt) {
    if (!checkAggro(e, w)) return;
    const p = w.playerActor;
    faceTo(e, p.x, p.y, 3.2, dt);
    if (e.state === 'idle' && e.cd <= 0 && w.canSeePlayer(e.x, e.y)) {
      e.state = 'bloom';
      e.t = 0;
      w.sfx('telegraph', 0.5);
    }
    if (e.state === 'bloom' && e.t > 0.75) {
      for (let i = -1; i <= 1; i++) {
        shoot(e, w, e.facing + i * 0.24, {
          speed: 300,
          damage: 9,
          color: C.ally,
          kind: 'thorn',
          radius: 6,
          size: 13,
          life: 1.7,
        });
      }
      w.sfx('shot', 0.6);
      e.state = 'idle';
      e.cd = rand(1.9, 2.6);
      e.t = 0;
    }
  },
  draw(e, ctx, time) {
    const k = e.state === 'bloom' ? clamp(e.t / 0.75, 0, 1) : 0;
    if (k > 0) telegraphGlow(e, ctx, k, 0.4);
    // Stem
    ctx.strokeStyle = withAlpha('#2e5a3e', 1);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y + 16);
    ctx.lineTo(e.x, e.y + 2);
    ctx.stroke();
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.facing);
    const open = 0.55 + k * 0.45;
    ctx.fillStyle = bodyColor(e, '#1b3125');
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.rotate((i / 6) * TAU);
      ctx.beginPath();
      ctx.ellipse(e.radius * 0.55 * open, 0, e.radius * 0.55, e.radius * 0.3, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = withAlpha(C.ally, 0.55);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    drawEye(ctx, e.x, e.y, 4, k > 0 ? C.telegraph : C.ally, 0.9);
    void time;
  },
};

const fiberDeer: EnemyDef = {
  id: 'fiberDeer',
  name: 'Ciervo de Fibra Óptica',
  hp: 44,
  radius: 15,
  speed: 130,
  contact: 7,
  color: '#1b3a30',
  accent: C.cyan,
  weight: 0.2,
  credits: [5, 10],
  healChance: 0.16,
  sight: 420,
  behavior(e, w, dt) {
    if (!checkAggro(e, w)) {
      patrol(e, w, dt, e.def.speed, 130);
      return;
    }
    const p = w.playerActor;
    const d = w.distToPlayer(e.x, e.y);
    switch (e.state) {
      case 'idle':
        faceTo(e, p.x, p.y, 6, dt);
        if (d > 150) moveToward(e, p.x, p.y, e.def.speed * 0.8);
        else strafe(e, p.x, p.y, e.def.speed * 0.6, e.data.dir || 1);
        if (e.cd <= 0 && d < 320 && d > 80) {
          e.state = 'paw';
          e.t = 0;
          w.sfx('telegraph', 0.5);
        }
        break;
      case 'paw':
        e.moveX = e.moveY = 0;
        faceTo(e, p.x, p.y, 5, dt);
        if (e.t > 0.65) {
          e.state = 'charge';
          e.t = 0;
          e.data.cx = Math.cos(e.facing) * 430;
          e.data.cy = Math.sin(e.facing) * 430;
          w.sfx('dodge', 0.8);
        }
        break;
      case 'charge':
        e.moveX = e.data.cx;
        e.moveY = e.data.cy;
        if (w.distToPlayer(e.x, e.y) < e.radius + p.radius + 6) {
          w.damagePlayer(15, e.x, e.y, { knockback: 380 });
          w.shake(4);
          e.state = 'recover';
          e.t = 0;
        }
        if (e.t > 0.85) {
          e.state = 'recover';
          e.t = 0;
        }
        break;
      case 'recover':
        if (e.t > 0.8) {
          e.state = 'idle';
          e.cd = rand(1.2, 2);
        }
        break;
    }
  },
  draw(e, ctx, time) {
    if (e.state === 'paw') telegraphGlow(e, ctx, clamp(e.t / 0.65, 0, 1), 0.22);
    if (e.state === 'charge') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      line(
        ctx,
        e.x - Math.cos(e.facing) * 40,
        e.y - Math.sin(e.facing) * 40,
        e.x,
        e.y,
        8,
        C.cyan,
        0.35,
      );
      ctx.restore();
    }
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.facing);
    ctx.fillStyle = bodyColor(e, '#17332a');
    ctx.beginPath();
    ctx.ellipse(0, 0, e.radius * 1.2, e.radius * 0.68, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = withAlpha(C.cyan, 0.8);
    ctx.lineWidth = 1.8;
    ctx.stroke();
    // Fibre-optic antlers
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = withAlpha(C.cyan, 0.8);
    ctx.lineWidth = 1.8;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(8, s * 4);
      ctx.lineTo(16, s * 11);
      ctx.moveTo(12, s * 7);
      ctx.lineTo(20, s * 6);
      ctx.stroke();
      disc(ctx, 16, s * 11, 2, withAlpha('#ffffff', 0.8 * (0.5 + 0.5 * Math.sin(time * 5 + s))));
    }
    ctx.restore();
    // Legs
    ctx.strokeStyle = withAlpha('#2b5a48', 1);
    ctx.lineWidth = 2;
    const gait = e.state === 'charge' ? 22 : 8;
    for (let i = 0; i < 2; i++) {
      for (const s of [-1, 1]) {
        const ph = Math.sin(time * gait + i * 2 + (s > 0 ? 0 : Math.PI));
        ctx.beginPath();
        ctx.moveTo(-6 + i * 12, s * 5);
        ctx.lineTo(-6 + i * 12 + ph * 4, s * 12);
        ctx.stroke();
      }
    }
    ctx.restore();
    drawEye(ctx, e.x + Math.cos(e.facing) * 12, e.y + Math.sin(e.facing) * 12, 2.2, e.state === 'paw' ? C.telegraph : C.cyan);
  },
};

const shockVine: EnemyDef = {
  id: 'shockVine',
  name: 'Enredadera de Choque',
  hp: 30,
  radius: 14,
  speed: 0,
  contact: 0,
  color: '#243d1e',
  accent: C.lime,
  weight: 1,
  credits: [3, 7],
  healChance: 0.1,
  sight: 260,
  behavior(e, w, dt) {
    if (!checkAggro(e, w)) return;
    const p = w.playerActor;
    if (e.cd <= 0 && w.distToPlayer(e.x, e.y) < 240) {
      e.cd = rand(2.6, 3.6);
      e.state = 'lash';
      e.t = 0;
      w.sfx('telegraph', 0.45);
      // Roots erupt where the player is heading, not where they stand.
      w.spawnZone({
        x: p.x + p.vx * 0.32,
        y: p.y + p.vy * 0.32,
        radius: 62,
        shape: 'circle',
        faction: 'enemy',
        warn: 0.7,
        live: 0.5,
        damage: 11,
        mode: 'burst',
        color: C.lime,
        root: 0.9,
        knockback: 0,
      });
    }
    if (e.state === 'lash' && e.t > 1.2) e.state = 'idle';
    void dt;
  },
  draw(e, ctx, time) {
    const k = e.state === 'lash' ? clamp(e.t / 0.7, 0, 1) : 0;
    if (k > 0) telegraphGlow(e, ctx, k);
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.strokeStyle = withAlpha(bodyColor(e, '#2f5c28'), 1);
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + Math.sin(time * 1.4 + i) * 0.2;
      const len = e.radius * (1 + 0.4 * Math.sin(time * 2 + i));
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.cos(a) * len * 0.6, Math.sin(a) * len * 0.6, Math.cos(a) * len, Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + Math.sin(time * 1.4 + i) * 0.2;
      const len = e.radius * (1 + 0.4 * Math.sin(time * 2 + i));
      disc(ctx, e.x + Math.cos(a) * len, e.y + Math.sin(a) * len, 2.2, withAlpha(C.lime, 0.9));
    }
    ctx.restore();
    drawEye(ctx, e.x, e.y, 3.4, k > 0 ? C.telegraph : C.lime, 0.9);
  },
};

const botanicalGuardian: EnemyDef = {
  id: 'botanicalGuardian',
  name: 'Guardián Botánico',
  hp: 96,
  radius: 19,
  speed: 78,
  contact: 9,
  color: '#26483a',
  accent: C.ally,
  weight: 0.75,
  credits: [9, 18],
  healChance: 0.3,
  sight: 340,
  barks: ['El jardín no admite visitas.', 'Serás abono útil.'],
  behavior(e, w, dt) {
    if (!checkAggro(e, w)) {
      patrol(e, w, dt, e.def.speed, 60);
      return;
    }
    const p = w.playerActor;
    const d = w.distToPlayer(e.x, e.y);
    // Shield only covers the front: flanking is the intended answer.
    e.data.shield = e.state === 'wind' || e.state === 'idle' ? 1 : 0;
    switch (e.state) {
      case 'idle':
        faceTo(e, p.x, p.y, 3.5, dt);
        moveToward(e, p.x, p.y, e.def.speed);
        if (d < 66 && e.cd <= 0) {
          e.state = 'wind';
          e.t = 0;
          w.sfx('telegraph', 0.7);
        }
        break;
      case 'wind':
        faceTo(e, p.x, p.y, 2.2, dt);
        if (e.t > 0.75) {
          meleeAttack(e, w, { reach: 84, half: 1.25, damage: 20, warn: 0, live: 0.2, knockback: 460 });
          w.sfx('punch', 0.9);
          w.shake(5);
          e.moveX = Math.cos(e.facing) * 340;
          e.moveY = Math.sin(e.facing) * 340;
          e.state = 'recover';
          e.t = 0;
        }
        break;
      case 'recover':
        if (e.t > 1.0) {
          e.state = 'idle';
          e.cd = rand(0.9, 1.5);
        }
        break;
    }
  },
  draw(e, ctx, time) {
    if (e.state === 'wind') telegraphGlow(e, ctx, clamp(e.t / 0.75, 0, 1), 1.25);
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.facing);
    ctx.fillStyle = bodyColor(e, '#22412f');
    ctx.beginPath();
    ctx.ellipse(0, 0, e.radius * 0.95, e.radius, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = withAlpha(C.ally, 0.8);
    ctx.lineWidth = 2.2;
    ctx.stroke();
    // Metal leaf shield
    if (e.data.shield) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = withAlpha('#8fd6b4', 0.35);
      ctx.beginPath();
      ctx.arc(0, 0, e.radius + 12, -1.05, 1.05);
      ctx.arc(0, 0, e.radius + 3, 1.05, -1.05, true);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = withAlpha('#d6f5e6', 0.85);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    drawEye(ctx, e.x + Math.cos(e.facing) * 4, e.y + Math.sin(e.facing) * 4, 3, C.ally);
    void time;
  },
};

// ==========================================================================
//  NIVEL 4 — La Catedral de la Red
// ==========================================================================

const firewallPaladin: EnemyDef = {
  id: 'firewallPaladin',
  name: 'Paladín de Firewall',
  hp: 108,
  radius: 19,
  speed: 84,
  contact: 9,
  color: '#1c2145',
  accent: '#8b9cff',
  weight: 0.85,
  credits: [10, 20],
  healChance: 0.28,
  sight: 360,
  barks: ['La paz exige obediencia.', 'Acceso denegado, para siempre.'],
  behavior(e, w, dt) {
    if (!checkAggro(e, w)) {
      patrol(e, w, dt, e.def.speed, 60);
      return;
    }
    const p = w.playerActor;
    const d = w.distToPlayer(e.x, e.y);
    e.data.shield = e.state === 'recover' ? 0 : 1;
    switch (e.state) {
      case 'idle':
        faceTo(e, p.x, p.y, 3, dt);
        moveToward(e, p.x, p.y, e.def.speed);
        if (d < 72 && e.cd <= 0) {
          e.state = 'wind';
          e.t = 0;
          w.sfx('telegraph', 0.8);
        }
        break;
      case 'wind':
        faceTo(e, p.x, p.y, 1.8, dt);
        e.moveX *= 0.3;
        e.moveY *= 0.3;
        if (e.t > 0.95) {
          // Big, slow, obviously-signalled overhead. Punish window follows.
          w.spawnZone({
            x: e.x + Math.cos(e.facing) * 52,
            y: e.y + Math.sin(e.facing) * 52,
            radius: 62,
            shape: 'circle',
            faction: 'enemy',
            warn: 0,
            live: 0.2,
            damage: 26,
            mode: 'burst',
            color: C.danger,
            knockback: 480,
          });
          w.sfx('explode', 0.6);
          w.shake(7);
          e.state = 'recover';
          e.t = 0;
        }
        break;
      case 'recover':
        if (e.t > 1.15) {
          e.state = 'idle';
          e.cd = rand(1.1, 1.8);
        }
        break;
    }
  },
  draw(e, ctx, time) {
    const k = e.state === 'wind' ? clamp(e.t / 0.95, 0, 1) : 0;
    if (k > 0) {
      telegraphGlow(e, ctx, k);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const tx = e.x + Math.cos(e.facing) * 52;
      const ty = e.y + Math.sin(e.facing) * 52;
      ring(ctx, tx, ty, 62 * (0.4 + k * 0.6), 3, C.danger, 0.4 + k * 0.5);
      ctx.fillStyle = withAlpha(C.danger, 0.1 + k * 0.12);
      ctx.beginPath();
      ctx.arc(tx, ty, 62 * k, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.facing);
    ctx.fillStyle = bodyColor(e, '#191e3f');
    poly(ctx, 0, 0, e.radius, 6, 0);
    ctx.fill();
    ctx.strokeStyle = withAlpha('#8b9cff', 0.9);
    ctx.lineWidth = 2.4;
    ctx.stroke();
    if (e.data.shield) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = withAlpha('#8b9cff', 0.75);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius + 13, -0.95, 0.95);
      ctx.stroke();
      ctx.fillStyle = withAlpha('#8b9cff', 0.16 + 0.06 * Math.sin(time * 4 + e.seed));
      ctx.beginPath();
      ctx.arc(0, 0, e.radius + 13, -0.95, 0.95);
      ctx.arc(0, 0, e.radius + 2, 0.95, -0.95, true);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    drawEye(ctx, e.x + Math.cos(e.facing) * 5, e.y + Math.sin(e.facing) * 5, 3, k > 0 ? C.danger : '#8b9cff');
  },
};

const dataSeraph: EnemyDef = {
  id: 'dataSeraph',
  name: 'Serafín de Datos',
  hp: 50,
  radius: 14,
  speed: 118,
  contact: 0,
  color: '#20264e',
  accent: '#ffd166',
  weight: 0,
  credits: [7, 14],
  healChance: 0.14,
  sight: 420,
  flying: true,
  behavior(e, w, dt) {
    if (!checkAggro(e, w)) {
      patrol(e, w, dt, e.def.speed, 140);
      return;
    }
    const p = w.playerActor;
    keepRange(e, w, 230, e.def.speed, dt);
    faceTo(e, p.x, p.y, 6, dt);
    switch (e.state) {
      case 'idle':
        if (e.cd <= 0 && w.canSeePlayer(e.x, e.y)) {
          e.state = 'aim';
          e.t = 0;
          w.sfx('telegraph', 0.6);
        }
        break;
      case 'aim':
        e.moveX *= 0.25;
        e.moveY *= 0.25;
        faceTo(e, p.x, p.y, 4.5, dt);
        if (e.t > 0.85) {
          // Long beam along its facing — sidestep, don't outrun.
          w.spawnZone({
            x: e.x,
            y: e.y,
            len: 420,
            halfW: 15,
            angle: e.facing,
            shape: 'rect',
            faction: 'enemy',
            warn: 0,
            live: 0.28,
            damage: 15,
            mode: 'burst',
            color: '#ffd166',
            knockback: 200,
          });
          w.sfx('chargeShot', 0.6);
          w.shake(3);
          e.state = 'idle';
          e.cd = rand(2.4, 3.4);
          e.t = 0;
        }
        break;
    }
  },
  draw(e, ctx, time) {
    const k = e.state === 'aim' ? clamp(e.t / 0.85, 0, 1) : 0;
    const float = Math.sin(time * 2 + e.seed) * 4;
    if (k > 0) {
      telegraphGlow(e, ctx, k);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      line(
        ctx,
        e.x,
        e.y + float,
        e.x + Math.cos(e.facing) * 420,
        e.y + float + Math.sin(e.facing) * 420,
        2 + k * 10,
        C.danger,
        0.16 + k * 0.35,
      );
      ctx.restore();
    }
    ctx.save();
    ctx.translate(e.x, e.y + float);
    // Halo of rotating wing-blades
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const a = time * 1.2 + (i / 6) * TAU;
      const r = e.radius + 10;
      ctx.strokeStyle = withAlpha('#ffd166', 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (r - 6), Math.sin(a) * (r - 6) * 0.55);
      ctx.lineTo(Math.cos(a) * (r + 6), Math.sin(a) * (r + 6) * 0.55);
      ctx.stroke();
    }
    ctx.restore();
    ctx.rotate(e.facing);
    ctx.fillStyle = bodyColor(e, '#1d2347');
    poly(ctx, 0, 0, e.radius, 3, 0);
    ctx.fill();
    ctx.strokeStyle = withAlpha('#ffd166', 0.9);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    drawEye(ctx, e.x + Math.cos(e.facing) * 5, e.y + float + Math.sin(e.facing) * 5, 3, k > 0 ? C.danger : '#ffd166');
  },
};

const codeInquisitor: EnemyDef = {
  id: 'codeInquisitor',
  name: 'Inquisidor de Código',
  hp: 88,
  radius: 16,
  speed: 128,
  contact: 7,
  color: '#2a1c48',
  accent: C.elite,
  weight: 0.4,
  credits: [11, 22],
  healChance: 0.3,
  sight: 400,
  barks: ['Tu código es herejía.', 'Compilando tu silencio.'],
  behavior(e, w, dt) {
    if (!checkAggro(e, w)) {
      patrol(e, w, dt, e.def.speed, 70);
      return;
    }
    const p = w.playerActor;
    const d = w.distToPlayer(e.x, e.y);
    switch (e.state) {
      case 'idle':
        faceTo(e, p.x, p.y, 7, dt);
        if (d > 190) moveToward(e, p.x, p.y, e.def.speed);
        else strafe(e, p.x, p.y, e.def.speed * 0.8, e.data.dir || 1);
        if (e.cd <= 0) {
          e.state = 'blinkOut';
          e.t = 0;
          w.sfx('glitch', 0.4);
        }
        break;
      case 'blinkOut':
        e.moveX = e.moveY = 0;
        if (e.t > 0.28) {
          // Reappears at a readable offset behind/beside the player.
          const a = Math.atan2(p.y - e.y, p.x - e.x) + rand(-1.1, 1.1);
          const nx = p.x - Math.cos(a) * 74;
          const ny = p.y - Math.sin(a) * 74;
          const spot = w.map.clampToFloor(nx, ny, e.radius);
          e.x = spot.x;
          e.y = spot.y;
          e.facing = Math.atan2(p.y - e.y, p.x - e.x);
          e.state = 'wind';
          e.t = 0;
          w.fx.burst(e.x, e.y, 14, C.elite, { speed: 200, life: 0.4 });
          w.sfx('glitch', 0.6);
        }
        break;
      case 'wind':
        faceTo(e, p.x, p.y, 4, dt);
        if (e.t > 0.42) {
          meleeAttack(e, w, { reach: 78, half: 0.85, damage: 18, warn: 0, live: 0.16, knockback: 340 });
          w.sfx('blade', 0.9);
          e.moveX = Math.cos(e.facing) * 300;
          e.moveY = Math.sin(e.facing) * 300;
          e.state = 'recover';
          e.t = 0;
        }
        break;
      case 'recover':
        if (e.t > 0.8) {
          e.state = 'idle';
          e.cd = rand(2.2, 3.4);
        }
        break;
    }
  },
  draw(e, ctx, time) {
    const blinking = e.state === 'blinkOut';
    const alpha = blinking ? 1 - clamp(e.t / 0.28, 0, 1) * 0.8 : 1;
    if (e.state === 'wind') telegraphGlow(e, ctx, clamp(e.t / 0.42, 0, 1), 0.85);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(e.x, e.y);
    ctx.rotate(e.facing);
    ctx.fillStyle = bodyColor(e, '#251941');
    ctx.beginPath();
    ctx.moveTo(e.radius, 0);
    ctx.lineTo(-e.radius * 0.6, -e.radius * 0.9);
    ctx.lineTo(-e.radius * 0.3, 0);
    ctx.lineTo(-e.radius * 0.6, e.radius * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = withAlpha(C.elite, 0.95);
    ctx.lineWidth = 2;
    ctx.stroke();
    // Floating code glyphs
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.font = '9px monospace';
    ctx.fillStyle = withAlpha(C.elite, 0.7);
    for (let i = 0; i < 3; i++) {
      const a = time * 2 + i * 2.1;
      ctx.fillText('01', Math.cos(a) * 22, Math.sin(a) * 14);
    }
    ctx.restore();
    ctx.restore();
    if (!blinking) drawEye(ctx, e.x + Math.cos(e.facing) * 7, e.y + Math.sin(e.facing) * 7, 2.6, C.elite);
  },
};

const vantaEcho: EnemyDef = {
  id: 'vantaEcho',
  name: 'Eco de Vanta',
  hp: 76,
  radius: 13,
  speed: 172,
  contact: 0,
  color: '#12233d',
  accent: C.player,
  weight: 0.25,
  credits: [12, 24],
  healChance: 0.35,
  sight: 420,
  barks: ['Yo también quise salvarlos.', '¿Cuántas veces has muerto ya?'],
  behavior(e, w, dt) {
    if (!checkAggro(e, w)) {
      patrol(e, w, dt, e.def.speed * 0.6, 70);
      return;
    }
    const p = w.playerActor;
    const d = w.distToPlayer(e.x, e.y);
    faceTo(e, p.x, p.y, 9, dt);
    switch (e.state) {
      case 'idle':
        if (d > 120) moveToward(e, p.x, p.y, e.def.speed);
        else strafe(e, p.x, p.y, e.def.speed * 0.7, e.data.dir || 1);
        if (e.cd <= 0) {
          // Mirrors the player's own kit: dash-in combo, or a ranged bolt.
          e.state = d < 210 ? 'dash' : 'snipe';
          e.t = 0;
          e.data.hits = 0;
          if (e.state === 'dash') w.sfx('dodge', 0.5);
        }
        break;
      case 'snipe':
        e.moveX *= 0.3;
        e.moveY *= 0.3;
        if (e.t > 0.5) {
          shoot(e, w, e.facing, { speed: 480, damage: 10, color: C.player, kind: 'bolt', size: 8 });
          w.sfx('shot', 0.6);
          e.state = 'idle';
          e.cd = rand(1.4, 2.2);
          e.t = 0;
        }
        break;
      case 'dash': {
        const k = clamp(1 - e.t / 0.22, 0, 1);
        e.moveX = Math.cos(e.facing) * 620 * k;
        e.moveY = Math.sin(e.facing) * 620 * k;
        if (e.t > 0.24) {
          e.state = 'combo';
          e.t = 0;
        }
        break;
      }
      case 'combo':
        if (e.t > 0.26) {
          e.t = 0;
          e.data.hits++;
          faceTo(e, p.x, p.y, 20, 1);
          meleeAttack(e, w, {
            reach: 62,
            half: 1.0,
            damage: e.data.hits >= 3 ? 17 : 11,
            warn: 0.12,
            live: 0.14,
            knockback: e.data.hits >= 3 ? 380 : 160,
          });
          w.sfx('slash', 0.6);
          if (e.data.hits >= 3) {
            e.state = 'recover';
            e.t = 0;
          }
        }
        break;
      case 'recover':
        if (e.t > 0.7) {
          e.state = 'idle';
          e.cd = rand(1.6, 2.4);
        }
        break;
    }
  },
  draw(e, ctx, time) {
    if (e.state === 'combo' || e.state === 'snipe') {
      telegraphGlow(e, ctx, clamp(e.t / 0.26, 0, 1), 1.0);
    }
    // Deliberately a negative of the player silhouette.
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.facing + Math.PI / 2);
    ctx.fillStyle = bodyColor(e, '#0e1b30');
    ctx.beginPath();
    ctx.ellipse(0, 0, 9.5, 12, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = withAlpha(C.player, 0.85);
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.fillStyle = withAlpha(C.danger, 0.9);
    ctx.beginPath();
    ctx.ellipse(0, -3, 2.6, 3.4, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = withAlpha(C.player, 0.9);
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(e.x + Math.cos(e.facing) * 3, e.y + Math.sin(e.facing) * 3 - 4, 5.2, e.facing - 0.75, e.facing + 0.75);
    ctx.stroke();
    // Glitchy duplicate silhouette
    if (Math.sin(time * 9 + e.seed) > 0.75) {
      ctx.globalAlpha = 0.4;
      ctx.translate(rand(-4, 4), rand(-3, 3));
      ctx.strokeStyle = withAlpha(C.danger, 0.7);
      ctx.strokeRect(e.x - 10, e.y - 12, 20, 24);
    }
    ctx.restore();
  },
};

export const ENEMY_DEFS: Record<string, EnemyDef> = {
  rat,
  drone,
  civilian,
  harvestDrone,
  scrapper,
  cableSpider,
  technician,
  mirrorMerc,
  pulseSmuggler,
  dataMonk,
  chameleonDrone,
  sentinelOrchid,
  fiberDeer,
  shockVine,
  botanicalGuardian,
  firewallPaladin,
  dataSeraph,
  codeInquisitor,
  vantaEcho,
};

/** Damage multiplier applied when hitting a shielded enemy from the front. */
export function shieldFactor(e: Enemy, fromAngle: number): number {
  if (!e.data.shield) return 1;
  const facingDelta = Math.abs(angleDelta(e.facing, fromAngle + Math.PI));
  return facingDelta < 1.0 ? 0.18 : 1;
}

export function makeEnemy(defId: string, x: number, y: number, elite = false): Enemy | null {
  const def = ENEMY_DEFS[defId];
  if (!def) return null;
  return new Enemy(def, x, y, elite);
}

export function enemyDeathFx(e: Enemy, w: World): void {
  const col = e.def.accent;
  w.fx.burst(e.x, e.y, e.isBoss ? 60 : 16, col, {
    speed: 240,
    life: 0.6,
    size: 3,
  });
  w.fx.debris(e.x, e.y, randInt(4, 8), e.def.color, 190);
  w.fx.shockwave(e.x, e.y, e.radius * 4, col, 0.4, 3);
  w.fx.smoke(e.x, e.y, 4, '#1a1226', 40, 0.9);
  w.sfx('explode', e.elite ? 0.8 : 0.45);
  w.shake(e.elite ? 6 : 2.5);
}
