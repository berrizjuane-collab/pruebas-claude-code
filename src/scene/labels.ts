/**
 * Lightweight canvas-based text labels rendered as camera-facing sprites.
 * Kept minimal (one small canvas per label) and disposed with the scene.
 */

import * as THREE from 'three';

export interface LabelHandle {
  sprite: THREE.Sprite;
  setText: (text: string) => void;
  dispose: () => void;
}

export function makeLabel(
  text: string,
  color = '#bfe3ff',
  scale = 0.5,
): LabelHandle {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const dpr = 2;

  const draw = (t: string): void => {
    const font = `600 ${28 * dpr}px ui-sans-serif, system-ui, sans-serif`;
    ctx.font = font;
    const w = Math.max(8, ctx.measureText(t).width) + 24 * dpr;
    const h = 40 * dpr;
    canvas.width = w;
    canvas.height = h;
    ctx.font = font;
    ctx.clearRect(0, 0, w, h);
    // Soft backing for legibility over bright scene elements.
    ctx.fillStyle = 'rgba(4, 8, 18, 0.55)';
    ctx.strokeStyle = 'rgba(120, 170, 230, 0.25)';
    roundRect(ctx, 2, 2, w - 4, h - 4, 8 * dpr);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(t, 14 * dpr, h / 2 + 1);
    texture.needsUpdate = true;
    sprite.scale.set((w / h) * scale, scale, 1);
  };

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 999;

  draw(text);

  return {
    sprite,
    setText: draw,
    dispose: () => {
      texture.dispose();
      material.dispose();
    },
  };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
