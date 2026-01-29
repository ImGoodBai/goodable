"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';
const REFRESH_INTERVAL = Number(process.env.NEXT_PUBLIC_EMPLOYEE_STATUS_REFRESH_INTERVAL) * 1000 || 5000;

interface RunningTask {
  id: string;
  name: string;
  status: string;
  instruction?: string;
  createdAt: string;
}

interface EmployeeStatus {
  id: string;
  name: string;
  description?: string;
  category: string;
  mode: string;
  runningTasks: RunningTask[];
  totalTaskCount: number;
}

export default function EmployeeStatusPanel() {
  const [employees, setEmployees] = useState<EmployeeStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Polling: refresh based on config
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/boss/employees-status`);
        const data = await res.json();
        if (data.success) {
          setEmployees(data.data);
        }
      } catch (error) {
        console.error('Failed to fetch employee status:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus(); // Initial load
    const timer = setInterval(fetchStatus, REFRESH_INTERVAL);

    return () => clearInterval(timer);
  }, []);

  const handleTaskClick = (projectId: string) => {
    // Open in new window if in Electron environment
    if (typeof window !== 'undefined' && (window as any).desktopAPI) {
      (window as any).desktopAPI.openNewWindow({
        url: `/${projectId}/chat`
      }).catch((err: Error) => {
        console.error('Failed to open new window:', err);
        // Fallback to current window
        router.push(`/${projectId}/chat`);
      });
    } else {
      // Web environment: open in current window
      router.push(`/${projectId}/chat`);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  const refreshSeconds = REFRESH_INTERVAL / 1000;

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">员工状态</h2>
        <span className="text-sm text-gray-500">自动刷新: {refreshSeconds}秒</span>
      </div>

      {/* Employee Cards Grid - Reduced column count for wider cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
        {employees.map((employee) => {
          const isWorking = employee.runningTasks.length > 0;

          return (
            <div
              key={employee.id}
              className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow border border-gray-200 p-3 relative"
            >
              {/* Mode badge - top right corner, smaller, unified gray */}
              <div className="absolute top-2 right-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                  {employee.mode}
                </span>
              </div>

              {/* Avatar - centered at top */}
              <div className="flex justify-center mb-2">
                <User className="w-10 h-10 text-gray-400" />
              </div>

              {/* Name - centered, minimal horizontal padding */}
              <h3 className="font-semibold text-base text-gray-900 text-center mb-3 truncate px-1">
                {employee.name}
              </h3>

              {/* Status Tags - Green only when active > 0 */}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full ${
                  isWorking ? 'bg-green-50' : 'bg-gray-50'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    isWorking ? 'bg-green-500' : 'bg-gray-400'
                  }`}></div>
                  <span className={`font-bold text-base ${
                    isWorking ? 'text-green-600' : 'text-gray-500'
                  }`}>{employee.runningTasks.length}</span>
                  <span className={`text-xs whitespace-nowrap ${
                    isWorking ? 'text-green-700' : 'text-gray-500'
                  }`}>活动</span>
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400"></div>
                  <span className="text-gray-600 font-semibold text-sm">{employee.totalTaskCount}</span>
                  <span className="text-gray-600 text-xs whitespace-nowrap">总计</span>
                </div>
              </div>

              {/* Running Tasks List */}
              {isWorking && (
                <div className="space-y-2 border-t border-gray-100 pt-3">
                  {employee.runningTasks.slice(0, 2).map((task) => (
                    <div
                      key={task.id}
                      className="flex items-start gap-2 text-sm bg-gray-50 hover:bg-gray-100 p-2 rounded cursor-pointer transition-colors group"
                      onClick={() => handleTaskClick(task.id)}
                    >
                      {/* Pulsing green dot */}
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0 mt-1"></div>
                      <p className="text-gray-900 truncate flex-1 group-hover:text-gray-700">
                        {task.name}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
