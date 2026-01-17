"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { User, Briefcase, Settings } from 'lucide-react';
import type { Employee, EmployeeCategoryKey } from '@/types/backend/employee';
import { DEFAULT_EMPLOYEE_CATEGORIES } from '@/types/backend/employee';
import EmployeeFormModal from './EmployeeFormModal';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

interface EmployeeStats {
  task_count: number;
  total_tokens: number;
}

interface EmployeeListProps {
  onAssignWork?: (employee: Employee) => void;
}

export default function EmployeeList({ onAssignWork }: EmployeeListProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stats, setStats] = useState<Record<string, EmployeeStats>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [hoveredEmployee, setHoveredEmployee] = useState<Employee | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load employees
  const loadEmployees = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/employees`);
      if (response.ok) {
        const data = await response.json();
        setEmployees(data.data || []);
      }
    } catch (error) {
      console.error('Failed to load employees:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load stats
  const loadStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/employees/stats`);
      if (response.ok) {
        const data = await response.json();
        setStats(data.data || {});
      }
    } catch (error) {
      console.error('Failed to load employee stats:', error);
    }
  };

  useEffect(() => {
    loadEmployees();
    loadStats();
  }, []);

  // Group employees by category
  const employeesByCategory = useMemo(() => {
    const grouped: Record<EmployeeCategoryKey, Employee[]> = {
      growth: [],
      research: [],
      content: [],
      sales: [],
      support: [],
      admin: [],
      legal: [],
      engineering: [],
      other: [],
    };

    employees.forEach((emp) => {
      const cat = emp.category as EmployeeCategoryKey;
      if (grouped[cat]) {
        grouped[cat].push(emp);
      } else {
        grouped.other.push(emp);
      }
    });

    return grouped;
  }, [employees]);

  // Calculate category stats
  const getCategoryStats = (categoryEmployees: Employee[]) => {
    let taskCount = 0;
    let tokenCount = 0;
    categoryEmployees.forEach((emp) => {
      const empStats = stats[emp.id];
      if (empStats) {
        taskCount += empStats.task_count || 0;
        tokenCount += empStats.total_tokens || 0;
      }
    });
    return { taskCount, tokenCount };
  };

  // Format token count
  const formatTokens = (count: number): string => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`;
    }
    return String(count);
  };

  // Open create modal
  const handleCreate = () => {
    setEditingEmployee(null);
    setIsModalOpen(true);
  };

  // Open edit modal
  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setHoveredEmployee(null);
    setIsModalOpen(true);
  };

  // Handle save (create or update)
  const handleSave = async () => {
    setIsModalOpen(false);
    setEditingEmployee(null);
    await loadEmployees();
    setMessage({ type: 'success', text: editingEmployee ? '更新成功' : '创建成功' });
    setTimeout(() => setMessage(null), 2000);
  };

  // Handle assign work
  const handleAssignWork = (employee: Employee) => {
    setHoveredEmployee(null);
    if (onAssignWork) {
      onAssignWork(employee);
    }
  };

  // Handle mouse enter - show detail card after delay
  const handleMouseEnter = (employee: Employee) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredEmployee(employee);
    }, 300);
  };

  // Handle mouse leave - hide detail card
  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredEmployee(null);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">
          数字员工墙
          <span className="ml-2 text-base font-normal text-gray-500">（{employees.length}人）</span>
        </h2>
        <button
          onClick={handleCreate}
          className="px-4 py-2 bg-black hover:bg-gray-900 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + 新建
        </button>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`mb-4 px-4 py-2 rounded-lg text-sm ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Employee Wall */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">加载中...</div>
        </div>
      ) : employees.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-gray-500">暂无员工</p>
          <p className="text-sm text-gray-400 mt-2">点击右上角新建按钮创建员工</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 min-[1400px]:grid-cols-4 gap-4 items-start">
          {DEFAULT_EMPLOYEE_CATEGORIES.map((category) => {
            const categoryEmployees = employeesByCategory[category.key] || [];
            if (categoryEmployees.length === 0) return null;

            const categoryStats = getCategoryStats(categoryEmployees);

            return (
              <div key={category.key} className="bg-gray-50 rounded-xl p-4">
                {/* Department Header */}
                <div className="mb-3 pb-2 border-b border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-700">
                    {category.name}
                    <span className="ml-1 font-normal text-gray-400">（{categoryEmployees.length}人）</span>
                  </h3>
                  <div className="text-xs text-gray-400 mt-1">
                    完成 {categoryStats.taskCount} 任务 · 消耗 {formatTokens(categoryStats.tokenCount)} Token
                  </div>
                </div>

                {/* Employees Grid - 3 per row */}
                <div className="grid grid-cols-3 gap-2">
                  {categoryEmployees.map((employee) => {
                    const isHovered = hoveredEmployee?.id === employee.id;

                    return (
                      <div
                        key={employee.id}
                        className="relative"
                        onMouseEnter={() => handleMouseEnter(employee)}
                        onMouseLeave={handleMouseLeave}
                      >
                        <div className="flex flex-col items-center p-2 rounded-lg hover:bg-white hover:shadow-md transition-all cursor-pointer">
                          {/* Avatar */}
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center mb-1">
                            <User className="w-5 h-5 text-gray-500" />
                          </div>

                          {/* Name */}
                          <span className="text-xs text-gray-700 text-center truncate w-full">
                            {employee.name}
                          </span>
                        </div>

                        {/* Detail Card - shown on hover */}
                        {isHovered && (
                          <div className="absolute z-50 top-0 left-1/2 -translate-x-1/2 -translate-y-full mb-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 p-3">
                            {/* Employee Info */}
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                                <User className="w-4 h-4 text-gray-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">
                                  {employee.name}
                                </div>
                                <div className="text-xs text-gray-400">
                                  {employee.mode === 'code' ? '编程' : '工作'}模式
                                </div>
                              </div>
                            </div>

                            {/* Description */}
                            {employee.description && (
                              <p className="text-xs text-gray-500 mb-3 line-clamp-2">
                                {employee.description}
                              </p>
                            )}

                            {/* Stats */}
                            {stats[employee.id] && (
                              <div className="text-xs text-gray-400 mb-3">
                                完成 {stats[employee.id].task_count} 任务 · {formatTokens(stats[employee.id].total_tokens)} Token
                              </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAssignWork(employee);
                                }}
                                className="flex-1 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center gap-1"
                              >
                                <Briefcase className="w-3 h-3" />
                                派活
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEdit(employee);
                                }}
                                className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-1"
                              >
                                <Settings className="w-3 h-3" />
                                设置
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <EmployeeFormModal
        open={isModalOpen}
        employee={editingEmployee}
        onClose={() => {
          setIsModalOpen(false);
          setEditingEmployee(null);
        }}
        onSave={handleSave}
      />
    </div>
  );
}
