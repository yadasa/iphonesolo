(() => {
  if (window.__keiazoDesktopRedesign) return;
  window.__keiazoDesktopRedesign = true;

  const copy = {
    eyebrow: "IPHONE SOLO / MOTION STUDY",
    title: "Your screen has another side.",
    body: "Turn a flat photo or video into a responsive depth illusion. Continue on iPhone, allow motion, and let the screen follow you.",
    launch: "Launch on iPhone",
    code: "See how it works",
    note: "Built for live device motion",
    scan: "Scan with your camera to continue.",
    preview: "Preview the fold",
    reset: "Center"
  };

  function enhance() {
    const shell = document.querySelector(".solo-shell.desktop");
    if (!shell) return false;
    if (shell.dataset.desktopRedesign === "true") return true;
    shell.dataset.desktopRedesign = "true";

    const story = document.createElement("section");
    story.className = "keiazo-desktop-story";
    story.setAttribute("aria-labelledby", "keiazo-desktop-title");
    story.innerHTML = `
      <div class="keiazo-desktop-eyebrow"><span aria-hidden="true"></span>${copy.eyebrow}</div>
      <h1 id="keiazo-desktop-title">Your screen has<br><em>another side.</em></h1>
      <p class="keiazo-desktop-lede">${copy.body}</p>
      <div class="keiazo-desktop-actions">
        <button class="keiazo-desktop-launch" type="button">${copy.launch}<span aria-hidden="true">↗</span></button>
        <a class="keiazo-desktop-code" href="/code">${copy.code}<span aria-hidden="true">→</span></a>
      </div>
      <p class="keiazo-desktop-note"><span aria-hidden="true"></span>${copy.note}</p>
    `;
    shell.prepend(story);

    const invite = shell.querySelector(".phone-invite");
    const inviteCopy = invite?.querySelector("p");
    if (inviteCopy) inviteCopy.textContent = copy.scan;

    const qrButton = invite?.querySelector(".qr-button");
    qrButton?.setAttribute("aria-label", copy.launch);
    story.querySelector(".keiazo-desktop-launch")?.addEventListener("click", () => {
      qrButton?.click();
      qrButton?.focus({ preventScroll: true });
    });

    const previewLabel = shell.querySelector(".preview-label span");
    if (previewLabel) previewLabel.textContent = copy.preview;
    const reset = shell.querySelector(".preview-reset");
    if (reset) reset.textContent = copy.reset;

    const project = shell.querySelector(".project-name");
    if (project) project.innerHTML = '<span>IPHONE</span><span>SOLO</span>';

    requestAnimationFrame(() => shell.classList.add("keiazo-desktop-ready"));
    return true;
  }

  if (!enhance()) {
    const observer = new MutationObserver(() => {
      if (enhance()) observer.disconnect();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
    window.addEventListener("load", enhance, { once: true });
  }
})();
