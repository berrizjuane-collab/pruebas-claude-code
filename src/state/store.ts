import type { Mat2, Vec2 } from '../math/types';
import { fromColumns, IDENTITY, multiply, sanitizeMat } from '../math/mat2';
import { clamp01, easeInOutCubic, interpolateMat, isSimilarity, type InterpMode } from '../math/interpolate';
import type { ShowFlags } from '../rendering/scene';

/**
 * One stage of an animation: "starting from the already-applied matrix `pre`,
 * gradually apply `apply` on top". The displayed matrix during the stage is
 *
 *     M(t) = interpolate(I → apply, t) · pre
 *
 * A plain identity→A animation is the single segment {pre: I, apply: A};
 * "A then B" is [{pre: I, apply: A}, {pre: A, apply: B}], which makes the
 * second stage literally show B deforming the already-A-transformed space.
 * Note that for {pre: I, apply: A} this reduces to (1−t)·I + t·A, the default
 * interpolation, and the product over all segments is exactly the target.
 */
export interface AnimSegment {
  pre: Mat2;
  apply: Mat2;
}

export type ModuleId = 'lab' | 'deform';
export type FigureId = 'none' | 'square' | 'circle' | 'cat';
export type ToolId = 'transform' | 'addVector';
export type InterpPref = 'auto' | InterpMode;

export interface DeformOptions {
  figure: FigureId;
  pointField: boolean;
  vectorField: boolean;
  denseGrid: boolean;
}

export interface LabState {
  module: ModuleId;
  /** The transformation being studied (the matrix in the inputs). */
  target: Mat2;
  /** Animation plan; invariant: applying all segments yields `target`. */
  segments: AnimSegment[];
  /** Raw (uneased) global progress through `segments`, in [0, 1]. */
  t: number;
  playing: boolean;
  interpPref: InterpPref;
  show: ShowFlags;
  tool: ToolId;
  customVectors: Vec2[];
  compA: Mat2;
  compB: Mat2;
  deform: DeformOptions;
}

export const ANIM_SECONDS_PER_SEGMENT = 1.7;

export const initialState: LabState = {
  module: 'lab',
  target: IDENTITY,
  segments: [{ pre: IDENTITY, apply: IDENTITY }],
  t: 1,
  playing: false,
  interpPref: 'auto',
  show: {
    baseGrid: true,
    axisNumbers: true,
    transformedGrid: true,
    basisVectors: true,
    determinant: true,
    eigenvectors: true,
    labels: true,
  },
  tool: 'transform',
  customVectors: [],
  compA: { a: 0, b: -1, c: 1, d: 0 }, // 90° rotation
  compB: { a: 1, b: 1, c: 0, d: 1 }, // shear
  deform: { figure: 'circle', pointField: false, vectorField: false, denseGrid: true },
};

export type Action =
  | { type: 'setModule'; module: ModuleId }
  | { type: 'setTarget'; matrix: Mat2 }
  | { type: 'dragBasis'; which: 'i' | 'j'; to: Vec2 }
  | { type: 'loadPreset'; matrix: Mat2 }
  | { type: 'animate' }
  | { type: 'tick'; dtSeconds: number }
  | { type: 'scrub'; t: number }
  | { type: 'reset' }
  | { type: 'setInterpPref'; pref: InterpPref }
  | { type: 'toggleShow'; key: keyof ShowFlags }
  | { type: 'setTool'; tool: ToolId }
  | { type: 'addVector'; v: Vec2 }
  | { type: 'clearVectors' }
  | { type: 'setCompA'; matrix: Mat2 }
  | { type: 'setCompB'; matrix: Mat2 }
  | { type: 'swapComp' }
  | { type: 'animateComposition'; firstThen: ['A', 'B'] | ['B', 'A'] }
  | { type: 'setDeform'; patch: Partial<DeformOptions> };

/** Replace the studied matrix and show it fully applied (t = 1). */
function withTarget(state: LabState, m: Mat2): LabState {
  const target = sanitizeMat(m);
  return {
    ...state,
    target,
    segments: [{ pre: IDENTITY, apply: target }],
    t: 1,
    playing: false,
  };
}

export function reducer(state: LabState, action: Action): LabState {
  switch (action.type) {
    case 'setModule':
      return { ...state, module: action.module };

    case 'setTarget':
      return withTarget(state, action.matrix);

    case 'dragBasis': {
      const col1 = action.which === 'i' ? action.to : { x: state.target.a, y: state.target.c };
      const col2 = action.which === 'j' ? action.to : { x: state.target.b, y: state.target.d };
      return withTarget(state, fromColumns(col1, col2));
    }

    case 'loadPreset': {
      const target = sanitizeMat(action.matrix);
      return {
        ...state,
        target,
        segments: [{ pre: IDENTITY, apply: target }],
        t: 0,
        playing: true,
      };
    }

    case 'animate':
      return { ...state, t: 0, playing: true };

    case 'tick': {
      if (!state.playing) return state;
      const duration = ANIM_SECONDS_PER_SEGMENT * state.segments.length;
      const t = state.t + action.dtSeconds / duration;
      if (t >= 1) return { ...state, t: 1, playing: false };
      return { ...state, t };
    }

    case 'scrub':
      return { ...state, t: clamp01(action.t), playing: false };

    case 'reset':
      return withTarget(state, IDENTITY);

    case 'setInterpPref':
      return { ...state, interpPref: action.pref };

    case 'toggleShow':
      return { ...state, show: { ...state.show, [action.key]: !state.show[action.key] } };

    case 'setTool':
      return { ...state, tool: action.tool };

    case 'addVector':
      return { ...state, customVectors: [...state.customVectors, action.v] };

    case 'clearVectors':
      return { ...state, customVectors: [] };

    case 'setCompA':
      return { ...state, compA: sanitizeMat(action.matrix) };

    case 'setCompB':
      return { ...state, compB: sanitizeMat(action.matrix) };

    case 'swapComp':
      return { ...state, compA: state.compB, compB: state.compA };

    case 'animateComposition': {
      const [first, second] =
        action.firstThen[0] === 'A' ? [state.compA, state.compB] : [state.compB, state.compA];
      // Applying `first` then `second` is the product second·first.
      const target = multiply(second, first);
      return {
        ...state,
        target,
        segments: [
          { pre: IDENTITY, apply: first },
          { pre: first, apply: second },
        ],
        t: 0,
        playing: true,
      };
    }

    case 'setDeform':
      return { ...state, deform: { ...state.deform, ...action.patch } };
  }
}

/* --------------------------- derived state --------------------------- */

/** The interpolation mode a segment actually uses under the given preference. */
export function segmentMode(pref: InterpPref, seg: AnimSegment): InterpMode {
  if (pref === 'auto') return isSimilarity(seg.apply) ? 'rotational' : 'linear';
  return pref;
}

interface SegmentPosition {
  index: number;
  /** Eased local progress within the segment. */
  tLocal: number;
}

function segmentPosition(state: LabState): SegmentPosition {
  const n = state.segments.length;
  const g = clamp01(state.t) * n;
  const index = Math.min(Math.floor(g), n - 1);
  return { index, tLocal: easeInOutCubic(g - index) };
}

/** The matrix shown on screen right now: M(t) along the animation path. */
export function displayedMatrix(state: LabState): Mat2 {
  const { index, tLocal } = segmentPosition(state);
  const seg = state.segments[index];
  const partial = interpolateMat(IDENTITY, seg.apply, tLocal, segmentMode(state.interpPref, seg));
  return multiply(partial, seg.pre);
}

/** Mode of the segment currently on screen (for the UI explanation note). */
export function activeInterpMode(state: LabState): InterpMode {
  const { index } = segmentPosition(state);
  return segmentMode(state.interpPref, state.segments[index]);
}
