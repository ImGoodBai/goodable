/**
 * Run Skill API
 * POST /api/skills/{name}/run - Run a skill as a project
 */

import { NextRequest, NextResponse } from 'next/server';
import { runSkill } from '@/lib/services/skill-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Skill name is required' },
        { status: 400 }
      );
    }

    const result = await runSkill(decodeURIComponent(name));
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[Skills Run API] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
