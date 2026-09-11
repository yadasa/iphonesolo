import { MotionTracker, clamp, smooth, tiltToFold } from "./motion.js";
import { DEFAULT_RENDER_SETTINGS, FoldRenderer } from "./renderer.js";

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
const tuningToggle = document.querySelector("#tuning-toggle");
const tuningClose = document.querySelector("#tuning-close");
const tuningPanel = document.querySelector("#tuning-panel");
const settingInputs = [...document.querySelectorAll("[data-setting]")];
const undoButton = document.querySelector("#settings-undo");
const redoButton = document.querySelector("#settings-redo");
const showSettingsButton = document.querySelector("#show-settings");
const settingsJsonWrap = document.querySelector("#settings-json-wrap");
const settingsJson = document.querySelector("#settings-json");
const copySettingsButton = document.querySelector("#copy-settings");

const VIDEO_READY_TIMEOUT_MS = 20000;
const TAP_MOVE_THRESHOLD_PX = 10;
const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|webm|ogv|ogg)$/i;
const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|avif|heic|heif)$/i;

let renderer;
let imageUrl;
let targetTilt = 0;
let renderedTilt = 0;
let previousTime = performance.now();
let animationFrameId;
let dragging = false;
let pointerStart = 0;
let pointerStartY = 0;
let pointerMoved = false;
let tiltStart = 0;
let toastTimer;
let activeVideo;
let videoShouldPlay = false;
let mediaReady = false;
let hasInteracted = false;
let installPromptScheduled = false;
let renderSettings = { ...DEFAULT_RENDER_SETTINGS };
let editStart = null;
const undoStack = [];
const redoStack = [];

const tracker = new MotionTracker(value => { targetTilt = value; });

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4400);
}

function settingsSnapshot() {
  return { ...renderSettings };
}

function settingsEqual(left, right) {
  return Object.keys(DEFAULT_RENDER_SETTINGS).every(key => left[key] === right[key]);
}

function formatSetting(input, value) {
  if (input.dataset.format === "percent") return `${Math.round(value * 100)}%`;
  if (input.dataset.format === "signed-percent") return `${value > 0 ? "+" : ""}${Math.round(value * 100)}%`;
  if (input.dataset.format === "pixels") return `${Math.round(value)} px`;
  if (input.dataset.format === "samples") return `${Math.round(value)} taps`;
  return Number(value).toFixed(2);
}

function settingsPayload() {
  return JSON.stringify({ version: 3, settings: renderSettings }, null, 2);
}

function updateHistoryControls() {
  undoButton.disabled = undoStack.length === 0;
  redoButton.disabled = redoStack.length === 0;
}

function refreshSettingsUi() {
  for (const input of settingInputs) {
    const value = renderSettings[input.dataset.setting];
    if (input.type === "checkbox") input.checked = Boolean(value);
    else {
      input.value = String(value);
      document.querySelector(`[data-output="${input.dataset.setting}"]`).textContent = formatSetting(input, value);
    }
  }
  renderer?.setSettings(renderSettings);
  if (!settingsJsonWrap.hidden) settingsJson.textContent = settingsPayload();
  updateHistoryControls();
}

function commitSettingsEdit() {
  if (!editStart) return;
  if (!settingsEqual(editStart, renderSettings)) {
    undoStack.push(editStart);
    redoStack.length = 0;
  }
  editStart = null;
  updateHistoryControls();
}

function openTuningPanel(open) {
  app.dataset.tuning = open ? "open" : "closed";
  tuningToggle.setAttribute("aria-expanded", String(open));
  tuningToggle.setAttribute("aria-label", open ? "Close effect settings" : "Open effect settings");
  tuningPanel.setAttribute("aria-hidden", String(!open));
  tuningPanel.inert = !open;
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

function isVideoFile(file) {
  return Boolean(file && (file.type?.startsWith("video/") || VIDEO_EXTENSIONS.test(file.name || "")));
}

function isImageFile(file) {
  return Boolean(file && (file.type?.startsWith("image/") || IMAGE_EXTENSIONS.test(file.name || "")));
}

function videoErrorMessage(video) {
  const code = video.error?.code;
  if (code === MediaError.MEDIA_ERR_DECODE) return "This video could not be decoded. Try exporting it as H.264 or HEVC in an MP4/MOV container.";
  if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) return "This video format or codec is not supported by this browser.";
  return "That video could not be played in this browser.";
}

function waitForVideoReady(video) {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onError);
      video.removeEventListener("abort", onAbort);
    };
    const finish = callback => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onReady = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        finish(resolve);
      }
    };
    const onError = () => finish(() => reject(new Error(videoErrorMessage(video))));
    const onAbort = () => finish(() => reject(new Error("Video loading was interrupted.")));
    const timer = setTimeout(() => finish(() => reject(new Error("This video took too long to become playable. Try a smaller export or a different codec."))), VIDEO_READY_TIMEOUT_MS);

    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplay", onReady);
    video.addEventListener("error", onError, { once: true });
    video.addEventListener("abort", onAbort, { once: true });
    video.load();
  });
}

function stopActiveVideo() {
  if (!activeVideo) return;
  videoShouldPlay = false;
  activeVideo.pause();
  activeVideo.removeAttribute("src");
  activeVideo.load();
  activeVideo = null;
}

async function setVideoPlaying(shouldPlay, { announce = false } = {}) {
  if (!activeVideo) return;
  videoShouldPlay = shouldPlay;
  if (!shouldPlay) {
    activeVideo.pause();
    if (announce) showToast("Video paused.");
    return;
  }

  try {
    await activeVideo.play();
    if (announce) showToast("Video playing.");
  } catch {
    videoShouldPlay = false;
    showToast("Playback was blocked. Tap the video again to play it.");
  }
}

async function toggleVideoPlayback() {
  if (!activeVideo) return;
  await setVideoPlaying(activeVideo.paused || activeVideo.ended, { announce: true });
}

async function loadFile(file) {
  const videoFile = isVideoFile(file);
  const imageFile = isImageFile(file);
  if (!file || (!imageFile && !videoFile)) {
    showToast("Choose a supported photo or video file.");
    return;
  }

  const nextUrl = URL.createObjectURL(file);
  try {
    stopActiveVideo();

    if (videoFile) {
      const video = document.createElement("video");
      video.muted = true;
      video.defaultMuted = true;
      video.loop = true;
      video.autoplay = true;
      video.playsInline = true;
      video.preload = "auto";
      video.disablePictureInPicture = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      video.setAttribute("muted", "");
      video.src = nextUrl;

      await waitForVideoReady(video);
      renderer.setVideo(video);
      activeVideo = video;
      videoShouldPlay = true;

      video.addEventListener("error", () => {
        if (video === activeVideo) showToast(videoErrorMessage(video));
      });

      await setVideoPlaying(true);
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
  } catch (error) {
    URL.revokeObjectURL(nextUrl);
    stopActiveVideo();
    showToast(error?.message || "That media file could not be played in this browser.");
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

tuningToggle.addEventListener("click", () => openTuningPanel(app.dataset.tuning !== "open"));
tuningClose.addEventListener("click", () => openTuningPanel(false));

for (const input of settingInputs) {
  const beginEdit = () => { if (!editStart) editStart = settingsSnapshot(); };
  input.addEventListener("pointerdown", beginEdit);
  input.addEventListener("focus", beginEdit);
  input.addEventListener("input", () => {
    beginEdit();
    renderSettings[input.dataset.setting] = input.type === "checkbox" ? input.checked : Number(input.value);
    refreshSettingsUi();
  });
  input.addEventListener("change", commitSettingsEdit);
  input.addEventListener("blur", commitSettingsEdit);
}

undoButton.addEventListener("click", () => {
  commitSettingsEdit();
  const previous = undoStack.pop();
  if (!previous) return;
  redoStack.push(settingsSnapshot());
  renderSettings = previous;
  refreshSettingsUi();
});

redoButton.addEventListener("click", () => {
  commitSettingsEdit();
  const next = redoStack.pop();
  if (!next) return;
  undoStack.push(settingsSnapshot());
  renderSettings = next;
  refreshSettingsUi();
});

showSettingsButton.addEventListener("click", () => {
  const show = settingsJsonWrap.hidden;
  settingsJsonWrap.hidden = !show;
  showSettingsButton.textContent = show ? "Hide settings JSON" : "Show settings JSON";
  showSettingsButton.setAttribute("aria-expanded", String(show));
  if (show) settingsJson.textContent = settingsPayload();
});

copySettingsButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(settingsPayload());
    showToast("Settings JSON copied.");
  } catch {
    settingsJson.focus();
    showToast("Press and hold the JSON to copy it.");
  }
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
  dragging = true;
  pointerMoved = false;
  pointerStart = event.clientX;
  pointerStartY = event.clientY;
  tiltStart = targetTilt;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", event => {
  if (!dragging) return;
  const dx = event.clientX - pointerStart;
  const dy = event.clientY - pointerStartY;
  if (Math.hypot(dx, dy) >= TAP_MOVE_THRESHOLD_PX) pointerMoved = true;
  const delta = dx / Math.max(1, innerWidth);
  targetTilt = clamp(tiltStart + delta * 190, -180, 180);
  if (Math.abs(delta) > .04) hasInteracted = true;
});

canvas.addEventListener("pointerup", async event => {
  if (!dragging) return;
  dragging = false;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (!pointerMoved && activeVideo) await toggleVideoPlayback();
});

canvas.addEventListener("pointercancel", event => {
  dragging = false;
  pointerMoved = false;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopRendering();
    activeVideo?.pause();
    return;
  }
  if (tracker.listening) tracker.recalibrate();
  if (videoShouldPlay) activeVideo?.play().catch(() => { videoShouldPlay = false; });
  startRendering();
});

window.addEventListener("orientationchange", () => tracker.recalibrate(), { passive: true });
window.addEventListener("beforeunload", () => {
  stopActiveVideo();
  if (imageUrl) URL.revokeObjectURL(imageUrl);
});

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
  renderer.setSettings(renderSettings);
  refreshSettingsUi();
  startRendering();
  setTimeout(() => motionDialog.showModal(), 350);
} catch (error) {
  showToast(error.message);
  motionButton.hidden = true;
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
