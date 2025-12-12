import { Tetromino, TetrominoType } from './types';

// 游戏面板尺寸
export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;

// 初始下落速度（毫秒）
export const INITIAL_FALL_SPEED = 1000;
export const MIN_FALL_SPEED = 100;

// 难度递增
export const LINES_PER_LEVEL = 10;
export const SPEED_DECREASE_PER_LEVEL = 50;

// 计分规则
export const SCORE_SINGLE = 100;
export const SCORE_DOUBLE = 300;
export const SCORE_TRIPLE = 500;
export const SCORE_TETRIS = 800;
export const SCORE_SOFT_DROP = 1;
export const SCORE_HARD_DROP = 2;

// 方块形状定义（使用SRS标准）
export const TETROMINOES: Record<TetrominoType, Tetromino> = {
  I: {
    type: 'I',
    shape: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    color: 'bg-cyan-500',
  },
  O: {
    type: 'O',
    shape: [
      [0, 0, 0, 0],
      [0, 1, 1, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
    ],
    color: 'bg-yellow-500',
  },
  T: {
    type: 'T',
    shape: [
      [0, 0, 0, 0],
      [0, 1, 0, 0],
      [1, 1, 1, 0],
      [0, 0, 0, 0],
    ],
    color: 'bg-purple-500',
  },
  S: {
    type: 'S',
    shape: [
      [0, 0, 0, 0],
      [0, 1, 1, 0],
      [1, 1, 0, 0],
      [0, 0, 0, 0],
    ],
    color: 'bg-green-500',
  },
  Z: {
    type: 'Z',
    shape: [
      [0, 0, 0, 0],
      [1, 1, 0, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
    ],
    color: 'bg-red-500',
  },
  J: {
    type: 'J',
    shape: [
      [0, 0, 0, 0],
      [1, 0, 0, 0],
      [1, 1, 1, 0],
      [0, 0, 0, 0],
    ],
    color: 'bg-blue-500',
  },
  L: {
    type: 'L',
    shape: [
      [0, 0, 0, 0],
      [0, 0, 1, 0],
      [1, 1, 1, 0],
      [0, 0, 0, 0],
    ],
    color: 'bg-orange-500',
  },
};

// 键盘按键映射
export const KEYBOARD_CONTROLS = {
  LEFT: ['ArrowLeft', 'a', 'A'],
  RIGHT: ['ArrowRight', 'd', 'D'],
  DOWN: ['ArrowDown', 's', 'S'],
  ROTATE: ['ArrowUp', 'w', 'W'],
  HARD_DROP: [' ', 'Space'],
  PAUSE: ['p', 'P', 'Escape'],
} as const;
