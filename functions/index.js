const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const admin = require("firebase-admin");
const functions = require("firebase-functions/v1");

if (!admin.apps.length) admin.initializeApp();
const database = admin.database();

const REGION = "us-central1";
const PRODUCT_KEY = "iphonesolo-source-code";
const DOWNLOAD_FILENAME = "iphonesolo-source.zip";
const DOWNLOAD_PATH = path.join(__dirname, "downloads", DOWNLOAD_FILENAME);
const DOWNLOAD_CLAIMS = "codeDownloadClaims";
const ALLOWED_ORIGINS = new Set([
  "https://iphonesolo.com",
  "https://keiazotilt.web.app",
  "https://keiazotilt.firebaseapp.com",
]);

function httpFunction(options, handler) {
  return functions.region(REGION).runWith(options).https.onRequest(handler);
}

function sendJson(res, status, payload) {
  res.set("Cache-Control", "no-store");
  res.status(status).json(payload);
}

function publicOrigin(req) {
  const origin = req.get("origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) return origin;
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return origin;
  }
  return "https://iphonesolo.com";
}

function sessionId(value) {
  const id = typeof value === "string" ? value.trim() : "";
  return /^cs_(?:test_|live_)?[A-Za-z0-9_]+$/.test(id) ? id : null;
}

async function stripeRequest(path, init = {}) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    const error = new Error("stripe_not_configured");
    error.statusCode = 503;
    throw error;
  }

  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: init.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      ...(init.body
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    body: init.body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || "stripe_request_failed");
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

function isPaidCodeSession(session) {
  return (
    session?.metadata?.product === PRODUCT_KEY &&
    session?.mode === "payment" &&
    session?.status === "complete" &&
    session?.payment_status === "paid"
  );
}

function downloadClaimRef(id) {
  const digest = createHash("sha256").update(id).digest("hex");
  return database.ref(`${DOWNLOAD_CLAIMS}/${digest}`);
}

async function downloadWasClaimed(id) {
  return (await downloadClaimRef(id).get()).exists();
}

async function claimDownload(id, session) {
  const claim = {
    product: PRODUCT_KEY,
    claimedAt: admin.database.ServerValue.TIMESTAMP,
    amountTotal: Number(session.amount_total) || null,
    currency: typeof session.currency === "string" ? session.currency : null,
  };
  const result = await downloadClaimRef(id).transaction(
    (current) => (current === null ? claim : undefined),
    undefined,
    false,
  );
  return result.committed;
}

exports.codeHealth = httpFunction(
  { maxInstances: 4, timeoutSeconds: 15 },
  async (req, res) => {
    if (req.method !== "GET") {
      res.set("Allow", "GET");
      return sendJson(res, 405, { error: "method_not_allowed" });
    }

    try {
      const [archive] = await Promise.all([
        fs.promises.stat(DOWNLOAD_PATH),
        stripeRequest("/account"),
        downloadClaimRef("health-check").get(),
      ]);
      if (!archive.isFile() || archive.size < 1024) {
        throw new Error("source_archive_missing");
      }
      return sendJson(res, 200, {
        ready: true,
        archiveReady: true,
        downloadLedgerReady: true,
      });
    } catch (error) {
      console.error("codeHealth failed", error?.message || error);
      return sendJson(res, 503, { ready: false, error: "backend_unavailable" });
    }
  },
);

exports.codeCheckout = httpFunction(
  { maxInstances: 10, timeoutSeconds: 30 },
  async (req, res) => {
    if (req.method !== "POST") {
      res.set("Allow", "POST");
      return sendJson(res, 405, { error: "method_not_allowed" });
    }

    const amount = Number(req.body?.amount);
    const amountCents = Math.round(amount * 100);
    if (!Number.isFinite(amount) || amount <= 0) {
      return sendJson(res, 400, { error: "invalid_amount" });
    }
    if (amountCents < 200) {
      return sendJson(res, 400, { error: "amount_too_low" });
    }
    if (amountCents > 99_999_999) {
      return sendJson(res, 400, { error: "amount_too_high" });
    }

    const origin = publicOrigin(req);
    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("submit_type", "donate");
    params.set("locale", "auto");
    params.set("line_items[0][price_data][currency]", "usd");
    params.set(
      "line_items[0][price_data][product_data][name]",
      "iPhone Solo source code donation",
    );
    params.set(
      "line_items[0][price_data][product_data][description]",
      "Support iPhone Solo and download the current source archive immediately after payment.",
    );
    params.set(
      "line_items[0][price_data][unit_amount]",
      String(amountCents),
    );
    params.set("line_items[0][quantity]", "1");
    params.set("metadata[product]", PRODUCT_KEY);
    params.set(
      "success_url",
      `${origin}/code?session_id={CHECKOUT_SESSION_ID}`,
    );
    params.set("cancel_url", `${origin}/code?cancelled=1`);

    try {
      const session = await stripeRequest("/checkout/sessions", {
        method: "POST",
        body: params,
      });
      if (!session?.url) throw new Error("checkout_url_missing");
      return sendJson(res, 200, { url: session.url });
    } catch (error) {
      console.error("codeCheckout failed", error?.message || error);
      return sendJson(res, error?.statusCode === 503 ? 503 : 502, {
        error:
          error?.statusCode === 503
            ? "checkout_not_configured"
            : "checkout_unavailable",
      });
    }
  },
);

exports.codeVerify = httpFunction(
  { maxInstances: 20, timeoutSeconds: 20 },
  async (req, res) => {
    if (req.method !== "GET") {
      res.set("Allow", "GET");
      return sendJson(res, 405, { error: "method_not_allowed" });
    }
    const id = sessionId(req.query.session_id);
    if (!id) return sendJson(res, 400, { error: "invalid_session" });

    try {
      const session = await stripeRequest(
        `/checkout/sessions/${encodeURIComponent(id)}`,
      );
      const paid = isPaidCodeSession(session);
      const downloaded = paid ? await downloadWasClaimed(id) : false;
      return sendJson(res, 200, {
        paid,
        downloaded,
        amountTotal: paid ? session.amount_total : null,
        downloadUrl:
          paid && !downloaded
            ? `/api/code-download?session_id=${encodeURIComponent(id)}`
            : null,
      });
    } catch (error) {
      console.error("codeVerify failed", error?.message || error);
      return sendJson(res, error?.statusCode === 503 ? 503 : 502, {
        error:
          error?.statusCode === 503
            ? "checkout_not_configured"
            : "verification_unavailable",
      });
    }
  },
);

exports.codeDownload = httpFunction(
  { maxInstances: 20, timeoutSeconds: 20 },
  async (req, res) => {
    if (req.method !== "GET") {
      res.set("Allow", "GET");
      return sendJson(res, 405, { error: "method_not_allowed" });
    }
    const id = sessionId(req.query.session_id);
    if (!id) return sendJson(res, 400, { error: "invalid_session" });

    try {
      const session = await stripeRequest(
        `/checkout/sessions/${encodeURIComponent(id)}`,
      );
      if (!isPaidCodeSession(session)) {
        return sendJson(res, 403, { error: "payment_required" });
      }
      const archive = await fs.promises.stat(DOWNLOAD_PATH);
      if (!archive.isFile() || archive.size < 1024) {
        return sendJson(res, 503, { error: "download_not_ready" });
      }
      const claimed = await claimDownload(id, session);
      if (!claimed) {
        return sendJson(res, 409, { error: "download_already_used" });
      }
      res.set("Cache-Control", "private, no-store, max-age=0");
      res.set("X-Download-Redemption", "single-use");
      res.set("Content-Type", "application/zip");
      res.set(
        "Content-Disposition",
        `attachment; filename="${DOWNLOAD_FILENAME}"`,
      );
      res.set("Content-Length", String(archive.size));
      res.set("X-Content-Type-Options", "nosniff");
      res.set("X-Robots-Tag", "noindex, nofollow");
      const stream = fs.createReadStream(DOWNLOAD_PATH);
      stream.on("error", (streamError) => {
        console.error("codeDownload stream failed", streamError);
        if (!res.headersSent) {
          sendJson(res, 500, { error: "download_unavailable" });
        } else {
          res.destroy(streamError);
        }
      });
      return stream.pipe(res);
    } catch (error) {
      console.error("codeDownload failed", error?.message || error);
      return sendJson(res, error?.statusCode === 503 ? 503 : 502, {
        error:
          error?.statusCode === 503
            ? "checkout_not_configured"
            : "download_unavailable",
      });
    }
  },
);

const AUDIENCE_INTERVAL_MS = 10_000;

// One transaction elects the published snapshot for each server-time bucket.
// Keep this separate from presence so display adjustments never change analytics.
exports.audienceSnapshot = httpFunction(
  { maxInstances: 10, timeoutSeconds: 15 },
  async (req, res) => {
    if (req.method !== "GET") {
      res.set("Allow", "GET");
      return sendJson(res, 405, { error: "method_not_allowed" });
    }
    try {
      const ref = database.ref("audienceDisplay");
      let snapshot = (await ref.get()).val();
      if (!snapshot || snapshot.at < Math.floor(Date.now() / AUDIENCE_INTERVAL_MS) * AUDIENCE_INTERVAL_MS) {
        const presence = (await database.ref("presence").get()).val() || {};
        const now = Date.now();
        const at = Math.floor(now / AUDIENCE_INTERVAL_MS) * AUDIENCE_INTERVAL_MS;
        const clients = new Set(Object.values(presence)
          .filter(p => p && typeof p.clientId === "string" &&
            Number.isFinite(p.seenAt) && now - p.seenAt < 60_000 && p.seenAt <= now + 5_000)
          .map(p => p.clientId));
        const random = createHash("sha256").update("audience:" + at).digest().readUInt32BE(0) / 0x100000000;
        const result = await ref.transaction(current => {
          if (current && current.at >= at) return current;
          const offset = current
            ? Math.max(1, Math.round(current.offset * (0.83 + random * 0.50)))
            : 63;
          // Independent shared variation: integer -6 <= jitter <= 7.
          const jitter = createHash("sha256").update("audience-jitter:" + at)
            .digest().readUInt32BE(0) % 14 - 6;
          const count = Math.max(clients.size, clients.size + offset + jitter);
          const history = (Array.isArray(current?.history) ? current.history : [])
            .filter(point => point.at > at - 3_600_000).slice(-359);
          history.push({ at, count });
          return { at, offset, jitter, count, history };
        }, undefined, false);
        snapshot = result.snapshot.val();
      }
      return sendJson(res, 200, {
        count: snapshot.count,
        history: snapshot.history,
        at: snapshot.at,
        serverTime: Date.now(),
        nextUpdateAt: snapshot.at + AUDIENCE_INTERVAL_MS,
      });
    } catch (error) {
      console.error("audienceSnapshot failed", error?.message || error);
      return sendJson(res, 503, { error: "audience_unavailable" });
    }
  },
);

