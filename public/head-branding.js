(() => {
  const BRAND = Object.freeze({
    title: "iPhone Solo — A new perspective",
    description:
      "iPhone Solo turns your screen into a motion-powered optical illusion. Tilt your iPhone and watch perspective shift in real time.",
    canonical: "https://iphonesolo.com/",
    image: "https://iphonesolo.com/og-image.jpg",
    imageWidth: "600",
    imageHeight: "315",
    imageType: "image/jpeg",
    imageAlt: "The iPhone duo effect, on half the screen",
    favicon: "/favicon.svg?v=20260911-2",
    appleTouchIcon: "/solo-apple-touch-icon.png",
    manifest: "/flip.webmanifest",
  });

  let applying = false;
  let scheduled = false;

  function upsertMeta(attribute, key, content) {
    const matches = [
      ...document.head.querySelectorAll(`meta[${attribute}="${CSS.escape(key)}"]`),
    ];
    let node = matches.shift();
    if (!node) {
      node = document.createElement("meta");
      node.setAttribute(attribute, key);
      document.head.append(node);
    }
    if (node.getAttribute("content") !== content) node.setAttribute("content", content);
    for (const duplicate of matches) duplicate.remove();
  }

  function upsertLink(rel, href, attributes = {}) {
    const matches = [...document.head.querySelectorAll(`link[rel="${rel}"]`)];
    let node = matches.find((link) => link.getAttribute("href") === href) || matches.shift();
    if (!node) {
      node = document.createElement("link");
      node.setAttribute("rel", rel);
      document.head.append(node);
    }
    if (node.getAttribute("href") !== href) node.setAttribute("href", href);
    for (const [name, value] of Object.entries(attributes)) {
      if (node.getAttribute(name) !== value) node.setAttribute(name, value);
    }
    for (const duplicate of matches) {
      if (duplicate !== node) duplicate.remove();
    }
  }

  function enforceBranding() {
    if (!document.head || applying) return;
    applying = true;
    try {
      if (document.title !== BRAND.title) document.title = BRAND.title;

      upsertMeta("name", "description", BRAND.description);
      upsertMeta("name", "apple-mobile-web-app-title", "iPhone Solo");

      upsertMeta("property", "og:type", "website");
      upsertMeta("property", "og:site_name", "iPhone Solo");
      upsertMeta("property", "og:title", BRAND.title);
      upsertMeta("property", "og:description", BRAND.description);
      upsertMeta("property", "og:url", BRAND.canonical);
      upsertMeta("property", "og:image", BRAND.image);
      upsertMeta("property", "og:image:width", BRAND.imageWidth);
      upsertMeta("property", "og:image:height", BRAND.imageHeight);
      upsertMeta("property", "og:image:type", BRAND.imageType);
      upsertMeta("property", "og:image:alt", BRAND.imageAlt);

      upsertMeta("name", "twitter:card", "summary_large_image");
      upsertMeta("name", "twitter:title", BRAND.title);
      upsertMeta("name", "twitter:description", BRAND.description);
      upsertMeta("name", "twitter:image", BRAND.image);
      upsertMeta("name", "twitter:image:alt", BRAND.imageAlt);
      for (const stale of document.head.querySelectorAll('meta[name="twitter:creator"]')) {
        stale.remove();
      }

      upsertLink("canonical", BRAND.canonical);
      upsertLink("manifest", BRAND.manifest);

      const icons = [
        ...document.head.querySelectorAll(
          'link[rel~="icon"], link[rel="shortcut icon"]',
        ),
      ];
      let favicon = icons.find((link) => link.getAttribute("href") === BRAND.favicon);
      if (!favicon) {
        favicon = document.createElement("link");
        favicon.setAttribute("rel", "icon");
        favicon.setAttribute("type", "image/svg+xml");
        favicon.setAttribute("href", BRAND.favicon);
        document.head.append(favicon);
      }
      if (favicon.getAttribute("rel") !== "icon") favicon.setAttribute("rel", "icon");
      if (favicon.getAttribute("type") !== "image/svg+xml") {
        favicon.setAttribute("type", "image/svg+xml");
      }
      for (const icon of icons) {
        if (icon !== favicon) icon.remove();
      }

      upsertLink("apple-touch-icon", BRAND.appleTouchIcon, { sizes: "180x180" });
    } finally {
      applying = false;
    }
  }

  function scheduleEnforcement() {
    if (applying || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      enforceBranding();
    });
  }

  enforceBranding();

  const observer = new MutationObserver(scheduleEnforcement);
  observer.observe(document.head, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["content", "href", "rel", "name", "property", "type", "sizes"],
  });

  document.addEventListener("DOMContentLoaded", enforceBranding, { once: true });
  window.addEventListener("pageshow", enforceBranding);
})();
