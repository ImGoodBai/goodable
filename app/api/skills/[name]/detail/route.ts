/**
 * Skill Detail API
 * GET /api/skills/{name}/detail - Get skill detail info (file tree, SKILL.md content)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSkillFileTree, getSkillMdContent, getAllSkills } from '@/lib/services/skill-service';

export const dynamic = 'force-dynamic';

export async function GET(
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

    // Get skill meta info
    const skills = await getAllSkills();
    const skill = skills.find(s => s.name === skillName);

    if (!skill) {
      return NextResponse.json(
        { success: false, error: 'Skill not found' },
        { status: 404 }
      );
    }

    // Get file tree and SKILL.md content
    const [fileTree, skillMdContent] = await Promise.all([
      getSkillFileTree(skillName),
      getSkillMdContent(skillName),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        skill,
        fileTree,
        skillMdContent,
      },
    });
  } catch (error) {
    console.error('[Skills Detail API] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
