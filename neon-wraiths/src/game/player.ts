/**
 * Vanta. Eight-direction movement, a three-stage melee rhythm, a dodge with
 * generous i-frames, and two equipped weapons. Everything the player can do is
 * driven from here; the Game only feeds input and resolves world collisions.
 */

import { TAU, angleDelta, circleInArc, clamp, damp, dist, pointSegmentDist, rand } from '../core/util';
import { C, withAlpha } from '../art/palette';
import { disc, glow, line, ring, wedge } from '../core/render';
import type { Input } from '../core/input';
import type { Actor, DamageOpts, EnemyLike, World } from './api';
import { WEAPONS, type SwingSpec, type WeaponUser } from './weapons';
import type { TileMap } from '../world/tiles';

interface Swing {
  spec: SwingSpec;
  t: number;
  angle: number;
  ox: number;
  oy: number;
  hit: Set<number>;
  done: boolean;
  hits: number;
}

export interface PlayerStats {
  maxHp: number;
  healCharges: number;
  maxHealCharges: number;
  healAmount: number;
  dodgeCooldown: number;
  damageMul: number;
  energyRegen: number;
  credits: number;
}

export class Player implements Actor, WeaponUser {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  radius = 13;
  hp = 100;
  maxHp = 100;
  dead = false;
  facing = 0;

  // Equipment
  slots: (string | null)[] = ['katana', null];
  active = 0;
  owned = new Set<string>(['katana']);

  // Resources
  energy = 100;
  maxEnergy = 100;
  stats: PlayerStats = {
    maxHp: 100,
    healCharges: 3,
    maxHealCharges: 3,
    healAmount: 42,
    dodgeCooldown: 0.55,
    damageMul: 1,
    energyRegen: 17,
    credits: 0,
  };

  // Timers
  invuln = 0;
  hurtFlash = 0;
  dodgeTimer = 0;
  dodgeCd = 0;
  attackCd = 0;
  healCast = 0;
  shieldTimer = 0;
  comboIndex = 0;
  comboWindow = 0;
  sinceDodge = 99;
  perfectWindow = false;
  perfectTimer = 0;
  lanceOut = false;
  deathTimer = 0;

  private swing: Swing | null = null;
  private bufferedAttack = 0;
  private dashVx = 0;
  private dashVy = 0;
  private dashTime = 0;
  private dashInvuln = false;
  private dashTrail = C.player;
  private walkPhase = 0;
  private scarfPhase = 0;
  private trail: { x: number; y: number; a: number }[] = [];
  private trailTimer = 0;
  /** Set by the Game when a dodge actually avoided an incoming hit. */
  perfectPending = false;

  get weaponId(): string {
    return this.slots[this.active] ?? 'katana';
  }
  get weapon() {
    return WEAPONS[this.weaponId];
  }
  get damageMul(): number {
    return this.stats.damageMul;
  }
  get busy(): boolean {
    return this.swing !== null || this.dashTime > 0 || this.healCast > 0;
  }
  get invulnerable(): boolean {
    return this.invuln > 0 || (this.dashTime > 0 && this.dashInvuln);
  }
  /** True while the i-frames come from a dodge — the riposte condition. */
  get dashTimeActive(): boolean {
    return this.dashTime > 0 && this.dashInvuln;
  }
  /** Non-null while a melee swing is in its damaging frames. */
  get activeSwingInfo(): { angle: number; reach: number; half: number } | null {
    const s = this.swing;
    if (!s) return null;
    const start = s.spec.wind;
    if (s.t < start || s.t > start + s.spec.active) return null;
    return { angle: s.angle, reach: s.spec.reach, half: Math.max(s.spec.halfAngle, 0.5) };
  }

  reset(fullHeal = true): void {
    this.dead = false;
    this.deathTimer = 0;
    this.maxHp = this.stats.maxHp;
    if (fullHeal) this.hp = this.maxHp;
    this.hp = clamp(this.hp, 1, this.maxHp);
    this.energy = this.maxEnergy;
    this.vx = this.vy = 0;
    this.swing = null;
    this.dashTime = 0;
    this.healCast = 0;
    this.invuln = 0.6;
    this.lanceOut = false;
    this.trail.length = 0;
  }

  giveWeapon(id: string, slot: number): void {
    this.owned.add(id);
    this.slots[clamp(slot, 0, 1)] = id;
    if (this.slots[this.active] === null) this.active = slot;
  }

  hasFreeSlot(): boolean {
    return this.slots.some((s) => s === null);
  }

  swapActive(): boolean {
    const other = this.active === 0 ? 1 : 0;
    if (!this.slots[other]) return false;
    this.active = other;
    this.comboIndex = 0;
    return true;
  }

  // ------------------------------------------------------------ WeaponUser API

  addSwing(spec: SwingSpec): void {
    this.swing = {
      spec,
      t: 0,
      angle: this.facing,
      ox: this.x,
      oy: this.y,
      hit: new Set(),
      done: false,
      hits: 0,
    };
  }

  dash(angle: number, speed: number, duration: number, invuln: boolean, trailColor: string): void {
    this.dashVx = Math.cos(angle) * speed;
    this.dashVy = Math.sin(angle) * speed;
    this.dashTime = duration;
    this.dashInvuln = invuln;
    this.dashTrail = trailColor;
    this.facing = angle;
  }

  grantShield(seconds: number): void {
    this.shieldTimer = Math.max(this.shieldTimer, seconds);
  }

  setLanceOut(state: boolean): void {
    this.lanceOut = state;
  }

  // ------------------------------------------------------------------- combat

  registerPerfectDodge(): void {
    this.perfectWindow = true;
    this.perfectTimer = 0.55;
  }

  canHeal(): boolean {
    return this.stats.healCharges > 0 && this.hp < this.maxHp && this.healCast <= 0 && !this.dead;
  }

  heal(w: World): boolean {
    if (!this.canHeal()) {
      w.sfx('deny');
      return false;
    }
    this.stats.healCharges--;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + this.stats.healAmount);
    this.healCast = 0.42;
    w.sfx('heal');
    w.fx.floatText(this.x, this.y - 26, `+${Math.round(this.hp - before)}`, C.heal, 17);
    for (let i = 0; i < 18; i++) {
      const a = rand(0, TAU);
      w.fx.spawn({
        kind: 'spark',
        x: this.x + Math.cos(a) * 22,
        y: this.y + Math.sin(a) * 22,
        vx: -Math.cos(a) * 60,
        vy: -Math.sin(a) * 60 - 40,
        maxLife: 0.6,
        size: 2.6,
        color: C.heal,
        drag: 2,
      });
    }
    return true;
  }

  hurt(amount: number, fromX: number, fromY: number, w: World, opts: DamageOpts = {}): boolean {
    if (this.dead || this.invulnerable) return false;
    const dmg = Math.max(1, Math.round(amount));
    this.hp -= dmg;
    this.hurtFlash = 0.35;
    this.invuln = 0.85;
    const a = Math.atan2(this.y - fromY, this.x - fromX);
    const kb = opts.knockback ?? 260;
    this.vx += Math.cos(a) * kb;
    this.vy += Math.sin(a) * kb;
    // Getting hit cancels the current action — no trading through a boss swing.
    this.swing = null;
    this.dashTime = 0;
    this.comboIndex = 0;
    w.sfx('hurt');
    w.shake(7, 5);
    w.fx.hit(this.x, this.y, a, C.danger, 1.3);
    w.fx.floatText(this.x, this.y - 30, `-${dmg}`, C.danger, 16);
    w.hitstop(0.06);
    w.flash(C.danger, 0.16, 0.18);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.deathTimer = 0;
      w.sfx('death');
      w.shake(14, 3);
      w.fx.burst(this.x, this.y, 40, C.player, { speed: 320, life: 1.1, size: 3.4 });
      w.fx.shockwave(this.x, this.y, 180, C.player, 0.7, 5);
    }
    return true;
  }

  private startAttack(w: World): void {
    const def = this.weapon;
    if (def.combo.length === 0) {
      // Ranged weapons fire straight away.
      def.fire?.(this, w, this.stats.damageMul);
      this.attackCd = def.cadence;
      return;
    }
    const spec = def.combo[Math.min(this.comboIndex, def.combo.length - 1)];
    const scaled: SwingSpec = { ...spec, damage: spec.damage * this.stats.damageMul };
    this.addSwing(scaled);
    if (spec.sfx) w.sfx(spec.sfx, 0.85);
    this.comboIndex = (this.comboIndex + 1) % def.combo.length;
    this.comboWindow = 0.75;
    this.attackCd = spec.wind + spec.active + spec.recover;
  }

  private resolveSwing(w: World, dt: number): void {
    const s = this.swing;
    if (!s) return;
    const { spec } = s;
    s.t += dt;
    const windEnd = spec.wind;
    const activeEnd = windEnd + spec.active;
    const total = activeEnd + spec.recover;

    // Lunge during the windup so attacks feel like they commit forward.
    if (s.t < windEnd && spec.lunge) {
      const k = 1 - s.t / windEnd;
      this.vx += Math.cos(s.angle) * spec.lunge * k * dt * 9;
      this.vy += Math.sin(s.angle) * spec.lunge * k * dt * 9;
    }

    if (s.t >= windEnd && s.t < activeEnd) {
      const maxT = spec.maxTargets ?? 1;
      for (const e of w.enemies) {
        if (e.dead || s.hit.has(e.id)) continue;
        if (s.hits >= maxT) break;
        let hit = false;
        if (spec.style === 'line' || spec.style === 'thrust') {
          const ex = s.ox + Math.cos(s.angle) * spec.reach;
          const ey = s.oy + Math.sin(s.angle) * spec.reach;
          const width = spec.style === 'thrust' ? 20 : 26;
          hit = pointSegmentDist(e.x, e.y, this.x, this.y, ex, ey) < e.radius + width;
        } else {
          hit = circleInArc(this.x, this.y, s.angle, spec.halfAngle, spec.reach, e.x, e.y, e.radius);
        }
        if (!hit) continue;
        s.hit.add(e.id);
        s.hits++;
        const ang = Math.atan2(e.y - this.y, e.x - this.x);
        w.damageEnemy(e, spec.damage, {
          knockback: spec.knockback,
          angle: ang,
          hitstop: spec.hitstop,
          element: spec.element,
          stagger: spec.stagger,
        });
        if (spec.shake) w.shake(spec.shake);
        // Volt weapons arc to a second nearby target for the chain fantasy.
        if (spec.element === 'volt') {
          for (const o of w.enemies) {
            if (o.dead || o === e || s.hit.has(o.id)) continue;
            if (dist(o.x, o.y, e.x, e.y) > 110) continue;
            s.hit.add(o.id);
            w.damageEnemy(o, spec.damage * 0.45, {
              knockback: 60,
              angle: Math.atan2(o.y - e.y, o.x - e.x),
              element: 'volt',
            });
            w.fx.streak(
              (o.x + e.x) / 2,
              (o.y + e.y) / 2,
              Math.atan2(o.y - e.y, o.x - e.x),
              dist(o.x, o.y, e.x, e.y),
              C.violet,
              0.18,
            );
            break;
          }
        }
      }
    }

    if (s.t >= total) this.swing = null;
  }

  update(
    dt: number,
    input: Input,
    w: World,
    map: TileMap,
    allowControl: boolean,
  ): void {
    if (this.dead) {
      this.deathTimer += dt;
      this.vx = damp(this.vx, 0, 6, dt);
      this.vy = damp(this.vy, 0, 6, dt);
      map.moveCircle(this, this.vx * dt, this.vy * dt, this.radius);
      return;
    }

    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.healCast = Math.max(0, this.healCast - dt);
    this.shieldTimer = Math.max(0, this.shieldTimer - dt);
    this.comboWindow = Math.max(0, this.comboWindow - dt);
    this.bufferedAttack = Math.max(0, this.bufferedAttack - dt);
    this.sinceDodge += dt;
    if (this.comboWindow <= 0) this.comboIndex = 0;
    if (this.perfectTimer > 0) {
      this.perfectTimer -= dt;
      if (this.perfectTimer <= 0) this.perfectWindow = false;
    }
    this.energy = Math.min(this.maxEnergy, this.energy + this.stats.energyRegen * dt);

    const move = allowControl ? input.moveVector() : { x: 0, y: 0, len: 0 };

    // ---- dodge
    if (allowControl && input.pressed('dodge') && this.dodgeCd <= 0 && this.dashTime <= 0) {
      const a = move.len > 0.2 ? Math.atan2(move.y, move.x) : this.facing;
      this.dash(a, 640, 0.2, true, C.player);
      this.dodgeCd = this.stats.dodgeCooldown;
      this.sinceDodge = 0;
      this.swing = null;
      w.sfx('dodge');
      w.fx.shockwave(this.x, this.y, 40, C.player, 0.25, 2);
    }

    // ---- attack (with a short input buffer so combos never feel dropped)
    if (allowControl && input.pressed('attack')) this.bufferedAttack = 0.22;
    if (this.bufferedAttack > 0 && this.attackCd <= 0 && this.dashTime <= 0 && this.healCast <= 0) {
      this.bufferedAttack = 0;
      this.startAttack(w);
    }

    // ---- special
    if (allowControl && input.pressed('special') && this.dashTime <= 0 && this.healCast <= 0) {
      const def = this.weapon;
      const cost = def.energyCost;
      if (this.energy >= cost) {
        const ok = def.special(this, w, this.stats.damageMul);
        if (ok) {
          this.energy -= cost;
          this.attackCd = Math.max(this.attackCd, 0.18);
        } else {
          w.sfx('deny');
        }
      } else {
        w.sfx('deny');
        w.fx.floatText(this.x, this.y - 32, 'Sin carga', C.uiDim, 13);
      }
    }

    // ---- heal
    if (allowControl && input.pressed('heal')) this.heal(w);

    // ---- movement
    const speedBase = 208;
    let speed = speedBase;
    if (this.swing) speed *= 0.42;
    if (this.healCast > 0) speed *= 0.55;

    if (this.dashTime > 0) {
      this.dashTime -= dt;
      const k = clamp(this.dashTime / 0.2, 0, 1);
      this.vx = this.dashVx * (0.35 + k * 0.65);
      this.vy = this.dashVy * (0.35 + k * 0.65);
      this.trailTimer -= dt;
      if (this.trailTimer <= 0) {
        this.trailTimer = 0.02;
        this.trail.push({ x: this.x, y: this.y, a: 1 });
        if (this.trail.length > 14) this.trail.shift();
      }
    } else if (move.len > 0.05) {
      const targetVx = move.x * speed * move.len;
      const targetVy = move.y * speed * move.len;
      this.vx = damp(this.vx, targetVx, 18, dt);
      this.vy = damp(this.vy, targetVy, 18, dt);
      this.walkPhase += dt * (6 + move.len * 6);
      if (!this.swing) {
        const target = Math.atan2(move.y, move.x);
        this.facing += angleDelta(this.facing, target) * clamp(dt * 22, 0, 1);
      }
    } else {
      this.vx = damp(this.vx, 0, 14, dt);
      this.vy = damp(this.vy, 0, 14, dt);
      this.walkPhase = damp(this.walkPhase, Math.round(this.walkPhase / Math.PI) * Math.PI, 8, dt);
    }

    map.moveCircle(this, this.vx * dt, this.vy * dt, this.radius);
    this.scarfPhase += dt * (3 + Math.hypot(this.vx, this.vy) * 0.02);

    for (const t of this.trail) t.a -= dt * 4.2;
    while (this.trail.length && this.trail[0].a <= 0) this.trail.shift();

    this.resolveSwing(w, dt);
  }

  // ------------------------------------------------------------------ drawing

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    const bob = Math.sin(this.walkPhase) * 1.6;
    const moving = Math.hypot(this.vx, this.vy) > 20;

    // Dash afterimages
    for (const t of this.trail) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      disc(ctx, t.x, t.y - 4, 11, withAlpha(this.dashTrail, 0.16 * t.a));
      ctx.restore();
    }

    if (this.dead) {
      ctx.save();
      ctx.globalAlpha = clamp(1 - this.deathTimer / 1.4, 0, 1);
      glow(ctx, this.x, this.y, 46, C.player, 0.4);
      disc(ctx, this.x, this.y, 10, withAlpha(C.player, 0.6));
      ctx.restore();
      return;
    }

    // Ground shadow + character light
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 12, 13, 6, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, this.x, this.y, 74, C.player, this.hurtFlash > 0 ? 0.1 : 0.16);
    ctx.restore();

    const fx = Math.cos(this.facing);
    const fy = Math.sin(this.facing);
    const bodyY = this.y + bob;

    // Coat tail streaming opposite to motion
    const tailA = Math.atan2(-this.vy, -this.vx);
    const tailLen = 16 + Math.min(18, Math.hypot(this.vx, this.vy) * 0.05);
    ctx.save();
    ctx.fillStyle = withAlpha('#101a33', 0.95);
    ctx.beginPath();
    ctx.moveTo(this.x + Math.cos(tailA + 1.5) * 10, bodyY + Math.sin(tailA + 1.5) * 10);
    ctx.quadraticCurveTo(
      this.x + Math.cos(tailA) * tailLen + Math.sin(this.scarfPhase * 2) * 4,
      bodyY + Math.sin(tailA) * tailLen,
      this.x + Math.cos(tailA - 1.5) * 10,
      bodyY + Math.sin(tailA - 1.5) * 10,
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Body — a near-black silhouette with a hot cyan rim keeps Vanta readable
    // against every zone palette, bright greenhouse floors included.
    const hurt = this.hurtFlash > 0 && Math.floor(time * 30) % 2 === 0;
    const bodyCol = hurt ? '#ffffff' : '#0b1226';
    ctx.save();
    ctx.translate(this.x, bodyY);
    ctx.rotate(this.facing + Math.PI / 2);
    // Dark halo: separates the character from bright backgrounds.
    ctx.fillStyle = 'rgba(3,4,12,0.7)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 13.5, 16, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    ctx.ellipse(0, 0, 10.5, 13, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = withAlpha(hurt ? '#ffffff' : C.player, 1);
    ctx.lineWidth = 2.4;
    ctx.stroke();
    // Chest light
    ctx.fillStyle = withAlpha(hurt ? '#ffffff' : C.player, 0.95);
    ctx.beginPath();
    ctx.ellipse(0, -3, 2.8, 3.8, 0, 0, TAU);
    ctx.fill();
    // Shoulder pads
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#070c1a';
      ctx.beginPath();
      ctx.ellipse(
        s * 9.2,
        -1 + (moving ? Math.sin(this.walkPhase + (s > 0 ? 0 : Math.PI)) * 1.8 : 0),
        4.4,
        5.8,
        0,
        0,
        TAU,
      );
      ctx.fill();
      ctx.strokeStyle = withAlpha(C.player, 0.7);
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }
    ctx.restore();

    // Head + visor
    const hx = this.x + fx * 3;
    const hy = bodyY - 5 + fy * 3;
    disc(ctx, hx, hy, 8, 'rgba(3,4,12,0.8)');
    disc(ctx, hx, hy, 6.6, hurt ? '#ffffff' : '#101a33');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const vx = hx + fx * 4.2;
    const vy = hy + fy * 4.2;
    ctx.strokeStyle = withAlpha(C.player, 1);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(hx, hy, 5.4, this.facing - 0.8, this.facing + 0.8);
    ctx.stroke();
    glow(ctx, vx, vy, 16, C.player, 0.6);
    ctx.restore();

    // Held weapon silhouette
    this.drawHeldWeapon(ctx, time);

    // Swing / dodge / shield effects
    this.drawSwing(ctx);

    if (this.shieldTimer > 0) {
      const a = clamp(this.shieldTimer / 0.45, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ring(ctx, this.x, this.y, 26 + (1 - a) * 8, 2.5, C.amber, a * 0.8);
      glow(ctx, this.x, this.y, 42, C.amber, a * 0.25);
      ctx.restore();
    }
    if (this.perfectWindow) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ring(ctx, this.x, this.y, 22 + Math.sin(time * 22) * 2, 2, C.white, 0.7);
      ctx.restore();
    }
    if (this.invuln > 0 && this.hurtFlash <= 0) {
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(time * 26);
      ring(ctx, this.x, this.y, 17, 1.5, C.player, 0.6);
      ctx.restore();
    }
    if (this.healCast > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const k = this.healCast / 0.42;
      ring(ctx, this.x, this.y, 26 * (1 - k) + 8, 3, C.heal, k);
      ctx.restore();
    }
  }

  private drawHeldWeapon(ctx: CanvasRenderingContext2D, time: number): void {
    if (this.lanceOut && this.weaponId === 'lance') return;
    const def = this.weapon;
    const swinging = this.swing !== null;
    const side = this.facing + (swinging ? 0 : 0.55);
    const px = this.x + Math.cos(side) * 13;
    const py = this.y + Math.sin(side) * 13 - 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(px, py);
    ctx.rotate(this.facing + (swinging ? 0 : 0.4) + Math.sin(time * 2) * 0.03);
    ctx.strokeStyle = withAlpha(def.color, 0.9);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    switch (def.id) {
      case 'katana':
      case 'lance': {
        const len = def.id === 'lance' ? 34 : 22;
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.lineTo(len, 0);
        ctx.stroke();
        break;
      }
      case 'whip':
        ctx.beginPath();
        ctx.moveTo(0, 0);
        for (let i = 1; i <= 6; i++) {
          ctx.lineTo(i * 4, Math.sin(time * 6 + i) * 3);
        }
        ctx.stroke();
        break;
      case 'pistol':
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(12, 0);
        ctx.stroke();
        break;
      case 'gauntlet':
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(8, 0);
        ctx.stroke();
        break;
      case 'blades':
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(0, s * 3);
          ctx.lineTo(16, s * 6);
          ctx.stroke();
        }
        break;
    }
    ctx.restore();
  }

  private drawSwing(ctx: CanvasRenderingContext2D): void {
    const s = this.swing;
    if (!s) return;
    const { spec } = s;
    const windEnd = spec.wind;
    const activeEnd = windEnd + spec.active;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (s.t < windEnd) {
      // Windup: a faint ghost of where the hit will land.
      const k = s.t / windEnd;
      ctx.globalAlpha = 0.18 + k * 0.22;
      if (spec.style === 'line' || spec.style === 'thrust') {
        line(
          ctx,
          this.x,
          this.y,
          this.x + Math.cos(s.angle) * spec.reach * (0.4 + k * 0.3),
          this.y + Math.sin(s.angle) * spec.reach * (0.4 + k * 0.3),
          3,
          spec.color,
          0.7,
        );
      } else {
        wedge(ctx, this.x, this.y, spec.reach * (0.55 + k * 0.2), s.angle, spec.halfAngle, this.radius);
        ctx.fillStyle = withAlpha(spec.color, 0.16);
        ctx.fill();
      }
    } else if (s.t < activeEnd) {
      const k = (s.t - windEnd) / spec.active;
      ctx.globalAlpha = 1;
      if (spec.style === 'line' || spec.style === 'thrust') {
        const reach = spec.reach * (spec.style === 'thrust' ? 0.6 + k * 0.4 : 1);
        const ex = this.x + Math.cos(s.angle) * reach;
        const ey = this.y + Math.sin(s.angle) * reach;
        line(ctx, this.x, this.y, ex, ey, 10 * (1 - k * 0.55), withAlpha(spec.color, 0.55), 1);
        line(ctx, this.x, this.y, ex, ey, 3.5, '#ffffff', 0.9 * (1 - k * 0.4));
        glow(ctx, ex, ey, 26, spec.color, 0.5 * (1 - k));
      } else {
        // Sweep the arc across the active window so the motion reads clearly.
        const sweepFrom = s.angle - spec.halfAngle;
        const sweepTo = s.angle + spec.halfAngle;
        const head = sweepFrom + (sweepTo - sweepFrom) * k;
        const tail = sweepFrom + (sweepTo - sweepFrom) * Math.max(0, k - 0.55);
        ctx.beginPath();
        ctx.arc(this.x, this.y, spec.reach, tail, head);
        ctx.arc(this.x, this.y, this.radius + 4, head, tail, true);
        ctx.closePath();
        const g = ctx.createRadialGradient(this.x, this.y, this.radius, this.x, this.y, spec.reach);
        g.addColorStop(0, withAlpha(spec.color, 0.05));
        g.addColorStop(0.7, withAlpha(spec.color, 0.4));
        g.addColorStop(1, withAlpha('#ffffff', 0.75));
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = withAlpha('#ffffff', 0.85 * (1 - k * 0.5));
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, spec.reach, head - 0.12, head);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Interaction probe used for doors, NPCs and terminals. */
  interactPoint(): { x: number; y: number } {
    return { x: this.x + Math.cos(this.facing) * 20, y: this.y + Math.sin(this.facing) * 20 };
  }
}

/** Convenience for AI: treat the player as an EnemyLike-ish target. */
export function asActor(p: Player): Actor {
  return p;
}

export type { EnemyLike };
