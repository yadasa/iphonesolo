import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("home-screen ad CTA and Settings use the new glowing accents", async () => {
  const [source, start] = await Promise.all([
    readFile("public/home-screen-accent.js", "utf8"),
    readFile("public/experiment/_app/immutable/entry/start.DceLwiAH.js", "utf8"),
  ]);

  assert.match(start, /\/home-screen-accent\.js\?v=20260911-1/);
  assert.match(source, /keiazo-ad-pill-overlay/);
  assert.match(source, /Advertise your business here for/);
  assert.match(source, /currentTopBidDollars/);
  assert.match(source, /keiazo-settings-glow-target/);
  assert.match(source, /@keyframes keiazoSettingsOscillate/);
  assert.match(source, /prefers-reduced-motion: reduce/);
});
