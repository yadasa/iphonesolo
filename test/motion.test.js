import test from "node:test";
import assert from "node:assert/strict";
import { clamp, normalizeAngle, smooth, tiltToFold, screenAdjustedTilt } from "../public/assets/motion.js";

test("clamp keeps values in range", () => {
  assert.equal(clamp(-3, 0, 1), 0);
  assert.equal(clamp(.5, 0, 1), .5);
  assert.equal(clamp(8, 0, 1), 1);
});

test("normalizeAngle handles wraparound", () => {
  assert.equal(normalizeAngle(359), -1);
  assert.equal(normalizeAngle(-359), 1);
  assert.equal(normalizeAngle(721), 1);
});

test("tilt mapping is centered, bounded, and symmetric", () => {
  assert.equal(tiltToFold(0).angle, 0);
  assert.equal(tiltToFold(180).angle, 82);
  assert.equal(tiltToFold(-180).angle, 82);
  assert.equal(tiltToFold(-20).progress, tiltToFold(20).progress);
  assert.equal(tiltToFold(-20).direction, -1);
  assert.ok(tiltToFold(45).angle < tiltToFold(90).angle);
  assert.ok(tiltToFold(90).angle < tiltToFold(135).angle);
  assert.ok(tiltToFold(135).angle < tiltToFold(175).angle);
});

test("smoothing is frame-rate independent and bounded", () => {
  const next = smooth(0, 10, 1 / 60);
  assert.ok(next > 0 && next < 10);
});

test("screen orientation chooses the correct physical axis", () => {
  const event = { beta: 30, gamma: 12 };
  assert.equal(screenAdjustedTilt(event, 0), 12);
  assert.equal(screenAdjustedTilt(event, 90), -30);
  assert.equal(screenAdjustedTilt(event, -90), 30);
  assert.equal(screenAdjustedTilt({ beta: 120, gamma: 70 }, 0), 110);
  assert.equal(screenAdjustedTilt({ beta: -120, gamma: -70 }, 0), -110);
  assert.equal(screenAdjustedTilt({ beta: 120, gamma: -70 }, 0, 105), 110);
  assert.equal(screenAdjustedTilt({ beta: -120, gamma: 70 }, 0, -105), -110);
});
