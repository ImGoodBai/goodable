/**
 * Employee statistics API
 * Returns task count and token usage per employee
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { projects, messages } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

export async function GET() {
  try {
    // Get project count per employee
    const projectStats = await db
      .select({
        employee_id: projects.employee_id,
        task_count: sql<number>`count(*)`.as('task_count'),
      })
      .from(projects)
      .where(sql`${projects.employee_id} IS NOT NULL`)
      .groupBy(projects.employee_id);

    // Get token usage per employee (through projects -> messages)
    const tokenStats = await db
      .select({
        employee_id: projects.employee_id,
        total_tokens: sql<number>`COALESCE(SUM(${messages.tokenCount}), 0)`.as('total_tokens'),
      })
      .from(projects)
      .leftJoin(messages, sql`${messages.projectId} = ${projects.id}`)
      .where(sql`${projects.employee_id} IS NOT NULL`)
      .groupBy(projects.employee_id);

    // Merge stats into a map
    const statsMap: Record<string, { task_count: number; total_tokens: number }> = {};

    for (const row of projectStats) {
      if (row.employee_id) {
        statsMap[row.employee_id] = {
          task_count: row.task_count || 0,
          total_tokens: 0,
        };
      }
    }

    for (const row of tokenStats) {
      if (row.employee_id) {
        if (!statsMap[row.employee_id]) {
          statsMap[row.employee_id] = { task_count: 0, total_tokens: 0 };
        }
        statsMap[row.employee_id].total_tokens = row.total_tokens || 0;
      }
    }

    return NextResponse.json({ data: statsMap });
  } catch (error) {
    console.error('[API] Failed to get employee stats:', error);
    return NextResponse.json(
      { error: 'Failed to get employee stats' },
      { status: 500 }
    );
  }
}
