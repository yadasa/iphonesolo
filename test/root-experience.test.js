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
    "/code",
    "https://exempliph.ai/",
    "https://instagram.com/keiazo",
    "https://asaday.co/consultation",
    "https://traid.ing/",
    "https://tiktok.com/ozaiek",
    "https://threads.com/keiazo",
    "https://youtube.com/@asaday?si=4JULGekGhmRKHAUN",
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
  assert.match(
    source,
    /home-screen\/\$\{\w+\}[\s\S]{0,160}\?v=keiazo-20260911-5/,
  );
});

test("home-screen products occupy the requested slots", async () => {
  const source = await readFile(rootNodePath, "utf8");
  for (const [slot, name] of [
    ["screen-r5-c2", "PinchKey"],
    ["screen-r5-c3", "YouTube · Asaday"],
    ["screen-r5-c4", "TikTok · ozaiek"],
    ["screen-r6-c3", "GitHub"],
    ["screen-r6-c4", "Threads · keiazo"],
  ]) {
    assert.match(
      source,
      new RegExp(
        'id:\\s*[`\\"]' +
          slot +
          '[`\\"][\\s\\S]{0,80}name:\\s*[`\\"]' +
          name +
          '[`\\"]',
      ),
    );
  }
  assert.match(
    await readFile("public/home-screen/youtube.svg", "utf8"),
    /width="1024"[\s\S]*height="1024"[\s\S]*viewBox="0 0 1024 1024"/,
  );
});

test("online-user widget is shifted upward with its new copy and palette", async () => {
  const source = await readFile(rootNodePath, "utf8");
  assert.match(source, /Users currently online/);
  assert.doesNotMatch(source, /Playing now/);
  assert.match(
    source,
    /audience:\s*\{\s*x:\s*\w+,\s*y:\s*\w+\s*\+\s*2\s*\*\s*\w+/,
  );
  assert.match(source, /#171a31/);
  assert.match(source, /#8fa8ff/);
  assert.match(source, /\[8,\s*9,\s*12,\s*13\]\.includes\(\w+\)/);
});

test("online-user widget is backed by Firebase presence", async () => {
  const source = await readFile(rootNodePath, "utf8");
  const rules = await readFile("database.rules.json", "utf8");
  const workflow = await readFile(
    ".github/workflows/deploy-firebase-hosting.yml",
    "utf8",
  );
  assert.match(source, /tilt-e02fd-default-rtdb\.firebaseio\.com/);
  assert.match(source, /"\.sv":\s*[`"]timestamp[`"]|"\.sv":"timestamp"/);
  assert.match(source, /new Set(?:\(\))?/);
  assert.match(source, /\w+\s*-\s*\w+\.seenAt\s*<\s*6e4/);
  assert.doesNotMatch(source, /\/api\/audience/);
  assert.match(rules, /"presence"/);
  assert.match(rules, /newData\.numChildren\(\) == 3/);
  assert.match(workflow, /deploy --only database/);
  assert.match(workflow, /continue-on-error: true/);
});

test("mobile layout follows the live viewport aspect ratio", async () => {
  const source = await readFile(rootNodePath, "utf8");
  const css = await readFile("public/keiazo-root.css", "utf8");
  assert.match(source, /Math\.min\(\w+\s*\/\s*430,\s*\w+\s*\/\s*700\)/);
  assert.match(
    source,
    /\(\w+\.y\s*-\s*\w+\s*-\s*\w+\s*-\s*12\s*\*\s*\w+\)\s*\/\s*5/,
  );
  assert.match(css, /\.solo-shell:not\(\.desktop\)[\s\S]*height: 100dvh/);
});

test("screen taps open the Liquid Glass action menu", async () => {
  const source = await readFile("public/liquid-glass.js", "utf8");
  assert.match(source, /Upload new photo\/video/);
  assert.match(source, /Return to Home Screen/);
  assert.match(source, /Enable full screen/);
  assert.match(source, /Download the code/);
  assert.match(source, /event\.stopImmediatePropagation\(\)/);
  assert.match(source, /\(5\.0 \+ 13\.0 \* edge\) \* edge/);
  assert.match(source, /1000 \/ 30/);
});

test("custom-domain metadata and light-button contrast are current", async () => {
  const html = await readFile("public/index.html", "utf8");
  const source = await readFile(rootNodePath, "utf8");
  const css = await readFile("public/keiazo-root.css", "utf8");
  assert.match(html, /https:\/\/iphonesolo\.com\//);
  assert.doesNotMatch(html, /solotilt\.com/);
  assert.doesNotMatch(source, /solotilt\.com/);
  assert.match(
    css,
    /#motion-permission button[\s\S]*color: #15181d !important/,
  );
});

test("language options keep English and Spanish first and include new locales", async () => {
  const runtime = await readFile(
    "public/experiment/_app/immutable/chunks/NmbfL6iO.js",
    "utf8",
  );
  const source = await readFile(rootNodePath, "utf8");
  assert.match(runtime, /n\s*=\s*\[\s*`en`,\s*`es`,/);
  for (const [locale, label] of [
    ["de", "Deutsch"],
    ["ru", "Русский"],
    ["id", "Bahasa Indonesia"],
    ["hi", "हिन्दी"],
    ["bn", "বাংলা"],
    ["te", "తెలుగు"],
    ["mr", "मराठी"],
    ["ta", "தமிழ்"],
    ["ur", "اردو"],
    ["gu", "ગુજરાતી"],
    ["kn", "ಕನ್ನಡ"],
    ["ml", "മലയാളം"],
    ["pa", "ਪੰਜਾਬੀ"],
  ]) {
    assert.match(runtime, new RegExp("`" + locale + "`"));
    assert.match(source, new RegExp(locale + ':\\s*[`\\"]' + label + '[`\\"]'));
  }
});

test("language picker is custom, scrollable, and preserves native selection", async () => {
  const source = await readFile("public/liquid-glass.js", "utf8");
  const css = await readFile("public/keiazo-root.css", "utf8");
  assert.match(source, /enhanceLanguagePicker/);
  assert.match(source, /role", "listbox"/);
  assert.match(source, /select\.dispatchEvent\(new Event\("change"/);
  assert.match(
    css,
    /\.keiazo-language-menu[\s\S]*max-height: min\(280px, 42dvh\)/,
  );
  assert.match(css, /\.keiazo-language-menu[\s\S]*overflow-y: auto/);
});

test("Liquid Glass uses the exact church option1 edge pipeline without a tint fill", async () => {
  const source = await readFile("public/liquid-glass.js", "utf8");
  assert.match(source, /float edge = 1\.0 - smoothstep\(4\.0, 16\.0, dist\)/);
  assert.match(source, /\(5\.0 \+ 13\.0 \* edge\) \* edge/);
  assert.match(source, /gl_FragColor = vec4\(glass, 1\.0\)/);
  assert.doesNotMatch(source, /beigeOpacity/);
  assert.match(source, /#settings-dialog/);
});

test("video uploads use the guarded canvas-frame pipeline", async () => {
  const source = await readFile(rootNodePath, "utf8");
  assert.match(source, /accept="image\/\*,video\/\*,\.mov,\.m4v,\.mp4,\.webm"/);
  assert.match(source, /requestVideoFrameCallback/);
  assert.match(source, /\.context\.drawImage\(\w+\.video/);
  assert.match(source, /Math\.min\(1536,\s*\w+,\s*\w+\)/);
  assert.match(source, /\.isContextLost\(\)/);
});

test("Garden-inspired glass variables and accessibility fallbacks are present", async () => {
  const css = await readFile("public/keiazo-root.css", "utf8");
  assert.match(css, /--keiazo-glass-blur: 22px/);
  assert.match(css, /--keiazo-glass-saturation: 145%/);
  assert.match(css, /prefers-reduced-transparency: reduce/);
  assert.match(css, /prefers-contrast: more/);
});
