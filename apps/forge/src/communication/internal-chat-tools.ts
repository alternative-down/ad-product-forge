import { createTool, forgeDebug } from '@forge-runtime/core';
import { hasToolPermission } from '../capabilities/catalog';
import { z } from 'zod';

import type { InternalChatService } from './internal-chat-service';

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
      description:
        'Create or update one internal-chat group. Use action create with the create object to create a new group. Use action update with the update object to rename one existing group or replace its member state. For updates, use the group id from the internal-chat conversation targetKey. For group members, always use the contact targetKey from list_contacts, not the display name.',
      inputSchema: z.object({
        action: z
          .enum(['create', 'update'])
          .describe('Use create to create a new group. Use update to change one existing group.'),
        create: z
          .object({
            name: z
              .string()
              .optional()
              .describe(
                'Required group display name for the new group. Omit this field only when not creating.',
              ),
            members: z
              .array(
                z.object({
                  participantKey: z
                    .string()
                    .describe(
                      'The internal-chat contact targetKey to include in the new group. Use the targetKey returned by list_contacts.',
                    ),
                  role: z
                    .enum(['admin', 'normal'])
                    .optional()
                    .describe('Optional participant role in the final group state.'),
                }),
              )
              .optional()
              .describe(
                'Optional full initial member state for the new group. The creator is always kept as admin.',
              ),
          })
          .optional()
          .describe('Provide this object only when action is create.'),
        update: z
          .object({
            groupId: z
              .string()
              .optional()
              .describe('Required group id to update one existing group.'),
            name: z.string().optional().describe('Optional new group display name.'),
            members: z
              .array(
                z.object({
                  participantKey: z
                    .string()
                    .describe(
                      'The internal-chat contact targetKey to include in the final group state. Use the targetKey returned by list_contacts.',
                    ),
                  role: z
                    .enum(['admin', 'normal'])
                    .optional()
                    .describe('Optional participant role in the final group state.'),
                }),
              )
              .optional()
              .describe(
                'Optional full member state for the group. When provided, it replaces the current non-creator member set.',
              ),
          })
          .optional()
          .describe('Provide this object only when action is update.'),
      }),
      execute: async (input) => {
        try {
          if (input.action === 'create') {
            if (input.create === null || input.create === undefined) {
              return {
                valid: false,
                error: 'create is required when action is create',
                hint: 'Provide create.name and optionally create.members.',
              };
            }

            if (
              input.create === null ||
              input.create === undefined ||
              input.create.name === null ||
              input.create.name === undefined
            ) {
              return {
                valid: false,
                error: 'create.name is required when action is create',
                hint: 'Provide the new group name in create.name.',
              };
            }

            const result = await internalChat.changeChatGroup({
              agentId,
              name: input.create.name,
              members: input.create.members?.map(
                (member: {
                  participantKey: string;
                  role?: 'admin' | 'normal' | null | undefined;
                }) => ({
                  participantKey: member.participantKey,
                  role: member.role ?? undefined,
                }),
              ),
            });

            return {
              valid: true,
              ...result,
            };
          }

          if (input.update === null || input.update === undefined) {
            return {
              valid: false,
              error: 'update is required when action is update',
              hint: 'Provide update.groupId and any fields you want to change.',
            };
          }

          if (
            input.update === null ||
            input.update === undefined ||
            input.update.groupId === null ||
            input.update.groupId === undefined
          ) {
            return {
              valid: false,
              error: 'update.groupId is required when action is update',
              hint: 'Use the internal-chat conversation targetKey as update.groupId.',
            };
          }

          const result = await internalChat.changeChatGroup({
            agentId,
            groupId: input.update.groupId,
            name: input.update.name ?? undefined,
            members: input.update.members?.map(
              (member: {
                participantKey: string;
                role?: 'admin' | 'normal' | null | undefined;
              }) => ({
                participantKey: member.participantKey,
                role: member.role ?? undefined,
              }),
            ),
          });

          return {
            valid: true,
            ...result,
          };
        } catch (error) {
          forgeDebug({
            scope: 'internal-chat',
            level: 'error',
            message: 'Internal chat tool failed',
            context: { error: errorMsg(error) },
          });
          return {
            valid: false,
            error: errorMsg(error),
            hint: 'Use action create with create.name to create a group. Use action update with update.groupId to update one existing group.',
          };
        }
      },
    });
  }

  return tools;
}
import { serializeError, errorMsg } from '../agents/agent-runner-error-formatting';
