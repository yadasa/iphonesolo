import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync("public/experiment/_app/immutable/nodes/2.CLft3SKH.js", "utf8");
const start = source.indexOf("var Sl=class");
const end = source.indexOf("function wl(", start);
const Sensor = new Function(source.slice(start, end) + ";return Sl;")();
function sample(sensor, degrees) {
  const radians = degrees * Math.PI / 180;
  return sensor.sample({
    accelerationIncludingGravity: {x: 9.81*Math.sin(radians), y: 0, z: -9.81*Math.cos(radians)},
    acceleration: {x: 0, y: 0, z: 0}
  }).angle;
}
test("mobile keeps tracking beyond the fold edge in both directions", () => {
  for (const direction of [-1, 1]) {
    const sensor = new Sensor();
    for (let angle = 0; angle <= 720; angle += 5) {
      assert.ok(Math.abs(sample(sensor, angle*direction) + 2*angle*direction) < 1e-8);
    }
    for (let angle = 720; angle >= 0; angle -= 5) {
      assert.ok(Math.abs(sample(sensor, angle*direction) + 2*angle*direction) < 1e-8);
    }
  }
});
test("mobile resumes without jumping at the sensor wrap boundary", () => {
  const sensor = new Sensor();
  sample(sensor, 170);
  const before = sample(sensor, 179);
  sensor.resume();
  const after = sample(sensor, 181);
  assert.ok(Math.abs(after-before+4) < 1e-8);
});
test("mobile and desktop wrap only the smoothed display angle", () => {
  assert.ok(source.includes("let f=-2*re(-S/2)"));
  assert.ok(source.includes("let p=null===R?k:-2*R"));
});
