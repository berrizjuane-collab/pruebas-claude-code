/**
 * The contract between entities and the game world. Enemies, bosses, weapons and
 * pickups only ever talk to `World`, which the Game implements — that keeps the
 * entity modules free of circular imports and easy to reason about.
 */

import type { Camera } from '../core/camera';
import type { Particles } from '../core/particles';
import type { SfxName } from '../core/audio';
import type { TileMap } from '../world/tiles';
import type { ZoneTheme } from '../art/palette';

export type Faction = 'player' | 'enemy';

export interface Actor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  dead: boolean;
}

export interface Projectile {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  life: number;
  maxLife: number;
  faction: Faction;
  /** Visual family: shapes and trails differ per kind. */
  kind:
    | 'bolt'
    | 'plasma'
    | 'shell'
    | 'grenade'
    | 'thorn'
    | 'beam'
    | 'needle'
    | 'orb'
    | 'slag'
    | 'seed'
    | 'shard'
    | 'spear';
  color: string;
  pierce: number;
  homing: number;
  /** Slows to a stop then explodes (grenades, seeds). */
  fuse: number;
  explodeRadius: number;
  explodeDamage: number;
  angle: number;
  spin: number;
  size: number;
  /** Deflected projectiles change faction and get a speed boost. */
  deflectable: boolean;
  wobble: number;
  hitIds: Set<number>;
  onExpire?: (w: World, p: Projectile) => void;
}

export type ZoneShape = 'circle' | 'rect' | 'ring' | 'cone';

export interface Zone {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  /** For rect shapes: length along `angle` and half-width. */
  len: number;
  halfW: number;
  angle: number;
  shape: ZoneShape;
  faction: Faction;
  /** Seconds of telegraph before it becomes lethal. */
  warn: number;
  warnMax: number;
  /** Seconds the hitbox stays live. */
  live: number;
  liveMax: number;
  damage: number;
  /** 'burst' hits once; 'field' ticks. */
  mode: 'burst' | 'field';
  tick: number;
  color: string;
  slow: number;
  /** Root/immobilise on hit. */
  root: number;
  knockback: number;
  hitIds: Set<number>;
  follow?: Actor | null;
  label?: string;
  onFire?: (w: World) => void;
}

export interface DamageOpts {
  knockback?: number;
  angle?: number;
  /** Freeze frames on impact — the main "juice" dial. */
  hitstop?: number;
  crit?: boolean;
  /** Element affects impact colour and status. */
  element?: 'physical' | 'volt' | 'resonance' | 'gravity' | 'phase' | 'data';
  silent?: boolean;
  stagger?: number;
}

export interface DialogueLine {
  speaker: string;
  text: string;
  color?: string;
  /** Portrait key — see ui/portraits. */
  face?: string;
  /** Player choices shown at the end of a line. */
  choices?: string[];
}

export interface EnemyLike extends Actor {
  id: number;
  defId: string;
  name: string;
  elite: boolean;
  isBoss: boolean;
  facing: number;
  hurtTimer: number;
  staggerTimer: number;
  slowTimer: number;
  rootTimer: number;
  /** Enemies flagged `pinned` are held by the Vector Lance. */
  pinTimer: number;
}

/** Everything an entity can ask the world to do. */
export interface World {
  readonly time: number;
  readonly dt: number;
  readonly map: TileMap;
  readonly theme: ZoneTheme;
  readonly camera: Camera;
  readonly fx: Particles;
  readonly playerActor: Actor;
  readonly playerAlive: boolean;
  readonly enemies: EnemyLike[];
  readonly difficulty: number;

  sfx(name: SfxName, volume?: number): void;
  shake(amount: number, decay?: number): void;
  hitstop(seconds: number): void;

  spawnProjectile(p: Partial<Projectile> & { x: number; y: number; vx: number; vy: number }): Projectile;
  spawnZone(z: Partial<Zone> & { x: number; y: number }): Zone;
  spawnEnemy(defId: string, x: number, y: number, opts?: { elite?: boolean; boss?: boolean }): EnemyLike | null;
  spawnPickup(kind: string, x: number, y: number, value?: number): void;

  damagePlayer(amount: number, fromX: number, fromY: number, opts?: DamageOpts): void;
  damageEnemy(e: EnemyLike, amount: number, opts?: DamageOpts): void;
  healPlayer(amount: number): void;

  /** Distance & direction helpers used constantly by AI. */
  distToPlayer(x: number, y: number): number;
  angleToPlayer(x: number, y: number): number;
  canSeePlayer(x: number, y: number): boolean;

  say(lines: DialogueLine[], onDone?: () => void): void;
  bark(x: number, y: number, text: string, color?: string): void;

  /** Boss/room orchestration. */
  onBossDefeated(id: string): void;
  setBossBar(name: string, hp: number, maxHp: number, phase: number, phases: number, subtitle?: string): void;
  clearBossBar(): void;
  glitch(amount: number, seconds: number): void;
  flash(color: string, alpha: number, seconds: number): void;
}
