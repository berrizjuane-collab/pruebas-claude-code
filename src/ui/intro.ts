/**
 * Opening sequence: a black screen, a hairline progress rule, and a wordmark.
 *
 * The progress is real — main.ts reports genuine initialization steps — but there
 * is no "enter" button any more. Nothing needs a user gesture now that the piece
 * is silent, and a click-through would break the one thing an opening like this
 * is for: arriving already inside the shot.
 */

export class Intro {
  readonly root: HTMLElement;
  private bar: HTMLElement;
  private mark: HTMLElement;

  constructor() {
    this.bar = document.createElement('div');
    this.bar.className = 'boot-bar-fill';

    const track = document.createElement('div');
    track.className = 'boot-bar';
    track.append(this.bar);

    this.mark = document.createElement('div');
    this.mark.className = 'boot-mark';
    this.mark.textContent = 'Neutron Star';

    const inner = document.createElement('div');
    inner.className = 'boot-inner';
    inner.append(this.mark, track);

    this.root = document.createElement('div');
    this.root.className = 'boot';
    this.root.append(inner);
  }

  setProgress(p: number): void {
    this.bar.style.width = `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;
  }

  /** Fade to the scene. Resolves once the element is gone. */
  finish(): Promise<void> {
    this.root.classList.add('done');
    return new Promise((resolve) => {
      window.setTimeout(() => {
        this.root.remove();
        resolve();
      }, 1400);
    });
  }
}
