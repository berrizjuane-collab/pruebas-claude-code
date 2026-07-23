/**
 * Startup experience: a real (progress-driven) loading screen, a title card with
 * "enter with / without sound", and a short, skippable cinematic reveal.
 *
 * The loading bar reflects genuine initialization steps reported by main.ts — it
 * is not a fake timed delay.
 */

import { h, button } from './dom.ts';

const SCIENCE_LINES = [
  'A teaspoon of its matter would weigh billions of tonnes.',
  'It spins hundreds of times per second, dragging its magnetic field with it.',
  'So compact that you can see more than half of its surface at once.',
  'A city-sized nucleus, denser than an atom, brighter than a thousand suns in X-rays.',
];

export class Intro {
  readonly root: HTMLElement;
  private bar: HTMLElement;
  private status: HTMLElement;
  private loading: HTMLElement;
  private titleCard: HTMLElement;
  private skipBtn: HTMLElement;

  constructor() {
    this.bar = h('div', { class: 'load-bar-fill' });
    this.status = h('div', { class: 'load-status', text: 'Initializing…' });
    this.loading = h('div', { class: 'intro-loading' }, [
      h('div', { class: 'load-bar' }, [this.bar]),
      this.status,
    ]);

    this.titleCard = h('div', { class: 'intro-title hidden' });
    this.skipBtn = button('Skip intro →', () => this.onSkip?.(), 'btn btn-skip');
    this.skipBtn.classList.add('hidden');

    this.root = h('div', { class: 'intro' }, [
      h('div', { class: 'intro-bg' }),
      h('div', { class: 'intro-content' }, [
        h('h1', { class: 'intro-heading', text: 'Neutron Star Observatory' }),
        h('p', { class: 'intro-tag', text: SCIENCE_LINES[Math.floor(Math.random() * SCIENCE_LINES.length)] }),
        this.loading,
        this.titleCard,
      ]),
      this.skipBtn,
    ]);
  }

  onSkip?: () => void;

  setProgress(p: number, label?: string): void {
    this.bar.style.width = `${Math.round(p * 100)}%`;
    if (label) this.status.textContent = label;
  }

  /** Swap the progress bar for the start buttons; resolves with sound choice. */
  showStart(): Promise<boolean> {
    this.loading.classList.add('hidden');
    this.titleCard.classList.remove('hidden');
    return new Promise((resolve) => {
      const withSound = button('Enter with sound', () => resolve(true), 'btn btn-primary');
      const noSound = button('Enter (silent)', () => resolve(false), 'btn');
      this.titleCard.append(
        h('p', { class: 'intro-note', text: 'Audio is a data sonification, not literal sound.' }),
        h('div', { class: 'intro-buttons' }, [withSound, noSound]),
      );
    });
  }

  /** Reveal the skip button during the cinematic. */
  enableSkip(cb: () => void): void {
    this.onSkip = cb;
    this.titleCard.classList.add('hidden');
    this.skipBtn.classList.remove('hidden');
  }

  fadeOut(): void {
    this.root.classList.add('fade-out');
    window.setTimeout(() => this.root.remove(), 900);
  }
}
