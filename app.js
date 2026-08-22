const STRIP_MAX_PHOTOS = 3;
const STATUS_POLL_MS = 350;
const CAPTURE_POLL_MS = 1000;

const STATE_LABELS = {
  tracking: "posicione 2 mãos para enquadrar",
  countdown: "capturando...",
  puzzle: "organize o puzzle com pinça",
};

const videoFeed = document.getElementById("videoFeed");
const connectionOverlay = document.getElementById("connectionOverlay");
const loaderText = document.getElementById("loaderText");
const errorBanner = document.getElementById("errorBanner");

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const progressBadge = document.getElementById("progressBadge");
const progressText = document.getElementById("progressText");

const galleryStrip = document.getElementById("galleryStrip");
const galleryEmpty = document.getElementById("galleryEmpty");
const galleryCount = document.getElementById("galleryCount");
const downloadStripBtn = document.getElementById("downloadStripBtn");
const resetAllBtn = document.getElementById("resetAllBtn");
const stripCompleteMsg = document.getElementById("stripCompleteMsg");

let knownCaptureIds = new Set();
let latestCaptures = [];

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.style.display = "block";
}

function hideError() {
  errorBanner.style.display = "none";
}

videoFeed.addEventListener("load", () => {
  connectionOverlay.classList.add("hidden");
  hideError();
});

videoFeed.addEventListener("error", () => {
  loaderText.textContent = "não foi possível conectar ao stream do backend. verifique se app.py está rodando.";
  connectionOverlay.classList.remove("hidden");
  showError("stream de vídeo indisponível — reinicie o servidor FastAPI.");
});

function updateStatusUI(status) {
  const label = STATE_LABELS[status.state] || status.state;
  statusText.textContent = status.solved
    ? "completo! feche o punho para salvar"
    : label;

  statusDot.className = "status-dot";
  if (status.state === "puzzle") {
    statusDot.classList.add(status.solved ? "solved" : "live");
  } else if (status.state === "countdown") {
    statusDot.classList.add("armed");
  }

  if (status.state === "puzzle" && status.total > 0) {
    progressText.textContent = `${status.placed} / ${status.total} peças encaixadas`;
    progressBadge.classList.add("visible");
    progressBadge.classList.toggle("solved", status.solved);
  } else {
    progressBadge.classList.remove("visible", "solved");
  }
}

async function pollStatus() {
  try {
    const res = await fetch("/status", { cache: "no-store" });
    if (res.ok) {
      const status = await res.json();
      updateStatusUI(status);
      hideError();
    }
  } catch (err) {
    showError("perdi conexão com o backend — tentando reconectar...");
  } finally {
    setTimeout(pollStatus, STATUS_POLL_MS);
  }
}

function renderGalleryThumb(capture, index) {
  const print = document.createElement("div");
  print.className = "print";

  const img = document.createElement("img");
  img.src = `data:image/jpeg;base64,${capture.image}`;
  img.alt = `Puzzle completo #${index}`;

  const label = document.createElement("div");
  label.className = "print-label";
  label.textContent = `#${String(index).padStart(2, "0")}`;

  print.appendChild(img);
  print.appendChild(label);
  galleryStrip.insertBefore(print, galleryStrip.firstChild);
}

function showStripComplete() {
  stripCompleteMsg.classList.add("visible");
}

function hideStripComplete() {
  stripCompleteMsg.classList.remove("visible");
}

function updateStripDownloadAvailability() {
  downloadStripBtn.disabled = latestCaptures.length === 0;
}

function renderGalleryFromCaptures(captures) {
  latestCaptures = captures;
  const newIds = new Set(captures.map((c) => c.id));

  const isFreshSet =
    captures.length < knownCaptureIds.size ||
    [...knownCaptureIds].some((id) => !newIds.has(id));

  if (isFreshSet) {
    galleryStrip.innerHTML = "";
    galleryStrip.appendChild(galleryEmpty);
  }

  if (captures.length === 0) {
    galleryEmpty.style.display = "block";
    hideStripComplete();
  } else {
    galleryEmpty.style.display = "none";
    if (isFreshSet) {
      captures.forEach((capture, i) => renderGalleryThumb(capture, i + 1));
    } else {
      captures.forEach((capture, i) => {
        if (!knownCaptureIds.has(capture.id)) {
          renderGalleryThumb(capture, i + 1);
        }
      });
    }
    if (captures.length >= STRIP_MAX_PHOTOS) {
      showStripComplete();
    } else {
      hideStripComplete();
    }
  }

  knownCaptureIds = newIds;
  galleryCount.textContent = `${captures.length} / ${STRIP_MAX_PHOTOS}`;
  updateStripDownloadAvailability();
}

async function pollCaptures() {
  try {
    const res = await fetch("/capture", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      renderGalleryFromCaptures(data.captures || []);
    }
  } catch (err) {
    // silencioso: pollStatus já reporta problemas de conexão
  } finally {
    setTimeout(pollCaptures, CAPTURE_POLL_MS);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const STRIP_FILE_BORDER = 24;
const STRIP_FILE_GAP = 16;
const STRIP_FILE_BG = "#ffffff";

async function downloadPhotoStrip() {
  if (latestCaptures.length === 0) return;

  const images = await Promise.all(
    latestCaptures.map((c) => loadImage(`data:image/jpeg;base64,${c.image}`))
  );

  const targetW = images[0].width;
  const scaledHeights = images.map((img) => Math.round(img.height * (targetW / img.width)));

  const totalH =
    STRIP_FILE_BORDER * 2 +
    scaledHeights.reduce((sum, h) => sum + h, 0) +
    STRIP_FILE_GAP * (images.length - 1);
  const totalW = targetW + STRIP_FILE_BORDER * 2;

  const stripCanvas = document.createElement("canvas");
  stripCanvas.width = totalW;
  stripCanvas.height = totalH;
  const stripCtx = stripCanvas.getContext("2d");

  stripCtx.fillStyle = STRIP_FILE_BG;
  stripCtx.fillRect(0, 0, totalW, totalH);

  let cursorY = STRIP_FILE_BORDER;
  images.forEach((img, i) => {
    const h = scaledHeights[i];
    stripCtx.drawImage(img, STRIP_FILE_BORDER, cursorY, targetW, h);
    cursorY += h + STRIP_FILE_GAP;
  });

  stripCanvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `puzzlecam_tira_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, "image/png");
}

async function resetEverything() {
  try {
    await fetch("/reset", { method: "POST" });
  } catch (err) {
    showError("não foi possível resetar — verifique a conexão com o backend.");
    return;
  }
  knownCaptureIds = new Set();
  latestCaptures = [];
  galleryStrip.innerHTML = "";
  galleryStrip.appendChild(galleryEmpty);
  galleryEmpty.style.display = "block";
  galleryCount.textContent = `0 / ${STRIP_MAX_PHOTOS}`;
  hideStripComplete();
  updateStripDownloadAvailability();
  statusText.textContent = "sistema reiniciado";
}

downloadStripBtn.addEventListener("click", downloadPhotoStrip);

resetAllBtn.addEventListener("click", () => {
  const confirmed = window.confirm(
    "Tem certeza que deseja apagar toda a galeria e reiniciar o sistema?"
  );
  if (confirmed) resetEverything();
});

pollStatus();
pollCaptures();
