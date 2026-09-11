import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("desktop entry points load the inspection shortcut deterrent", async () => {
  const [guard, root, code, testing] = await Promise.all([
    readFile("public/devtools-guard.js", "utf8"),
    readFile("public/index.html", "utf8"),
    readFile("public/code/index.html", "utf8"),
    readFile("public/testing/index.html", "utf8"),
  ]);

  for (const html of [root, code, testing]) {
    assert.match(html, /\/devtools-guard\.js\?v=20260911-1/);
  }

  assert.match(guard, /min-width: 768px/);
  assert.match(guard, /hover: hover/);
  assert.match(guard, /pointer: fine/);
  assert.match(guard, /event\.key === "F12"/);
  assert.match(guard, /event\.ctrlKey && event\.shiftKey/);
  assert.match(guard, /event\.metaKey && event\.altKey/);
  assert.match(guard, /contextmenu/);
  assert.match(guard, /preventDefault\(\)/);
  assert.match(guard, /stopImmediatePropagation\(\)/);
});
