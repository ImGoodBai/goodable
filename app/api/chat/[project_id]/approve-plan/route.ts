import { NextRequest, NextResponse } from 'next/server';
import { getProjectById, updateProjectActivity } from '@/lib/services/project';
import { applyChanges as applyClaudeChanges } from '@/lib/services/cli/claude';
import { applyChanges as applyCursorChanges } from '@/lib/services/cli/cursor';
import { applyChanges as applyQwenChanges } from '@/lib/services/cli/qwen';
import { applyChanges as applyGLMChanges } from '@/lib/services/cli/glm';
import { applyChanges as applyCodexChanges } from '@/lib/services/cli/codex';
import { PROJECTS_DIR_ABSOLUTE } from '@/lib/config/paths';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { getUserRequestById, markUserRequestAsImplementing } from '@/lib/services/user-requests';

interface RouteContext {
  params: Promise<{ project_id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { project_id } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
    const approve = body.approve === true || body.approve === 'true';
    const modification = typeof body.modification === 'string' ? body.modification.trim() : '';

    if (!requestId) {
      return NextResponse.json({ success: false, error: 'requestId is required' }, { status: 400 });
    }

    const project = await getProjectById(project_id);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const req = await getUserRequestById(requestId);
    if (!req) {
      return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });
    }

    const projectPath = project.repoPath || path.join(process.cwd(), 'projects', project_id);
    const cliPreference = (req.cliPreference || project.preferredCli || 'claude').toLowerCase();
    const instructionBase = req.instruction || '';
    const instruction = approve ? instructionBase : [instructionBase, modification].filter(Boolean).join('\n\n');

    await updateProjectActivity(project_id);

    try {
      const home = os.homedir();
      const plansDir = path.join(home, '.claude', 'plans');
      const entries = await fs.readdir(plansDir).catch(() => [] as string[]);
      if (Array.isArray(entries) && entries.length > 0) {
        const stats = await Promise.all(entries.map(async (name) => ({ name, stat: await fs.stat(path.join(plansDir, name)).catch(() => null) })));
        const valid = stats.filter((s) => !!s.stat) as Array<{ name: string; stat: any }>;
        if (valid.length > 0) {
          valid.sort((a, b) => (b.stat.mtimeMs || 0) - (a.stat.mtimeMs || 0));
          const latest = valid[0];
          const destDir = path.join(PROJECTS_DIR_ABSOLUTE, project_id, 'logs', 'plans');
          await fs.mkdir(destDir, { recursive: true }).catch(() => {});
          const src = path.join(plansDir, latest.name);
          const dest = path.join(destDir, latest.name);
          await fs.copyFile(src, dest).catch(() => {});
        }
      }
    } catch {}

    await markUserRequestAsImplementing(requestId);

    try {
      // 锁定项目进入生成/实施阶段
      await (await import('@/lib/services/project')).updateProject(project_id, { planConfirmed: true });
    } catch (error) {
      console.warn('[API] Failed to mark project planConfirmed:', error);
    }

    const executor =
      cliPreference === 'codex' ? applyCodexChanges :
      cliPreference === 'cursor' ? applyCursorChanges :
      cliPreference === 'qwen' ? applyQwenChanges :
      cliPreference === 'glm' ? applyGLMChanges : applyClaudeChanges;

    const sessionId =
      cliPreference === 'claude' ? project.activeClaudeSessionId || undefined :
      cliPreference === 'cursor' ? project.activeCursorSessionId || undefined : undefined;

    executor(project_id, projectPath, instruction, project.selectedModel || undefined, sessionId, requestId).catch((error) => {
      console.error('[API] Failed to execute approved plan:', error);
    });

    return NextResponse.json({ success: true, message: '执行已开始', requestId });
  } catch (error) {
    console.error('[API] Failed to approve plan:', error);
    return NextResponse.json({ success: false, error: 'Failed to approve plan' }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
