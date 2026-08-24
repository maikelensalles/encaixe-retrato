import { LOAD_TIMEOUT_MS, MIN_BOX_SIZE, ARM_HOLD_MS, FRAME_GRACE_MS, LM } from "./config.js";
import { videoEl, canvas, ctx, initWebcam } from "./camera.js";
import { initHandLandmarker } from "./vision.js";
import {
  appState,
  puzzle,
  drag,
  armGate,
  fistHold,
  lastSeenFrame,
  resetPuzzleOnly,
  isPinching,
  toPixel,
  mirrorLandmarkX,
  computeHandFrame,
  startCountdown,
  drawCountdownOverlay,
  applyPhotoboothInsideBox,
  drawLiveFrameOverlay,
  drawBoardAndPieces,
  drawHandSkeletonsOverBoard,
  handleDragForHand,
  handleFistHoldAndSave,
} from "./puzzle.js";
import {
  statusDot,
  statusText,
  connectionOverlay,
  loaderRetry,
  downloadStripBtn,
  resetAllBtn,
  isStripFull,
  downloadPhotoStrip,
  updateStripDownloadAvailability,
  resetGallery,
  resetLoaderUI,
  showLoaderError,
  updateProgressBadge,
} from "./ui.js";

let handLandmarker = null;

function resetEverything() {
  resetGallery();
  resetPuzzleOnly();
  statusText.textContent = "sistema reiniciado";
}

function processResults(result) {
  const handsLandmarks = result.landmarks || [];
  const noHands = handsLandmarks.length === 0;

  if (noHands) {
    statusDot.className = puzzle.solved ? "status-dot solved" : "status-dot";
    fistHold.start = null;

    if (drag.activeHand && drag.piece) {
      handleDragForHand(drag.activeHand, false, { x: drag.piece.x, y: drag.piece.y });
    }

    if (appState === "tracking") {
      const sinceLastSeen = performance.now() - lastSeenFrame.at;
      if (lastSeenFrame.box && sinceLastSeen < FRAME_GRACE_MS) {
        applyPhotoboothInsideBox(lastSeenFrame.box);
        drawLiveFrameOverlay(lastSeenFrame.box);
      }
      statusText.textContent = isStripFull()
        ? "galeria completa — baixe ou reinicie"
        : "procurando mãos...";
      return;
    }

    if (appState === "countdown") {
      drawCountdownOverlay(puzzle.boardBox);
      return;
    }

    if (appState === "puzzle") {
      puzzle.solved = puzzle.pieces.every((p) => p.placed);
      updateProgressBadge(appState, puzzle);
      drawBoardAndPieces();
      statusText.textContent = puzzle.solved
        ? "completo! feche o punho para salvar"
        : "organize o puzzle com pinça";
      return;
    }

    return;
  }

  statusDot.className = puzzle.solved ? "status-dot solved" : "status-dot live";

  if (appState === "tracking") {
    if (isStripFull()) {
      statusText.textContent = "galeria completa — baixe ou reinicie";
      return;
    }
    if (handsLandmarks.length === 2) {
      const [handA, handB] = handsLandmarks;
      const indexA = mirrorLandmarkX(handA[LM.INDEX_TIP]);
      const indexB = mirrorLandmarkX(handB[LM.INDEX_TIP]);
      const frameBox = computeHandFrame(indexA, indexB);

      if (frameBox.width >= MIN_BOX_SIZE && frameBox.height >= MIN_BOX_SIZE) {
        applyPhotoboothInsideBox(frameBox);
        drawLiveFrameOverlay(frameBox);
        lastSeenFrame.box = frameBox;
        lastSeenFrame.at = performance.now();

        const bothPinching = isPinching(handA) && isPinching(handB);
        if (bothPinching) {
          if (!armGate.holding) {
            armGate.holding = true;
            armGate.since = performance.now();
          }
          statusDot.className = "status-dot armed";
          statusText.textContent = "segure a pinça...";

          if (performance.now() - armGate.since > ARM_HOLD_MS) {
            armGate.holding = false;
            startCountdown(frameBox);
          }
        } else {
          armGate.holding = false;
          statusText.textContent = "pinça dupla para capturar";
        }
      } else {
        armGate.holding = false;
        statusText.textContent = "aproxime os indicadores para enquadrar";
      }
    } else {
      armGate.holding = false;
      const sinceLastSeen = performance.now() - lastSeenFrame.at;
      if (lastSeenFrame.box && sinceLastSeen < FRAME_GRACE_MS) {
        applyPhotoboothInsideBox(lastSeenFrame.box);
        drawLiveFrameOverlay(lastSeenFrame.box);
      }
      statusText.textContent = "posicione as 2 mãos para enquadrar";
    }
    return;
  }

  if (appState === "countdown") {
    drawCountdownOverlay(puzzle.boardBox);
    return;
  }

  if (appState === "puzzle") {
    const labelsPresent = new Set();
    handsLandmarks.forEach((lm, i) => {
      const label = i === 0 ? "A" : "B";
      labelsPresent.add(label);
      const pinching = isPinching(lm);
      const indexPx = toPixel(mirrorLandmarkX(lm[LM.INDEX_TIP]));
      handleDragForHand(label, pinching, indexPx);
    });

    if (drag.activeHand && !labelsPresent.has(drag.activeHand) && drag.piece) {
      handleDragForHand(drag.activeHand, false, { x: drag.piece.x, y: drag.piece.y });
    }

    drawBoardAndPieces();
    drawHandSkeletonsOverBoard(handsLandmarks, puzzle.boardBox);

    if (puzzle.solved && !drag.piece) {
      handleFistHoldAndSave(handsLandmarks);
      statusText.textContent = "completo! feche o punho para salvar";
    } else {
      fistHold.start = null;
      statusText.textContent = "organize o puzzle com pinça";
    }
  }
}

function drawVideoFrame() {
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function renderLoop() {
  if (videoEl.readyState >= 2 && handLandmarker) {
    drawVideoFrame();
    const nowMs = performance.now();
    const result = handLandmarker.detectForVideo(videoEl, nowMs);
    processResults(result);
  }
  requestAnimationFrame(renderLoop);
}

async function boot() {
  resetLoaderUI();

  let settled = false;
  const watchdogMs = LOAD_TIMEOUT_MS * 2 + 5000;
  const watchdog = setTimeout(() => {
    if (!settled) {
      showLoaderError("O carregamento está demorando demais. Toque em tentar novamente ou verifique sua conexão.");
    }
  }, watchdogMs);

  try {
    if (!videoEl.srcObject) {
      await initWebcam();
    }

    handLandmarker = await initHandLandmarker();

    settled = true;
    clearTimeout(watchdog);
    connectionOverlay.classList.add("hidden");
    statusText.textContent = "pronto";
    requestAnimationFrame(renderLoop);
  } catch (err) {
    settled = true;
    clearTimeout(watchdog);
    if (err && err.name === "NotAllowedError") {
      showLoaderError("Permissão de câmera negada. Habilite-a nas configurações do navegador e tente novamente.");
    } else if (err && err.name === "NotFoundError") {
      showLoaderError("Nenhuma webcam disponível foi encontrada.");
    } else {
      showLoaderError((err && err.message) || "Erro ao iniciar a aplicação.");
    }
  }
}

loaderRetry.addEventListener("click", () => {
  boot();
});

if (downloadStripBtn) {
  downloadStripBtn.addEventListener("click", downloadPhotoStrip);
  updateStripDownloadAvailability();
}

if (resetAllBtn) {
  resetAllBtn.addEventListener("click", () => {
    const confirmed = window.confirm(
      "Tem certeza que deseja apagar toda a galeria e reiniciar o sistema?"
    );
    if (confirmed) resetEverything();
  });
}

boot();
