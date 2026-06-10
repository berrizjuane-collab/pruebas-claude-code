import { useState, type Dispatch } from 'react';
import type { Mat2 } from '../math/types';
import { IDENTITY } from '../math/mat2';
import { projection, reflection, rotation, scaling, shear } from '../math/presets';
import type { Action } from '../state/store';

type PresetId = 'identity' | 'rotation' | 'scale' | 'shear' | 'reflection' | 'projection';

const DESCRIPTIONS: Record<PresetId, string> = {
  identity: 'Does nothing — î and ĵ stay put. The reference point all other transformations are measured against.',
  rotation:
    'Turns the whole plane around the origin. Lengths and areas are preserved (det = 1). Except at 0° and 180°, no direction is left unturned — the eigenvalues are complex.',
  scale: 'Stretches space along the axes. Areas scale by det = sx·sy; the axes themselves are the eigendirections.',
  shear:
    'Slides ĵ sideways while î stays fixed: rectangles become slanted parallelograms, but areas never change (det = 1). The x-axis is the single invariant line (a defective, repeated eigenvalue).',
  reflection:
    'Mirrors the plane across a line through the origin. det = −1: sizes are kept but orientation flips — watch the parallelogram turn hatched. Eigenvalues +1 (the mirror line) and −1 (its perpendicular).',
  projection:
    'Flattens every point perpendicularly onto a line: det = 0, rank 1. The perpendicular direction is the kernel — it is sent entirely to the origin, and the plane collapses onto the violet image line.',
};

const degToRad = (deg: number) => (deg * Math.PI) / 180;

export interface PresetBarProps {
  dispatch: Dispatch<Action>;
}

/**
 * Classic transformations, one click away. Clicking a preset loads it *and*
 * animates from the identity; moving a parameter slider updates the target
 * live (so you can feel the family of transformations continuously).
 */
export function PresetBar({ dispatch }: PresetBarProps) {
  const [selected, setSelected] = useState<PresetId>('rotation');
  const [rotationDeg, setRotationDeg] = useState(90);
  const [uniformScale, setUniformScale] = useState(1.5);
  const [sx, setSx] = useState(2);
  const [sy, setSy] = useState(0.5);
  const [uniform, setUniform] = useState(true);
  const [shearK, setShearK] = useState(1);
  const [lineDeg, setLineDeg] = useState(45);

  const build = (id: PresetId): Mat2 => {
    switch (id) {
      case 'identity':
        return IDENTITY;
      case 'rotation':
        return rotation(degToRad(rotationDeg));
      case 'scale':
        return uniform ? scaling(uniformScale, uniformScale) : scaling(sx, sy);
      case 'shear':
        return shear(shearK);
      case 'reflection':
        return reflection(degToRad(lineDeg));
      case 'projection':
        return projection(degToRad(lineDeg));
    }
  };

  const load = (id: PresetId) => {
    setSelected(id);
    dispatch({ type: 'loadPreset', matrix: build(id) });
  };

  /** Slider edits re-target live (no replay) so the change is felt continuously. */
  const retarget = (id: PresetId, m: Mat2) => {
    setSelected(id);
    dispatch({ type: 'setTarget', matrix: m });
  };

  return (
    <details className="panel-section" open>
      <summary>Presets</summary>
      <div className="panel-section-body">
        <div className="btn-row">
          {(
            [
              ['identity', 'Identity'],
              ['rotation', 'Rotation'],
              ['scale', 'Scaling'],
              ['shear', 'Shear'],
              ['reflection', 'Reflection'],
              ['projection', 'Projection'],
            ] as Array<[PresetId, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              className={`btn small${selected === id ? ' active' : ''}`}
              onClick={() => load(id)}
              title="Load and animate this transformation"
            >
              {label}
            </button>
          ))}
        </div>

        {selected === 'rotation' && (
          <div className="slider-row">
            <label htmlFor="preset-angle">θ</label>
            <input
              id="preset-angle"
              type="range"
              min={-180}
              max={180}
              step={1}
              value={rotationDeg}
              onChange={(e) => {
                const deg = Number(e.target.value);
                setRotationDeg(deg);
                retarget('rotation', rotation(degToRad(deg)));
              }}
            />
            <span className="value">{rotationDeg}°</span>
          </div>
        )}

        {selected === 'scale' && (
          <>
            <label className="check">
              <input type="checkbox" checked={uniform} onChange={(e) => setUniform(e.target.checked)} />
              uniform (same factor both axes)
            </label>
            {uniform ? (
              <div className="slider-row">
                <label htmlFor="preset-k">k</label>
                <input
                  id="preset-k"
                  type="range"
                  min={-2}
                  max={3}
                  step={0.05}
                  value={uniformScale}
                  onChange={(e) => {
                    const k = Number(e.target.value);
                    setUniformScale(k);
                    retarget('scale', scaling(k, k));
                  }}
                />
                <span className="value">{uniformScale.toFixed(2)}</span>
              </div>
            ) : (
              <>
                <div className="slider-row">
                  <label htmlFor="preset-sx">sx</label>
                  <input
                    id="preset-sx"
                    type="range"
                    min={-2}
                    max={3}
                    step={0.05}
                    value={sx}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setSx(v);
                      retarget('scale', scaling(v, sy));
                    }}
                  />
                  <span className="value">{sx.toFixed(2)}</span>
                </div>
                <div className="slider-row">
                  <label htmlFor="preset-sy">sy</label>
                  <input
                    id="preset-sy"
                    type="range"
                    min={-2}
                    max={3}
                    step={0.05}
                    value={sy}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setSy(v);
                      retarget('scale', scaling(sx, v));
                    }}
                  />
                  <span className="value">{sy.toFixed(2)}</span>
                </div>
              </>
            )}
          </>
        )}

        {selected === 'shear' && (
          <div className="slider-row">
            <label htmlFor="preset-shear">k</label>
            <input
              id="preset-shear"
              type="range"
              min={-2}
              max={2}
              step={0.05}
              value={shearK}
              onChange={(e) => {
                const v = Number(e.target.value);
                setShearK(v);
                retarget('shear', shear(v));
              }}
            />
            <span className="value">{shearK.toFixed(2)}</span>
          </div>
        )}

        {(selected === 'reflection' || selected === 'projection') && (
          <div className="slider-row">
            <label htmlFor="preset-line" title="Angle of the mirror/projection line through the origin">
              line
            </label>
            <input
              id="preset-line"
              type="range"
              min={0}
              max={180}
              step={1}
              value={lineDeg}
              onChange={(e) => {
                const deg = Number(e.target.value);
                setLineDeg(deg);
                retarget(selected, selected === 'reflection' ? reflection(degToRad(deg)) : projection(degToRad(deg)));
              }}
            />
            <span className="value">{lineDeg}°</span>
          </div>
        )}

        <p className="hint">{DESCRIPTIONS[selected]}</p>
      </div>
    </details>
  );
}
