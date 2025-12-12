/**
 * POST /api/templates/[templateId]/create - Create new project from template
 */

import { NextRequest, NextResponse } from 'next/server';
import { createProjectFromTemplate } from '@/lib/services/template';

export const dynamic = 'force-dynamic';

interface CreateProjectRequest {
  name?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { templateId: string } }
) {
  try {
    const { templateId } = params;
    const body: CreateProjectRequest = await request.json().catch(() => ({}));

    // Create project from template
    const result = await createProjectFromTemplate(templateId, body.name);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[API] Failed to create project from template:', error);

    const errorMessage = error instanceof Error ? error.message : 'Failed to create project';

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
