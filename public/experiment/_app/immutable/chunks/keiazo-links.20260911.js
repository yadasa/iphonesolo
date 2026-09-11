const ASSET_VERSION = "keiazo-links-20260911-1";

const versionedHomeScreenAssets = new Set([
  "/home-screen/shellclick.png",
  "/home-screen/colerm.png",
  "/home-screen/x.jpg",
  "/home-screen/rednote.jpg",
  "/home-screen/tiktok.jpg",
  "/home-screen/threads.jpg"
]);

if (!globalThis.__keiazoHomeScreenAssetVersioning) {
  globalThis.__keiazoHomeScreenAssetVersioning = true;
  const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  if (descriptor?.get && descriptor?.set) {
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get: descriptor.get,
      set(value) {
        if (typeof value === "string") {
          const [path] = value.split("?");
          if (versionedHomeScreenAssets.has(path)) {
            value = `${path}?v=${ASSET_VERSION}`;
          }
        }
        return descriptor.set.call(this, value);
      }
    });
  }
}

const replacements = [
  { from: "https://shellclick.dev/", to: "https://github.com/", label: "GitHub" },
  { from: "https://colerm.com/", to: "https://exempliph.ai/", label: "ExempliphAI · AI Job Search" },
  { from: "https://x.com/SesamPicr", to: "https://instagram.com/keiazo", label: "Instagram · keiazo" },
  { from: "https://xhslink.cn/o/5BeW4oenjyZ", to: "https://asaday.co/consultation", label: "1 on 1 sessions" },
  { from: "https://www.tiktok.com/@gnimoay", to: "https://tiktok.com/ozaiek", label: "TikTok · ozaiek" },
  { from: "https://www.threads.com/@sesampicr", to: "https://threads.com/keiazo", label: "Threads · keiazo" }
];

function patchProductLink(anchor) {
  if (!(anchor instanceof Element) || !anchor.matches("a.product-link")) return;
  const href = anchor.getAttribute("href") || "";
  const replacement = replacements.find(({ from, to }) => href === from || href === to);
  if (!replacement) return;
  anchor.setAttribute("href", replacement.to);
  anchor.setAttribute("aria-label", replacement.label);
}

function patchTree(root = document) {
  if (root instanceof Element) patchProductLink(root);
  root.querySelectorAll?.("a.product-link").forEach(patchProductLink);
}

patchTree();
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof Element) patchTree(node);
    }
  }
});
observer.observe(document.documentElement, { childList: true, subtree: true });
