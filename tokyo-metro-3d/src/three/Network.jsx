/**
 * The network itself: one tube mesh per edge (bowed toward its line's depth
 * layer), one sphere + glow sprite per station, canvas-billboard labels for
 * the major hubs. Every element subscribes to the store with a tiny selector
 * that returns a token string, so only elements whose state actually changed
 * re-render during animation.
 */
import * as THREE from 'three';
import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useCursor } from '@react-three/drei';
import { GRAPH, depthY } from '../graph/buildGraph.js';
import { LINE_BY_ID } from '../data/lines.js';
import { useStore } from '../state/store.js';
import {
  edgeToken, EDGE_PARAMS, nodeToken, NODE_PARAMS,
  getGlowTexture, getLabelTexture, hdrColor,
} from './appearance.js';

const BASE_RADIUS = 0.085;
const HUB_RADIUS = 0.14;

const sphereGeometry = new THREE.SphereGeometry(1, 18, 18);

// Parallel edges (two lines sharing a physical corridor, e.g. Yūrakuchō /
// Fukutoshin between Wakōshi and Kotake-Mukaihara) get a small lateral
// "double track" offset so both stay visible in the flat top-down layout.
const parallelRank = new Map();
{
  const groups = new Map();
  for (const e of GRAPH.edges) {
    const k = e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e.id);
  }
  for (const ids of groups.values()) {
    if (ids.length > 1) ids.forEach((id, i) => parallelRank.set(id, { i, n: ids.length }));
  }
}

/* ────────────────────────── edges ────────────────────────── */

function EdgeMesh({ edge }) {
  const token = useStore((s) => edgeToken(s, edge));
  const matRef = useRef();
  const params = EDGE_PARAMS[token];
  const lineColor = LINE_BY_ID[edge.line].color;

  const geometry = useMemo(() => {
    const na = GRAPH.nodes.get(edge.a);
    const nb = GRAPH.nodes.get(edge.b);
    const yLine = depthY(LINE_BY_ID[edge.line].depth);
    const va = new THREE.Vector3(na.x, na.y, na.z);
    const vb = new THREE.Vector3(nb.x, nb.y, nb.z);
    const par = parallelRank.get(edge.id);
    if (par) {
      // sideways unit vector on the map plane
      const dx = nb.x - na.x;
      const dz = nb.z - na.z;
      const len = Math.hypot(dx, dz) || 1;
      const off = (par.i - (par.n - 1) / 2) * 0.11;
      const ox = (-dz / len) * off;
      const oz = (dx / len) * off;
      va.x += ox; va.z += oz;
      vb.x += ox; vb.z += oz;
    }
    // Near-flat run: the segment travels at its line's own (subtle) depth
    // layer and eases into the interchange nodes at the ends, so parallel
    // corridors stay separated without the old exaggerated braiding.
    const control = new THREE.Vector3(
      (na.x + nb.x) / 2,
      2 * yLine - (na.y + nb.y) / 2,
      (na.z + nb.z) / 2,
    );
    const curve = new THREE.QuadraticBezierCurve3(va, control, vb);
    return new THREE.TubeGeometry(curve, 10, 0.036, 6, false);
  }, [edge]);

  useEffect(() => {
    const m = matRef.current;
    if (!m) return;
    m.color = hdrColor(params.c ?? lineColor, params.k);
    m.opacity = params.o;
  }, [params, lineColor]);

  useFrame(({ clock }) => {
    const m = matRef.current;
    if (!m) return;
    if (params.pulse) {
      m.opacity = params.o * (0.55 + 0.45 * Math.sin(clock.elapsedTime * 9));
    }
  });

  return (
    <mesh geometry={geometry} renderOrder={params.k > 1.5 ? 2 : 1} frustumCulled={false}>
      <meshBasicMaterial ref={matRef} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/* ────────────────────────── nodes ────────────────────────── */

function StationNode({ node }) {
  const token = useStore((s) => nodeToken(s, node));
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const params = NODE_PARAMS[token];
  const glowRef = useRef();
  const meshRef = useRef();

  const baseR = node.isHub ? HUB_RADIUS : BASE_RADIUS;
  const r = baseR * params.r * (hovered ? 1.3 : 1);
  const color = useMemo(() => hdrColor(params.c, params.k), [params]);
  const glowColor = useMemo(() => hdrColor(params.c, Math.min(params.k, 1.3)), [params]);
  const glowScale = r * (node.isHub ? 5.0 : 4.6);

  useFrame(({ clock }) => {
    if (params.pulse && meshRef.current) {
      const p = 1 + 0.22 * Math.sin(clock.elapsedTime * 8);
      meshRef.current.scale.setScalar(r * p);
      if (glowRef.current) glowRef.current.scale.setScalar(glowScale * p);
    }
  });

  return (
    <group position={[node.x, node.y, node.z]}>
      <mesh
        ref={meshRef}
        geometry={sphereGeometry}
        scale={r}
        renderOrder={2}
        onClick={(e) => {
          e.stopPropagation();
          useStore.getState().pickStation(node.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          useStore.getState().hoverStation(node.id);
        }}
        onPointerOut={() => {
          setHovered(false);
          if (useStore.getState().hoveredStation === node.id) {
            useStore.getState().hoverStation(null);
          }
        }}
      >
        <meshBasicMaterial color={color} transparent opacity={params.o} toneMapped={false} />
      </mesh>
      <sprite ref={glowRef} scale={glowScale} renderOrder={3}>
        <spriteMaterial
          map={getGlowTexture()}
          color={glowColor}
          transparent
          opacity={0.3 * params.o}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

/* ────────────────────────── labels ────────────────────────── */

// 4+ line hubs label themselves; the rest is a curated anchor set that keeps
// the hyper-dense Ōtemachi/Kasumigaseki cluster from becoming a label pile-up.
const STATIC_LABEL_IDS = new Set(
  [...GRAPH.nodes.values()]
    .filter((n) => n.lines.length >= 4)
    .map((n) => n.id)
    .concat([
      'shibuya', 'ikebukuro', 'ueno', 'shinjuku', 'asakusa', 'ginza',
      'omotesando', 'iidabashi', 'nakano', 'ogikubo', 'wakoshi',
      'nishi-funabashi', 'shin-kiba', 'kita-senju', 'meguro', 'naka-meguro',
      'oshiage', 'kita-ayase', 'akabane-iwabuchi', 'yoyogi-uehara',
    ]),
);

function Label({ node, dim }) {
  const { tex, aspect } = getLabelTexture(node.name);
  const h = 0.52;
  const yOff = (node.isHub ? HUB_RADIUS : BASE_RADIUS) * 2 + 0.32;
  return (
    <sprite position={[node.x, node.y + yOff, node.z]} scale={[h * aspect, h, 1]} renderOrder={4}>
      <spriteMaterial
        map={tex}
        transparent
        opacity={dim ? 0.4 : 0.85}
        depthWrite={false}
        toneMapped={false}
      />
    </sprite>
  );
}

function Labels() {
  const labelsOn = useStore((s) => s.labelsOn);
  const origin = useStore((s) => s.origin);
  const dest = useStore((s) => s.dest);
  const seed = useStore((s) => s.seed);
  const selected = useStore((s) => s.selectedStation);
  const running = useStore((s) => s.steps.length > 0);

  const dynamic = new Set([origin, dest, seed, selected].filter(Boolean));
  const ids = new Set(dynamic);
  if (labelsOn) for (const id of STATIC_LABEL_IDS) ids.add(id);

  return (
    <group>
      {[...ids].map((id) => (
        <Label
          key={id}
          node={GRAPH.nodes.get(id)}
          dim={running && !dynamic.has(id)}
        />
      ))}
    </group>
  );
}

/* ────────────────────────── assembly ────────────────────────── */

export default function Network() {
  const edges = useMemo(() => GRAPH.edges, []);
  const nodes = useMemo(() => [...GRAPH.nodes.values()], []);
  return (
    <group>
      {edges.map((e) => (
        <EdgeMesh key={e.id} edge={e} />
      ))}
      {nodes.map((n) => (
        <StationNode key={n.id} node={n} />
      ))}
      <Labels />
    </group>
  );
}
