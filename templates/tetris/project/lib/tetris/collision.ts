import { Board, ActivePiece } from './types';
import { BOARD_WIDTH, BOARD_HEIGHT } from './constants';
import { getRotatedShape } from './rotation';

/**
 * 检查方块是否与面板或其他方块碰撞
 */
export function checkCollision(
  board: Board,
  piece: ActivePiece
): boolean {
  const { tetromino, position, rotation } = piece;
  const shape = getRotatedShape(tetromino.shape, rotation);

  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (shape[y][x] === 1) {
        const boardX = position.x + x;
        const boardY = position.y + y;

        // 检查边界
        if (
          boardX < 0 ||
          boardX >= BOARD_WIDTH ||
          boardY >= BOARD_HEIGHT
        ) {
          return true;
        }

        // 检查与已锁定方块的碰撞
        if (boardY >= 0 && board[boardY][boardX] !== null) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * 检查方块是否可以移动到新位置
 */
export function canMove(
  board: Board,
  piece: ActivePiece,
  deltaX: number,
  deltaY: number
): boolean {
  const newPiece = {
    ...piece,
    position: {
      x: piece.position.x + deltaX,
      y: piece.position.y + deltaY,
    },
  };
  return !checkCollision(board, newPiece);
}

/**
 * 检查方块是否可以旋转
 */
export function canRotate(
  board: Board,
  piece: ActivePiece,
  newRotation: number
): boolean {
  const newPiece = {
    ...piece,
    rotation: (newRotation % 4) as 0 | 1 | 2 | 3,
  };
  return !checkCollision(board, newPiece);
}
