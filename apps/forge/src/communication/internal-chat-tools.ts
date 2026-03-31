import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import {
  createCommunicationConversationKey,
  type CommunicationModule,
} from '@mastra-engine/core';
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
  communication: CommunicationModule,
  allowedToolIds?: Set<string> | null,
) {
  const tools: Record<string, ReturnType<typeof createTool>> = {};

  function getConversationKey(groupId: string) {
    return createCommunicationConversationKey('internal-chat', groupId);
  }

  if (hasToolPermission(allowedToolIds, 'create_chat_group')) {
    tools.create_chat_group = createTool({
      id: 'create_chat_group',
      description: 'Create a new internal-chat group. Returns groupId for membership management and conversationKey for send_message/get_messages.',
      inputSchema: z.object({
        conversationKey: z.string().min(1),
        name: z.string().min(1),
      }),
      execute: async (input) => {
        try {
          const result = await internalChat.createChatGroup({
            agentId,
            conversationKey: input.conversationKey,
            name: input.name,
            creatorName: agentName,
          });
          await communication.createChatGroup({
            provider: 'internal-chat',
            conversationKey: result.groupId,
            name: result.name,
            creatorId: agentId,
            creatorName: agentName,
          });

          return {
            valid: true,
            ...result,
            conversationKey: getConversationKey(result.groupId),
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            valid: false,
            error: message,
            hint: 'Use a unique conversationKey and a clear name for the internal-chat group.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'add_member_to_group')) {
    tools.add_member_to_group = createTool({
      id: 'add_member_to_group',
      description: 'Add a contact to an internal-chat group using the contact slug returned by list_contacts.',
      inputSchema: z.object({
        groupId: z.string().min(1),
        participantSlug: z.string().min(1),
        role: z.enum(['admin', 'normal']).default('normal'),
      }),
      execute: async (input) => {
        try {
          const result = await internalChat.addMemberToGroup({
            agentId,
            groupId: input.groupId,
            participantSlug: input.participantSlug,
            role: input.role,
          });
          await communication.addMemberToGroup({
            groupId: getConversationKey(input.groupId),
            participantSlug: input.participantSlug,
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
            hint: 'Use list_chat_groups and list_contacts to confirm the group and the participant slug.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'remove_member_from_group')) {
    tools.remove_member_from_group = createTool({
      id: 'remove_member_from_group',
      description: 'Remove a participant from an internal-chat group using the participant slug returned by list_group_members.',
      inputSchema: z.object({
        groupId: z.string().min(1),
        participantSlug: z.string().min(1),
      }),
      execute: async (input) => {
        try {
          const result = await internalChat.removeMemberFromGroup({
            agentId,
            groupId: input.groupId,
            participantSlug: input.participantSlug,
          });
          await communication.removeMemberFromGroup({
            groupId: getConversationKey(input.groupId),
            participantSlug: input.participantSlug,
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
            hint: 'Use list_group_members to confirm the participant slug before removing it.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_chat_groups')) {
    tools.list_chat_groups = createTool({
      id: 'list_chat_groups',
      description: 'List the internal-chat groups that this agent can access. Use groupId for member management and conversationKey for send_message/get_messages.',
      inputSchema: z.object({
        limit: z.number().int().positive().max(100).default(50),
      }),
      execute: async (input) => {
        try {
          return await internalChat.listChatGroups({
            agentId,
            limit: input.limit,
          }).then((groups) =>
            groups.map((group) => ({
              ...group,
              conversationKey: getConversationKey(group.groupId),
            })),
          );
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
      description: 'List the members of an internal-chat group.',
      inputSchema: z.object({
        groupId: z.string().min(1),
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
