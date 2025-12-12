'use client';

import { useGameState } from '@/lib/tetris/hooks/useGameState';
import { useGameLoop } from '@/lib/tetris/hooks/useGameLoop';
import { useKeyboardControls } from '@/lib/tetris/hooks/useKeyboardControls';
import GameBoard from './GameBoard';
import GameStats from './GameStats';
import NextPiecePreview from './NextPiecePreview';
import GameControls from './GameControls';
import TouchControls from './TouchControls';
import GameOverModal from './GameOverModal';

export default function TetrisGame() {
  const { state, dispatch } = useGameState();
  useGameLoop(state, dispatch);
  useKeyboardControls(dispatch, state.status === 'playing');

  return (
    <div className="flex flex-col md:flex-row gap-4 items-start justify-center px-2 py-2">
      {/* 左侧：游戏面板 */}
      <div className="flex-shrink-0">
        <GameBoard state={state} />
      </div>

      {/* 右侧：信息面板 */}
      <div className="flex flex-col gap-4 w-full md:w-64">
        <GameStats
          score={state.score}
          level={state.level}
          lines={state.lines}
        />

        <NextPiecePreview piece={state.nextPiece} />

        <GameControls
          status={state.status}
          onStart={() => dispatch({ type: 'START_GAME' })}
          onPause={() => dispatch({ type: 'PAUSE_GAME' })}
          onResume={() => dispatch({ type: 'RESUME_GAME' })}
        />

        <TouchControls dispatch={dispatch} />
      </div>

      {/* 游戏结束弹窗 */}
      {state.status === 'gameover' && (
        <GameOverModal
          score={state.score}
          lines={state.lines}
          onRestart={() => dispatch({ type: 'START_GAME' })}
        />
      )}
    </div>
  );
}
