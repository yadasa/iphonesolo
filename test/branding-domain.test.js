import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public branding consistently uses iPhone Solo", async () => {
  const [root, code, manifest, stripe] = await Promise.all([
    readFile("public/index.html", "utf8"),
    readFile("public/code/index.html", "utf8"),
    readFile("public/flip.webmanifest", "utf8"),
    readFile("functions/index.js", "utf8"),
  ]);

  assert.match(root, /<title>iPhone Solo<\/title>/);
  assert.match(root, /property="og:site_name" content="iPhone Solo"/);
  assert.match(root, /property="og:title" content="iPhone Solo — A new perspective"/);
  assert.match(root, /name="apple-mobile-web-app-title" content="iPhone Solo"/);
  assert.match(root, /iPhone Solo turns your screen into a motion-powered optical illusion/);
  assert.doesNotMatch(root, /<title>Solo<\/title>/);

  assert.match(code, /<title>Get the code · iPhone Solo<\/title>/);
  assert.match(code, />iPhone Solo<\/span>/);
  assert.match(code, /Support iPhone Solo and download the source code/);

  const appManifest = JSON.parse(manifest);
  assert.equal(appManifest.name, "iPhone Solo");
  assert.equal(appManifest.short_name, "iPhone Solo");

  assert.match(stripe, /iPhone Solo source code donation/);
});

test("deployment verifies the custom iphonesolo.com domain", async () => {
  const [workflow, firebase] = await Promise.all([
    readFile(".github/workflows/deploy-firebase-hosting.yml", "utf8"),
    readFile("firebase.json", "utf8"),
  ]);

  assert.match(workflow, /printf '%s\\n' "\$GITHUB_SHA" > public\/deploy-version\.txt/);
  assert.match(workflow, /https:\/\/iphonesolo\.com\/deploy-version\.txt/);
  assert.match(workflow, /<title>iPhone Solo<\/title>/);
  assert.match(workflow, /<title>Get the code · iPhone Solo<\/title>/);
  assert.match(firebase, /"source": "\/deploy-version\.txt"/);
  assert.match(firebase, /"value": "no-store,max-age=0"/);
});

test("all entry points use the split Apple favicon", async () => {
  const [root, code, testing, experiment, favicon] = await Promise.all([
    readFile("public/index.html", "utf8"),
    readFile("public/code/index.html", "utf8"),
    readFile("public/testing/index.html", "utf8"),
    readFile("public/experiment/index.html", "utf8"),
    readFile("public/favicon.svg", "utf8"),
  ]);

  for (const html of [root, code, testing, experiment]) {
    assert.match(html, /rel="icon"[^>]+href="\/favicon\.svg\?v=20260911-1"/);
  }
  assert.match(favicon, /id="apple-mark"/);
  assert.match(favicon, /id="left-half"/);
  assert.match(favicon, /id="right-half"/);
});
