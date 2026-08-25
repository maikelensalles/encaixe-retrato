export const LM = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_TIP: 8,
  MIDDLE_TIP: 12,
  RING_TIP: 16,
  PINKY_TIP: 20,
  MIDDLE_MCP: 9,
  RING_MCP: 13,
  PINKY_MCP: 17,
};

export const NEON_PURPLE = "#AD46FF";
export const NEON_GREEN = "#00bd7d";
export const CREAM = "rgba(234,229,214,0.8)";
export const DANGER = "#e0533d";

export const PINCH_THRESHOLD = 0.05;
export const FRAME_PADDING = 40;
export const MIN_BOX_RATIO = 0.3;
export const ARM_HOLD_MS = 300;
export const COUNTDOWN_SECONDS = 3;
export const FIST_HOLD_MS = 1500;
export const GRID = 3;
export const LOAD_TIMEOUT_MS = 20000;
export const DRAG_SMOOTHING = 0.6;

export const PHOTOBOOTH_CONTRAST_ALPHA = 1.3;
export const PHOTOBOOTH_BRIGHTNESS_BETA = 10;

export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export const STRIP_MAX_PHOTOS = 3;
export const STRIP_FILE_BORDER = 24;
export const STRIP_FILE_GAP = 16;
export const STRIP_FILE_BG = "#ffffff";

export const FRAME_GRACE_MS = 450;
