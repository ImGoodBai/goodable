import { db } from '@/lib/db/client';
import { projectServiceConnections } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { generateId } from '@/lib/utils/id';
import { timelineLogger } from '@/lib/services/timeline';

type ProjectServiceConnection = typeof projectServiceConnections.$inferSelect;

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
    const connections = await db.select()
      .from(projectServiceConnections)
      .where(eq(projectServiceConnections.projectId, projectId))
      .orderBy(desc(projectServiceConnections.createdAt));
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
  const result = await db.select()
    .from(projectServiceConnections)
    .where(
      and(
        eq(projectServiceConnections.projectId, projectId),
        eq(projectServiceConnections.provider, provider)
      )
    )
    .limit(1);

  return result[0] ? deserializeServiceData(result[0]) : null;
}

export async function upsertProjectServiceConnection(
  projectId: string,
  provider: string,
  serviceData: Record<string, unknown>
) {
  const existing = await db.select()
    .from(projectServiceConnections)
    .where(
      and(
        eq(projectServiceConnections.projectId, projectId),
        eq(projectServiceConnections.provider, provider)
      )
    )
    .limit(1);

  const nowIso = new Date().toISOString();

  if (existing[0]) {
    const [updated] = await db.update(projectServiceConnections)
      .set({
        serviceData: serializeServiceData(serviceData),
        status: 'connected',
        updatedAt: nowIso,
      })
      .where(eq(projectServiceConnections.id, existing[0].id))
      .returning();
    return deserializeServiceData(updated);
  }

  const [created] = await db.insert(projectServiceConnections)
    .values({
      id: generateId(),
      projectId,
      provider,
      status: 'connected',
      serviceData: serializeServiceData(serviceData),
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .returning();

  return deserializeServiceData(created);
}

export async function deleteProjectService(projectId: string, provider: string): Promise<boolean> {
  try {
    const connection = await db.select()
      .from(projectServiceConnections)
      .where(
        and(
          eq(projectServiceConnections.projectId, projectId),
          eq(projectServiceConnections.provider, provider)
        )
      )
      .limit(1);

    if (!connection[0]) {
      return false;
    }

    await db.delete(projectServiceConnections)
      .where(eq(projectServiceConnections.id, connection[0].id));
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
  const existing = await db.select()
    .from(projectServiceConnections)
    .where(
      and(
        eq(projectServiceConnections.projectId, projectId),
        eq(projectServiceConnections.provider, provider)
      )
    )
    .limit(1);

  const nextData = {
    ...(existing[0] ? (existing[0].serviceData ? JSON.parse(existing[0].serviceData) : {}) : {}),
    ...patch,
  };

  const nowIso = new Date().toISOString();

  if (existing[0]) {
    const [updated] = await db.update(projectServiceConnections)
      .set({
        serviceData: serializeServiceData(nextData),
        updatedAt: nowIso,
      })
      .where(eq(projectServiceConnections.id, existing[0].id))
      .returning();
    return deserializeServiceData(updated);
  }

  const [created] = await db.insert(projectServiceConnections)
    .values({
      id: generateId(),
      projectId,
      provider,
      status: 'connected',
      serviceData: serializeServiceData(nextData),
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .returning();

  return deserializeServiceData(created);
}
