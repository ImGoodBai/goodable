import { TetrominoType } from '@/lib/tetris/types';
import { TETROMINOES } from '@/lib/tetris/constants';

interface GameCellProps {
  type: TetrominoType | null;
  isGhost?: boolean;
}

export default function GameCell({ type, isGhost = false }: GameCellProps) {
  const colorClass = type ? TETROMINOES[type].color : 'bg-gray-800 dark:bg-gray-900';

  return (
    <div
      className={`
        w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-sm transition-colors
        ${isGhost ? 'opacity-30 border-2 border-white/50' : colorClass}
        ${type && !isGhost ? 'shadow-inner border border-white/20' : ''}
      `}
    />
  );
}
