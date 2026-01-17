/**
 * Employees API - List and Create
 * GET /api/employees - Get all employees
 * POST /api/employees - Create new employee
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllEmployees, createEmployee } from '@/lib/services/employee-service';
import type { CreateEmployeeInput } from '@/types/backend/employee';

export async function GET() {
  try {
    const employees = await getAllEmployees();
    return NextResponse.json({ success: true, data: employees });
  } catch (error) {
    console.error('[Employees API] Error getting employees:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateEmployeeInput;

    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { success: false, error: 'name is required' },
        { status: 400 }
      );
    }

    if (!body.mode || !['code', 'work'].includes(body.mode)) {
      return NextResponse.json(
        { success: false, error: 'mode must be "code" or "work"' },
        { status: 400 }
      );
    }

    if (!body.category) {
      return NextResponse.json(
        { success: false, error: 'category is required' },
        { status: 400 }
      );
    }

    // Validate prompts based on mode
    if (body.mode === 'work' && !body.system_prompt) {
      return NextResponse.json(
        { success: false, error: 'system_prompt is required for work mode' },
        { status: 400 }
      );
    }

    if (body.mode === 'code') {
      if (!body.system_prompt_plan || !body.system_prompt_execution) {
        return NextResponse.json(
          { success: false, error: 'system_prompt_plan and system_prompt_execution are required for code mode' },
          { status: 400 }
        );
      }
    }

    const employee = await createEmployee(body);
    return NextResponse.json({ success: true, data: employee });
  } catch (error) {
    console.error('[Employees API] Error creating employee:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
