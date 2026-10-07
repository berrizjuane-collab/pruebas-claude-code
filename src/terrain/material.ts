/**
 * Material del terreno: MeshStandardMaterial (PBR, sombras, niebla y tone mapping
 * de three.js) con inyección de GLSL para:
 *  - albedo Sentinel-2 y máscara de nieve (NDSI) del anillo;
 *  - normal por píxel desde la textura de normales del DEM (independiente del LOD);
 *  - microdetalle triplanar determinista y estratificación horizontal sutil en roca;
 *  - oclusión ambiental por factor de cielo visible (núcleo);
 *  - capas: zona de la muerte (máscara altimétrica + isolínea de 8 000 m),
 *    procedencia del DEM (clases FLM) y depuración de LOD;
 *  - geomorphing entre niveles de detalle (uniforme por bloque).
 */
import * as THREE from 'three';

export interface SharedTerrainUniforms {
  uDetail: THREE.IUniform<THREE.Texture>;
  uDetailLevel: THREE.IUniform<number>;
  uH0: THREE.IUniform<number>;
  uDeathY: THREE.IUniform<number>;
  uDeathOn: THREE.IUniform<number>;
  uDeathTint: THREE.IUniform<number>;
  uDemOn: THREE.IUniform<number>;
  uShowLod: THREE.IUniform<number>;
}

export interface RingUniforms {
  uAlbedo: THREE.IUniform<THREE.Texture>;
  uMasks: THREE.IUniform<THREE.Texture>;
  uNormalTex: THREE.IUniform<THREE.Texture>;
  uAux: THREE.IUniform<THREE.Texture>;
  uHasAux: THREE.IUniform<number>;
  uHalf: THREE.IUniform<number>;
  uGridN: THREE.IUniform<number>;
}

export interface ChunkUniforms {
  uMorph: THREE.IUniform<number>;
  uLodLevel: THREE.IUniform<number>;
}

const VERT_HEAD = /* glsl */ `
attribute float aMorph;
uniform float uMorph;
uniform sampler2D uNormalTex;
uniform float uHalf;
uniform float uGridN;
varying vec3 vWorldPos;
`;

const FRAG_HEAD = /* glsl */ `
uniform sampler2D uAlbedo;
uniform sampler2D uMasks;
uniform sampler2D uNormalTex;
uniform sampler2D uAux;
uniform sampler2D uDetail;
uniform float uHasAux;
uniform float uHalf;
uniform float uGridN;
uniform float uH0;
uniform float uDeathY;
uniform float uDeathOn;
uniform float uDeathTint;
uniform float uDemOn;
uniform float uDetailLevel;
uniform float uShowLod;
uniform float uLodLevel;
varying vec3 vWorldPos;

vec2 k2AreaUv(vec3 p) { return (p.xz + uHalf) / (2.0 * uHalf); }
vec2 k2GridUv(vec3 p) { return k2AreaUv(p) * (uGridN - 1.0) / uGridN + 0.5 / uGridN; }

// Perturbación triplanar (UDN) a partir de la textura de detalle teselable.
vec3 k2Triplanar(vec3 p, vec3 n, float scale, out float variation) {
  vec3 w = pow(abs(n), vec3(4.0));
  w /= (w.x + w.y + w.z);
  vec4 tx = texture2D(uDetail, p.zy / scale);
  vec4 ty = texture2D(uDetail, p.xz / scale);
  vec4 tz = texture2D(uDetail, p.xy / scale);
  variation = tx.z * w.x + ty.z * w.y + tz.z * w.z;
  vec2 dx = tx.xy * 2.0 - 1.0;
  vec2 dy = ty.xy * 2.0 - 1.0;
  vec2 dz = tz.xy * 2.0 - 1.0;
  return vec3(0.0, dx.y, dx.x) * w.x + vec3(dy.x, 0.0, dy.y) * w.y + vec3(dz.x, dz.y, 0.0) * w.z;
}

vec3 k2FlmColor(float cls) {
  if (cls < 1.5) return vec3(0.55, 0.62, 0.78);  // editado
  if (cls < 2.5) return vec3(0.30, 0.78, 0.64);  // TanDEM-X sin editar
  if (cls < 3.5) return vec3(0.96, 0.82, 0.32);  // ASTER
  if (cls < 4.5) return vec3(0.96, 0.48, 0.24);  // SRTM90
  if (cls < 5.5) return vec3(0.98, 0.66, 0.46);  // SRTM30
  if (cls < 8.5) return vec3(0.80, 0.80, 0.80);
  return vec3(0.64, 0.50, 0.96);                  // AW3D30
}
`;

const FRAG_SURFACE = /* glsl */ `
  vec3 kP = vWorldPos;
  vec2 kArea = k2AreaUv(kP);
  vec2 kGrid = k2GridUv(kP);
  vec3 kN = normalize(texture2D(uNormalTex, kGrid).xyz * 2.0 - 1.0);
  vec3 kAlb = texture2D(uAlbedo, kArea).rgb;
  vec4 kMask = texture2D(uMasks, kArea);
  float kAlt = kP.y + uH0;
  float kSlope = 1.0 - kN.y;
  // nieve observada (NDSI): las paredes muy verticales la pierden; las repisas altas la retienen
  float kSnow = kMask.r * (1.0 - smoothstep(0.62, 0.86, kSlope));
  kSnow = max(kSnow, smoothstep(0.35, 0.6, kMask.r) * (1.0 - smoothstep(0.12, 0.3, kSlope)) * smoothstep(5600.0, 6200.0, kAlt));
  float kLuma = dot(kAlb, vec3(0.2126, 0.7152, 0.0722));
  float kIce = kSnow * (1.0 - smoothstep(0.30, 0.52, kLuma)) * (1.0 - smoothstep(0.35, 0.6, kSlope));
  float kVar = 0.5;
  vec3 kNd = kN;
  if (uDetailLevel > 0.5) {
    float v1;
    vec3 pert = k2Triplanar(kP, kN, 61.0, v1);
    float strength = mix(0.16, 0.5, 1.0 - kSnow) * mix(1.0, 0.45, kIce);
    kVar = v1;
    if (uDetailLevel > 1.5) {
      float v2;
      pert += 0.8 * k2Triplanar(kP, kN, 233.0, v2);
      kVar = mix(v1, v2, 0.5);
    }
    pert *= strength;
    pert -= kN * dot(pert, kN);
    kNd = normalize(kN + pert);
  }
  float kStrata = texture2D(uDetail, vec2((kP.x + kP.z) / 2300.0, kAlt / 260.0)).a;
  vec3 kSnowCol = vec3(0.80, 0.84, 0.89) * (0.93 + 0.14 * kVar);
  vec3 kRock = kAlb * (0.9 + 0.2 * kVar) * mix(1.0, 0.86 + 0.28 * kStrata, (1.0 - kSnow) * smoothstep(0.3, 0.65, kSlope));
  vec3 kBase = mix(kRock, mix(kAlb, kSnowCol, 0.55), kSnow);
  kBase = mix(kBase, kBase * vec3(0.88, 0.96, 1.07), kIce);
  diffuseColor.rgb = kBase;
  float kRough = mix(0.93, 0.8, kSnow);
  kRough = mix(kRough, 0.45, kIce);
`;

const FRAG_OVERLAYS = /* glsl */ `
  if (uDeathOn > 0.001) {
    float above = smoothstep(uDeathY - 1.5, uDeathY + 1.5, kP.y);
    vec3 coral = vec3(0.687, 0.188, 0.178);
    outgoingLight = mix(outgoingLight, outgoingLight * mix(vec3(1.0), coral * 1.9, 0.5), above * uDeathOn * uDeathTint * (1.0 - uDemOn));
    float fw = max(fwidth(kP.y), 1e-3);
    float line = 1.0 - smoothstep(fw * 0.9, fw * 2.4, abs(kP.y - uDeathY));
    outgoingLight = mix(outgoingLight, vec3(1.5, 0.52, 0.48), line * uDeathOn * 0.9);
  }
  if (uDemOn > 0.001 && uHasAux > 0.5) {
    vec4 kAux = texelFetch(uAux, ivec2(floor(kGrid * uGridN)), 0);
    vec3 c = k2FlmColor(floor(kAux.r * 255.0 + 0.5));
    c = mix(c, vec3(1.0, 0.25, 0.78), step(0.02, kAux.g) * 0.85);
    outgoingLight = mix(outgoingLight, outgoingLight * c * 1.7, 0.62 * uDemOn);
  }
  if (uShowLod > 0.5) {
    // nivel equivalente de bloque (0 fino → 3 grueso); +10 marca un padre 2×2 fusionado (más oscuro)
    float kLv = mod(uLodLevel, 10.0);
    vec3 lc = kLv < 0.5 ? vec3(0.4, 1.0, 0.4) : kLv < 1.5 ? vec3(0.4, 0.7, 1.0) : kLv < 2.5 ? vec3(1.0, 0.8, 0.3) : vec3(1.0, 0.4, 0.4);
    if (uLodLevel > 9.5) lc *= 0.68;
    outgoingLight *= lc;
  }
`;

export function createTerrainMaterial(shared: SharedTerrainUniforms, ring: RingUniforms, chunk: ChunkUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, ring, chunk);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace(
        '#include <beginnormal_vertex>',
        `vec2 kGridV = (position.xz + uHalf) / (2.0 * uHalf) * (uGridN - 1.0) / uGridN + 0.5 / uGridN;
         vec3 objectNormal = normalize(textureLod(uNormalTex, kGridV, 0.0).xyz * 2.0 - 1.0);`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position.x, mix(position.y, aMorph, uMorph), position.z);')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\n vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <map_fragment>', FRAG_SURFACE)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = kRough;')
      .replace(
        '#include <normal_fragment_begin>',
        `float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
         vec3 normal = normalize((viewMatrix * vec4(kNd, 0.0)).xyz);
         vec3 nonPerturbedNormal = normal;`,
      )
      .replace('#include <normal_fragment_maps>', '')
      .replace(
        '#include <aomap_fragment>',
        `float kAO = mix(1.0, 0.42 + 0.58 * texture2D(uAux, kGrid).b, uHasAux);
         reflectedLight.indirectDiffuse *= kAO;
         reflectedLight.indirectSpecular *= kAO;`,
      )
      .replace('#include <opaque_fragment>', `${FRAG_OVERLAYS}\n#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'k2-terrain-v2';
  return mat;
}
