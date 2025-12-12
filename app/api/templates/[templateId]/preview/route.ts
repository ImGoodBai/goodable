/**
 * GET /api/templates/[templateId]/preview - Get template preview image
 * Returns template preview image or generates a default placeholder
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTemplateById } from '@/lib/services/template';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

/**
 * Generate default SVG preview image with template name
 */
function generateDefaultPreview(templateName: string): string {
  // Create a simple SVG with gray background and template name
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
  >${templateName}</text>
</svg>`;

  return svg;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { templateId: string } }
) {
  try {
    const { templateId } = params;

    // Get template
    const template = await getTemplateById(templateId);
    if (!template) {
      return NextResponse.json(
        { success: false, error: 'Template not found' },
        { status: 404 }
      );
    }

    // Try to read preview image
    if (template.hasPreview) {
      const previewPath = template.preview
        ? path.join(template.templatePath, template.preview)
        : path.join(template.templatePath, 'preview.png');

      try {
        const imageBuffer = await fs.readFile(previewPath);
        const ext = path.extname(previewPath).toLowerCase();

        // Determine content type
        let contentType = 'image/png';
        if (ext === '.jpg' || ext === '.jpeg') {
          contentType = 'image/jpeg';
        } else if (ext === '.svg') {
          contentType = 'image/svg+xml';
        } else if (ext === '.webp') {
          contentType = 'image/webp';
        }

        return new NextResponse(imageBuffer, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600',
          },
        });
      } catch (error) {
        console.warn(`[API] Failed to read preview image for ${templateId}:`, error);
        // Fall through to generate default preview
      }
    }

    // Generate default SVG preview
    const svg = generateDefaultPreview(template.name);
    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('[API] Failed to get template preview:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to load preview',
      },
      { status: 500 }
    );
  }
}
