"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FiHome, FiGrid, FiHelpCircle, FiSettings, FiLayers } from 'react-icons/fi';
import { PanelLeftClose, PanelLeft } from 'lucide-react';

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
  const [isCollapsed, setIsCollapsed] = useState(false);

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
    <div className={`h-full bg-gray-50 border-r border-gray-200 flex flex-col transition-all duration-300 relative ${
      isCollapsed ? 'w-16' : 'w-[200px]'
    }`}>
      {/* Logo and Collapse Button */}
      <div className={`px-4 py-6 border-b border-gray-200 relative ${isCollapsed ? 'px-2' : ''}`}>
        {!isCollapsed ? (
          <>
            <h1 className="text-xl font-bold text-gray-900">Claudable</h1>
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
            <span className="text-xl font-bold text-gray-900">C</span>
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
                <>
                  <span>{item.label}</span>
                  {item.id === 'apps' && projectsCount > 0 && (
                    <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                      isActive ? 'bg-white/20 text-white' : 'bg-gray-300 text-gray-700'
                    }`}>
                      {projectsCount}
                    </span>
                  )}
                </>
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
      </div>
    </div>
  );
}
