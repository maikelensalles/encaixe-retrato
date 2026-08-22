# 🧩 Motion Puzzle

Uma cabine de fotos interativa de Realidade Aumentada (AR) controlada inteiramente por gestos no ar. 

Onde o design encontra a visão computacional: O reconhecimento de mãos e a lógica do quebra-cabeça rodam em um backend robusto em Python (OpenCV + MediaPipe), transmitindo a experiência visual em tempo real para uma interface web imersiva e leve.

**Engenharia e Design por [Maikelen Salles](https://maikelen-dev.web.app/)** 

**[Teste agora na web](https://motion-puzzle.onrender.com)** 


---

## ⚡ **A EXPERIÊNCIA**

O **Motion Puzzle** transforma a sua webcam em um ambiente interativo. Usando a distância entre os dedos indicadores das duas mãos, você "desenha" dinamicamente um quadro neon no ar. 

Ao fechar um gesto de pinça com as duas mãos, a área é capturada, recebe um filtro vintage de fotomatón e é fatiada em um quebra-cabeça 3x3. A partir daí, a tela é sua: reorganize as peças flutuantes com os dedos e, ao completar o desafio, feche o punho para salvar sua obra na galeria lateral. Sem cliques, sem mouse, apenas movimento.

---

## 🛠 **REQUISITOS DO SISTEMA**

- **Sistema Operacional:** macOS (integrado nativamente com `AVFoundation` para captura de hardware)
- **Engine:** Python 3.9+
- **Hardware:** Webcam
- **Interface:** Chrome, Edge ou Firefox (o navegador atua apenas como um "vidro" de exibição; 100% da inteligência artificial roda no backend)

---

## 🚀 **STARTUP E CONFIGURAÇÃO**

### 1. Clonar o ecossistema
```bash
git clone [https://github.com/maikelensalles/motion-puzzle.git](https://github.com/maikelensalles/motion-puzzle.git)
cd motion-puzzle
```

### 2. Instalar as dependências

```bash
pip install fastapi uvicorn opencv-python mediapipe numpy python-multipart
```

### 3. Iniciar o servidor

```bash
uvicorn app:app --reload --port 8000
```

### 4. Abrir no navegador

```
http://localhost:8000
```

Permita o acesso à câmera quando o sistema operacional solicitar (o backend acessa a webcam diretamente).

---

## **ESTRUTURA DO PROJETO**

```
Puzzle/
├── app.py             # Backend FastAPI: captura, MediaPipe, streaming MJPEG e API
├── index.html          # Interface web (consome o stream de vídeo)
├── app.js               # Polling de status/galeria e ações da UI
├── css/
│   └── styles.css       # Tema Neon Cyberpunk
└── .gitignore
```

---

## **GESTOS DE CONTROLE**

| Gesto | Ação |
|---|---|
| Duas mãos com os indicadores afastados | Enquadramento dinâmico do quadro de captura |
| Pinça com as duas mãos | Congela o quadro e inicia a contagem regressiva |
| Pinça com uma mão sobre uma peça | Arrasta a peça do quebra-cabeça |
| Soltar a pinça | Encaixa a peça na célula mais próxima da grade (trocando com quem estiver lá) |
| Punho fechado (segurar ~1,5s) | Salva o quebra-cabeça completo na galeria e reinicia |

---

## **LÓGICA DA APLICAÇÃO**

1. Mostre as duas mãos à câmera — o quadro roxo neon acompanha a distância entre os indicadores.
2. Feche a pinça com as duas mãos e segure para iniciar a contagem regressiva.
3. A foto é capturada, recebe o efeito fotomatón e é fatiada em um quebra-cabeça 3x3.
4. Reorganize as peças com gestos de pinça — cada peça solta se encaixa na célula mais próxima.
5. Ao completar o quebra-cabeça, feche o punho e segure para salvar na galeria.
6. Baixe a tira de fotos quando tiver 3 quebra-cabeças salvos, ou reinicie o sistema a qualquer momento.

---

## **STACK TECNOLÓGICO**

- **Python** + **OpenCV** — captura de câmera (`AVFoundation`) e composição visual
- **MediaPipe Hands** — detecção dos landmarks das mãos
- **FastAPI** — API HTTP e streaming MJPEG (`/video_feed`, `/status`, `/capture`, `/reset`)
- **JavaScript (vanilla)** — interface web, sem frameworks
- **CSS Custom Properties** — tema Neon Cyberpunk

Todo o processamento de visão computacional roda no backend; o navegador apenas exibe o vídeo (`<img>`) e consome a API.

---

## **GUIA DE SOLUÇÃO DE PROBLEMAS**

### **A câmera não liga**

Verifique se nenhum outro aplicativo (Teams, Zoom, Discord, etc.) está usando a câmera em segundo plano, e se o terminal/IDE tem permissão de câmera concedida em Preferências do Sistema → Privacidade.

### **A página mostra "stream de vídeo indisponível"**

Confirme que o servidor `uvicorn` está rodando e acessível em `http://localhost:8000`.

### **O gesto de pinça não é detectado**

Garanta boa iluminação e que ambas as mãos estejam visíveis para a câmera. Aproxime bem a ponta do indicador e do polegar.

### **A galeria não atualiza**

A interface consulta `/status` e `/capture` periodicamente — verifique o console do navegador e os logs do backend para erros de conexão.

---

## **COMPATIBILIDADE DE NAVEGADORES**

| Navegador | Suporte |
|---|---|
| Chrome / Edge | Recomendado |
| Firefox | Compatível |
| Safari | Compatível |
| Mobile | Limitado (recomendado em desktop) |

---

## **AUTORA**

Feito por **Maikelen** — [maikelen-dev.web.app](https://maikelen-dev.web.app/)

---

## **LICENÇA**

MIT — livre para usar, modificar e compartilhar.
