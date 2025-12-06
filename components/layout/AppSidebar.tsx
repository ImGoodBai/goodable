"use client";

import { useRouter } from 'next/navigation';
import { FiHome, FiGrid, FiHelpCircle, FiSettings, FiLayers } from 'react-icons/fi';

interface AppSidebarProps {
  currentPage: 'home' | 'templates' | 'apps' | 'help' | 'settings';
  onNavigate?: (page: string) => void;
  projectsCount?: number;
}

const menuItems = [
  { id: 'home', label: '首页', icon: FiHome },
  { id: 'templates', label: '模板', icon: FiLayers },
  { id: 'apps', label: '我的应用', icon: FiGrid },
  { id: 'help', label: '帮助', icon: FiHelpCircle },
];

export default function AppSidebar({
  currentPage,
  onNavigate,
  projectsCount = 0
}: AppSidebarProps) {
  const router = useRouter();

  const handleNavigate = (pageId: string) => {
    if (onNavigate) {
      onNavigate(pageId);
    } else {
      // Default navigation behavior
      if (pageId === 'settings') {
        window.open('/settings', '_blank');
      } else if (pageId === 'home') {
        router.push('/');
      }
    }
  };

  return (
    <div className="w-60 h-full bg-gray-50 border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="px-4 py-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">Claudable</h1>
        <p className="text-xs text-gray-500 mt-1">AI Code Generator</p>
      </div>

      {/* Menu Items */}
      <div className="flex-1 px-3 py-4 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
              {item.id === 'apps' && projectsCount > 0 && (
                <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                  isActive ? 'bg-white/20 text-white' : 'bg-gray-300 text-gray-700'
                }`}>
                  {projectsCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Settings Button */}
      <div className="px-3 py-4 border-t border-gray-200">
        <button
          onClick={() => handleNavigate('settings')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            currentPage === 'settings'
              ? 'bg-gray-900 text-white'
              : 'text-gray-700 hover:bg-gray-200'
          }`}
        >
          <FiSettings className="w-5 h-5" />
          <span>设置</span>
        </button>
      </div>
    </div>
  );
}
