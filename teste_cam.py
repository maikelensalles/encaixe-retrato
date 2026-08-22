import cv2
import math
import random
import mediapipe as mp
import numpy as np

# Inicializa o MediaPipe Hands
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=2,
    min_detection_confidence=0.6,
    min_tracking_confidence=0.6
)
mp_draw = mp.solutions.drawing_utils

# Inicializa a câmera nativa do Mac (AVFoundation, buffer mínimo para reduzir latência)
cap = cv2.VideoCapture(0, cv2.CAP_AVFOUNDATION)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
cap.set(cv2.CAP_PROP_FPS, 60)
cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

NEON_PURPLE = (255, 70, 173)
NEON_GREEN = (125, 189, 0)

app_state = "tracking"
countdown_start = 0
board_box = None
puzzle_pieces = []
grid_size = 3
last_captured_roi = None

# Variáveis de controle de arraste (Drag and Drop)
active_piece = None
drag_offset_x = 0
drag_offset_y = 0
DRAG_SMOOTHING = 0.6  # suaviza o movimento da peça agarrada sem introduzir lag perceptível

# Variáveis do gesto de reinício (punho fechado)
fist_start = None
FIST_HOLD_SECONDS = 1.5

def dist(p1, p2):
    return math.hypot(p1[0] - p2[0], p1[1] - p2[1])

def aplicar_efeito_foto(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    contrast = cv2.convertScaleAbs(gray, alpha=1.3, beta=10)
    return cv2.cvtColor(contrast, cv2.COLOR_GRAY2BGR)

def is_fist(landmarks):
    """Retorna True se ao menos 4 dedos (indicador, medio, anelar, minimo)
    estiverem curvados em direcao a palma (ponta mais perto do pulso que a
    articulacao intermediaria)."""
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

print("[Motion Puzzle] Sistema pronto. Use pinça dupla para iniciar o puzzle!")

while True:
    ret, frame = cap.read()
    if not ret:
        break

    frame = cv2.flip(frame, 1) # Espelho
    h, w, _ = frame.shape
    
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = hands.process(rgb_frame)

    box_x1, box_y1, box_x2, box_y2 = int(w * 0.3), int(h * 0.2), int(w * 0.7), int(h * 0.8)
    
    cv2.rectangle(frame, (box_x1, box_y1), (box_x2, box_y2), NEON_PURPLE, 3)

    font = cv2.FONT_HERSHEY_SIMPLEX
    cv2.putText(frame, "MOTION PUZZLE - NATIVO", (40, 50), font, 0.7, NEON_GREEN, 2, cv2.LINE_AA)

    hands_detected = results.multi_hand_landmarks

    if app_state == "tracking":
        cv2.putText(frame, "Posicione 2 maos e faca PINCA para capturar", (40, 90), font, 0.5, (234, 229, 214), 1, cv2.LINE_AA)
        
        if hands_detected and len(hands_detected) == 2:
            for hand_lms in hands_detected:
                mp_draw.draw_landmarks(frame, hand_lms, mp_hands.HAND_CONNECTIONS)

            lm1 = hands_detected[0].landmark[8]
            lm2 = hands_detected[1].landmark[8]
            
            pincando_1 = dist((hands_detected[0].landmark[4].x, hands_detected[0].landmark[4].y), (lm1.x, lm1.y)) < 0.05
            pincando_2 = dist((hands_detected[1].landmark[4].x, hands_detected[1].landmark[4].y), (lm2.x, lm2.y)) < 0.05

            if pincando_1 and pincando_2:
                app_state = "countdown"
                countdown_start = cv2.getTickCount()
                board_box = (box_x1, box_y1, box_x2 - box_x1, box_y2 - box_y1)

    elif app_state == "countdown":
        elapsed = (cv2.getTickCount() - countdown_start) / cv2.getTickFrequency()
        remaining = 3 - int(elapsed)

        if remaining > 0:
            cv2.putText(frame, f"CAPTURANDO EM {remaining}...", (w // 2 - 150, h // 2), font, 1.2, NEON_PURPLE, 3, cv2.LINE_AA)
        else:
            bx, by, bw, bh = board_box
            captured_roi = frame[by:by+bh, bx:bx+bw].copy()
            captured_roi = aplicar_efeito_foto(captured_roi)
            last_captured_roi = captured_roi

            tile_w = bw // grid_size
            tile_h = bh // grid_size
            puzzle_pieces = []
            
            slots = []
            for row in range(grid_size):
                for col in range(grid_size):
                    sx = col * tile_w
                    sy = row * tile_h
                    tw = bw - sx if col == grid_size - 1 else tile_w
                    th = bh - sy if row == grid_size - 1 else tile_h
                    
                    piece_img = captured_roi[sy:sy+th, sx:sx+tw].copy()
                    puzzle_pieces.append({
                        "row": row, "col": col,
                        "img": piece_img,
                        "w": tw, "h": th,
                        "correct_x": bx + sx,
                        "correct_y": by + sy,
                        "current_x": 0, "current_y": 0,
                        "placed": False
                    })
                    slots.append((bx + sx, by + sy))
            
            random.shuffle(slots)
            for i, piece in enumerate(puzzle_pieces):
                piece["current_x"] = slots[i][0]
                piece["current_y"] = slots[i][1]

            app_state = "puzzle"

    elif app_state == "puzzle":
        cv2.putText(frame, "ORGANIZE O PUZZLE COM PINCA", (40, 90), font, 0.5, (125, 189, 0), 1, cv2.LINE_AA)
        
        bx, by, bw, bh = board_box
        cv2.rectangle(frame, (bx, by), (bx + bw, by + bh), (0, 0, 0), -1)

        # Processamento do Arraste por Pinça (Mão 0)
        pinching = False
        index_px = (0, 0)

        if hands_detected:
            for hand_lms in hands_detected:
                mp_draw.draw_landmarks(frame, hand_lms, mp_hands.HAND_CONNECTIONS)
            
           # Pega os dados da primeira mão detectada para interagir
            first_hand = hands_detected[0].landmark
            index_tip = first_hand[8]
            thumb_tip = first_hand[4]
            
            index_px = (int(index_tip.x * w), int(index_tip.y * h))
            pinching = dist((thumb_tip.x, thumb_tip.y), (index_tip.x, index_tip.y)) < 0.05

        if pinching:
            if active_piece is None:
                # Procura, entre as peças não posicionadas, a que está mais perto do
                # centro do dedo indicador (evita agarrar mais de uma peça em sobreposições)
                best_piece = None
                best_dist = None
                for piece in puzzle_pieces:
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
                    active_piece = best_piece
                    drag_offset_x = index_px[0] - active_piece["current_x"]
                    drag_offset_y = index_px[1] - active_piece["current_y"]
            else:
                # Move a peça agarrada suavemente em direção à posição do dedo
                target_x = index_px[0] - drag_offset_x
                target_y = index_px[1] - drag_offset_y
                active_piece["current_x"] = int(active_piece["current_x"] + (target_x - active_piece["current_x"]) * DRAG_SMOOTHING)
                active_piece["current_y"] = int(active_piece["current_y"] + (target_y - active_piece["current_y"]) * DRAG_SMOOTHING)
        else:
            if active_piece is not None:
                # Soltou a peça: verifica se está perto da posição correta (Snap)
                cx, cy = active_piece["current_x"], active_piece["current_y"]
                corr_x, corr_y = active_piece["correct_x"], active_piece["correct_y"]
                
                if math.hypot(cx - corr_x, cy - corr_y) < 40:
                    active_piece["current_x"] = corr_x
                    active_piece["current_y"] = corr_y
                    active_piece["placed"] = True
                active_piece = None

        # Renderiza todas as peças na tela
        for piece in puzzle_pieces:
            px, py = piece["current_x"], piece["current_y"]
            pw, ph = piece["w"], piece["h"]
            
            # Limita a peça dentro da área do tabuleiro
            px = max(bx, min(px, bx + bw - pw))
            py = max(by, min(py, by + bh - ph))
            piece["current_x"], piece["current_y"] = px, py

            frame[py:py+ph, px:px+pw] = piece["img"]
            
            # Cor da borda: Verde se encaixada, creme se solta, roxo neon se agarrada
            borda_color = (95, 174, 110) if piece["placed"] else (234, 229, 214)
            if piece == active_piece:
                borda_color = (255, 70, 173)
            
            cv2.rectangle(frame, (px, py), (px + pw, py + ph), borda_color, 2)

        # Moldura externa
        cv2.rectangle(frame, (bx, by), (bx + bw, by + bh), NEON_PURPLE, 3)

        # Verifica se todas estão posicionadas
        if all(p["placed"] for p in puzzle_pieces):
            cv2.putText(frame, "COMPLETO! PUNHO FECHADO PARA REINICIAR", (bx, by - 15), font, 0.6, NEON_GREEN, 2, cv2.LINE_AA)

            fist_now = hands_detected is not None and any(is_fist(hl.landmark) for hl in hands_detected)

            if fist_now:
                if fist_start is None:
                    fist_start = cv2.getTickCount()
                fist_elapsed = (cv2.getTickCount() - fist_start) / cv2.getTickFrequency()

                bar_w = int(bw * min(fist_elapsed / FIST_HOLD_SECONDS, 1.0))
                cv2.rectangle(frame, (bx, by + bh + 10), (bx + bar_w, by + bh + 25), NEON_PURPLE, -1)
                cv2.rectangle(frame, (bx, by + bh + 10), (bx + bw, by + bh + 25), NEON_GREEN, 2)

                if fist_elapsed >= FIST_HOLD_SECONDS:
                    if last_captured_roi is not None:
                        cv2.imwrite("completed_puzzle.jpg", last_captured_roi)
                        print("[Motion Puzzle] Puzzle salvo em completed_puzzle.jpg")

                    app_state = "tracking"
                    puzzle_pieces = []
                    active_piece = None
                    fist_start = None
            else:
                fist_start = None

    cv2.imshow("Motion Puzzle", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()