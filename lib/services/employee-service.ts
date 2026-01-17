/**
 * Employee Service - Manage digital employees
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import type {
  Employee,
  CreateEmployeeInput,
  UpdateEmployeeInput,
  EmployeeCategoryConfig,
} from '@/types/backend/employee';

/**
 * Get employees data file path
 */
function getEmployeesFilePath(): string {
  // Priority 1: Environment variable
  const envPath = process.env.EMPLOYEES_DATA_PATH;
  if (envPath && envPath.trim() !== '') {
    return path.isAbsolute(envPath)
      ? envPath
      : path.resolve(process.cwd(), envPath);
  }

  // Priority 2: Default path in data directory
  return path.join(process.cwd(), 'data', 'employees.json');
}

/**
 * Employee data structure in JSON file
 */
interface EmployeesData {
  categories: EmployeeCategoryConfig[];
  employees: Employee[];
}

/**
 * Cached categories from JSON file
 */
let cachedCategories: EmployeeCategoryConfig[] | null = null;

/**
 * Load employees data from JSON file
 */
async function loadEmployeesData(): Promise<EmployeesData> {
  const filePath = getEmployeesFilePath();
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content) as EmployeesData;
    // Cache categories
    cachedCategories = data.categories || [];
    return {
      categories: data.categories || [],
      employees: data.employees || [],
    };
  } catch (error) {
    console.error('[EmployeeService] Error loading employees:', error);
    return { categories: [], employees: [] };
  }
}

/**
 * Load employees from JSON file
 */
async function loadEmployees(): Promise<Employee[]> {
  const data = await loadEmployeesData();
  return data.employees;
}

/**
 * Save employees to JSON file (preserving categories)
 */
async function saveEmployees(employees: Employee[]): Promise<void> {
  const filePath = getEmployeesFilePath();
  const dir = path.dirname(filePath);

  if (!fsSync.existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true });
  }

  // Load existing categories if not cached
  if (!cachedCategories) {
    await loadEmployeesData();
  }

  const data: EmployeesData = {
    categories: cachedCategories || [],
    employees,
  };
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Generate unique employee ID
 */
function generateId(): string {
  return `emp-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Get all employees
 */
export async function getAllEmployees(): Promise<Employee[]> {
  return loadEmployees();
}

/**
 * Get employee by ID
 */
export async function getEmployeeById(id: string): Promise<Employee | null> {
  const employees = await loadEmployees();
  return employees.find((e) => e.id === id) || null;
}

/**
 * Create new employee
 */
export async function createEmployee(
  input: CreateEmployeeInput
): Promise<Employee> {
  const employees = await loadEmployees();

  const now = new Date().toISOString();
  const newEmployee: Employee = {
    id: generateId(),
    name: input.name,
    description: input.description,
    category: input.category,
    mode: input.mode,
    system_prompt: input.system_prompt,
    system_prompt_plan: input.system_prompt_plan,
    system_prompt_execution: input.system_prompt_execution,
    is_builtin: false,
    created_at: now,
    updated_at: now,
  };

  employees.push(newEmployee);
  await saveEmployees(employees);

  return newEmployee;
}

/**
 * Update employee
 */
export async function updateEmployee(
  id: string,
  input: UpdateEmployeeInput
): Promise<Employee | null> {
  const employees = await loadEmployees();
  const index = employees.findIndex((e) => e.id === id);

  if (index === -1) {
    return null;
  }

  const existing = employees[index];
  const updated: Employee = {
    ...existing,
    name: input.name ?? existing.name,
    description: input.description ?? existing.description,
    category: input.category ?? existing.category,
    mode: input.mode ?? existing.mode,
    system_prompt: input.system_prompt ?? existing.system_prompt,
    system_prompt_plan: input.system_prompt_plan ?? existing.system_prompt_plan,
    system_prompt_execution:
      input.system_prompt_execution ?? existing.system_prompt_execution,
    updated_at: new Date().toISOString(),
  };

  employees[index] = updated;
  await saveEmployees(employees);

  return updated;
}

/**
 * Delete employee (builtin employees cannot be deleted)
 */
export async function deleteEmployee(id: string): Promise<boolean> {
  const employees = await loadEmployees();
  const employee = employees.find((e) => e.id === id);

  if (!employee) {
    throw new Error(`Employee not found: ${id}`);
  }

  if (employee.is_builtin) {
    throw new Error('Cannot delete builtin employee');
  }

  const filtered = employees.filter((e) => e.id !== id);
  await saveEmployees(filtered);

  return true;
}

/**
 * Get employee prompts for Claude service
 * Returns the actual prompt content or prompt key for DEFAULT_PROMPTS
 */
export async function getEmployeePrompts(employeeId: string): Promise<{
  mode: 'code' | 'work';
  systemPrompt?: string;
  planPrompt?: string;
  executionPrompt?: string;
} | null> {
  const employee = await getEmployeeById(employeeId);
  if (!employee) {
    return null;
  }

  if (employee.mode === 'work') {
    return {
      mode: 'work',
      systemPrompt: employee.system_prompt,
    };
  }

  return {
    mode: 'code',
    planPrompt: employee.system_prompt_plan,
    executionPrompt: employee.system_prompt_execution,
  };
}

/**
 * Get employee categories configuration
 */
export async function getEmployeeCategories(): Promise<EmployeeCategoryConfig[]> {
  if (cachedCategories) {
    return cachedCategories;
  }
  const data = await loadEmployeesData();
  return data.categories;
}
