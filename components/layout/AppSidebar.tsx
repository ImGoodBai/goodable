"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FiHome, FiGrid, FiHelpCircle, FiSettings, FiLayers } from 'react-icons/fi';
import { PanelLeftClose, PanelLeft } from 'lucide-react';
import packageJson from '@/package.json';

const APP_VERSION = packageJson.version;

interface AppSidebarProps {
  currentPage: 'home' | 'templates' | 'apps' | 'help' | 'settings';
  onNavigate?: (page: string) => void;
  projectsCount?: number;
}

const menuItems = [
  { id: 'home', label: '首页', icon: FiHome },
  { id: 'apps', label: '我的应用', icon: FiGrid },
  { id: 'templates', label: '模板', icon: FiLayers },
  { id: 'help', label: '帮助', icon: FiHelpCircle },
];

export default function AppSidebar({
  currentPage,
  onNavigate,
  projectsCount = 0
}: AppSidebarProps) {
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(true);

  // Load collapsed state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    if (saved !== null) {
      setIsCollapsed(saved === 'true');
    }
  }, []);

  // Save collapsed state to localStorage
  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', String(newState));
  };

  const handleNavigate = async (pageId: string) => {
    // Handle help button - open external link
    if (pageId === 'help') {
      const helpUrl = 'https://100agents.feishu.cn/wiki/H0XHwKUz0izSeGkhhzUcmhwZn7b';

      // Check if running in Electron
      if (typeof window !== 'undefined' && (window as any).desktopAPI?.openExternal) {
        await (window as any).desktopAPI.openExternal(helpUrl);
      } else {
        // Fallback for web version
        window.open(helpUrl, '_blank');
      }
      return;
    }

    if (onNavigate) {
      onNavigate(pageId);
    } else {
      // Default navigation behavior - always use absolute paths
      if (pageId === 'settings') {
        window.open('/settings', '_blank');
      } else if (pageId === 'home') {
        router.push('/workspace');
      } else if (pageId === 'apps') {
        router.push('/workspace?view=apps');
      } else if (pageId === 'templates') {
        router.push('/workspace?view=templates');
      } else {
        router.push(`/workspace?view=${pageId}`);
      }
    }
  };

  return (
    <div className={`h-full bg-gray-50 border-r border-gray-200 flex flex-col transition-all duration-300 relative ${
      isCollapsed ? 'w-16' : 'w-[180px]'
    }`}>
      {/* Logo and Collapse Button */}
      <div className={`px-4 py-6 border-b border-gray-200 relative ${isCollapsed ? 'px-2' : ''}`}>
        {!isCollapsed ? (
          <>
            <h1 className="text-xl font-bold text-gray-900">Goodable</h1>
            {/* Collapse button - top right corner */}
            <button
              onClick={toggleCollapse}
              className="absolute top-4 right-2 p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-md transition-colors"
              title="收起侧边栏"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </>
        ) : (
          <div className="text-center">
            <span className="text-xl font-bold text-gray-900">G</span>
            {/* Expand button - centered */}
            <button
              onClick={toggleCollapse}
              className="absolute top-4 right-2 p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-md transition-colors"
              title="展开侧边栏"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Menu Items */}
      <div className={`flex-1 py-4 space-y-1 ${isCollapsed ? 'px-2' : 'px-3'}`}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              title={isCollapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-700 hover:bg-gray-200'
              } ${isCollapsed ? 'justify-center px-0' : ''}`}
            >
              <Icon className="w-5 h-5" />
              {!isCollapsed && (
                <span>{item.label}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Settings Button */}
      <div className={`py-4 border-t border-gray-200 ${isCollapsed ? 'px-2' : 'px-3'}`}>
        <button
          onClick={() => handleNavigate('settings')}
          title={isCollapsed ? '设置' : undefined}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            currentPage === 'settings'
              ? 'bg-gray-900 text-white'
              : 'text-gray-700 hover:bg-gray-200'
          } ${isCollapsed ? 'justify-center px-0' : ''}`}
        >
          <FiSettings className="w-5 h-5" />
          {!isCollapsed && <span>设置</span>}
        </button>

        {/* Version Info */}
        {!isCollapsed && (
          <div className="mt-3 px-3 py-2 text-xs text-gray-500">
            v{APP_VERSION}
          </div>
        )}
      </div>
    </div>
  );
}
