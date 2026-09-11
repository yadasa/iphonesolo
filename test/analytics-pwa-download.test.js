import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("Umami is removed and GA4 is bound to this Firebase project's measurement ID", async () => {
  const [html, codeHtml, ga4, workflow] = await Promise.all([
    readFile("public/index.html", "utf8"),
    readFile("public/code/index.html", "utf8"),
    readFile("public/ga4.js", "utf8"),
    readFile(".github/workflows/deploy-firebase-hosting.yml", "utf8"),
  ]);
  assert.doesNotThrow(() => new vm.Script(ga4));
  assert.doesNotMatch(html, /umami\.gnimoay\.com|data-website-id/);
  assert.match(html, /\/ga4\.js/);
  assert.match(codeHtml, /\/ga4\.js/);
  assert.match(ga4, /\/__\/firebase\/init\.json/);
  assert.match(ga4, /config\.measurementId/);
  assert.match(ga4, /googletagmanager\.com\/gtag\/js/);
  assert.doesNotMatch(ga4, /location\.search/);
  assert.match(workflow, /googletagmanager\\\.com\|\/ga4\\\.js/);
});

test("installed and browser modes share the measured visual viewport", async () => {
  const [html, css, script, manifest, branding] = await Promise.all([
    readFile("public/index.html", "utf8"),
    readFile("public/keiazo-root.css", "utf8"),
    readFile("public/standalone-viewport.js", "utf8"),
    readFile("public/flip.webmanifest", "utf8"),
    readFile("public/head-branding.js", "utf8"),
  ]);
  assert.doesNotThrow(() => new vm.Script(script));
  assert.match(html, /apple-mobile-web-app-status-bar-style"[\s\S]*content="black"/);
  assert.match(html, /\/standalone-viewport\.js/);
  assert.match(css, /--keiazo-viewport-height/);
  assert.match(css, /height: var\(--keiazo-viewport-height\)/);
  assert.match(script, /window\.visualViewport/);
  assert.equal(JSON.parse(manifest).display, "standalone");
  assert.match(branding, /apple-mobile-web-app-status-bar-style", "black"/);
});

test("each paid Stripe Checkout Session can redeem exactly one archive response", async () => {
  const [server, client, pkg] = await Promise.all([
    readFile("functions/index.js", "utf8"),
    readFile("public/code/code.js", "utf8"),
    readFile("functions/package.json", "utf8"),
  ]);
  assert.match(server, /downloadLedgerReady: true/);
  assert.match(server, /database\.ref/);
  assert.match(server, /\.transaction\(/);
  assert.match(server, /result\.committed/);
  assert.match(server, /download_already_used/);
  assert.match(server, /X-Download-Redemption", "single-use"/);
  assert.match(server, /createHash\("sha256"\)/);
  assert.match(client, /single download has already been used/);
  assert.ok(JSON.parse(pkg).dependencies["firebase-admin"]);
});
