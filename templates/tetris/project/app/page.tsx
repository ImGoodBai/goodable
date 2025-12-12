import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center px-2 py-4">
      <div className="text-center space-y-8 max-w-xl w-full">
        <div className="space-y-4">
          <h1 className="text-6xl md:text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 animate-pulse">
            俄罗斯方块
          </h1>
          <p className="text-xl md:text-2xl text-gray-700 dark:text-gray-300">
            经典的益智游戏，挑战你的反应速度！
          </p>
        </div>

        <div className="space-y-4">
          <Link
            href="/tetris"
            className="inline-block px-12 py-6 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white text-2xl font-bold rounded-2xl shadow-2xl transform hover:scale-105 transition-all duration-200 hover:shadow-purple-500/50"
          >
            🎮 开始游戏
          </Link>

          <div className="mt-8 p-6 bg-white/80 dark:bg-gray-800/80 rounded-xl shadow-lg backdrop-blur-sm">
            <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">
              游戏特色
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left text-gray-600 dark:text-gray-400">
              <div>✨ 7种经典方块</div>
              <div>🎯 实时分数统计</div>
              <div>⌨️ 键盘流畅操作</div>
              <div>📱 触摸屏支持</div>
              <div>👻 落地位置预览</div>
              <div>🌓 深色模式支持</div>
            </div>
          </div>

          <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
            <p>操作说明：方向键移动/旋转 · 空格键快速落下 · P键暂停</p>
          </div>
        </div>
      </div>
    </div>
  );
}
