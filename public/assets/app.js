import { MotionTracker, clamp, smooth, tiltToFold } from "./motion.js";
import { FoldRenderer } from "./renderer.js";

const app = document.querySelector("#app");
const canvas = document.querySelector("#gl");
const picker = document.querySelector("#image-picker");
const toggle = document.querySelector("#toggle-controls");
const panel = document.querySelector("#control-panel");
const motionButton = document.querySelector("#motion");
const fullscreenButton = document.querySelector("#fullscreen");
const recalibrateButton = document.querySelector("#recalibrate");
const hint = document.querySelector("#hint");
const toast = document.querySelector("#toast");
const installDialog = document.querySelector("#install-dialog");

let renderer;
let imageUrl;
let targetTilt = 0;
let renderedTilt = 0;
let previousTime = performance.now();
let dragging = false;
let pointerStart = 0;
let tiltStart = 0;
let toastTimer;

const tracker = new MotionTracker(value => { targetTilt = value; });

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4400);
}

function renderFrame(now) {
  const dt = (now - previousTime) / 1000;
  previousTime = now;
  renderedTilt = smooth(renderedTilt, targetTilt, dt);
  const fold = tiltToFold(renderedTilt);
  renderer?.render(fold.angle, fold.direction);
  requestAnimationFrame(renderFrame);
}

async function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    showToast("Choose a supported image file.");
    return;
  }
  const nextUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = nextUrl;
    await image.decode();
    renderer.setImage(image);
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = nextUrl;
    hint.hidden = true;
    app.dataset.ready = "true";
    targetTilt = 0;
    renderedTilt = 0;
  } catch {
    URL.revokeObjectURL(nextUrl);
    showToast("That image could not be decoded in this browser.");
  } finally {
    picker.value = "";
  }
}

toggle.addEventListener("click", () => {
  const open = app.dataset.controls !== "closed";
  app.dataset.controls = open ? "closed" : "open";
  toggle.setAttribute("aria-expanded", String(!open));
  panel.inert = open;
});

picker.addEventListener("change", event => loadFile(event.target.files?.[0]));

motionButton.addEventListener("click", async () => {
  try {
    await MotionTracker.requestPermission();
    tracker.start();
    tracker.recalibrate();
    targetTilt = 0;
    motionButton.textContent = "Motion enabled";
    motionButton.disabled = true;
    recalibrateButton.hidden = false;
    showToast("Motion enabled. Hold your phone naturally, then tilt it.");
  } catch (error) {
    showToast(error.message);
  }
});

recalibrateButton.addEventListener("click", () => {
  tracker.recalibrate();
  targetTilt = 0;
  renderedTilt = 0;
  showToast("Motion recalibrated.");
});

fullscreenButton.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: "hide" });
  } catch {
    showToast("Fullscreen is unavailable here. On iPhone, add this app to your Home Screen.");
  }
});

document.addEventListener("fullscreenchange", () => {
  fullscreenButton.textContent = document.fullscreenElement ? "Exit fullscreen" : "Fullscreen";
});

canvas.addEventListener("pointerdown", event => {
  dragging = true;
  pointerStart = event.clientX;
  tiltStart = targetTilt;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", event => {
  if (!dragging) return;
  const delta = (event.clientX - pointerStart) / Math.max(1, innerWidth);
  targetTilt = clamp(tiltStart + delta * 100, -55, 55);
});

canvas.addEventListener("pointerup", event => {
  dragging = false;
  canvas.releasePointerCapture(event.pointerId);
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && tracker.listening) tracker.recalibrate();
});

window.addEventListener("orientationchange", () => tracker.recalibrate(), { passive: true });
window.addEventListener("beforeunload", () => { if (imageUrl) URL.revokeObjectURL(imageUrl); });

for (const close of document.querySelectorAll(".dialog-close, .dialog-done")) {
  close.addEventListener("click", () => {
    installDialog.close();
    localStorage.setItem("keiazotilt-install-dismissed", "1");
  });
}

function maybeShowInstallHelp() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (ios && !standalone && !localStorage.getItem("keiazotilt-install-dismissed")) {
    setTimeout(() => installDialog.showModal(), 900);
  }
}

try {
  renderer = new FoldRenderer(canvas);
  requestAnimationFrame(renderFrame);
  maybeShowInstallHelp();
} catch (error) {
  showToast(error.message);
  motionButton.hidden = true;
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
