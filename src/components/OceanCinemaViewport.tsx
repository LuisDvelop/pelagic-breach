import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createOceanAudioEngine } from '../audio/oceanAudio';
import { createBlueWhale } from '../scene/blueWhale';
import { createOceanAndSky } from '../scene/oceanShader';
import { createCinemaPostProcessing } from '../scene/postprocessing';
import { createWoodenSailboat } from '../scene/sailboat';
import { createSceneTextures } from '../scene/textures';
import { createWaterParticles } from '../scene/waterParticles';
import {
  BREACH_CYCLE_DURATION,
  BREACH_ERUPTION_TIME,
  BREACH_IMPACT_TIME,
  evaluateBoatBuoyancy,
  evaluateHandheldSway,
  evaluateWhaleKinematics,
  type BreachPhase,
  type CameraPresetId,
} from '../sim/oceanPhysics';

export interface OceanCinemaState {
  playing: boolean;
  cameraPreset: CameraPresetId;
  sunElevationDeg: number; // 2..18
  flareEnabled: boolean;
  audioEnabled: boolean;
  playbackSpeed: number;
}

interface OceanCinemaViewportProps {
  simState: OceanCinemaState;
  seekRequest: { cycleTime: number; seq: number } | null;
  onTelemetry: (info: { cycleTime: number; phase: BreachPhase }) => void;
}

const _sunDir = new THREE.Vector3();
const _boatWorldPos = new THREE.Vector3();
const _targetCamPos = new THREE.Vector3();
const _targetLookPos = new THREE.Vector3();
const _currentCamPos = new THREE.Vector3(-2.4, 4.4, 34.5);
const _currentLookPos = new THREE.Vector3(-0.6, 4.8, -3.0);
const _swayVec = new THREE.Vector3();
const _lookEuler = new THREE.Euler();

export function OceanCinemaViewport({
  simState,
  seekRequest,
  onTelemetry,
}: OceanCinemaViewportProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const simStateRef = useRef<OceanCinemaState>(simState);
  const onTelemetryRef = useRef(onTelemetry);
  const [contextLost, setContextLost] = useState(false);

  simStateRef.current = simState;
  onTelemetryRef.current = onTelemetry;

  // Mutable simulation clock refs so seek/replay requests never recreate the WebGL scene
  const clockStateRef = useRef({
    cycleTime: 1.55, // Begin right before eruption so user witnesses the breach immediately
    elapsedTime: 1.55,
    lastSeekSeq: -1,
    prevEruptionTriggered: false,
    prevImpactTriggered: false,
    resetParticlesPending: false,
  });

  useEffect(() => {
    if (seekRequest && seekRequest.seq !== clockStateRef.current.lastSeekSeq) {
      clockStateRef.current.lastSeekSeq = seekRequest.seq;
      clockStateRef.current.cycleTime = seekRequest.cycleTime;
      clockStateRef.current.prevEruptionTriggered = false;
      clockStateRef.current.prevImpactTriggered = false;
      clockStateRef.current.resetParticlesPending = true;
    }
  }, [seekRequest]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Detect software WebGL (SwiftShader/llvmpipe) to pace loop cleanly without starving browser
    const isSoftwareGl = (() => {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setContextLost(true);
      return;
    }

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.setAttribute('data-testid', 'ocean-cinema-canvas');
    container.appendChild(canvas);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => {
      setContextLost(false);
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xc98c5b, 0.0028);

    const camera = new THREE.PerspectiveCamera(46, width / height, 0.2, 950);
    camera.position.copy(_currentCamPos);
    camera.lookAt(_currentLookPos);

    // Studio procedural PMREM environment for authentic wet skin & brass/wood reflections
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // Warm golden-hour key light + cool twilight hemisphere fill + gentle rim backlight
    const sunKeyLight = new THREE.DirectionalLight(0xffb469, 3.1);
    sunKeyLight.position.set(28, 12, -90);
    sunKeyLight.castShadow = !isSoftwareGl;
    sunKeyLight.shadow.mapSize.set(1024, 1024);
    sunKeyLight.shadow.camera.near = 10;
    sunKeyLight.shadow.camera.far = 160;
    sunKeyLight.shadow.camera.left = -28;
    sunKeyLight.shadow.camera.right = 28;
    sunKeyLight.shadow.camera.top = 28;
    sunKeyLight.shadow.camera.bottom = -20;
    sunKeyLight.shadow.bias = -0.0005;
    sunKeyLight.shadow.normalBias = 0.025;
    scene.add(sunKeyLight);

    const hemiFill = new THREE.HemisphereLight(0x6b8cb3, 0x162b38, 1.05);
    scene.add(hemiFill);

    const rimLight = new THREE.DirectionalLight(0x88b3d6, 0.72);
    rimLight.position.set(-24, 18, 35);
    scene.add(rimLight);

    // Scene assemblies
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const textures = createSceneTextures(maxAniso);
    const oceanSky = createOceanAndSky(textures.flareStreak);
    const sailboat = createWoodenSailboat(textures);
    const whale = createBlueWhale(textures);
    const particles = createWaterParticles(textures);
    const audioEngine = createOceanAudioEngine();

    scene.add(oceanSky.skyMesh);
    scene.add(oceanSky.oceanMesh);
    scene.add(oceanSky.sunFlareSprite);
    scene.add(sailboat.group);
    scene.add(whale.group);
    scene.add(particles.group);

    // GPU Post-Processing (Bloom + Horizontal Anamorphic Lens Flare + Vignette)
    const postProcessing = isSoftwareGl
      ? null
      : createCinemaPostProcessing(renderer, scene, camera, width, height);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Subtle pointer drag camera offset so user can look around without breaking handheld feel
    let dragYawOffset = 0;
    let dragPitchOffset = 0;
    let isDragging = false;
    let lastPointerX = 0;
    let lastPointerY = 0;

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastPointerX;
      const dy = e.clientY - lastPointerY;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      dragYawOffset = THREE.MathUtils.clamp(dragYawOffset - dx * 0.0035, -0.75, 0.75);
      dragPitchOffset = THREE.MathUtils.clamp(dragPitchOffset + dy * 0.0025, -0.25, 0.35);
    };
    const onPointerUp = () => {
      isDragging = false;
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      postProcessing?.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // Render loop & software-WebGL pacing
    let frameId = 0;
    let disposed = false;
    let lastNow = performance.now();
    let lastTelemetryPush = 0;
    let lastAudioEnabled = simStateRef.current.audioEnabled;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const rawDt = (now - lastNow) / 1000;
      lastNow = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.1);

      const cfg = simStateRef.current;
      const cs = clockStateRef.current;

      if (cfg.audioEnabled !== lastAudioEnabled) {
        lastAudioEnabled = cfg.audioEnabled;
        audioEngine.setEnabled(cfg.audioEnabled);
      }

      if (cs.resetParticlesPending) {
        particles.reset();
        cs.resetParticlesPending = false;
      }

      if (cfg.playing) {
        const simDt = dt * cfg.playbackSpeed;
        cs.elapsedTime += simDt;
        const prevCycle = cs.cycleTime;
        cs.cycleTime = (cs.cycleTime + simDt) % BREACH_CYCLE_DURATION;

        // Detect cycle wrap
        if (cs.cycleTime < prevCycle) {
          cs.prevEruptionTriggered = false;
          cs.prevImpactTriggered = false;
        }
        if (!cs.prevEruptionTriggered && cs.cycleTime >= BREACH_ERUPTION_TIME) {
          cs.prevEruptionTriggered = true;
          audioEngine.triggerEruptionSound();
        }
        if (!cs.prevImpactTriggered && cs.cycleTime >= BREACH_IMPACT_TIME) {
          cs.prevImpactTriggered = true;
          audioEngine.triggerImpactSplash();
        }
      }

      audioEngine.updateAmbient(cs.elapsedTime, !cfg.playing);

      // Sun direction from elevation slider (golden hour 2° - 18°)
      const elevRad = THREE.MathUtils.degToRad(cfg.sunElevationDeg);
      const azimRad = 0.18;
      _sunDir.set(
        Math.sin(azimRad) * Math.cos(elevRad),
        Math.sin(elevRad),
        -Math.cos(azimRad) * Math.cos(elevRad),
      ).normalize();

      sunKeyLight.position.copy(_sunDir).multiplyScalar(95);
      const warmth = 1.0 - THREE.MathUtils.clamp((cfg.sunElevationDeg - 3) / 15, 0, 0.55);
      sunKeyLight.color.setHSL(0.075 + (1 - warmth) * 0.03, 0.92, 0.62);
      sunKeyLight.intensity = 2.6 + (1 - warmth) * 1.1;

      // 1. Evaluate Whale Kinematics
      const whaleState = evaluateWhaleKinematics(cs.cycleTime);
      whale.group.position.set(whaleState.x, whaleState.y, whaleState.z);
      whale.group.rotation.order = 'YXZ';
      whale.group.rotation.y = whaleState.yaw;
      whale.group.rotation.z = whaleState.pitch;
      whale.group.rotation.x = whaleState.roll;
      whale.group.updateMatrixWorld(true);

      whale.update({
        spineBend: whaleState.spineBend,
        tailFlap: whaleState.tailFlap,
        wetness: whaleState.wetness,
        elapsedTime: cs.elapsedTime,
      });

      // 2. Evaluate Sailboat Buoyancy
      const boatState = evaluateBoatBuoyancy(cs.elapsedTime, whaleState.timeSinceImpact, 1.0);
      sailboat.group.position.set(boatState.x, boatState.y, boatState.z);
      sailboat.group.rotation.order = 'YXZ';
      sailboat.group.rotation.y = boatState.yaw;
      sailboat.group.rotation.z = boatState.pitch;
      sailboat.group.rotation.x = boatState.roll;
      sailboat.update(cs.elapsedTime);
      _boatWorldPos.set(boatState.x, boatState.y, boatState.z);

      // 3. Update Ocean & Sky
      oceanSky.update({
        elapsedTime: cs.elapsedTime,
        sunDir: _sunDir,
        sunWarmth: warmth,
        impactAge: whaleState.timeSinceImpact,
        eruptionAge: whaleState.timeSinceEruption,
        boatPos: _boatWorldPos,
        calmness: 1.0,
        flareStrength: cfg.flareEnabled ? 1.0 : 0.0,
        camera,
      });

      // 4. Update Particles (Cascade, Eruption, Splash Plumes, Rolling Mist)
      particles.update({
        dt: cfg.playing ? dt * cfg.playbackSpeed : 0,
        elapsedTime: cs.elapsedTime,
        whale: whaleState,
        whaleMatrixWorld: whale.group.matrixWorld,
      });

      // 5. Camera Framing & Slow Handheld Sway
      if (!isDragging) {
        dragYawOffset = THREE.MathUtils.damp(dragYawOffset, 0, 1.2, dt);
        dragPitchOffset = THREE.MathUtils.damp(dragPitchOffset, 0, 1.2, dt);
      }

      if (cfg.cameraPreset === 'handheld_wide') {
        _targetCamPos.set(-2.4 + dragYawOffset * 10, 4.4 + dragPitchOffset * 6, 34.5);
        _targetLookPos.set(
          -0.6 + dragYawOffset * 6,
          4.8 + Math.max(0, whaleState.y) * 0.14,
          -3.0,
        );
      } else if (cfg.cameraPreset === 'deck_perspective') {
        _targetCamPos.set(
          boatState.x - 4.8 + dragYawOffset * 5,
          boatState.y + 2.45 + dragPitchOffset * 3,
          boatState.z + 5.2,
        );
        _targetLookPos.set(
          whaleState.x * 0.65 + dragYawOffset * 8,
          Math.max(1.8, whaleState.y * 0.52 + 2.2),
          whaleState.z * 0.65,
        );
      } else if (cfg.cameraPreset === 'whale_closeup') {
        const trackY = Math.max(1.2, whaleState.y * 0.68);
        _targetCamPos.set(
          whaleState.x - 10.5 + dragYawOffset * 8,
          3.4 + trackY * 0.25 + dragPitchOffset * 4,
          whaleState.z + 15.5,
        );
        _targetLookPos.set(whaleState.x, trackY + 0.6, whaleState.z);
      } else {
        // aerial_orbit
        const orbitAngle = cs.elapsedTime * 0.08 + dragYawOffset * 1.4;
        _targetCamPos.set(
          Math.sin(orbitAngle) * 32,
          16.5 + dragPitchOffset * 10,
          Math.cos(orbitAngle) * 32,
        );
        _targetLookPos.set(-1.2, 3.2, -1.5);
      }

      const dampLambda = isSoftwareGl ? 10 : 3.2;
      _currentCamPos.x = THREE.MathUtils.damp(_currentCamPos.x, _targetCamPos.x, dampLambda, dt);
      _currentCamPos.y = THREE.MathUtils.damp(_currentCamPos.y, _targetCamPos.y, dampLambda, dt);
      _currentCamPos.z = THREE.MathUtils.damp(_currentCamPos.z, _targetCamPos.z, dampLambda, dt);
      _currentLookPos.x = THREE.MathUtils.damp(_currentLookPos.x, _targetLookPos.x, dampLambda, dt);
      _currentLookPos.y = THREE.MathUtils.damp(_currentLookPos.y, _targetLookPos.y, dampLambda, dt);
      _currentLookPos.z = THREE.MathUtils.damp(_currentLookPos.z, _targetLookPos.z, dampLambda, dt);

      const swayScale = cfg.cameraPreset === 'aerial_orbit' ? 0.25 : 1.0;
      const sway = evaluateHandheldSway(cs.elapsedTime, whaleState.timeSinceImpact, swayScale);

      camera.position.set(
        _currentCamPos.x + sway.offsetX,
        _currentCamPos.y + sway.offsetY,
        _currentCamPos.z + sway.offsetZ,
      );
      _swayVec.set(
        _currentLookPos.x + sway.lookOffsetX,
        _currentLookPos.y + sway.lookOffsetY,
        _currentLookPos.z,
      );
      camera.lookAt(_swayVec);

      // Subtle handheld camera roll
      _lookEuler.setFromQuaternion(camera.quaternion, 'YXZ');
      _lookEuler.z += sway.rollAngle;
      camera.quaternion.setFromEuler(_lookEuler);

      // Render frame
      if (postProcessing) {
        postProcessing.setFlareStrength(cfg.flareEnabled ? 1.0 : 0.0);
        postProcessing.render();
      } else {
        renderer.render(scene, camera);
      }

      // Throttled telemetry push (~8Hz) for timeline scrubber & phase label
      if (now - lastTelemetryPush > 120) {
        lastTelemetryPush = now;
        onTelemetryRef.current({
          cycleTime: cs.cycleTime,
          phase: whaleState.phase,
        });
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);

      postProcessing?.dispose();
      audioEngine.dispose();
      particles.dispose();
      whale.dispose();
      sailboat.dispose();
      oceanSky.dispose();
      textures.dispose();
      envTarget.dispose();
      renderer.dispose();

      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    };
  }, []);

  if (contextLost) {
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center bg-[#0d1522] text-stone-200 p-8 text-center"
        data-testid="webgl-fallback"
      >
        <p className="font-display text-3xl text-amber-200 mb-2">Pelagic Breach</p>
        <p className="text-sm text-stone-400 max-w-md">
          WebGL rendering context was interrupted. Reload the page to restore the 3D ocean scene.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={mountRef}
      className="w-full h-full cursor-grab active:cursor-grabbing"
      aria-label="3D Golden Hour Ocean Scene with Wooden Sailboat and Breaching Blue Whale"
    />
  );
}
