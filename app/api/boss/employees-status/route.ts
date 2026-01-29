import { NextResponse } from 'next/server';
import { getAllEmployees } from '@/lib/services/employee-service';
import { getActiveTaskForProject } from '@/lib/services/user-requests';
import { db } from '@/lib/db/client';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  try {
    // Get all employees
    const employees = await getAllEmployees();

    // For each employee, query their projects and active tasks
    const result = [];

    for (const employee of employees) {
      // Query all projects for this employee
      const employeeProjects = await db.select()
        .from(projects)
        .where(eq(projects.employee_id, employee.id));

      // Filter running tasks (within 60 minutes for boss mode)
      const runningTasks = [];
      for (const project of employeeProjects) {
        const activeTask = await getActiveTaskForProject(project.id, 60);
        if (activeTask) {
          runningTasks.push({
            id: project.id,
            name: project.name,
            status: activeTask.status,
            instruction: activeTask.instruction,
            createdAt: project.createdAt,
          });
        }
      }

      result.push({
        id: employee.id,
        name: employee.name,
        description: employee.description,
        category: employee.category,
        mode: employee.mode,
        runningTasks,
        totalTaskCount: employeeProjects.length,
      });
    }

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[Boss API] Error getting employee status:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get employee status' },
      { status: 500 }
    );
  }
}
