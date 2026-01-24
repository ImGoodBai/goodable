/**
 * Fork Skill API
 * POST /api/skills/{name}/fork - Fork a skill to create a new project
 */

import { NextRequest, NextResponse } from 'next/server';
import { forkSkill } from '@/lib/services/skill-service';
import { checkSkillHasMock, executeDemoModeForSkill } from '@/lib/services/demo-mode';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

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

    const skillName = decodeURIComponent(name);

    // Fork skill to create new project
    const result = await forkSkill(skillName);

    // Check if skill has mock.json and trigger demo replay
    const hasMock = await checkSkillHasMock(skillName);
    if (hasMock) {
      const requestId = randomUUID();
      console.log(`[API] Skill ${skillName} has mock.json, triggering demo replay for ${result.projectId}`);
      // Run demo replay asynchronously (don't block the response)
      executeDemoModeForSkill(skillName, result.projectId, requestId).catch(err => {
        console.error(`[API] Demo replay failed for ${result.projectId}:`, err);
      });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[Skills Fork API] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
