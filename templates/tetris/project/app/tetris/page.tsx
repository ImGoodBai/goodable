import TetrisGame from '@/components/tetris/TetrisGame';

export default function TetrisPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-4xl mx-auto px-2 py-4">
        <h1 className="text-4xl md:text-5xl font-bold text-center mb-2 text-gray-900 dark:text-white">
          俄罗斯方块
        </h1>
        <p className="text-center text-gray-600 dark:text-gray-400 mb-8">
          经典的益智游戏
        </p>

        <TetrisGame />
      </div>
    </div>
  );
}
