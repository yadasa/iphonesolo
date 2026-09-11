import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("home-screen ad CTA uses a restrained glass pill and Settings keeps its glow", async () => {
  const [source, start] = await Promise.all([
    readFile("public/home-screen-accent.js", "utf8"),
    readFile("public/experiment/_app/immutable/entry/start.DceLwiAH.js", "utf8"),
  ]);

  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(start, /\/home-screen-accent\.js\?v=20260911-2/);
  assert.match(source, /keiazo-ad-pill-overlay/);
  assert.match(source, /Advertise your business here for/);
  assert.match(source, /currentTopBidDollars/);
  assert.match(source, /fill: rgba\(255, 255, 255, 0\.105\)/);
  assert.match(source, /text\.removeAttribute\("textLength"\)/);
  assert.doesNotMatch(source, /@keyframes keiazoAdPillGlow/);
  assert.match(source, /keiazo-settings-glow-target/);
  assert.match(source, /@keyframes keiazoSettingsOscillate/);
  assert.match(source, /prefers-reduced-motion: reduce/);
});
