const STRIP_MAX_PHOTOS = 3;
const CAPTURE_FPS = 15;
const JPEG_QUALITY = 0.75;
const RECONNECT_DELAY_MS = 1500;

const STATE_LABELS = {
  tracking: "posicione 2 mãos para enquadrar",
  countdown: "capturando...",
  puzzle: "organize o puzzle com pinça",
};

const videoEl = document.getElementById("webcam");
const captureCanvas = document.getElementById("captureCanvas");
const captureCtx = captureCanvas.getContext("2d", { willReadFrequently: true });
const videoFeed = document.getElementById("videoFeed");

const connectionOverlay = document.getElementById("connectionOverlay");
const loaderText = document.getElementById("loaderText");
const loaderRetry = document.getElementById("loaderRetry");
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

let ws = null;
let wsReady = false;
let captureTimer = null;
let firstFrameReceived = false;
let currentFrameUrl = null;
let latestCaptures = [];
let awaitingFrame = false;

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.style.display = "block";
}

function hideError() {
  errorBanner.style.display = "none";
}

function showLoaderError(message) {
  loaderText.textContent = message;
  loaderText.style.color = "#e0533d";
  loaderRetry.classList.remove("hidden");
  connectionOverlay.classList.remove("hidden");
}

function resetLoaderUI(message) {
  loaderText.style.color = "";
  loaderText.textContent = message;
  loaderRetry.classList.add("hidden");
  connectionOverlay.classList.remove("hidden");
}

// ------------------------------------------------------------------
// Câmera do navegador (getUserMedia)
// ------------------------------------------------------------------
async function initWebcam() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Este navegador não suporta getUserMedia.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
    audio: false,
  });
  videoEl.srcObject = stream;

  await new Promise((resolve) => {
    videoEl.onloadedmetadata = () => {
      videoEl.play();
      resolve();
    };
  });

  captureCanvas.width = videoEl.videoWidth;
  captureCanvas.height = videoEl.videoHeight;
}

function captureAndSendFrame() {
  if (!wsReady || awaitingFrame) return;
  if (videoEl.readyState < 2) return;

  captureCtx.drawImage(videoEl, 0, 0, captureCanvas.width, captureCanvas.height);
  captureCanvas.toBlob(
    (blob) => {
      if (!blob || ws.readyState !== WebSocket.OPEN) return;
      awaitingFrame = true;
      ws.send(blob);
    },
    "image/jpeg",
    JPEG_QUALITY
  );
}

// ------------------------------------------------------------------
// WebSocket com o backend (envia frames, recebe overlay + status)
// ------------------------------------------------------------------
function wsUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

function connectWebSocket() {
  ws = new WebSocket(wsUrl());
  ws.binaryType = "blob";

  ws.onopen = () => {
    wsReady = true;
    hideError();
    resetLoaderUI("conectado — aguardando primeiro frame...");
    if (!captureTimer) {
      captureTimer = setInterval(captureAndSendFrame, 1000 / CAPTURE_FPS);
    }
  };

  ws.onmessage = (event) => {
    if (event.data instanceof Blob) {
      awaitingFrame = false;
      const url = URL.createObjectURL(event.data);
      const prevUrl = currentFrameUrl;
      videoFeed.src = url;
      currentFrameUrl = url;
      if (prevUrl) URL.revokeObjectURL(prevUrl);

      if (!firstFrameReceived) {
        firstFrameReceived = true;
        connectionOverlay.classList.add("hidden");
      }
    } else {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "status") {
          updateStatusUI(payload);
          if (payload.captures) {
            renderGalleryFromCaptures(payload.captures);
          }
        }
      } catch (err) {
        // ignora mensagens malformadas
      }
    }
  };

  ws.onclose = () => {
    wsReady = false;
    awaitingFrame = false;
    showError("conexão com o backend perdida — reconectando...");
    setTimeout(connectWebSocket, RECONNECT_DELAY_MS);
  };

  ws.onerror = () => {
    ws.close();
  };
}

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

// ------------------------------------------------------------------
// Galeria
// ------------------------------------------------------------------
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
  galleryStrip.innerHTML = "";
  galleryStrip.appendChild(galleryEmpty);

  if (captures.length === 0) {
    galleryEmpty.style.display = "block";
    hideStripComplete();
  } else {
    galleryEmpty.style.display = "none";
    captures.forEach((capture, i) => renderGalleryThumb(capture, i + 1));
    if (captures.length >= STRIP_MAX_PHOTOS) {
      showStripComplete();
    } else {
      hideStripComplete();
    }
  }

  galleryCount.textContent = `${captures.length} / ${STRIP_MAX_PHOTOS}`;
  updateStripDownloadAvailability();
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

function resetEverything() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "reset_all" }));
  }
  statusText.textContent = "sistema reiniciado";
}

downloadStripBtn.addEventListener("click", downloadPhotoStrip);

resetAllBtn.addEventListener("click", () => {
  const confirmed = window.confirm(
    "Tem certeza que deseja apagar toda a galeria e reiniciar o sistema?"
  );
  if (confirmed) resetEverything();
});

loaderRetry.addEventListener("click", () => {
  boot();
});

async function boot() {
  resetLoaderUI("solicitando acesso à câmera...");
  hideError();

  try {
    if (!videoEl.srcObject) {
      await initWebcam();
    }
    resetLoaderUI("conectando ao servidor...");
    connectWebSocket();
  } catch (err) {
    if (err && err.name === "NotAllowedError") {
      showLoaderError("Permissão de câmera negada. Habilite-a nas configurações do navegador e tente novamente.");
    } else if (err && err.name === "NotFoundError") {
      showLoaderError("Nenhuma webcam disponível foi encontrada.");
    } else {
      showLoaderError((err && err.message) || "Erro ao iniciar a câmera.");
    }
  }
}

boot();
