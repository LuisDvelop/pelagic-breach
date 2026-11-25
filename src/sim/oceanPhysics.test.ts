import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BREACH_CYCLE_DURATION,
  BREACH_IMPACT_TIME,
  evaluateBoatBuoyancy,
  evaluateHandheldSway,
  evaluateWhaleKinematics,
  getBreachPhase,
  sampleOceanSurface,
} from './oceanPhysics';

test('sampleOceanSurface returns finite height and normalized surface normal', () => {
  const sample = sampleOceanSurface(3.5, -2.0, 4.25, 1.2);
  assert.equal(Number.isFinite(sample.height), true);
  const normalLen = Math.hypot(sample.normalX, sample.normalY, sample.normalZ);
  assert.ok(Math.abs(normalLen - 1.0) < 1e-5, `Expected unit normal, got ${normalLen}`);
  assert.ok(sample.normalY > 0.5, 'Ocean normal should point predominantly upward');
});

test('whale breach trajectory hits peak altitude near apex and triggers impact pulse', () => {
  const approach = evaluateWhaleKinematics(0.5);
  assert.equal(approach.phase, 'approach');
  assert.ok(approach.y < -4.0, 'Whale starts underwater during approach');

  const apex = evaluateWhaleKinematics(5.2);
  assert.equal(apex.phase, 'apex');
  assert.ok(apex.y > 7.5, `Expected high breach apex > 7.5m, got ${apex.y}`);
  assert.ok(apex.cascadeIntensity > 0.5, 'Water should cascade heavily off flanks at apex');

  const impact = evaluateWhaleKinematics(BREACH_IMPACT_TIME + 0.15);
  assert.equal(impact.phase, 'impact');
  assert.ok(impact.impactPulse > 0.7, 'Impact pulse should peak right after crash');
});

test('getBreachPhase wraps cleanly across cycle duration', () => {
  assert.equal(getBreachPhase(0), 'approach');
  assert.equal(getBreachPhase(BREACH_CYCLE_DURATION), 'approach');
  assert.equal(getBreachPhase(BREACH_CYCLE_DURATION + 5.2), 'apex');
});

test('evaluateBoatBuoyancy responds to shockwave impact with bounded pitch and roll', () => {
  const calmBoat = evaluateBoatBuoyancy(10.0, 12.0, 1.0);
  const shockBoat = evaluateBoatBuoyancy(10.0, 2.2, 1.0);
  assert.ok(Math.abs(calmBoat.pitch) <= 0.35);
  assert.ok(Math.abs(calmBoat.roll) <= 0.4);
  assert.notEqual(
    calmBoat.y.toFixed(4),
    shockBoat.y.toFixed(4),
    'Shockwave should measurably displace the nearby sailboat height',
  );
});

test('evaluateHandheldSway remains bounded and includes tremor right after impact', () => {
  const quiet = evaluateHandheldSway(5.0, 9.0, 1.0);
  const impact = evaluateHandheldSway(5.0, 0.2, 1.0);
  assert.ok(Math.abs(quiet.offsetX) < 0.3);
  assert.ok(Math.abs(quiet.rollAngle) < 0.03);
  assert.ok(
    Math.hypot(impact.offsetX, impact.offsetY) !== Math.hypot(quiet.offsetX, quiet.offsetY),
    'Impact tremor should perturb handheld camera offsets',
  );
});
