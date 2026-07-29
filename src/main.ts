/**
 * Application entry point. Boots the engine, world, camera and overlay, drives
 * the real progress-based opening, then hands control to the viewer.
 */

import './style.css';

import { detectCapabilities } from './core/capabilities.ts';
import { QualityManager } from './core/QualityManager.ts';
import { Engine } from './core/Engine.ts';
import { World } from './scene/World.ts';
import { CameraRig } from './camera/CameraRig.ts';
import { Store } from './state/Store.ts';
import { Overlay } from './ui/Overlay.ts';
import { Intro } from './ui/intro.ts';
import { lightCurveIntensity } from './physics/pulsar.ts';

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

async function boot(): Promise<void> {
  const intro = new Intro();
  document.body.append(intro.root);
  await nextFrame();

  const caps = detectCapabilities();
  intro.setProgress(0.1);
  await nextFrame();

  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const store = new Store();
  const quality = new QualityManager(store.get().quality, caps);
  let settings = quality.settings();

  intro.setProgress(0.24);
  let engine: Engine;
  try {
    engine = new Engine(canvas, settings);
  } catch (err) {
    showFatal(
      'WebGL is unavailable',
      'This piece needs a WebGL2-capable browser and GPU. Try a recent desktop Chrome, Firefox, Edge or Safari.',
    );
    console.error(err);
    return;
  }
  intro.setProgress(0.42);
  await nextFrame();

  const world = new World(engine);
  world.applyQuality(settings, engine.renderer.getPixelRatio());
  intro.setProgress(0.76);
  await nextFrame();

  const camera = new CameraRig(engine.camera, canvas);
  camera.setMode(store.get().cameraMode);
  camera.setAngle(store.get().viewAngle);
  intro.setProgress(0.9);
  await nextFrame();

  const overlay = new Overlay(store, {
    onCameraMode: (mode) => {
      store.set({ cameraMode: mode });
      camera.setMode(mode);
    },
    onAngle: (angle) => {
      store.set({ viewAngle: angle });
      camera.setAngle(angle);
    },
    onSpeed: (speed) => store.set({ speed }),
  });
  document.body.append(overlay.root);

  if (import.meta.env.DEV) {
    // Dev-only handle so an automated harness can assert on camera state
    // directly — a pixel diff cannot separate camera motion from the star's own
    // rotation. Vite substitutes `false` here for production, so the block and
    // the reference are dead-code-eliminated from the shipped bundle.
    (window as unknown as Record<string, unknown>).__rig = camera;
  }

  quality.onSettingsChange((qs) => {
    settings = qs;
    engine.applySettings(qs);
    world.applyQuality(qs, engine.renderer.getPixelRatio());
  });

  // ── frame loop ────────────────────────────────────────────────────────────
  engine.addUpdater((dt, elapsed) => {
    const s = store.get();
    world.update(dt, elapsed, s);
    camera.update(dt, { starRadius: world.star.worldRadius });
    // Drive the aperture flare from the same beam/observer geometry that decides
    // whether a pulse is visible, so the optics react to the lighthouse.
    engine.setStarburstFlare(
      lightCurveIntensity(
        world.phase,
        s.params.magneticInclination,
        s.observerInclination,
        s.beamWidth,
      ),
    );
    overlay.tick(dt);
    if (quality.getLevel() === 'adaptive') quality.update(dt);
  });

  engine.start();
  intro.setProgress(1);
  await nextFrame();

  // Hold on black for a beat, then glide in from far out.
  camera.beginIntro(store.get().reducedMotion ? 2 : 8);
  await intro.finish();
  window.setTimeout(() => overlay.revealTitle(), store.get().reducedMotion ? 200 : 2200);
}

function showFatal(title: string, body: string): void {
  const el = document.createElement('div');
  el.className = 'fatal';
  el.innerHTML = `<div class="fatal-card"><h1></h1><p></p></div>`;
  el.querySelector('h1')!.textContent = title;
  el.querySelector('p')!.textContent = body;
  document.body.append(el);
}

boot().catch((err) => {
  console.error(err);
  showFatal('Something went wrong', 'The visualization failed to start. Check the console for details.');
});
