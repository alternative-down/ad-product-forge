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
  agentName: string,
  internalChat: InternalChatService,
  allowedToolIds?: Set<string> | null,
) {
  const tools: Record<string, ReturnType<typeof createTool>> = {};

  if (hasToolPermission(allowedToolIds, 'create_chat_group')) {
    tools.create_chat_group = createTool({
      id: 'create_chat_group',
      description: 'Create a new internal-chat group. Use this when you want to start a group conversation. Returns the groupId that you can use later with provider "internal-chat" and targetKey equal to that groupId.',
      inputSchema: z.object({
        groupId: z.string().min(1).describe('A unique ID for the new group. Choose something short and clear because you will use this groupId later to send messages to the group.'),
        name: z.string().min(1).describe('The display name of the group conversation.'),
      }),
      execute: async (input) => {
        try {
          const result = await internalChat.createChatGroup({
            agentId,
            conversationKey: input.groupId,
            name: input.name,
            creatorName: agentName,
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
            hint: 'Use a unique groupId and a clear name for the internal-chat group.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'add_member_to_group')) {
    tools.add_member_to_group = createTool({
      id: 'add_member_to_group',
      description: 'Add one participant to an internal-chat group. Use the participant agentId or the participant internal-chat slug. Returns the updated group information.',
      inputSchema: z.object({
        groupId: z.string().min(1).describe('The groupId of the internal-chat group that should receive the new participant.'),
        participantKey: z.string().min(1).describe('The participant agentId or internal-chat slug to add to the group.'),
        role: z.enum(['admin', 'normal']).default('normal').describe('The role for the new participant inside the group.'),
      }),
      execute: async (input) => {
        try {
          const result = await internalChat.addMemberToGroup({
            agentId,
            groupId: input.groupId,
            participantKey: input.participantKey,
            role: input.role,
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
            hint: 'Use list_chat_groups to confirm the groupId. For the participant, use the agentId or the internal-chat account slug.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'remove_member_from_group')) {
    tools.remove_member_from_group = createTool({
      id: 'remove_member_from_group',
      description: 'Remove one participant from an internal-chat group. Use the participant agentId or the participant internal-chat slug. Returns the updated group information.',
      inputSchema: z.object({
        groupId: z.string().min(1).describe('The groupId of the internal-chat group.'),
        participantKey: z.string().min(1).describe('The participant agentId or internal-chat slug to remove from the group.'),
      }),
      execute: async (input) => {
        try {
          const result = await internalChat.removeMemberFromGroup({
            agentId,
            groupId: input.groupId,
            participantKey: input.participantKey,
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
            hint: 'Use list_group_members to confirm the current members. You can remove by participant agentId or internal-chat slug.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_chat_groups')) {
    tools.list_chat_groups = createTool({
      id: 'list_chat_groups',
      description: 'List the internal-chat groups you can access. Use this to find existing groups, their names, and the groupId you need to send messages or manage members.',
      inputSchema: z.object({
        limit: z.number().int().positive().max(100).default(50).describe('Maximum number of groups to return.'),
      }),
      execute: async (input) => {
        try {
          return await internalChat.listChatGroups({
            agentId,
            limit: input.limit,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            valid: false,
            error: message,
            hint: 'Try again in a moment. If the problem persists, verify the internal-chat service is available.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_group_members')) {
    tools.list_group_members = createTool({
      id: 'list_group_members',
      description: 'List the members of one internal-chat group. Use this before adding or removing members, or when you need the participant agentId and internal-chat slug already in the group.',
      inputSchema: z.object({
        groupId: z.string().min(1).describe('The groupId of the internal-chat group.'),
      }),
      execute: async (input) => {
        try {
          return await internalChat.listGroupMembers({
            agentId,
            groupId: input.groupId,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            valid: false,
            error: message,
            hint: 'Use list_chat_groups to confirm the groupId before listing members.',
          };
        }
      },
    });
  }

  return tools;
}
