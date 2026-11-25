import * as THREE from 'three';
import { OCEAN_WAVES, WHALE_ORIGIN } from '../sim/oceanPhysics';

export interface OceanEnvironmentBundle {
  skyMesh: THREE.Mesh;
  oceanMesh: THREE.Mesh;
  sunFlareSprite: THREE.Sprite;
  update: (params: {
    elapsedTime: number;
    sunDir: THREE.Vector3;
    sunWarmth: number;
    impactAge: number;
    eruptionAge: number;
    boatPos: THREE.Vector3;
    calmness: number;
    flareStrength: number;
    camera: THREE.Camera;
  }) => void;
  dispose: () => void;
}

export function createOceanAndSky(flareTexture: THREE.Texture): OceanEnvironmentBundle {
  // 1. Golden-hour atmospheric sky dome
  const skyGeo = new THREE.SphereGeometry(480, 48, 32);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0.22, 0.11, -0.97).normalize() },
      uWarmth: { value: 1.0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform float uWarmth;
      uniform float uTime;
      varying vec3 vWorldDir;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p *= 2.02;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float elev = clamp(dir.y, -0.1, 1.0);
        float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);

        // Deep pelagic twilight zenith -> warm apricot/amber golden horizon
        vec3 zenithCol = vec3(0.11, 0.21, 0.34);
        vec3 midSkyCol = vec3(0.35, 0.44, 0.54);
        vec3 horizonCool = vec3(0.76, 0.59, 0.46);
        vec3 horizonWarm = vec3(0.98, 0.65, 0.34);

        float horizonMask = pow(1.0 - clamp(elev, 0.0, 1.0), 3.4);
        float upperMix = smoothstep(0.0, 0.55, max(elev, 0.0));

        vec3 sky = mix(horizonCool, midSkyCol, smoothstep(0.0, 0.28, max(elev, 0.0)));
        sky = mix(sky, zenithCol, upperMix);

        // Golden hour azimuth glow around the low sun
        float sunGlow = pow(sunDot, 4.0) * (0.45 + 0.55 * horizonMask);
        vec3 amberGlow = mix(vec3(0.95, 0.58, 0.30), vec3(1.0, 0.72, 0.38), uWarmth);
        sky += amberGlow * sunGlow * 0.72;
        sky = mix(sky, horizonWarm, horizonMask * (0.35 + 0.45 * pow(sunDot, 2.0)) * uWarmth);

        // Subtle high-altitude wispy golden cirrus clouds
        if (dir.y > 0.015) {
          vec2 cloudUv = dir.xz / (dir.y + 0.14) * 1.35 + vec2(uTime * 0.004, uTime * 0.002);
          float c = fbm(cloudUv * 2.1);
          float cloudBand = smoothstep(0.46, 0.78, c) * smoothstep(0.015, 0.22, dir.y) * (1.0 - smoothstep(0.35, 0.85, dir.y));
          vec3 cloudShadow = vec3(0.36, 0.34, 0.40);
          vec3 cloudLit = mix(vec3(1.0, 0.76, 0.50), vec3(1.0, 0.88, 0.68), pow(sunDot, 3.0));
          vec3 cloudCol = mix(cloudShadow, cloudLit, 0.4 + 0.6 * pow(sunDot, 1.6));
          sky = mix(sky, cloudCol, cloudBand * 0.42);
        }

        // Warm Mie atmospheric halo + crisp solar disc (contained, rich golden sky)
        float mie = pow(sunDot, 52.0) * 0.42 + pow(sunDot, 260.0) * 0.95;
        float sunDisc = smoothstep(0.99945, 0.99982, sunDot);
        sky += vec3(1.0, 0.74, 0.42) * mie;
        sky += vec3(1.0, 0.94, 0.80) * sunDisc * 2.6;

        // Horizon mist band
        float mistBand = exp(-abs(dir.y) * 16.0);
        vec3 mistCol = mix(vec3(0.76, 0.60, 0.46), vec3(0.98, 0.72, 0.46), pow(sunDot, 2.0));
        sky = mix(sky, mistCol, mistBand * 0.48);

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  skyMesh.frustumCulled = false;

  // 2. High-detail radial-biased ocean plane for crisp foreground waves & far horizon
  // High vertex density near center (-60..60) fading smoothly to horizon (380m)
  const oceanGeo = new THREE.PlaneGeometry(520, 520, 220, 220);
  oceanGeo.rotateX(-Math.PI / 2);

  // Non-linearly concentrate vertices around the sailboat & whale zone so near-field Gerstner waves & ripples are ultra smooth
  const posAttr = oceanGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const nx = x / 260;
    const nz = z / 260;
    const warpX = Math.sign(nx) * Math.pow(Math.abs(nx), 1.45) * 260;
    const warpZ = Math.sign(nz) * Math.pow(Math.abs(nz), 1.45) * 260;
    posAttr.setXYZ(i, warpX, 0, warpZ);
  }
  oceanGeo.computeVertexNormals();

  const waveDirs = OCEAN_WAVES.map((w) => {
    const l = Math.hypot(w.dirX, w.dirZ) || 1;
    return new THREE.Vector4(w.dirX / l, w.dirZ / l, w.steepness, w.wavelength);
  });
  const waveSpeeds = OCEAN_WAVES.map((w) => w.speedMultiplier);

  const oceanMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.22, 0.11, -0.97).normalize() },
      uSunWarmth: { value: 1.0 },
      uCalmness: { value: 1.0 },
      uImpactOrigin: { value: new THREE.Vector2(WHALE_ORIGIN.x, WHALE_ORIGIN.z) },
      uImpactAge: { value: 99.0 },
      uEruptionAge: { value: 99.0 },
      uBoatPos: { value: new THREE.Vector2(-8.2, 2.8) },
      uWave0: { value: waveDirs[0] },
      uWave1: { value: waveDirs[1] },
      uWave2: { value: waveDirs[2] },
      uWave3: { value: waveDirs[3] },
      uWaveSpeeds: { value: new THREE.Vector4(waveSpeeds[0], waveSpeeds[1], waveSpeeds[2], waveSpeeds[3]) },
      uFogColor: { value: new THREE.Color(0xd79b68) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uCalmness;
      uniform vec2 uImpactOrigin;
      uniform float uImpactAge;
      uniform float uEruptionAge;
      uniform vec4 uWave0;
      uniform vec4 uWave1;
      uniform vec4 uWave2;
      uniform vec4 uWave3;
      uniform vec4 uWaveSpeeds;

      varying vec3 vWorldPos;
      varying vec3 vWaveNormal;
      varying float vFoamMask;

      void evalWave(vec4 w, float spd, vec2 xz, inout float y, inout float dYdX, inout float dYdZ) {
        float k = 6.2831853 / w.w;
        float c = sqrt(9.81 / k) * spd;
        float amp = (w.z * uCalmness) / k;
        float phase = k * (w.x * xz.x + w.y * xz.y) - c * k * uTime;
        y += amp * sin(phase);
        float slope = amp * k * cos(phase);
        dYdX += w.x * slope;
        dYdZ += w.y * slope;
      }

      void main() {
        vec3 pos = position;
        vec2 xz = pos.xz;

        // Attenuate wave displacement far from camera to avoid sub-pixel aliasing at horizon
        float distFromCenter = length(xz);
        float farAtten = 1.0 - smoothstep(110.0, 240.0, distFromCenter);

        float y = 0.0;
        float dYdX = 0.0;
        float dYdZ = 0.0;

        evalWave(uWave0, uWaveSpeeds.x, xz, y, dYdX, dYdZ);
        evalWave(uWave1, uWaveSpeeds.y, xz, y, dYdX, dYdZ);
        evalWave(uWave2, uWaveSpeeds.z, xz, y, dYdX, dYdZ);
        evalWave(uWave3, uWaveSpeeds.w, xz, y, dYdX, dYdZ);

        float foamMask = 0.0;

        // Expanding circular impact shockwave from whale crash
        if (uImpactAge >= 0.0 && uImpactAge < 10.0) {
          vec2 rel = xz - uImpactOrigin;
          float d = length(rel);
          float front = uImpactAge * 6.2;
          float bw = 4.2 + uImpactAge * 0.45;
          float delta = d - front;
          float env = exp(-(delta * delta) / (2.0 * bw * bw)) * exp(-uImpactAge * 0.38) * smoothstep(0.0, 0.28, uImpactAge);
          float shockAmp = 0.82 * env;
          float ripplePhase = delta * 1.45;
          y += shockAmp * cos(ripplePhase);

          if (d > 0.05) {
            float rSlope = (-shockAmp * 1.45 * sin(ripplePhase) - (delta / (bw * bw)) * shockAmp * cos(ripplePhase)) / d;
            dYdX += rel.x * rSlope;
            dYdZ += rel.y * rSlope;
          }
          foamMask += env * 1.35;

          // Lingering central boil foam at impact point
          float centerBoil = exp(-(d * d) / (2.0 * (4.8 + uImpactAge * 1.6) * (4.8 + uImpactAge * 1.6))) * exp(-uImpactAge * 0.42);
          foamMask += centerBoil * 1.25;
        }

        // Eruption disturbance boil before & during ascent
        if (uEruptionAge >= -0.6 && uEruptionAge < 5.5) {
          vec2 relE = xz - (uImpactOrigin - vec2(1.0, 0.4));
          float dE = length(relE);
          float boilEnv = exp(-(dE * dE) / 22.0) * smoothstep(-0.6, 0.2, uEruptionAge) * (1.0 - smoothstep(1.2, 5.5, uEruptionAge));
          y += boilEnv * 0.32 * sin(dE * 1.6 - uTime * 4.0);
          foamMask += boilEnv * 1.1;
        }

        pos.y = y * farAtten;
        vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
        vWaveNormal = normalize(vec3(-dYdX * farAtten, 1.0, -dYdZ * farAtten));
        vFoamMask = clamp(foamMask, 0.0, 1.5);

        gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform float uSunWarmth;
      uniform vec2 uBoatPos;
      uniform vec3 uFogColor;

      varying vec3 vWorldPos;
      varying vec3 vWaveNormal;
      varying float vFoamMask;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p = p * 2.07 + vec2(1.7, 9.2);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 viewVec = cameraPosition - vWorldPos;
        float dist = length(viewVec);
        vec3 V = viewVec / max(dist, 0.001);
        vec3 L = normalize(uSunDir);

        // Multi-scale micro-ripple normal perturbation for long golden sun reflections
        float microFade = 1.0 - smoothstep(45.0, 210.0, dist);
        vec2 uv1 = vWorldPos.xz * 0.58 + vec2(uTime * 0.16, -uTime * 0.11);
        vec2 uv2 = vWorldPos.xz * 1.75 + vec2(-uTime * 0.24, uTime * 0.19);
        vec2 uv3 = vWorldPos.xz * 3.6 + vec2(uTime * 0.31, uTime * 0.22);
        float nA = noise(uv1);
        float nB = noise(uv2);
        float nC = noise(uv3);
        float nx = (noise(uv1 + vec2(0.10, 0.0)) - nA) * 0.62 + (noise(uv2 + vec2(0.06, 0.0)) - nB) * 0.44 + (noise(uv3 + vec2(0.04, 0.0)) - nC) * 0.25;
        float nz = (noise(uv1 + vec2(0.0, 0.10)) - nA) * 0.62 + (noise(uv2 + vec2(0.0, 0.06)) - nB) * 0.44 + (noise(uv3 + vec2(0.0, 0.04)) - nC) * 0.25;

        vec3 N = normalize(vWaveNormal + vec3(-nx * 1.25 * microFade, 0.0, -nz * 1.25 * microFade));

        // Schlick Fresnel
        float NoV = max(dot(N, V), 0.0);
        float fresnel = 0.02 + 0.98 * pow(1.0 - NoV, 4.6);

        // Reflected sky color along R
        vec3 R = reflect(-V, N);
        float rElev = clamp(R.y, 0.0, 1.0);
        float rSun = max(dot(R, L), 0.0);
        vec3 skyZenith = vec3(0.11, 0.21, 0.34);
        vec3 skyHorizon = mix(vec3(0.76, 0.59, 0.46), vec3(0.98, 0.67, 0.36), uSunWarmth * (0.4 + 0.6 * pow(rSun, 2.0)));
        vec3 reflectedSky = mix(skyHorizon, skyZenith, smoothstep(0.0, 0.45, rElev));
        reflectedSky += vec3(1.0, 0.72, 0.38) * pow(rSun, 5.0) * 0.55;

        // Deep pelagic water absorption + subsurface scatter
        vec3 deepWater = vec3(0.022, 0.075, 0.115);
        vec3 shallowScatter = vec3(0.055, 0.21, 0.245);
        float crestScatter = clamp(vWorldPos.y * 0.65 + 0.35, 0.0, 1.0) * pow(max(dot(V, -L), 0.0), 2.5);
        vec3 waterBody = mix(deepWater, shallowScatter, crestScatter * 0.55);

        vec3 color = mix(waterBody, reflectedSky, clamp(fresnel * 0.92, 0.04, 0.95));

        // Long shimmering golden sun-path specular reflections across ripples
        vec3 H = normalize(L + V);
        float NoH = max(dot(N, H), 0.0);
        float specTight = pow(NoH, 320.0) * 4.2;
        float specMid = pow(NoH, 52.0) * 0.95;
        float specBroad = pow(NoH, 11.0) * 0.22;
        vec3 sunSpecColor = mix(vec3(1.0, 0.80, 0.48), vec3(1.0, 0.68, 0.30), 1.0 - pow(NoH, 8.0));
        color += sunSpecColor * (specTight + specMid + specBroad) * (0.65 + 0.45 * uSunWarmth);

        // Boat gentle waterline wake & foam
        float dBoat = length(vWorldPos.xz - uBoatPos);
        float boatRing = exp(-pow(dBoat - 2.6, 2.0) / 1.4) * 0.22;

        // Organic lacy whitecap & breach splash foam
        float foamTex = fbm(vWorldPos.xz * 0.55 + vec2(uTime * 0.08, -uTime * 0.05));
        float totalFoam = smoothstep(0.38, 0.85, (vFoamMask + boatRing) * (0.55 + 0.9 * foamTex));
        vec3 foamColor = mix(vec3(0.84, 0.82, 0.78), vec3(1.0, 0.90, 0.76), 0.4 + 0.6 * max(dot(L, vec3(0.0, 1.0, 0.0)), 0.15));
        color = mix(color, foamColor, clamp(totalFoam * 0.88, 0.0, 0.92));

        // Distance atmospheric mist & horizon merge
        float fogFactor = 1.0 - exp(-pow(dist * 0.0042, 1.45));
        float sunView = max(dot(-V, L), 0.0);
        vec3 horizonMist = mix(uFogColor, vec3(1.0, 0.72, 0.42), pow(sunView, 3.0) * 0.65);
        color = mix(color, horizonMist, clamp(fogFactor, 0.0, 1.0));

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
  oceanMesh.receiveShadow = false;
  oceanMesh.frustumCulled = false;

  // 3. Slim horizontal anamorphic sun glare sprite (works on both GPU and software WebGL)
  const flareMat = new THREE.SpriteMaterial({
    map: flareTexture,
    color: new THREE.Color(0xffca7a),
    transparent: true,
    opacity: 0.36,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const sunFlareSprite = new THREE.Sprite(flareMat);
  sunFlareSprite.scale.set(220, 9.5, 1);
  sunFlareSprite.renderOrder = 20;

  return {
    skyMesh,
    oceanMesh,
    sunFlareSprite,
    update: ({
      elapsedTime,
      sunDir,
      sunWarmth,
      impactAge,
      eruptionAge,
      boatPos,
      calmness,
      flareStrength,
      camera,
    }) => {
      skyMat.uniforms.uSunDir.value.copy(sunDir);
      skyMat.uniforms.uWarmth.value = sunWarmth;
      skyMat.uniforms.uTime.value = elapsedTime;

      oceanMat.uniforms.uTime.value = elapsedTime;
      oceanMat.uniforms.uSunDir.value.copy(sunDir);
      oceanMat.uniforms.uSunWarmth.value = sunWarmth;
      oceanMat.uniforms.uCalmness.value = calmness;
      oceanMat.uniforms.uImpactAge.value = impactAge;
      oceanMat.uniforms.uEruptionAge.value = eruptionAge;
      oceanMat.uniforms.uBoatPos.value.set(boatPos.x, boatPos.z);

      // Keep sun flare anchored far along the sun vector relative to camera
      sunFlareSprite.position.copy(camera.position).addScaledVector(sunDir, 380);
      flareMat.opacity = 0.55 * flareStrength;
      sunFlareSprite.visible = flareStrength > 0.02;
    },
    dispose: () => {
      skyGeo.dispose();
      skyMat.dispose();
      oceanGeo.dispose();
      oceanMat.dispose();
      flareMat.dispose();
    },
  };
}
