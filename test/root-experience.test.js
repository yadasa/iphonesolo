import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootNodePath = "public/experiment/_app/immutable/nodes/2.CLft3SKH.js";

async function imageDimensions(path) {
  const bytes = await readFile(path);
  if (bytes.subarray(1, 4).toString("ascii") === "PNG") {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8)
    throw new Error(`Unknown image: ${path}`);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    ) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    offset += 2 + bytes.readUInt16BE(offset + 2);
  }
  throw new Error(`JPEG dimensions missing: ${path}`);
}

test("root home-screen links use the requested destinations", async () => {
  const source = await readFile(rootNodePath, "utf8");
  for (const url of [
    "https://github.com/",
    "https://exempliph.ai/",
    "https://instagram.com/keiazo",
    "https://asaday.co/consultation",
    "https://traid.ing/",
    "https://tiktok.com/ozaiek",
    "https://threads.com/keiazo",
  ]) {
    assert.equal(
      source.split(url).length - 1,
      1,
      `${url} should occur exactly once`,
    );
  }
});

test("replacement icons and wallpaper have renderer-safe dimensions", async () => {
  const expected = new Map([
    ["public/home-screen/shellclick.png", { width: 1024, height: 1024 }],
    ["public/home-screen/x.jpg", { width: 1024, height: 1024 }],
    ["public/home-screen/rednote.jpg", { width: 1024, height: 1024 }],
    ["public/home-screen/traid.jpg", { width: 1024, height: 1024 }],
    ["public/home-screen/colerm.jpg", { width: 1024, height: 1024 }],
    ["public/home-screen/wallpaper.jpg", { width: 942, height: 2048 }],
  ]);
  for (const [path, dimensions] of expected) {
    assert.deepEqual(await imageDimensions(path), dimensions, path);
  }
});

test("home-screen artwork URLs are versioned to replace stale iOS icons", async () => {
  const source = await readFile(rootNodePath, "utf8");
  assert.match(source, /home-screen\/\$\{n\}\.\$\{[^}]+\}\?v=keiazo-20260911-3/);
});

test("video uploads use the guarded canvas-frame pipeline", async () => {
  const source = await readFile(rootNodePath, "utf8");
  assert.match(source, /accept="image\/\*,video\/\*,\.mov,\.m4v,\.mp4,\.webm"/);
  assert.match(source, /requestVideoFrameCallback/);
  assert.match(source, /state\.context\.drawImage\(\s*state\.video/);
  assert.match(source, /Math\.min\(1536,\s*a,\s*displayBudget\)/);
  assert.match(source, /i\.isContextLost\(\)/);
  assert.doesNotMatch(source, /tex(?:Sub)?Image2D\([^;]*state\.video/s);
});

test("Garden-inspired glass variables and accessibility fallbacks are present", async () => {
  const css = await readFile("public/keiazo-root.css", "utf8");
  assert.match(css, /--keiazo-glass-blur: 22px/);
  assert.match(css, /--keiazo-glass-saturation: 145%/);
  assert.match(css, /prefers-reduced-transparency: reduce/);
  assert.match(css, /prefers-contrast: more/);
});
