import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_ROOT = path.join(ROOT, "public");
const OUTPUT = path.join(
  ROOT,
  "functions",
  "downloads",
  "iphonesolo-source.zip",
);
const PACKAGE_ROOT = "iphonesolo-source";
const EXCLUDED_TOP_LEVEL = new Set([
  "code",
  "testing",
  "code-gate.js",
  "deploy-version.txt",
]);
const SOURCE_VERSION = process.env.SOURCE_VERSION || "local";

function normalized(relativePath) {
  return relativePath.split(path.sep).join("/");
}

async function collectFiles(directory, relative = "") {
  const found = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const childRelative = path.join(relative, entry.name);
    if (!relative && EXCLUDED_TOP_LEVEL.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await collectFiles(absolute, childRelative)));
    } else if (entry.isFile()) {
      found.push({
        name: normalized(childRelative),
        data: await fs.readFile(absolute),
      });
    }
  }
  return found;
}

function cleanIndex(source) {
  return source
    .replace(
      /\s*<script\s+[\s\S]*?src="https:\/\/umami\.gnimoay\.com\/script\.js"[\s\S]*?<\/script>/g,
      "",
    )
    .replace(/\s*data-website-id="[^"]*"/g, "")
    .replace(/\s*data-domains="[^"]*"/g, "");
}

function cleanLiquidGlass(source) {
  return source.replace(
    /\s*<a href="https:\/\/github\.com\/yadasa\/iphonesolo\/archive\/refs\/heads\/main\.zip">[\s\S]*?Download the code<\/a>/,
    "",
  );
}

function distributionServiceWorker() {
  return `const CACHE = "iphonesolo-source-v1";
const CORE = ["/", "/index.html", "/keiazo-root.css", "/liquid-glass.js", "/flip.webmanifest"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") return caches.match("/index.html");
        return Response.error();
      }),
  );
});
`;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimestamp() {
  const epoch = process.env.SOURCE_DATE_EPOCH
    ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000)
    : new Date("2026-01-01T00:00:00Z");
  const year = Math.max(1980, epoch.getUTCFullYear());
  const date =
    ((year - 1980) << 9) |
    ((epoch.getUTCMonth() + 1) << 5) |
    epoch.getUTCDate();
  const time =
    (epoch.getUTCHours() << 11) |
    (epoch.getUTCMinutes() << 5) |
    Math.floor(epoch.getUTCSeconds() / 2);
  return { date, time };
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const stamp = dosTimestamp();

  for (const file of files) {
    const name = Buffer.from(`${PACKAGE_ROOT}/${file.name}`);
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
    const checksum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0o100644 * 0x10000, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }

  const centralSize = centralParts.reduce((size, part) => size + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

const files = await collectFiles(PUBLIC_ROOT);
for (const file of files) {
  if (file.name === "index.html") {
    file.data = Buffer.from(cleanIndex(file.data.toString("utf8")));
  } else if (file.name === "liquid-glass.js") {
    file.data = Buffer.from(cleanLiquidGlass(file.data.toString("utf8")));
  } else if (file.name === "sw.js") {
    file.data = Buffer.from(distributionServiceWorker());
  }
}

const readme = `# iPhone Solo source package

This is a sanitized, deployable snapshot of iPhone Solo (${SOURCE_VERSION}).

## Run locally

1. Install Node.js 20 or newer.
2. Run \`npm run dev\`.
3. Open the local URL printed in the terminal.

Motion access requires HTTPS on a physical iPhone. Pointer interaction remains available on desktop.

## What was intentionally removed

The purchase page, Stripe/Firebase backend, deployment workflow, internal tests and notes, production analytics configuration, and repository administration files are not part of this package. The app itself and the assets it needs to run are included.

## Attribution

See \`models/CREDITS.txt\` for the third-party 3D model attribution and CC BY 4.0 terms. No Apple endorsement is implied.
`;
const packageJson = JSON.stringify(
  {
    name: "iphonesolo-source",
    version: "1.0.0",
    private: true,
    type: "module",
    scripts: { dev: "npx --yes serve ." },
    engines: { node: ">=20" },
  },
  null,
  2,
) + "\n";

files.push(
  { name: "README.md", data: Buffer.from(readme) },
  { name: "package.json", data: Buffer.from(packageJson) },
  { name: ".gitignore", data: Buffer.from("node_modules/\n.DS_Store\n") },
);
files.sort((left, right) => left.name.localeCompare(right.name));

const manifest = {
  product: "iPhone Solo",
  version: SOURCE_VERSION,
  generatedAt: new Date().toISOString(),
  files: Object.fromEntries(
    files.map(file => [
      file.name,
      createHash("sha256").update(file.data).digest("hex"),
    ]),
  ),
};
files.push({
  name: "SOURCE-MANIFEST.json",
  data: Buffer.from(JSON.stringify(manifest, null, 2) + "\n"),
});

await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
await fs.writeFile(OUTPUT, createZip(files));
const archive = await fs.stat(OUTPUT);
console.log(`Built ${OUTPUT} (${archive.size} bytes, ${files.length} files)`);
