/**
 * Skill Env Vars API
 * GET /api/skills/{name}/env - Read skill .env vars
 * POST /api/skills/{name}/env - Save skill .env vars
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSkillEnvVars, saveSkillEnvVars } from '@/lib/services/skill-service';

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

    const vars = await getSkillEnvVars(decodeURIComponent(name));
    return NextResponse.json({ success: true, data: vars });
  } catch (error) {
    console.error('[Skills Env API] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

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

    const body = await request.json();
    const vars = body.vars as Record<string, string>;

    if (!vars || typeof vars !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid vars format' },
        { status: 400 }
      );
    }

    await saveSkillEnvVars(decodeURIComponent(name), vars);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Skills Env API] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
