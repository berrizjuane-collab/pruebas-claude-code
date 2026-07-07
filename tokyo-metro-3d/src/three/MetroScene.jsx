/**
 * The 3D stage: deep-navy space, subtle floor grid far below the network,
 * orbitable camera, and a bloom pass that only picks up HDR-boosted
 * (highlighted) elements — the resting map stays deliberately quiet.
 */
import React, { Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import Network from './Network.jsx';
import { useStore } from '../state/store.js';

/** Advances the algorithm playback with real frame time. */
function Ticker() {
  useFrame((_, dt) => {
    useStore.getState().tick(Math.min(dt, 0.1));
  });
  return null;
}

export default function MetroScene() {
  return (
    <Canvas
      dpr={[1, 2]}
      flat
      camera={{ position: [2, 23, 28], fov: 40, near: 0.1, far: 500 }}
      gl={{ antialias: true }}
      onPointerMissed={() => useStore.getState().hoverStation(null)}
      style={{ position: 'fixed', inset: 0 }}
    >
      <color attach="background" args={['#060a18']} />
      <fog attach="fog" args={['#060a18', 60, 140]} />
      <ambientLight intensity={0.6} />

      <Suspense fallback={null}>
        <Network />
      </Suspense>

      <Grid
        position={[2, -5.2, -1]}
        args={[90, 90]}
        cellSize={2}
        cellThickness={0.4}
        cellColor="#0d1c33"
        sectionSize={10}
        sectionThickness={0.8}
        sectionColor="#12294a"
        fadeDistance={110}
        fadeStrength={2.5}
      />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        target={[2, -1.6, -0.5]}
        minDistance={5}
        maxDistance={95}
        maxPolarAngle={Math.PI * 0.495}
      />

      <EffectComposer disableNormalPass multisampling={4}>
        <Bloom mipmapBlur intensity={1.1} luminanceThreshold={0.32} luminanceSmoothing={0.12} radius={0.75} />
      </EffectComposer>

      <Ticker />
    </Canvas>
  );
}
