/**
 * Application entry point. Boots the engine, world, camera, audio and UI, drives
 * the real progress-based loading screen, plays a short skippable cinematic
 * reveal, and then hands control to the user.
 */

import * as THREE from 'three';
import 'katex/dist/katex.min.css';
import './style.css';

import { detectCapabilities } from './core/capabilities.ts';
import { QualityManager } from './core/QualityManager.ts';
import { Engine } from './core/Engine.ts';
import { AudioEngine } from './audio/AudioEngine.ts';
import { World } from './scene/World.ts';
import { CameraRig } from './camera/CameraRig.ts';
import { Store } from './state/Store.ts';
import { UI } from './ui/UI.ts';
import { Intro } from './ui/intro.ts';

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

async function boot(): Promise<void> {
  const intro = new Intro();
  document.body.append(intro.root);
  await nextFrame();

  const caps = detectCapabilities();
  intro.setProgress(0.08, 'Detecting hardware…');
  await nextFrame();

  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const store = new Store();
  const quality = new QualityManager(store.get().quality, caps);
  let settings = quality.settings();

  // ── Renderer / engine ──────────────────────────────────────────────────
  intro.setProgress(0.18, 'Creating renderer…');
  let engine: Engine;
  try {
    engine = new Engine(canvas, settings);
  } catch (err) {
    showFatal(
      'WebGL is unavailable',
      'This experience needs a WebGL2-capable browser and GPU. Please try a recent desktop Chrome, Firefox, Edge or Safari.',
    );
    console.error(err);
    return;
  }
  intro.setProgress(0.32, 'Compiling shaders…');
  await nextFrame();

  // ── World ──────────────────────────────────────────────────────────────
  const audio = new AudioEngine();
  intro.setProgress(0.44, 'Building the star…');
  await nextFrame();
  const world = new World(engine, audio);
  world.applyQuality(settings, engine.renderer.getPixelRatio());
  intro.setProgress(0.66, 'Weaving the magnetosphere…');
  await nextFrame();

  // ── Camera & UI ────────────────────────────────────────────────────────
  const camera = new CameraRig(engine.camera, canvas);
  intro.setProgress(0.8, 'Calibrating instruments…');
  await nextFrame();

  const ui = new UI({
    store,
    world,
    camera,
    audio,
    quality,
    engine,
    onQualityChange: (level) => {
      quality.setLevel(level);
      settings = quality.settings();
      engine.applySettings(settings);
      world.applyQuality(settings, engine.renderer.getPixelRatio());
    },
  });
  document.body.append(ui.root);

  // Adaptive quality feeds settings back into the engine + world.
  quality.onSettingsChange((qs) => {
    settings = qs;
    engine.applySettings(qs);
    world.applyQuality(qs, engine.renderer.getPixelRatio());
  });
  engine.onResize(() => ui.onResize());

  // ── Frame loop ─────────────────────────────────────────────────────────
  const magVec = new THREE.Vector3();
  const spinVec = new THREE.Vector3(0, 1, 0);
  const obsVec = new THREE.Vector3();
  engine.addUpdater((dt, elapsed) => {
    const s = store.get();
    world.update(dt, elapsed, s);
    world.magneticAxisVec(s, magVec);
    world.observerDirVec(s, obsVec);
    camera.update(dt, {
      starRadius: world.star.worldRadius,
      magneticAxis: magVec,
      spinAxis: spinVec,
      observerDir: obsVec,
      reducedMotion: s.reducedMotion,
    });
    ui.tick(dt);
    if (quality.getLevel() === 'adaptive') quality.update(dt);
  });

  engine.start();
  intro.setProgress(1, 'Ready');
  await nextFrame();

  // ── Title card → sound choice ──────────────────────────────────────────
  const withSound = await intro.showStart();
  if (withSound) {
    try {
      await audio.start();
      const a = store.get().audio;
      store.setAudio({ started: true });
      audio.setVolume(a.volume);
      audio.setScientific(a.scientific);
      audio.setCinematic(a.cinematic);
    } catch (e) {
      console.warn('Audio could not start:', e);
    }
  }

  // ── Cinematic reveal (skippable) ───────────────────────────────────────
  runCinematic(store, camera, intro);
}

/** Short scripted reveal: fly in, then progressively switch on the layers. */
function runCinematic(store: Store, camera: CameraRig, intro: Intro): void {
  const timers: number[] = [];
  const original = { ...store.get().layers };

  store.set({ cameraMode: 'cinematic' });
  camera.setMode('cinematic');
  store.setLayers({ magneticField: false, magnetosphere: false, beams: false });

  timers.push(window.setTimeout(() => store.setLayers({ magneticField: true }), 3500));
  timers.push(window.setTimeout(() => store.setLayers({ magnetosphere: true }), 5200));
  timers.push(window.setTimeout(() => store.setLayers({ beams: true }), 6800));

  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    for (const t of timers) clearTimeout(t);
    store.setLayers(original);
    store.set({ cameraMode: 'orbit' });
    camera.resetToSafe();
    intro.fadeOut();
  };

  intro.enableSkip(finish);
  timers.push(window.setTimeout(finish, 12000));
}

function showFatal(title: string, body: string): void {
  const el = document.createElement('div');
  el.className = 'fatal';
  el.innerHTML = `<div class="fatal-card"><h1>${title}</h1><p>${body}</p></div>`;
  document.body.append(el);
}

boot().catch((err) => {
  console.error(err);
  showFatal('Something went wrong', 'The visualization failed to start. Check the console for details.');
});
