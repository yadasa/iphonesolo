import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("code page has the donation CTA, presets, and consultation actions", async () => {
  const html = await read("public/code/index.html");
  assert.match(html, /Want the code\?/);
  assert.match(html, /Make a donation and download immediately\./);
  for (const amount of [5, 10, 50, 100]) {
    assert.match(html, new RegExp(`data-amount="${amount}"`));
  }
  assert.equal(
    html.split('href="https://asaday.co/consultation"').length - 1,
    2,
  );
  assert.match(html, />1 on 1 consultation</);
  assert.match(html, />Hire me</);
  assert.doesNotMatch(html, /minimum donation|\$2/i);
});

test("minimum donation is only disclosed after a too-small attempt", async () => {
  const client = await read("public/code/code.js");
  const server = await read("functions/index.js");
  assert.match(client, /if \(amount < 2\)/);
  assert.match(client, /minimum donation is \$2/i);
  assert.match(server, /amountCents < 200/);
});

test("Stripe checkout is server-created and paid sessions gate the download", async () => {
  const client = await read("public/code/code.js");
  const server = await read("functions/index.js");
  const firebase = JSON.parse(await read("firebase.json"));
  assert.match(client, /fetch\("\/api\/code-checkout"/);
  assert.match(client, /\/api\/code-verify\?session_id=/);
  assert.doesNotMatch(client, /STRIPE_SECRET_KEY/);
  assert.match(server, /process\.env\.STRIPE_SECRET_KEY/);
  assert.match(server, /payment_status === "paid"/);
  assert.match(server, /metadata\?\.product === PRODUCT_KEY/);
  assert.match(server, /downloads", DOWNLOAD_FILENAME/);
  assert.match(server, /Content-Type", "application\\/zip"/);
  assert.match(server, /fs\\.createReadStream\\(DOWNLOAD_PATH\\)/);
  assert.doesNotMatch(server, /archive\\/refs\\/heads\\/main\\.zip/);
  const rewrites = firebase.hosting.rewrites;
  for (const [source, functionId] of [
    ["/api/code-health", "codeHealth"],
    ["/api/code-checkout", "codeCheckout"],
    ["/api/code-verify", "codeVerify"],
    ["/api/code-download", "codeDownload"],
  ]) {
    assert.ok(
      rewrites.some(
        (rewrite) =>
          rewrite.source === source && rewrite.function?.functionId === functionId,
      ),
      `${source} should route to ${functionId}`,
    );
  }
});

test("Stripe setup is one secret and deploy verifies it automatically", async () => {
  const workflow = await read(".github/workflows/deploy-firebase-hosting.yml");
  const server = await read("functions/index.js");
  assert.match(workflow, /Validate Stripe configuration/);
  assert.match(workflow, /api\.stripe\.com\/v1\/account/);
  assert.match(workflow, /secrets\.STRIPE_SECRET_KEY/);
  assert.match(workflow, /functions\/.env/);
  assert.match(workflow, /Verify Stripe donation backend/);
  assert.match(workflow, /\/api\/code-health/);
  assert.doesNotMatch(workflow, /skipping Stripe functions deployment/);
  assert.match(server, /exports\.codeHealth/);
  assert.match(server, /await stripeRequest\("\/account"\)/);
});

test("paid return retries verification and starts the download without a second click", async () => {
  const client = await read("public/code/code.js");
  assert.match(client, /fetch\("\/api\/code-health"/);
  assert.match(client, /for \(let attempt = 0; attempt < 10; attempt \+= 1\)/);
  assert.match(client, /window\.location\.assign\(data\.downloadUrl\)/);
});

test("existing Download Code action is gated through /code", async () => {
  const gate = await read("public/code-gate.js");
  const start = await read(
    "public/experiment/_app/immutable/entry/start.DceLwiAH.js",
  );
  assert.match(gate, /archive\/refs\/heads\/main\.zip/);
  assert.match(gate, /anchor\.href = "\/code"/);
  assert.match(start, /\/code-gate\.js/);
});

test("deployment builds a sanitized private distribution archive", async () => {
  const pkg = JSON.parse(await read("package.json"));
  const workflow = await read(".github/workflows/deploy-firebase-hosting.yml");
  const builder = await read("scripts/build-distribution.mjs");
  assert.equal(pkg.scripts["build:distribution"], "node scripts/build-distribution.mjs");
  assert.match(workflow, /Build private source archive/);
  assert.match(workflow, /unzip -t functions\/downloads\/iphonesolo-source\.zip/);
  assert.match(builder, /EXCLUDED_TOP_LEVEL/);
  for (const excluded of ["code", "testing", "code-gate.js", "deploy-version.txt"]) {
    assert.match(builder, new RegExp(`"${excluded.replace(".", "\\.")}"`));
  }
  assert.match(builder, /umami\\.gnimoay\\.com/);
});
