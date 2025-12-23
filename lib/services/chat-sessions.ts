import { db } from '@/lib/db/client';
import { sessions } from '@/lib/db/schema';
import { and, eq, inArray, desc } from 'drizzle-orm';

export async function getActiveSession(projectId: string) {
  const result = await db.select()
    .from(sessions)
    .where(
      and(
        eq(sessions.projectId, projectId),
        inArray(sessions.status, ['active', 'running'])
      )
    )
    .orderBy(desc(sessions.createdAt))
    .limit(1);

  return result[0] || null;
}

export async function getSessionById(projectId: string, sessionId: string) {
  const result = await db.select()
    .from(sessions)
    .where(
      and(
        eq(sessions.projectId, projectId),
        eq(sessions.id, sessionId)
      )
    )
    .limit(1);

  return result[0] || null;
}
