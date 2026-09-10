import { MotionTracker, clamp, smooth, tiltToFold } from "./motion.js";
import { FoldRenderer } from "./renderer.js";

const app = document.querySelector("#app");
const canvas = document.querySelector("#gl");
const picker = document.querySelector("#media-picker");
const toggle = document.querySelector("#toggle-controls");
const panel = document.querySelector("#control-panel");
const motionButton = document.querySelector("#motion");
const fullscreenButton = document.querySelector("#fullscreen");
const recalibrateButton = document.querySelector("#recalibrate");
const hint = document.querySelector("#hint");
const toast = document.querySelector("#toast");
const installDialog = document.querySelector("#install-dialog");
const motionDialog = document.querySelector("#motion-dialog");

let renderer;
let imageUrl;
let targetTilt = 0;
let renderedTilt = 0;
let previousTime = performance.now();
let animationFrameId;
let dragging = false;
let pointerStart = 0;
let tiltStart = 0;
let toastTimer;
let activeVideo;
let mediaReady = false;
let hasInteracted = false;
let installPromptScheduled = false;

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
  if (Math.abs(renderedTilt) > 5) hasInteracted = true;
  if (mediaReady && hasInteracted) maybeShowInstallHelp();
  animationFrameId = requestAnimationFrame(renderFrame);
}

function startRendering() {
  if (animationFrameId != null) return;
  previousTime = performance.now();
  animationFrameId = requestAnimationFrame(renderFrame);
}

function stopRendering() {
  if (animationFrameId == null) return;
  cancelAnimationFrame(animationFrameId);
  animationFrameId = null;
}

async function loadFile(file) {
  if (!file || (!file.type.startsWith("image/") && !file.type.startsWith("video/"))) {
    showToast("Choose a supported photo or video file.");
    return;
  }
  const nextUrl = URL.createObjectURL(file);
  try {
    if (activeVideo) {
      activeVideo.pause();
      activeVideo.removeAttribute("src");
      activeVideo.load();
      activeVideo = null;
    }
    if (file.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "auto";
      video.src = nextUrl;
      await new Promise((resolve, reject) => {
        video.addEventListener("loadeddata", resolve, { once: true });
        video.addEventListener("error", reject, { once: true });
      });
      renderer.setVideo(video);
      activeVideo = video;
      video.play().catch(() => showToast("Tap the screen to start video playback."));
    } else {
      const image = new Image();
      image.decoding = "async";
      image.src = nextUrl;
      await image.decode();
      renderer.setImage(image);
    }
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = nextUrl;
    mediaReady = true;
    hint.hidden = true;
    app.dataset.ready = "true";
    targetTilt = 0;
    renderedTilt = 0;
  } catch {
    URL.revokeObjectURL(nextUrl);
    showToast("That media file could not be played in this browser.");
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

document.querySelector(".motion-continue").addEventListener("click", async () => {
  let enabled = false;
  try {
    await MotionTracker.requestPermission();
    tracker.start();
    tracker.recalibrate();
    motionButton.textContent = "Motion enabled";
    motionButton.disabled = true;
    recalibrateButton.hidden = false;
    enabled = true;
  } catch (error) {
    showToast(error.message);
  } finally {
    motionDialog.close();
    if (enabled) showToast("Motion is ready. Now choose a photo or video.");
  }
});

document.querySelector(".motion-skip").addEventListener("click", () => {
  motionDialog.close();
  showToast("Choose a photo or video. You can drag the screen to test the effect.");
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
  activeVideo?.play().catch(() => {});
  dragging = true;
  pointerStart = event.clientX;
  tiltStart = targetTilt;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", event => {
  if (!dragging) return;
  const delta = (event.clientX - pointerStart) / Math.max(1, innerWidth);
  targetTilt = clamp(tiltStart + delta * 100, -55, 55);
  if (Math.abs(delta) > .04) hasInteracted = true;
});

canvas.addEventListener("pointerup", event => {
  dragging = false;
  canvas.releasePointerCapture(event.pointerId);
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopRendering();
    activeVideo?.pause();
    return;
  }
  if (tracker.listening) tracker.recalibrate();
  activeVideo?.play().catch(() => {});
  startRendering();
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
  if (installPromptScheduled) return;
  if (ios && !standalone && !localStorage.getItem("keiazotilt-install-dismissed")) {
    installPromptScheduled = true;
    setTimeout(() => {
      if (!installDialog.open) installDialog.showModal();
    }, 1200);
  }
}

try {
  renderer = new FoldRenderer(canvas);
  startRendering();
  setTimeout(() => motionDialog.showModal(), 350);
} catch (error) {
  showToast(error.message);
  motionButton.hidden = true;
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
