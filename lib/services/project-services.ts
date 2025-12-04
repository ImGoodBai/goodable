import { prisma } from '@/lib/db/client';
import type { ProjectServiceConnection } from '@prisma/client';
import { timelineLogger } from '@/lib/services/timeline';

function serializeServiceData(data: Record<string, unknown>): string {
  return JSON.stringify(data ?? {});
}

function deserializeServiceData(connection: ProjectServiceConnection) {
  try {
    return {
      ...connection,
      serviceData: connection.serviceData ? JSON.parse(connection.serviceData) : {},
    };
  } catch (error) {
    console.error(
      `[ProjectServices] Failed to deserialize service data for connection ${connection.id}:`,
      error instanceof Error ? error.message : 'Unknown error',
      '\nRaw data:',
      connection.serviceData
    );
    return {
      ...connection,
      serviceData: {},
    };
  }
}

export async function listProjectServices(projectId: string) {
  try {
    const connections = await prisma.projectServiceConnection.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    return connections.map(deserializeServiceData);
  } catch (error) {
    try {
      await timelineLogger.append({
        type: 'api',
        level: 'error',
        message: 'List project services failed',
        projectId,
        component: 'services',
        event: 'services.error',
        metadata: { message: error instanceof Error ? error.message : 'Unknown error' }
      });
      await timelineLogger.append({
        type: 'api',
        level: 'info',
        message: 'Graceful degrade: return empty list',
        projectId,
        component: 'services',
        event: 'services.degrade'
      });
    } catch {}
    return [];
  }
}

export async function getProjectService(projectId: string, provider: string) {
  const connection = await prisma.projectServiceConnection.findFirst({
    where: { projectId, provider },
  });

  return connection ? deserializeServiceData(connection) : null;
}

export async function upsertProjectServiceConnection(
  projectId: string,
  provider: string,
  serviceData: Record<string, unknown>
) {
  const existing = await prisma.projectServiceConnection.findFirst({
    where: { projectId, provider },
  });

  if (existing) {
    const updated = await prisma.projectServiceConnection.update({
      where: { id: existing.id },
      data: {
        serviceData: serializeServiceData(serviceData),
        status: 'connected',
      },
    });
    return deserializeServiceData(updated);
  }

  const created = await prisma.projectServiceConnection.create({
    data: {
      projectId,
      provider,
      status: 'connected',
      serviceData: serializeServiceData(serviceData),
    },
  });

  return deserializeServiceData(created);
}

export async function deleteProjectService(projectId: string, provider: string): Promise<boolean> {
  try {
    const connection = await prisma.projectServiceConnection.findFirst({
      where: { projectId, provider },
    });

    if (!connection) {
      return false;
    }

    await prisma.projectServiceConnection.delete({
      where: { id: connection.id },
    });
    return true;
  } catch (error) {
    return false;
  }
}

export async function updateProjectServiceData(
  projectId: string,
  provider: string,
  patch: Record<string, unknown>
) {
  const existing = await prisma.projectServiceConnection.findFirst({
    where: { projectId, provider },
  });

  const nextData = {
    ...(existing ? (existing.serviceData ? JSON.parse(existing.serviceData) : {}) : {}),
    ...patch,
  };

  if (existing) {
    const updated = await prisma.projectServiceConnection.update({
      where: { id: existing.id },
      data: { serviceData: serializeServiceData(nextData) },
    });
    return deserializeServiceData(updated);
  }

  const created = await prisma.projectServiceConnection.create({
    data: {
      projectId,
      provider,
      status: 'connected',
      serviceData: serializeServiceData(nextData),
    },
  });

  return deserializeServiceData(created);
}
