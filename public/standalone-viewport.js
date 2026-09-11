(() => {
  const root = document.documentElement;
  let frame = 0;

  function applyViewport() {
    frame = 0;
    const viewport = window.visualViewport;
    const width = Math.max(1, Math.round(viewport?.width || window.innerWidth));
    const height = Math.max(1, Math.round(viewport?.height || window.innerHeight));
    root.style.setProperty("--keiazo-viewport-width", `${width}px`);
    root.style.setProperty("--keiazo-viewport-height", `${height}px`);
    root.dataset.keiazoDisplayMode =
      navigator.standalone ||
      matchMedia("(display-mode: standalone)").matches ||
      matchMedia("(display-mode: fullscreen)").matches
        ? "standalone"
        : "browser";
  }

  function scheduleViewport() {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(applyViewport);
  }

  applyViewport();
  window.addEventListener("resize", scheduleViewport, { passive: true });
  window.addEventListener("orientationchange", scheduleViewport, { passive: true });
  window.addEventListener("pageshow", scheduleViewport, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleViewport, {
    passive: true,
  });
})();
