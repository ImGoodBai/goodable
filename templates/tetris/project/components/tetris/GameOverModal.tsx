interface GameOverModalProps {
  score: number;
  lines: number;
  onRestart: () => void;
}

export default function GameOverModal({ score, lines, onRestart }: GameOverModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full shadow-2xl transform transition-all">
        <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-6">
          游戏结束
        </h2>

        <div className="space-y-4 mb-8">
          <div className="text-center">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
              最终分数
            </div>
            <div className="text-4xl font-bold text-blue-500">
              {score.toLocaleString()}
            </div>
          </div>

          <div className="text-center">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
              消除行数
            </div>
            <div className="text-2xl font-semibold text-gray-900 dark:text-white">
              {lines}
            </div>
          </div>
        </div>

        <button
          onClick={onRestart}
          className="w-full py-4 px-6 bg-blue-500 hover:bg-blue-600 text-white font-bold text-lg rounded-lg transition-colors"
        >
          再玩一次
        </button>
      </div>
    </div>
  );
}
