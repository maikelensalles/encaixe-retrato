import base64
import json
import math
import random
import time

import cv2
import mediapipe as mp
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

# ------------------------------------------------------------------
# Cores do tema Neon Cyberpunk (BGR, para desenhar com OpenCV)
# ------------------------------------------------------------------
NEON_PURPLE = (255, 70, 173)   # #AD46FF
NEON_GREEN = (125, 189, 0)     # #00bd7d
CREAM = (234, 229, 214)

GRID_SIZE = 3
GALLERY_MAX = 3
FIST_HOLD_SECONDS = 1.5
PINCH_THRESHOLD = 0.05
DRAG_SMOOTHING = 0.6
FRAME_PADDING = 40
MIN_BOX_SIZE = 140
ARM_HOLD_SECONDS = 0.3  # tempo de pinça dupla sustentada antes de iniciar o countdown

mp_hands = mp.solutions.hands
mp_draw = mp.solutions.drawing_utils


def dist(p1, p2):
    return math.hypot(p1[0] - p2[0], p1[1] - p2[1])


def aplicar_efeito_foto(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    contrast = cv2.convertScaleAbs(gray, alpha=1.3, beta=10)
    return cv2.cvtColor(contrast, cv2.COLOR_GRAY2BGR)


def is_fist(landmarks):
    wrist = landmarks[0]
    tip_ids = (8, 12, 16, 20)
    pip_ids = (6, 10, 14, 18)
    curled = 0
    for tip_id, pip_id in zip(tip_ids, pip_ids):
        tip = landmarks[tip_id]
        pip = landmarks[pip_id]
        d_tip = dist((tip.x, tip.y), (wrist.x, wrist.y))
        d_pip = dist((pip.x, pip.y), (wrist.x, wrist.y))
        if d_tip < d_pip:
            curled += 1
    return curled >= 4


def compute_dynamic_box(px_a, px_b, w, h, padding=FRAME_PADDING):
    """Enquadramento dinâmico: retângulo entre os dois indicadores, que
    cresce ou encolhe conforme a distância entre as mãos."""
    min_x = min(px_a[0], px_b[0]) - padding
    max_x = max(px_a[0], px_b[0]) + padding
    min_y = min(px_a[1], px_b[1]) - padding
    max_y = max(px_a[1], px_b[1]) + padding

    x1 = max(0, int(min_x))
    y1 = max(0, int(min_y))
    x2 = min(w, int(max_x))
    y2 = min(h, int(max_y))
    return x1, y1, x2, y2


def to_px(landmark, w, h):
    return (int(landmark.x * w), int(landmark.y * h))


def encode_jpeg(img, quality=80):
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        return None
    return buf.tobytes()


def to_b64_jpeg(img, quality=90):
    raw = encode_jpeg(img, quality)
    if raw is None:
        return None
    return base64.b64encode(raw).decode("ascii")


def build_puzzle_pieces(captured_roi, bx, by, bw, bh):
    tile_w = bw // GRID_SIZE
    tile_h = bh // GRID_SIZE
    pieces = []
    slots = []

    for row in range(GRID_SIZE):
        for col in range(GRID_SIZE):
            sx = col * tile_w
            sy = row * tile_h
            tw = bw - sx if col == GRID_SIZE - 1 else tile_w
            th = bh - sy if row == GRID_SIZE - 1 else tile_h

            piece_img = captured_roi[sy:sy + th, sx:sx + tw].copy()
            pieces.append({
                "row": row, "col": col,
                "img": piece_img,
                "w": tw, "h": th,
                "correct_x": bx + sx,
                "correct_y": by + sy,
                "current_x": 0, "current_y": 0,
                "slot_row": 0, "slot_col": 0,
                "placed": False,
            })
            slots.append((row, col))

    random.shuffle(slots)
    for i, piece in enumerate(pieces):
        slot_row, slot_col = slots[i]
        piece["slot_row"] = slot_row
        piece["slot_col"] = slot_col
        piece["current_x"] = bx + slot_col * tile_w
        piece["current_y"] = by + slot_row * tile_h
        piece["placed"] = (slot_row == piece["row"] and slot_col == piece["col"])

    return pieces


# ------------------------------------------------------------------
# Sessão por conexão: cada cliente envia seus próprios frames da câmera
# (getUserMedia no navegador), então cada WebSocket tem seu próprio
# estado de jogo e sua própria instância do MediaPipe Hands — evita
# misturar o rastreamento de mãos entre visitantes diferentes.
# ------------------------------------------------------------------
class PuzzleSession:
    def __init__(self):
        self.hands = mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=2,
            min_detection_confidence=0.6,
            min_tracking_confidence=0.6,
        )
        self.app_state = "tracking"  # tracking | countdown | puzzle
        self.countdown_start = 0
        self.arm_start = None
        self.board_box = None
        self.puzzle_pieces = []
        self.last_captured_roi = None
        self.active_piece = None
        self.drag_offset_x = 0
        self.drag_offset_y = 0
        self.fist_start = None
        self.gallery = []  # [{ "id", "image": base64 jpg, "tiles": [base64, ...] }]
        self.gallery_dirty = True

    def close(self):
        self.hands.close()

    def save_completed_capture(self):
        if self.last_captured_roi is None:
            return
        tiles_b64 = []
        for piece in sorted(self.puzzle_pieces, key=lambda p: (p["row"], p["col"])):
            b64 = to_b64_jpeg(piece["img"])
            if b64:
                tiles_b64.append(b64)

        full_b64 = to_b64_jpeg(self.last_captured_roi)
        if full_b64 is None:
            return

        self.gallery.append({
            "id": int(time.time() * 1000),
            "image": full_b64,
            "tiles": tiles_b64,
        })
        if len(self.gallery) > GALLERY_MAX:
            self.gallery.pop(0)
        self.gallery_dirty = True

    def reset(self):
        self.app_state = "tracking"
        self.countdown_start = 0
        self.arm_start = None
        self.board_box = None
        self.puzzle_pieces = []
        self.last_captured_roi = None
        self.active_piece = None
        self.fist_start = None

    def reset_all(self):
        self.reset()
        self.gallery = []
        self.gallery_dirty = True

    def status_payload(self):
        placed = sum(1 for p in self.puzzle_pieces if p["placed"])
        total = len(self.puzzle_pieces)
        payload = {
            "type": "status",
            "state": self.app_state,
            "placed": placed,
            "total": total,
            "solved": total > 0 and placed == total,
        }
        if self.gallery_dirty:
            payload["captures"] = self.gallery
            self.gallery_dirty = False
        return payload


FONT = cv2.FONT_HERSHEY_SIMPLEX


def process_frame(session: PuzzleSession, frame):
    """Processa um frame enviado pelo navegador (imagem já em BGR/OpenCV):
    roda o MediaPipe Hands, avança a máquina de estado do puzzle e desenha
    o overlay Neon Cyberpunk. Retorna o frame processado."""
    frame = cv2.flip(frame, 1)  # espelha, como uma webcam frontal
    h, w, _ = frame.shape

    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = session.hands.process(rgb_frame)
    hands_detected = results.multi_hand_landmarks

    cv2.putText(frame, "MOTION PUZZLE - AR BOOTH", (40, 50), FONT, 0.7, NEON_GREEN, 2, cv2.LINE_AA)

    state = session.app_state

    if state == "tracking":
        local_status = "Posicione 2 maos para enquadrar"

        if hands_detected and len(hands_detected) == 2:
            for hand_lms in hands_detected:
                mp_draw.draw_landmarks(frame, hand_lms, mp_hands.HAND_CONNECTIONS)

            lm0 = hands_detected[0].landmark[8]
            lm1 = hands_detected[1].landmark[8]
            px_a = to_px(lm0, w, h)
            px_b = to_px(lm1, w, h)

            x1, y1, x2, y2 = compute_dynamic_box(px_a, px_b, w, h)
            box_w, box_h = x2 - x1, y2 - y1

            if box_w >= MIN_BOX_SIZE and box_h >= MIN_BOX_SIZE:
                cv2.rectangle(frame, (x1, y1), (x2, y2), NEON_PURPLE, 3)
                cv2.circle(frame, px_a, 8, NEON_PURPLE, -1)
                cv2.circle(frame, px_b, 8, NEON_PURPLE, -1)

                pincando_0 = dist((hands_detected[0].landmark[4].x, hands_detected[0].landmark[4].y),
                                   (lm0.x, lm0.y)) < PINCH_THRESHOLD
                pincando_1 = dist((hands_detected[1].landmark[4].x, hands_detected[1].landmark[4].y),
                                   (lm1.x, lm1.y)) < PINCH_THRESHOLD

                if pincando_0 and pincando_1:
                    if session.arm_start is None:
                        session.arm_start = cv2.getTickCount()
                    armed_elapsed = (cv2.getTickCount() - session.arm_start) / cv2.getTickFrequency()
                    local_status = "segure a pinça..."

                    if armed_elapsed >= ARM_HOLD_SECONDS:
                        session.app_state = "countdown"
                        session.countdown_start = cv2.getTickCount()
                        session.board_box = (x1, y1, box_w, box_h)
                        session.arm_start = None
                else:
                    session.arm_start = None
                    local_status = "pinça dupla para capturar"
            else:
                session.arm_start = None
        else:
            session.arm_start = None

        cv2.putText(frame, local_status, (40, 90), FONT, 0.5, CREAM, 1, cv2.LINE_AA)

    elif state == "countdown":
        elapsed = (cv2.getTickCount() - session.countdown_start) / cv2.getTickFrequency()
        remaining = 3 - int(elapsed)
        bx, by, bw, bh = session.board_box

        if remaining > 0:
            cv2.rectangle(frame, (bx, by), (bx + bw, by + bh), NEON_PURPLE, 3)
            cv2.putText(frame, f"CAPTURANDO EM {remaining}...", (bx + 20, by + bh // 2), FONT, 1.1,
                        NEON_PURPLE, 3, cv2.LINE_AA)
        else:
            captured_roi = frame[by:by + bh, bx:bx + bw].copy()
            captured_roi = aplicar_efeito_foto(captured_roi)
            session.last_captured_roi = captured_roi
            session.puzzle_pieces = build_puzzle_pieces(captured_roi, bx, by, bw, bh)
            session.app_state = "puzzle"
            session.fist_start = None

    elif state == "puzzle":
        cv2.putText(frame, "ORGANIZE O PUZZLE COM PINCA", (40, 90), FONT, 0.5, NEON_GREEN, 1, cv2.LINE_AA)

        bx, by, bw, bh = session.board_box
        cv2.rectangle(frame, (bx, by), (bx + bw, by + bh), (0, 0, 0), -1)

        pinching = False
        index_px = (0, 0)

        if hands_detected:
            for hand_lms in hands_detected:
                mp_draw.draw_landmarks(frame, hand_lms, mp_hands.HAND_CONNECTIONS)

            first_hand = hands_detected[0].landmark
            index_tip = first_hand[8]
            thumb_tip = first_hand[4]

            index_px = to_px(index_tip, w, h)
            pinching = dist((thumb_tip.x, thumb_tip.y), (index_tip.x, index_tip.y)) < PINCH_THRESHOLD

        if pinching:
            if session.active_piece is None:
                best_piece = None
                best_dist = None
                for piece in session.puzzle_pieces:
                    if piece["placed"]:
                        continue
                    px, py, pw, ph = piece["current_x"], piece["current_y"], piece["w"], piece["h"]
                    if px <= index_px[0] <= px + pw and py <= index_px[1] <= py + ph:
                        center = (px + pw / 2, py + ph / 2)
                        d = dist(index_px, center)
                        if best_dist is None or d < best_dist:
                            best_dist = d
                            best_piece = piece

                if best_piece is not None:
                    session.active_piece = best_piece
                    session.drag_offset_x = index_px[0] - best_piece["current_x"]
                    session.drag_offset_y = index_px[1] - best_piece["current_y"]
            else:
                active_piece = session.active_piece
                target_x = index_px[0] - session.drag_offset_x
                target_y = index_px[1] - session.drag_offset_y
                active_piece["current_x"] = int(active_piece["current_x"] + (target_x - active_piece["current_x"]) * DRAG_SMOOTHING)
                active_piece["current_y"] = int(active_piece["current_y"] + (target_y - active_piece["current_y"]) * DRAG_SMOOTHING)
        else:
            if session.active_piece is not None:
                active_piece = session.active_piece
                tile_w = bw // GRID_SIZE
                tile_h = bh // GRID_SIZE

                cx = active_piece["current_x"] + active_piece["w"] / 2
                cy = active_piece["current_y"] + active_piece["h"] / 2

                target_col = min(GRID_SIZE - 1, max(0, int((cx - bx) // tile_w)))
                target_row = min(GRID_SIZE - 1, max(0, int((cy - by) // tile_h)))

                origin_row = active_piece["slot_row"]
                origin_col = active_piece["slot_col"]
                origin_x = bx + origin_col * tile_w
                origin_y = by + origin_row * tile_h

                occupant = None
                if target_row != origin_row or target_col != origin_col:
                    for piece in session.puzzle_pieces:
                        if piece is active_piece:
                            continue
                        if piece["slot_row"] == target_row and piece["slot_col"] == target_col:
                            occupant = piece
                            break

                if occupant is not None:
                    occupant["slot_row"], occupant["slot_col"] = origin_row, origin_col
                    occupant["current_x"] = origin_x
                    occupant["current_y"] = origin_y
                    occupant["placed"] = (origin_row == occupant["row"] and origin_col == occupant["col"])

                active_piece["slot_row"] = target_row
                active_piece["slot_col"] = target_col
                active_piece["current_x"] = bx + target_col * tile_w
                active_piece["current_y"] = by + target_row * tile_h
                active_piece["placed"] = (target_row == active_piece["row"] and target_col == active_piece["col"])

                session.active_piece = None

        for piece in session.puzzle_pieces:
            px, py = piece["current_x"], piece["current_y"]
            pw, ph = piece["w"], piece["h"]

            px = max(bx, min(px, bx + bw - pw))
            py = max(by, min(py, by + bh - ph))
            piece["current_x"], piece["current_y"] = px, py

            frame[py:py + ph, px:px + pw] = piece["img"]

            borda_color = NEON_GREEN if piece["placed"] else CREAM
            if piece is session.active_piece:
                borda_color = NEON_PURPLE

            cv2.rectangle(frame, (px, py), (px + pw, py + ph), borda_color, 2)

        cv2.rectangle(frame, (bx, by), (bx + bw, by + bh), NEON_PURPLE, 3)

        solved = all(p["placed"] for p in session.puzzle_pieces)
        if solved:
            cv2.putText(frame, "COMPLETO! PUNHO FECHADO PARA SALVAR", (bx, by - 15), FONT, 0.6, NEON_GREEN, 2, cv2.LINE_AA)

            fist_now = bool(hands_detected) and any(is_fist(hl.landmark) for hl in hands_detected)

            if fist_now:
                if session.fist_start is None:
                    session.fist_start = cv2.getTickCount()
                fist_elapsed = (cv2.getTickCount() - session.fist_start) / cv2.getTickFrequency()

                bar_w = int(bw * min(fist_elapsed / FIST_HOLD_SECONDS, 1.0))
                cv2.rectangle(frame, (bx, by + bh + 10), (bx + bar_w, by + bh + 25), NEON_PURPLE, -1)
                cv2.rectangle(frame, (bx, by + bh + 10), (bx + bw, by + bh + 25), NEON_GREEN, 2)

                if fist_elapsed >= FIST_HOLD_SECONDS:
                    session.save_completed_capture()
                    session.app_state = "tracking"
                    session.puzzle_pieces = []
                    session.board_box = None
                    session.active_piece = None
                    session.fist_start = None
            else:
                session.fist_start = None

    return frame


app = FastAPI(title="Motion Puzzle - AR Booth")


@app.websocket("/ws")
async def puzzle_ws(websocket: WebSocket):
    await websocket.accept()
    session = PuzzleSession()

    try:
        while True:
            message = await websocket.receive()

            if message.get("bytes") is not None:
                data = message["bytes"]
                np_buf = np.frombuffer(data, dtype=np.uint8)
                frame = cv2.imdecode(np_buf, cv2.IMREAD_COLOR)
                if frame is None:
                    continue

                processed = process_frame(session, frame)
                jpg = encode_jpeg(processed)
                if jpg is not None:
                    await websocket.send_bytes(jpg)
                await websocket.send_text(json.dumps(session.status_payload()))

            elif message.get("text") is not None:
                try:
                    cmd = json.loads(message["text"])
                except ValueError:
                    continue

                cmd_type = cmd.get("type")
                if cmd_type == "reset":
                    session.reset()
                    session.gallery_dirty = True
                    await websocket.send_text(json.dumps(session.status_payload()))
                elif cmd_type == "reset_all":
                    session.reset_all()
                    await websocket.send_text(json.dumps(session.status_payload()))

    except WebSocketDisconnect:
        pass
    finally:
        session.close()


app.mount("/", StaticFiles(directory=".", html=True), name="static")
