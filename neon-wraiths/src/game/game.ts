/**
 * The Game owns the state machine, the world implementation that entities talk
 * to, and the render pipeline. Everything else in `src/` is a leaf module.
 */

import { Camera } from '../core/camera';
import { Input } from '../core/input';
import { Particles } from '../core/particles';
import { Renderer, VIEW_H, VIEW_W, disc, glow, line, ring, text, wedge, FONT_MONO } from '../core/render';
import { audio, type SfxName } from '../core/audio';
import {
  TAU,
  chance,
  circleInArc,
  clamp,
  dist,
  pick,
  rand,
  randInt,
} from '../core/util';
import { C, THEMES, withAlpha, type ZoneTheme } from '../art/palette';
import { Backdrop, drawGlitch } from '../art/backdrop';
import { TILE } from '../world/tiles';
import { Room, type Item } from '../world/room';
import { LEVELS, UPGRADES, type LevelDef, type RoomDef } from '../world/levels';
import { Player } from './player';
import { Enemy, ENEMY_DEFS, enemyDeathFx, makeEnemy, shieldFactor } from './enemies';
import { BOSS_IDS, registerBosses } from './bosses';
import { WEAPONS } from './weapons';
import { AMBIENT_BARKS, PLAYER_CHOICE_REPLIES, STORY } from './story';
import type { DamageOpts, DialogueLine, EnemyLike, Projectile, World, Zone } from './api';
import { drawBarks, drawHud } from './hud';
import {
  drawAreaCard,
  drawCredits,
  drawDeath,
  drawDialogue,
  drawEnding,
  drawPause,
  drawShop,
  drawTitle,
  drawTitleAmbience,
  drawWeaponPrompt,
} from './menus';

registerBosses();

export type Mode = 'title' | 'playing' | 'dead' | 'ending' | 'credits';

interface Progress {
  fragments: number;
  credits: number;
  kills: number;
  deaths: number;
  upgrades: Record<string, number>;
  consumed: string[];
  cleared: string[];
  bosses: string[];
  owned: string[];
  slots: (string | null)[];
  activeSlot: number;
  hazardsOff: string[];
  nodes: string[];
}

interface Checkpoint {
  levelId: string;
  roomId: string;
  progress: Progress;
}

interface DialogueState {
  lines: DialogueLine[];
  index: number;
  chars: number;
  fade: number;
  choice: number;
  onDone?: () => void;
}

interface Bark {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  max: number;
}

interface WeaponPromptState {
  weaponId: string;
  index: number;
  options: { label: string; slot: number }[];
  onClose?: () => void;
}

interface ShopState {
  items: string[];
  index: number;
}

interface BossBar {
  name: string;
  hp: number;
  maxHp: number;
  phase: number;
  phases: number;
  subtitle?: string;
  ttl: number;
}

const MAX_PROJECTILES = 240;
const MAX_ZONES = 90;

export class Game implements World {
  readonly renderer: Renderer;
  readonly input = new Input();
  readonly camera = new Camera();
  readonly fx = new Particles();
  readonly backdrop = new Backdrop();
  readonly player = new Player();

  mode: Mode = 'title';
  time = 0;
  dt = 0;
  paused = false;
  private hitstopTimer = 0;

  // world
  level!: LevelDef;
  room!: Room;
  rooms = new Map<string, Room>();
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  barks: Bark[] = [];
  theme: ZoneTheme = THEMES.slums;

  // progress
  progress: Progress = Game.emptyProgress();
  checkpoint: Checkpoint | null = null;

  // overlays
  dialogue: DialogueState | null = null;
  weaponPrompt: WeaponPromptState | null = null;
  shop: ShopState | null = null;
  bossBar: BossBar | null = null;

  // ui state
  titleOptions = ['JUGAR', 'CONTROLES', 'OPCIONES'];
  titleIndex = 0;
  optionIndex = 0;
  pauseOptions = ['CONTINUAR', 'MÚSICA', 'EFECTOS', 'RESPLANDOR', 'SACUDIDA', 'REINICIAR NIVEL', 'VOLVER AL TÍTULO'];
  pauseIndex = 0;
  deathOptions = ['REINTENTAR', 'VOLVER AL TÍTULO'];
  deathIndex = 0;
  deathFade = 0;
  deathLine = '';
  settings = { music: true, sfx: true, bloom: true, shake: true };

  objective = 'Sigue la señal';
  areaLabel = '';
  areaCardTimer = 0;
  areaCardTitle = '';
  areaCardSub = '';
  toast = '';
  toastColor = C.pickup;
  toastTimer = 0;
  endingTimer = 0;
  creditsTimer = 0;

  // transitions
  private fade = 0;
  private fadeDir = 0;
  private pendingTransition: { level: string; room: string; from: string | null } | null = null;
  private doorCooldown = 0;

  // screen fx
  private flashColor = '#ffffff';
  private flashAlpha = 0;
  private flashTimer = 0;
  private flashMax = 0.2;
  glitchAmount = 0;
  private glitchTimer = 0;
  private dimAmount = 0;

  private ambientTimer = 8;
  private pendingReward: { def: RoomDef; t: number } | null = null;
  private deathScreenTimer = 0;
  /** Adaptive quality: drop bloom automatically on devices that can't hold 60. */
  private frameAvg = 16;
  private slowFrames = 0;
  private qualityLowered = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.input.attach(canvas);
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      this.projectiles.push(Game.blankProjectile());
    }
    for (let i = 0; i < MAX_ZONES; i++) this.zones.push(Game.blankZone());
    this.level = LEVELS.prologue;
    this.room = this.getRoom('prologue', 'p1');
    this.theme = THEMES.slums;
  }

  static emptyProgress(): Progress {
    return {
      fragments: 0,
      credits: 0,
      kills: 0,
      deaths: 0,
      upgrades: {},
      consumed: [],
      cleared: [],
      bosses: [],
      owned: ['katana'],
      slots: ['katana', null],
      activeSlot: 0,
      hazardsOff: [],
      nodes: [],
    };
  }

  static blankProjectile(): Projectile {
    return {
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 6,
      damage: 8,
      life: 0,
      maxLife: 2,
      faction: 'enemy',
      kind: 'bolt',
      color: C.enemy,
      pierce: 0,
      homing: 0,
      fuse: 0,
      explodeRadius: 0,
      explodeDamage: 0,
      angle: 0,
      spin: 0,
      size: 8,
      deflectable: true,
      wobble: 0,
      hitIds: new Set(),
    };
  }

  static blankZone(): Zone {
    return {
      active: false,
      x: 0,
      y: 0,
      radius: 40,
      len: 0,
      halfW: 20,
      angle: 0,
      shape: 'circle',
      faction: 'enemy',
      warn: 0,
      warnMax: 0,
      live: 0,
      liveMax: 0,
      damage: 10,
      mode: 'burst',
      tick: 0,
      color: C.danger,
      slow: 0,
      root: 0,
      knockback: 200,
      hitIds: new Set(),
      follow: null,
    };
  }

  // ----------------------------------------------------------------- helpers

  get map() {
    return this.room.map;
  }
  get playerActor() {
    return this.player;
  }
  get playerAlive(): boolean {
    return !this.player.dead;
  }
  get difficulty(): number {
    return 1;
  }

  sfx(name: SfxName, volume = 1): void {
    if (this.settings.sfx) audio.play(name, volume);
  }
  shake(amount: number, decay = 4): void {
    this.camera.shake(this.settings.shake ? amount : amount * 0.25, decay);
  }
  hitstop(seconds: number): void {
    this.hitstopTimer = Math.max(this.hitstopTimer, seconds);
  }
  glitch(amount: number, seconds: number): void {
    this.glitchAmount = Math.max(this.glitchAmount, amount);
    this.glitchTimer = Math.max(this.glitchTimer, seconds);
  }
  flash(color: string, alpha: number, seconds: number): void {
    this.flashColor = color;
    this.flashAlpha = alpha;
    this.flashTimer = seconds;
    this.flashMax = seconds;
  }
  distToPlayer(x: number, y: number): number {
    return dist(x, y, this.player.x, this.player.y);
  }
  angleToPlayer(x: number, y: number): number {
    return Math.atan2(this.player.y - y, this.player.x - x);
  }
  canSeePlayer(x: number, y: number): boolean {
    return this.map.lineOfSight(x, y, this.player.x, this.player.y);
  }

  /**
   * Called once per animation frame with the real wall-clock delta. If a device
   * cannot keep up, the most expensive effect (full-screen bloom) is switched
   * off once, rather than letting the whole game stutter.
   */
  reportFrameTime(ms: number): void {
    this.frameAvg = this.frameAvg * 0.92 + Math.min(ms, 100) * 0.08;
    if (this.qualityLowered || !this.settings.bloom || this.mode === 'title') return;
    if (this.frameAvg > 26) {
      this.slowFrames++;
      if (this.slowFrames > 120) {
        this.qualityLowered = true;
        this.settings.bloom = false;
        this.renderer.bloomEnabled = false;
        this.showToast('Resplandor desactivado para mantener la fluidez', C.cyan);
      }
    } else if (this.slowFrames > 0) {
      this.slowFrames--;
    }
  }

  bark(x: number, y: number, str: string, color = C.ui): void {
    this.barks.push({ x, y, text: str, color, life: 2.6, max: 2.6 });
    if (this.barks.length > 8) this.barks.shift();
  }

  say(lines: DialogueLine[], onDone?: () => void): void {
    if (!lines.length) {
      onDone?.();
      return;
    }
    this.dialogue = { lines: lines.slice(), index: 0, chars: 0, fade: 0, choice: 0, onDone };
  }

  setBossBar(name: string, hp: number, maxHp: number, phase: number, phases: number, subtitle?: string): void {
    this.bossBar = { name, hp, maxHp, phase, phases, subtitle, ttl: 0.4 };
  }
  clearBossBar(): void {
    this.bossBar = null;
  }

  // ------------------------------------------------------------ world spawns

  spawnProjectile(p: Partial<Projectile> & { x: number; y: number; vx: number; vy: number }): Projectile {
    let slot = this.projectiles.find((q) => !q.active);
    if (!slot) {
      slot = this.projectiles[0];
    }
    const b = Game.blankProjectile();
    slot.onExpire = undefined;
    Object.assign(slot, b, p);
    slot.active = true;
    slot.life = slot.maxLife;
    slot.hitIds = new Set();
    if (!p.angle) slot.angle = Math.atan2(slot.vy, slot.vx);
    return slot;
  }

  spawnZone(z: Partial<Zone> & { x: number; y: number }): Zone {
    let slot = this.zones.find((q) => !q.active);
    if (!slot) slot = this.zones[0];
    const b = Game.blankZone();
    Object.assign(slot, b, z);
    slot.active = true;
    slot.warnMax = Math.max(slot.warn, 0.0001);
    slot.liveMax = Math.max(slot.live, 0.0001);
    slot.hitIds = new Set();
    if (slot.warn > 0) this.sfx('telegraph', 0.35);
    return slot;
  }

  spawnEnemy(defId: string, x: number, y: number, opts: { elite?: boolean; boss?: boolean } = {}): EnemyLike | null {
    if (this.enemies.length > 42) return null;
    const spot = this.map.clampToFloor(x, y, ENEMY_DEFS[defId]?.radius ?? 14);
    const e = makeEnemy(defId, spot.x, spot.y, opts.elite);
    if (!e) return null;
    e.isBoss = opts.boss ?? BOSS_IDS.has(defId);
    this.enemies.push(e);
    this.fx.shockwave(spot.x, spot.y, 40, e.def.accent, 0.35, 2);
    return e;
  }

  spawnPickup(kind: string, x: number, y: number, value = 1): void {
    // Drops live in the room's item list so they behave like authored pickups.
    const spot = this.map.clampToFloor(x, y, 10);
    this.room.items.push({
      def: { kind: kind as Item['def']['kind'], tx: 0, ty: 0, value },
      x: spot.x,
      y: spot.y,
      taken: false,
      active: false,
      bob: rand(0, TAU),
      near: 0,
    });
  }

  healPlayer(amount: number): void {
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + amount);
  }

  damagePlayer(amount: number, fromX: number, fromY: number, opts: DamageOpts = {}): void {
    if (this.player.invulnerable) {
      // A dodge that ate an attack unlocks the riposte window.
      if (this.player.dashTimeActive) this.player.registerPerfectDodge();
      return;
    }
    this.player.hurt(amount, fromX, fromY, this, opts);
    if (this.player.dead) this.onPlayerDeath();
  }

  damageEnemy(target: EnemyLike, amount: number, opts: DamageOpts = {}): void {
    const e = target as Enemy;
    if (e.dead) return;
    if (e.data.invuln > 0) {
      this.fx.floatText(e.x, e.y - e.radius - 8, 'INMUNE', C.uiDim, 12);
      this.sfx('deny', 0.4);
      return;
    }
    // Illusions pop instead of taking damage.
    if (e.data.illusion) {
      e.hp = 0;
    } else {
      let mul = e.data.vuln ?? 1;
      if (opts.angle !== undefined) mul *= shieldFactor(e, opts.angle);
      const dmg = Math.max(1, Math.round(amount * mul));
      e.hurt(dmg, this);
      const isWeak = mul > 1.2;
      const blocked = mul < 0.5;
      this.fx.floatText(
        e.x + rand(-6, 6),
        e.y - e.radius - 6,
        blocked ? `${dmg}` : `${dmg}`,
        blocked ? C.uiDim : isWeak ? C.heal : e.isBoss ? C.white : C.pickup,
        blocked ? 12 : isWeak ? 18 : 14,
      );
      if (blocked) {
        this.sfx('deny', 0.5);
        this.fx.burst(e.x, e.y, 4, '#9fb0ff', { speed: 120, life: 0.25, size: 2 });
      }
    }
    const ang = opts.angle ?? Math.atan2(e.y - this.player.y, e.x - this.player.x);
    const kb = (opts.knockback ?? 160) * (1 - (e.def.weight ?? 0));
    e.vx += Math.cos(ang) * kb;
    e.vy += Math.sin(ang) * kb;
    if (opts.stagger) e.staggerTimer = Math.max(e.staggerTimer, opts.stagger * (1 - (e.def.weight ?? 0) * 0.6));
    if (opts.hitstop) this.hitstop(opts.hitstop);
    if (!opts.silent) {
      const col =
        opts.element === 'volt'
          ? C.violet
          : opts.element === 'gravity'
            ? C.amber
            : opts.element === 'phase'
              ? C.magenta
              : opts.element === 'resonance'
                ? C.energy
                : '#ffffff';
      this.fx.hit(
        e.x - Math.cos(ang) * e.radius * 0.5,
        e.y - Math.sin(ang) * e.radius * 0.5,
        ang,
        col,
        e.isBoss ? 1.4 : 1,
      );
      this.sfx(e.isBoss ? 'bossHit' : 'hit', 0.8);
    }
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy): void {
    if (e.dead) return;
    e.dead = true;
    e.hp = 0;
    enemyDeathFx(e, this);
    e.def.onDeath?.(e, this);
    this.progress.kills++;
    // Drops
    const [cmin, cmax] = e.def.credits;
    const credits = randInt(cmin, cmax);
    if (credits > 0) this.spawnPickup('credits', e.x + rand(-8, 8), e.y + rand(-8, 8), credits);
    if (chance(e.def.healChance * (this.player.hp / this.player.maxHp < 0.5 ? 1.8 : 1))) {
      this.spawnPickup('health', e.x + rand(-14, 14), e.y + rand(-14, 14));
    }
    if (chance(0.14)) this.spawnPickup('energy', e.x + rand(-14, 14), e.y + rand(-14, 14));

    if (e.isBoss) this.onBossDefeated(e.defId);
  }

  onBossDefeated(id: string): void {
    // The Sutura twins only count when both are gone.
    if (id === 'suturaFast' || id === 'suturaLong') {
      const other = this.enemies.find(
        (o) => !o.dead && (o.defId === 'suturaFast' || o.defId === 'suturaLong'),
      );
      if (other) return;
    }
    this.clearBossBar();
    this.shake(14, 2);
    this.hitstop(0.25);
    this.flash('#ffffff', 0.5, 0.5);
    this.sfx('bossRoar', 0.9);
    const roomKey = this.roomKey();
    if (!this.progress.bosses.includes(roomKey)) this.progress.bosses.push(roomKey);
    this.room.bossDefeated = true;
    // Let the death explosion breathe, then reward + outro. Driven by the game
    // clock rather than setTimeout so pausing holds it and a room change drops it.
    this.pendingReward = { def: this.room.def, t: 1.1 };
  }

  private grantReward(def: RoomDef): void {
    const r = def.reward;
    const finish = (): void => {
      if (def.bossOutro && STORY[def.bossOutro]) {
        this.say(STORY[def.bossOutro], () => this.afterReward(def));
      } else {
        this.afterReward(def);
      }
    };
    if (!r) {
      finish();
      return;
    }
    if (r.credits) {
      this.progress.credits += r.credits;
      this.showToast(`+¤${r.credits} créditos`, C.pickup);
    }
    if (r.fragment) {
      this.progress.fragments = Math.max(this.progress.fragments, r.fragment);
      this.sfx('shard');
      this.showToast(`FRAGMENTO ${r.fragment}/4 DEL PROTOCOLO FANTASMA`, C.ally);
      this.fx.shockwave(this.player.x, this.player.y, 220, C.ally, 0.9, 5);
    }
    if (r.upgrade) this.applyUpgrade(r.upgrade, false);
    finish();
  }

  private afterReward(def: RoomDef): void {
    if (def.reward?.weapon) {
      this.offerWeapon(def.reward.weapon);
    }
    if (def.boss === 'aurelion') {
      this.startEnding();
    }
  }

  // ---------------------------------------------------------------- progress

  showToast(msg: string, color = C.pickup): void {
    this.toast = msg;
    this.toastColor = color;
    this.toastTimer = 3.4;
  }

  applyUpgrade(id: string, announce = true, silent = false): void {
    const u = UPGRADES[id];
    if (!u) return;
    const owned = this.progress.upgrades[id] ?? 0;
    if (owned >= u.max) return;
    this.progress.upgrades[id] = owned + 1;
    const s = this.player.stats;
    switch (id) {
      case 'maxHp':
        s.maxHp += 25;
        this.player.maxHp = s.maxHp;
        this.player.hp = Math.min(s.maxHp, this.player.hp + 25);
        break;
      case 'healCharge':
        s.maxHealCharges += 1;
        s.healCharges += 1;
        break;
      case 'dodge':
        s.dodgeCooldown = Math.max(0.26, s.dodgeCooldown - 0.08);
        break;
      case 'damage':
        s.damageMul += 0.12;
        break;
      case 'energy':
        s.energyRegen += 6;
        break;
    }
    if (silent) return;
    this.sfx('shard', 0.7);
    if (announce) this.showToast(`MEJORA: ${u.name}`, u.color);
    this.fx.shockwave(this.player.x, this.player.y, 140, u.color, 0.6, 4);
  }

  offerWeapon(weaponId: string, onClose?: () => void): void {
    const p = this.player;
    if (p.owned.has(weaponId) && p.slots.includes(weaponId)) {
      onClose?.();
      return;
    }
    const free = p.slots.findIndex((s) => s === null);
    if (free >= 0) {
      p.giveWeapon(weaponId, free);
      this.progress.owned = Array.from(p.owned);
      this.progress.slots = p.slots.slice();
      this.showToast(`ARMA EQUIPADA: ${WEAPONS[weaponId].name}`, WEAPONS[weaponId].color);
      this.sfx('pickup');
      onClose?.();
      return;
    }
    const options = [
      { label: `Ranura 1`, slot: 0 },
      { label: `Ranura 2`, slot: 1 },
      { label: 'No cogerla', slot: -1 },
    ];
    this.weaponPrompt = { weaponId, index: 0, options, onClose };
    this.sfx('confirm');
  }

  private roomKey(levelId = this.level.id, roomId = this.room.def.id): string {
    return `${levelId}/${roomId}`;
  }

  private getRoom(levelId: string, roomId: string): Room {
    const key = `${levelId}/${roomId}`;
    let r = this.rooms.get(key);
    if (!r) {
      const def = LEVELS[levelId].rooms.find((x) => x.id === roomId);
      if (!def) throw new Error('Sala desconocida: ' + key);
      r = new Room(def);
      this.rooms.set(key, r);
    }
    return r;
  }

  private snapshot(): Progress {
    const p = this.player;
    return {
      fragments: this.progress.fragments,
      credits: this.progress.credits,
      kills: this.progress.kills,
      deaths: this.progress.deaths,
      upgrades: { ...this.progress.upgrades },
      consumed: this.progress.consumed.slice(),
      cleared: this.progress.cleared.slice(),
      bosses: this.progress.bosses.slice(),
      owned: Array.from(p.owned),
      slots: p.slots.slice(),
      activeSlot: p.active,
      hazardsOff: this.progress.hazardsOff.slice(),
      nodes: this.progress.nodes.slice(),
    };
  }

  saveCheckpoint(): void {
    this.checkpoint = {
      levelId: this.level.id,
      roomId: this.room.def.id,
      progress: this.snapshot(),
    };
  }

  private restoreCheckpoint(): void {
    const cp = this.checkpoint;
    // Rebuild every room so uncleared encounters are fresh again.
    this.rooms.clear();
    if (!cp) {
      this.progress = Game.emptyProgress();
      this.resetPlayerStats();
      this.loadLevel('prologue', 'p1', null, false);
      return;
    }
    this.progress = {
      ...cp.progress,
      upgrades: { ...cp.progress.upgrades },
      consumed: cp.progress.consumed.slice(),
      cleared: cp.progress.cleared.slice(),
      bosses: cp.progress.bosses.slice(),
      owned: cp.progress.owned.slice(),
      slots: cp.progress.slots.slice(),
      hazardsOff: cp.progress.hazardsOff.slice(),
      nodes: cp.progress.nodes.slice(),
    };
    this.resetPlayerStats();
    this.loadLevel(cp.levelId, cp.roomId, null, false);
  }

  private resetPlayerStats(): void {
    const p = this.player;
    p.stats = {
      maxHp: 100,
      healCharges: 3,
      maxHealCharges: 3,
      healAmount: 42,
      dodgeCooldown: 0.55,
      damageMul: 1,
      energyRegen: 17,
      credits: 0,
    };
    p.owned = new Set(this.progress.owned);
    p.slots = this.progress.slots.slice();
    p.active = this.progress.activeSlot;
    if (!p.slots[p.active]) p.active = p.slots[0] ? 0 : 1;
    // Re-apply every upgrade that was banked at the checkpoint.
    for (const [id, count] of Object.entries(this.progress.upgrades)) {
      const saved = count;
      this.progress.upgrades[id] = 0;
      for (let i = 0; i < saved; i++) this.applyUpgrade(id, false, true);
    }
    p.maxHp = p.stats.maxHp;
    p.reset(true);
  }

  // --------------------------------------------------------------- level flow

  newGame(): void {
    this.progress = Game.emptyProgress();
    this.checkpoint = null;
    this.rooms.clear();
    this.resetPlayerStats();
    this.mode = 'playing';
    this.loadLevel('prologue', 'p1', null, true);
    this.saveCheckpoint();
  }

  loadLevel(levelId: string, roomId: string, fromRoom: string | null, showCard = true): void {
    this.level = LEVELS[levelId];
    this.theme = THEMES[this.level.zone];
    this.enterRoom(roomId, fromRoom, showCard);
    if (showCard) {
      this.areaCardTitle = this.level.subtitle;
      this.areaCardSub = this.level.name;
      this.areaCardTimer = 3;
    }
  }

  enterRoom(roomId: string, fromRoom: string | null, showCard = false): void {
    const room = this.getRoom(this.level.id, roomId);
    this.room = room;
    this.theme = THEMES[room.def.zone] ?? this.theme;
    this.areaLabel = room.def.title ?? this.level.subtitle;

    // Restore persisted room state.
    const key = this.roomKey(this.level.id, roomId);
    room.cleared = this.progress.cleared.includes(key);
    room.bossDefeated = this.progress.bosses.includes(key);
    for (const it of room.items) {
      if (it.def.id && this.progress.consumed.includes(it.def.id)) it.taken = true;
      if (it.def.id && this.progress.nodes.includes(it.def.id)) it.active = true;
      if (it.def.kind === 'checkpoint' && this.checkpoint?.roomId === roomId) it.active = true;
      if (it.def.kind === 'lever' && it.def.id && this.progress.hazardsOff.includes(it.def.id)) {
        it.active = true;
      }
    }
    room.map.hazardEnabled = !this.progress.hazardsOff.some((h) => h.startsWith(this.level.id));

    // Fresh entity state per room.
    this.enemies.length = 0;
    for (const p of this.projectiles) p.active = false;
    for (const z of this.zones) z.active = false;
    this.barks.length = 0;
    this.fx.clear();
    this.clearBossBar();
    this.dimAmount = 0;

    const spot = room.spawnPointFrom(fromRoom);
    const safe = room.map.clampToFloor(spot.x, spot.y, this.player.radius);
    this.player.x = safe.x;
    this.player.y = safe.y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.facing = room.facingFrom(fromRoom);
    this.player.invuln = Math.max(this.player.invuln, 0.5);

    this.camera.setBounds(room.width, room.height);
    this.camera.snapTo(this.player.x, this.player.y);
    this.doorCooldown = 0.4;

    // Spawn encounters
    room.spawned = false;
    room.bossSpawned = false;
    if (!room.cleared && room.def.spawns?.length) {
      for (const s of room.def.spawns) {
        const e = makeEnemy(s.type, s.tx * TILE + TILE / 2, s.ty * TILE + TILE / 2, s.elite);
        if (e) {
          const p = room.map.clampToFloor(e.x, e.y, e.radius);
          e.x = p.x;
          e.y = p.y;
          e.homeX = p.x;
          e.homeY = p.y;
          this.enemies.push(e);
        }
      }
      room.spawned = true;
    }

    this.updateHazardSound();
    audio.setMusic({ ...this.theme.music });
    if (showCard && room.def.title) {
      this.areaCardTitle = room.def.title;
      this.areaCardSub = '';
      this.areaCardTimer = 2.4;
    }

    // Entry dialogue then boss intro.
    const startBoss = (): void => {
      if (room.def.boss && !room.bossDefeated && !room.bossSpawned) {
        room.bossSpawned = true;
        // The intro only plays the first time you walk into the arena.
        const intro = room.def.bossIntro && !room.bossIntroSeen ? STORY[room.def.bossIntro] : null;
        room.bossIntroSeen = true;
        const spawn = (): void => {
          const bx = room.width / 2;
          const by = room.height * 0.35;
          this.spawnEnemy(room.def.boss!, bx, by, { boss: true });
          if (room.def.boss2) this.spawnEnemy(room.def.boss2, bx + 120, by + 40, { boss: true });
          this.sfx('bossRoar');
          this.shake(10, 2);
          this.glitch(0.4, 0.6);
        };
        if (intro) this.say(intro, spawn);
        else spawn();
      }
    };
    if (room.def.onEnter && !room.introShown && STORY[room.def.onEnter]) {
      room.introShown = true;
      this.say(STORY[room.def.onEnter], startBoss);
    } else {
      startBoss();
    }
    this.updateObjective();
  }

  private transitionTo(target: string): void {
    if (this.pendingTransition) return;
    let levelId = this.level.id;
    let roomId = target;
    if (target.startsWith('level:')) {
      levelId = target.slice(6);
      roomId = LEVELS[levelId].entryRoom;
    }
    this.pendingTransition = {
      level: levelId,
      room: roomId,
      from: levelId === this.level.id ? this.room.def.id : null,
    };
    this.fadeDir = 1;
    this.sfx('door');
  }

  private updateHazardSound(): void {
    audio.setAmbience(this.theme.rain * 0.9 + 0.1, this.theme.id === 'acid' ? 3200 : 2400);
  }

  private updateObjective(): void {
    const room = this.room;
    if (room.def.boss && !room.bossDefeated) {
      const bossName = ENEMY_DEFS[room.def.boss]?.name ?? 'el guardián';
      this.objective = `Derrota a ${bossName}`;
    } else if (this.enemies.length > 0 && room.doors.some((d) => d.def.lock === 'cleared')) {
      this.objective = `Elimina a los hostiles (${this.enemies.length})`;
    } else if (room.doors.some((d) => d.def.lock === 'nodes' && !d.open)) {
      this.objective = 'Activa los nodos de energía';
    } else if (this.level.id === 'core') {
      this.objective = 'Llega al núcleo de AURELION';
    } else {
      this.objective = `Avanza · Protocolo ${this.progress.fragments}/4`;
    }
  }

  private onPlayerDeath(): void {
    this.progress.deaths++;
    this.deathLine = pick([
      'La ciudad no se dio cuenta.',
      'Alguien, en algún nivel, dejó de oírte.',
      'La señal sigue ahí. Espera.',
      'Nexus-9 respira. Tú, todavía no.',
    ]);
    this.deathIndex = 0;
    this.deathScreenTimer = 1.1;
    this.pendingReward = null;
  }

  private startEnding(): void {
    this.mode = 'ending';
    this.endingTimer = 0;
    audio.fadeMusic(0.25, 3);
    this.say(STORY.aurelionDefeat, () => {
      this.say(STORY.ending, () => {
        this.mode = 'credits';
        this.creditsTimer = 0;
      });
    });
  }

  // ------------------------------------------------------------------ update

  update(dtRaw: number): void {
    const dt = Math.min(dtRaw, 1 / 30);
    this.time += dt;
    this.input.update();
    if (this.input.anyPressed) audio.unlock();
    audio.update(dt);

    if (this.toastTimer > 0) this.toastTimer -= dt;
    if (this.areaCardTimer > 0) this.areaCardTimer -= dt;
    if (this.flashTimer > 0) this.flashTimer -= dt;
    if (this.glitchTimer > 0) {
      this.glitchTimer -= dt;
      if (this.glitchTimer <= 0) this.glitchAmount = 0;
    }

    switch (this.mode) {
      case 'title':
        this.updateTitle(dt);
        break;
      case 'playing':
        this.updatePlaying(dt);
        break;
      case 'dead':
        this.updateDead(dt);
        break;
      case 'ending':
        this.endingTimer += dt;
        this.updateDialogue(dt);
        break;
      case 'credits':
        this.creditsTimer += dt;
        if (this.input.pressed('confirm') || this.input.pressed('interact')) {
          this.mode = 'title';
          this.titleIndex = 0;
          audio.fadeMusic(1, 2);
        }
        break;
    }

    this.backdrop.update(dt, this.theme);
    this.fx.update(dt);
    this.camera.update(dt);
  }

  private updateTitle(dt: number): void {
    void dt;
    const i = this.input;
    if (i.pressed('up')) {
      this.titleIndex = (this.titleIndex + this.titleOptions.length - 1) % this.titleOptions.length;
      this.sfx('menu');
    }
    if (i.pressed('down')) {
      this.titleIndex = (this.titleIndex + 1) % this.titleOptions.length;
      this.sfx('menu');
    }
    if (this.titleIndex === 2) {
      if (i.pressed('left') || i.pressed('right')) {
        this.toggleSetting(this.optionIndex);
      }
      if (i.pressed('swap')) this.optionIndex = (this.optionIndex + 1) % 4;
    }
    if (i.pressed('confirm') || i.pressed('interact') || i.pressed('attack')) {
      if (this.titleIndex === 0) {
        this.sfx('confirm');
        audio.unlock();
        this.newGame();
      } else if (this.titleIndex === 2) {
        this.toggleSetting(this.optionIndex);
        this.optionIndex = (this.optionIndex + 1) % 4;
      } else {
        this.sfx('menu');
      }
    }
  }

  private toggleSetting(index: number): void {
    const keys = ['music', 'sfx', 'bloom', 'shake'] as const;
    const k = keys[index] ?? 'music';
    this.settings[k] = !this.settings[k];
    if (k === 'music') audio.setMusicVolume(this.settings.music ? 0.5 : 0);
    if (k === 'sfx') audio.setSfxVolume(this.settings.sfx ? 0.7 : 0);
    if (k === 'bloom') this.renderer.bloomEnabled = this.settings.bloom;
    this.sfx('menu');
  }

  private updateDead(dt: number): void {
    this.deathFade = Math.min(1, this.deathFade + dt * 2.4);
    const i = this.input;
    if (i.pressed('up') || i.pressed('down')) {
      this.deathIndex = 1 - this.deathIndex;
      this.sfx('menu');
    }
    if (i.pressed('confirm') || i.pressed('interact')) {
      this.sfx('confirm');
      this.deathFade = 0;
      if (this.deathIndex === 0) {
        this.mode = 'playing';
        this.restoreCheckpoint();
      } else {
        this.mode = 'title';
        this.titleIndex = 0;
      }
    }
  }

  private updatePlaying(dt: number): void {
    const i = this.input;

    // --- fade / transition
    if (this.fadeDir !== 0) {
      this.fade += this.fadeDir * dt * 3.4;
      if (this.fade >= 1 && this.pendingTransition) {
        const t = this.pendingTransition;
        this.pendingTransition = null;
        if (t.level !== this.level.id) this.loadLevel(t.level, t.room, null, true);
        else this.enterRoom(t.room, t.from, true);
        this.fadeDir = -1;
      } else if (this.fade <= 0) {
        this.fade = 0;
        this.fadeDir = 0;
      }
      this.fade = clamp(this.fade, 0, 1);
    }
    if (this.doorCooldown > 0) this.doorCooldown -= dt;

    // --- deferred boss reward (survives dialogue, dies with the room)
    if (this.pendingReward) {
      if (this.pendingReward.def !== this.room.def || this.player.dead) {
        this.pendingReward = null;
      } else {
        this.pendingReward.t -= dt;
        if (this.pendingReward.t <= 0) {
          const def = this.pendingReward.def;
          this.pendingReward = null;
          this.grantReward(def);
        }
      }
    }

    // --- death screen appears a beat after the hit that killed you
    if (this.deathScreenTimer > 0 && this.player.dead) {
      this.deathScreenTimer -= dt;
      if (this.deathScreenTimer <= 0) {
        this.deathScreenTimer = 0;
        this.mode = 'dead';
      }
    }

    // --- modal layers, highest priority first
    if (this.weaponPrompt) {
      this.updateWeaponPrompt();
      return;
    }
    if (this.shop) {
      this.updateShop();
      return;
    }
    if (this.dialogue) {
      this.updateDialogue(dt);
      return;
    }
    if (this.paused) {
      this.updatePause();
      return;
    }
    if (i.pressed('pause')) {
      this.paused = true;
      this.pauseIndex = 0;
      audio.suspendForPause(true);
      this.sfx('menu');
      return;
    }

    // --- hitstop freezes simulation but keeps the frame alive
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      this.camera.follow(this.player.x, this.player.y, dt);
      return;
    }

    const alive = !this.player.dead;
    this.player.update(dt, i, this, this.map, alive && this.fadeDir === 0);

    for (const e of this.enemies) e.update(dt, this, this.map);
    this.separateEnemies();
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updateContacts(dt);
    this.updateItems(dt);
    this.updateRoomState(dt);

    for (const b of this.barks) b.life -= dt;
    this.barks = this.barks.filter((b) => b.life > 0);

    // Ambient flavour lines keep the city talking without spam.
    this.ambientTimer -= dt;
    if (this.ambientTimer <= 0) {
      this.ambientTimer = rand(22, 40);
      const pool = AMBIENT_BARKS[this.theme.id];
      if (pool && this.enemies.length === 0 && chance(0.7)) {
        this.bark(this.player.x, this.player.y - 38, pick(pool), withAlpha(C.uiDim, 0.9));
      }
    }

    // Music intensity follows the fight.
    const boss = this.enemies.some((e) => e.isBoss && !e.dead);
    const intensity = boss ? 1 : Math.min(0.75, this.enemies.length * 0.18);
    audio.setIntensity(intensity);

    this.camera.follow(this.player.x, this.player.y, dt);
    if (this.bossBar) {
      this.bossBar.ttl -= dt;
      if (this.bossBar.ttl <= 0) this.bossBar = null;
    }
  }

  private updatePause(): void {
    const i = this.input;
    if (i.pressed('up')) {
      this.pauseIndex = (this.pauseIndex + this.pauseOptions.length - 1) % this.pauseOptions.length;
      this.sfx('menu');
    }
    if (i.pressed('down')) {
      this.pauseIndex = (this.pauseIndex + 1) % this.pauseOptions.length;
      this.sfx('menu');
    }
    const close = (): void => {
      this.paused = false;
      audio.suspendForPause(false);
    };
    if (i.pressed('pause')) {
      close();
      this.sfx('menu');
      return;
    }
    if (i.pressed('confirm') || i.pressed('interact')) {
      switch (this.pauseIndex) {
        case 0:
          close();
          break;
        case 1:
          this.toggleSetting(0);
          break;
        case 2:
          this.toggleSetting(1);
          break;
        case 3:
          this.toggleSetting(2);
          break;
        case 4:
          this.toggleSetting(3);
          break;
        case 5:
          close();
          this.restoreCheckpoint();
          break;
        case 6:
          close();
          this.mode = 'title';
          this.titleIndex = 0;
          break;
      }
    }
  }

  private updateWeaponPrompt(): void {
    const wp = this.weaponPrompt!;
    const i = this.input;
    if (i.pressed('up')) {
      wp.index = (wp.index + wp.options.length - 1) % wp.options.length;
      this.sfx('menu');
    }
    if (i.pressed('down')) {
      wp.index = (wp.index + 1) % wp.options.length;
      this.sfx('menu');
    }
    if (i.pressed('confirm') || i.pressed('interact')) {
      const opt = wp.options[wp.index];
      if (opt.slot >= 0) {
        this.player.giveWeapon(wp.weaponId, opt.slot);
        this.player.active = opt.slot;
        this.progress.owned = Array.from(this.player.owned);
        this.progress.slots = this.player.slots.slice();
        this.progress.activeSlot = this.player.active;
        this.showToast(`EQUIPADA: ${WEAPONS[wp.weaponId].name}`, WEAPONS[wp.weaponId].color);
        this.sfx('pickup');
      } else {
        this.sfx('deny');
      }
      const done = wp.onClose;
      this.weaponPrompt = null;
      done?.();
    }
    if (i.pressed('cancel')) {
      const done = wp.onClose;
      this.weaponPrompt = null;
      this.sfx('deny');
      done?.();
    }
  }

  private updateShop(): void {
    const s = this.shop!;
    const i = this.input;
    if (i.pressed('up')) {
      s.index = (s.index + s.items.length - 1) % s.items.length;
      this.sfx('menu');
    }
    if (i.pressed('down')) {
      s.index = (s.index + 1) % s.items.length;
      this.sfx('menu');
    }
    if (i.pressed('confirm') || i.pressed('interact')) {
      const id = s.items[s.index];
      const u = UPGRADES[id];
      const owned = this.progress.upgrades[id] ?? 0;
      if (owned >= u.max) {
        this.sfx('deny');
      } else if (this.progress.credits < u.price) {
        this.sfx('deny');
        this.showToast('Créditos insuficientes', C.danger);
      } else {
        this.progress.credits -= u.price;
        this.applyUpgrade(id);
        this.sfx('confirm');
      }
    }
    if (i.pressed('cancel') || i.pressed('pause')) {
      this.shop = null;
      this.sfx('menu');
    }
  }

  private updateDialogue(dt: number): void {
    const d = this.dialogue;
    if (!d) return;
    const i = this.input;
    d.fade = Math.min(1, d.fade + dt * 6);
    const line = d.lines[d.index];
    const speed = i.down('interact') || i.down('attack') ? 190 : 58;
    if (d.chars < line.text.length) {
      const before = Math.floor(d.chars);
      d.chars = Math.min(line.text.length, d.chars + speed * dt);
      if (Math.floor(d.chars) > before && Math.floor(d.chars) % 3 === 0) this.sfx('talk', 0.5);
    }

    if (line.choices && d.chars >= line.text.length) {
      if (i.pressed('up')) {
        d.choice = (d.choice + line.choices.length - 1) % line.choices.length;
        this.sfx('menu');
      }
      if (i.pressed('down')) {
        d.choice = (d.choice + 1) % line.choices.length;
        this.sfx('menu');
      }
    }

    const advance = (): void => {
      if (d.chars < line.text.length) {
        d.chars = line.text.length;
        return;
      }
      if (line.choices) {
        const chosen = line.choices[d.choice];
        const reply = PLAYER_CHOICE_REPLIES[chosen];
        // Show the chosen answer as Vanta's own line, then any scripted reply.
        d.lines.splice(d.index + 1, 0, ...(reply ?? []));
        d.lines[d.index] = { ...line, text: chosen, choices: undefined };
      }
      d.index++;
      d.chars = 0;
      d.choice = 0;
      if (d.index >= d.lines.length) {
        const cb = d.onDone;
        this.dialogue = null;
        cb?.();
        this.updateObjective();
      }
    };

    if (i.pressed('interact') || i.pressed('confirm') || i.pressed('attack')) advance();
    if (i.pressed('pause') || i.pressed('cancel')) {
      const cb = d.onDone;
      this.dialogue = null;
      cb?.();
      this.updateObjective();
      this.sfx('menu');
    }
  }

  // ------------------------------------------------------------- simulation

  private separateEnemies(): void {
    const list = this.enemies;
    for (let a = 0; a < list.length; a++) {
      const A = list[a];
      if (A.dead) continue;
      for (let b = a + 1; b < list.length; b++) {
        const B = list[b];
        if (B.dead) continue;
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const d2 = dx * dx + dy * dy;
        const minD = A.radius + B.radius;
        if (d2 >= minD * minD || d2 < 0.001) continue;
        const d = Math.sqrt(d2);
        const push = (minD - d) * 0.5;
        const nx = dx / d;
        const ny = dy / d;
        const wa = A.isBoss ? 0 : 1;
        const wb = B.isBoss ? 0 : 1;
        const total = wa + wb || 1;
        A.x -= nx * push * (wa / total) * 2;
        A.y -= ny * push * (wa / total) * 2;
        B.x += nx * push * (wb / total) * 2;
        B.y += ny * push * (wb / total) * 2;
      }
    }
  }

  private updateProjectiles(dt: number): void {
    const p = this.player;
    for (const pr of this.projectiles) {
      if (!pr.active) continue;
      pr.life -= dt;
      if (pr.life <= 0) {
        this.expireProjectile(pr);
        continue;
      }
      if (pr.homing > 0 && pr.faction === 'enemy' && !p.dead) {
        const a = Math.atan2(p.y - pr.y, p.x - pr.x);
        const sp = Math.hypot(pr.vx, pr.vy);
        const ca = Math.atan2(pr.vy, pr.vx);
        const na = ca + Math.max(-pr.homing * dt, Math.min(pr.homing * dt, Math.atan2(Math.sin(a - ca), Math.cos(a - ca))));
        pr.vx = Math.cos(na) * sp;
        pr.vy = Math.sin(na) * sp;
      }
      if (pr.fuse > 0) {
        // Grenades slow to a halt before detonating.
        pr.vx *= Math.exp(-2.6 * dt);
        pr.vy *= Math.exp(-2.6 * dt);
      }
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.angle = pr.spin ? pr.angle + pr.spin * dt : Math.atan2(pr.vy, pr.vx);

      if (this.map.solidAtPixel(pr.x, pr.y)) {
        this.expireProjectile(pr, true);
        continue;
      }
      if (pr.x < -40 || pr.y < -40 || pr.x > this.room.width + 40 || pr.y > this.room.height + 40) {
        pr.active = false;
        continue;
      }

      if (pr.faction === 'enemy') {
        // Gravity gauntlet shield converts nearby shots.
        if (p.shieldTimer > 0 && pr.deflectable && dist(pr.x, pr.y, p.x, p.y) < 58) {
          pr.faction = 'player';
          pr.color = C.amber;
          pr.damage *= 1.6;
          const a = Math.atan2(pr.y - p.y, pr.x - p.x);
          const sp = Math.hypot(pr.vx, pr.vy) * 1.5;
          pr.vx = Math.cos(a) * sp;
          pr.vy = Math.sin(a) * sp;
          pr.hitIds.clear();
          this.sfx('parry', 0.8);
          this.fx.burst(pr.x, pr.y, 8, C.amber, { speed: 200, life: 0.3 });
          continue;
        }
        if (!p.dead && dist(pr.x, pr.y, p.x, p.y) < pr.radius + p.radius) {
          if (p.invulnerable) {
            if (p.dashTimeActive) p.registerPerfectDodge();
          } else {
            this.damagePlayer(pr.damage, pr.x, pr.y, { knockback: 220 });
            this.expireProjectile(pr, true);
            continue;
          }
        }
      } else {
        let consumed = false;
        for (const e of this.enemies) {
          if (e.dead || pr.hitIds.has(e.id)) continue;
          if (dist(pr.x, pr.y, e.x, e.y) > pr.radius + e.radius) continue;
          pr.hitIds.add(e.id);
          const ang = Math.atan2(pr.vy, pr.vx);
          this.damageEnemy(e, pr.damage, {
            angle: ang,
            knockback: 140,
            element: pr.kind === 'spear' ? 'physical' : 'resonance',
            hitstop: 0.02,
          });
          if (pr.kind === 'spear' && !e.isBoss && !e.elite) {
            e.pinTimer = Math.max(e.pinTimer, 0.9);
          }
          if (pr.pierce > 0) {
            pr.pierce--;
          } else {
            this.expireProjectile(pr, true);
            consumed = true;
            break;
          }
        }
        if (consumed) continue;
        // Player shots activate cathedral nodes.
        for (const it of this.room.items) {
          if (it.def.kind !== 'node' || it.active) continue;
          if (dist(pr.x, pr.y, it.x, it.y) < pr.radius + 18) this.activateNode(it);
        }
      }
    }
  }

  private expireProjectile(pr: Projectile, impact = false): void {
    pr.active = false;
    if (pr.explodeRadius > 0) {
      this.spawnZone({
        x: pr.x,
        y: pr.y,
        radius: pr.explodeRadius,
        shape: 'circle',
        faction: pr.faction,
        warn: 0,
        live: 0.18,
        damage: pr.explodeDamage,
        mode: 'burst',
        color: pr.color,
        knockback: 300,
      });
      this.fx.shockwave(pr.x, pr.y, pr.explodeRadius, pr.color, 0.4, 4);
      this.fx.burst(pr.x, pr.y, 16, pr.color, { speed: 260, life: 0.45 });
      this.sfx('explode', 0.55);
      this.shake(4);
    } else if (impact) {
      this.fx.burst(pr.x, pr.y, 5, pr.color, { speed: 130, life: 0.22, size: 2 });
    }
    pr.onExpire?.(this, pr);
    pr.onExpire = undefined;
  }

  private zoneHits(z: Zone, x: number, y: number, r: number): boolean {
    switch (z.shape) {
      case 'circle':
        return dist(x, y, z.x, z.y) < z.radius + r;
      case 'ring': {
        const d = dist(x, y, z.x, z.y);
        return Math.abs(d - z.radius) < z.halfW + r;
      }
      case 'cone':
        return circleInArc(z.x, z.y, z.angle, z.halfW, z.radius, x, y, r);
      case 'rect': {
        const dx = x - z.x;
        const dy = y - z.y;
        const cos = Math.cos(z.angle);
        const sin = Math.sin(z.angle);
        const along = dx * cos + dy * sin;
        const perp = -dx * sin + dy * cos;
        return along > -r && along < z.len + r && Math.abs(perp) < z.halfW + r;
      }
    }
  }

  private updateZones(dt: number): void {
    const p = this.player;
    for (const z of this.zones) {
      if (!z.active) continue;
      if (z.follow) {
        z.x = z.follow.x;
        z.y = z.follow.y;
        if (z.shape === 'cone') z.angle = (z.follow as unknown as Enemy).facing ?? z.angle;
      }
      if (z.warn > 0) {
        z.warn -= dt;
        if (z.warn <= 0) {
          z.onFire?.(this);
          if (z.mode === 'burst') this.sfx('explode', 0.28);
        }
        continue;
      }
      z.live -= dt;
      if (z.live <= 0) {
        z.active = false;
        continue;
      }
      z.tick -= dt;
      const ticking = z.mode === 'field' && z.tick <= 0;
      if (ticking) z.tick = 0.5;

      if (z.faction === 'enemy') {
        if (p.dead) continue;
        if (!this.zoneHits(z, p.x, p.y, p.radius)) continue;
        if (p.invulnerable) {
          if (p.dashTimeActive) p.registerPerfectDodge();
          continue;
        }
        if (z.mode === 'burst') {
          if (z.hitIds.has(-1)) continue;
          z.hitIds.add(-1);
          this.damagePlayer(z.damage, z.x, z.y, { knockback: z.knockback });
        } else if (ticking) {
          this.damagePlayer(z.damage, z.x, z.y, { knockback: 0 });
        }
        if (z.slow > 0) p.vx *= 1 - z.slow * 0.5;
      } else {
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (z.mode === 'burst' && z.hitIds.has(e.id)) continue;
          if (!this.zoneHits(z, e.x, e.y, e.radius)) continue;
          if (z.mode === 'burst') z.hitIds.add(e.id);
          else if (!ticking) continue;
          this.damageEnemy(e, z.damage, {
            angle: Math.atan2(e.y - z.y, e.x - z.x),
            knockback: z.knockback,
            element: 'volt',
          });
          if (z.root > 0) e.rootTimer = Math.max(e.rootTimer, z.root);
          if (z.slow > 0) e.slowTimer = Math.max(e.slowTimer, 1.2);
        }
      }
    }
  }

  private updateContacts(dt: number): void {
    const p = this.player;
    if (p.dead) return;
    // Contact damage + physical push-out so enemies never sit inside the player.
    for (const e of this.enemies) {
      if (e.dead || e.spawnTimer > 0) continue;
      const d = dist(e.x, e.y, p.x, p.y);
      const minD = e.radius + p.radius;
      if (d >= minD) continue;
      if (e.contactDamage > 0 && !p.invulnerable) {
        this.damagePlayer(e.contactDamage, e.x, e.y, { knockback: 240 });
      } else if (p.invulnerable && p.dashTimeActive && e.contactDamage > 0) {
        p.registerPerfectDodge();
      }
      if (!e.isBoss) {
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        const push = (minD - d) * 0.6;
        e.x += Math.cos(a) * push;
        e.y += Math.sin(a) * push;
      }
    }
    // Environmental hazards
    if (this.map.hazardAtPixel(p.x, p.y)) {
      this.hazardTick = (this.hazardTick ?? 0) - dt;
      if (this.hazardTick <= 0) {
        this.hazardTick = 0.55;
        this.damagePlayer(7, p.x, p.y + 20, { knockback: 40 });
      }
      if (chance(0.4)) {
        this.fx.spawn({
          kind: 'spark',
          x: p.x + rand(-12, 12),
          y: p.y + rand(-8, 12),
          vx: rand(-30, 30),
          vy: rand(-60, -20),
          maxLife: 0.4,
          size: 2,
          color: this.theme.accent,
          drag: 2,
        });
      }
    } else {
      this.hazardTick = 0;
    }
  }
  private hazardTick = 0;

  private updateItems(dt: number): void {
    const p = this.player;
    const room = this.room;
    let near: Item | null = null;
    for (const it of room.items) {
      if (it.taken) continue;
      const d = dist(it.x, it.y, p.x, p.y);
      const auto =
        it.def.kind === 'credits' ||
        it.def.kind === 'health' ||
        it.def.kind === 'energy' ||
        it.def.kind === 'healCharge';
      if (auto) {
        if (d < 30) this.collect(it);
        else if (d < 110) {
          // Gentle magnetism so drops never feel fiddly.
          const a = Math.atan2(p.y - it.y, p.x - it.x);
          it.x += Math.cos(a) * 150 * dt;
          it.y += Math.sin(a) * 150 * dt;
        }
        continue;
      }
      if (it.def.kind === 'node') continue;
      if (d < 48 && (!near || d < dist(near.x, near.y, p.x, p.y))) near = it;
    }
    for (const it of room.items) it.near = Math.max(0, it.near - dt * 4);
    if (near) {
      near.near = 1;
      if (this.input.pressed('interact')) this.interact(near);
    }
    // Melee can also trigger nodes.
    for (const it of room.items) {
      if (it.def.kind !== 'node' || it.active) continue;
      it.near = 1;
      const swing = p.activeSwingInfo;
      if (swing && circleInArc(p.x, p.y, swing.angle, swing.half, swing.reach, it.x, it.y, 16)) {
        this.activateNode(it);
      }
    }
  }

  private activateNode(it: Item): void {
    if (it.active) return;
    it.active = true;
    if (it.def.id) this.progress.nodes.push(it.def.id);
    this.sfx('confirm');
    this.fx.shockwave(it.x, it.y, 90, C.heal, 0.5, 3);
    this.fx.burst(it.x, it.y, 16, C.heal, { speed: 220, life: 0.5 });
    const remaining = this.room.items.filter((o) => o.def.kind === 'node' && !o.active).length;
    if (remaining === 0) {
      this.showToast('Campo de seguridad desactivado', C.heal);
      this.sfx('door');
      this.say(STORY.nodesDone);
    } else {
      this.showToast(`Nodos restantes: ${remaining}`, C.cyan);
    }
  }

  private collect(it: Item): void {
    it.taken = true;
    if (it.def.id) this.progress.consumed.push(it.def.id);
    switch (it.def.kind) {
      case 'credits': {
        const v = it.def.value ?? 10;
        this.progress.credits += v;
        this.fx.floatText(it.x, it.y - 12, `+¤${v}`, C.pickup, 14);
        this.sfx('pickup', 0.7);
        break;
      }
      case 'health':
        this.healPlayer(30);
        this.fx.floatText(it.x, it.y - 12, '+30', C.heal, 15);
        this.sfx('heal', 0.7);
        break;
      case 'energy':
        this.player.energy = Math.min(this.player.maxEnergy, this.player.energy + 45);
        this.fx.floatText(it.x, it.y - 12, '+CARGA', C.energy, 13);
        this.sfx('pickup', 0.6);
        break;
      case 'healCharge':
        this.player.stats.maxHealCharges += 1;
        this.player.stats.healCharges += 1;
        this.showToast('Carga de curación permanente +1', C.heal);
        this.sfx('shard', 0.7);
        break;
    }
  }

  private interact(it: Item): void {
    switch (it.def.kind) {
      case 'checkpoint':
        if (!it.active) {
          for (const o of this.room.items) if (o.def.kind === 'checkpoint') o.active = false;
          it.active = true;
        }
        this.player.hp = this.player.maxHp;
        this.player.stats.healCharges = this.player.stats.maxHealCharges;
        this.player.energy = this.player.maxEnergy;
        this.saveCheckpoint();
        this.showToast('Anclaje guardado · vida y curas restauradas', C.cyan);
        this.sfx('shard', 0.8);
        this.fx.shockwave(it.x, it.y, 140, C.cyan, 0.7, 4);
        if (!this.progress.consumed.includes('firstCheckpoint')) {
          this.progress.consumed.push('firstCheckpoint');
          this.say(STORY.checkpointFirst);
        }
        break;
      case 'weapon':
        this.offerWeapon(it.def.arg!, () => {
          if (this.player.slots.includes(it.def.arg!)) {
            it.taken = true;
            if (it.def.id) this.progress.consumed.push(it.def.id);
          }
        });
        break;
      case 'upgrade':
        this.applyUpgrade(it.def.arg!);
        it.taken = true;
        if (it.def.id) this.progress.consumed.push(it.def.id);
        break;
      case 'npc':
        this.say(STORY[it.def.arg!] ?? []);
        this.sfx('confirm', 0.6);
        break;
      case 'vendor':
        this.shop = {
          items: ['maxHp', 'healCharge', 'dodge', 'damage', 'energy'],
          index: 0,
        };
        this.sfx('confirm');
        break;
      case 'terminal':
        this.say(STORY[it.def.arg!] ?? []);
        this.sfx('menu');
        break;
      case 'lever':
        if (!it.active) {
          it.active = true;
          this.map.hazardEnabled = false;
          if (it.def.id) this.progress.hazardsOff.push(this.level.id + ':' + it.def.id);
          this.sfx('door');
          this.say(STORY[it.def.arg!] ?? []);
          this.showToast('Fugas industriales desactivadas', C.lime);
        }
        break;
    }
  }

  private updateRoomState(dt: number): void {
    void dt;
    const room = this.room;
    this.enemies = this.enemies.filter((e) => !e.dead || e.deathTimer < 0.9);
    const liveEnemies = this.enemies.filter((e) => !e.dead && !e.data.illusion).length;
    if (!room.cleared && room.spawned && liveEnemies === 0 && !room.def.boss) {
      room.cleared = true;
      const key = this.roomKey();
      if (!this.progress.cleared.includes(key)) this.progress.cleared.push(key);
      this.sfx('confirm', 0.7);
      this.showToast('Zona despejada', C.heal);
    }
    const nodes = room.items.filter((i) => i.def.kind === 'node');
    const nodesDone = nodes.length === 0 || nodes.every((n) => n.active);
    const bossAlive = this.enemies.some((e) => e.isBoss && !e.dead);
    // The arena stays sealed while the boss lives *and* through the reward beat,
    // so nobody walks into the next level before the fragment is handed over.
    const sealed = (bossAlive && !room.bossDefeated) || this.pendingReward?.def === room.def;
    room.updateLocks(room.bossDefeated || !room.def.boss, liveEnemies, nodesDone, sealed);
    this.updateObjective();

    // Door transitions
    if (this.doorCooldown <= 0 && this.fadeDir === 0 && !this.player.dead) {
      const d = room.doorAt(this.player.x, this.player.y);
      if (d && d.open) this.transitionTo(d.def.to);
    }

    // Mnemosyne dims the arena in phase 2+.
    const dimmer = this.enemies.find((e) => e.data.dim === 1 && !e.dead);
    this.dimAmount = clamp(this.dimAmount + (dimmer ? 1 : -1) * dt * 1.5, 0, 0.72);
  }

  // ------------------------------------------------------------------ render

  render(): void {
    const ctx = this.renderer.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    this.backdrop.drawSky(ctx, this.theme, this.camera);

    if (this.mode === 'ending') {
      drawEnding(ctx, this);
      drawDialogue(ctx, this);
      this.renderer.present();
      return;
    }
    if (this.mode === 'credits') {
      drawCredits(ctx, this);
      this.renderer.present();
      return;
    }

    if (this.mode === 'title') {
      drawTitleAmbience(ctx, this.time);
      this.backdrop.drawWeather(ctx, this.theme);
      drawTitle(ctx, this);
      this.backdrop.drawGrade(ctx, 0.7);
      this.renderer.present();
      return;
    }

    // ---- world
    ctx.save();
    this.camera.apply(ctx);
    const view = {
      left: this.camera.left,
      top: this.camera.top,
      right: this.camera.right,
      bottom: this.camera.bottom,
    };
    this.room.map.drawStatic(ctx, this.theme);
    this.room.map.drawDynamic(ctx, this.theme, this.time, view);
    this.room.drawLights(ctx, this.time);
    this.room.drawProps(ctx, this.theme, this.time);
    this.room.drawDoors(ctx, this.theme, this.time);
    this.drawZones(ctx);
    this.room.drawItems(ctx, this.time);

    // Entities sorted back-to-front for a believable overlap.
    const drawables: { y: number; draw: () => void }[] = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (!this.camera.visible(e.x, e.y, e.radius + 80)) continue;
      drawables.push({ y: e.y, draw: () => e.draw(ctx, this.time) });
    }
    if (!this.player.dead || this.player.deathTimer < 1.4) {
      drawables.push({ y: this.player.y, draw: () => this.player.draw(ctx, this.time) });
    }
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    this.drawProjectiles(ctx);
    this.fx.draw(ctx);
    drawBarks(ctx, this);

    // Arena dimming (Mnemosyne phase 2): a lantern around the player.
    if (this.dimAmount > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      const g = ctx.createRadialGradient(
        this.player.x,
        this.player.y,
        60,
        this.player.x,
        this.player.y,
        320,
      );
      g.addColorStop(0, 'rgba(4,2,10,0)');
      g.addColorStop(1, `rgba(4,2,10,${this.dimAmount})`);
      ctx.fillStyle = g;
      ctx.fillRect(view.left - 40, view.top - 40, VIEW_W + 80, VIEW_H + 80);
      ctx.restore();
    }
    ctx.restore();

    // ---- screen space
    this.backdrop.drawWeather(ctx, this.theme);
    this.backdrop.drawGrade(ctx, 1);

    if (this.flashTimer > 0) {
      ctx.save();
      ctx.globalAlpha = this.flashAlpha * (this.flashTimer / this.flashMax);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.restore();
    }

    drawHud(ctx, this);
    drawAreaCard(ctx, this);
    if (this.dialogue) drawDialogue(ctx, this);
    if (this.weaponPrompt) drawWeaponPrompt(ctx, this);
    if (this.shop) drawShop(ctx, this);
    if (this.paused) drawPause(ctx, this);
    if (this.mode === 'dead') drawDeath(ctx, this);

    if (this.fade > 0) {
      ctx.save();
      ctx.globalAlpha = this.fade;
      ctx.fillStyle = '#05030c';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.restore();
    }

    // Touch hint on first mobile frame
    if (this.input.lastDevice === 'touch' && this.time < 8 && this.mode === 'playing') {
      text(ctx, 'Stick izquierdo para moverte · botones a la derecha', VIEW_W / 2, VIEW_H - 96, {
        size: 11,
        color: withAlpha(C.uiDim, 0.75),
        align: 'center',
        weight: '700',
        font: FONT_MONO,
      });
    }

    if (this.glitchAmount > 0.01) {
      const snapshot = this.renderer.scene;
      drawGlitch(ctx, snapshot, this.glitchAmount * clamp(this.glitchTimer, 0, 1));
    }

    this.renderer.present();
  }

  private drawZones(ctx: CanvasRenderingContext2D): void {
    for (const z of this.zones) {
      if (!z.active) continue;
      const warning = z.warn > 0;
      const k = warning ? 1 - z.warn / z.warnMax : z.live / z.liveMax;
      const col = warning ? (z.faction === 'enemy' ? C.telegraph : z.color) : z.color;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const fillA = warning ? 0.1 + k * 0.18 : 0.3 * k;
      const strokeA = warning ? 0.5 + k * 0.45 : 0.85 * k;

      switch (z.shape) {
        case 'circle':
          ctx.fillStyle = withAlpha(col, fillA);
          ctx.beginPath();
          ctx.arc(z.x, z.y, warning ? z.radius * (0.35 + k * 0.65) : z.radius, 0, TAU);
          ctx.fill();
          ring(ctx, z.x, z.y, z.radius, warning ? 2 : 3, col, strokeA);
          if (!warning) glow(ctx, z.x, z.y, z.radius * 1.2, col, 0.18 * k);
          break;
        case 'ring':
          ring(ctx, z.x, z.y, z.radius, z.halfW * 2 * (warning ? k : 1), col, warning ? strokeA * 0.6 : strokeA);
          break;
        case 'cone':
          wedge(ctx, z.x, z.y, warning ? z.radius * (0.4 + k * 0.6) : z.radius, z.angle, z.halfW, 8);
          ctx.fillStyle = withAlpha(col, fillA);
          ctx.fill();
          ctx.strokeStyle = withAlpha(col, strokeA);
          ctx.lineWidth = warning ? 1.5 : 3;
          ctx.stroke();
          break;
        case 'rect': {
          ctx.save();
          ctx.translate(z.x, z.y);
          ctx.rotate(z.angle);
          const len = warning ? z.len * (0.35 + k * 0.65) : z.len;
          ctx.fillStyle = withAlpha(col, fillA);
          ctx.fillRect(0, -z.halfW, len, z.halfW * 2);
          ctx.strokeStyle = withAlpha(col, strokeA);
          ctx.lineWidth = warning ? 1.5 : 2.5;
          ctx.strokeRect(0, -z.halfW, len, z.halfW * 2);
          if (!warning) {
            ctx.fillStyle = withAlpha('#ffffff', 0.7 * k);
            ctx.fillRect(0, -z.halfW * 0.3, len, z.halfW * 0.6);
          }
          ctx.restore();
          break;
        }
      }
      ctx.restore();
    }
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.projectiles) {
      if (!p.active) continue;
      if (!this.camera.visible(p.x, p.y, p.size + 30)) continue;
      const a = clamp(p.life / p.maxLife, 0, 1);
      switch (p.kind) {
        case 'bolt':
        case 'plasma': {
          const len = p.kind === 'plasma' ? 30 : 18;
          line(
            ctx,
            p.x - Math.cos(p.angle) * len,
            p.y - Math.sin(p.angle) * len,
            p.x,
            p.y,
            p.size * 0.6,
            p.color,
            0.55,
          );
          disc(ctx, p.x, p.y, p.size * 0.45, withAlpha('#ffffff', 0.95));
          glow(ctx, p.x, p.y, p.size * 2.4, p.color, 0.55);
          break;
        }
        case 'needle':
          line(
            ctx,
            p.x - Math.cos(p.angle) * p.size,
            p.y - Math.sin(p.angle) * p.size,
            p.x + Math.cos(p.angle) * 4,
            p.y + Math.sin(p.angle) * 4,
            3,
            p.color,
            0.9,
          );
          glow(ctx, p.x, p.y, p.size, p.color, 0.4);
          break;
        case 'spear':
          line(
            ctx,
            p.x - Math.cos(p.angle) * p.size,
            p.y - Math.sin(p.angle) * p.size,
            p.x + Math.cos(p.angle) * 6,
            p.y + Math.sin(p.angle) * 6,
            6,
            p.color,
            0.9,
          );
          disc(ctx, p.x, p.y, 5, '#ffffff');
          glow(ctx, p.x, p.y, 26, p.color, 0.4);
          break;
        case 'shell':
          disc(ctx, p.x, p.y, p.size * 0.4, withAlpha('#ffffff', 0.9));
          glow(ctx, p.x, p.y, p.size * 1.6, p.color, 0.5);
          break;
        case 'grenade':
        case 'seed': {
          const pulse = 0.5 + 0.5 * Math.sin(this.time * 22);
          disc(ctx, p.x, p.y, p.size * 0.5, withAlpha(p.color, 0.9));
          ring(ctx, p.x, p.y, p.size * (0.8 + pulse * 0.5), 2, C.danger, 0.5 + pulse * 0.4);
          glow(ctx, p.x, p.y, p.size * 2, p.color, 0.4);
          break;
        }
        case 'thorn':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle);
          ctx.fillStyle = withAlpha(p.color, 0.95);
          ctx.beginPath();
          ctx.moveTo(p.size * 0.5, 0);
          ctx.lineTo(-p.size * 0.4, -3.5);
          ctx.lineTo(-p.size * 0.4, 3.5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          glow(ctx, p.x, p.y, p.size, p.color, 0.35);
          break;
        case 'slag':
          disc(ctx, p.x, p.y, p.size * 0.5 * a, withAlpha('#ffde8a', 0.9));
          glow(ctx, p.x, p.y, p.size * 2, p.color, 0.5);
          if (chance(0.4)) {
            this.fx.spawn({
              kind: 'spark',
              x: p.x,
              y: p.y,
              vx: rand(-30, 30),
              vy: rand(-10, 40),
              maxLife: 0.3,
              size: 2,
              color: '#ff9a4a',
              drag: 2,
            });
          }
          break;
        case 'shard':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle + this.time * 6);
          ctx.fillStyle = withAlpha(p.color, 0.9);
          ctx.fillRect(-p.size * 0.3, -p.size * 0.3, p.size * 0.6, p.size * 0.6);
          ctx.restore();
          glow(ctx, p.x, p.y, p.size * 1.6, p.color, 0.4);
          break;
        case 'orb':
        default:
          disc(ctx, p.x, p.y, p.size * 0.42, withAlpha('#ffffff', 0.85));
          disc(ctx, p.x, p.y, p.size * 0.62, withAlpha(p.color, 0.55));
          glow(ctx, p.x, p.y, p.size * 2.2, p.color, 0.5);
          break;
      }
    }
    ctx.restore();
  }
}
