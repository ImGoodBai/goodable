/**
 * Server-Sent Events (SSE) Stream API
 * GET /api/chat/[project_id]/stream - Real-time streaming
 */

import { NextRequest } from 'next/server';
import { streamManager } from '@/lib/services/stream';
import { previewManager } from '@/lib/services/preview';
import { getActiveRequests } from '@/lib/services/user-requests';

interface RouteContext {
  params: Promise<{ project_id: string }>;
}

/**
 * GET /api/chat/[project_id]/stream
 * SSE streaming connection
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext
) {
  const { project_id } = await params;

  // Create ReadableStream
  const stream = new ReadableStream({
    start(controller) {
      let ctrl: ReadableStreamDefaultController | null = controller;
      // Add connection to StreamManager
      const connectionId = streamManager.addStream(project_id, controller);

      // Send connection confirmation message
      const welcomeMessage = `data: ${JSON.stringify({
        type: 'connected',
        data: {
          projectId: project_id,
          timestamp: new Date().toISOString(),
          transport: 'sse',
          connectionId,
        },
      })}\n\n`;

      try {
        controller.enqueue(new TextEncoder().encode(welcomeMessage));
      } catch (error) {
        console.error('[SSE] Failed to send welcome message:', error);
      }

      Promise.resolve()
        .then(async () => {
          const preview = previewManager.getStatus(project_id);
          const statusEvent = `data: ${JSON.stringify({
            type: 'preview_status',
            data: {
              status: preview?.status ?? 'stopped',
            },
          })}\n\n`;
          controller.enqueue(new TextEncoder().encode(statusEvent));

          const summary = await getActiveRequests(project_id);
          const activeEvent = `data: ${JSON.stringify({
            type: 'request_status',
            data: {
              hasActiveRequests: summary.hasActiveRequests,
              activeCount: summary.activeCount,
            },
          })}\n\n`;
          controller.enqueue(new TextEncoder().encode(activeEvent));
        })
        .catch(() => {});

      // Heartbeat (every 30 seconds)
      const heartbeatInterval = setInterval(() => {
        try {
          const heartbeat = `data: ${JSON.stringify({
            type: 'heartbeat',
            data: {
              timestamp: new Date().toISOString(),
              connectionId,
            },
          })}\n\n`;
          controller.enqueue(new TextEncoder().encode(heartbeat));
        } catch (error) {
          console.error('[SSE] Failed to send heartbeat:', error);
          clearInterval(heartbeatInterval);
        }
      }, 30000);

      // Cleanup on connection close
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeatInterval);
        if (ctrl) {
          streamManager.removeStream(project_id, ctrl);
          ctrl = null;
        }
      });
    },

    cancel() {
      // cancel(reason) does not provide controller; rely on abort or explicit close
    },
  });

  // Return SSE response
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
    },
  });
}

// Ensure Node runtime + dynamic rendering for consistent in-memory streams
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
