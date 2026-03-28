import type { Database } from '../database/index';

/**
 * Message payload for cross-instance propagation.
 * Matches the schema in routes.ts.
 */
export interface PropagateMessagePayload {
  conversationId: string;
  content: string;
  senderId: string;
  senderName: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create a propagateMessage function for cross-instance message delivery.
 * This is the client-side counterpart to the /api/internal/propagate-message endpoint.
 *
 * @param db - Database connection (to look up instance URLs)
 * @param localInstanceId - This instance's ID (to avoid calling ourselves)
 * @returns A propagateMessage function that sends messages to remote instances
 */
export function createPropagateMessageFn(
  db: Database,
  localInstanceId: string,
): (instanceId: string, message: PropagateMessagePayload) => Promise<{ success: boolean; error?: string }> {
  return async (instanceId: string, message: PropagateMessagePayload): Promise<{ success: boolean; error?: string }> => {
    // Don't try to propagate to ourselves
    if (instanceId === localInstanceId || instanceId === 'local') {
      return { success: false, error: 'Cannot propagate to local instance' };
    }

    try {
      // Look up the remote instance's base URL
      const instance = await db.query.mastraInstances.findFirst({
        where: (tbl, { eq }) => eq(tbl.instanceId, instanceId),
      });

      if (!instance) {
        return { success: false, error: `Instance not found: ${instanceId}` };
      }

      if (!instance.baseUrl) {
        return { success: false, error: `Instance has no baseUrl: ${instanceId}` };
      }

      // Make HTTP POST to the remote instance
      const url = `${instance.baseUrl}/api/internal/propagate-message`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instanceId: localInstanceId,
          message,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }

      const result = await response.json() as { success?: boolean; delivered?: number; failed?: number; error?: string };

      if (!result.success && result.error) {
        return { success: false, error: result.error };
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[FanOutClient] Failed to propagate message to ${instanceId}:`, errorMessage);
      return { success: false, error: errorMessage };
    }
  };
}
