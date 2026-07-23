/**
 * The UI controller. Builds every panel (info, controls, maths, science,
 * charts, toolbar), wires them to the Store / World / Camera / Audio / Quality,
 * and keeps read-outs live. Panels are semi-transparent and collapsible; an
 * immersive mode hides them entirely. Charts and read-outs update on a throttled
 * cadence, decoupled from the render loop.
 */

import type { Store } from '../state/Store.ts';
import type { World } from '../scene/World.ts';
import type { CameraRig } from '../camera/CameraRig.ts';
import type { AudioEngine } from '../audio/AudioEngine.ts';
import type { QualityManager } from '../core/QualityManager.ts';
import type { Engine } from '../core/Engine.ts';
import type { AppState, CameraMode, BackgroundMode, QualityLevel } from '../state/types.ts';
import { PRESETS } from '../physics/presets.ts';
import { warnings } from '../physics/NeutronStarModel.ts';
import { fmt, sci, toGauss, toKm, toSolarMasses, fromKm, fromSolarMasses } from '../physics/units.ts';
import { radialProfile, LAYERS } from '../physics/interior.ts';
import { countPeaks } from '../physics/pulsar.ts';
import { ARTICLES } from './science.ts';
import { FormulaPanel } from './formulaPanel.ts';
import { LightCurveChart, HistoryChart, ScopeChart, RadialChart } from './charts.ts';
import { h, button, slider, section, toggle, buttonGroup } from './dom.ts';

export interface UIDeps {
  store: Store;
  world: World;
  camera: CameraRig;
  audio: AudioEngine;
  quality: QualityManager;
  engine: Engine;
  onQualityChange: (level: QualityLevel) => void;
}

export class UI {
  readonly root: HTMLElement;
  private readouts = new Map<string, HTMLElement>();
  private formulaPanel = new FormulaPanel();
  private lightCurve = new LightCurveChart('chart chart-lc');
  private history = new HistoryChart('chart chart-hist');
  private scope = new ScopeChart('chart chart-scope');
  private radial = new RadialChart('chart chart-radial');
  private warningsEl: HTMLElement;
  private fpsEl: HTMLElement;
  private scopeData: Uint8Array | null = null;

  // Control setters kept so presets/state changes reflect into the widgets.
  private setters: {
    sliders: Record<string, (v: number) => void>;
    camera?: (m: CameraMode) => void;
    background?: (m: BackgroundMode) => void;
    quality?: (q: QualityLevel) => void;
    toggles: Record<string, (v: boolean) => void>;
    freqInput?: HTMLInputElement;
    peakInfo?: HTMLElement;
  } = { sliders: {}, toggles: {} };

  private chartAccum = 0;

  constructor(private deps: UIDeps) {
    this.root = h('div', { class: 'ui-root' });
    this.warningsEl = h('div', { class: 'warnings' });
    this.fpsEl = h('div', { class: 'fps hidden' });

    this.root.append(
      this.buildMainPanel(),
      this.buildControls(),
      this.buildRightPanel(),
      this.buildBottomBar(),
      this.buildToolbar(),
      this.warningsEl,
      this.fpsEl,
      this.buildHelp(),
      this.buildMobileNav(),
    );

    this.deps.store.subscribe((s) => this.refresh(s));
    this.installShortcuts();
    // Initial fill.
    requestAnimationFrame(() => {
      this.resizeCharts();
      this.refresh(this.deps.store.get());
    });
  }

  // ── Main info panel ───────────────────────────────────────────────────────
  private buildMainPanel(): HTMLElement {
    const stat = (id: string, label: string): HTMLElement => {
      const val = h('span', { class: 'stat-value', text: '—' });
      this.readouts.set(id, val);
      return h('div', { class: 'stat' }, [h('span', { class: 'stat-label', text: label }), val]);
    };

    const presetSelect = h('select', { class: 'preset-select' }) as HTMLSelectElement;
    for (const p of PRESETS) presetSelect.append(h('option', { value: p.id, text: p.name }));
    presetSelect.addEventListener('change', () => this.deps.store.loadPreset(presetSelect.value));
    this.setters.sliders['__preset'] = (v: number) => {
      presetSelect.selectedIndex = v;
    };

    const desc = h('p', { class: 'preset-desc' });
    this.readouts.set('presetDesc', desc);

    return h('div', { class: 'panel panel-main', id: 'panel-main' }, [
      h('div', { class: 'brand' }, [
        h('span', { class: 'brand-title', text: 'Neutron Star Observatory' }),
        h('span', { class: 'brand-sub', text: 'interactive relativistic pulsar' }),
      ]),
      h('label', { class: 'field' }, [
        h('span', { class: 'field-label', text: 'Preset' }),
        presetSelect,
      ]),
      desc,
      h('div', { class: 'stat-grid' }, [
        stat('mass', 'Mass'),
        stat('radius', 'Radius'),
        stat('temp', 'Temperature'),
        stat('freq', 'Spin'),
        stat('period', 'Period'),
        stat('bfield', 'B field'),
        stat('compact', 'Compactness'),
        stat('redshift', 'Redshift z'),
        stat('veq', 'Eq. velocity'),
        stat('erot', 'E_rot'),
        stat('density', 'Mean ρ'),
        stat('gravity', 'Surface g'),
      ]),
    ]);
  }

  // ── Controls drawer ───────────────────────────────────────────────────────
  private buildControls(): HTMLElement {
    const store = this.deps.store;
    const s = store.get();

    // Rotation ---------------------------------------------------------------
    const rot = section('Rotation & time', true);
    const playBtn = button('❚❚ Pause', () => {
      const st = store.get();
      store.set({ playing: !st.playing });
      playBtn.textContent = store.get().playing ? '❚❚ Pause' : '▶ Play';
    });
    const transport = h('div', { class: 'row' }, [
      playBtn,
      button('⟲ Restart', () => this.deps.world.resetPhase()),
    ]);
    const speed = buttonGroup(
      [
        { id: 'slow', label: 'Slow' },
        { id: 'normal', label: '1×' },
        { id: 'fast', label: 'Fast' },
      ],
      'normal',
      (id) => store.set({ timeScale: id === 'slow' ? 0.25 : id === 'fast' ? 3 : 1 }),
    );
    const modeToggle = buttonGroup(
      [
        { id: 'educational', label: 'Educational', title: 'Rotation slowed to a viewable rate (real spin still shown).' },
        { id: 'physical', label: 'Physical', title: 'Rotate at the true spin frequency.' },
      ],
      s.rotationMode,
      (id) => store.set({ rotationMode: id }),
    );
    this.setters.toggles['rotMode'] = () => modeToggle.set(store.get().rotationMode);

    const freqInput = h('input', {
      type: 'number',
      class: 'num-input',
      min: 0.1,
      max: 700,
      step: 0.1,
      value: s.params.spinFrequency,
    }) as HTMLInputElement;
    freqInput.addEventListener('change', () => {
      const v = parseFloat(freqInput.value);
      if (isFinite(v)) store.setParam('spinFrequency', v);
    });
    this.setters.freqInput = freqInput;

    const peakInfo = h('div', { class: 'hint' });
    this.setters.peakInfo = peakInfo;

    rot.body.append(
      transport,
      h('div', { class: 'row-label', text: 'Speed' }),
      speed.root,
      h('div', { class: 'row-label', text: 'Rotation mode' }),
      modeToggle.root,
      h('label', { class: 'field' }, [
        h('span', { class: 'field-label', text: 'Spin frequency (Hz)' }),
        freqInput,
      ]),
      peakInfo,
    );

    // Physical parameters ----------------------------------------------------
    const params = section('Physical parameters', false);
    const mkSlider = (
      key: keyof AppState['params'] | 'mass' | 'radius',
      opts: Parameters<typeof slider>[0],
    ): HTMLElement => {
      const sl = slider(opts);
      this.setters.sliders[key as string] = sl.set;
      return sl.root;
    };
    params.body.append(
      mkSlider('mass', {
        label: 'Mass', unit: 'M☉', min: 1.0, max: 2.3, step: 0.01, value: toSolarMasses(s.params.mass),
        format: (v) => v.toFixed(2), onInput: (v) => store.setParam('mass', fromSolarMasses(v)),
      }),
      mkSlider('radius', {
        label: 'Radius', unit: 'km', min: 9, max: 15, step: 0.1, value: toKm(s.params.radius),
        format: (v) => v.toFixed(1), onInput: (v) => store.setParam('radius', fromKm(v)),
      }),
      mkSlider('spinFrequency', {
        label: 'Spin frequency', unit: 'Hz', min: 0.1, max: 700, step: 0.1, log: true,
        value: s.params.spinFrequency, format: (v) => fmt(v, 3),
        onInput: (v) => store.setParam('spinFrequency', v),
      }),
      mkSlider('temperature', {
        label: 'Surface temperature', unit: 'K', min: 1e5, max: 1e7, step: 1, log: true,
        value: s.params.temperature, format: (v) => sci(v, 2),
        onInput: (v) => store.setParam('temperature', v),
      }),
      mkSlider('magneticField', {
        label: 'Polar B field', unit: 'T', min: 1e6, max: 1e11, step: 1, log: true,
        value: s.params.magneticField, format: (v) => `${sci(v, 2)} (${sci(toGauss(v), 2)} G)`,
        onInput: (v) => store.setParam('magneticField', v),
      }),
      mkSlider('magneticInclination', {
        label: 'Magnetic obliquity α', unit: '°', min: 0, max: 90, step: 1,
        value: (s.params.magneticInclination * 180) / Math.PI, format: (v) => v.toFixed(0),
        onInput: (v) => store.setParam('magneticInclination', (v * Math.PI) / 180),
      }),
      mkSlider('inertiaFactor', {
        label: 'Inertia factor k', min: 0.3, max: 0.45, step: 0.005, value: s.params.inertiaFactor,
        format: (v) => v.toFixed(3), onInput: (v) => store.setParam('inertiaFactor', v),
      }),
    );

    // Emission / observer ----------------------------------------------------
    const emit = section('Beams & observer', false);
    const mkS2 = (key: string, opts: Parameters<typeof slider>[0]): HTMLElement => {
      const sl = slider(opts);
      this.setters.sliders[key] = sl.set;
      return sl.root;
    };
    emit.body.append(
      mkS2('beamIntensity', {
        label: 'Beam intensity', min: 0, max: 1, step: 0.01, value: s.beamIntensity,
        onInput: (v) => store.set({ beamIntensity: v }),
      }),
      mkS2('beamWidth', {
        label: 'Beam half-width', unit: '°', min: 3, max: 45, step: 1,
        value: (s.beamWidth * 180) / Math.PI, format: (v) => v.toFixed(0),
        onInput: (v) => store.set({ beamWidth: (v * Math.PI) / 180 }),
      }),
      mkS2('observerInclination', {
        label: 'Observer inclination i', unit: '°', min: 0, max: 90, step: 1,
        value: (s.observerInclination * 180) / Math.PI, format: (v) => v.toFixed(0),
        onInput: (v) => store.set({ observerInclination: (v * Math.PI) / 180 }),
      }),
      mkS2('fieldLineDensity', {
        label: 'Field-line density', min: 0, max: 1, step: 0.01, value: s.fieldLineDensity,
        onInput: (v) => store.set({ fieldLineDensity: v }),
      }),
    );

    // Layers -----------------------------------------------------------------
    const layers = section('Scene layers', false);
    const layerToggle = (key: keyof AppState['layers'], label: string): HTMLElement => {
      const t = toggle(label, s.layers[key], (v) => this.deps.store.setLayers({ [key]: v }));
      this.setters.toggles[key] = (val: boolean) => t.set(val);
      return t.root;
    };
    layers.body.append(
      layerToggle('magneticField', 'Magnetic field lines'),
      layerToggle('magnetosphere', 'Magnetosphere particles'),
      layerToggle('beams', 'Pulsar beams'),
      layerToggle('lightCylinder', 'Light cylinder'),
      layerToggle('axes', 'Spin / magnetic axes'),
      layerToggle('lensing', 'Gravitational lensing'),
      layerToggle('interior', 'Interior cross-section'),
    );

    // Background -------------------------------------------------------------
    const bg = section('Background', false);
    const bgGroup = buttonGroup<BackgroundMode>(
      [
        { id: 'cinematic', label: 'Cinematic' },
        { id: 'scientific', label: 'Sober' },
        { id: 'lab', label: 'Black' },
        { id: 'grid', label: 'Grid' },
      ],
      s.backgroundMode,
      (id) => store.set({ backgroundMode: id }),
    );
    this.setters.background = bgGroup.set;
    bg.body.append(bgGroup.root);

    // Audio ------------------------------------------------------------------
    const audio = section('Audio (sonification)', false);
    audio.body.append(this.buildAudioControls());

    // Quality ----------------------------------------------------------------
    const qual = section('Graphics quality', false);
    const qGroup = buttonGroup<QualityLevel>(
      [
        { id: 'low', label: 'Low' },
        { id: 'medium', label: 'Medium' },
        { id: 'high', label: 'High' },
        { id: 'ultra', label: 'Ultra' },
        { id: 'adaptive', label: 'Auto' },
      ],
      s.quality,
      (id) => {
        store.set({ quality: id });
        this.deps.onQualityChange(id);
      },
    );
    this.setters.quality = qGroup.set;
    const qNote = h('p', { class: 'hint', text: 'Auto adjusts detail to hold ~55 FPS.' });
    qual.body.append(qGroup.root, qNote);

    return h('div', { class: 'panel panel-controls', id: 'panel-controls' }, [
      rot.root,
      params.root,
      emit.root,
      layers.root,
      bg.root,
      audio.root,
      qual.root,
    ]);
  }

  private buildAudioControls(): HTMLElement {
    const store = this.deps.store;
    const audio = this.deps.audio;
    const s = store.get();

    const startBtn = button('🔊 Enable audio', async () => {
      await audio.start();
      store.setAudio({ started: true });
      audio.setVolume(store.get().audio.volume);
      audio.setScientific(store.get().audio.scientific);
      audio.setCinematic(store.get().audio.cinematic);
      startBtn.textContent = 'Audio enabled';
      startBtn.setAttribute('disabled', '');
    });

    const sci = toggle('Scientific pulses', s.audio.scientific, (v) => {
      store.setAudio({ scientific: v });
      audio.setScientific(v);
    });
    const cine = toggle('Cinematic drone (artistic)', s.audio.cinematic, (v) => {
      store.setAudio({ cinematic: v });
      audio.setCinematic(v);
    });
    const sync = toggle('Sync to rotation', s.audio.syncRotation, (v) =>
      store.setAudio({ syncRotation: v }),
    );
    const mute = toggle('Mute', s.audio.muted, (v) => {
      store.setAudio({ muted: v });
      audio.setMuted(v);
    });
    const vol = slider({
      label: 'Volume', min: 0, max: 1, step: 0.01, value: s.audio.volume,
      onInput: (v) => {
        store.setAudio({ volume: v });
        audio.setVolume(v);
      },
    });

    return h('div', {}, [
      startBtn,
      h('p', { class: 'hint', text: 'Space is silent — this is a data sonification, not literal sound.' }),
      sci.root,
      cine.root,
      sync.root,
      mute.root,
      vol.root,
      this.scope.canvas,
    ]);
  }

  // ── Right panel: tabs ─────────────────────────────────────────────────────
  private buildRightPanel(): HTMLElement {
    const tabs = ['Maths', 'Science', 'Interior'];
    const tabBar = h('div', { class: 'tab-bar' });
    const pages: HTMLElement[] = [];

    const mathsPage = h('div', { class: 'tab-page' }, [this.formulaPanel.root]);
    const sciencePage = h('div', { class: 'tab-page' }, this.buildScience());
    const interiorPage = h('div', { class: 'tab-page' }, this.buildInterior());
    pages.push(mathsPage, sciencePage, interiorPage);

    const buttons: HTMLButtonElement[] = [];
    tabs.forEach((t, i) => {
      const b = button(t, () => {
        pages.forEach((p, j) => p.classList.toggle('active', i === j));
        buttons.forEach((bb, j) => bb.classList.toggle('active', i === j));
        // The interior charts live in a hidden tab; size + redraw them on show.
        if (i === 2) {
          this.radial.resize();
          this.updateInterior(this.deps.store.get());
        }
      }, 'tab');
      buttons.push(b);
      tabBar.append(b);
    });
    buttons[0].classList.add('active');
    mathsPage.classList.add('active');

    return h('div', { class: 'panel panel-right', id: 'panel-right' }, [tabBar, ...pages]);
  }

  private buildScience(): HTMLElement[] {
    return ARTICLES.map((a) =>
      h('details', { class: 'article' }, [
        h('summary', { text: a.title }),
        h('div', { class: 'article-body', html: a.body }),
      ]),
    );
  }

  private buildInterior(): HTMLElement[] {
    // Layer legend, from surface (top) inward.
    const rows = [...LAYERS]
      .sort((a, b) => b.rOuter - a.rOuter)
      .map((l) =>
        h('div', { class: 'layer-row' }, [
          h('span', { class: 'layer-swatch', style: { background: l.color } }),
          h('div', { class: 'layer-text' }, [
            h('div', { class: 'layer-name' }, [
              document.createTextNode(l.name + ' '),
              h('span', { class: `layer-cert cert-${l.certainty}`, text: l.certainty }),
            ]),
            h('div', { class: 'layer-detail', text: `ρ ≈ ${sci(l.density)} kg/m³ · ${l.composition}` }),
          ]),
        ]),
      );

    return [
      h('p', {
        class: 'hint',
        text: 'Schematic layers — NOT a TOV solution. Enable "Interior cross-section" in Scene layers to view the 3D cutaway.',
      }),
      h('div', { class: 'chart-wrap' }, [
        h('div', { class: 'chart-title', text: 'Radial profiles (normalised)' }),
        this.radial.canvas,
        h('div', { class: 'chart-legend' }, [
          h('span', { class: 'lg lg-d', text: 'density' }),
          h('span', { class: 'lg lg-p', text: 'pressure' }),
          h('span', { class: 'lg lg-m', text: 'enclosed mass' }),
        ]),
      ]),
      h('div', { class: 'layer-list' }, rows),
    ];
  }

  // ── Bottom bar: transport + light curve ───────────────────────────────────
  private buildBottomBar(): HTMLElement {
    return h('div', { class: 'panel panel-bottom', id: 'panel-bottom' }, [
      h('div', { class: 'chart-wrap' }, [
        h('div', { class: 'chart-title', text: 'Light curve (intensity vs. phase)' }),
        this.lightCurve.canvas,
      ]),
      h('div', { class: 'chart-wrap' }, [
        h('div', { class: 'chart-title', text: 'Observed pulse train' }),
        this.history.canvas,
      ]),
    ]);
  }

  // ── Toolbar ───────────────────────────────────────────────────────────────
  private buildToolbar(): HTMLElement {
    const store = this.deps.store;
    const cameraGroup = buttonGroup<CameraMode>(
      [
        { id: 'orbit', label: 'Orbit' },
        { id: 'free', label: 'Free' },
        { id: 'fixed', label: 'Fixed' },
        { id: 'polar', label: 'Polar' },
        { id: 'magnetic', label: 'Magnetic' },
        { id: 'equatorial', label: 'Equator' },
        { id: 'observer', label: 'Observer' },
        { id: 'cinematic', label: 'Cinematic' },
        { id: 'closeup', label: 'Close-up' },
      ],
      store.get().cameraMode,
      (id) => {
        store.set({ cameraMode: id });
        this.deps.camera.setMode(id);
      },
    );
    this.setters.camera = cameraGroup.set;

    const toolbar = h('div', { class: 'toolbar', id: 'toolbar' }, [
      h('div', { class: 'toolbar-cameras' }, [
        h('span', { class: 'toolbar-label', text: 'Camera' }),
        cameraGroup.root,
      ]),
      h('div', { class: 'toolbar-actions' }, [
        button('Safe view', () => {
          this.deps.camera.resetToSafe();
          store.set({ cameraMode: 'orbit' });
          cameraGroup.set('orbit');
        }, 'btn'),
        button('⤢ Cinematic ⏯', () => this.deps.camera.toggleCinematic(), 'btn'),
        button('📷 Snapshot', () => this.screenshot(), 'btn'),
        button('⛶ Fullscreen', () => this.toggleFullscreen(), 'btn'),
        button('↺ Reset params', () => store.loadPreset(store.get().presetId), 'btn'),
        button('👁 Immersive', () => this.toggleImmersive(), 'btn'),
        button('? Help', () => this.toggleHelp(), 'btn'),
      ]),
    ]);
    return toolbar;
  }

  // ── Mobile navigation ─────────────────────────────────────────────────────
  // On small screens all panels are hidden by default (scene as hero); this
  // bottom nav reveals one panel at a time so nothing overlaps.
  private buildMobileNav(): HTMLElement {
    const items: Array<{ id: string; label: string }> = [
      { id: 'info', label: 'Info' },
      { id: 'controls', label: 'Controls' },
      { id: 'data', label: 'Data' },
      { id: 'camera', label: 'Camera' },
      { id: 'scene', label: 'Hide' },
    ];
    const btns = new Map<string, HTMLButtonElement>();
    const nav = h('div', { class: 'mobile-nav' });
    for (const it of items) {
      const b = h('button', {
        class: 'mnav-btn', text: it.label, type: 'button',
        onClick: () => {
          for (const cls of ['m-info', 'm-controls', 'm-data', 'm-camera']) this.root.classList.remove(cls);
          if (it.id !== 'scene') this.root.classList.add(`m-${it.id}`);
          for (const [k, bb] of btns) bb.classList.toggle('active', k === it.id);
        },
      });
      btns.set(it.id, b);
      nav.append(b);
    }
    return nav;
  }

  // ── Help overlay ──────────────────────────────────────────────────────────
  private helpEl!: HTMLElement;
  private buildHelp(): HTMLElement {
    const rows: Array<[string, string]> = [
      ['Space', 'Play / pause rotation'],
      ['H', 'Toggle immersive (hide UI)'],
      ['C', 'Cycle camera mode'],
      ['V', 'Safe view'],
      ['F', 'Fullscreen'],
      ['P', 'Snapshot (PNG)'],
      ['1–5', 'Load preset'],
      ['Drag', 'Orbit (orbit mode)'],
      ['Scroll', 'Zoom'],
      ['WASD/QE', 'Fly (free camera)'],
    ];
    this.helpEl = h('div', { class: 'help-overlay hidden' }, [
      h('div', { class: 'help-card' }, [
        h('div', { class: 'help-head' }, [
          h('h2', { text: 'Controls & shortcuts' }),
          button('✕', () => this.toggleHelp(), 'btn btn-icon'),
        ]),
        h('div', { class: 'help-grid' }, rows.flatMap(([k, v]) => [
          h('kbd', { text: k }),
          h('span', { text: v }),
        ])),
        h('div', { class: 'accessibility' }, [
          h('h3', { text: 'Accessibility' }),
          this.buildAccessibility(),
        ]),
        h('p', { class: 'hint', text: 'Colours and audio are visual/data translations of X-ray/radio phenomena. Distances beyond the star (light cylinder, magnetosphere) are visually compressed and labelled as such.' }),
      ]),
    ]);
    return this.helpEl;
  }

  private buildAccessibility(): HTMLElement {
    const store = this.deps.store;
    const s = store.get();
    const rm = toggle('Reduce motion', s.reducedMotion, (v) => store.set({ reducedMotion: v }));
    const rf = toggle('Reduce flashing / bright pulses', s.reducedFlashing, (v) =>
      store.set({ reducedFlashing: v }),
    );
    const fps = toggle('Show FPS', s.showFps, (v) => {
      store.set({ showFps: v });
      this.fpsEl.classList.toggle('hidden', !v);
    });
    return h('div', {}, [rm.root, rf.root, fps.root]);
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  private toggleImmersive(): void {
    const s = this.deps.store.get();
    const next = !s.immersive;
    this.deps.store.set({ immersive: next });
    this.root.classList.toggle('immersive', next);
  }

  private toggleHelp(): void {
    this.helpEl.classList.toggle('hidden');
  }

  private async toggleFullscreen(): Promise<void> {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen().catch(() => {});
    else await document.exitFullscreen().catch(() => {});
  }

  private screenshot(): void {
    this.deps.engine.requestCapture((dataUrl) => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `neutron-star-${Date.now()}.png`;
      a.click();
    });
  }

  private installShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const store = this.deps.store;
      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          store.set({ playing: !store.get().playing });
          break;
        case 'h': this.toggleImmersive(); break;
        case 'v': this.deps.camera.resetToSafe(); store.set({ cameraMode: 'orbit' }); this.setters.camera?.('orbit'); break;
        case 'f': void this.toggleFullscreen(); break;
        case 'p': this.screenshot(); break;
        case '?': this.toggleHelp(); break;
        case 'c': {
          const modes: CameraMode[] = ['orbit', 'free', 'fixed', 'polar', 'magnetic', 'equatorial', 'observer', 'cinematic', 'closeup'];
          const cur = modes.indexOf(store.get().cameraMode);
          const next = modes[(cur + 1) % modes.length];
          store.set({ cameraMode: next });
          this.deps.camera.setMode(next);
          this.setters.camera?.(next);
          break;
        }
        default:
          if (/^[1-5]$/.test(e.key)) {
            const p = PRESETS[parseInt(e.key, 10) - 1];
            if (p) store.loadPreset(p.id);
          }
      }
    });
  }

  // ── Live refresh ──────────────────────────────────────────────────────────
  private refresh(s: AppState): void {
    const d = s.derived;
    const set = (id: string, v: string): void => {
      const el = this.readouts.get(id);
      if (el) el.textContent = v;
    };
    set('mass', `${toSolarMasses(s.params.mass).toFixed(2)} M☉`);
    set('radius', `${toKm(s.params.radius).toFixed(1)} km`);
    set('temp', `${sci(s.params.temperature, 2)} K`);
    set('freq', `${fmt(s.params.spinFrequency, 3)} Hz`);
    set('period', d.period * 1e3 < 1000 ? `${fmt(d.period * 1e3, 3)} ms` : `${fmt(d.period, 3)} s`);
    set('bfield', `${sci(toGauss(s.params.magneticField), 2)} G`);
    set('compact', fmt(d.compactness, 3));
    set('redshift', fmt(d.gravitationalRedshift, 3));
    set('veq', `${(d.equatorialBeta * 100).toFixed(2)}% c`);
    set('erot', `${sci(d.rotationalEnergy, 2)} J`);
    set('density', `${sci(d.meanDensity, 2)} kg/m³`);
    set('gravity', `${sci(d.surfaceGravityRelativistic, 2)} m/s²`);

    const preset = PRESETS.find((p) => p.id === s.presetId);
    set('presetDesc', preset?.description ?? '');

    // Reflect widgets that presets/state changed.
    this.setters.sliders['__preset']?.(PRESETS.findIndex((p) => p.id === s.presetId));
    this.setters.sliders['mass']?.(toSolarMasses(s.params.mass));
    this.setters.sliders['radius']?.(toKm(s.params.radius));
    this.setters.sliders['spinFrequency']?.(s.params.spinFrequency);
    this.setters.sliders['temperature']?.(s.params.temperature);
    this.setters.sliders['magneticField']?.(s.params.magneticField);
    this.setters.sliders['magneticInclination']?.((s.params.magneticInclination * 180) / Math.PI);
    this.setters.sliders['inertiaFactor']?.(s.params.inertiaFactor);
    this.setters.sliders['beamWidth']?.((s.beamWidth * 180) / Math.PI);
    this.setters.sliders['observerInclination']?.((s.observerInclination * 180) / Math.PI);
    this.setters.camera?.(s.cameraMode);
    this.setters.background?.(s.backgroundMode);
    this.setters.quality?.(s.quality);
    this.setters.toggles['rotMode']?.(false);
    for (const key of Object.keys(s.layers) as Array<keyof AppState['layers']>) {
      this.setters.toggles[key]?.(s.layers[key]);
    }
    if (this.setters.freqInput) this.setters.freqInput.value = String(fmt(s.params.spinFrequency, 4));

    // Formulas.
    this.formulaPanel.update({ params: s.params, derived: s.derived });

    // Warnings.
    this.renderWarnings(s);

    // Peaks / period hint.
    const shape = this.deps.world.lightCurveShape(s);
    const peaks = countPeaks(shape);
    const rpm = s.params.spinFrequency * 60;
    if (this.setters.peakInfo) {
      this.setters.peakInfo.textContent =
        `${peaks === 0 ? 'No beam crosses the observer' : peaks === 1 ? '1 peak per rotation' : `${peaks} peaks per rotation`} · ${fmt(rpm, 3)} RPM`;
    }

    // Radial profiles + interior legend.
    this.updateInterior(s);
  }

  private renderWarnings(s: AppState): void {
    const list = warnings(s.params, s.derived);
    this.warningsEl.innerHTML = '';
    for (const w of list) {
      this.warningsEl.append(
        h('div', { class: `warn warn-${w.level}` }, [
          h('span', { class: 'warn-icon', text: w.level === 'danger' ? '⚠' : w.level === 'warn' ? '▲' : 'ℹ' }),
          h('span', { text: w.message }),
        ]),
      );
    }
  }

  private updateInterior(s: AppState): void {
    const profile = radialProfile(s.params, s.derived, 64);
    const maxRho = Math.max(...profile.map((p) => p.density));
    const maxP = Math.max(...profile.map((p) => p.pressure));
    this.radial.draw([
      { label: 'density', color: '#6fb6e8', values: profile.map((p) => p.density / maxRho) },
      { label: 'pressure', color: '#c9a8ff', values: profile.map((p) => p.pressure / maxP) },
      { label: 'mass', color: '#7ce0b0', values: profile.map((p) => p.massFraction) },
    ]);
  }

  private resizeCharts(): void {
    this.lightCurve.resize();
    this.history.resize();
    this.scope.resize();
    this.radial.resize();
  }

  onResize(): void {
    this.resizeCharts();
  }

  /** Called every frame; throttles chart/read-out updates internally. */
  tick(dt: number): void {
    const s = this.deps.store.get();
    // FPS.
    if (s.showFps) this.fpsEl.textContent = `${this.deps.quality.fps.toFixed(0)} FPS · ${this.deps.quality.getLevel()}`;

    // Charts at ~20 Hz.
    this.chartAccum += dt;
    if (this.chartAccum > 0.05) {
      this.chartAccum = 0;
      this.lightCurve.draw(this.deps.world.lightCurveShape(s), this.deps.world.phase);
      this.history.draw(this.deps.world.intensityHistory, this.deps.world.historyHead);
      const an = this.deps.audio.getAnalyser();
      if (an) {
        if (!this.scopeData || this.scopeData.length !== an.frequencyBinCount) {
          this.scopeData = new Uint8Array(an.frequencyBinCount);
        }
        an.getByteTimeDomainData(this.scopeData);
        this.scope.draw(this.scopeData);
      } else {
        this.scope.draw(null);
      }
    }
  }
}
