/**
 * GET /api/templates - Get all available templates
 */

import { NextResponse } from 'next/server';
import { getAllTemplates } from '@/lib/services/template';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const templates = await getAllTemplates();

    // Return templates with preview URL
    const templatesWithPreview = templates.map(template => ({
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      tags: template.tags || [],
      version: template.version,
      author: template.author,
      createdAt: template.createdAt,
      hasPreview: template.hasPreview,
      previewUrl: `/api/templates/${template.id}/preview`,
    }));

    return NextResponse.json({
      success: true,
      data: templatesWithPreview,
    });
  } catch (error) {
    console.error('[API] Failed to get templates:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to load templates',
      },
      { status: 500 }
    );
  }
}
