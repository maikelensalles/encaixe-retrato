# 🧩 Encaixe Retrato <p align="center">
  <a href="https://encaixe-retrato.web.app" target="_blank">
    <img src="https://img.shields.io/badge/🚀_TESTE_AGORA_NA_WEB-39FF14?style=for-the-badge&color=AD46FF&labelColor=#AD46FF" alt="Teste agora na web">
  </a>
</p>

Uma cabine de fotos interativa de Realidade Aumentada (AR) controlada inteiramente por gestos no ar. 

Onde o design encontra a visão computacional: O reconhecimento de mãos e a lógica do quebra-cabeça rodam em um backend robusto em Python (OpenCV + MediaPipe), transmitindo a experiência visual em tempo real para uma interface web imersiva e leve.

**Engenharia e Design por [Maikelen Salles](https://maikelen-dev.web.app/)** 

<br>



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
Como o projeto é uma aplicação estática (Serverless), rodar o projeto localmente é extremamente simples:

### 1. Clonar o ecossistema
```bash
git clone https://github.com/maikelensalles/encaixe-retrato.git
cd encaixe-retrato
```

### 2. Rodar localmente
Você pode usar qualquer servidor estático de sua preferência.

Usando Node.js (npx):

```bash
npx serve
```
Ou usando a extensão Live Server no VSCode.

### 3. Abrir no navegador

```bash
Acesse o link gerado no terminal (geralmente http://localhost:3000 ou 8000). Permita o acesso à câmera quando o navegador solicitar
```

---

## **📂 ESTRUTURA DO PROJETO**

```
encaixe-retrato/
├── index.html       # Interface web (UI e overlay da câmera)
├── app.js           # Lógica do MediaPipe, controle de gestos e física do Canvas
├── css/
│   └── styles.css   # Tema Neon Cyberpunk responsivo (Desktop & Mobile)
└── README.md
```

---

## **🖐 GESTOS DE CONTROLE**

| Gesto | Ação |
|---|---|
| Duas mãos com os indicadores afastados | Enquadramento dinâmico do quadro de captura |
| Pinça com as duas mãos | Congela o quadro e inicia a contagem regressiva |
| Pinça com uma mão sobre uma peça | Arrasta a peça do quebra-cabeça |
| Soltar a pinça | Encaixa a peça na célula mais próxima da grade (trocando com quem estiver lá) |
| Punho fechado (segurar ~1,5s) | Salva o quebra-cabeça completo na galeria e reinicia |

---

## **🧠 LÓGICA DA APLICAÇÃO**

1. Mostre as duas mãos à câmera — o quadro roxo neon acompanha a distância entre os indicadores.
2. Feche a pinça com as duas mãos e segure para iniciar a contagem regressiva.
3. A foto é capturada, recebe o efeito fotomatón e é fatiada em um quebra-cabeça 3x3.
4. Reorganize as peças com gestos de pinça — cada peça solta se encaixa na célula mais próxima.
5. Ao completar o quebra-cabeça, feche o punho e segure para salvar na galeria.
6. Baixe a tira de fotos quando tiver 3 quebra-cabeças salvos, ou reinicie o sistema a qualquer momento.

---

## **💻 STACK TECNOLÓGICO**

- **JavaScript (vanilla)** — Controle de estado e física, sem frameworks
- **MediaPipe Tasks Vision** — IA de detecção de mãos carregada via CDN e executada na GPU do usuário
- **HTML5 Canvas & getUserMedia API** — Captura de vídeo nativa e manipulação de pixels em tempo real com alta definição (DPR adjustment)
- **CSS3 Custom Properties** — Sistema de design responsivo com Media Queries adaptadas para Mobile

Todo o processamento de visão computacional roda diretamente no navegador, garantindo total privacidade (nenhuma imagem é enviada a servidores externos)

---

## **⚠️ GUIA DE SOLUÇÃO DE PROBLEMAS**

### **O carregamento da IA trava no infinito**

Certifique-se de estar conectado à internet, pois o navegador precisa baixar o modelo do MediaPipe (.task) e o runtime WASM na primeira execução.

### **Permissão de câmera negada**

Verifique se você não bloqueou o acesso acidentalmente. No ícone de cadeado ao lado da barra de endereço do navegador, permita o uso da câmera e recarregue a página.

### **O gesto de pinça não é detectado**

Garanta boa iluminação e que ambas as mãos estejam visíveis para a câmera. Aproxime bem a ponta do indicador e do polegar.

### **A câmera não liga (Erro NotAllowedError / NotFoundError)**

Confirme se o site está rodando em um ambiente seguro (localhost ou protocolo https://). Navegadores bloqueiam câmeras em HTTP comum.

---

## **📱 COMPATIBILIDADE DE NAVEGADORES**

| Navegador | Suporte |
|---|---|
| Chrome / Edge | Recomendado |
| Firefox | Compatível |
| Safari | Compatível |

---

## **AUTORA**

Feito por **Maikelen** — [maikelen-dev.web.app](https://maikelen-dev.web.app/)

---

## **LICENÇA**

MIT — livre para usar, modificar e compartilhar.
