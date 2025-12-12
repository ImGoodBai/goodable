'use client';

import { useReducer } from 'react';
import { GameState, GameAction, GameStatus } from '../types';
import { INITIAL_FALL_SPEED } from '../constants';
import {
  createEmptyBoard,
  getRandomTetromino,
  spawnNewPiece,
  lockPiece,
  clearFullLines,
  calculateHardDropDistance,
  isGameOver,
} from '../gameLogic';
import { canMove, canRotate } from '../collision';
import {
  calculateLineScore,
  calculateHardDropScore,
  calculateSoftDropScore,
  calculateLevel,
  calculateFallSpeed,
} from '../scoring';

/**
 * 游戏状态reducer
 */
function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME': {
      const firstPiece = getRandomTetromino();
      const secondPiece = getRandomTetromino();
      return {
        board: createEmptyBoard(),
        activePiece: spawnNewPiece(firstPiece),
        nextPiece: secondPiece,
        score: 0,
        level: 0,
        lines: 0,
        status: 'playing',
        fallSpeed: INITIAL_FALL_SPEED,
      };
    }

    case 'PAUSE_GAME':
      return { ...state, status: 'paused' };

    case 'RESUME_GAME':
      return { ...state, status: 'playing' };

    case 'GAME_OVER':
      return { ...state, status: 'gameover' };

    case 'MOVE_LEFT':
      if (!state.activePiece || state.status !== 'playing') return state;
      if (canMove(state.board, state.activePiece, -1, 0)) {
        return {
          ...state,
          activePiece: {
            ...state.activePiece,
            position: {
              ...state.activePiece.position,
              x: state.activePiece.position.x - 1,
            },
          },
        };
      }
      return state;

    case 'MOVE_RIGHT':
      if (!state.activePiece || state.status !== 'playing') return state;
      if (canMove(state.board, state.activePiece, 1, 0)) {
        return {
          ...state,
          activePiece: {
            ...state.activePiece,
            position: {
              ...state.activePiece.position,
              x: state.activePiece.position.x + 1,
            },
          },
        };
      }
      return state;

    case 'MOVE_DOWN':
      if (!state.activePiece || state.status !== 'playing') return state;
      if (canMove(state.board, state.activePiece, 0, 1)) {
        return {
          ...state,
          activePiece: {
            ...state.activePiece,
            position: {
              ...state.activePiece.position,
              y: state.activePiece.position.y + 1,
            },
          },
          score: state.score + calculateSoftDropScore(1),
        };
      }
      return state;

    case 'ROTATE':
      if (!state.activePiece || state.status !== 'playing') return state;
      const newRotation = ((state.activePiece.rotation + 1) % 4) as 0 | 1 | 2 | 3;
      if (canRotate(state.board, state.activePiece, newRotation)) {
        return {
          ...state,
          activePiece: {
            ...state.activePiece,
            rotation: newRotation,
          },
        };
      }
      return state;

    case 'HARD_DROP': {
      if (!state.activePiece || state.status !== 'playing') return state;
      const dropDistance = calculateHardDropDistance(state.board, state.activePiece);
      const droppedPiece = {
        ...state.activePiece,
        position: {
          ...state.activePiece.position,
          y: state.activePiece.position.y + dropDistance,
        },
      };
      const boardWithPiece = lockPiece(state.board, droppedPiece);
      const { newBoard, clearedLines } = clearFullLines(boardWithPiece);

      const newLines = state.lines + clearedLines.length;
      const newLevel = calculateLevel(newLines);
      const lineScore = calculateLineScore(clearedLines.length, state.level);
      const dropScore = calculateHardDropScore(dropDistance);

      const newPiece = spawnNewPiece(state.nextPiece);
      const nextPiece = getRandomTetromino();

      if (isGameOver(newBoard, newPiece)) {
        return {
          ...state,
          board: newBoard,
          activePiece: null,
          score: state.score + lineScore + dropScore,
          lines: newLines,
          level: newLevel,
          status: 'gameover'
        };
      }

      return {
        ...state,
        board: newBoard,
        activePiece: newPiece,
        nextPiece,
        score: state.score + lineScore + dropScore,
        lines: newLines,
        level: newLevel,
        fallSpeed: calculateFallSpeed(newLevel),
      };
    }

    case 'UPDATE_FALL': {
      if (!state.activePiece || state.status !== 'playing') return state;

      // 尝试向下移动
      if (canMove(state.board, state.activePiece, 0, 1)) {
        return {
          ...state,
          activePiece: {
            ...state.activePiece,
            position: {
              ...state.activePiece.position,
              y: state.activePiece.position.y + 1,
            },
          },
        };
      }

      // 无法移动，锁定方块
      const boardWithPiece = lockPiece(state.board, state.activePiece);
      const { newBoard, clearedLines } = clearFullLines(boardWithPiece);

      const newLines = state.lines + clearedLines.length;
      const newLevel = calculateLevel(newLines);
      const lineScore = calculateLineScore(clearedLines.length, state.level);

      const newPiece = spawnNewPiece(state.nextPiece);
      const nextPiece = getRandomTetromino();

      if (isGameOver(newBoard, newPiece)) {
        return {
          ...state,
          board: newBoard,
          activePiece: null,
          score: state.score + lineScore,
          lines: newLines,
          level: newLevel,
          status: 'gameover'
        };
      }

      return {
        ...state,
        board: newBoard,
        activePiece: newPiece,
        nextPiece,
        score: state.score + lineScore,
        lines: newLines,
        level: newLevel,
        fallSpeed: calculateFallSpeed(newLevel),
      };
    }

    default:
      return state;
  }
}

/**
 * 游戏状态管理hook
 */
export function useGameState() {
  const [state, dispatch] = useReducer(gameReducer, null, () => ({
    board: createEmptyBoard(),
    activePiece: null,
    nextPiece: getRandomTetromino(),
    score: 0,
    level: 0,
    lines: 0,
    status: 'idle' as GameStatus,
    fallSpeed: INITIAL_FALL_SPEED,
  }));

  return { state, dispatch };
}
