/**
 * The 3D stage: a stylized dark Tokyo basemap as the ground plane, the metro
 * network sitting just beneath it at its (subtle) real relative depths,
 * orbitable camera, and a bloom pass that only picks up HDR-boosted
 * (highlighted) elements — the resting map stays deliberately quiet.
 */
import React, { Suspense, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import Network from './Network.jsx';
import { getTokyoMapTexture, MAP } from './tokyoMap.js';
import { useStore } from '../state/store.js';

/** Advances the algorithm playback with real frame time. */
function Ticker() {
  useFrame((_, dt) => {
    useStore.getState().tick(Math.min(dt, 0.1));
  });
  return null;
}

/** Stylized Tokyo basemap at ground level (y = 0). */
function TokyoBasemap() {
  const texture = useMemo(() => getTokyoMapTexture(), []);
  const w = MAP.x1 - MAP.x0;
  const h = MAP.z1 - MAP.z0;
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[(MAP.x0 + MAP.x1) / 2, 0, (MAP.z0 + MAP.z1) / 2]}
      renderOrder={-1}
    >
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

export default function MetroScene() {
  return (
    <Canvas
      dpr={[1, 2]}
      flat
      camera={{ position: [3, 33, 22], fov: 40, near: 0.1, far: 500 }}
      gl={{ antialias: true }}
      onPointerMissed={() => useStore.getState().hoverStation(null)}
      style={{ position: 'fixed', inset: 0 }}
    >
      <color attach="background" args={['#060a18']} />
      <fog attach="fog" args={['#060a18', 70, 150]} />
      <ambientLight intensity={0.6} />

      <Suspense fallback={null}>
        <TokyoBasemap />
        <Network />
      </Suspense>

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        target={[3, 0, -1]}
        minDistance={5}
        maxDistance={95}
        maxPolarAngle={Math.PI * 0.47}
      />

      <EffectComposer disableNormalPass multisampling={4}>
        <Bloom mipmapBlur intensity={1.1} luminanceThreshold={0.32} luminanceSmoothing={0.12} radius={0.75} />
      </EffectComposer>

      <Ticker />
    </Canvas>
  );
}
