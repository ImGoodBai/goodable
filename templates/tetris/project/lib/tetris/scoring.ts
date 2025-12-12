import {
  SCORE_SINGLE,
  SCORE_DOUBLE,
  SCORE_TRIPLE,
  SCORE_TETRIS,
  SCORE_SOFT_DROP,
  SCORE_HARD_DROP,
  LINES_PER_LEVEL,
  INITIAL_FALL_SPEED,
  SPEED_DECREASE_PER_LEVEL,
  MIN_FALL_SPEED,
} from './constants';

/**
 * 根据消除的行数计算得分
 */
export function calculateLineScore(
  linesCleared: number,
  level: number
): number {
  const baseScore = (() => {
    switch (linesCleared) {
      case 1:
        return SCORE_SINGLE;
      case 2:
        return SCORE_DOUBLE;
      case 3:
        return SCORE_TRIPLE;
      case 4:
        return SCORE_TETRIS;
      default:
        return 0;
    }
  })();

  return baseScore * (level + 1);
}

/**
 * 计算软降得分
 */
export function calculateSoftDropScore(cells: number): number {
  return cells * SCORE_SOFT_DROP;
}

/**
 * 计算硬降得分
 */
export function calculateHardDropScore(cells: number): number {
  return cells * SCORE_HARD_DROP;
}

/**
 * 根据总消除行数计算等级
 */
export function calculateLevel(totalLines: number): number {
  return Math.floor(totalLines / LINES_PER_LEVEL);
}

/**
 * 根据等级计算下落速度
 */
export function calculateFallSpeed(level: number): number {
  const speed = INITIAL_FALL_SPEED - level * SPEED_DECREASE_PER_LEVEL;
  return Math.max(speed, MIN_FALL_SPEED);
}
