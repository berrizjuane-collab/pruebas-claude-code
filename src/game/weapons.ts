/**
 * Six weapons, each with a distinct rhythm and a special bound to the same key.
 * Data (name/damage/range/speed/special) is shared with the pickup prompt so the
 * player always compares the same numbers the game actually uses.
 */

import { TAU, rand } from '../core/util';
import { C } from '../art/palette';
import type { DamageOpts, World } from './api';

export type SwingStyle = 'arc' | 'thrust' | 'line' | 'slam' | 'sweep';

export interface SwingSpec {
  reach: number;
  halfAngle: number;
  damage: number;
  wind: number;
  active: number;
  recover: number;
  color: string;
  knockback: number;
  hitstop: number;
  element: NonNullable<DamageOpts['element']>;
  style: SwingStyle;
  /** Forward lunge applied during the windup, in px/s. */
  lunge?: number;
  /** Max enemies a single swing can hit (Infinity for sweeps). */
  maxTargets?: number;
  /** Volt chaining to nearby enemies. */
  chain?: number;
  sfx?: 'slash' | 'whip' | 'punch' | 'blade' | 'spear';
  /** Screen shake on connect. */
  shake?: number;
  stagger?: number;
}

export interface WeaponUser {
  x: number;
  y: number;
  facing: number;
  radius: number;
  energy: number;
  maxEnergy: number;
  damageMul: number;
  comboIndex: number;
  /** Seconds since the last successful dodge — drives Kairo's riposte. */
  sinceDodge: number;
  perfectWindow: boolean;
  addSwing(spec: SwingSpec): void;
  dash(angle: number, speed: number, duration: number, invuln: boolean, trailColor: string): void;
  grantShield(seconds: number): void;
  setLanceOut(state: boolean): void;
  lanceOut: boolean;
}

export interface WeaponDef {
  id: string;
  name: string;
  type: string;
  color: string;
  /** Short flavour line shown in the pickup prompt. */
  flavor: string;
  /** 1..5 star-style ratings shown in the UI. */
  dmgRating: number;
  rangeRating: number;
  speedRating: number;
  specialName: string;
  specialDesc: string;
  energyCost: number;
  /** Seconds between basic attacks. */
  cadence: number;
  /** Melee combo, empty for pure ranged weapons. */
  combo: SwingSpec[];
  /** Basic attack for ranged weapons. */
  fire?: (u: WeaponUser, w: World, dmgMul: number) => void;
  special: (u: WeaponUser, w: World, dmgMul: number) => boolean;
  /** Icon drawn in the HUD and the pickup prompt. */
  icon: (ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) => void;
}

// ---------------------------------------------------------------- icon helpers

function iconKatana(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, c: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 4);
  ctx.strokeStyle = c;
  ctx.lineWidth = 2.2 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-7 * s, 7 * s);
  ctx.lineTo(7 * s, -7 * s);
  ctx.stroke();
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.moveTo(-8 * s, 8 * s);
  ctx.lineTo(-4 * s, 4 * s);
  ctx.stroke();
  ctx.restore();
}

function iconWhip(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, c: string): void {
  ctx.save();
  ctx.strokeStyle = c;
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.moveTo(x - 9 * s, y + 6 * s);
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    ctx.lineTo(x - 9 * s + t * 18 * s, y + 6 * s - t * 12 * s + Math.sin(t * 8) * 3 * s);
  }
  ctx.stroke();
  ctx.restore();
}

function iconPistol(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, c: string): void {
  ctx.save();
  ctx.strokeStyle = c;
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.moveTo(x - 8 * s, y - 3 * s);
  ctx.lineTo(x + 6 * s, y - 3 * s);
  ctx.lineTo(x + 6 * s, y + 1 * s);
  ctx.moveTo(x - 5 * s, y - 3 * s);
  ctx.lineTo(x - 8 * s, y + 7 * s);
  ctx.stroke();
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(x + 9 * s, y - 1 * s, 2 * s, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function iconGauntlet(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, c: string): void {
  ctx.save();
  ctx.strokeStyle = c;
  ctx.lineWidth = 2 * s;
  ctx.strokeRect(x - 7 * s, y - 6 * s, 14 * s, 10 * s);
  ctx.beginPath();
  ctx.arc(x, y + 5 * s, 4 * s, 0, Math.PI);
  ctx.stroke();
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(x, y - 1 * s, 2.2 * s, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function iconBlades(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, c: string): void {
  ctx.save();
  ctx.strokeStyle = c;
  ctx.lineWidth = 2 * s;
  ctx.lineCap = 'round';
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + d * 3 * s, y + 8 * s);
    ctx.lineTo(x + d * 8 * s, y - 8 * s);
    ctx.stroke();
  }
  ctx.restore();
}

function iconLance(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, c: string): void {
  ctx.save();
  ctx.strokeStyle = c;
  ctx.lineWidth = 2 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 9 * s, y + 9 * s);
  ctx.lineTo(x + 7 * s, y - 7 * s);
  ctx.stroke();
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.moveTo(x + 10 * s, y - 10 * s);
  ctx.lineTo(x + 3 * s, y - 7 * s);
  ctx.lineTo(x + 7 * s, y - 3 * s);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- definitions

export const WEAPONS: Record<string, WeaponDef> = {
  katana: {
    id: 'katana',
    name: 'Katana de Plasma «Kairo»',
    type: 'Filo corto',
    color: C.cyan,
    flavor: 'Tres cortes encadenados. Fiable, limpia, tuya desde el principio.',
    dmgRating: 3,
    rangeRating: 2,
    speedRating: 4,
    specialName: 'Contragolpe',
    specialDesc: 'Tras una esquiva perfecta, un tajo de castigo con daño doble.',
    energyCost: 0,
    cadence: 0.3,
    combo: [
      {
        reach: 62,
        halfAngle: 1.05,
        damage: 14,
        wind: 0.06,
        active: 0.08,
        recover: 0.16,
        color: C.cyan,
        knockback: 150,
        hitstop: 0.035,
        element: 'physical',
        style: 'arc',
        lunge: 130,
        sfx: 'slash',
        shake: 1.5,
      },
      {
        reach: 62,
        halfAngle: 1.15,
        damage: 14,
        wind: 0.05,
        active: 0.08,
        recover: 0.16,
        color: C.cyan,
        knockback: 150,
        hitstop: 0.035,
        element: 'physical',
        style: 'arc',
        lunge: 140,
        sfx: 'slash',
        shake: 1.5,
      },
      {
        reach: 76,
        halfAngle: 1.5,
        damage: 24,
        wind: 0.13,
        active: 0.11,
        recover: 0.3,
        color: C.white,
        knockback: 300,
        hitstop: 0.075,
        element: 'physical',
        style: 'sweep',
        lunge: 210,
        maxTargets: Infinity,
        sfx: 'slash',
        shake: 4,
        stagger: 0.35,
      },
    ],
    special(u, w, mul) {
      // Riposte: only meaningful right after a dodge — otherwise a normal quick cut.
      const perfect = u.perfectWindow;
      u.addSwing({
        reach: perfect ? 96 : 66,
        halfAngle: perfect ? 1.4 : 0.9,
        damage: (perfect ? 46 : 16) * mul,
        wind: 0.04,
        active: 0.1,
        recover: perfect ? 0.18 : 0.26,
        color: perfect ? C.white : C.cyan,
        knockback: perfect ? 380 : 140,
        hitstop: perfect ? 0.11 : 0.03,
        element: 'physical',
        style: 'sweep',
        lunge: perfect ? 320 : 90,
        maxTargets: Infinity,
        sfx: 'slash',
        shake: perfect ? 7 : 1.5,
        stagger: perfect ? 0.8 : 0,
      });
      if (perfect) {
        w.sfx('parry');
        w.fx.shockwave(u.x, u.y, 110, C.white, 0.35, 4);
        w.hitstop(0.07);
      }
      return true;
    },
    icon: iconKatana,
  },

  whip: {
    id: 'whip',
    name: 'Látigo de Arco Voltáico',
    type: 'Cadena eléctrica',
    color: C.violet,
    flavor: 'Barre una línea entera. Perfecto contra grupos apretados.',
    dmgRating: 3,
    rangeRating: 4,
    speedRating: 3,
    specialName: 'Sobrecarga',
    specialDesc: 'Descarga en anillo que salta entre enemigos cercanos.',
    energyCost: 30,
    cadence: 0.42,
    combo: [
      {
        reach: 128,
        halfAngle: 0.34,
        damage: 19,
        wind: 0.11,
        active: 0.1,
        recover: 0.22,
        color: C.violet,
        knockback: 120,
        hitstop: 0.03,
        element: 'volt',
        style: 'line',
        maxTargets: Infinity,
        sfx: 'whip',
        shake: 2,
      },
      {
        reach: 118,
        halfAngle: 1.25,
        damage: 22,
        wind: 0.16,
        active: 0.12,
        recover: 0.3,
        color: C.magenta,
        knockback: 210,
        hitstop: 0.05,
        element: 'volt',
        style: 'sweep',
        maxTargets: Infinity,
        sfx: 'whip',
        shake: 3.5,
        stagger: 0.3,
      },
    ],
    special(u, w, mul) {
      w.sfx('whip', 1.2);
      w.fx.shockwave(u.x, u.y, 190, C.violet, 0.45, 5);
      w.shake(6);
      w.spawnZone({
        x: u.x,
        y: u.y,
        radius: 175,
        shape: 'circle',
        faction: 'player',
        warn: 0,
        live: 0.16,
        damage: 30 * mul,
        mode: 'burst',
        color: C.violet,
        knockback: 260,
        follow: null,
      });
      // Arcs between everything in range for the visual read of "chain".
      const hits = w.enemies.filter(
        (e) => !e.dead && Math.hypot(e.x - u.x, e.y - u.y) < 175,
      );
      for (const e of hits) {
        w.fx.streak(
          (u.x + e.x) / 2,
          (u.y + e.y) / 2,
          Math.atan2(e.y - u.y, e.x - u.x),
          Math.hypot(e.x - u.x, e.y - u.y),
          C.violet,
          0.2,
        );
        for (const o of hits) {
          if (o === e) continue;
          if (Math.hypot(o.x - e.x, o.y - e.y) < 130) {
            w.fx.streak(
              (o.x + e.x) / 2,
              (o.y + e.y) / 2,
              Math.atan2(o.y - e.y, o.x - e.x),
              Math.hypot(o.x - e.x, o.y - e.y),
              C.magenta,
              0.22,
            );
          }
        }
      }
      return true;
    },
    icon: iconWhip,
  },

  pistol: {
    id: 'pistol',
    name: 'Pistola de Resonancia',
    type: 'Energía a distancia',
    color: C.energy,
    flavor: 'Munición que se regenera sola. Segura, constante, sin sorpresas.',
    dmgRating: 2,
    rangeRating: 5,
    speedRating: 4,
    specialName: 'Disparo cargado',
    specialDesc: 'Perfora enemigos ligeros en línea recta y activa nodos de energía.',
    energyCost: 34,
    cadence: 0.22,
    combo: [],
    fire(u, w, mul) {
      const spread = rand(-0.045, 0.045);
      w.sfx('shot', 0.8);
      w.spawnProjectile({
        x: u.x + Math.cos(u.facing) * 16,
        y: u.y + Math.sin(u.facing) * 16,
        vx: Math.cos(u.facing + spread) * 620,
        vy: Math.sin(u.facing + spread) * 620,
        radius: 5,
        damage: 11 * mul,
        faction: 'player',
        kind: 'bolt',
        color: C.energy,
        maxLife: 1.1,
        size: 7,
      });
      w.fx.burst(u.x + Math.cos(u.facing) * 18, u.y + Math.sin(u.facing) * 18, 3, C.energy, {
        speed: 120,
        life: 0.16,
        size: 1.8,
        spread: 0.8,
        dir: u.facing,
      });
    },
    special(u, w, mul) {
      w.sfx('chargeShot');
      w.shake(4);
      w.spawnProjectile({
        x: u.x + Math.cos(u.facing) * 18,
        y: u.y + Math.sin(u.facing) * 18,
        vx: Math.cos(u.facing) * 760,
        vy: Math.sin(u.facing) * 760,
        radius: 12,
        damage: 40 * mul,
        faction: 'player',
        kind: 'plasma',
        color: C.white,
        maxLife: 1.4,
        pierce: 99,
        size: 16,
      });
      w.fx.burst(u.x, u.y, 12, C.energy, { speed: 240, life: 0.3, spread: 1.2, dir: u.facing });
      return true;
    },
    icon: iconPistol,
  },

  gauntlet: {
    id: 'gauntlet',
    name: 'Guantelete de Gravedad Local',
    type: 'Impacto pesado',
    color: C.amber,
    flavor: 'Lento, brutal, y rompe la guardia de casi todo lo que camina.',
    dmgRating: 5,
    rangeRating: 2,
    speedRating: 1,
    specialName: 'Pozo gravitatorio',
    specialDesc: 'Atrae enemigos ligeros y desvía los proyectiles cercanos.',
    energyCost: 32,
    cadence: 0.62,
    combo: [
      {
        reach: 74,
        halfAngle: 0.85,
        damage: 36,
        wind: 0.24,
        active: 0.11,
        recover: 0.34,
        color: C.amber,
        knockback: 420,
        hitstop: 0.09,
        element: 'gravity',
        style: 'slam',
        lunge: 120,
        maxTargets: Infinity,
        sfx: 'punch',
        shake: 7,
        stagger: 0.6,
      },
      {
        reach: 92,
        halfAngle: 1.6,
        damage: 48,
        wind: 0.34,
        active: 0.13,
        recover: 0.44,
        color: C.white,
        knockback: 520,
        hitstop: 0.13,
        element: 'gravity',
        style: 'slam',
        lunge: 90,
        maxTargets: Infinity,
        sfx: 'punch',
        shake: 11,
        stagger: 0.9,
      },
    ],
    special(u, w, mul) {
      w.sfx('punch', 1.2);
      w.shake(5);
      w.fx.shockwave(u.x, u.y, 210, C.amber, 0.5, 4);
      // Pull light enemies in and convert nearby enemy shots to player shots.
      for (const e of w.enemies) {
        if (e.dead || e.isBoss) continue;
        const d = Math.hypot(e.x - u.x, e.y - u.y);
        if (d > 220 || d < 1) continue;
        const pull = e.elite ? 0.25 : 1;
        const a = Math.atan2(u.y - e.y, u.x - e.x);
        e.vx += Math.cos(a) * 460 * pull;
        e.vy += Math.sin(a) * 460 * pull;
        e.slowTimer = Math.max(e.slowTimer, 0.8);
      }
      w.spawnZone({
        x: u.x,
        y: u.y,
        radius: 120,
        shape: 'circle',
        faction: 'player',
        warn: 0,
        live: 0.22,
        damage: 18 * mul,
        mode: 'burst',
        color: C.amber,
        knockback: 0,
      });
      // Deflection is handled by the game loop reading this flag-ish zone.
      u.grantShield(0.45);
      return true;
    },
    icon: iconGauntlet,
  },

  blades: {
    id: 'blades',
    name: 'Cuchillas de Fase',
    type: 'Filos gemelos',
    color: C.magenta,
    flavor: 'Cortes minúsculos a una velocidad absurda. Recompensa la agresión.',
    dmgRating: 2,
    rangeRating: 2,
    speedRating: 5,
    specialName: 'Desfase',
    specialDesc: 'Desplazamiento corto que atraviesa enemigos hiriéndolos al pasar.',
    energyCost: 24,
    cadence: 0.15,
    combo: [
      {
        reach: 54,
        halfAngle: 0.8,
        damage: 9,
        wind: 0.03,
        active: 0.06,
        recover: 0.08,
        color: C.magenta,
        knockback: 70,
        hitstop: 0.018,
        element: 'phase',
        style: 'arc',
        lunge: 90,
        sfx: 'blade',
        shake: 0.8,
      },
      {
        reach: 54,
        halfAngle: 0.8,
        damage: 9,
        wind: 0.03,
        active: 0.06,
        recover: 0.08,
        color: C.magenta,
        knockback: 70,
        hitstop: 0.018,
        element: 'phase',
        style: 'arc',
        lunge: 90,
        sfx: 'blade',
        shake: 0.8,
      },
      {
        reach: 58,
        halfAngle: 1.0,
        damage: 13,
        wind: 0.04,
        active: 0.07,
        recover: 0.18,
        color: C.white,
        knockback: 180,
        hitstop: 0.04,
        element: 'phase',
        style: 'arc',
        lunge: 150,
        maxTargets: Infinity,
        sfx: 'blade',
        shake: 2,
      },
    ],
    special(u, w, mul) {
      w.sfx('dodge', 1.1);
      u.dash(u.facing, 780, 0.19, true, C.magenta);
      w.spawnZone({
        x: u.x,
        y: u.y,
        radius: 40,
        len: 190,
        halfW: 26,
        angle: u.facing,
        shape: 'rect',
        faction: 'player',
        warn: 0,
        live: 0.2,
        damage: 26 * mul,
        mode: 'burst',
        color: C.magenta,
        knockback: 120,
      });
      w.fx.streak(u.x, u.y, u.facing, 160, C.magenta, 0.3);
      return true;
    },
    icon: iconBlades,
  },

  lance: {
    id: 'lance',
    name: 'Lanza Vectorial',
    type: 'Asta larga',
    color: C.ally,
    flavor: 'Alcance brutal en línea recta. Castiga a quien se acerca de frente.',
    dmgRating: 4,
    rangeRating: 5,
    speedRating: 2,
    specialName: 'Lanzamiento vectorial',
    specialDesc: 'Arroja la lanza: clava a los enemigos ligeros y vuelve a tu mano.',
    energyCost: 28,
    cadence: 0.48,
    combo: [
      {
        reach: 132,
        halfAngle: 0.26,
        damage: 26,
        wind: 0.15,
        active: 0.1,
        recover: 0.26,
        color: C.ally,
        knockback: 240,
        hitstop: 0.05,
        element: 'physical',
        style: 'thrust',
        lunge: 200,
        maxTargets: 3,
        sfx: 'spear',
        shake: 3,
      },
      {
        reach: 148,
        halfAngle: 0.3,
        damage: 32,
        wind: 0.2,
        active: 0.12,
        recover: 0.34,
        color: C.white,
        knockback: 330,
        hitstop: 0.07,
        element: 'physical',
        style: 'thrust',
        lunge: 260,
        maxTargets: 4,
        sfx: 'spear',
        shake: 5,
        stagger: 0.5,
      },
    ],
    special(u, w, mul) {
      if (u.lanceOut) return false;
      u.setLanceOut(true);
      w.sfx('spear', 1.2);
      const proj = w.spawnProjectile({
        x: u.x + Math.cos(u.facing) * 16,
        y: u.y + Math.sin(u.facing) * 16,
        vx: Math.cos(u.facing) * 700,
        vy: Math.sin(u.facing) * 700,
        radius: 13,
        damage: 34 * mul,
        faction: 'player',
        kind: 'spear',
        color: C.ally,
        maxLife: 0.55,
        pierce: 99,
        size: 34,
        angle: u.facing,
      });
      proj.onExpire = (world) => {
        u.setLanceOut(false);
        world.fx.streak(proj.x, proj.y, proj.angle + Math.PI, 70, C.ally, 0.25);
      };
      return true;
    },
    icon: iconLance,
  },
};

export const WEAPON_ORDER = ['katana', 'whip', 'pistol', 'gauntlet', 'blades', 'lance'] as const;
