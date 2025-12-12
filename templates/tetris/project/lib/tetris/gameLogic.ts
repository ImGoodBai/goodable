import { Board, Tetromino, ActivePiece, TetrominoType } from './types';
import { BOARD_WIDTH, BOARD_HEIGHT, TETROMINOES } from './constants';
import { getRotatedShape } from './rotation';
import { checkCollision, canMove } from './collision';

/**
 * 创建空白游戏面板
 */
export function createEmptyBoard(): Board {
  return Array(BOARD_HEIGHT)
    .fill(null)
    .map(() => Array(BOARD_WIDTH).fill(null));
}

/**
 * 随机生成方块（7-bag随机系统）
 */
let tetromimoBag: TetrominoType[] = [];

export function getRandomTetromino(): Tetromino {
  if (tetromimoBag.length === 0) {
    tetromimoBag = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
    // Fisher-Yates洗牌
    for (let i = tetromimoBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tetromimoBag[i], tetromimoBag[j]] = [tetromimoBag[j], tetromimoBag[i]];
    }
  }

  const type = tetromimoBag.pop()!;
  return { ...TETROMINOES[type] };
}

/**
 * 生成新的活动方块
 */
export function spawnNewPiece(tetromino: Tetromino): ActivePiece {
  return {
    tetromino,
    position: {
      x: Math.floor((BOARD_WIDTH - 4) / 2), // 居中
      y: -2, // 从顶部上方开始
    },
    rotation: 0,
  };
}

/**
 * 锁定方块到面板
 */
export function lockPiece(board: Board, piece: ActivePiece): Board {
  const newBoard = board.map(row => [...row]);
  const { tetromino, position, rotation } = piece;
  const shape = getRotatedShape(tetromino.shape, rotation);

  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (shape[y][x] === 1) {
        const boardY = position.y + y;
        const boardX = position.x + x;
        if (boardY >= 0 && boardY < BOARD_HEIGHT) {
          newBoard[boardY][boardX] = tetromino.type;
        }
      }
    }
  }

  return newBoard;
}

/**
 * 检测并清除完整的行
 */
export function clearFullLines(board: Board): {
  newBoard: Board;
  clearedLines: number[];
} {
  const clearedLines: number[] = [];
  const newBoard: Board = [];

  for (let y = 0; y < board.length; y++) {
    const isFull = board[y].every(cell => cell !== null);
    if (isFull) {
      clearedLines.push(y);
    } else {
      newBoard.push([...board[y]]);
    }
  }

  // 在顶部添加空行
  while (newBoard.length < BOARD_HEIGHT) {
    newBoard.unshift(Array(BOARD_WIDTH).fill(null));
  }

  return { newBoard, clearedLines };
}

/**
 * 计算硬降距离
 */
export function calculateHardDropDistance(
  board: Board,
  piece: ActivePiece
): number {
  let distance = 0;
  while (canMove(board, piece, 0, distance + 1)) {
    distance++;
  }
  return distance;
}

/**
 * 检查游戏是否结束
 */
export function isGameOver(board: Board, piece: ActivePiece): boolean {
  // 如果新生成的方块立即发生碰撞，游戏结束
  return checkCollision(board, piece);
}
