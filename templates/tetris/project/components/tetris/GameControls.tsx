import { GameStatus } from '@/lib/tetris/types';

interface GameControlsProps {
  status: GameStatus;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
}

export default function GameControls({ status, onStart, onPause, onResume }: GameControlsProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-lg space-y-2">
      {status === 'idle' && (
        <button
          onClick={onStart}
          className="w-full py-3 px-4 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors"
        >
          开始游戏
        </button>
      )}

      {status === 'playing' && (
        <button
          onClick={onPause}
          className="w-full py-3 px-4 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded-lg transition-colors"
        >
          暂停
        </button>
      )}

      {status === 'paused' && (
        <>
          <button
            onClick={onResume}
            className="w-full py-3 px-4 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-colors"
          >
            继续
          </button>
          <button
            onClick={onStart}
            className="w-full py-3 px-4 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors"
          >
            重新开始
          </button>
        </>
      )}

      {status === 'gameover' && (
        <button
          onClick={onStart}
          className="w-full py-3 px-4 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors"
        >
          重新开始
        </button>
      )}

      <div className="text-xs text-gray-600 dark:text-gray-400 mt-4 space-y-1">
        <div className="font-semibold mb-2">键盘操作：</div>
        <div>← → 左右移动</div>
        <div>↑ 旋转</div>
        <div>↓ 加速下落</div>
        <div>空格 快速落下</div>
        <div>P/ESC 暂停</div>
      </div>
    </div>
  );
}
