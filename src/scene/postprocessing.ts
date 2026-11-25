import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const AnamorphicCinemaShader = {
  uniforms: {
    tDiffuse: { value: null },
    uFlareStrength: { value: 1.0 },
    uResolution: { value: new THREE.Vector2(1440, 900) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uFlareStrength;
    uniform vec2 uResolution;
    varying vec2 vUv;

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 col = base.rgb;

      if (uFlareStrength > 0.01) {
        // Horizontal anamorphic streak sampling bright golden sun & specular glints
        vec3 streak = vec3(0.0);
        float texelX = 1.0 / max(uResolution.x, 1.0);
        for (int i = -10; i <= 10; i++) {
          float fi = float(i);
          float w = exp(-abs(fi) * 0.22);
          vec2 sampleUv = vec2(clamp(vUv.x + fi * texelX * 14.0, 0.0, 1.0), vUv.y);
          vec3 s = texture2D(tDiffuse, sampleUv).rgb;
          float lum = dot(s, vec3(0.299, 0.587, 0.114));
          vec3 bright = max(s - vec3(0.92), vec3(0.0));
          streak += bright * w * smoothstep(0.85, 1.5, lum);
        }
        streak *= 0.085 * uFlareStrength;
        // Classic anamorphic warm-amber + subtle cool cyan tint
        vec3 anamorphicTint = mix(vec3(1.0, 0.76, 0.42), vec3(0.68, 0.86, 1.0), 0.22);
        col += streak * anamorphicTint;
      }

      // Subtle IMAX optical vignette
      vec2 centered = vUv - 0.5;
      float vig = 1.0 - dot(centered, centered) * 0.34;
      col *= clamp(vig, 0.68, 1.0);

      gl_FragColor = vec4(col, base.a);
    }
  `,
};

export interface CinemaPostProcessing {
  composer: EffectComposer;
  setFlareStrength: (strength: number) => void;
  setSize: (width: number, height: number) => void;
  render: () => void;
  dispose: () => void;
}

export function createCinemaPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): CinemaPostProcessing {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(Math.floor(width / 2), Math.floor(height / 2)),
    0.38, // subtle warm golden glow
    0.55,
    0.88,
  );
  composer.addPass(bloomPass);

  const anamorphicPass = new ShaderPass(AnamorphicCinemaShader);
  anamorphicPass.uniforms.uResolution.value.set(width, height);
  composer.addPass(anamorphicPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  return {
    composer,
    setFlareStrength: (strength: number) => {
      anamorphicPass.uniforms.uFlareStrength.value = strength;
    },
    setSize: (w: number, h: number) => {
      composer.setSize(w, h);
      bloomPass.resolution.set(Math.floor(w / 2), Math.floor(h / 2));
      anamorphicPass.uniforms.uResolution.value.set(w, h);
    },
    render: () => {
      composer.render();
    },
    dispose: () => {
      composer.dispose();
    },
  };
}
