/**
 * GET /api/projects/[project_id]/thumbnail - Get project thumbnail image
 * Generates default thumbnail image with project name
 */

import { NextRequest, NextResponse } from 'next/server';
import { getProjectById } from '@/lib/services/project';

export const dynamic = 'force-dynamic';

/**
 * Generate default SVG thumbnail image with project name
 */
function generateDefaultThumbnail(projectName: string): string {
  // Create a simple SVG with gray background and project name
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="600" fill="#E5E7EB"/>
  <text
    x="50%"
    y="50%"
    dominant-baseline="middle"
    text-anchor="middle"
    font-family="Arial, sans-serif"
    font-size="48"
    font-weight="bold"
    fill="#6B7280"
  >${projectName}</text>
</svg>`;

  return svg;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ project_id: string }> }
) {
  try {
    const { project_id } = await params;

    // Get project
    const project = await getProjectById(project_id);
    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    // Generate default SVG thumbnail
    const svg = generateDefaultThumbnail(project.name);
    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('[API] Failed to get project thumbnail:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to load thumbnail',
      },
      { status: 500 }
    );
  }
}
