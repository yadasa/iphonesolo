(() => {
  const archive = "https://github.com/yadasa/iphonesolo/archive/refs/heads/main.zip";

  function patch(root = document) {
    const anchors = [];
    if (root instanceof HTMLAnchorElement) anchors.push(root);
    root.querySelectorAll?.("a").forEach((anchor) => anchors.push(anchor));
    for (const anchor of anchors) {
      if (anchor.href !== archive) continue;
      anchor.href = "/code";
      anchor.removeAttribute("download");
      anchor.textContent = anchor.textContent.replace("Download the code", "Get the code");
    }
  }

  patch();
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) patch(node);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
