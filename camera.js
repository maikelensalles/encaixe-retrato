export const videoEl = document.getElementById("webcam");
export const canvas = document.getElementById("sceneCanvas");
export const ctx = canvas.getContext("2d", { willReadFrequently: true });

export function fitCanvasToWindow() {
  const stageEl = document.getElementById("stage");
  const vw = stageEl.clientWidth;
  const vh = stageEl.clientHeight;

  // Usa as dimensões originais reais do vídeo da webcam
  const videoW = videoEl.videoWidth || 1280;
  const videoH = videoEl.videoHeight || 720;

  canvas.width = videoW;
  canvas.height = videoH;

  // Escala "contain" (sem corte, pode sobrar borda) e "cover" (preenche tudo, corta o excesso).
  const scaleContain = Math.min(vw / videoW, vh / videoH);
  const scaleCover = Math.max(vw / videoW, vh / videoH);

  // Quando a proporção da câmera diverge muito da proporção da tela
  // (ex: câmera 16:9 numa tela de celular em retrato), um "cover" puro
  // corta demais as laterais e o usuário precisa se afastar para caber
  // no quadro. Limitamos o zoom a um fator sobre o "contain" para manter
  // um campo de visão confortável, aceitando uma leve sobra nas bordas.
  const MAX_ZOOM_OVER_CONTAIN = 1.25;
  const scale = Math.min(scaleCover, scaleContain * MAX_ZOOM_OVER_CONTAIN);

  const cssWidth = videoW * scale;
  const cssHeight = videoH * scale;

  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
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
  const idealAspectRatio = window.innerWidth / window.innerHeight;

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
