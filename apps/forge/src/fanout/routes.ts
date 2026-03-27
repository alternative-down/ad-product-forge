import { ZodError, z } from 'zod';
import type { HttpHandler, HttpRequest, HttpResponse } from '../http/server';

// Request schema for message propagation
const propagateMessageSchema = z.object({
  instanceId: z.string(),
  message: z.object({
    conversationId: z.string(),
    content: z.string(),
    senderId: z.string(),
    senderName: z.string(),
    timestamp: z.string(),
    metadata: z.record(z.unknown()).optional(),
  }),
});

// Response type
type PropagateMessageResponse = {
  success: boolean;
  delivered: number;
  failed: number;
  errors?: Array<{ participantId: string; error: string }>;
};

/**
 * Register fan-out routes for cross-instance message propagation
 */
export function registerFanOutRoutes(
  registerRoute: (input: { method: 'GET' | 'POST'; path: string; handler: HttpHandler }) => () => void,
  deps: {
    getInstances: () => Promise<Array<{ id: string; url: string; isHealthy: boolean }>>;
    getParticipantsForConversation: (conversationId: string) => Promise<
      Array<{
        participantId: string;
        participantName: string;
        instanceId: string | null;
      }>
    >;
    deliverMessageToParticipant: (
      participantId: string,
      instanceId: string,
      message: z.infer<typeof propagateMessageSchema>['message'],
    ) => Promise<{ success: boolean; error?: string }>;
  },
): () => void {
  const unregister: (() => void)[] = [];

  // POST /api/internal/propagate-message
  // Used by other instances to relay messages to participants on this instance
  unregister.push(
    registerRoute({
      method: 'POST',
      path: '/api/internal/propagate-message',
      handler: async (request: HttpRequest): Promise<HttpResponse> => {
        try {
          // Parse request body
          let body: z.infer<typeof propagateMessageSchema>;
          try {
            body = propagateMessageSchema.parse(
              JSON.parse(request.bodyText || '{}'),
            );
          } catch (parseError) {
            if (parseError instanceof ZodError) {
              return {
                status: 400,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  error: 'Invalid request body',
                  details: (parseError as ZodError).flatten(),
                }),
              };
            }
            return {
              status: 400,
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                error: 'Failed to parse request body',
              }),
            };
          }

          const { message } = body;

          // Get all participants for this conversation
          const participants = await deps.getParticipantsForConversation(
            message.conversationId,
          );

          // Deliver to local participants only (instanceId === null means local)
          const localParticipants = participants.filter(
            (p) => p.instanceId === null,
          );

          const results: PropagateMessageResponse = {
            success: true,
            delivered: 0,
            failed: 0,
            errors: [],
          };

          for (const participant of localParticipants) {
            // Deliver locally (no instanceId means same instance)
            const result = await deps.deliverMessageToParticipant(
              participant.participantId,
              'local',
              message,
            );

            if (result.success) {
              results.delivered++;
            } else {
              results.failed++;
              results.errors!.push({
                participantId: participant.participantId,
                error: result.error || 'Unknown error',
              });
            }
          }

          return {
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(results),
          };
        } catch (error) {
          console.error('[FanOut] Propagate message failed:', error);
          return {
            status: 500,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              error: error instanceof Error ? error.message : 'Internal server error',
            }),
          };
        }
      },
    }),
  );

  // GET /api/internal/instances
  // Health check and instance registry
  unregister.push(
    registerRoute({
      method: 'GET',
      path: '/api/internal/instances',
      handler: async (): Promise<HttpResponse> => {
        try {
          const instances = await deps.getInstances();

          return {
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              instanceId: process.env.FORGE_INSTANCE_ID || 'default',
              instances,
            }),
          };
        } catch (error) {
          console.error('[FanOut] Get instances failed:', error);
          return {
            status: 500,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              error: error instanceof Error ? error.message : 'Internal server error',
            }),
          };
        }
      },
    }),
  );

  // Return unregister function
  return () => {
    unregister.forEach((fn) => fn());
  };
}
