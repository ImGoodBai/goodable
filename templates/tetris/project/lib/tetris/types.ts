// 方块形状类型
export type TetrominoType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

// 方块定义
export interface Tetromino {
  type: TetrominoType;
  shape: number[][]; // 4x4矩阵，1表示有方块，0表示空
  color: string;     // Tailwind颜色类
}

// 当前活动方块
export interface ActivePiece {
  tetromino: Tetromino;
  position: { x: number; y: number }; // 相对于游戏面板的位置
  rotation: 0 | 1 | 2 | 3;            // 旋转状态
}

// 游戏面板（10列 x 20行）
export type Board = (TetrominoType | null)[][];

// 游戏状态
export type GameStatus = 'idle' | 'playing' | 'paused' | 'gameover';

// 完整游戏状态
export interface GameState {
  board: Board;
  activePiece: ActivePiece | null;
  nextPiece: Tetromino;
  score: number;
  level: number;
  lines: number;
  status: GameStatus;
  fallSpeed: number; // 毫秒
}

// 游戏动作类型
export type GameAction =
  | { type: 'START_GAME' }
  | { type: 'PAUSE_GAME' }
  | { type: 'RESUME_GAME' }
  | { type: 'GAME_OVER' }
  | { type: 'MOVE_LEFT' }
  | { type: 'MOVE_RIGHT' }
  | { type: 'MOVE_DOWN' }
  | { type: 'ROTATE' }
  | { type: 'HARD_DROP' }
  | { type: 'UPDATE_FALL' }
  | { type: 'LOCK_PIECE' }
  | { type: 'CLEAR_LINES'; lines: number[] };
