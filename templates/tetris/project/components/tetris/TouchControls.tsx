import { GameAction } from '@/lib/tetris/types';
import { ArrowLeft, ArrowRight, ArrowDown, RotateCw, ArrowDownToLine } from 'lucide-react';

interface TouchControlsProps {
  dispatch: React.Dispatch<GameAction>;
}

export default function TouchControls({ dispatch }: TouchControlsProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-lg">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 text-center">
        触摸控制
      </h3>

      <div className="grid grid-cols-3 gap-2 mb-2">
        <button
          onClick={() => dispatch({ type: 'MOVE_LEFT' })}
          className="p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors active:scale-95"
        >
          <ArrowLeft className="w-6 h-6 mx-auto" />
        </button>

        <button
          onClick={() => dispatch({ type: 'ROTATE' })}
          className="p-3 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors active:scale-95"
        >
          <RotateCw className="w-6 h-6 mx-auto" />
        </button>

        <button
          onClick={() => dispatch({ type: 'MOVE_RIGHT' })}
          className="p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors active:scale-95"
        >
          <ArrowRight className="w-6 h-6 mx-auto" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => dispatch({ type: 'MOVE_DOWN' })}
          className="p-3 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors active:scale-95"
        >
          <ArrowDown className="w-6 h-6 mx-auto" />
        </button>

        <button
          onClick={() => dispatch({ type: 'HARD_DROP' })}
          className="p-3 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors active:scale-95"
        >
          <ArrowDownToLine className="w-6 h-6 mx-auto" />
        </button>
      </div>
    </div>
  );
}
