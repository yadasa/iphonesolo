(() => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const AD_HREF = "https://thehighest.bid/";
  const STYLE_ID = "keiazo-home-screen-accent-style";

  let nextBid = 1;
  let lastPriceFetch = 0;
  let priceFetch = null;
  let scheduled = false;

  const styles = `
    .keiazo-ad-pill-overlay {
      pointer-events: none;
    }

    .keiazo-ad-pill-halo,
    .keiazo-ad-pill-body {
      fill: rgba(255, 255, 255, 0.105);
      stroke: rgba(255, 255, 255, 0.42);
      stroke-width: 0.9;
      filter:
        drop-shadow(0 5px 12px rgba(0, 0, 0, 0.24))
        drop-shadow(0 -1px 4px rgba(255, 255, 255, 0.12));
    }

    .keiazo-ad-pill-text {
      fill: rgba(255, 255, 255, 0.96);
      stroke: none;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif;
      font-weight: 650;
      letter-spacing: -0.01em;
      text-anchor: middle;
      dominant-baseline: central;
      filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.42));
      pointer-events: none;
      user-select: none;
    }

    .dock-interaction .keiazo-settings-glow-target {
      fill: transparent !important;
      stroke: rgba(192, 207, 255, 0.98) !important;
      stroke-width: 1.35 !important;
      stroke-opacity: 0.72;
      vector-effect: non-scaling-stroke;
      filter:
        drop-shadow(0 0 3px rgba(171, 192, 255, 0.62))
        drop-shadow(0 0 8px rgba(143, 168, 255, 0.44))
        drop-shadow(0 0 14px rgba(143, 168, 255, 0.2));
      animation: keiazoSettingsOscillate 2.65s ease-in-out infinite;
    }

    @keyframes keiazoSettingsOscillate {
      0%, 100% {
        stroke-opacity: 0.58;
        stroke-width: 1.05;
        filter:
          drop-shadow(0 0 2px rgba(171, 192, 255, 0.48))
          drop-shadow(0 0 6px rgba(143, 168, 255, 0.34))
          drop-shadow(0 0 10px rgba(143, 168, 255, 0.16));
      }
      50% {
        stroke-opacity: 1;
        stroke-width: 1.9;
        filter:
          drop-shadow(0 0 4px rgba(205, 216, 255, 0.88))
          drop-shadow(0 0 10px rgba(143, 168, 255, 0.62))
          drop-shadow(0 0 20px rgba(143, 168, 255, 0.32));
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .dock-interaction .keiazo-settings-glow-target {
        animation: none !important;
      }
    }
  `;

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = styles;
    document.head.append(style);
  }

  function adLabel() {
    return `Advertise your business here for $${nextBid}?`;
  }

  function updateAdLabels() {
    document.querySelectorAll(".keiazo-ad-pill-text").forEach((text) => {
      text.textContent = adLabel();
    });
  }

  async function refreshPrice() {
    const now = Date.now();
    if (priceFetch || now - lastPriceFetch < 45_000) return priceFetch;
    lastPriceFetch = now;
    priceFetch = fetch("https://thehighest.bid/api/embed?limit=1", {
      mode: "cors",
      cache: "no-store",
    })
      .then((response) => {
        if (!response.ok) throw new Error("ad_feed_failed");
        return response.json();
      })
      .then((payload) => {
        nextBid = Math.max(
          1,
          Math.floor(Number(payload?.pricing?.currentTopBidDollars) || 0) + 1,
        );
        updateAdLabels();
      })
      .catch(() => {})
      .finally(() => {
        priceFetch = null;
      });
    return priceFetch;
  }

  function geometryFromPath(d) {
    const points = [];
    const matcher = /(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g;
    let match;
    while ((match = matcher.exec(d))) {
      points.push({ x: Number(match[1]), y: Number(match[2]) });
    }
    if (points.length < 2) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    const first = points[0];
    const second = points[1];
    return {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      angle:
        (Math.atan2(second.y - first.y, second.x - first.x) * 180) / Math.PI,
    };
  }

  function makeSvgElement(name, className) {
    const element = document.createElementNS(SVG_NS, name);
    if (className) element.setAttribute("class", className);
    return element;
  }

  function syncAdOverlay(sourcePath, overlay) {
    const d = sourcePath.getAttribute("d");
    if (!d) return;
    const geometry = geometryFromPath(d);
    if (!geometry) return;

    const halo = overlay.querySelector(".keiazo-ad-pill-halo");
    const body = overlay.querySelector(".keiazo-ad-pill-body");
    const text = overlay.querySelector(".keiazo-ad-pill-text");
    halo?.setAttribute("d", d);
    body?.setAttribute("d", d);
    if (!text) return;

    const label = adLabel();
    const availableWidth = Math.max(
      48,
      geometry.width - Math.max(16, geometry.height * 0.75),
    );
    const fontSize = Math.max(
      7.75,
      Math.min(12, availableWidth / Math.max(1, label.length * 0.54)),
    );
    text.setAttribute("x", String(geometry.centerX));
    text.setAttribute("y", String(geometry.centerY));
    text.setAttribute("font-size", fontSize.toFixed(2));
    text.removeAttribute("textLength");
    text.removeAttribute("lengthAdjust");
    text.removeAttribute("transform");
    text.textContent = label;
  }

  function findOverlay(svg) {
    return [...svg.children].find((child) =>
      child.classList?.contains("keiazo-ad-pill-overlay"),
    );
  }

  function enhanceAdPill(svg) {
    const link = [...svg.querySelectorAll("a.product-link")].find(
      (anchor) => anchor.getAttribute("href") === AD_HREF,
    );
    const sourcePath = link?.querySelector("path.settings-target");
    let overlay = findOverlay(svg);

    if (!sourcePath) {
      overlay?._keiazoObserver?.disconnect();
      overlay?.remove();
      return;
    }

    if (!overlay) {
      overlay = makeSvgElement("g", "keiazo-ad-pill-overlay");
      overlay.setAttribute("aria-hidden", "true");
      overlay.append(
        makeSvgElement("path", "keiazo-ad-pill-halo"),
        makeSvgElement("path", "keiazo-ad-pill-body"),
        makeSvgElement("text", "keiazo-ad-pill-text"),
      );
      svg.append(overlay);
    }

    if (overlay._keiazoSource !== sourcePath) {
      overlay._keiazoObserver?.disconnect();
      overlay._keiazoSource = sourcePath;
      let frame = 0;
      const queueSync = () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (overlay.isConnected && sourcePath.isConnected) {
            syncAdOverlay(sourcePath, overlay);
          }
        });
      };
      const observer = new MutationObserver(queueSync);
      observer.observe(sourcePath, {
        attributes: true,
        attributeFilter: ["d"],
      });
      overlay._keiazoObserver = observer;
    }

    syncAdOverlay(sourcePath, overlay);
    refreshPrice();
  }

  function enhanceSettings(svg) {
    const settingsTarget = svg.querySelector(
      'path.settings-target[aria-controls="settings-dialog"]',
    );
    settingsTarget?.classList.add("keiazo-settings-glow-target");
  }

  function enhance() {
    ensureStyles();
    document.querySelectorAll("svg.dock-interaction").forEach((svg) => {
      enhanceAdPill(svg);
      enhanceSettings(svg);
    });
  }

  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhance();
    });
  }

  function boot() {
    enhance();
    const observer = new MutationObserver(scheduleEnhance);
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(() => {
      refreshPrice();
      enhance();
    }, 60_000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
