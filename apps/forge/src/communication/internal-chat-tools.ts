import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { InternalChatService } from './internal-chat-service';

function hasToolPermission(allowedToolIds: Set<string> | null | undefined, toolId: string) {
  if (!allowedToolIds) {
    return true;
  }

  return allowedToolIds.has(toolId);
}

export function createInternalChatTools(
  agentId: string,
  _agentName: string,
  internalChat: InternalChatService,
  allowedToolIds?: Set<string> | null,
) {
  const tools: Record<string, ReturnType<typeof createTool>> = {};

  if (hasToolPermission(allowedToolIds, 'change_chat_group')) {
    tools.change_chat_group = createTool({
      id: 'change_chat_group',
      description: 'Create or update one internal-chat group. Use this to create a new group, rename a group, or replace its members and roles in one request. For updates, use the group id from the internal-chat conversation targetKey. For creation, leave groupId empty and a new id will be generated.',
      inputSchema: z.object({
        groupId: z.string().min(1).nullish().describe('Provide the group id to update one existing group. Leave empty to create a new group.'),
        name: z.string().min(1).nullish().describe('Optional group display name. Required when creating a group.'),
        members: z.array(z.object({
          participantSlug: z.string().min(1).describe('Participant slug to include in the group state.'),
          role: z.enum(['admin', 'normal']).default('normal').describe('Desired participant role in the final group state.'),
        })).nullish().describe('Optional full member state for the group. When provided, it replaces the current non-creator member set.'),
      }),
      execute: async (input) => {
        try {
          const result = await internalChat.changeChatGroup({
            agentId,
            groupId: input.groupId ?? undefined,
            name: input.name ?? undefined,
            members: input.members ?? undefined,
          });

          return {
            valid: true,
            ...result,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            valid: false,
            error: message,
            hint: 'Provide a name to create a new group. For updates, use the group id from the internal-chat conversation targetKey and pass the full desired member state.',
          };
        }
      },
    });
  }

  return tools;
}
