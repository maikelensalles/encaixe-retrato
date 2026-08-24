import {
  LM,
  NEON_PURPLE,
  NEON_GREEN,
  CREAM,
  PINCH_THRESHOLD,
  FRAME_PADDING,
  COUNTDOWN_SECONDS,
  FIST_HOLD_MS,
  GRID,
  DRAG_SMOOTHING,
  PHOTOBOOTH_CONTRAST_ALPHA,
  PHOTOBOOTH_BRIGHTNESS_BETA,
  HAND_CONNECTIONS,
} from "./config.js";
import { videoEl, canvas, ctx } from "./camera.js";
import { statusText, addToGallery, updateProgressBadge } from "./ui.js";

export let appState = "tracking"; // tracking | countdown | puzzle

export const puzzle = {
  boardBox: null,
  pieces: [],
  tileW: 0,
  tileH: 0,
  solved: false,
  fullPhotoboothCanvas: null,
};

export const armGate = { holding: false, since: 0 };

export const lastSeenFrame = { box: null, at: 0 };

export const countdown = {
  active: false,
  startedAt: 0,
};

export const drag = {
  activeHand: null,
  piece: null,
  offsetX: 0,
  offsetY: 0,
};

export const fistHold = { start: null };

export function resetPuzzleOnly() {
  puzzle.boardBox = null;
  puzzle.pieces = [];
  puzzle.solved = false;
  puzzle.fullPhotoboothCanvas = null;
  appState = "tracking";
  countdown.active = false;
  drag.activeHand = null;
  drag.piece = null;
  fistHold.start = null;
  armGate.holding = false;
  lastSeenFrame.box = null;
  lastSeenFrame.at = 0;
  updateProgressBadge(appState, puzzle);
}

export function dist2D(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function isPinching(landmarks) {
  return dist2D(landmarks[LM.THUMB_TIP], landmarks[LM.INDEX_TIP]) < PINCH_THRESHOLD;
}

export function isFist(landmarks) {
  const wrist = landmarks[LM.WRIST];
  const pairs = [
    [LM.INDEX_TIP, LM.INDEX_MCP],
    [LM.MIDDLE_TIP, LM.MIDDLE_MCP],
    [LM.RING_TIP, LM.RING_MCP],
    [LM.PINKY_TIP, LM.PINKY_MCP],
  ];
  let curled = 0;
  for (const [tipIdx, mcpIdx] of pairs) {
    if (dist2D(landmarks[tipIdx], wrist) < dist2D(landmarks[mcpIdx], wrist)) curled++;
  }
  return curled >= 4;
}

export function toPixel(landmarkNorm) {
  return { x: landmarkNorm.x * canvas.width, y: landmarkNorm.y * canvas.height };
}

export function mirrorLandmarkX(landmark) {
  return { x: 1 - landmark.x, y: landmark.y };
}

// Enquadramento dinâmico: retângulo entre os dois indicadores, que cresce
// ou encolhe conforme a distância entre as mãos.
export function computeHandFrame(indexTipA, indexTipB) {
  const a = toPixel(indexTipA);
  const b = toPixel(indexTipB);

  const minX = Math.min(a.x, b.x) - FRAME_PADDING;
  const maxX = Math.max(a.x, b.x) + FRAME_PADDING;
  const minY = Math.min(a.y, b.y) - FRAME_PADDING;
  const maxY = Math.max(a.y, b.y) + FRAME_PADDING;

  const x = Math.max(0, minX);
  const y = Math.max(0, minY);
  const width = Math.min(canvas.width, maxX) - x;
  const height = Math.min(canvas.height, maxY) - y;

  return { x, y, width, height };
}

export function startCountdown(frameBox) {
  puzzle.boardBox = { ...frameBox };
  appState = "countdown";
  countdown.active = true;
  countdown.startedAt = performance.now();
}

export function drawCountdownOverlay(box) {
  const elapsed = (performance.now() - countdown.startedAt) / 1000;
  const remaining = COUNTDOWN_SECONDS - elapsed;

  if (remaining <= 0) {
    finishCountdownAndCapture(box);
    return;
  }

  applyPhotoboothInsideBox(box);

  ctx.save();
  ctx.strokeStyle = NEON_PURPLE;
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x, box.y, box.width, box.height);

  const n = Math.ceil(remaining);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(box.x, box.y, box.width, box.height);

  ctx.font = `${Math.max(48, Math.min(box.width, box.height) * 0.4)}px 'IBM Plex Mono', monospace`;
  ctx.fillStyle = NEON_PURPLE;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), cx, cy);
  ctx.restore();

  statusText.textContent = `capturando em ${n}...`;
}

export function applyPhotoboothEffect(imageData) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    let v = gray * PHOTOBOOTH_CONTRAST_ALPHA + PHOTOBOOTH_BRIGHTNESS_BETA;
    v = Math.max(0, Math.min(255, v));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  return imageData;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function finishCountdownAndCapture(box) {
  countdown.active = false;

  const mirroredFrame = document.createElement("canvas");
  mirroredFrame.width = canvas.width;
  mirroredFrame.height = canvas.height;
  const mirroredCtx = mirroredFrame.getContext("2d");
  mirroredCtx.save();
  mirroredCtx.translate(mirroredFrame.width, 0);
  mirroredCtx.scale(-1, 1);
  mirroredCtx.drawImage(videoEl, 0, 0, mirroredFrame.width, mirroredFrame.height);
  mirroredCtx.restore();

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = Math.max(1, Math.round(box.width));
  cropCanvas.height = Math.max(1, Math.round(box.height));
  const cropCtx = cropCanvas.getContext("2d");
  cropCtx.drawImage(
    mirroredFrame,
    box.x, box.y, box.width, box.height,
    0, 0, cropCanvas.width, cropCanvas.height
  );

  const fullImageData = cropCtx.getImageData(0, 0, cropCanvas.width, cropCanvas.height);
  applyPhotoboothEffect(fullImageData);
  cropCtx.putImageData(fullImageData, 0, 0);

  puzzle.fullPhotoboothCanvas = cropCanvas;

  const tileW = Math.floor(cropCanvas.width / GRID);
  const tileH = Math.floor(cropCanvas.height / GRID);
  const pieces = [];

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const sx = col * tileW;
      const sy = row * tileH;
      const w = col === GRID - 1 ? cropCanvas.width - sx : tileW;
      const h = row === GRID - 1 ? cropCanvas.height - sy : tileH;

      const pieceCanvas = document.createElement("canvas");
      pieceCanvas.width = w;
      pieceCanvas.height = h;
      pieceCanvas.getContext("2d").drawImage(cropCanvas, sx, sy, w, h, 0, 0, w, h);

      pieces.push({
        row, col,
        canvas: pieceCanvas,
        w, h,
        x: 0, y: 0,
        slotRow: 0, slotCol: 0,
        placed: false,
        dragging: false,
      });
    }
  }

  const slots = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      slots.push({ row, col });
    }
  }
  shuffle(slots);

  pieces.forEach((piece, i) => {
    const slot = slots[i];
    piece.slotRow = slot.row;
    piece.slotCol = slot.col;
    piece.x = box.x + slot.col * tileW;
    piece.y = box.y + slot.row * tileH;
    piece.placed = slot.row === piece.row && slot.col === piece.col;
  });

  puzzle.boardBox = box;
  puzzle.pieces = pieces;
  puzzle.tileW = tileW;
  puzzle.tileH = tileH;
  puzzle.solved = pieces.every((p) => p.placed);
  appState = "puzzle";
  fistHold.start = null;
  updateProgressBadge(appState, puzzle);
}

export function findNearestPiece(px, py) {
  let best = null;
  let bestDist = Infinity;
  for (const piece of puzzle.pieces) {
    const cx = piece.x + piece.w / 2;
    const cy = piece.y + piece.h / 2;
    const d = Math.hypot(px - cx, py - cy);
    if (d < Math.max(piece.w, piece.h) * 0.75 && d < bestDist) {
      best = piece;
      bestDist = d;
    }
  }
  return best;
}

export function clampPieceToBoard(piece) {
  const box = puzzle.boardBox;
  piece.x = Math.min(Math.max(piece.x, box.x), box.x + box.width - piece.w);
  piece.y = Math.min(Math.max(piece.y, box.y), box.y + box.height - piece.h);
}

// Encaixe livre na grade: a peça solta é teleportada para a célula mais
// próxima do seu centro. Se a célula já tiver outra peça, elas trocam de lugar.
export function snapPieceToNearestSlot(piece) {
  const box = puzzle.boardBox;
  const tileW = puzzle.tileW;
  const tileH = puzzle.tileH;

  const cx = piece.x + piece.w / 2;
  const cy = piece.y + piece.h / 2;

  const targetCol = Math.min(GRID - 1, Math.max(0, Math.floor((cx - box.x) / tileW)));
  const targetRow = Math.min(GRID - 1, Math.max(0, Math.floor((cy - box.y) / tileH)));

  const originRow = piece.slotRow;
  const originCol = piece.slotCol;
  const originX = box.x + originCol * tileW;
  const originY = box.y + originRow * tileH;

  if (targetRow !== originRow || targetCol !== originCol) {
    const occupant = puzzle.pieces.find(
      (p) => p !== piece && p.slotRow === targetRow && p.slotCol === targetCol
    );
    if (occupant) {
      occupant.slotRow = originRow;
      occupant.slotCol = originCol;
      occupant.x = originX;
      occupant.y = originY;
      occupant.placed = originRow === occupant.row && originCol === occupant.col;
    }
  }

  piece.slotRow = targetRow;
  piece.slotCol = targetCol;
  piece.x = box.x + targetCol * tileW;
  piece.y = box.y + targetRow * tileH;
  piece.placed = targetRow === piece.row && targetCol === piece.col;
}

export function handleDragForHand(handLabel, pinching, indexPx) {
  if (pinching) {
    if (drag.activeHand === null) {
      const candidate = findNearestPiece(indexPx.x, indexPx.y);
      if (candidate) {
        drag.activeHand = handLabel;
        drag.piece = candidate;
        drag.offsetX = indexPx.x - candidate.x;
        drag.offsetY = indexPx.y - candidate.y;
        candidate.dragging = true;
      }
    } else if (drag.activeHand === handLabel && drag.piece) {
      const targetX = indexPx.x - drag.offsetX;
      const targetY = indexPx.y - drag.offsetY;
      drag.piece.x += (targetX - drag.piece.x) * DRAG_SMOOTHING;
      drag.piece.y += (targetY - drag.piece.y) * DRAG_SMOOTHING;
    }
  } else if (drag.activeHand === handLabel && drag.piece) {
    const piece = drag.piece;
    piece.dragging = false;
    clampPieceToBoard(piece);
    snapPieceToNearestSlot(piece);

    drag.activeHand = null;
    drag.piece = null;
    puzzle.solved = puzzle.pieces.every((p) => p.placed);
    updateProgressBadge(appState, puzzle);
  }
}

export function drawBoardAndPieces() {
  const box = puzzle.boardBox;

  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(173,70,255,0.18)";
  ctx.lineWidth = 1;
  for (let i = 1; i < GRID; i++) {
    ctx.beginPath();
    ctx.moveTo(box.x + i * puzzle.tileW, box.y);
    ctx.lineTo(box.x + i * puzzle.tileW, box.y + box.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(box.x, box.y + i * puzzle.tileH);
    ctx.lineTo(box.x + box.width, box.y + i * puzzle.tileH);
    ctx.stroke();
  }
  ctx.restore();

  const sorted = [...puzzle.pieces].sort((a, b) => (a.dragging ? 1 : 0) - (b.dragging ? 1 : 0));

  for (const piece of sorted) {
    ctx.save();
    if (piece.dragging) {
      ctx.shadowColor = "rgba(173,70,255,0.9)";
      ctx.shadowBlur = 14;
    }
    ctx.drawImage(piece.canvas, piece.x, piece.y, piece.w, piece.h);
    ctx.strokeStyle = piece.placed ? NEON_GREEN : CREAM;
    ctx.lineWidth = piece.dragging ? 3 : 1.5;
    ctx.strokeRect(piece.x, piece.y, piece.w, piece.h);
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = puzzle.solved ? NEON_GREEN : NEON_PURPLE;
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.restore();

  if (puzzle.solved) {
    ctx.save();
    ctx.fillStyle = "rgba(0,189,125,0.15)";
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.font = `${Math.max(18, box.width * 0.06)}px 'IBM Plex Mono', monospace`;
    ctx.fillStyle = NEON_GREEN;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("COMPLETO! PUNHO FECHADO PARA SALVAR", box.x + box.width / 2, box.y + box.height / 2);
    ctx.restore();

    if (fistHold.start !== null) {
      const elapsed = performance.now() - fistHold.start;
      const ratio = Math.min(1, elapsed / FIST_HOLD_MS);
      const barY = box.y + box.height + 10;
      ctx.save();
      ctx.fillStyle = NEON_PURPLE;
      ctx.fillRect(box.x, barY, box.width * ratio, 14);
      ctx.strokeStyle = NEON_GREEN;
      ctx.lineWidth = 2;
      ctx.strokeRect(box.x, barY, box.width, 14);
      ctx.restore();
    }
  }
}

export function applyPhotoboothInsideBox(box) {
  const x = Math.max(0, Math.round(box.x));
  const y = Math.max(0, Math.round(box.y));
  const w = Math.min(canvas.width - x, Math.round(box.width));
  const h = Math.min(canvas.height - y, Math.round(box.height));
  if (w <= 0 || h <= 0) return;

  const region = ctx.getImageData(x, y, w, h);
  applyPhotoboothEffect(region);
  ctx.putImageData(region, x, y);
}

export function drawLiveFrameOverlay(box) {
  ctx.save();
  ctx.strokeStyle = NEON_PURPLE;
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x, box.y, box.width, box.height);

  const cornerLen = 18;
  ctx.lineWidth = 4;
  const corners = [
    [box.x, box.y, 1, 1],
    [box.x + box.width, box.y, -1, 1],
    [box.x, box.y + box.height, 1, -1],
    [box.x + box.width, box.y + box.height, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + cornerLen * dy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + cornerLen * dx, cy);
    ctx.stroke();
  }
  ctx.restore();
}

export function isPointInBoard(px, py, box) {
  if (!box) return false;
  return (
    px >= box.x &&
    px <= box.x + box.width &&
    py >= box.y &&
    py <= box.y + box.height
  );
}

function drawHandSkeleton(landmarksPx) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(255,255,255,0.85)";
  ctx.shadowBlur = 10;
  ctx.strokeStyle = "white";
  ctx.lineWidth = 3;

  for (const [iA, iB] of HAND_CONNECTIONS) {
    const a = landmarksPx[iA];
    const b = landmarksPx[iB];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  ctx.shadowBlur = 6;
  ctx.fillStyle = "white";
  for (const p of landmarksPx) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function drawHandSkeletonsOverBoard(handsLandmarks, box) {
  if (!box || !handsLandmarks || handsLandmarks.length === 0) return;

  for (const lm of handsLandmarks) {
    const landmarksPx = lm.map((pt) => toPixel(mirrorLandmarkX(pt)));
    const overBoard = landmarksPx.some((p) => isPointInBoard(p.x, p.y, box));
    if (overBoard) {
      drawHandSkeleton(landmarksPx);
    }
  }
}

export function handleFistHoldAndSave(handsLandmarks) {
  const anyFist = handsLandmarks.some((lm) => isFist(lm));

  if (!anyFist) {
    fistHold.start = null;
    return;
  }

  if (fistHold.start === null) {
    fistHold.start = performance.now();
  }

  const elapsed = performance.now() - fistHold.start;
  if (elapsed >= FIST_HOLD_MS) {
    if (puzzle.fullPhotoboothCanvas) {
      addToGallery(puzzle.fullPhotoboothCanvas);
      statusText.textContent = "salvo na galeria!";
    }
    resetPuzzleOnly();
  }
}
