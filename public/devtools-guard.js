(() => {
  "use strict";

  const desktopQuery = window.matchMedia(
    "(min-width: 768px) and (hover: hover) and (pointer: fine)",
  );
  const panelKeys = new Set(["c", "e", "i", "j", "k"]);

  function isBlockedShortcut(event) {
    const key = String(event.key || "").toLowerCase();
    if (event.key === "F12") return true;
    if (event.ctrlKey && event.shiftKey && panelKeys.has(key)) return true;
    if (event.metaKey && event.altKey && panelKeys.has(key)) return true;
    return (event.ctrlKey || event.metaKey) && key === "u";
  }

  window.addEventListener(
    "keydown",
    (event) => {
      if (!desktopQuery.matches || !isBlockedShortcut(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    { capture: true },
  );

  window.addEventListener(
    "contextmenu",
    (event) => {
      if (!desktopQuery.matches) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    { capture: true },
  );
})();
