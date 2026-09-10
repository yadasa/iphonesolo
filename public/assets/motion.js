export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function normalizeAngle(value) {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

export function smooth(current, target, dt, tau = 0.055) {
  const alpha = 1 - Math.exp(-Math.min(dt, 0.05) / tau);
  return current + (target - current) * alpha;
}

export function tiltToFold(tilt, { deadZone = 1.25, maxTilt = 47 } = {}) {
  const magnitude = Math.max(0, Math.abs(tilt) - deadZone);
  const linear = clamp(magnitude / (maxTilt - deadZone), 0, 1);
  const curved = linear * linear * (3 - 2 * linear);
  return {
    direction: tilt < 0 ? -1 : 1,
    progress: curved,
    angle: 88 * (1 - curved)
  };
}

export function screenAdjustedTilt(event, screenAngle = 0) {
  const beta = event.beta ?? 0;
  const gamma = event.gamma ?? 0;
  const angle = normalizeAngle(screenAngle);
  if (Math.abs(angle) === 90) return angle > 0 ? -beta : beta;
  return gamma;
}

export class MotionTracker {
  baseline = null;
  target = 0;
  value = 0;
  listening = false;

  constructor(onSample) {
    this.onSample = onSample;
    this.handle = this.handle.bind(this);
  }

  static async requestPermission() {
    const OrientationEvent = window.DeviceOrientationEvent;
    if (!OrientationEvent) throw new Error("Motion sensors are not available on this device.");
    if (typeof OrientationEvent.requestPermission === "function") {
      const result = await OrientationEvent.requestPermission();
      if (result !== "granted") throw new Error("Motion permission was not granted. You can still drag the image.");
    }
  }

  start() {
    if (this.listening) return;
    window.addEventListener("deviceorientation", this.handle, { passive: true });
    this.listening = true;
  }

  handle(event) {
    if (event.beta == null || event.gamma == null) return;
    const screenAngle = screen.orientation?.angle ?? window.orientation ?? 0;
    const sample = screenAdjustedTilt(event, screenAngle);
    if (this.baseline == null) this.baseline = sample;
    this.target = normalizeAngle(sample - this.baseline);
    this.onSample?.(this.target);
  }

  recalibrate() {
    this.baseline = null;
    this.target = 0;
    this.value = 0;
  }
}
