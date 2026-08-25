export const videoEl = document.getElementById("webcam");
export const canvas = document.getElementById("sceneCanvas");
export const ctx = canvas.getContext("2d", { willReadFrequently: true });

export function fitCanvasToWindow() {
  const videoW = videoEl.videoWidth || 1280;
  const videoH = videoEl.videoHeight || 720;

  // A resolução interna do canvas acompanha a resolução nativa da câmera
  // (usada pelo mediapipe e pelo crop do puzzle). O preenchimento visual
  // de tela cheia, sem tarjas, é feito via CSS (object-fit: cover).
  canvas.width = videoW;
  canvas.height = videoH;
}

window.addEventListener("resize", fitCanvasToWindow);

export async function initWebcam() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Este navegador não suporta getUserMedia.");
  }
  // Pede a câmera já na proporção da tela do usuário: em celulares (retrato),
  // isso faz o sensor entregar vídeo vertical nativamente, evitando o corte
  // agressivo das laterais que acontecia ao forçar sempre 1920x1080 (16:9 landscape).
  const isPortrait = window.innerHeight >= window.innerWidth;
  // Proporção real da tela do usuário: orienta o navegador a buscar no
  // hardware a lente/resolução mais próxima do formato físico da tela,
  // reduzindo ao máximo o zoom artificial do object-fit: cover.
  const aspect = window.innerHeight / window.innerWidth;
  const idealAspectRatio = isPortrait ? aspect : 1 / aspect;

  const videoConstraints = isPortrait
    ? {
        width: { ideal: 720 },
        height: { ideal: 1280 },
        aspectRatio: { ideal: idealAspectRatio },
        frameRate: { ideal: 30 },
        facingMode: "user",
      }
    : {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        aspectRatio: { ideal: idealAspectRatio },
        frameRate: { ideal: 30 },
        facingMode: "user",
      };

  const stream = await navigator.mediaDevices.getUserMedia({
    video: videoConstraints,
    audio: false,
  });
  videoEl.srcObject = stream;

  // Garante que o vídeo começou a reproduzir e tem dimensões válidas
  await new Promise((resolve) => {
    videoEl.onloadedmetadata = () => {
      videoEl.play().then(resolve).catch(resolve);
    };
  });

  // Pequeno loop de segurança caso o navegador demare alguns milissegundos para renderizar os pixels
  while (videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
    await new Promise((r) => setTimeout(r, 50));
  }

  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  console.log(`Resolução real da câmera: ${videoEl.videoWidth} x ${videoEl.videoHeight}`);
  fitCanvasToWindow();
}
