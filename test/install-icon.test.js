import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function pngDimensions(path) {
  const bytes = await readFile(path);
  assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG", path);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test("installed app icons use the versioned iPhone Solo mark", async () => {
  const [html, testing, code, branding, flipText, appText] =
    await Promise.all([
      readFile("public/index.html", "utf8"),
      readFile("public/testing/index.html", "utf8"),
      readFile("public/code/index.html", "utf8"),
      readFile("public/head-branding.js", "utf8"),
      readFile("public/flip.webmanifest", "utf8"),
      readFile("public/app.webmanifest", "utf8"),
    ]);

  for (const markup of [html, testing, code, branding]) {
    assert.match(markup, /iphone-solo-touch-icon-v2\.png/);
    assert.doesNotMatch(markup, /solo-apple-touch-icon\.png/);
  }

  assert.match(html, /flip\.webmanifest\?v=20260911-2/);
  assert.match(testing, /app\.webmanifest\?v=20260911-2/);

  const expected = [
    {
      src: "/iphone-solo-icon-192-v2.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any maskable",
    },
    {
      src: "/iphone-solo-icon-512-v2.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any maskable",
    },
  ];

  for (const manifestText of [flipText, appText]) {
    const manifest = JSON.parse(manifestText);
    assert.deepEqual(
      manifest.icons.slice(0, 2).map(({ src, sizes, type, purpose }) => ({
        src,
        sizes,
        type,
        purpose,
      })),
      expected,
    );
  }

  assert.deepEqual(
    await pngDimensions("public/iphone-solo-touch-icon-v2.png"),
    { width: 180, height: 180 },
  );
  assert.deepEqual(
    await pngDimensions("public/iphone-solo-icon-192-v2.png"),
    { width: 192, height: 192 },
  );
  assert.deepEqual(
    await pngDimensions("public/iphone-solo-icon-512-v2.png"),
    { width: 512, height: 512 },
  );
});
