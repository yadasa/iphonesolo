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
      overflow: visible;
    }

    .keiazo-ad-pill-link {
      cursor: pointer;
      pointer-events: auto;
    }

    .keiazo-ad-pill-halo,
    .keiazo-ad-pill-rim,
    .keiazo-ad-pill-body {
      fill: none;
      stroke-linecap: round;
      vector-effect: non-scaling-stroke;
    }

    .keiazo-ad-pill-halo {
      stroke: rgba(143, 168, 255, 0.44);
      filter:
        drop-shadow(0 0 5px rgba(171, 192, 255, 0.44))
        drop-shadow(0 0 11px rgba(143, 168, 255, 0.32))
        drop-shadow(0 0 20px rgba(143, 168, 255, 0.18));
      animation: keiazoAdPillGlow 3.1s ease-in-out infinite;
    }

    .keiazo-ad-pill-rim {
      stroke: rgba(190, 204, 255, 0.56);
      filter: drop-shadow(0 1px 5px rgba(0, 0, 0, 0.28));
    }

    .keiazo-ad-pill-body {
      stroke: rgba(15, 19, 34, 0.94);
      filter:
        drop-shadow(0 5px 12px rgba(0, 0, 0, 0.28))
        drop-shadow(0 -1px 3px rgba(255, 255, 255, 0.08));
    }

    .keiazo-ad-pill-text {
      fill: rgba(255, 255, 255, 0.98);
      stroke: none;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif;
      font-weight: 780;
      letter-spacing: -0.018em;
      text-anchor: middle;
      dominant-baseline: central;
      filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5));
      pointer-events: none;
      user-select: none;
    }

    @keyframes keiazoAdPillGlow {
      0%, 100% {
        stroke-opacity: 0.56;
        filter:
          drop-shadow(0 0 4px rgba(171, 192, 255, 0.34))
          drop-shadow(0 0 9px rgba(143, 168, 255, 0.24))
          drop-shadow(0 0 16px rgba(143, 168, 255, 0.12));
      }
      50% {
        stroke-opacity: 1;
        filter:
          drop-shadow(0 0 6px rgba(205, 216, 255, 0.62))
          drop-shadow(0 0 14px rgba(143, 168, 255, 0.42))
          drop-shadow(0 0 26px rgba(143, 168, 255, 0.2));
      }
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
      .keiazo-ad-pill-halo,
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
    return `Advertise your business · $${nextBid}`;
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

  function firstTwoPathPoints(d) {
    const matcher = /(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g;
    const points = [];
    let match;
    while (points.length < 2 && (match = matcher.exec(d))) {
      points.push({ x: Number(match[1]), y: Number(match[2]) });
    }
    return points.length === 2 ? points : null;
  }

  function viewScale(svg) {
    const box = svg.viewBox?.baseVal;
    const width = box?.width || svg.clientWidth || 430;
    const height = box?.height || svg.clientHeight || 700;
    return Math.max(0.45, Math.min(width / 430, height / 700));
  }

  function capsuleGeometry(svg, sourcePath) {
    const d = sourcePath.getAttribute("d");
    if (!d) return null;
    const points = firstTwoPathPoints(d);
    if (!points) return null;

    const [first, second] = points;
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const length = Math.hypot(dx, dy);
    if (!Number.isFinite(length) || length < 1) return null;

    const scale = viewScale(svg);
    const ux = dx / length;
    const uy = dy / length;
    let nx = -uy;
    let ny = ux;
    if (ny < 0) {
      nx *= -1;
      ny *= -1;
    }

    const originalHalfHeight = 11 * scale;
    const visualHeight = 28 * scale;
    const targetTotalWidth = 198 * scale;
    const targetCenterlineLength = Math.max(
      length + 26 * scale,
      targetTotalWidth - visualHeight,
    );
    const extension = Math.max(10 * scale, (targetCenterlineLength - length) / 2);

    const start = {
      x: first.x - ux * extension + nx * originalHalfHeight,
      y: first.y - uy * extension + ny * originalHalfHeight,
    };
    const end = {
      x: second.x + ux * extension + nx * originalHalfHeight,
      y: second.y + uy * extension + ny * originalHalfHeight,
    };
    const center = {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    };

    return {
      start,
      end,
      center,
      angle: (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI,
      scale,
      visualHeight,
      totalWidth: Math.hypot(end.x - start.x, end.y - start.y) + visualHeight,
    };
  }

  function makeSvgElement(name, className) {
    const element = document.createElementNS(SVG_NS, name);
    if (className) element.setAttribute("class", className);
    return element;
  }

  function setLine(line, geometry, width) {
    if (!line) return;
    line.setAttribute("x1", geometry.start.x.toFixed(2));
    line.setAttribute("y1", geometry.start.y.toFixed(2));
    line.setAttribute("x2", geometry.end.x.toFixed(2));
    line.setAttribute("y2", geometry.end.y.toFixed(2));
    line.setAttribute("stroke-width", width.toFixed(2));
  }

  function syncAdOverlay(svg, sourcePath, overlay) {
    const geometry = capsuleGeometry(svg, sourcePath);
    if (!geometry) return;

    setLine(
      overlay.querySelector(".keiazo-ad-pill-halo"),
      geometry,
      geometry.visualHeight + 7 * geometry.scale,
    );
    setLine(
      overlay.querySelector(".keiazo-ad-pill-rim"),
      geometry,
      geometry.visualHeight + 2.2 * geometry.scale,
    );
    setLine(
      overlay.querySelector(".keiazo-ad-pill-body"),
      geometry,
      geometry.visualHeight,
    );

    const text = overlay.querySelector(".keiazo-ad-pill-text");
    if (!text) return;
    const label = adLabel();
    const availableWidth = Math.max(80, geometry.totalWidth - 22 * geometry.scale);
    const fontSize = Math.max(
      8.6 * geometry.scale,
      Math.min(
        11.2 * geometry.scale,
        availableWidth / Math.max(1, label.length * 0.54),
      ),
    );
    text.setAttribute("x", geometry.center.x.toFixed(2));
    text.setAttribute("y", geometry.center.y.toFixed(2));
    text.setAttribute("font-size", fontSize.toFixed(2));
    text.setAttribute(
      "transform",
      `rotate(${geometry.angle.toFixed(2)} ${geometry.center.x.toFixed(2)} ${geometry.center.y.toFixed(2)})`,
    );
    text.textContent = label;
  }

  function findOverlay(svg) {
    return [...svg.children].find((child) =>
      child.classList?.contains("keiazo-ad-pill-overlay"),
    );
  }

  function enhanceAdPill(svg) {
    const sourceLink = [...svg.querySelectorAll("a.product-link")].find(
      (anchor) => anchor.getAttribute("href") === AD_HREF,
    );
    const sourcePath = sourceLink?.querySelector("path.settings-target");
    let overlay = findOverlay(svg);

    if (!sourcePath) {
      overlay?._keiazoObserver?.disconnect();
      overlay?.remove();
      return;
    }

    if (!overlay) {
      overlay = makeSvgElement("g", "keiazo-ad-pill-overlay");
      const link = makeSvgElement("a", "keiazo-ad-pill-link");
      link.setAttribute("href", AD_HREF);
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
      link.setAttribute("aria-label", "Advertise your business on iPhone Solo");
      link.append(
        makeSvgElement("line", "keiazo-ad-pill-halo"),
        makeSvgElement("line", "keiazo-ad-pill-rim"),
        makeSvgElement("line", "keiazo-ad-pill-body"),
        makeSvgElement("text", "keiazo-ad-pill-text"),
      );
      overlay.append(link);
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
            syncAdOverlay(svg, sourcePath, overlay);
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

    syncAdOverlay(svg, sourcePath, overlay);
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
