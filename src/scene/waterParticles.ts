import * as THREE from 'three';
import type { WhaleKinematicsState } from '../sim/oceanPhysics';
import { WHALE_ORIGIN } from '../sim/oceanPhysics';
import type { SceneTextureBundle } from './textures';

export interface WaterParticleSystem {
  group: THREE.Group;
  update: (params: {
    dt: number;
    elapsedTime: number;
    whale: WhaleKinematicsState;
    whaleMatrixWorld: THREE.Matrix4;
  }) => void;
  reset: () => void;
  dispose: () => void;
}

const SPLASH_COUNT = 1350;
const MIST_COUNT = 92;

const _localPt = new THREE.Vector3();
const _worldPt = new THREE.Vector3();

export function createWaterParticles(textures: SceneTextureBundle): WaterParticleSystem {
  const group = new THREE.Group();

  // 1. Ballistic Splash + Flank Cascade Droplets (Points with size attenuation & golden tint)
  const splashPositions = new Float32Array(SPLASH_COUNT * 3);
  const splashVelocities = new Float32Array(SPLASH_COUNT * 3);
  const splashLife = new Float32Array(SPLASH_COUNT);
  const splashMaxLife = new Float32Array(SPLASH_COUNT);
  const splashSizes = new Float32Array(SPLASH_COUNT);

  for (let i = 0; i < SPLASH_COUNT; i++) {
    splashPositions[i * 3 + 1] = -999;
    splashLife[i] = 0;
    splashMaxLife[i] = 1;
    splashSizes[i] = 1.0;
  }

  const splashGeo = new THREE.BufferGeometry();
  const splashPosAttr = new THREE.BufferAttribute(splashPositions, 3);
  splashPosAttr.setUsage(THREE.DynamicDrawUsage);
  const splashSizeAttr = new THREE.BufferAttribute(splashSizes, 1);
  splashSizeAttr.setUsage(THREE.DynamicDrawUsage);
  const splashAlphaAttr = new THREE.BufferAttribute(new Float32Array(SPLASH_COUNT), 1);
  splashAlphaAttr.setUsage(THREE.DynamicDrawUsage);

  splashGeo.setAttribute('position', splashPosAttr);
  splashGeo.setAttribute('aSize', splashSizeAttr);
  splashGeo.setAttribute('aAlpha', splashAlphaAttr);

  const splashMat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: textures.spraySprite },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aAlpha;
      uniform float uPixelRatio;
      varying float vAlpha;

      void main() {
        vAlpha = aAlpha;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio * (340.0 / max(-mvPosition.z, 1.0));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      varying float vAlpha;

      void main() {
        if (vAlpha <= 0.01) discard;
        vec4 tex = texture2D(uMap, gl_PointCoord);
        float alpha = tex.a * vAlpha;
        if (alpha <= 0.01) discard;
        // Sun-kissed warm golden-white spray
        vec3 col = mix(vec3(0.84, 0.87, 0.90), vec3(1.0, 0.91, 0.76), tex.r);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  const splashPoints = new THREE.Points(splashGeo, splashMat);
  splashPoints.frustumCulled = false;
  splashPoints.renderOrder = 6;
  group.add(splashPoints);

  // 2. Rolling Spray + Shallow Ocean Mist Clouds
  const mistPositions = new Float32Array(MIST_COUNT * 3);
  const mistVelocities = new Float32Array(MIST_COUNT * 3);
  const mistLife = new Float32Array(MIST_COUNT);
  const mistMaxLife = new Float32Array(MIST_COUNT);
  const mistSizes = new Float32Array(MIST_COUNT);
  const mistAlpha = new Float32Array(MIST_COUNT);
  const mistIsAmbient = new Uint8Array(MIST_COUNT);

  const ambientCount = 26;
  for (let i = 0; i < MIST_COUNT; i++) {
    if (i < ambientCount) {
      mistIsAmbient[i] = 1;
      mistPositions[i * 3] = (Math.random() - 0.5) * 95;
      mistPositions[i * 3 + 1] = 0.65 + Math.random() * 1.4;
      mistPositions[i * 3 + 2] = -32 + Math.random() * 52;
      mistVelocities[i * 3] = 0.55 + Math.random() * 0.45;
      mistVelocities[i * 3 + 1] = 0.0;
      mistVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.18;
      mistLife[i] = 1;
      mistMaxLife[i] = 1;
      mistSizes[i] = 18 + Math.random() * 20;
      mistAlpha[i] = 0.24;
    } else {
      mistIsAmbient[i] = 0;
      mistPositions[i * 3 + 1] = -999;
      mistLife[i] = 0;
      mistMaxLife[i] = 1;
      mistSizes[i] = 10;
      mistAlpha[i] = 0;
    }
  }

  const mistGeo = new THREE.BufferGeometry();
  const mistPosAttr = new THREE.BufferAttribute(mistPositions, 3);
  mistPosAttr.setUsage(THREE.DynamicDrawUsage);
  const mistSizeAttr = new THREE.BufferAttribute(mistSizes, 1);
  mistSizeAttr.setUsage(THREE.DynamicDrawUsage);
  const mistAlphaAttr = new THREE.BufferAttribute(mistAlpha, 1);
  mistAlphaAttr.setUsage(THREE.DynamicDrawUsage);

  mistGeo.setAttribute('position', mistPosAttr);
  mistGeo.setAttribute('aSize', mistSizeAttr);
  mistGeo.setAttribute('aAlpha', mistAlphaAttr);

  const mistMat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: textures.mistSprite },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aAlpha;
      uniform float uPixelRatio;
      varying float vAlpha;

      void main() {
        vAlpha = aAlpha;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio * (460.0 / max(-mvPosition.z, 1.0));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      varying float vAlpha;

      void main() {
        if (vAlpha <= 0.005) discard;
        vec4 tex = texture2D(uMap, gl_PointCoord);
        float alpha = tex.a * vAlpha;
        if (alpha <= 0.005) discard;
        gl_FragColor = vec4(vec3(1.0, 0.89, 0.74), alpha);
      }
    `,
  });

  const mistPoints = new THREE.Points(mistGeo, mistMat);
  mistPoints.frustumCulled = false;
  mistPoints.renderOrder = 7;
  group.add(mistPoints);

  let splashCursor = 0;
  let mistCursor = ambientCount;

  const spawnSplash = (
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
  ) => {
    const i = splashCursor;
    splashCursor = (splashCursor + 1) % SPLASH_COUNT;
    splashPositions[i * 3] = x;
    splashPositions[i * 3 + 1] = y;
    splashPositions[i * 3 + 2] = z;
    splashVelocities[i * 3] = vx;
    splashVelocities[i * 3 + 1] = vy;
    splashVelocities[i * 3 + 2] = vz;
    splashLife[i] = life;
    splashMaxLife[i] = life;
    splashSizes[i] = size;
  };

  const spawnRollingMist = (
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
  ) => {
    const i = mistCursor;
    mistCursor++;
    if (mistCursor >= MIST_COUNT) mistCursor = ambientCount;
    mistPositions[i * 3] = x;
    mistPositions[i * 3 + 1] = y;
    mistPositions[i * 3 + 2] = z;
    mistVelocities[i * 3] = vx;
    mistVelocities[i * 3 + 1] = vy;
    mistVelocities[i * 3 + 2] = vz;
    mistLife[i] = life;
    mistMaxLife[i] = life;
    mistSizes[i] = size;
  };

  return {
    group,
    reset: () => {
      for (let i = 0; i < SPLASH_COUNT; i++) {
        splashLife[i] = 0;
        splashPositions[i * 3 + 1] = -999;
      }
      for (let i = ambientCount; i < MIST_COUNT; i++) {
        mistLife[i] = 0;
        mistPositions[i * 3 + 1] = -999;
      }
      splashPosAttr.needsUpdate = true;
      splashAlphaAttr.needsUpdate = true;
      mistPosAttr.needsUpdate = true;
      mistAlphaAttr.needsUpdate = true;
    },
    update: ({ dt, elapsedTime, whale, whaleMatrixWorld }) => {
      const safeDt = Math.min(dt, 0.05);

      // A. Water cascading off the whale's flanks & belly while above the surface
      if (whale.cascadeIntensity > 0.04) {
        const count = Math.floor(24 * whale.cascadeIntensity);
        for (let k = 0; k < count; k++) {
          const lx = (Math.random() - 0.5) * 18.0;
          const side = Math.random() > 0.5 ? 1 : -1;
          const ly = (Math.random() - 0.5) * 2.2;
          const lz = side * (0.8 + Math.random() * 1.1);
          _localPt.set(lx, ly, lz);
          _worldPt.copy(_localPt).applyMatrix4(whaleMatrixWorld);
          if (_worldPt.y > 0.35) {
            spawnSplash(
              _worldPt.x,
              _worldPt.y,
              _worldPt.z,
              (Math.random() - 0.5) * 1.8 + side * 0.9,
              -0.8 - Math.random() * 1.5,
              (Math.random() - 0.5) * 1.8,
              1.1 + Math.random() * 0.9,
              0.42 + Math.random() * 0.55,
            );
          }
        }
      }

      // B. Initial eruption crown spray as whale breaks surface
      if (whale.eruptionPulse > 0.05) {
        const burst = Math.floor(26 * whale.eruptionPulse);
        for (let k = 0; k < burst; k++) {
          const ang = Math.random() * Math.PI * 2;
          const rad = 1.2 + Math.random() * 2.8;
          const spd = 4.2 + Math.random() * 6.5;
          spawnSplash(
            WHALE_ORIGIN.x + Math.cos(ang) * rad,
            0.25 + Math.random() * 1.1,
            WHALE_ORIGIN.z + Math.sin(ang) * rad,
            Math.cos(ang) * spd * 0.55,
            5.0 + Math.random() * 6.5,
            Math.sin(ang) * spd * 0.55,
            1.4 + Math.random() * 0.9,
            0.6 + Math.random() * 0.85,
          );
        }
      }

      // C. Massive splash plume & rolling spray when whale crashes back down
      if (whale.impactPulse > 0.04) {
        const impactX = whale.x;
        const impactZ = whale.z;
        const dropletCount = Math.floor(68 * whale.impactPulse);
        for (let k = 0; k < dropletCount; k++) {
          const ang = Math.random() * Math.PI * 2;
          const rad = Math.random() * 5.2;
          const outSpeed = 2.8 + Math.random() * 8.2;
          const upSpeed = (7.2 + Math.random() * 11.4) * (0.55 + 0.45 * whale.impactPulse);
          spawnSplash(
            impactX + Math.cos(ang) * rad,
            0.2 + Math.random() * 0.9,
            impactZ + Math.sin(ang) * rad,
            Math.cos(ang) * outSpeed,
            upSpeed,
            Math.sin(ang) * outSpeed,
            1.6 + Math.random() * 1.4,
            0.75 + Math.random() * 1.25,
          );
        }

        // Rolling spray mist plumes expanding across water
        if (Math.random() < 0.85) {
          const ang = Math.random() * Math.PI * 2;
          const r = 1.5 + Math.random() * 4.5;
          spawnRollingMist(
            impactX + Math.cos(ang) * r,
            1.1 + Math.random() * 1.8,
            impactZ + Math.sin(ang) * r,
            Math.cos(ang) * (2.6 + Math.random() * 3.4) + 0.8,
            1.2 + Math.random() * 2.2,
            Math.sin(ang) * (2.6 + Math.random() * 3.4),
            3.6 + Math.random() * 2.2,
            10 + Math.random() * 12,
          );
        }
      }

      // Integrate splash droplets under gravity + gentle wind drift
      const alphaArr = splashAlphaAttr.array as Float32Array;
      for (let i = 0; i < SPLASH_COUNT; i++) {
        const l = splashLife[i];
        if (l <= 0) {
          alphaArr[i] = 0;
          continue;
        }
        splashLife[i] = l - safeDt;
        const idx = i * 3;
        splashVelocities[idx] += 0.65 * safeDt; // gentle sea breeze +X
        splashVelocities[idx + 1] -= 9.81 * safeDt;

        splashPositions[idx] += splashVelocities[idx] * safeDt;
        splashPositions[idx + 1] += splashVelocities[idx + 1] * safeDt;
        splashPositions[idx + 2] += splashVelocities[idx + 2] * safeDt;

        if (splashPositions[idx + 1] < -0.15) {
          splashLife[i] = 0;
          splashPositions[idx + 1] = -999;
          alphaArr[i] = 0;
        } else {
          const frac = Math.max(0, splashLife[i] / splashMaxLife[i]);
          alphaArr[i] = Math.min(1, frac * 1.4) * 0.88;
        }
      }
      splashPosAttr.needsUpdate = true;
      splashSizeAttr.needsUpdate = true;
      splashAlphaAttr.needsUpdate = true;

      // Integrate shallow ambient mist + rolling breach spray mist
      for (let i = 0; i < MIST_COUNT; i++) {
        const idx = i * 3;
        if (mistIsAmbient[i]) {
          mistPositions[idx] += mistVelocities[i * 3] * safeDt;
          mistPositions[idx + 2] += mistVelocities[i * 3 + 2] * safeDt;
          mistPositions[idx + 1] = 0.75 + Math.sin(elapsedTime * 0.4 + i) * 0.28;
          if (mistPositions[idx] > 52) mistPositions[idx] = -52;
          mistAlpha[i] = 0.22;
        } else {
          const l = mistLife[i];
          if (l <= 0) {
            mistAlpha[i] = 0;
            continue;
          }
          mistLife[i] = l - safeDt;
          mistPositions[idx] += mistVelocities[idx] * safeDt;
          mistPositions[idx + 1] = Math.max(0.6, mistPositions[idx + 1] + mistVelocities[idx + 1] * safeDt);
          mistPositions[idx + 2] += mistVelocities[idx + 2] * safeDt;

          // Mist slows down & expands outward as rolling spray settles
          mistVelocities[idx] *= 1 - 0.55 * safeDt;
          mistVelocities[idx + 1] -= 1.3 * safeDt;
          mistVelocities[idx + 2] *= 1 - 0.55 * safeDt;
          mistSizes[i] += 2.6 * safeDt;

          const frac = Math.max(0, mistLife[i] / mistMaxLife[i]);
          const fadeIn = Math.min(1, (1 - frac) * 5.0);
          mistAlpha[i] = fadeIn * frac * 0.44;
        }
      }
      mistPosAttr.needsUpdate = true;
      mistSizeAttr.needsUpdate = true;
      mistAlphaAttr.needsUpdate = true;
    },
    dispose: () => {
      splashGeo.dispose();
      splashMat.dispose();
      mistGeo.dispose();
      mistMat.dispose();
    },
  };
}
