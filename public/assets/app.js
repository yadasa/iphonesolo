import { MotionTracker, smooth, tiltToFold } from "./motion.js";
import { DEFAULT_RENDER_SETTINGS, FoldRenderer } from "./renderer.js";

const app = document.querySelector("#app");
const canvas = document.querySelector("#gl");
const picker = document.querySelector("#media-picker");
const toggle = document.querySelector("#toggle-controls");
const panel = document.querySelector("#control-panel");
const motionButton = document.querySelector("#motion");
const fullscreenButton = document.querySelector("#fullscreen");
const recalibrateButton = document.querySelector("#recalibrate");
const hideUiButton = document.querySelector("#hide-ui");
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

const TAP_MOVE_THRESHOLD_PX = 10;
const VIDEO_READY_TIMEOUT_MS = 15000;
const SAFE_VIDEO_LONG_EDGE = 2048;
const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|webm|ogv|ogg)$/i;
const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|avif|heic|heif)$/i;

let renderer;
let targetTilt = 0;
let renderedTilt = 0;
let previousTime = performance.now();
let animationFrameId;
let dragging = false;
let pointerStartX = 0;
let pointerStartY = 0;
let pointerMoved = false;
let toastTimer;
let activeVideo = null;
let activeMedia = null;
let mediaReady = false;
let hasInteracted = false;
let installPromptScheduled = false;
let renderSettings = { ...DEFAULT_RENDER_SETTINGS };
let editStart = null;
let restoreInFlight = null;
let playbackIntentId = 0;
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
  const rotationProgress = Math.min(1, Math.abs(renderedTilt) / 180);
  renderer?.render(fold.angle, fold.direction, rotationProgress);
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

function waitForVideoMetadata(video) {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("loadedmetadata", onMetadata);
      video.removeEventListener("error", onError);
    };
    const finish = callback => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onMetadata = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) finish(resolve);
    };
    const onError = () => finish(() => reject(new Error("That video could not be decoded by this browser.")));
    const timer = setTimeout(() => finish(() => reject(new Error("This video took too long to load its metadata."))), VIDEO_READY_TIMEOUT_MS);
    video.addEventListener("loadedmetadata", onMetadata);
    video.addEventListener("error", onError, { once: true });
  });
}

function waitForFirstVideoFrame(video) {
  if ("requestVideoFrameCallback" in video) {
    return new Promise((resolve, reject) => {
      let handle = null;
      const timer = setTimeout(() => {
        if (handle != null && "cancelVideoFrameCallback" in video) video.cancelVideoFrameCallback(handle);
        reject(new Error("The video decoder did not produce a frame in time."));
      }, VIDEO_READY_TIMEOUT_MS);
      handle = video.requestVideoFrameCallback(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const check = () => {
      if (video.error) return reject(new Error("That video could not be decoded by this browser."));
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) return resolve();
      if (performance.now() - started >= VIDEO_READY_TIMEOUT_MS) return reject(new Error("The video decoder did not produce a frame in time."));
      requestAnimationFrame(check);
    };
    check();
  });
}

function disposeVideo(video) {
  if (!video) return;
  try { video.pause(); } catch {}
  video.removeAttribute("src");
  try { video.load(); } catch {}
}

function releaseMedia(media) {
  if (!media) return;
  if (media.type === "video") disposeVideo(media.video);
  if (media.url) URL.revokeObjectURL(media.url);
}

function createVideoFramePlan(video) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  const sourceLongEdge = Math.max(sourceWidth, sourceHeight);
  const maxTextureSize = renderer.getMaxTextureSize() || SAFE_VIDEO_LONG_EDGE;
  const displayLongEdge = Math.max(canvas.width || 1, canvas.height || 1);
  const displayTarget = Math.max(720, Math.ceil(displayLongEdge * 1.25));
  const workingLongEdge = Math.min(sourceLongEdge, SAFE_VIDEO_LONG_EDGE, maxTextureSize, displayTarget);
  const textureScale = Math.min(1, maxTextureSize / sourceWidth, maxTextureSize / sourceHeight);
  const displayScale = Math.min(1, workingLongEdge / sourceLongEdge);
  const scale = Math.min(1, textureScale, displayScale);

  const frameCanvas = document.createElement("canvas");
  frameCanvas.width = Math.max(2, Math.round(sourceWidth * scale));
  frameCanvas.height = Math.max(2, Math.round(sourceHeight * scale));
  const frameContext = frameCanvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!frameContext) throw new Error("Could not create a safe video frame buffer.");

  const updateFrame = () => {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    frameContext.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
  };
  updateFrame();

  return {
    frameSource: frameCanvas,
    width: frameCanvas.width,
    height: frameCanvas.height,
    updateFrame,
    downscaled: scale < 0.999
  };
}

async function prepareVideo(file, url) {
  const video = document.createElement("video");
  video.muted = true;
  video.defaultMuted = true;
  video.autoplay = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.disablePictureInPicture = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("muted", "");
  video.src = url;

  try {
    await waitForVideoMetadata(video);
    await video.play();
    await waitForFirstVideoFrame(video);
    const framePlan = createVideoFramePlan(video);
    return { type: "video", video, url, shouldPlay: true, ...framePlan };
  } catch (error) {
    disposeVideo(video);
    throw error;
  }
}

function commitMedia(nextMedia) {
  const previousMedia = activeMedia;
  activeMedia = nextMedia;
  activeVideo = nextMedia.type === "video" ? nextMedia.video : null;
  playbackIntentId += 1;
  releaseMedia(previousMedia);
  mediaReady = true;
  hint.hidden = true;
  app.dataset.ready = "true";
  targetTilt = 0;
  renderedTilt = 0;
}

async function startVideoPlayback(media, { reportError = true } = {}) {
  if (!media || media !== activeMedia || media.type !== "video") return false;
  const intentId = ++playbackIntentId;
  media.shouldPlay = true;
  try {
    await media.video.play();
    if (intentId !== playbackIntentId || !media.shouldPlay || media !== activeMedia) return false;
    return true;
  } catch (error) {
    if (intentId !== playbackIntentId || !media.shouldPlay || media !== activeMedia) return false;
    media.shouldPlay = false;
    if (reportError) showToast("Playback could not start. Tap the screen to try again.");
    return false;
  }
}

function pauseVideoPlayback(media) {
  if (!media || media !== activeMedia || media.type !== "video") return;
  playbackIntentId += 1;
  media.shouldPlay = false;
  media.video.pause();
}

async function loadFile(file) {
  const videoFile = isVideoFile(file);
  const imageFile = isImageFile(file);
  if (!file || (!imageFile && !videoFile)) {
    showToast("Choose a supported photo or video file.");
    return;
  }

  const nextUrl = URL.createObjectURL(file);
  let candidateVideo = null;
  try {
    if (videoFile) {
      const nextMedia = await prepareVideo(file, nextUrl);
      candidateVideo = nextMedia.video;
      renderer.setVideo(nextMedia.video, nextMedia);
      commitMedia(nextMedia);
      await startVideoPlayback(nextMedia, { reportError: false });
      if (nextMedia.downscaled) showToast(`Large video optimized to ${nextMedia.width}×${nextMedia.height} for stable playback.`);
    } else {
      const image = new Image();
      image.decoding = "async";
      image.src = nextUrl;
      await image.decode();
      renderer.setImage(image);
      commitMedia({ type: "image", image, url: nextUrl });
    }
  } catch (error) {
    if (candidateVideo) disposeVideo(candidateVideo);
    URL.revokeObjectURL(nextUrl);
    if (renderer?.isContextLost()) showToast("The graphics engine restarted after that media failed. Your previous media will be restored automatically.");
    else showToast(error?.message || "That media file could not be played in this browser.");
  } finally {
    picker.value = "";
  }
}

async function restoreActiveMedia() {
  if (restoreInFlight) return restoreInFlight;
  restoreInFlight = (async () => {
    if (!activeMedia || renderer.isContextLost()) return;
    renderer.setSettings(renderSettings);
    if (activeMedia.type === "image") {
      renderer.setImage(activeMedia.image);
      return;
    }
    const video = activeMedia.video;
    const shouldRemainPaused = !activeMedia.shouldPlay;
    if (video.paused) await video.play();
    await waitForFirstVideoFrame(video);
    activeMedia.updateFrame?.();
    renderer.setVideo(video, activeMedia);
    if (shouldRemainPaused) video.pause();
  })().finally(() => { restoreInFlight = null; });
  return restoreInFlight;
}

function toggleVideoPlayback() {
  if (!activeMedia || activeMedia.type !== "video") return;
  if (activeMedia.shouldPlay && !activeMedia.video.paused && !activeMedia.video.ended) {
    pauseVideoPlayback(activeMedia);
    return;
  }
  startVideoPlayback(activeMedia);
}

toggle.addEventListener("click", () => {
  const open = app.dataset.controls !== "closed";
  app.dataset.controls = open ? "closed" : "open";
  toggle.setAttribute("aria-expanded", String(!open));
  panel.inert = open;
});

tuningToggle.addEventListener("click", () => openTuningPanel(app.dataset.tuning !== "open"));
tuningClose.addEventListener("click", () => openTuningPanel(false));

hideUiButton?.addEventListener("click", () => {
  for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
  for (const element of document.querySelectorAll(".controls, .tuning, #hint, #toast, dialog")) element.hidden = true;
});

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
    showToast("Motion enabled. Hold your phone naturally, then rotate it.");
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
  showToast("Choose a photo or video. Device rotation controls the effect.");
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
  pointerStartX = event.clientX;
  pointerStartY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", event => {
  if (!dragging) return;
  const deltaX = event.clientX - pointerStartX;
  const deltaY = event.clientY - pointerStartY;
  if (Math.hypot(deltaX, deltaY) >= TAP_MOVE_THRESHOLD_PX) pointerMoved = true;
});

canvas.addEventListener("pointerup", event => {
  const wasTap = dragging && !pointerMoved;
  dragging = false;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (wasTap) toggleVideoPlayback();
});

canvas.addEventListener("pointercancel", event => {
  dragging = false;
  pointerMoved = false;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
});

canvas.addEventListener("foldrenderercontextlost", () => {
  stopRendering();
  playbackIntentId += 1;
  if (activeMedia?.type === "video") activeMedia.video.pause();
  showToast("Graphics context reset. Restoring your media…");
});

canvas.addEventListener("foldrenderercontextrestored", async () => {
  try {
    await restoreActiveMedia();
    showToast("Graphics restored.");
  } catch {
    showToast("Graphics recovered, but the last media could not be restored. Choose another file.");
  } finally {
    startRendering();
  }
});

canvas.addEventListener("foldrenderercontextrestorefailed", () => {
  showToast("Graphics could not restart automatically. Reload the app to continue.");
});

canvas.addEventListener("foldrenderermediaerror", event => {
  if (activeMedia?.type === "video") {
    pauseVideoPlayback(activeMedia);
  }
  showToast(event.detail?.message || "Video rendering stopped, but the app is still usable.");
});

document.addEventListener("visibilitychange", async () => {
  if (document.hidden) {
    stopRendering();
    playbackIntentId += 1;
    activeVideo?.pause();
    return;
  }
  if (tracker.listening) tracker.recalibrate();
  if (activeMedia?.type === "video" && activeMedia.shouldPlay) {
    await startVideoPlayback(activeMedia, { reportError: false });
  }
  startRendering();
});

window.addEventListener("orientationchange", () => tracker.recalibrate(), { passive: true });
window.addEventListener("beforeunload", () => releaseMedia(activeMedia));

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
