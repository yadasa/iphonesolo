export const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
export function foldAmount(angle, neutral = 110, strength = 1) {
  if (![angle, neutral, strength].every(Number.isFinite)) return 0;
  return clamp(Math.abs(clamp(angle, 0, 180) - clamp(neutral, 20, 160)) / 90 * clamp(strength, 0, 1.5), 0, 1);
}
export function hingePoint(x, y, amount) {
  const d = clamp((y + 1) / 2, 0, 1);
  const ramp = (d * d * (3 - 2 * d)) ** 1.03;
  return [x * (1 + .55 * amount * ramp), -1 + (y + 1) / (1 + 2.57 * amount * d)];
}
export function smoothAngle(current, target, elapsed) {
  return current + (target - current) * (1 - Math.exp(-Math.min(100, Math.max(0, elapsed)) / 95));
}
