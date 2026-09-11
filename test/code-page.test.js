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
  assert.match(server, /github\.com\/yadasa\/iphonesolo\/archive\/refs\/heads\/main\.zip/);
  const rewrites = firebase.hosting.rewrites;
  for (const [source, functionId] of [
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

test("existing Download Code action is gated through /code", async () => {
  const gate = await read("public/code-gate.js");
  const start = await read(
    "public/experiment/_app/immutable/entry/start.DceLwiAH.js",
  );
  assert.match(gate, /archive\/refs\/heads\/main\.zip/);
  assert.match(gate, /anchor\.href = "\/code"/);
  assert.match(start, /\/code-gate\.js/);
});
