export interface StructuredLogEntry {
  timestamp: string;
  scope: string;
  event: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  agentId?: string;
  accountId?: string;
  conversationId?: string;
  messageId?: string;
  durationMs?: number;
  success?: boolean;
  error?: string;
  context?: Record<string, unknown>;
}

const SCOPE = 'internal-chat-service';

/** Capture current timestamp once per log call */
function now(): string {
  return new Date().toISOString();
}

/** Mutable buffer for log collection — caller must call .flush() */
export function createServiceLogger() {
  const entries: StructuredLogEntry[] = [];

  function log(
    event: string,
    level: StructuredLogEntry['level'],
    opts: Omit<StructuredLogEntry, 'timestamp' | 'scope' | 'event' | 'level'>,
  ) {
    entries.push({ timestamp: now(), scope: SCOPE, event, level, ...opts });
  }

  return {
    log,
    flush(): StructuredLogEntry[] {
      const snapshot = [...entries];
      entries.length = 0;
      return snapshot;
    },
    size(): number {
      return entries.length;
    },

    // ── Mutation logging ────────────────────────────────────────────────────

    logSendMessageStart(opts: {
      agentId: string;
      accountId: string;
      conversationKey: string;
      replyToMessageId?: string;
    }) {
      log('send_message.start', 'info', {
        agentId: opts.agentId,
        accountId: opts.accountId,
        conversationId: opts.conversationKey,
        messageId: opts.replyToMessageId,
        success: undefined,
      });
    },

    logSendMessageEnd(opts: {
      agentId: string;
      accountId: string;
      conversationKey: string;
      messageId: string;
      durationMs: number;
      success: boolean;
      error?: string;
    }) {
      log('send_message.end', opts.success ? 'info' : 'error', {
        agentId: opts.agentId,
        accountId: opts.accountId,
        conversationId: opts.conversationKey,
        messageId: opts.messageId,
        durationMs: opts.durationMs,
        success: opts.success,
        error: opts.error,
      });
    },

    logGroupOperationStart(opts: {
      accountId: string;
      operation: 'create_group' | 'add_member' | 'remove_member' | 'update_group' | 'archive';
      targetId?: string;
    }) {
      log(`${opts.operation}.start`, 'info', {
        accountId: opts.accountId,
        conversationId: opts.targetId,
        success: undefined,
      });
    },

    logGroupOperationEnd(opts: {
      accountId: string;
      operation: 'create_group' | 'add_member' | 'remove_member' | 'update_group' | 'archive';
      targetId: string;
      durationMs: number;
      success: boolean;
      error?: string;
    }) {
      log(`${opts.operation}.end`, opts.success ? 'info' : 'error', {
        accountId: opts.accountId,
        conversationId: opts.targetId,
        durationMs: opts.durationMs,
        success: opts.success,
        error: opts.error,
      });
    },

    // ── Error logging ────────────────────────────────────────────────────────

    logError(opts: {
      event: string;
      agentId?: string;
      accountId?: string;
      conversationId?: string;
      error: string;
      context?: Record<string, unknown>;
    }) {
      log(opts.event, 'error', {
        agentId: opts.agentId,
        accountId: opts.accountId,
        conversationId: opts.conversationId,
        error: opts.error,
        context: opts.context,
        success: false,
      });
    },

    // ── Read operation timing ────────────────────────────────────────────────

    logListConversations(opts: { agentId: string; durationMs: number; count: number }) {
      log('list_conversations', 'debug', {
        agentId: opts.agentId,
        durationMs: opts.durationMs,
        context: { count: opts.count },
        success: true,
      });
    },

    logGetMessages(opts: {
      agentId: string;
      conversationKey: string;
      durationMs: number;
      count: number;
    }) {
      log('get_messages', 'debug', {
        agentId: opts.agentId,
        conversationId: opts.conversationKey,
        durationMs: opts.durationMs,
        context: { count: opts.count },
        success: true,
      });
    },
  };
}

