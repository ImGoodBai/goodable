'use client';

import { useEffect } from 'react';
import { GameAction } from '../types';
import { KEYBOARD_CONTROLS } from '../constants';

/**
 * 键盘控制hook
 */
export function useKeyboardControls(
  dispatch: React.Dispatch<GameAction>,
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 防止重复触发
      if (e.repeat) return;

      if (KEYBOARD_CONTROLS.LEFT.includes(e.key)) {
        e.preventDefault();
        dispatch({ type: 'MOVE_LEFT' });
      } else if (KEYBOARD_CONTROLS.RIGHT.includes(e.key)) {
        e.preventDefault();
        dispatch({ type: 'MOVE_RIGHT' });
      } else if (KEYBOARD_CONTROLS.DOWN.includes(e.key)) {
        e.preventDefault();
        dispatch({ type: 'MOVE_DOWN' });
      } else if (KEYBOARD_CONTROLS.ROTATE.includes(e.key)) {
        e.preventDefault();
        dispatch({ type: 'ROTATE' });
      } else if (KEYBOARD_CONTROLS.HARD_DROP.includes(e.key)) {
        e.preventDefault();
        dispatch({ type: 'HARD_DROP' });
      } else if (KEYBOARD_CONTROLS.PAUSE.includes(e.key)) {
        e.preventDefault();
        if (enabled) {
          dispatch({ type: 'PAUSE_GAME' });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch, enabled]);
}
