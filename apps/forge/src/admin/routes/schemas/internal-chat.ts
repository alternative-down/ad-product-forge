import { z } from 'zod';

export const adminInternalChatSendSchema = z.object({
  agentId: z.string().min(1),
  targetKey: z.string().min(1),
  provider: z.string().min(1),
  content: z.string().min(1),
});

export const createExternalInternalChatAccountSchema = z.object({
  provider: z.string().min(1),
  targetKey: z.string().min(1),
  name: z.string().min(1).optional(),
});

export const updateExternalInternalChatAccountSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1).optional(),
  webhookUrl: z.string().url().optional().nullable(),
});

export const deleteExternalInternalChatAccountSchema = z.object({
  accountId: z.string().min(1),
});

export const internalChatAccountIdQuerySchema = z.object({
  accountId: z.string().min(1),
});

export const internalChatMessagesQuerySchema = z.object({
  accountId: z.string().min(1),
  conversationId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const internalChatMessageAttachmentQuerySchema = z.object({
  accountId: z.string().min(1),
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
  attachmentName: z.string().min(1),
});

export const createInternalChatConversationSchema = z
  .object({
    accountId: z.string().min(1),
    type: z.enum(['dm', 'group']),
    name: z.string().min(1).optional(),
    participantAccountIds: z.array(z.string().min(1)).min(1),
  })
  .superRefine((value, context) => {
    if (value.type === 'dm' && value.participantAccountIds.length !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['participantAccountIds'],
        message: 'A direct conversation requires exactly one participant',
      });
    }
    if (value.type === 'group' && value.name === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['name'],
        message: 'A group conversation requires a name',
      });
    }
  });

export const sendInternalChatConversationMessageSchema = z.object({
  accountId: z.string().min(1),
  conversationId: z.string().min(1),
  content: z.string().min(1),
  parentMessageId: z.string().min(1).optional(),
  attachments: z
    .array(
      z.object({
        name: z.string(),
        contentType: z.string(),
        dataBase64: z.string(),
      }),
    )
    .optional(),
});

export const updateInternalChatConversationSchema = z.object({
  accountId: z.string().min(1),
  conversationId: z.string().min(1),
  name: z.string().min(1).optional(),
  archive: z.boolean().optional(),
});

export const archiveInternalChatConversationSchema = z.object({
  accountId: z.string().min(1),
  conversationId: z.string().min(1),
});

export const internalChatGroupMembersQuerySchema = z.object({
  conversationId: z.string().min(1),
});

export const addInternalChatGroupMemberSchema = z.object({
  conversationId: z.string().min(1),
  participantKey: z.string().min(1),
  role: z.enum(['admin', 'normal']).default('normal'),
});

export const updateInternalChatGroupMemberRoleSchema = z.object({
  conversationId: z.string().min(1),
  participantKey: z.string().min(1),
  role: z.enum(['admin', 'normal']),
});

export const removeInternalChatGroupMemberSchema = z.object({
  conversationId: z.string().min(1),
  participantKey: z.string().min(1),
});

// =============================================================================
// AGENT CONTRACT SCHEMAS
// =============================================================================
