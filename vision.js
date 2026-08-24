import {
  FilesetResolver,
  HandLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

import { LOAD_TIMEOUT_MS } from "./config.js";

function withTimeout(promise, ms, timeoutMessage) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function initHandLandmarker() {
  const vision = await withTimeout(
    FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    ),
    LOAD_TIMEOUT_MS,
    "Tempo esgotado ao carregar o runtime do MediaPipe (WASM). Verifique sua conexão ou se cdn.jsdelivr.net está bloqueado."
  );

  try {
    return await withTimeout(
      HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "video",
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      }),
      LOAD_TIMEOUT_MS,
      "Tempo esgotado baixando o modelo HandLandmarker (~10MB) com GPU."
    );
  } catch (gpuErr) {
    console.warn("[Encaixe Retrato] Falhou com delegate GPU, tentando CPU…", gpuErr);
  }

  return withTimeout(
    HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "CPU",
      },
      runningMode: "video",
      numHands: 2,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
    }),
    LOAD_TIMEOUT_MS,
    "Tempo esgotado baixando o modelo HandLandmarker (~10MB) mesmo via CPU. Verifique sua conexão ou se storage.googleapis.com está bloqueado."
  );
}
