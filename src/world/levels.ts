/**
 * The whole world of Nexus-9, authored as data.
 *
 * Rooms are declared by size + a list of rectangle "stamps" instead of hand-drawn
 * ASCII: it is far easier to keep consistent, and doors are punched into the wall
 * automatically so a level can never ship with an unreachable room.
 *
 * Door pairing: a door only names the room it leads to. On arrival the engine
 * finds the door in the target room that points back and drops the player just
 * inside it, so the two ends can never disagree about coordinates.
 */

import type { PropKind } from './tiles';

export type Side = 'n' | 's' | 'e' | 'w';
export type TileChar = '.' | '#' | 'X' | '=' | '~' | 'v' | '_' | ',';

/** [char, x, y, w, h] rectangle stamp, in tiles. */
export type Op = [TileChar, number, number, number, number];

export interface DoorDef {
  side: Side;
  /** Tile index along the side where the opening starts. */
  at: number;
  size?: number;
  /** Target room id, or `level:<id>` to change level. */
  to: string;
  /** `cleared` opens when the room has no enemies left; `boss` when the boss dies. */
  lock?: 'cleared' | 'boss' | 'nodes';
  label?: string;
}

export interface SpawnDef {
  type: string;
  tx: number;
  ty: number;
  elite?: boolean;
}

export interface ItemDef {
  kind:
    | 'checkpoint'
    | 'weapon'
    | 'upgrade'
    | 'credits'
    | 'health'
    | 'healCharge'
    | 'energy'
    | 'npc'
    | 'vendor'
    | 'node'
    | 'lever'
    | 'terminal';
  tx: number;
  ty: number;
  /** weapon id, upgrade id, npc story key, terminal text… */
  arg?: string;
  value?: number;
  /** Unique id so a consumed item stays consumed across room re-entries. */
  id?: string;
  name?: string;
}

export interface PropDef {
  kind: PropKind;
  tx: number;
  ty: number;
  text?: string;
  color?: string;
  scale?: number;
}

export interface LightDef {
  tx: number;
  ty: number;
  r: number;
  color: string;
  alpha?: number;
  /** Flicker speed; 0 = steady. */
  flicker?: number;
}

export interface RoomDef {
  id: string;
  zone: string;
  title?: string;
  cols: number;
  rows: number;
  ops?: Op[];
  doors: DoorDef[];
  spawns?: SpawnDef[];
  items?: ItemDef[];
  props?: PropDef[];
  lights?: LightDef[];
  /** Boss defId spawned in the centre after the intro dialogue. */
  boss?: string;
  bossIntro?: string;
  bossOutro?: string;
  /** Extra boss spawned alongside (the Sutura twins). */
  boss2?: string;
  onEnter?: string;
  /** Rewards granted when the boss dies. */
  reward?: { fragment?: number; weapon?: string; upgrade?: string; credits?: number };
  /** Tile where the player appears when entering the level here. */
  entry?: [number, number];
  music?: number;
}

export interface LevelDef {
  id: string;
  name: string;
  subtitle: string;
  zone: string;
  entryRoom: string;
  rooms: RoomDef[];
}

// --------------------------------------------------------------------------
//  PRÓLOGO — El Callejón de la Señal
// --------------------------------------------------------------------------

const prologue: LevelDef = {
  id: 'prologue',
  name: 'PRÓLOGO',
  subtitle: 'El Callejón de la Señal',
  zone: 'slums',
  entryRoom: 'p1',
  rooms: [
    {
      id: 'p1',
      zone: 'slums',
      title: 'Callejón de la Señal · Nivel −4',
      cols: 30,
      rows: 17,
      entry: [4, 8],
      onEnter: 'prologueIntro',
      ops: [
        ['#', 1, 1, 3, 4],
        ['#', 1, 12, 3, 4],
        [',', 5, 6, 20, 5],
        ['=', 10, 3, 3, 1],
        ['=', 17, 13, 4, 1],
        ['#', 21, 2, 2, 3],
        ['#', 8, 12, 2, 3],
      ],
      doors: [{ side: 'e', at: 7, size: 3, to: 'p2' }],
      items: [{ kind: 'terminal', tx: 8, ty: 8, arg: 'tutorialMove', id: 'p1-tut' }],
      props: [
        { kind: 'sign', tx: 6, ty: 3, text: 'SIN SEÑAL', color: '#ff4fd8' },
        { kind: 'sign', tx: 22, ty: 14, text: 'NIVEL −4', color: '#3fe9ff' },
        { kind: 'graffiti', tx: 14, ty: 12, text: 'NO OLVIDES' },
        { kind: 'puddle', tx: 12, ty: 9 },
        { kind: 'puddle', tx: 19, ty: 7 },
        { kind: 'cable', tx: 16, ty: 2 },
        { kind: 'body', tx: 24, ty: 11, color: '#ff4fd8' },
        { kind: 'vent', tx: 5, ty: 13 },
        { kind: 'screen', tx: 27, ty: 4, color: '#3fe9ff' },
      ],
      lights: [
        { tx: 6, ty: 3, r: 150, color: '#ff4fd8', alpha: 0.3, flicker: 3 },
        { tx: 22, ty: 14, r: 130, color: '#3fe9ff', alpha: 0.25 },
        { tx: 27, ty: 4, r: 110, color: '#3fe9ff', alpha: 0.2 },
      ],
    },
    {
      id: 'p2',
      zone: 'slums',
      title: 'Chatarrería Vertical',
      cols: 32,
      rows: 17,
      ops: [
        ['X', 6, 4, 2, 2],
        ['X', 12, 10, 3, 2],
        ['X', 22, 4, 2, 3],
        ['=', 17, 6, 1, 5],
        ['=', 9, 13, 5, 1],
        [',', 4, 4, 8, 8],
      ],
      doors: [
        { side: 'w', at: 7, size: 3, to: 'p1' },
        { side: 'e', at: 7, size: 3, to: 'p3', lock: 'cleared' },
        { side: 'n', at: 24, size: 3, to: 'p2b' },
      ],
      spawns: [
        { type: 'rat', tx: 14, ty: 6 },
        { type: 'rat', tx: 20, ty: 11 },
        { type: 'rat', tx: 24, ty: 8 },
      ],
      items: [{ kind: 'terminal', tx: 6, ty: 8, arg: 'tutorialAttack', id: 'p2-tut' }],
      props: [
        { kind: 'crate', tx: 6, ty: 4 },
        { kind: 'crate', tx: 7, ty: 5 },
        { kind: 'debris', tx: 12, ty: 10 },
        { kind: 'debris', tx: 22, ty: 5 },
        { kind: 'sign', tx: 27, ty: 13, text: 'CHATARRA', color: '#ffb03a' },
        { kind: 'puddle', tx: 20, ty: 4 },
        { kind: 'fan', tx: 3, ty: 3 },
      ],
      lights: [
        { tx: 27, ty: 13, r: 140, color: '#ffb03a', alpha: 0.25 },
        { tx: 10, ty: 8, r: 120, color: '#ff4fd8', alpha: 0.18, flicker: 5 },
      ],
    },
    {
      id: 'p2b',
      zone: 'slums',
      title: 'Nicho de Servicio',
      cols: 18,
      rows: 13,
      ops: [
        ['=', 3, 3, 2, 1],
        ['X', 13, 3, 3, 2],
        ['_', 7, 5, 4, 3],
      ],
      doors: [{ side: 's', at: 7, size: 3, to: 'p2' }],
      items: [
        { kind: 'credits', tx: 6, ty: 6, value: 30, id: 'p2b-cr' },
        { kind: 'health', tx: 10, ty: 6, id: 'p2b-hp' },
      ],
      props: [
        { kind: 'server', tx: 14, ty: 8, color: '#3fe9ff' },
        { kind: 'screen', tx: 4, ty: 8, color: '#ff4fd8' },
      ],
      lights: [{ tx: 9, ty: 6, r: 150, color: '#3fe9ff', alpha: 0.28 }],
    },
    {
      id: 'p3',
      zone: 'slums',
      title: 'Plaza Rota',
      cols: 34,
      rows: 18,
      ops: [
        ['#', 8, 6, 3, 3],
        ['#', 23, 9, 3, 3],
        ['=', 15, 3, 4, 1],
        ['=', 15, 14, 4, 1],
        [',', 12, 6, 10, 6],
        ['~', 17, 8, 2, 2],
      ],
      doors: [
        { side: 'w', at: 8, size: 3, to: 'p2' },
        { side: 'e', at: 8, size: 3, to: 'p4', lock: 'cleared' },
        { side: 's', at: 6, size: 3, to: 'p3b' },
      ],
      spawns: [
        { type: 'drone', tx: 26, ty: 5 },
        { type: 'rat', tx: 14, ty: 12 },
        { type: 'rat', tx: 20, ty: 4 },
        { type: 'civilian', tx: 28, ty: 12 },
      ],
      items: [{ kind: 'terminal', tx: 11, ty: 9, arg: 'tutorialDodge', id: 'p3-tut' }],
      props: [
        { kind: 'sign', tx: 17, ty: 2, text: 'PLAZA 4-B', color: '#3fe9ff' },
        { kind: 'stall', tx: 10, ty: 14, color: '#ff4fd8' },
        { kind: 'puddle', tx: 22, ty: 6 },
        { kind: 'body', tx: 30, ty: 8, color: '#3fe9ff' },
        { kind: 'cable', tx: 26, ty: 2 },
        { kind: 'graffiti', tx: 6, ty: 15, text: 'ELLOS ESCUCHAN' },
      ],
      lights: [
        { tx: 17, ty: 2, r: 170, color: '#3fe9ff', alpha: 0.26 },
        { tx: 10, ty: 14, r: 130, color: '#ff4fd8', alpha: 0.22, flicker: 4 },
      ],
    },
    {
      id: 'p3b',
      zone: 'slums',
      title: 'Depósito Sellado',
      cols: 18,
      rows: 14,
      ops: [
        ['X', 3, 3, 2, 2],
        ['X', 13, 9, 2, 2],
        ['_', 7, 6, 4, 3],
      ],
      doors: [{ side: 'n', at: 7, size: 3, to: 'p3' }],
      spawns: [
        { type: 'rat', tx: 5, ty: 9 },
        { type: 'rat', tx: 13, ty: 5 },
      ],
      items: [{ kind: 'upgrade', tx: 9, ty: 7, arg: 'maxHp', id: 'p3b-up' }],
      props: [
        { kind: 'crate', tx: 4, ty: 10 },
        { kind: 'lamp', tx: 9, ty: 3, color: '#ffd166' },
      ],
      lights: [{ tx: 9, ty: 7, r: 160, color: '#ffd166', alpha: 0.3 }],
    },
    {
      id: 'p4',
      zone: 'slums',
      title: 'Puesto Abandonado',
      cols: 30,
      rows: 17,
      ops: [
        ['=', 6, 5, 6, 1],
        ['=', 18, 11, 6, 1],
        ['X', 14, 3, 2, 2],
        [',', 4, 8, 22, 4],
      ],
      doors: [
        { side: 'w', at: 7, size: 3, to: 'p3' },
        { side: 'e', at: 7, size: 3, to: 'p5', lock: 'cleared' },
      ],
      spawns: [
        { type: 'civilian', tx: 12, ty: 8 },
        { type: 'civilian', tx: 20, ty: 6 },
        { type: 'rat', tx: 22, ty: 13 },
      ],
      items: [
        { kind: 'checkpoint', tx: 5, ty: 12, id: 'p4-cp' },
        { kind: 'npc', tx: 9, ty: 13, arg: 'prologueNpc', name: 'SOMBRA', id: 'p4-npc' },
        { kind: 'healCharge', tx: 25, ty: 4, id: 'p4-hc' },
      ],
      props: [
        { kind: 'stall', tx: 8, ty: 5, color: '#ffb03a' },
        { kind: 'stall', tx: 21, ty: 11, color: '#ff4fd8' },
        { kind: 'sign', tx: 15, ty: 2, text: 'MERCADO CERRADO', color: '#ffb03a' },
        { kind: 'puddle', tx: 17, ty: 9 },
        { kind: 'vent', tx: 27, ty: 8 },
      ],
      lights: [
        { tx: 15, ty: 2, r: 160, color: '#ffb03a', alpha: 0.24 },
        { tx: 5, ty: 12, r: 130, color: '#3fe9ff', alpha: 0.3 },
      ],
    },
    {
      id: 'p5',
      zone: 'slums',
      title: 'Bahía de Compactación',
      cols: 32,
      rows: 19,
      ops: [
        ['X', 2, 2, 3, 2],
        ['X', 27, 2, 3, 2],
        ['X', 2, 15, 3, 2],
        ['X', 27, 15, 3, 2],
        ['_', 12, 7, 8, 5],
      ],
      doors: [
        { side: 'w', at: 8, size: 3, to: 'p4' },
        { side: 'e', at: 8, size: 3, to: 'level:acid', lock: 'boss', label: 'DISTRITO DE LA LLUVIA ÁCIDA' },
      ],
      boss: 'collector',
      bossIntro: 'collectorIntro',
      bossOutro: 'collectorOutro',
      reward: { upgrade: 'healCharge', credits: 40 },
      music: 1,
      props: [
        { kind: 'sign', tx: 16, ty: 2, text: 'COMPACTACIÓN', color: '#ffb03a' },
        { kind: 'pipe', tx: 6, ty: 17 },
        { kind: 'pipe', tx: 25, ty: 17 },
        { kind: 'fan', tx: 4, ty: 9 },
        { kind: 'fan', tx: 28, ty: 9 },
      ],
      lights: [
        { tx: 16, ty: 2, r: 200, color: '#ffb03a', alpha: 0.24 },
        { tx: 16, ty: 10, r: 260, color: '#ff4fd8', alpha: 0.14 },
      ],
    },
  ],
};

// --------------------------------------------------------------------------
//  NIVEL 1 — Distrito de la Lluvia Ácida
// --------------------------------------------------------------------------

const acid: LevelDef = {
  id: 'acid',
  name: 'NIVEL 1',
  subtitle: 'Distrito de la Lluvia Ácida',
  zone: 'acid',
  entryRoom: 'a1',
  rooms: [
    {
      id: 'a1',
      zone: 'acid',
      title: 'Entrada al Distrito · Nivel −1',
      cols: 30,
      rows: 17,
      entry: [4, 8],
      onEnter: 'acidIntro',
      ops: [
        ['X', 8, 3, 2, 3],
        ['X', 8, 11, 2, 3],
        ['~', 14, 7, 3, 3],
        ['=', 20, 4, 1, 4],
        ['=', 20, 10, 1, 4],
      ],
      doors: [{ side: 'e', at: 7, size: 3, to: 'a2' }],
      items: [{ kind: 'checkpoint', tx: 5, ty: 8, id: 'a1-cp' }],
      props: [
        { kind: 'sign', tx: 12, ty: 2, text: 'DISTRITO 7 · ÁCIDO', color: '#a3ff5c' },
        { kind: 'pipe', tx: 24, ty: 3 },
        { kind: 'pipe', tx: 24, ty: 14 },
        { kind: 'puddle', tx: 18, ty: 12, color: '#a3ff5c' },
        { kind: 'vent', tx: 26, ty: 8 },
      ],
      lights: [
        { tx: 12, ty: 2, r: 190, color: '#a3ff5c', alpha: 0.26 },
        { tx: 15, ty: 8, r: 150, color: '#a3ff5c', alpha: 0.2 },
      ],
    },
    {
      id: 'a2',
      zone: 'acid',
      title: 'Pasarela de Vapor',
      cols: 36,
      rows: 17,
      ops: [
        ['~', 6, 2, 4, 4],
        ['~', 6, 11, 4, 4],
        ['~', 24, 6, 5, 5],
        ['X', 13, 4, 2, 9],
        ['X', 19, 2, 2, 4],
        ['X', 19, 11, 2, 4],
        ['=', 30, 3, 1, 3],
      ],
      doors: [
        { side: 'w', at: 7, size: 3, to: 'a1' },
        { side: 'e', at: 7, size: 3, to: 'a3', lock: 'cleared' },
        { side: 'n', at: 30, size: 3, to: 'a2b' },
      ],
      spawns: [
        { type: 'harvestDrone', tx: 16, ty: 4 },
        { type: 'harvestDrone', tx: 30, ty: 12 },
        { type: 'cableSpider', tx: 22, ty: 8 },
        { type: 'cableSpider', tx: 11, ty: 8 },
      ],
      props: [
        { kind: 'pipe', tx: 8, ty: 8 },
        { kind: 'pipe', tx: 16, ty: 1 },
        { kind: 'vent', tx: 26, ty: 3 },
        { kind: 'sign', tx: 33, ty: 14, text: 'VAPOR', color: '#ffb03a' },
        { kind: 'puddle', tx: 22, ty: 13, color: '#a3ff5c' },
      ],
      lights: [
        { tx: 33, ty: 14, r: 140, color: '#ffb03a', alpha: 0.22 },
        { tx: 8, ty: 4, r: 150, color: '#a3ff5c', alpha: 0.22 },
        { tx: 26, ty: 8, r: 170, color: '#a3ff5c', alpha: 0.2 },
      ],
    },
    {
      id: 'a2b',
      zone: 'acid',
      title: 'Sala de Válvulas',
      cols: 20,
      rows: 14,
      ops: [
        ['X', 3, 3, 2, 2],
        ['X', 15, 3, 2, 2],
        ['_', 8, 5, 4, 4],
      ],
      doors: [{ side: 's', at: 8, size: 3, to: 'a2' }],
      spawns: [{ type: 'technician', tx: 15, ty: 9 }],
      items: [
        { kind: 'lever', tx: 10, ty: 6, arg: 'acidLever', id: 'a2b-lever' },
        { kind: 'credits', tx: 5, ty: 10, value: 45, id: 'a2b-cr' },
      ],
      props: [
        { kind: 'pipe', tx: 4, ty: 7 },
        { kind: 'pipe', tx: 16, ty: 7 },
        { kind: 'screen', tx: 10, ty: 2, color: '#a3ff5c' },
      ],
      lights: [{ tx: 10, ty: 6, r: 170, color: '#a3ff5c', alpha: 0.3 }],
    },
    {
      id: 'a3',
      zone: 'acid',
      title: 'Fundición Baja',
      cols: 34,
      rows: 18,
      ops: [
        ['X', 5, 5, 3, 3],
        ['X', 26, 10, 3, 3],
        ['=', 14, 4, 6, 1],
        ['=', 14, 13, 6, 1],
        ['~', 16, 8, 2, 2],
        [',', 10, 6, 14, 6],
      ],
      doors: [
        { side: 'w', at: 8, size: 3, to: 'a2' },
        { side: 'e', at: 8, size: 3, to: 'a4', lock: 'cleared' },
        { side: 's', at: 6, size: 3, to: 'a3b' },
      ],
      spawns: [
        { type: 'scrapper', tx: 12, ty: 9 },
        { type: 'scrapper', tx: 24, ty: 6 },
        { type: 'technician', tx: 29, ty: 14 },
        { type: 'cableSpider', tx: 20, ty: 15 },
      ],
      props: [
        { kind: 'debris', tx: 9, ty: 14 },
        { kind: 'crate', tx: 30, ty: 4 },
        { kind: 'sign', tx: 17, ty: 2, text: 'FUNDICIÓN B', color: '#ffb03a' },
        { kind: 'fan', tx: 4, ty: 15 },
        { kind: 'puddle', tx: 22, ty: 11, color: '#a3ff5c' },
      ],
      lights: [
        { tx: 17, ty: 2, r: 180, color: '#ffb03a', alpha: 0.24 },
        { tx: 17, ty: 9, r: 140, color: '#a3ff5c', alpha: 0.2 },
      ],
    },
    {
      id: 'a3b',
      zone: 'acid',
      title: 'Almacén Inundado',
      cols: 20,
      rows: 14,
      ops: [
        ['~', 3, 3, 3, 3],
        ['~', 14, 8, 3, 3],
        ['X', 9, 6, 2, 2],
      ],
      doors: [{ side: 'n', at: 8, size: 3, to: 'a3' }],
      spawns: [
        { type: 'cableSpider', tx: 6, ty: 10 },
        { type: 'harvestDrone', tx: 15, ty: 4 },
      ],
      items: [
        { kind: 'upgrade', tx: 5, ty: 8, arg: 'dodge', id: 'a3b-up' },
        { kind: 'health', tx: 15, ty: 5, id: 'a3b-hp' },
      ],
      props: [
        { kind: 'pipe', tx: 10, ty: 12 },
        { kind: 'puddle', tx: 8, ty: 3, color: '#a3ff5c' },
      ],
      lights: [{ tx: 5, ty: 8, r: 150, color: '#ffd166', alpha: 0.28 }],
    },
    {
      id: 'a4',
      zone: 'acid',
      title: 'Cruce Ácido',
      cols: 34,
      rows: 18,
      ops: [
        ['~', 4, 4, 4, 3],
        ['~', 26, 11, 4, 3],
        ['X', 15, 7, 4, 4],
        ['=', 9, 12, 4, 1],
        ['=', 21, 5, 4, 1],
      ],
      doors: [
        { side: 'w', at: 8, size: 3, to: 'a3' },
        { side: 'e', at: 8, size: 3, to: 'a5', lock: 'cleared' },
      ],
      spawns: [
        { type: 'scrapper', tx: 22, ty: 12, elite: true },
        { type: 'harvestDrone', tx: 10, ty: 5 },
        { type: 'harvestDrone', tx: 28, ty: 5 },
        { type: 'technician', tx: 8, ty: 14 },
        { type: 'cableSpider', tx: 25, ty: 8 },
      ],
      props: [
        { kind: 'sign', tx: 17, ty: 2, text: 'PELIGRO', color: '#ff2740' },
        { kind: 'pipe', tx: 6, ty: 16 },
        { kind: 'debris', tx: 12, ty: 3 },
        { kind: 'vent', tx: 30, ty: 3 },
      ],
      lights: [
        { tx: 17, ty: 2, r: 190, color: '#ff2740', alpha: 0.2, flicker: 3 },
        { tx: 6, ty: 5, r: 150, color: '#a3ff5c', alpha: 0.2 },
      ],
    },
    {
      id: 'a5',
      zone: 'acid',
      title: 'Antesala de la Fundidora',
      cols: 28,
      rows: 16,
      ops: [
        ['=', 6, 4, 3, 1],
        ['=', 19, 11, 3, 1],
        ['_', 11, 6, 6, 4],
      ],
      doors: [
        { side: 'w', at: 7, size: 3, to: 'a4' },
        { side: 'e', at: 7, size: 3, to: 'a6' },
      ],
      items: [
        { kind: 'checkpoint', tx: 6, ty: 8, id: 'a5-cp' },
        { kind: 'npc', tx: 10, ty: 11, arg: 'acidNpc', name: 'MERCE', id: 'a5-npc' },
        { kind: 'healCharge', tx: 22, ty: 4, id: 'a5-hc' },
        { kind: 'health', tx: 23, ty: 8, id: 'a5-hp' },
      ],
      props: [
        { kind: 'sign', tx: 14, ty: 2, text: 'ACCESO MADRIGAL-7', color: '#ff2740' },
        { kind: 'body', tx: 20, ty: 13, color: '#a3ff5c' },
        { kind: 'screen', tx: 24, ty: 12, color: '#a3ff5c' },
      ],
      lights: [
        { tx: 14, ty: 2, r: 190, color: '#ff2740', alpha: 0.22 },
        { tx: 6, ty: 8, r: 140, color: '#3fe9ff', alpha: 0.3 },
      ],
    },
    {
      id: 'a6',
      zone: 'acid',
      title: 'Sala de la Fundidora',
      cols: 36,
      rows: 20,
      ops: [
        ['X', 2, 2, 3, 3],
        ['X', 31, 2, 3, 3],
        ['X', 2, 15, 3, 3],
        ['X', 31, 15, 3, 3],
        ['~', 17, 2, 2, 2],
        ['~', 17, 16, 2, 2],
        ['_', 14, 8, 8, 4],
      ],
      doors: [
        { side: 'w', at: 9, size: 3, to: 'a5' },
        { side: 'e', at: 9, size: 3, to: 'level:market', lock: 'boss', label: 'MERCADO DE LOS RECUERDOS' },
      ],
      boss: 'madrigal',
      bossIntro: 'madrigalIntro',
      bossOutro: 'madrigalOutro',
      reward: { fragment: 1, weapon: 'whip', credits: 90 },
      music: 1,
      props: [
        { kind: 'pipe', tx: 8, ty: 18 },
        { kind: 'pipe', tx: 27, ty: 18 },
        { kind: 'fan', tx: 5, ty: 10 },
        { kind: 'fan', tx: 30, ty: 10 },
        { kind: 'sign', tx: 18, ty: 1, text: 'MADRIGAL-7', color: '#ffb03a' },
      ],
      lights: [
        { tx: 18, ty: 10, r: 300, color: '#ff7a2a', alpha: 0.16 },
        { tx: 18, ty: 1, r: 200, color: '#ffb03a', alpha: 0.24 },
      ],
    },
  ],
};

// --------------------------------------------------------------------------
//  NIVEL 2 — Mercado de los Recuerdos
// --------------------------------------------------------------------------

const market: LevelDef = {
  id: 'market',
  name: 'NIVEL 2',
  subtitle: 'Mercado de los Recuerdos',
  zone: 'market',
  entryRoom: 'm1',
  rooms: [
    {
      id: 'm1',
      zone: 'market',
      title: 'Umbral del Mercado · Nivel 3',
      cols: 30,
      rows: 17,
      entry: [4, 8],
      onEnter: 'marketIntro',
      ops: [
        ['=', 8, 4, 1, 4],
        ['=', 8, 10, 1, 4],
        ['X', 20, 6, 2, 5],
        ['_', 12, 7, 6, 3],
      ],
      doors: [{ side: 'e', at: 7, size: 3, to: 'm2' }],
      items: [
        { kind: 'checkpoint', tx: 5, ty: 8, id: 'm1-cp' },
        { kind: 'vendor', tx: 14, ty: 12, arg: 'marketVendor', name: 'KESH', id: 'm1-vendor' },
      ],
      props: [
        { kind: 'sign', tx: 13, ty: 2, text: 'MERCADO · MEMORIAS', color: '#ff4fd8' },
        { kind: 'stall', tx: 14, ty: 12, color: '#ffd166' },
        { kind: 'banner', tx: 24, ty: 4, color: '#ff4fd8' },
        { kind: 'banner', tx: 24, ty: 12, color: '#8b5cf6' },
        { kind: 'screen', tx: 26, ty: 8, color: '#ff4fd8' },
      ],
      lights: [
        { tx: 13, ty: 2, r: 200, color: '#ff4fd8', alpha: 0.28 },
        { tx: 14, ty: 12, r: 150, color: '#ffd166', alpha: 0.3 },
      ],
    },
    {
      id: 'm2',
      zone: 'market',
      title: 'Callejón de Puestos',
      cols: 36,
      rows: 17,
      ops: [
        ['=', 6, 3, 4, 1],
        ['=', 6, 12, 4, 1],
        ['=', 16, 6, 1, 5],
        ['=', 24, 3, 4, 1],
        ['=', 24, 12, 4, 1],
        ['X', 11, 8, 2, 2],
        ['X', 29, 6, 2, 2],
      ],
      doors: [
        { side: 'w', at: 7, size: 3, to: 'm1' },
        { side: 'e', at: 7, size: 3, to: 'm3', lock: 'cleared' },
        { side: 'n', at: 30, size: 3, to: 'm2b' },
      ],
      spawns: [
        { type: 'mirrorMerc', tx: 14, ty: 5 },
        { type: 'pulseSmuggler', tx: 22, ty: 11 },
        { type: 'chameleonDrone', tx: 30, ty: 12 },
        { type: 'mirrorMerc', tx: 26, ty: 6 },
      ],
      props: [
        { kind: 'stall', tx: 8, ty: 3, color: '#ff4fd8' },
        { kind: 'stall', tx: 26, ty: 12, color: '#ffd166' },
        { kind: 'banner', tx: 18, ty: 2, color: '#8b5cf6' },
        { kind: 'screen', tx: 33, ty: 4, color: '#ff4fd8' },
        { kind: 'graffiti', tx: 20, ty: 15, text: 'ME VENDÍ BARATO' },
      ],
      lights: [
        { tx: 8, ty: 3, r: 150, color: '#ff4fd8', alpha: 0.26 },
        { tx: 26, ty: 12, r: 150, color: '#ffd166', alpha: 0.24 },
        { tx: 18, ty: 8, r: 200, color: '#8b5cf6', alpha: 0.16 },
      ],
    },
    {
      id: 'm2b',
      zone: 'market',
      title: 'Trastienda',
      cols: 20,
      rows: 14,
      ops: [
        ['X', 3, 3, 2, 2],
        ['X', 15, 9, 2, 2],
        ['_', 8, 5, 4, 4],
      ],
      doors: [{ side: 's', at: 8, size: 3, to: 'm2' }],
      spawns: [
        { type: 'chameleonDrone', tx: 5, ty: 9 },
        { type: 'pulseSmuggler', tx: 15, ty: 5 },
      ],
      items: [{ kind: 'weapon', tx: 10, ty: 7, arg: 'blades', id: 'm2b-w' }],
      props: [
        { kind: 'stall', tx: 4, ty: 11, color: '#8b5cf6' },
        { kind: 'screen', tx: 16, ty: 3, color: '#ff4fd8' },
      ],
      lights: [{ tx: 10, ty: 7, r: 170, color: '#ff4fd8', alpha: 0.32 }],
    },
    {
      id: 'm3',
      zone: 'market',
      title: 'Galería de Memorias',
      cols: 34,
      rows: 18,
      ops: [
        ['X', 7, 4, 2, 2],
        ['X', 7, 12, 2, 2],
        ['X', 25, 4, 2, 2],
        ['X', 25, 12, 2, 2],
        ['=', 15, 8, 4, 2],
        [',', 12, 5, 10, 8],
      ],
      doors: [
        { side: 'w', at: 8, size: 3, to: 'm2' },
        { side: 'e', at: 8, size: 3, to: 'm4', lock: 'cleared' },
        { side: 's', at: 6, size: 3, to: 'm3b' },
      ],
      spawns: [
        { type: 'dataMonk', tx: 17, ty: 5 },
        { type: 'mirrorMerc', tx: 12, ty: 13 },
        { type: 'chameleonDrone', tx: 28, ty: 8 },
        { type: 'pulseSmuggler', tx: 22, ty: 14 },
      ],
      items: [{ kind: 'npc', tx: 5, ty: 5, arg: 'marketNpc', name: 'NIÑA', id: 'm3-npc' }],
      props: [
        { kind: 'screen', tx: 10, ty: 3, color: '#ff4fd8' },
        { kind: 'screen', tx: 24, ty: 15, color: '#8b5cf6' },
        { kind: 'banner', tx: 17, ty: 2, color: '#ffd166' },
        { kind: 'stall', tx: 30, ty: 11, color: '#ff4fd8' },
      ],
      lights: [
        { tx: 17, ty: 9, r: 240, color: '#ff4fd8', alpha: 0.16 },
        { tx: 10, ty: 3, r: 130, color: '#ff4fd8', alpha: 0.22 },
      ],
    },
    {
      id: 'm3b',
      zone: 'market',
      title: 'Cámara Sellada',
      cols: 18,
      rows: 13,
      ops: [
        ['_', 6, 5, 6, 3],
        ['X', 3, 8, 2, 2],
        ['X', 13, 3, 2, 2],
      ],
      doors: [{ side: 'n', at: 7, size: 3, to: 'm3' }],
      spawns: [{ type: 'dataMonk', tx: 9, ty: 9 }],
      items: [
        { kind: 'upgrade', tx: 9, ty: 6, arg: 'damage', id: 'm3b-up' },
        { kind: 'credits', tx: 4, ty: 4, value: 70, id: 'm3b-cr' },
      ],
      props: [{ kind: 'banner', tx: 9, ty: 2, color: '#8b5cf6' }],
      lights: [{ tx: 9, ty: 6, r: 160, color: '#8b5cf6', alpha: 0.32 }],
    },
    {
      id: 'm4',
      zone: 'market',
      title: 'Anillo de Subastas',
      cols: 32,
      rows: 18,
      ops: [
        ['X', 3, 3, 2, 2],
        ['X', 27, 3, 2, 2],
        ['X', 3, 13, 2, 2],
        ['X', 27, 13, 2, 2],
        ['_', 11, 6, 10, 6],
      ],
      doors: [
        { side: 'w', at: 8, size: 3, to: 'm3' },
        { side: 'e', at: 8, size: 3, to: 'm5', lock: 'boss' },
      ],
      boss: 'suturaFast',
      boss2: 'suturaLong',
      bossIntro: 'twinsIntro',
      bossOutro: 'twinsOutro',
      reward: { credits: 80, upgrade: 'healCharge' },
      music: 1,
      props: [
        { kind: 'banner', tx: 16, ty: 2, color: '#ff4fd8' },
        { kind: 'stall', tx: 6, ty: 9, color: '#ffd166' },
        { kind: 'stall', tx: 26, ty: 9, color: '#ffd166' },
        { kind: 'screen', tx: 16, ty: 16, color: '#8b5cf6' },
      ],
      lights: [
        { tx: 16, ty: 9, r: 280, color: '#ff4fd8', alpha: 0.16 },
        { tx: 16, ty: 2, r: 160, color: '#ff4fd8', alpha: 0.26 },
      ],
    },
    {
      id: 'm5',
      zone: 'market',
      title: 'Santuario de los Sin Nombre',
      cols: 26,
      rows: 16,
      ops: [
        ['=', 5, 5, 3, 1],
        ['=', 18, 10, 3, 1],
        ['_', 10, 6, 6, 4],
      ],
      doors: [
        { side: 'w', at: 7, size: 3, to: 'm4' },
        { side: 'e', at: 7, size: 3, to: 'm6' },
      ],
      items: [
        { kind: 'checkpoint', tx: 5, ty: 8, id: 'm5-cp' },
        { kind: 'health', tx: 20, ty: 5, id: 'm5-hp' },
        { kind: 'healCharge', tx: 21, ty: 11, id: 'm5-hc' },
      ],
      props: [
        { kind: 'sign', tx: 13, ty: 2, text: 'SIN NOMBRE', color: '#ff4fd8' },
        { kind: 'body', tx: 8, ty: 12, color: '#ff4fd8' },
        { kind: 'banner', tx: 22, ty: 3, color: '#8b5cf6' },
      ],
      lights: [
        { tx: 13, ty: 2, r: 180, color: '#ff4fd8', alpha: 0.26 },
        { tx: 5, ty: 8, r: 140, color: '#3fe9ff', alpha: 0.3 },
      ],
    },
    {
      id: 'm6',
      zone: 'market',
      title: 'Teatro de Mnemosyne',
      cols: 36,
      rows: 20,
      ops: [
        ['X', 2, 2, 3, 3],
        ['X', 31, 2, 3, 3],
        ['X', 2, 15, 3, 3],
        ['X', 31, 15, 3, 3],
        ['_', 13, 7, 10, 6],
      ],
      doors: [
        { side: 'w', at: 9, size: 3, to: 'm5' },
        { side: 'e', at: 9, size: 3, to: 'level:gardens', lock: 'boss', label: 'JARDINES DE CROMO' },
      ],
      boss: 'mnemosyne',
      bossIntro: 'mnemosyneIntro',
      bossOutro: 'mnemosyneOutro',
      reward: { fragment: 2, weapon: 'pistol', credits: 120 },
      music: 1,
      props: [
        { kind: 'banner', tx: 18, ty: 2, color: '#ff4fd8' },
        { kind: 'screen', tx: 6, ty: 10, color: '#ff4fd8' },
        { kind: 'screen', tx: 30, ty: 10, color: '#ff4fd8' },
        { kind: 'stall', tx: 18, ty: 17, color: '#8b5cf6' },
      ],
      lights: [
        { tx: 18, ty: 10, r: 320, color: '#ff4fd8', alpha: 0.16 },
        { tx: 6, ty: 10, r: 150, color: '#ff4fd8', alpha: 0.2 },
        { tx: 30, ty: 10, r: 150, color: '#ff4fd8', alpha: 0.2 },
      ],
    },
  ],
};

// --------------------------------------------------------------------------
//  NIVEL 3 — Jardines de Cromo
// --------------------------------------------------------------------------

const gardens: LevelDef = {
  id: 'gardens',
  name: 'NIVEL 3',
  subtitle: 'Jardines de Cromo',
  zone: 'gardens',
  entryRoom: 'g1',
  rooms: [
    {
      id: 'g1',
      zone: 'gardens',
      title: 'Invernadero Norte · Nivel 41',
      cols: 30,
      rows: 17,
      entry: [4, 8],
      onEnter: 'gardensIntro',
      ops: [
        ['=', 9, 4, 1, 3],
        ['=', 9, 10, 1, 3],
        ['X', 19, 7, 2, 3],
        ['_', 13, 6, 4, 5],
      ],
      doors: [{ side: 'e', at: 7, size: 3, to: 'g2' }],
      items: [{ kind: 'checkpoint', tx: 5, ty: 8, id: 'g1-cp' }],
      props: [
        { kind: 'flower', tx: 12, ty: 4, color: '#7cf6c8' },
        { kind: 'flower', tx: 16, ty: 13, color: '#ff9ee8' },
        { kind: 'plant', tx: 24, ty: 5, color: '#7cf6c8' },
        { kind: 'plant', tx: 24, ty: 12, color: '#7cf6c8' },
        { kind: 'sign', tx: 15, ty: 2, text: 'JARDINES DE CROMO', color: '#7cf6c8' },
      ],
      lights: [
        { tx: 15, ty: 2, r: 190, color: '#7cf6c8', alpha: 0.26 },
        { tx: 16, ty: 13, r: 130, color: '#ff9ee8', alpha: 0.24 },
      ],
    },
    {
      id: 'g2',
      zone: 'gardens',
      title: 'Senda de Espinas',
      cols: 36,
      rows: 18,
      ops: [
        ['X', 8, 3, 2, 4],
        ['X', 8, 11, 2, 4],
        ['X', 20, 6, 3, 6],
        ['=', 14, 2, 1, 4],
        ['=', 28, 12, 1, 4],
        ['~', 30, 4, 3, 3],
      ],
      doors: [
        { side: 'w', at: 8, size: 3, to: 'g1' },
        { side: 'e', at: 8, size: 3, to: 'g3', lock: 'cleared' },
        { side: 'n', at: 30, size: 3, to: 'g2b' },
      ],
      spawns: [
        { type: 'sentinelOrchid', tx: 12, ty: 5 },
        { type: 'sentinelOrchid', tx: 26, ty: 14 },
        { type: 'fiberDeer', tx: 17, ty: 9 },
        { type: 'fiberDeer', tx: 30, ty: 9 },
      ],
      props: [
        { kind: 'flower', tx: 6, ty: 8, color: '#ff9ee8' },
        { kind: 'plant', tx: 24, ty: 3, color: '#7cf6c8' },
        { kind: 'plant', tx: 15, ty: 15, color: '#7cf6c8' },
        { kind: 'flower', tx: 33, ty: 15, color: '#ff9ee8' },
      ],
      lights: [
        { tx: 6, ty: 8, r: 140, color: '#ff9ee8', alpha: 0.24 },
        { tx: 24, ty: 3, r: 140, color: '#7cf6c8', alpha: 0.22 },
        { tx: 18, ty: 9, r: 220, color: '#7cf6c8', alpha: 0.12 },
      ],
    },
    {
      id: 'g2b',
      zone: 'gardens',
      title: 'Vivero Clausurado',
      cols: 20,
      rows: 14,
      ops: [
        ['X', 3, 3, 2, 2],
        ['X', 15, 8, 2, 2],
        ['_', 8, 5, 4, 4],
      ],
      doors: [{ side: 's', at: 8, size: 3, to: 'g2' }],
      spawns: [
        { type: 'shockVine', tx: 5, ty: 9 },
        { type: 'sentinelOrchid', tx: 15, ty: 4 },
      ],
      items: [{ kind: 'weapon', tx: 10, ty: 7, arg: 'lance', id: 'g2b-w' }],
      props: [
        { kind: 'flower', tx: 4, ty: 11, color: '#ff9ee8' },
        { kind: 'plant', tx: 16, ty: 12, color: '#7cf6c8' },
      ],
      lights: [{ tx: 10, ty: 7, r: 170, color: '#7cf6c8', alpha: 0.32 }],
    },
    {
      id: 'g3',
      zone: 'gardens',
      title: 'Claro Luminoso',
      cols: 34,
      rows: 18,
      ops: [
        ['X', 6, 6, 2, 2],
        ['X', 26, 10, 2, 2],
        ['=', 14, 4, 6, 1],
        ['=', 14, 13, 6, 1],
        ['~', 16, 8, 2, 2],
      ],
      doors: [
        { side: 'w', at: 8, size: 3, to: 'g2' },
        { side: 'e', at: 8, size: 3, to: 'g4', lock: 'cleared' },
        { side: 's', at: 6, size: 3, to: 'g3b' },
      ],
      spawns: [
        { type: 'shockVine', tx: 12, ty: 6 },
        { type: 'shockVine', tx: 22, ty: 12 },
        { type: 'botanicalGuardian', tx: 24, ty: 5 },
        { type: 'fiberDeer', tx: 10, ty: 14 },
      ],
      props: [
        { kind: 'flower', tx: 9, ty: 3, color: '#ff9ee8' },
        { kind: 'flower', tx: 29, ty: 15, color: '#ff9ee8' },
        { kind: 'plant', tx: 19, ty: 16, color: '#7cf6c8' },
        { kind: 'sign', tx: 17, ty: 2, text: 'CLARO 12', color: '#7cf6c8' },
      ],
      lights: [
        { tx: 17, ty: 9, r: 260, color: '#7cf6c8', alpha: 0.14 },
        { tx: 9, ty: 3, r: 130, color: '#ff9ee8', alpha: 0.24 },
      ],
    },
    {
      id: 'g3b',
      zone: 'gardens',
      title: 'Estanque de Cromo',
      cols: 20,
      rows: 14,
      ops: [
        ['~', 8, 5, 4, 4],
        ['X', 3, 3, 2, 2],
        ['X', 15, 9, 2, 2],
      ],
      doors: [{ side: 'n', at: 8, size: 3, to: 'g3' }],
      spawns: [{ type: 'botanicalGuardian', tx: 15, ty: 5 }],
      items: [
        { kind: 'upgrade', tx: 5, ty: 10, arg: 'maxHp', id: 'g3b-up' },
        { kind: 'healCharge', tx: 15, ty: 3, id: 'g3b-hc' },
      ],
      props: [
        { kind: 'flower', tx: 4, ty: 5, color: '#ff9ee8' },
        { kind: 'plant', tx: 12, ty: 11, color: '#7cf6c8' },
      ],
      lights: [{ tx: 10, ty: 7, r: 180, color: '#7cf6c8', alpha: 0.26 }],
    },
    {
      id: 'g4',
      zone: 'gardens',
      title: 'Arboreto Central',
      cols: 34,
      rows: 19,
      ops: [
        ['X', 10, 5, 3, 3],
        ['X', 22, 11, 3, 3],
        ['=', 5, 9, 4, 1],
        ['=', 26, 6, 4, 1],
        ['~', 16, 3, 2, 2],
        ['~', 16, 14, 2, 2],
      ],
      doors: [
        { side: 'w', at: 8, size: 3, to: 'g3' },
        { side: 'e', at: 8, size: 3, to: 'g5', lock: 'cleared' },
      ],
      spawns: [
        { type: 'botanicalGuardian', tx: 18, ty: 9, elite: true },
        { type: 'sentinelOrchid', tx: 8, ty: 4 },
        { type: 'sentinelOrchid', tx: 28, ty: 15 },
        { type: 'fiberDeer', tx: 26, ty: 4 },
        { type: 'shockVine', tx: 12, ty: 15 },
      ],
      props: [
        { kind: 'plant', tx: 6, ty: 3, color: '#7cf6c8' },
        { kind: 'plant', tx: 30, ty: 11, color: '#7cf6c8' },
        { kind: 'flower', tx: 20, ty: 6, color: '#ff9ee8' },
      ],
      lights: [{ tx: 17, ty: 9, r: 280, color: '#7cf6c8', alpha: 0.14 }],
    },
    {
      id: 'g5',
      zone: 'gardens',
      title: 'Puerta del Jardinero',
      cols: 26,
      rows: 16,
      ops: [
        ['=', 6, 5, 3, 1],
        ['=', 17, 10, 3, 1],
        ['_', 10, 6, 6, 4],
      ],
      doors: [
        { side: 'w', at: 7, size: 3, to: 'g4' },
        { side: 'e', at: 7, size: 3, to: 'g6' },
      ],
      items: [
        { kind: 'checkpoint', tx: 5, ty: 8, id: 'g5-cp' },
        { kind: 'npc', tx: 9, ty: 12, arg: 'gardensNpc', name: 'AUXILIAR', id: 'g5-npc' },
        { kind: 'health', tx: 20, ty: 5, id: 'g5-hp' },
      ],
      props: [
        { kind: 'sign', tx: 13, ty: 2, text: 'ACCESO VERDANT', color: '#ff2740' },
        { kind: 'flower', tx: 21, ty: 12, color: '#ff9ee8' },
      ],
      lights: [
        { tx: 13, ty: 2, r: 180, color: '#ff2740', alpha: 0.2 },
        { tx: 5, ty: 8, r: 140, color: '#3fe9ff', alpha: 0.3 },
      ],
    },
    {
      id: 'g6',
      zone: 'gardens',
      title: 'Corazón del Jardín',
      cols: 36,
      rows: 20,
      ops: [
        ['X', 2, 2, 3, 3],
        ['X', 31, 2, 3, 3],
        ['X', 2, 15, 3, 3],
        ['X', 31, 15, 3, 3],
        ['_', 13, 7, 10, 6],
      ],
      doors: [
        { side: 'w', at: 9, size: 3, to: 'g5' },
        { side: 'e', at: 9, size: 3, to: 'level:cathedral', lock: 'boss', label: 'LA CATEDRAL DE LA RED' },
      ],
      boss: 'verdant',
      bossIntro: 'verdantIntro',
      bossOutro: 'verdantOutro',
      reward: { fragment: 3, weapon: 'gauntlet', credits: 150 },
      music: 1,
      props: [
        { kind: 'flower', tx: 7, ty: 6, color: '#ff9ee8' },
        { kind: 'flower', tx: 28, ty: 6, color: '#ff9ee8' },
        { kind: 'flower', tx: 7, ty: 14, color: '#ff9ee8' },
        { kind: 'flower', tx: 28, ty: 14, color: '#ff9ee8' },
        { kind: 'plant', tx: 18, ty: 2, color: '#7cf6c8' },
      ],
      lights: [
        { tx: 18, ty: 10, r: 340, color: '#7cf6c8', alpha: 0.15 },
        { tx: 18, ty: 2, r: 160, color: '#7cf6c8', alpha: 0.24 },
      ],
    },
  ],
};

// --------------------------------------------------------------------------
//  NIVEL 4 — La Catedral de la Red
// --------------------------------------------------------------------------

const cathedral: LevelDef = {
  id: 'cathedral',
  name: 'NIVEL 4',
  subtitle: 'La Catedral de la Red',
  zone: 'cathedral',
  entryRoom: 'c1',
  rooms: [
    {
      id: 'c1',
      zone: 'cathedral',
      title: 'Nártex · Nivel 88',
      cols: 30,
      rows: 17,
      entry: [4, 8],
      onEnter: 'cathedralIntro',
      ops: [
        ['X', 10, 4, 2, 2],
        ['X', 10, 11, 2, 2],
        ['X', 19, 4, 2, 2],
        ['X', 19, 11, 2, 2],
        ['_', 13, 6, 5, 5],
      ],
      doors: [{ side: 'e', at: 7, size: 3, to: 'c2' }],
      items: [{ kind: 'checkpoint', tx: 5, ty: 8, id: 'c1-cp' }],
      props: [
        { kind: 'window', tx: 15, ty: 2, color: '#8b9cff' },
        { kind: 'server', tx: 25, ty: 5, color: '#8b9cff' },
        { kind: 'server', tx: 25, ty: 11, color: '#8b9cff' },
        { kind: 'banner', tx: 8, ty: 8, color: '#ffd166' },
      ],
      lights: [
        { tx: 15, ty: 2, r: 220, color: '#8b9cff', alpha: 0.24 },
        { tx: 5, ty: 8, r: 140, color: '#3fe9ff', alpha: 0.3 },
      ],
    },
    {
      id: 'c2',
      zone: 'cathedral',
      title: 'Nave de Servidores',
      cols: 36,
      rows: 18,
      onEnter: 'cathedralNodes',
      ops: [
        ['X', 7, 3, 2, 5],
        ['X', 7, 10, 2, 5],
        ['X', 16, 3, 2, 5],
        ['X', 16, 10, 2, 5],
        ['X', 25, 3, 2, 5],
        ['X', 25, 10, 2, 5],
        ['v', 12, 8, 2, 2],
        ['v', 21, 8, 2, 2],
      ],
      doors: [
        { side: 'w', at: 8, size: 3, to: 'c1' },
        { side: 'e', at: 8, size: 3, to: 'c3', lock: 'nodes' },
        { side: 'n', at: 31, size: 3, to: 'c2b' },
      ],
      spawns: [
        { type: 'firewallPaladin', tx: 12, ty: 4 },
        { type: 'dataSeraph', tx: 21, ty: 13 },
        { type: 'dataSeraph', tx: 30, ty: 5 },
      ],
      items: [
        { kind: 'node', tx: 11, ty: 15, id: 'c2-n1' },
        { kind: 'node', tx: 22, ty: 2, id: 'c2-n2' },
        { kind: 'node', tx: 31, ty: 15, id: 'c2-n3' },
      ],
      props: [
        { kind: 'server', tx: 7, ty: 8 },
        { kind: 'server', tx: 16, ty: 8 },
        { kind: 'server', tx: 25, ty: 8 },
        { kind: 'window', tx: 33, ty: 8, color: '#ffd166' },
      ],
      lights: [
        { tx: 18, ty: 9, r: 300, color: '#8b9cff', alpha: 0.12 },
        { tx: 33, ty: 8, r: 160, color: '#ffd166', alpha: 0.2 },
      ],
    },
    {
      id: 'c2b',
      zone: 'cathedral',
      title: 'Cripta de Datos',
      cols: 20,
      rows: 14,
      ops: [
        ['X', 3, 3, 2, 2],
        ['X', 15, 9, 2, 2],
        ['v', 9, 6, 2, 2],
      ],
      doors: [{ side: 's', at: 8, size: 3, to: 'c2' }],
      spawns: [
        { type: 'dataSeraph', tx: 6, ty: 9 },
        { type: 'codeInquisitor', tx: 15, ty: 4 },
      ],
      items: [
        { kind: 'upgrade', tx: 5, ty: 4, arg: 'energy', id: 'c2b-up' },
        { kind: 'credits', tx: 15, ty: 12, value: 110, id: 'c2b-cr' },
      ],
      props: [
        { kind: 'server', tx: 4, ty: 11 },
        { kind: 'window', tx: 10, ty: 2, color: '#8b9cff' },
      ],
      lights: [{ tx: 10, ty: 7, r: 170, color: '#8b9cff', alpha: 0.24 }],
    },
    {
      id: 'c3',
      zone: 'cathedral',
      title: 'Coro Digital',
      cols: 34,
      rows: 18,
      ops: [
        ['X', 9, 5, 3, 3],
        ['X', 22, 10, 3, 3],
        ['v', 16, 4, 3, 3],
        ['v', 16, 11, 3, 3],
        ['=', 5, 12, 3, 1],
        ['=', 27, 5, 3, 1],
      ],
      doors: [
        { side: 'w', at: 8, size: 3, to: 'c2' },
        { side: 'e', at: 8, size: 3, to: 'c4', lock: 'cleared' },
        { side: 's', at: 6, size: 3, to: 'c3b' },
      ],
      spawns: [
        { type: 'codeInquisitor', tx: 14, ty: 8 },
        { type: 'firewallPaladin', tx: 27, ty: 13 },
        { type: 'dataSeraph', tx: 12, ty: 14 },
        { type: 'dataSeraph', tx: 26, ty: 3 },
      ],
      props: [
        { kind: 'window', tx: 17, ty: 1, color: '#ffd166' },
        { kind: 'server', tx: 6, ty: 4 },
        { kind: 'server', tx: 30, ty: 14 },
        { kind: 'banner', tx: 9, ty: 15, color: '#8b9cff' },
      ],
      lights: [
        { tx: 17, ty: 1, r: 200, color: '#ffd166', alpha: 0.22 },
        { tx: 17, ty: 9, r: 260, color: '#8b9cff', alpha: 0.12 },
      ],
    },
    {
      id: 'c3b',
      zone: 'cathedral',
      title: 'Relicario',
      cols: 18,
      rows: 13,
      ops: [
        ['_', 6, 5, 6, 3],
        ['X', 3, 8, 2, 2],
        ['X', 13, 3, 2, 2],
      ],
      doors: [{ side: 'n', at: 7, size: 3, to: 'c3' }],
      spawns: [{ type: 'codeInquisitor', tx: 9, ty: 9 }],
      items: [
        { kind: 'healCharge', tx: 7, ty: 6, id: 'c3b-hc' },
        { kind: 'health', tx: 11, ty: 6, id: 'c3b-hp' },
        { kind: 'credits', tx: 4, ty: 3, value: 90, id: 'c3b-cr' },
      ],
      props: [{ kind: 'window', tx: 9, ty: 2, color: '#ffd166' }],
      lights: [{ tx: 9, ty: 6, r: 160, color: '#ffd166', alpha: 0.3 }],
    },
    {
      id: 'c4',
      zone: 'cathedral',
      title: 'Transepto de los Ecos',
      cols: 34,
      rows: 19,
      ops: [
        ['X', 6, 4, 2, 2],
        ['X', 26, 4, 2, 2],
        ['X', 6, 13, 2, 2],
        ['X', 26, 13, 2, 2],
        ['v', 15, 8, 4, 3],
      ],
      doors: [
        { side: 'w', at: 8, size: 3, to: 'c3' },
        { side: 'e', at: 8, size: 3, to: 'c5', lock: 'cleared' },
      ],
      spawns: [
        { type: 'vantaEcho', tx: 12, ty: 5 },
        { type: 'vantaEcho', tx: 22, ty: 14 },
        { type: 'firewallPaladin', tx: 17, ty: 15, elite: true },
        { type: 'dataSeraph', tx: 30, ty: 9 },
      ],
      props: [
        { kind: 'window', tx: 17, ty: 1, color: '#8b9cff' },
        { kind: 'banner', tx: 4, ty: 9, color: '#ffd166' },
        { kind: 'banner', tx: 30, ty: 9, color: '#ffd166' },
      ],
      lights: [{ tx: 17, ty: 9, r: 300, color: '#8b9cff', alpha: 0.14 }],
    },
    {
      id: 'c5',
      zone: 'cathedral',
      title: 'Ábside',
      cols: 26,
      rows: 16,
      ops: [
        ['=', 6, 5, 3, 1],
        ['=', 17, 10, 3, 1],
        ['_', 10, 6, 6, 4],
      ],
      doors: [
        { side: 'w', at: 7, size: 3, to: 'c4' },
        { side: 'e', at: 7, size: 3, to: 'c6' },
      ],
      items: [
        { kind: 'checkpoint', tx: 5, ty: 8, id: 'c5-cp' },
        { kind: 'npc', tx: 9, ty: 12, arg: 'cathedralNpc', name: 'TOBÍAS', id: 'c5-npc' },
        { kind: 'healCharge', tx: 20, ty: 5, id: 'c5-hc' },
        { kind: 'health', tx: 21, ty: 11, id: 'c5-hp' },
      ],
      props: [
        { kind: 'window', tx: 13, ty: 2, color: '#ffd166' },
        { kind: 'server', tx: 23, ty: 8 },
      ],
      lights: [
        { tx: 13, ty: 2, r: 200, color: '#ffd166', alpha: 0.24 },
        { tx: 5, ty: 8, r: 140, color: '#3fe9ff', alpha: 0.3 },
      ],
    },
    {
      id: 'c6',
      zone: 'cathedral',
      title: 'Cúspide de la Catedral',
      cols: 36,
      rows: 20,
      ops: [
        ['v', 2, 2, 4, 4],
        ['v', 30, 2, 4, 4],
        ['v', 2, 14, 4, 4],
        ['v', 30, 14, 4, 4],
        ['_', 13, 7, 10, 6],
      ],
      doors: [
        { side: 'w', at: 9, size: 3, to: 'c5' },
        { side: 'e', at: 9, size: 3, to: 'level:core', lock: 'boss', label: 'NÚCLEO DE AURELION' },
      ],
      boss: 'archivist',
      bossIntro: 'archivistIntro',
      bossOutro: 'archivistOutro',
      reward: { fragment: 4, credits: 200, upgrade: 'maxHp' },
      music: 1,
      props: [
        { kind: 'window', tx: 18, ty: 1, color: '#ffd166' },
        { kind: 'banner', tx: 9, ty: 4, color: '#8b9cff' },
        { kind: 'banner', tx: 27, ty: 4, color: '#8b9cff' },
      ],
      lights: [
        { tx: 18, ty: 10, r: 340, color: '#8b9cff', alpha: 0.15 },
        { tx: 18, ty: 1, r: 200, color: '#ffd166', alpha: 0.24 },
      ],
    },
  ],
};

// --------------------------------------------------------------------------
//  NÚCLEO — AURELION
// --------------------------------------------------------------------------

const core: LevelDef = {
  id: 'core',
  name: 'FINAL',
  subtitle: 'El Santo de las Máquinas',
  zone: 'core',
  entryRoom: 'x1',
  rooms: [
    {
      id: 'x1',
      zone: 'core',
      title: 'Ascenso al Núcleo · Nivel 100',
      cols: 30,
      rows: 17,
      entry: [4, 8],
      onEnter: 'coreApproach',
      ops: [
        ['v', 2, 2, 3, 3],
        ['v', 25, 2, 3, 3],
        ['v', 2, 12, 3, 3],
        ['v', 25, 12, 3, 3],
        ['_', 11, 6, 8, 5],
      ],
      doors: [
        { side: 'e', at: 7, size: 3, to: 'x2', label: 'NÚCLEO' },
      ],
      items: [
        { kind: 'checkpoint', tx: 6, ty: 8, id: 'x1-cp' },
        { kind: 'healCharge', tx: 15, ty: 4, id: 'x1-hc1' },
        { kind: 'healCharge', tx: 15, ty: 12, id: 'x1-hc2' },
        { kind: 'health', tx: 22, ty: 8, id: 'x1-hp' },
      ],
      props: [
        { kind: 'window', tx: 15, ty: 2, color: '#ffe3a3' },
        { kind: 'banner', tx: 8, ty: 4, color: '#ffe3a3' },
        { kind: 'banner', tx: 22, ty: 4, color: '#ffe3a3' },
      ],
      lights: [
        { tx: 15, ty: 2, r: 240, color: '#ffe3a3', alpha: 0.26 },
        { tx: 6, ty: 8, r: 140, color: '#3fe9ff', alpha: 0.3 },
      ],
    },
    {
      id: 'x2',
      zone: 'core',
      title: 'Cámara del Núcleo',
      cols: 38,
      rows: 21,
      ops: [
        ['v', 2, 2, 4, 4],
        ['v', 32, 2, 4, 4],
        ['v', 2, 15, 4, 4],
        ['v', 32, 15, 4, 4],
        ['_', 12, 7, 14, 7],
      ],
      doors: [{ side: 'w', at: 9, size: 3, to: 'x1', lock: 'boss' }],
      boss: 'aurelion',
      bossIntro: 'aurelionIntro',
      // The farewell + ending are driven by startEnding(), not the generic outro.
      reward: { credits: 0 },
      music: 1,
      props: [
        { kind: 'window', tx: 19, ty: 1, color: '#ffe3a3' },
        { kind: 'banner', tx: 8, ty: 10, color: '#ffe3a3' },
        { kind: 'banner', tx: 30, ty: 10, color: '#ffe3a3' },
      ],
      lights: [
        { tx: 19, ty: 10, r: 420, color: '#ffe3a3', alpha: 0.14 },
        { tx: 19, ty: 1, r: 220, color: '#fff7e0', alpha: 0.24 },
      ],
    },
  ],
};

export const LEVELS: Record<string, LevelDef> = {
  prologue,
  acid,
  market,
  gardens,
  cathedral,
  core,
};

export const LEVEL_ORDER = ['prologue', 'acid', 'market', 'gardens', 'cathedral', 'core'];

/** Upgrade catalogue — shared by pickups and the market vendor. */
export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  color: string;
  price: number;
  /** Times it can be bought/found in total. */
  max: number;
}

export const UPGRADES: Record<string, UpgradeDef> = {
  maxHp: {
    id: 'maxHp',
    name: 'Malla Dérmica',
    desc: '+25 de vida máxima (y te cura al instalarla).',
    color: '#ff6b8a',
    price: 120,
    max: 4,
  },
  healCharge: {
    id: 'healCharge',
    name: 'Ampolla de Reparación',
    desc: '+1 carga de curación permanente.',
    color: '#5cff9d',
    price: 100,
    max: 4,
  },
  dodge: {
    id: 'dodge',
    name: 'Servo de Reflejo',
    desc: '−0,08 s al enfriamiento de esquiva.',
    color: '#5df2ff',
    price: 110,
    max: 3,
  },
  damage: {
    id: 'damage',
    name: 'Amplificador de Filo',
    desc: '+12 % de daño con todas las armas.',
    color: '#ffb03a',
    price: 140,
    max: 3,
  },
  energy: {
    id: 'energy',
    name: 'Célula Resonante',
    desc: '+6 de regeneración de carga por segundo.',
    color: '#5db8ff',
    price: 110,
    max: 3,
  },
};
