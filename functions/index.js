const { onRequest } = require("firebase-functions/v2/https");

const REGION = "us-central1";
const PRODUCT_KEY = "iphonesolo-source-code";
const DOWNLOAD_URL =
  "https://github.com/yadasa/iphonesolo/archive/refs/heads/main.zip";
const ALLOWED_ORIGINS = new Set([
  "https://iphonesolo.com",
  "https://keiazotilt.web.app",
  "https://keiazotilt.firebaseapp.com",
]);

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

exports.codeHealth = onRequest(
  { region: REGION, maxInstances: 4, timeoutSeconds: 15 },
  async (req, res) => {
    if (req.method !== "GET") {
      res.set("Allow", "GET");
      return sendJson(res, 405, { error: "method_not_allowed" });
    }

    try {
      await stripeRequest("/account");
      return sendJson(res, 200, { ready: true });
    } catch (error) {
      console.error("codeHealth failed", error?.message || error);
      return sendJson(res, 503, { ready: false, error: "stripe_unavailable" });
    }
  },
);

exports.codeCheckout = onRequest(
  { region: REGION, maxInstances: 10, timeoutSeconds: 30 },
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

exports.codeVerify = onRequest(
  { region: REGION, maxInstances: 20, timeoutSeconds: 20 },
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
      return sendJson(res, 200, {
        paid,
        amountTotal: paid ? session.amount_total : null,
        downloadUrl: paid
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

exports.codeDownload = onRequest(
  { region: REGION, maxInstances: 20, timeoutSeconds: 20 },
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
      res.set("Cache-Control", "no-store");
      res.set("X-Robots-Tag", "noindex, nofollow");
      return res.redirect(302, DOWNLOAD_URL);
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
