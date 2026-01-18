/**
 * /api/repo/[project_id]/file
 * Retrieve and update file content
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import {
  readProjectFileContent,
  writeProjectFileContent,
  FileBrowserError,
} from '@/lib/services/file-browser';
import { getProjectById } from '@/lib/services/project';

interface RouteContext {
  params: Promise<{ project_id: string }>;
}

// Infer content type from file extension
function inferContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    // Images
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    // Videos
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    // PDF
    '.pdf': 'application/pdf',
    // Audio
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    // Text
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.md': 'text/markdown',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// Resolve safe file path within project
async function resolveProjectFilePath(
  projectId: string,
  filePath: string
): Promise<string> {
  const project = await getProjectById(projectId);
  if (!project) {
    throw new FileBrowserError('Project not found', 404);
  }

  // Get repo root
  let repoRoot: string;
  if ((project as any).work_directory) {
    repoRoot = path.resolve((project as any).work_directory);
  } else {
    const repoPath = project.repoPath || path.join('data', 'projects', project.id);
    repoRoot = path.isAbsolute(repoPath) ? repoPath : path.resolve(process.cwd(), repoPath);
  }

  // Normalize and resolve path
  const normalizedPath = filePath.replace(/\\/g, '/').replace(/^\.?\/?/, '');
  const absolutePath = path.resolve(repoRoot, normalizedPath);

  // Security check: ensure path is within repo root
  if (!absolutePath.startsWith(repoRoot + path.sep) && absolutePath !== repoRoot) {
    throw new FileBrowserError('Path traversal not allowed', 400);
  }

  return absolutePath;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { project_id } = await params;
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('path');
    const raw = searchParams.get('raw') === 'true';

    if (!filePath) {
      return NextResponse.json(
        { error: 'path query parameter is required' },
        { status: 400 }
      );
    }

    // Raw mode: return binary file directly
    if (raw) {
      const absolutePath = await resolveProjectFilePath(project_id, filePath);

      // Check file exists
      let stats;
      try {
        stats = await fs.stat(absolutePath);
      } catch {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }

      if (!stats.isFile()) {
        return NextResponse.json({ error: 'Not a file' }, { status: 400 });
      }

      // Read file as binary
      const fileBuffer = await fs.readFile(absolutePath);
      const contentType = inferContentType(absolutePath);

      const response = new NextResponse(fileBuffer as unknown as BodyInit);
      response.headers.set('Content-Type', contentType);
      response.headers.set('Content-Length', stats.size.toString());
      response.headers.set('Cache-Control', 'private, max-age=3600');
      return response;
    }

    // Text mode: return JSON with content
    const file = await readProjectFileContent(project_id, filePath);
    const response = NextResponse.json(file);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    if (error instanceof FileBrowserError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error('[API] Failed to read file:', error);
    return NextResponse.json(
      { error: 'Failed to read file' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const { project_id } = await params;
    const body = await request.json();
    const path = body?.path;
    const content = body?.content;

    if (!path || typeof path !== 'string') {
      return NextResponse.json(
        { error: 'path is required' },
        { status: 400 }
      );
    }

    if (typeof content !== 'string') {
      return NextResponse.json(
        { error: 'content must be a string' },
        { status: 400 }
      );
    }

    await writeProjectFileContent(project_id, path, content);
    return NextResponse.json({ success: true, path });
  } catch (error) {
    if (error instanceof FileBrowserError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error('[API] Failed to write file:', error);
    return NextResponse.json(
      { error: 'Failed to write file' },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
