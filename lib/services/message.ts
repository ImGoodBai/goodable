/**
 * Message Service - Message processing logic
 */

import { db } from '@/lib/db/client';
import { messages } from '@/lib/db/schema';
import { eq, and, asc, count } from 'drizzle-orm';
import { generateId } from '@/lib/utils/id';
import type { Message, CreateMessageInput } from '@/types/backend';
import { timelineLogger } from '@/lib/services/timeline';

function mapDrizzleMessage(message: typeof messages.$inferSelect): Message {
  return {
    id: message.id,
    projectId: message.projectId,
    conversationId: message.conversationId ?? null,
    sessionId: message.sessionId ?? null,
    role: message.role as Message['role'],
    content: message.content,
    messageType: message.messageType as Message['messageType'],
    metadataJson: message.metadataJson ?? null,
    parentMessageId: message.parentMessageId ?? null,
    cliSource: message.cliSource ?? null,
    createdAt: message.createdAt,
    updatedAt: message.createdAt, // Drizzle messages don't have updatedAt
    requestId: message.requestId ?? null,
  };
}

/**
 * Retrieve project messages (with pagination)
 */
export async function getMessagesByProjectId(
  projectId: string,
  limit: number = 50,
  offset: number = 0
): Promise<Message[]> {
  const result = await db.select()
    .from(messages)
    .where(eq(messages.projectId, projectId))
    .orderBy(asc(messages.createdAt))
    .limit(limit)
    .offset(offset);

  return result.map(mapDrizzleMessage);
}

/**
 * Create new message
 */
export async function createMessage(input: CreateMessageInput): Promise<Message> {
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : undefined;
  const metadataLength = metadataJson ? metadataJson.length : 0;
  const metadataPreview =
    metadataJson && metadataJson.length > 0
      ? `${metadataJson.substring(0, 500)}${metadataJson.length > 500 ? '...' : ''}`
      : '';
  let lastError: Error | null = null;

  try {
    const isTool = input.role === 'tool';
    const domain: 'sdk' | 'system' = isTool ? 'sdk' : 'system';
    const event = isTool
      ? (input.messageType === 'tool_result' ? 'sdk.tool_result' : 'sdk.tool_use')
      : (input.role === 'assistant' ? 'chat.assistant_message' : input.role === 'user' ? 'chat.user_message' : 'message.create');
    const textPreview = typeof input.content === 'string' ? (input.content.substring(0, 500) + (input.content.length > 500 ? '...' : '')) : '';
    await timelineLogger.append({
      type: domain,
      level: 'info',
      message: '[MessageService] Creating message with metadata',
      projectId: input.projectId,
      component: domain,
      event,
      metadata: {
        role: input.role,
        messageType: input.messageType,
        text: textPreview,
        metadataKeys: input.metadata ? Object.keys(input.metadata) : [],
        metadataJsonLength: metadataLength,
        metadataJson,
        requestId: input.requestId,
      },
    });
  } catch {}

  console.log('[MessageService] Creating message with metadata:', {
    messageId: input.id,
    projectId: input.projectId,
    role: input.role,
    hasMetadata: !!input.metadata,
    metadataKeys: input.metadata ? Object.keys(input.metadata) : [],
    metadataJsonLength: metadataLength,
    metadataJson: metadataPreview,
  });

  // Retry logic with exponential backoff for database operations
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const nowIso = new Date().toISOString();
      const [message] = await db.insert(messages)
        .values({
          id: input.id || generateId(),
          projectId: input.projectId,
          role: input.role,
          messageType: input.messageType,
          content: input.content,
          metadataJson: metadataJson ?? null,
          sessionId: input.sessionId ?? null,
          conversationId: input.conversationId ?? null,
          cliSource: input.cliSource ?? null,
          requestId: input.requestId ?? null,
          createdAt: nowIso,
        })
        .returning();

      console.log(`[MessageService] Created message: ${message.id} (${input.role})${input.requestId ? ` [requestId: ${input.requestId}]` : ''} on attempt ${attempt}`);
      console.log('[MessageService] Stored metadataJson length:', metadataLength);

      const mappedMessage = mapDrizzleMessage(message);
      const mappedMetadataLength = mappedMessage.metadataJson ? mappedMessage.metadataJson.length : 0;
      const mappedMetadataPreview =
        mappedMessage.metadataJson && mappedMetadataLength > 0
          ? `${mappedMessage.metadataJson.substring(0, 200)}${mappedMetadataLength > 200 ? '...' : ''}`
          : '';
      console.log('[MessageService] Mapped message metadata:', {
        hasMetadataJson: mappedMetadataLength > 0,
        metadataJsonLength: mappedMetadataLength,
        metadataJsonPreview: mappedMetadataPreview,
      });

      try {
        const isTool = input.role === 'tool';
        const domain: 'sdk' | 'system' = isTool ? 'sdk' : 'system';
        const event = isTool
          ? (input.messageType === 'tool_result' ? 'sdk.tool_result' : 'sdk.tool_use')
          : (input.role === 'assistant' ? 'chat.assistant_message' : input.role === 'user' ? 'chat.user_message' : 'message.created');
        const mappedTextPreview = typeof mappedMessage.content === 'string' ? (mappedMessage.content.substring(0, 500) + (mappedMessage.content.length > 500 ? '...' : '')) : '';
        await timelineLogger.append({
          type: domain,
          level: 'info',
          message: '[MessageService] Mapped message metadata',
          projectId: input.projectId,
          component: domain,
          event,
          metadata: {
            role: input.role,
            messageType: input.messageType,
            text: mappedTextPreview,
            metadataJsonLength: mappedMetadataLength,
            metadataJson: mappedMessage.metadataJson ?? undefined,
            requestId: input.requestId,
          },
        });
      } catch {}

      return mappedMessage;
    } catch (error) {
      lastError = error as Error;
      console.error(`[MessageService] Attempt ${attempt} failed to create message:`, error);

      if (attempt < 3) {
        // Exponential backoff: 200ms, 400ms
        const delayMs = Math.pow(2, attempt) * 100;
        console.log(`[MessageService] Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  // All retries failed
  console.error('[MessageService] All retry attempts failed to create message:', lastError);
  throw lastError || new Error('Failed to create message after 3 attempts');
}

/**
 * Get total count of messages for a project
 */
export async function getMessagesCountByProjectId(projectId: string): Promise<number> {
  const result = await db.select({ count: count() })
    .from(messages)
    .where(eq(messages.projectId, projectId));

  return result[0]?.count ?? 0;
}

/**
 * Delete all project messages
 */
export async function deleteMessagesByProjectId(projectId: string, conversationId?: string): Promise<number> {
  const whereCondition = conversationId
    ? and(eq(messages.projectId, projectId), eq(messages.conversationId, conversationId))
    : eq(messages.projectId, projectId);

  const result = await db.delete(messages)
    .where(whereCondition)
    .returning({ id: messages.id });

  const deletedCount = result.length;
  const scopeLabel = conversationId ? ` (conversation ${conversationId})` : '';
  console.log(`[MessageService] Deleted ${deletedCount} messages for project: ${projectId}${scopeLabel}`);
  return deletedCount;
}
