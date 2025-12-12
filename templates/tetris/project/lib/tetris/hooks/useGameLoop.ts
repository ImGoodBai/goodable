'use client';

import { useEffect, useRef, useCallback } from 'react';
import { GameState, GameAction } from '../types';

/**
 * 游戏主循环hook
 */
export function useGameLoop(
  state: GameState,
  dispatch: React.Dispatch<GameAction>
) {
  const lastFallTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>();

  const gameLoop = useCallback(
    (timestamp: number) => {
      if (state.status !== 'playing') {
        return;
      }

      // 检查是否需要下落
      if (timestamp - lastFallTimeRef.current >= state.fallSpeed) {
        dispatch({ type: 'UPDATE_FALL' });
        lastFallTimeRef.current = timestamp;
      }

      animationFrameRef.current = requestAnimationFrame(gameLoop);
    },
    [state.status, state.fallSpeed, dispatch]
  );

  useEffect(() => {
    if (state.status === 'playing') {
      lastFallTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(gameLoop);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [state.status, gameLoop]);
}
