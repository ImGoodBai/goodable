interface GameStatsProps {
  score: number;
  level: number;
  lines: number;
}

export default function GameStats({ score, level, lines }: GameStatsProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-lg space-y-3">
      <div className="text-center">
        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
          分数
        </div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white">
          {score.toLocaleString()}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="text-center">
          <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            等级
          </div>
          <div className="text-xl font-semibold text-gray-900 dark:text-white">
            {level}
          </div>
        </div>

        <div className="text-center">
          <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            行数
          </div>
          <div className="text-xl font-semibold text-gray-900 dark:text-white">
            {lines}
          </div>
        </div>
      </div>
    </div>
  );
}
