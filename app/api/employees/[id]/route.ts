/**
 * Employee API - Get, Update, Delete single employee
 * GET /api/employees/[id] - Get employee by ID
 * PUT /api/employees/[id] - Update employee
 * DELETE /api/employees/[id] - Delete employee
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
} from '@/lib/services/employee-service';
import type { UpdateEmployeeInput } from '@/types/backend/employee';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const employee = await getEmployeeById(id);

    if (!employee) {
      return NextResponse.json(
        { success: false, error: 'Employee not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: employee });
  } catch (error) {
    console.error('[Employee API] Error getting employee:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = (await request.json()) as UpdateEmployeeInput;

    const updated = await updateEmployee(id, body);

    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Employee not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('[Employee API] Error updating employee:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    await deleteEmployee(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Employee API] Error deleting employee:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('not found') ? 404 : message.includes('builtin') ? 403 : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
