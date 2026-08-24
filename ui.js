import {
  DANGER,
  STRIP_MAX_PHOTOS,
  STRIP_FILE_BORDER,
  STRIP_FILE_GAP,
  STRIP_FILE_BG,
} from "./config.js";

export const statusDot = document.getElementById("statusDot");
export const statusText = document.getElementById("statusText");
export const connectionOverlay = document.getElementById("connectionOverlay");
export const loaderText = document.getElementById("loaderText");
export const loaderRetry = document.getElementById("loaderRetry");
export const errorBanner = document.getElementById("errorBanner");
export const progressBadge = document.getElementById("progressBadge");
export const progressText = document.getElementById("progressText");

export const galleryStrip = document.getElementById("galleryStrip");
export const galleryEmpty = document.getElementById("galleryEmpty");
export const galleryCount = document.getElementById("galleryCount");
export const downloadStripBtn = document.getElementById("downloadStripBtn");
export const resetAllBtn = document.getElementById("resetAllBtn");
export const stripCompleteMsg = document.getElementById("stripCompleteMsg");

export const galleryEntries = [];

export function addToGallery(snapshotCanvas) {
  if (galleryEntries.length >= STRIP_MAX_PHOTOS) return;

  galleryEntries.push({ canvas: snapshotCanvas, time: Date.now() });
  renderGalleryThumb(snapshotCanvas, galleryEntries.length);
  galleryCount.textContent = `${galleryEntries.length} / ${STRIP_MAX_PHOTOS}`;
  if (galleryEmpty) galleryEmpty.style.display = "none";

  if (galleryEntries.length >= STRIP_MAX_PHOTOS) {
    showStripComplete();
  }
}

export function isStripFull() {
  return galleryEntries.length >= STRIP_MAX_PHOTOS;
}

export function showStripComplete() {
  if (stripCompleteMsg) stripCompleteMsg.classList.add("visible");
  updateStripDownloadAvailability();
}

export function hideStripComplete() {
  if (stripCompleteMsg) stripCompleteMsg.classList.remove("visible");
}

export function updateStripDownloadAvailability() {
  if (!downloadStripBtn) return;
  downloadStripBtn.disabled = galleryEntries.length === 0;
}

export function downloadPhotoStrip() {
  if (galleryEntries.length === 0) return;

  const entries = galleryEntries;
  const targetW = entries[0].canvas.width;
  const scaledHeights = entries.map((entry) =>
    Math.round(entry.canvas.height * (targetW / entry.canvas.width))
  );

  const totalH =
    STRIP_FILE_BORDER * 2 +
    scaledHeights.reduce((sum, h) => sum + h, 0) +
    STRIP_FILE_GAP * (entries.length - 1);
  const totalW = targetW + STRIP_FILE_BORDER * 2;

  const stripCanvas = document.createElement("canvas");
  stripCanvas.width = totalW;
  stripCanvas.height = totalH;
  const stripCtx = stripCanvas.getContext("2d");

  stripCtx.fillStyle = STRIP_FILE_BG;
  stripCtx.fillRect(0, 0, totalW, totalH);

  let cursorY = STRIP_FILE_BORDER;
  entries.forEach((entry, i) => {
    const h = scaledHeights[i];
    stripCtx.drawImage(entry.canvas, STRIP_FILE_BORDER, cursorY, targetW, h);
    cursorY += h + STRIP_FILE_GAP;
  });

  stripCanvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `motion_puzzle_tira_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, "image/png");
}

export function resetGallery() {
  galleryEntries.length = 0;
  galleryStrip.innerHTML = "";
  galleryCount.textContent = `0 / ${STRIP_MAX_PHOTOS}`;
  if (galleryEmpty) {
    galleryEmpty.style.display = "block";
    galleryStrip.appendChild(galleryEmpty);
  }
  hideStripComplete();
  updateStripDownloadAvailability();
}

export function renderGalleryThumb(snapshotCanvas, index) {
  const print = document.createElement("div");
  print.className = "print";

  const thumbCanvas = document.createElement("canvas");
  const THUMB_W = 220;
  const scale = THUMB_W / snapshotCanvas.width;
  thumbCanvas.width = THUMB_W;
  thumbCanvas.height = Math.round(snapshotCanvas.height * scale);
  thumbCanvas.getContext("2d").drawImage(snapshotCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);

  const label = document.createElement("div");
  label.className = "print-label";
  label.textContent = `#${String(index).padStart(2, "0")}`;

  print.appendChild(thumbCanvas);
  print.appendChild(label);
  galleryStrip.insertBefore(print, galleryStrip.firstChild);
}

export function updateProgressBadge(appState, puzzle) {
  if (appState !== "puzzle") {
    progressBadge.classList.remove("visible", "solved");
    return;
  }
  const placedCount = puzzle.pieces.filter((p) => p.placed).length;
  progressText.textContent = `${placedCount} / ${puzzle.pieces.length} peças encaixadas`;
  progressBadge.classList.add("visible");
  progressBadge.classList.toggle("solved", puzzle.solved);
}

export function showError(message) {
  errorBanner.textContent = message;
  errorBanner.style.display = "block";
}

export function showLoaderError(message) {
  loaderText.textContent = message;
  loaderText.style.color = DANGER;
  loaderRetry.classList.remove("hidden");
}

export function resetLoaderUI() {
  connectionOverlay.classList.remove("hidden");
  loaderText.style.color = "";
  loaderText.textContent = "Calibrando sensores de movimento...";
  loaderRetry.classList.add("hidden");
  errorBanner.style.display = "none";
}
