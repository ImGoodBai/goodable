"use client";

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import type { Employee } from '@/types/backend/employee';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

interface EmployeeDropdownProps {
  selectedEmployeeId: string | null;
  onSelect: (employee: Employee) => void;
}

export default function EmployeeDropdown({
  selectedEmployeeId,
  onSelect,
}: EmployeeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load employees
  useEffect(() => {
    async function loadEmployees() {
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
    }
    loadEmployees();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId);

  if (loading) {
    return (
      <div className="px-3 py-1.5 text-sm text-gray-500">
        加载中...
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1 hover:bg-gray-100 rounded transition-colors text-sm"
      >
        <span className="text-gray-600">
          {selectedEmployee?.name || '选择员工'}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
          {employees.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">暂无员工</div>
          ) : (
            employees.map((employee) => (
              <button
                key={employee.id}
                onClick={() => {
                  onSelect(employee);
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {employee.name}
                    </span>
                    {employee.is_builtin && (
                      <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                        内置
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {employee.category} · {employee.mode === 'code' ? '编程' : '工作'}
                  </div>
                </div>
                {selectedEmployeeId === employee.id && (
                  <Check className="w-4 h-4 text-gray-900 flex-shrink-0 ml-2" />
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
