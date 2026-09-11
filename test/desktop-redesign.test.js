import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/keiazo-root.css", import.meta.url), "utf8");
const desktop = readFileSync(new URL("../public/desktop-redesign.js", import.meta.url), "utf8");
const preview = readFileSync(
  new URL("../public/experiment/_app/immutable/chunks/DnkASTpr.js", import.meta.url),
  "utf8"
);
const rootNode = readFileSync(
  new URL("../public/experiment/_app/immutable/nodes/2.CLft3SKH.js", import.meta.url),
  "utf8"
);

test("desktop presentation uses its own editorial experience", () => {
  assert.match(index, /desktop-redesign\.js\?v=20260911-2/);
  assert.match(desktop, /Your screen has another side\./);
  assert.match(desktop, /IPHONE SOLO \/ MOTION STUDY/);
  assert.match(desktop, /See how it works/);
  assert.match(css, /Desktop motion-study redesign/);
  assert.match(css, /\.solo-shell\.desktop/);
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.match(desktop, /keiazo-gradient-blob--violet/);
  assert.match(desktop, /keiazo-gradient-blob--ember/);
  assert.match(css, /High-energy desktop gradient field/);
  assert.match(css, /@keyframes keiazo-blob-violet/);
});

test("desktop phone model has a black graphite material palette", () => {
  assert.match(
    preview,
    /"basecolor\.001":\[460810,\.36\].*"metalframe\.002":\[1316380,\.22\].*"backpanel\.001":\[329224,\.5\]/
  );
  assert.match(rootNode, /DnkASTpr\.js\?v=keiazo-black-1/);
});
