import { db, sqlite } from '@/lib/db/client';
import { userRequests } from '@/lib/db/schema';
import { eq, count as drizzleCount, inArray } from 'drizzle-orm';

export interface ActiveRequestSummary {
  hasActiveRequests: boolean;
  activeCount: number;
}

export async function getActiveRequests(projectId: string): Promise<ActiveRequestSummary> {
  const result = await db.select({ count: drizzleCount() })
    .from(userRequests)
    .where(
      inArray(userRequests.status, ['pending', 'processing', 'planning', 'waiting_approval', 'implementing', 'active', 'running'] as const)
    );

  const activeCount = result[0]?.count ?? 0;

  return {
    hasActiveRequests: activeCount > 0,
    activeCount,
  };
}

export type UserRequestStatus =
  | 'pending'
  | 'processing'
  | 'planning'
  | 'waiting_approval'
  | 'implementing'
  | 'active'
  | 'running'
  | 'completed'
  | 'failed';

interface UpsertUserRequestOptions {
  id: string;
  projectId: string;
  instruction: string;
  cliPreference?: string | null;
}

function isNotFoundError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    return error.code === 'SQLITE_ERROR';
  }
  return false;
}

async function handleNotFound(error: unknown, context: string): Promise<void> {
  if (isNotFoundError(error)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[UserRequests] ${context}: record not found`);
    }
    return;
  }

  throw error;
}

/**
 * Create or update a user request record.
 * Uses the client-provided requestId as the primary key.
 */
export async function upsertUserRequest({
  id,
  projectId,
  instruction,
  cliPreference,
}: UpsertUserRequestOptions) {
  const existing = await db.select()
    .from(userRequests)
    .where(eq(userRequests.id, id))
    .limit(1);

  const nowIso = new Date().toISOString();

  if (existing[0]) {
    const [updated] = await db.update(userRequests)
      .set({
        instruction,
        ...(cliPreference !== undefined ? { cliPreference } : {}),
      })
      .where(eq(userRequests.id, id))
      .returning();
    return updated;
  } else {
    const [created] = await db.insert(userRequests)
      .values({
        id,
        projectId,
        instruction,
        status: 'pending',
        createdAt: nowIso,
        ...(cliPreference !== undefined ? { cliPreference } : {}),
      })
      .returning();
    return created;
  }
}

async function updateStatus(
  id: string,
  status: UserRequestStatus,
  options: { errorMessage?: string | null; setCompletionTimestamp?: boolean } = {}
) {
  try {
    const data: Record<string, any> = {
      status,
    };

    if (options.setCompletionTimestamp ?? (status === 'completed' || status === 'failed')) {
      data.completedAt = new Date().toISOString();
    } else if (status === 'pending' || status === 'processing' || status === 'running' || status === 'active') {
      data.completedAt = null;
    }

    if ('errorMessage' in options) {
      data.errorMessage = options.errorMessage ?? null;
    } else if (status !== 'failed') {
      data.errorMessage = null;
    }

    await db.update(userRequests)
      .set(data)
      .where(eq(userRequests.id, id));
  } catch (error) {
    await handleNotFound(error, `update status to ${status}`);
  }
}

export async function markUserRequestAsRunning(id: string): Promise<void> {
  await updateStatus(id, 'running');
}

export async function markUserRequestAsProcessing(id: string): Promise<void> {
  await updateStatus(id, 'processing');
}

export async function markUserRequestAsPlanning(id: string): Promise<void> {
  await updateStatus(id, 'planning');
}

export async function markUserRequestAsWaitingApproval(id: string): Promise<void> {
  await updateStatus(id, 'waiting_approval');
}

export async function markUserRequestAsImplementing(id: string): Promise<void> {
  await updateStatus(id, 'implementing');
}

export async function markUserRequestAsCompleted(id: string): Promise<void> {
  await updateStatus(id, 'completed', {
    errorMessage: null,
    setCompletionTimestamp: true,
  });
}

export async function markUserRequestAsFailed(
  id: string,
  errorMessage?: string,
): Promise<void> {
  await updateStatus(id, 'failed', {
    errorMessage: errorMessage ?? 'Request failed',
    setCompletionTimestamp: true,
  });
}

export async function requestCancelForUserRequest(id: string): Promise<void> {
  try {
    await db.update(userRequests)
      .set({
        cancelRequested: true,
        cancelRequestedAt: new Date().toISOString(),
      })
      .where(eq(userRequests.id, id));
  } catch (error) {
    await handleNotFound(error, 'request cancel');
  }
}

export async function isCancelRequested(id: string): Promise<boolean> {
  try {
    const result = await db.select({ cancelRequested: userRequests.cancelRequested })
      .from(userRequests)
      .where(eq(userRequests.id, id))
      .limit(1);
    return !!result[0]?.cancelRequested;
  } catch (error) {
    await handleNotFound(error, 'check cancelRequested');
    return false;
  }
}

export async function getUserRequestById(id: string) {
  try {
    const result = await db.select()
      .from(userRequests)
      .where(eq(userRequests.id, id))
      .limit(1);
    return result[0] ?? null;
  } catch (error) {
    await handleNotFound(error, 'get user request');
    return null;
  }
}
