import { useMemo } from 'react';
import { GameState, TetrominoType } from '@/lib/tetris/types';
import { calculateHardDropDistance } from '@/lib/tetris/gameLogic';
import { getRotatedShape } from '@/lib/tetris/rotation';
import GameCell from './GameCell';

interface GameBoardProps {
  state: GameState;
}

export default function GameBoard({ state }: GameBoardProps) {
  // 合并面板、活动方块和幽灵方块到显示矩阵
  const displayBoard = useMemo(() => {
    const board: (TetrominoType | null)[][] = state.board.map(row => [...row]);
    const ghostBoard: (TetrominoType | null)[][] = state.board.map(row => row.map(() => null));

    // 添加幽灵方块（半透明预览）
    if (state.activePiece && state.status === 'playing') {
      const ghostDistance = calculateHardDropDistance(state.board, state.activePiece);
      const { tetromino, position, rotation } = state.activePiece;
      const shape = getRotatedShape(tetromino.shape, rotation);

      for (let y = 0; y < shape.length; y++) {
        for (let x = 0; x < shape[y].length; x++) {
          if (shape[y][x] === 1) {
            const boardY = position.y + y + ghostDistance;
            const boardX = position.x + x;
            if (boardY >= 0 && boardY < board.length && boardX >= 0 && boardX < board[0].length) {
              ghostBoard[boardY][boardX] = tetromino.type;
            }
          }
        }
      }
    }

    // 添加活动方块
    if (state.activePiece) {
      const { tetromino, position, rotation } = state.activePiece;
      const shape = getRotatedShape(tetromino.shape, rotation);

      for (let y = 0; y < shape.length; y++) {
        for (let x = 0; x < shape[y].length; x++) {
          if (shape[y][x] === 1) {
            const boardY = position.y + y;
            const boardX = position.x + x;
            if (boardY >= 0 && boardY < board.length && boardX >= 0 && boardX < board[0].length) {
              board[boardY][boardX] = tetromino.type;
            }
          }
        }
      }
    }

    return { board, ghostBoard };
  }, [state.board, state.activePiece, state.status]);

  return (
    <div className="inline-block p-3 bg-gray-900 dark:bg-gray-950 rounded-lg shadow-2xl">
      <div className="grid grid-cols-10 gap-[2px] bg-gray-800 dark:bg-gray-900 p-1">
        {displayBoard.board.map((row, y) =>
          row.map((cell, x) => {
            const isGhost = !cell && displayBoard.ghostBoard[y][x] !== null;
            const displayType = cell || displayBoard.ghostBoard[y][x];
            return (
              <GameCell
                key={`${y}-${x}`}
                type={displayType}
                isGhost={isGhost}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
