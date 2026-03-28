import path from 'node:path';
import { eq } from 'drizzle-orm';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { communicationSchema } from '@mastra-engine/core';

const { chatGroupMembers } = communicationSchema;

export interface GroupMember {
  participantId: string;
  participantName: string;
  instanceId: string | null;
}

/**
 * Get group members from an agent's workspace database.
 * This queries the chatGroupMembers table in the agent's SQLite database.
 */
export async function getGroupMembersFromWorkspace(
  agentId: string,
  workspaceBasePath: string,
  groupId: string
): Promise<GroupMember[]> {
  try {
    const agentDatabasePath = path.resolve(workspaceBasePath, agentId, 'database.db');
    const client = createClient({
      url: `file:${agentDatabasePath}`,
    });
    const db = drizzle(client, { schema: communicationSchema });

    const members = await db.query.chatGroupMembers.findMany({
      where: eq(chatGroupMembers.groupId, groupId),
    });

    return members.map((m) => ({
      participantId: m.participantId,
      participantName: m.participantName ?? m.participantId,
      instanceId: m.instanceId ?? null,
    }));
  } catch (error) {
    // If the database doesn't exist or table doesn't exist, return empty
    console.warn(`[FanOut] Could not query group members for agent ${agentId}: ${error}`);
    return [];
  }
}
