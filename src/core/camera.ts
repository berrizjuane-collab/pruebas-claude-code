import { VIEW_H, VIEW_W } from './render';
import { clamp, damp, rand } from './util';

/**
 * Smooth follow camera with clamping to room bounds, screen shake and a
 * kick impulse used for heavy hits. Rooms smaller than the viewport are centred.
 */
export class Camera {
  x = 0;
  y = 0;
  targetX = 0;
  targetY = 0;
  private shakeAmount = 0;
  private shakeDecay = 4;
  private kickX = 0;
  private kickY = 0;
  offsetX = 0;
  offsetY = 0;
  worldW = VIEW_W;
  worldH = VIEW_H;
  zoom = 1;

  setBounds(w: number, h: number): void {
    this.worldW = w;
    this.worldH = h;
  }

  snapTo(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
    this.x = x;
    this.y = y;
    this.clampToBounds();
  }

  follow(x: number, y: number, dt: number, lead = 0): void {
    this.targetX = x;
    this.targetY = y;
    const rate = 7.5;
    this.x = damp(this.x, x, rate, dt);
    this.y = damp(this.y, y, rate, dt);
    void lead;
    this.clampToBounds();
  }

  private clampToBounds(): void {
    const halfW = VIEW_W / 2;
    const halfH = VIEW_H / 2;
    if (this.worldW <= VIEW_W) this.x = this.worldW / 2;
    else this.x = clamp(this.x, halfW, this.worldW - halfW);
    if (this.worldH <= VIEW_H) this.y = this.worldH / 2;
    else this.y = clamp(this.y, halfH, this.worldH - halfH);
  }

  shake(amount: number, decay = 4): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
    this.shakeDecay = decay;
  }

  kick(angle: number, force: number): void {
    this.kickX += Math.cos(angle) * force;
    this.kickY += Math.sin(angle) * force;
  }

  update(dt: number): void {
    this.shakeAmount = Math.max(0, this.shakeAmount - this.shakeAmount * this.shakeDecay * dt - dt * 0.5);
    this.kickX = damp(this.kickX, 0, 9, dt);
    this.kickY = damp(this.kickY, 0, 9, dt);
    const s = this.shakeAmount;
    this.offsetX = rand(-s, s) + this.kickX;
    this.offsetY = rand(-s, s) + this.kickY;
  }

  /** Apply the camera transform to a context (call inside save/restore). */
  apply(ctx: CanvasRenderingContext2D): void {
    ctx.translate(VIEW_W / 2, VIEW_H / 2);
    if (this.zoom !== 1) ctx.scale(this.zoom, this.zoom);
    ctx.translate(-(this.x + this.offsetX), -(this.y + this.offsetY));
  }

  get left(): number {
    return this.x + this.offsetX - VIEW_W / 2 / this.zoom;
  }
  get top(): number {
    return this.y + this.offsetY - VIEW_H / 2 / this.zoom;
  }
  get right(): number {
    return this.left + VIEW_W / this.zoom;
  }
  get bottom(): number {
    return this.top + VIEW_H / this.zoom;
  }

  /** Frustum test with a margin so entities are not popped at the edge. */
  visible(x: number, y: number, r: number): boolean {
    return x + r > this.left && x - r < this.right && y + r > this.top && y - r < this.bottom;
  }
}
