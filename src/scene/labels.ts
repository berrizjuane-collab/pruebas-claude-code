/**
 * Lightweight canvas-based text labels rendered as camera-facing sprites.
 *
 * Styled as instrument annotations rather than UI chips: a small leader dot, a
 * hairline rule, and short tracked uppercase text with a glow instead of an
 * opaque plate. They stay legible over the bright scene without covering it,
 * which matters because the labelled axes pass straight through the subject.
 *
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
  scale = 0.22,
): LabelHandle {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const dpr = 2;
  const FS = 26; // font size in css px before dpr
  const PAD = 10;
  const DOT = 5;
  const RULE = 14;

  const draw = (t: string): void => {
    const font = `600 ${FS * dpr}px ui-sans-serif, system-ui, sans-serif`;
    ctx.font = font;
    // Tracked-out uppercase reads as instrumentation; measure with the tracking
    // baked in so the canvas is sized correctly.
    const tracking = 1.6 * dpr;
    const label = t.toUpperCase();
    const textW = ctx.measureText(label).width + tracking * label.length;
    const w = Math.ceil(textW + (PAD * 2 + DOT + RULE) * dpr);
    const h = Math.ceil((FS + 14) * dpr);
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.font = font;

    const mid = h / 2;

    // Leader dot + hairline rule pointing back at the thing being labelled.
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(DOT * dpr, mid, (DOT * dpr) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.45;
    ctx.fillRect(DOT * 1.6 * dpr, mid - 0.5 * dpr, RULE * dpr, 1 * dpr);
    ctx.globalAlpha = 1;

    // Glow behind the glyphs instead of a filled plate: legible over the star,
    // invisible over empty sky.
    const x0 = (DOT * 1.6 + RULE + PAD) * dpr;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(3, 8, 20, 0.95)';
    ctx.shadowBlur = 7 * dpr;
    ctx.fillStyle = color;
    let x = x0;
    for (const ch of label) {
      ctx.fillText(ch, x, mid + 1);
      x += ctx.measureText(ch).width + tracking;
    }
    ctx.shadowBlur = 0;

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
    opacity: 0.92,
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 999;
  // Anchor at the leader dot, so the label hangs off its anchor point instead of
  // straddling it and covering what it names.
  sprite.center.set(0.02, 0.5);

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
