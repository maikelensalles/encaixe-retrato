from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

# O rastreamento de mãos (MediaPipe HandLandmarker) e toda a lógica do
# puzzle rodam inteiramente no navegador (app.js). Este backend serve
# apenas os arquivos estáticos da aplicação — não há processamento de
# vídeo nem WebSocket no servidor.
app = FastAPI(title="Motion Puzzle - AR Booth")

app.mount("/", StaticFiles(directory=".", html=True), name="static")
