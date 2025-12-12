/**
 * Timeline SSE Stream API
 * GET /api/projects/[project_id]/timeline/stream - Real-time timeline log streaming
 */

import { NextRequest } from 'next/server';
import { PROJECTS_DIR_ABSOLUTE } from '@/lib/config/paths';
import path from 'path';
import fs from 'fs';

interface RouteContext {
  params: Promise<{ project_id: string }>;
}

/**
 * GET /api/projects/[project_id]/timeline/stream
 * SSE streaming connection for timeline.txt
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext
) {
  const { project_id } = await params;

  const timelineFilePath = path.join(PROJECTS_DIR_ABSOLUTE, project_id, 'logs', 'timeline.txt');

  // Create ReadableStream
  const stream = new ReadableStream({
    start(controller) {
      let fileWatcher: fs.FSWatcher | null = null;
      let lastSize = 0;
      let disposed = false;

      const encoder = new TextEncoder();

      // Send connection confirmation
      const welcomeMessage = `data: ${JSON.stringify({
        type: 'connected',
        timestamp: new Date().toISOString(),
      })}\n\n`;

      try {
        controller.enqueue(encoder.encode(welcomeMessage));
      } catch (error) {
        console.error('[Timeline SSE] Failed to send welcome message:', error);
      }

      // Read initial file content
      const readInitialContent = () => {
        try {
          if (!fs.existsSync(timelineFilePath)) {
            const emptyMessage = `data: ${JSON.stringify({
              type: 'content',
              data: '',
              isInitial: true,
            })}\n\n`;
            controller.enqueue(encoder.encode(emptyMessage));
            lastSize = 0;
            return;
          }

          const stats = fs.statSync(timelineFilePath);
          lastSize = stats.size;

          const content = fs.readFileSync(timelineFilePath, 'utf-8');
          const message = `data: ${JSON.stringify({
            type: 'content',
            data: content,
            isInitial: true,
          })}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch (error) {
          console.error('[Timeline SSE] Failed to read initial content:', error);
          const errorMessage = `data: ${JSON.stringify({
            type: 'error',
            message: 'Failed to read timeline file',
          })}\n\n`;
          controller.enqueue(encoder.encode(errorMessage));
        }
      };

      readInitialContent();

      // Watch file changes
      const watchFile = () => {
        try {
          const logsDir = path.dirname(timelineFilePath);

          // Ensure logs directory exists
          if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
          }

          fileWatcher = fs.watch(timelineFilePath, (eventType) => {
            if (disposed) return;
            if (eventType !== 'change') return;

            try {
              const stats = fs.statSync(timelineFilePath);
              const currentSize = stats.size;

              // Only read if file grew
              if (currentSize > lastSize) {
                const stream = fs.createReadStream(timelineFilePath, {
                  start: lastSize,
                  end: currentSize - 1,
                  encoding: 'utf-8',
                });

                let incrementalContent = '';
                stream.on('data', (chunk) => {
                  incrementalContent += chunk;
                });

                stream.on('end', () => {
                  if (incrementalContent) {
                    const message = `data: ${JSON.stringify({
                      type: 'update',
                      data: incrementalContent,
                    })}\n\n`;

                    try {
                      controller.enqueue(encoder.encode(message));
                    } catch (error) {
                      console.error('[Timeline SSE] Failed to send update:', error);
                    }
                  }
                  lastSize = currentSize;
                });

                stream.on('error', (error) => {
                  console.error('[Timeline SSE] Failed to read incremental content:', error);
                });
              } else {
                // File was truncated or recreated - send full content
                lastSize = 0;
                readInitialContent();
              }
            } catch (error) {
              console.error('[Timeline SSE] Failed to process file change:', error);
            }
          });

          fileWatcher.on('error', (error) => {
            console.error('[Timeline SSE] File watcher error:', error);
            // Try to restart watcher
            if (!disposed && fileWatcher) {
              fileWatcher.close();
              setTimeout(() => {
                if (!disposed) {
                  watchFile();
                }
              }, 1000);
            }
          });
        } catch (error) {
          console.error('[Timeline SSE] Failed to start file watcher:', error);
        }
      };

      watchFile();

      // Heartbeat (every 30 seconds)
      const heartbeatInterval = setInterval(() => {
        if (disposed) {
          clearInterval(heartbeatInterval);
          return;
        }

        try {
          const heartbeat = `data: ${JSON.stringify({
            type: 'heartbeat',
            timestamp: new Date().toISOString(),
          })}\n\n`;
          controller.enqueue(encoder.encode(heartbeat));
        } catch (error) {
          console.error('[Timeline SSE] Failed to send heartbeat:', error);
          clearInterval(heartbeatInterval);
        }
      }, 30000);

      // Cleanup on connection close
      request.signal.addEventListener('abort', () => {
        disposed = true;
        clearInterval(heartbeatInterval);
        if (fileWatcher) {
          fileWatcher.close();
        }
      });
    },

    cancel() {
      // Cleanup handled in abort listener
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

// Ensure Node runtime + dynamic rendering
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
