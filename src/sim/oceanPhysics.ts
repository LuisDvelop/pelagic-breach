export type BreachPhase =
  | 'approach'
  | 'eruption'
  | 'apex'
  | 'descent'
  | 'impact'
  | 'aftermath';

export type CameraPresetId =
  | 'handheld_wide'
  | 'deck_perspective'
  | 'whale_closeup'
  | 'aerial_orbit';

export interface GerstnerWaveSpec {
  dirX: number;
  dirZ: number;
  steepness: number;
  wavelength: number;
  speedMultiplier: number;
}

export const OCEAN_WAVES: readonly GerstnerWaveSpec[] = [
  { dirX: 0.86, dirZ: 0.51, steepness: 0.14, wavelength: 28.0, speedMultiplier: 0.85 },
  { dirX: 0.45, dirZ: 0.89, steepness: 0.11, wavelength: 17.5, speedMultiplier: 1.0 },
  { dirX: -0.62, dirZ: 0.78, steepness: 0.08, wavelength: 11.2, speedMultiplier: 1.15 },
  { dirX: 0.94, dirZ: -0.34, steepness: 0.05, wavelength: 6.4, speedMultiplier: 1.25 },
];

export const BREACH_CYCLE_DURATION = 16.0;
export const BREACH_ERUPTION_TIME = 2.0;
export const BREACH_APEX_TIME = 5.4;
export const BREACH_IMPACT_TIME = 8.95;

export const WHALE_ORIGIN = { x: 5.5, z: -4.0 };
export const BOAT_ORIGIN = { x: -8.2, z: 2.8 };

export interface OceanSample {
  height: number;
  normalX: number;
  normalY: number;
  normalZ: number;
}

export interface WhaleKinematicsState {
  cycleTime: number;
  phase: BreachPhase;
  x: number;
  y: number;
  z: number;
  pitch: number; // radians: positive = nose up
  yaw: number;   // radians: heading
  roll: number;  // radians: corkscrew roll around longitudinal axis
  spineBend: number; // curvature factor (-1..1)
  tailFlap: number;  // fluke oscillation angle
  wetness: number;   // 0..1 glistening intensity
  cascadeIntensity: number; // 0..1 water streaming off flanks
  eruptionPulse: number;    // 0..1 burst when breaking surface upward
  impactPulse: number;      // 0..1 burst when slamming back down
  timeSinceImpact: number;  // seconds since last impact (>= 0)
  timeSinceEruption: number; // seconds since eruption (>= 0)
}

export interface BoatBuoyancyState {
  x: number;
  y: number;
  z: number;
  pitch: number;
  roll: number;
  yaw: number;
  heaveOffset: number;
}

export interface HandheldSwaySample {
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  rollAngle: number;
  lookOffsetX: number;
  lookOffsetY: number;
}

const GRAVITY = 9.81;

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Evaluates the exact Gerstner wave height + surface normal at (x, z, elapsedTime),
 * matching the GPU vertex shader displacement, plus the radial breach shockwave ring.
 */
export function sampleOceanSurface(
  x: number,
  z: number,
  elapsedTime: number,
  impactAge: number,
  impactOrigin = WHALE_ORIGIN,
  calmness = 1.0,
): OceanSample {
  let y = 0;
  let dYdX = 0;
  let dYdZ = 0;

  for (let i = 0; i < OCEAN_WAVES.length; i++) {
    const w = OCEAN_WAVES[i];
    const len = Math.hypot(w.dirX, w.dirZ) || 1;
    const dx = w.dirX / len;
    const dz = w.dirZ / len;
    const k = (2 * Math.PI) / w.wavelength;
    const c = Math.sqrt(GRAVITY / k) * w.speedMultiplier;
    const steep = w.steepness * calmness;
    const amp = steep / k;
    const phase = k * (dx * x + dz * z) - c * k * elapsedTime;

    const sinP = Math.sin(phase);
    const cosP = Math.cos(phase);

    y += amp * sinP;
    const slope = amp * k * cosP;
    dYdX += dx * slope;
    dYdZ += dz * slope;
  }

  // Radial breach shockwave swell propagating outward from impact site
  if (impactAge >= 0 && impactAge < 10.0) {
    const dist = Math.hypot(x - impactOrigin.x, z - impactOrigin.z);
    const waveSpeed = 6.2;
    const front = impactAge * waveSpeed;
    const bandWidth = 4.2 + impactAge * 0.45;
    const delta = dist - front;
    const envelope =
      Math.exp(-(delta * delta) / (2 * bandWidth * bandWidth)) *
      Math.exp(-impactAge * 0.38) *
      smoothstep(0.0, 0.28, impactAge);

    const ripplePhase = delta * 1.45;
    const shockAmp = 0.82 * envelope;
    y += shockAmp * Math.cos(ripplePhase);

    if (dist > 0.05) {
      const radialSlope =
        (-shockAmp * 1.45 * Math.sin(ripplePhase) -
          (delta / (bandWidth * bandWidth)) * shockAmp * Math.cos(ripplePhase)) /
        dist;
      dYdX += (x - impactOrigin.x) * radialSlope;
      dYdZ += (z - impactOrigin.z) * radialSlope;
    }
  }

  // Normal = normalize(-dYdX, 1, -dYdZ)
  const invLen = 1 / Math.hypot(-dYdX, 1, -dYdZ);
  return {
    height: y,
    normalX: -dYdX * invLen,
    normalY: invLen,
    normalZ: -dYdZ * invLen,
  };
}

export function getBreachPhase(cycleTime: number): BreachPhase {
  const t = ((cycleTime % BREACH_CYCLE_DURATION) + BREACH_CYCLE_DURATION) % BREACH_CYCLE_DURATION;
  if (t < BREACH_ERUPTION_TIME) return 'approach';
  if (t < 4.5) return 'eruption';
  if (t < 6.6) return 'apex';
  if (t < BREACH_IMPACT_TIME) return 'descent';
  if (t < 10.6) return 'impact';
  return 'aftermath';
}

/**
 * Computes the breaching blue whale's 3D trajectory, orientation, spine flex,
 * cascading water factor, and eruption/impact pulses for a given cycle time.
 */
export function evaluateWhaleKinematics(cycleTime: number): WhaleKinematicsState {
  const t = ((cycleTime % BREACH_CYCLE_DURATION) + BREACH_CYCLE_DURATION) % BREACH_CYCLE_DURATION;
  const phase = getBreachPhase(t);

  // Normalized breach flight window: t in [1.4, 9.6]
  const launchStart = 1.35;
  const impactEnd = BREACH_IMPACT_TIME;
  const flightDuration = impactEnd - launchStart;

  let x = WHALE_ORIGIN.x;
  let y = -11.5;
  let z = WHALE_ORIGIN.z;
  let pitch = 0.2;
  let yaw = -0.48; // Angled gracefully across the wide frame toward the camera-left horizon
  let roll = 0.0;
  let spineBend = 0.0;
  let tailFlap = Math.sin(t * 2.4) * 0.25;
  let cascadeIntensity = 0.0;
  let eruptionPulse = 0.0;
  let impactPulse = 0.0;

  if (t < launchStart) {
    // Deep underwater power-stroke swim upward
    const p = smoothstep(0, launchStart, t);
    y = lerp(-15.0, -7.2, p);
    x = WHALE_ORIGIN.x - (1 - p) * 5.2;
    z = WHALE_ORIGIN.z - (1 - p) * 3.0;
    pitch = lerp(0.55, 1.08, p);
    tailFlap = Math.sin(t * 5.8) * 0.42;
    spineBend = Math.sin(t * 5.8) * 0.14;
  } else if (t <= impactEnd + 1.1) {
    // Ballistic parabolic breach arc with aerodynamic/hydrodynamic curve
    const u = clamp((t - launchStart) / flightDuration, 0, 1.15);
    const flightU = clamp(u, 0, 1);

    // Parabolic height peaking around u = 0.50 (t ≈ 5.15s) at ~8.8m center height
    // (23m whale body spans nicely from water surface up to ~17m without clipping top of frame)
    const peakHeight = 8.8;
    const baseDepth = -6.8;
    const arc = 4.0 * flightU * (1.0 - flightU);
    y = baseDepth + (peakHeight - baseDepth) * Math.pow(Math.max(0, arc), 0.9);

    if (u > 1.0) {
      // Plunging below surface after impact
      const subU = (u - 1.0) / 0.15;
      y = lerp(baseDepth * 0.35, -10.5, smoothstep(0, 1, subU));
    }

    // Horizontal arc travel: rises upward beside sailboat and arcs gracefully across center-right
    x = WHALE_ORIGIN.x + lerp(-0.8, 6.2, smoothstep(0, 1, flightU));
    z = WHALE_ORIGIN.z + lerp(-0.5, 2.6, smoothstep(0, 1, flightU));

    // Pitch transitions smoothly from steep upward (+56 deg) -> horizontal at apex -> plunging (-46 deg)
    const risePitch = 0.98;
    const divePitch = -0.82;
    pitch = lerp(risePitch, divePitch, smoothstep(0.08, 0.96, flightU));

    // Majestic corkscrew roll as the whale clears the water and turns onto its flank
    roll = lerp(0.05, 1.52, smoothstep(0.18, 0.88, flightU));
    yaw = -0.48 + smoothstep(0.15, 0.95, flightU) * 0.28;

    // Spine arches backward slightly at apex, then flexes on entry
    spineBend =
      Math.sin(flightU * Math.PI) * -0.26 +
      Math.sin(t * 3.6) * 0.05 * (1 - smoothstep(0.3, 0.7, flightU));
    tailFlap = Math.sin(t * 3.2) * 0.18 * (1 - smoothstep(0.25, 0.65, flightU));

    // Water cascading off flanks whenever whale body is above water
    const heightAboveWater = clamp((y + 2.0) / 10.0, 0, 1);
    cascadeIntensity = heightAboveWater * (1.0 - smoothstep(0.86, 1.02, flightU));

    // Eruption burst as nose/torso breaks surface around t = 2.0s - 3.6s
    eruptionPulse =
      smoothstep(1.85, 2.35, t) * (1.0 - smoothstep(2.55, 3.9, t));

    // Massive impact burst centered at BREACH_IMPACT_TIME
    impactPulse =
      smoothstep(BREACH_IMPACT_TIME - 0.18, BREACH_IMPACT_TIME + 0.12, t) *
      (1.0 - smoothstep(BREACH_IMPACT_TIME + 0.35, BREACH_IMPACT_TIME + 1.45, t));
  } else {
    // Subsurface glide away & loop return reset deep below surface
    const postU = smoothstep(impactEnd + 1.1, BREACH_CYCLE_DURATION, t);
    x = WHALE_ORIGIN.x + lerp(5.8, -5.2, postU);
    z = WHALE_ORIGIN.z + lerp(3.4, -3.0, postU);
    y = lerp(-10.5, -15.0, Math.sin(postU * Math.PI * 0.5));
    pitch = lerp(-0.45, 0.55, postU);
    roll = lerp(1.52, 0.0, smoothstep(0.0, 0.45, postU));
    yaw = lerp(-0.2, -0.48, postU);
    tailFlap = Math.sin(t * 4.2) * 0.34;
    spineBend = Math.sin(t * 4.2) * 0.1;
  }

  // Time since impact wraps across cycle boundary so shockwave rings continue smoothly in aftermath
  let timeSinceImpact = t - BREACH_IMPACT_TIME;
  if (timeSinceImpact < 0) {
    timeSinceImpact += BREACH_CYCLE_DURATION;
  }

  let timeSinceEruption = t - BREACH_ERUPTION_TIME;
  if (timeSinceEruption < 0) {
    timeSinceEruption += BREACH_CYCLE_DURATION;
  }

  return {
    cycleTime: t,
    phase,
    x,
    y,
    z,
    pitch,
    yaw,
    roll,
    spineBend,
    tailFlap,
    wetness: 1.0,
    cascadeIntensity,
    eruptionPulse,
    impactPulse,
    timeSinceImpact,
    timeSinceEruption,
  };
}

/**
 * Computes damped sailboat buoyancy, pitch, and roll from multi-point hull sampling
 * on the Gerstner + shockwave ocean surface.
 */
export function evaluateBoatBuoyancy(
  elapsedTime: number,
  impactAge: number,
  calmness = 1.0,
): BoatBuoyancyState {
  const bx = BOAT_ORIGIN.x;
  const bz = BOAT_ORIGIN.z;

  // Sample bow, stern, port, starboard around the 8.5m sailboat
  const bow = sampleOceanSurface(bx + 2.8, bz - 1.2, elapsedTime, impactAge, WHALE_ORIGIN, calmness);
  const stern = sampleOceanSurface(bx - 2.8, bz + 1.2, elapsedTime, impactAge, WHALE_ORIGIN, calmness);
  const port = sampleOceanSurface(bx - 0.6, bz - 1.4, elapsedTime, impactAge, WHALE_ORIGIN, calmness);
  const stbd = sampleOceanSurface(bx + 0.6, bz + 1.4, elapsedTime, impactAge, WHALE_ORIGIN, calmness);
  const center = sampleOceanSurface(bx, bz, elapsedTime, impactAge, WHALE_ORIGIN, calmness);

  const avgHeight = (bow.height + stern.height + port.height + stbd.height + center.height) / 5;
  const pitchSlope = (bow.height - stern.height) / 6.0;
  const rollSlope = (stbd.height - port.height) / 2.9;

  // Gentle wind heel + subtle yaw sway
  const windHeel = 0.065 + Math.sin(elapsedTime * 0.45) * 0.022;
  const yaw = 0.42 + Math.sin(elapsedTime * 0.22) * 0.035;

  return {
    x: bx + Math.sin(elapsedTime * 0.35) * 0.14,
    y: avgHeight - 0.12,
    z: bz + Math.cos(elapsedTime * 0.28) * 0.12,
    pitch: clamp(Math.atan(pitchSlope) * 0.85, -0.32, 0.32),
    roll: clamp(Math.atan(rollSlope) * 0.85 + windHeel, -0.38, 0.38),
    yaw,
    heaveOffset: avgHeight,
  };
}

/**
 * Generates slow organic handheld camera breathing, slight sway, and impact tremor.
 */
export function evaluateHandheldSway(
  elapsedTime: number,
  impactAge: number,
  swayScale = 1.0,
): HandheldSwaySample {
  const breathX =
    Math.sin(elapsedTime * 0.47) * 0.14 + Math.sin(elapsedTime * 1.13) * 0.045;
  const breathY =
    Math.cos(elapsedTime * 0.61) * 0.09 + Math.sin(elapsedTime * 1.37) * 0.03;
  const breathZ =
    Math.sin(elapsedTime * 0.39 + 1.2) * 0.11;
  const roll =
    Math.sin(elapsedTime * 0.43 + 0.5) * 0.014 + Math.cos(elapsedTime * 0.91) * 0.005;

  // Subtle camera shock tremor when the giant whale crashes back into the water
  let tremor = 0;
  if (impactAge >= 0 && impactAge < 1.6) {
    const decay = Math.exp(-impactAge * 3.1) * smoothstep(0.0, 0.08, impactAge);
    tremor = decay * 0.22;
  }

  const shakeX = Math.sin(elapsedTime * 28.0) * tremor;
  const shakeY = Math.cos(elapsedTime * 34.0) * tremor * 1.25;
  const shakeRoll = Math.sin(elapsedTime * 23.0) * tremor * 0.035;

  return {
    offsetX: (breathX + shakeX) * swayScale,
    offsetY: (breathY + shakeY) * swayScale,
    offsetZ: breathZ * swayScale,
    rollAngle: (roll + shakeRoll) * swayScale,
    lookOffsetX: (Math.sin(elapsedTime * 0.53 + 0.7) * 0.18 + shakeX * 0.6) * swayScale,
    lookOffsetY: (Math.cos(elapsedTime * 0.67) * 0.11 + shakeY * 0.6) * swayScale,
  };
}
