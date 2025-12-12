import { Tetromino } from '@/lib/tetris/types';
import { TETROMINOES } from '@/lib/tetris/constants';

interface NextPiecePreviewProps {
  piece: Tetromino;
}

export default function NextPiecePreview({ piece }: NextPiecePreviewProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-lg">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 text-center">
        下一个
      </h3>
      <div className="grid grid-cols-4 gap-[2px] bg-gray-200 dark:bg-gray-700 p-2 rounded">
        {piece.shape.map((row, y) =>
          row.map((cell, x) => (
            <div
              key={`${y}-${x}`}
              className={`
                w-5 h-5 rounded-sm
                ${cell === 1 ? piece.color : 'bg-transparent'}
                ${cell === 1 ? 'shadow-sm' : ''}
              `}
            />
          ))
        )}
      </div>
    </div>
  );
}
