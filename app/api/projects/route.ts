/**
 * Projects API Routes
 * GET /api/projects - Get all projects
 * POST /api/projects - Create new project
 */

import { NextRequest } from 'next/server';
import { getAllProjects, createProject } from '@/lib/services/project';
import type { CreateProjectInput } from '@/types/backend';
import { serializeProjects, serializeProject } from '@/lib/serializers/project';
import { getDefaultModelForCli, normalizeModelId } from '@/lib/constants/cliModels';
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/utils/api-response';
import { matchDemoKeyword } from '@/lib/services/demo-mode';

/**
 * GET /api/projects
 * Get all projects list
 */
export async function GET() {
  try {
    const projects = await getAllProjects();
    return createSuccessResponse(serializeProjects(projects));
  } catch (error) {
    return handleApiError(error, 'API', 'Failed to fetch projects');
  }
}

/**
 * POST /api/projects
 * Create new project
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const preferredCli = String(body.preferredCli || body.preferred_cli || 'claude').toLowerCase();
    const requestedModel = body.selectedModel || body.selected_model;
    const projectType = body.projectType || body.project_type || 'nextjs';
    const mode = body.mode || 'code'; // 'code' | 'work'
    const work_directory = body.work_directory;
    const employee_id = body.employee_id;

    const input: CreateProjectInput = {
      project_id: body.project_id,
      name: body.name,
      initialPrompt: body.initialPrompt || body.initial_prompt,
      preferredCli,
      selectedModel: normalizeModelId(preferredCli, requestedModel ?? getDefaultModelForCli(preferredCli)),
      description: body.description,
      projectType,
      mode,
      work_directory,
      employee_id,
    };

    // Validation
    if (!input.project_id || !input.name) {
      return createErrorResponse('project_id and name are required', undefined, 400);
    }

    // work mode: work_directory is optional, defaults to project directory

    // Debug log
    console.log(`[API] 📝 Creating project:`);
    console.log(`  - project_id: ${input.project_id}`);
    console.log(`  - mode: ${mode}`);
    console.log(`  - projectType: ${projectType}`);
    console.log(`  - work_directory: ${work_directory || '(will use project directory)'}`);

    // 演示模式前置检测：sourceProjectId 模式直接跳转，不创建新项目
    if (input.initialPrompt) {
      const demoConfig = await matchDemoKeyword(input.initialPrompt);
      if (demoConfig && demoConfig.sourceProjectId && !demoConfig.skillId) {
        console.log(`[API] Demo mode (sourceProjectId) detected, redirecting to: ${demoConfig.sourceProjectId}`);
        return createSuccessResponse({
          demoRedirect: {
            projectId: demoConfig.sourceProjectId,
            deployedUrl: demoConfig.deployedUrl,
          },
        });
      }
    }

    const project = await createProject(input);
    return createSuccessResponse(serializeProject(project), 201);
  } catch (error) {
    return handleApiError(error, 'API', 'Failed to create project');
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
