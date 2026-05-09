import type { Client } from '@libsql/client';
import type {
  ConversationMessage,
  ConversationStore,
  ConversationThread,
} from 'agent-runtime-core/integrations';
import type {
  OperationalMemoryConversationState,
  OperationalMemoryConversationStateStore,
} from 'agent-runtime-core/integrations';
import type {
  RuntimeWorkingMemoryStore,
  WorkingMemoryRecord,
} from './runtime-working-memory.js';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function escapeIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function serializeJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function parseJson<T>(value: unknown): T | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  return JSON.parse(value) as T;
}

export type LibsqlConversationStoreOptions = {
  client: Client;
  tablePrefix?: string;
};

export class LibsqlConversationStore
implements ConversationStore, OperationalMemoryConversationStateStore, RuntimeWorkingMemoryStore {
  private readonly client: Client;
  private readonly threadTableName: string;
  private readonly messageTableName: string;
  private readonly stateTableName: string;
  private readonly workingMemoryTableName: string;
  private schemaReady = false;

  constructor(options: LibsqlConversationStoreOptions) {
    const prefix = options.tablePrefix ?? 'forge_runtime';

    this.client = options.client;
    this.threadTableName = `${prefix}_conversation_threads`;
    this.messageTableName = `${prefix}_conversation_messages`;
    this.stateTableName = `${prefix}_checkpointed_conversation_states`;
    this.workingMemoryTableName = `${prefix}_working_memory`;
  }

  async upsertThread(thread: ConversationThread): Promise<void> {
    await this.ensureSchema();
    await this.client.execute({
      sql: `
        insert into ${escapeIdentifier(this.threadTableName)} (
          id,
          title,
          participant_ids_json,
          metadata_json,
          created_at,
          updated_at
        ) values (?, ?, ?, ?, ?, ?)
        on conflict(id) do update set
          title = excluded.title,
          participant_ids_json = excluded.participant_ids_json,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at
      `,
      args: [
        thread.id,
        thread.title ?? null,
        serializeJson(thread.participantIds ?? []),
        serializeJson(thread.metadata ?? null),
        thread.createdAt,
        thread.updatedAt,
      ],
    });
  }

  async getThread(threadId: string): Promise<ConversationThread | null> {
    await this.ensureSchema();
    const result = await this.client.execute({
      sql: `
        select
          id,
          title,
          participant_ids_json,
          metadata_json,
          created_at,
          updated_at
        from ${escapeIdentifier(this.threadTableName)}
        where id = ?
        limit 1
      `,
      args: [threadId],
    });
    const row = result.rows[0];

    if (row == null) {
      return null;
    }

    return {
      id: String(row.id),
      title: row.title != null ? String(row.title) : undefined,
      participantIds: parseJson<string[]>(row.participant_ids_json) ?? [],
      metadata: parseJson<Record<string, JsonValue>>(row.metadata_json) ?? undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  async listThreads(): Promise<ConversationThread[]> {
    await this.ensureSchema();
    const result = await this.client.execute(`
      select
        id,
        title,
        participant_ids_json,
        metadata_json,
        created_at,
        updated_at
      from ${escapeIdentifier(this.threadTableName)}
      order by updated_at desc
    `);

    return result.rows.map((row) => ({
      id: String(row.id),
      title: row.title != null ? String(row.title) : undefined,
      participantIds: parseJson<string[]>(row.participant_ids_json) ?? [],
      metadata: parseJson<Record<string, JsonValue>>(row.metadata_json) ?? undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
  }

  async appendMessage(message: ConversationMessage): Promise<void> {
    await this.ensureSchema();
    await this.client.batch([
      {
        sql: `
          insert or ignore into ${escapeIdentifier(this.threadTableName)} (
            id,
            title,
            participant_ids_json,
            metadata_json,
            created_at,
            updated_at
          ) values (?, null, '[]', null, ?, ?)
        `,
        args: [message.threadId, message.createdAt, message.createdAt],
      },
      {
        sql: `
          insert into ${escapeIdentifier(this.messageTableName)} (
            id,
            thread_id,
            role,
            author_id,
            parts_json,
            metadata_json,
            replaced_by_message_id,
            om_type,
            om_generation,
            created_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          message.id,
          message.threadId,
          message.role,
          message.authorId ?? null,
          serializeJson(message.parts),
          serializeJson(message.metadata ?? null),
          message.replacedByMessageId ?? null,
          message.operationalMemoryType ?? null,
          message.operationalMemoryGeneration ?? null,
          message.createdAt,
        ],
      },
      {
        sql: `
          update ${escapeIdentifier(this.threadTableName)}
          set updated_at = ?
          where id = ?
        `,
        args: [message.createdAt, message.threadId],
      },
    ], 'write');
  }

  async updateMessage(input: {
    threadId: string;
    messageId: string;
    role?: ConversationMessage['role'];
    parts?: ConversationMessage['parts'];
    metadata?: Record<string, unknown> | undefined;
    operationalMemoryType?: ConversationMessage['operationalMemoryType'];
    operationalMemoryGeneration?: number | null | undefined;
  }): Promise<void> {
    await this.ensureSchema();
    await this.client.execute({
      sql: `
        update ${escapeIdentifier(this.messageTableName)}
        set
          role = coalesce(?, role),
          parts_json = coalesce(?, parts_json),
          metadata_json = coalesce(?, metadata_json),
          om_type = coalesce(?, om_type),
          om_generation = coalesce(?, om_generation)
        where thread_id = ? and id = ?
      `,
      args: [
        input.role ?? null,
        input.parts ? serializeJson(input.parts) : null,
        input.metadata !== undefined ? serializeJson(input.metadata ?? null) : null,
        input.operationalMemoryType ?? null,
        input.operationalMemoryGeneration ?? null,
        input.threadId,
        input.messageId,
      ],
    });
  }

  async updateMessageMetadata(input: {
    threadId: string;
    messageId: string;
    metadata: Record<string, unknown> | undefined;
  }): Promise<void> {
    await this.ensureSchema();
    await this.client.execute({
      sql: `
        update ${escapeIdentifier(this.messageTableName)}
        set metadata_json = ?
        where thread_id = ? and id = ?
      `,
      args: [
        serializeJson(input.metadata ?? null),
        input.threadId,
        input.messageId,
      ],
    });
  }

  async updateMessageReplacement(input: {
    threadId: string;
    messageId: string;
    replacedByMessageId: string | null;
  }): Promise<void> {
    await this.ensureSchema();
    await this.client.execute({
      sql: `
        update ${escapeIdentifier(this.messageTableName)}
        set replaced_by_message_id = ?
        where thread_id = ? and id = ?
      `,
      args: [
        input.replacedByMessageId,
        input.threadId,
        input.messageId,
      ],
    });
  }

  async listMessages(query: {
    threadId: string;
    limit?: number;
    beforeMessageId?: string;
    afterMessageId?: string;
    order?: 'asc' | 'desc';
  }): Promise<ConversationMessage[]> {
    await this.ensureSchema();
    const conditions = ['thread_id = ?'];
    const args: Array<string | number> = [query.threadId];

    if (query.beforeMessageId != null) {
      conditions.push(
        `(
          created_at < (select created_at from ${escapeIdentifier(this.messageTableName)} where id = ?)
          or (
            created_at = (select created_at from ${escapeIdentifier(this.messageTableName)} where id = ?)
            and rowid < (select rowid from ${escapeIdentifier(this.messageTableName)} where id = ?)
          )
        )`,
      );
      args.push(query.beforeMessageId, query.beforeMessageId, query.beforeMessageId);
    }

    if (query.afterMessageId != null) {
      conditions.push(
        `(
          created_at > (select created_at from ${escapeIdentifier(this.messageTableName)} where id = ?)
          or (
            created_at = (select created_at from ${escapeIdentifier(this.messageTableName)} where id = ?)
            and rowid > (select rowid from ${escapeIdentifier(this.messageTableName)} where id = ?)
          )
        )`,
      );
      args.push(query.afterMessageId, query.afterMessageId, query.afterMessageId);
    }

    if (query.limit != null) {
      args.push(query.limit);
    }

    const result = await this.client.execute({
      sql: `
        select
          id,
          thread_id,
          role,
          author_id,
          parts_json,
          metadata_json,
          replaced_by_message_id,
          om_type,
          om_generation,
          created_at
        from ${escapeIdentifier(this.messageTableName)}
        where ${conditions.join(' and ')}
        order by created_at ${query.order === 'desc' ? 'desc' : 'asc'}, rowid ${query.order === 'desc' ? 'desc' : 'asc'}
        ${query.limit != null ? 'limit ?' : ''}
      `,
      args,
    });

    return result.rows.map((row) => ({
      id: String(row.id),
      threadId: String(row.thread_id),
      role: row.role as ConversationMessage['role'],
      authorId: row.author_id != null ? String(row.author_id) : undefined,
      parts: parseJson<ConversationMessage['parts']>(row.parts_json) ?? [],
      metadata: parseJson<Record<string, JsonValue>>(row.metadata_json) ?? undefined,
      replacedByMessageId: row.replaced_by_message_id != null ? String(row.replaced_by_message_id) : null,
      operationalMemoryType: row.om_type != null
        ? (row.om_type ?? null) as ConversationMessage['operationalMemoryType']
        : undefined,
      operationalMemoryGeneration:
        typeof row.om_generation === 'number' ? row.om_generation : row.om_generation === null ? null : undefined,
      createdAt: String(row.created_at),
    }));
  }

  async listOperationalMemoryMessages(input: {
    threadId: string;
  }): Promise<ConversationMessage[]> {
    await this.ensureSchema();
    const result = await this.client.execute({
      sql: `
        with recursive checkpoint as (
          select rowid as checkpoint_rowid
          from ${escapeIdentifier(this.messageTableName)}
          where thread_id = ?
            and om_type = 'checkpoint-summary'
            and replaced_by_message_id is null
          order by created_at desc, rowid desc
          limit 1
        ),
        seed as (
          select
            rowid,
            id,
            thread_id,
            role,
            author_id,
            parts_json,
            metadata_json,
            replaced_by_message_id,
            om_type,
            om_generation,
            created_at
          from ${escapeIdentifier(this.messageTableName)}
          where thread_id = ?
            and (
              (select checkpoint_rowid from checkpoint) is null
              or rowid < (select checkpoint_rowid from checkpoint)
            )
        ),
        replacement_chain(root_id, current_id) as (
          select id, id
          from seed
          union all
          select replacement_chain.root_id, messages.replaced_by_message_id
          from replacement_chain
          join ${escapeIdentifier(this.messageTableName)} as messages
            on messages.id = replacement_chain.current_id
          where messages.replaced_by_message_id is not null
        ),
        terminal_messages as (
          select
            replacement_chain.root_id,
            replacement_chain.current_id as terminal_id,
            seed.rowid as source_rowid
          from replacement_chain
          join seed
            on seed.id = replacement_chain.root_id
          join ${escapeIdentifier(this.messageTableName)} as messages
            on messages.id = replacement_chain.current_id
          where messages.replaced_by_message_id is null
        ),
        deduped_terminal_messages as (
          select
            terminal_id,
            min(source_rowid) as source_rowid
          from terminal_messages
          group by terminal_id
        )
        select
          messages.id,
          messages.thread_id,
          messages.role,
          messages.author_id,
          messages.parts_json,
          messages.metadata_json,
          messages.replaced_by_message_id,
          messages.om_type,
          messages.om_generation,
          messages.created_at
        from deduped_terminal_messages
        join ${escapeIdentifier(this.messageTableName)} as messages
          on messages.id = deduped_terminal_messages.terminal_id
        order by deduped_terminal_messages.source_rowid asc
      `,
      args: [input.threadId, input.threadId],
    });

    return result.rows.map((row) => ({
      id: String(row.id),
      threadId: String(row.thread_id),
      role: row.role as ConversationMessage['role'],
      authorId: row.author_id != null ? String(row.author_id) : undefined,
      parts: parseJson<ConversationMessage['parts']>(row.parts_json) ?? [],
      metadata: parseJson<Record<string, JsonValue>>(row.metadata_json) ?? undefined,
      replacedByMessageId: row.replaced_by_message_id != null ? String(row.replaced_by_message_id) : null,
      operationalMemoryType: row.om_type != null
        ? (row.om_type ?? null) as ConversationMessage['operationalMemoryType']
        : undefined,
      operationalMemoryGeneration:
        typeof row.om_generation === 'number' ? row.om_generation : row.om_generation === null ? null : undefined,
      createdAt: String(row.created_at),
    }));
  }

  async clearThread(threadId: string): Promise<void> {
    await this.ensureSchema();
    await this.client.batch([
      {
        sql: `
          delete from ${escapeIdentifier(this.messageTableName)}
          where thread_id = ?
        `,
        args: [threadId],
      },
      {
        sql: `
          delete from ${escapeIdentifier(this.stateTableName)}
          where thread_id = ?
        `,
        args: [threadId],
      },
      {
        sql: `
          delete from ${escapeIdentifier(this.workingMemoryTableName)}
          where thread_id = ?
        `,
        args: [threadId],
      },
      {
        sql: `
          delete from ${escapeIdentifier(this.threadTableName)}
          where id = ?
        `,
        args: [threadId],
      },
    ], 'write');
  }

  async load(threadId: string): Promise<OperationalMemoryConversationState | null> {
    await this.ensureSchema();
    const result = await this.client.execute({
      sql: `
        select state_json
        from ${escapeIdentifier(this.stateTableName)}
        where thread_id = ?
        limit 1
      `,
      args: [threadId],
    });
    const row = result.rows[0];

    if (row == null) {
      return null;
    }

    return parseJson<OperationalMemoryConversationState>(row.state_json);
  }

  async save(state: OperationalMemoryConversationState): Promise<void> {
    await this.ensureSchema();
    await this.client.execute({
      sql: `
        insert into ${escapeIdentifier(this.stateTableName)} (
          thread_id,
          state_json,
          updated_at
        ) values (?, ?, ?)
        on conflict(thread_id) do update set
          state_json = excluded.state_json,
          updated_at = excluded.updated_at
      `,
      args: [state.threadId, serializeJson(state), state.updatedAt],
    });
  }

  async read(input: {
    threadId: string;
    resourceId: string;
  }): Promise<WorkingMemoryRecord | null> {
    await this.ensureSchema();
    const result = await this.client.execute({
      sql: `
        select
          thread_id,
          resource_id,
          working_memory,
          updated_at
        from ${escapeIdentifier(this.workingMemoryTableName)}
        where thread_id = ? and resource_id = ?
        limit 1
      `,
      args: [input.threadId, input.resourceId],
    });
    const row = result.rows[0];

    if (row == null) {
      return null;
    }

    return {
      threadId: String(row.thread_id),
      resourceId: String(row.resource_id),
      workingMemory: String(row.working_memory),
      updatedAt: String(row.updated_at),
    };
  }

  async write(input: {
    threadId: string;
    resourceId: string;
    workingMemory: string;
    updatedAt?: string;
  }): Promise<void> {
    await this.ensureSchema();
    await this.client.execute({
      sql: `
        insert into ${escapeIdentifier(this.workingMemoryTableName)} (
          thread_id,
          resource_id,
          working_memory,
          updated_at
        ) values (?, ?, ?, ?)
        on conflict(thread_id, resource_id) do update set
          working_memory = excluded.working_memory,
          updated_at = excluded.updated_at
      `,
      args: [
        input.threadId,
        input.resourceId,
        input.workingMemory,
        input.updatedAt ?? new Date().toISOString(),
      ],
    });
  }

  private async ensureSchema() {
    if (this.schemaReady) {
      return;
    }

    await this.client.batch([
      {
        sql: `
          create table if not exists ${escapeIdentifier(this.threadTableName)} (
            id text primary key,
            title text,
            participant_ids_json text not null,
            metadata_json text,
            created_at text not null,
            updated_at text not null
          )
        `,
      },
      {
        sql: `
          create table if not exists ${escapeIdentifier(this.messageTableName)} (
            id text primary key,
            thread_id text not null,
            role text not null,
            author_id text,
            parts_json text not null,
            metadata_json text,
            replaced_by_message_id text,
            om_type text,
            om_generation integer,
            created_at text not null
          )
        `,
      },
      {
        sql: `
          create index if not exists ${escapeIdentifier(`${this.messageTableName}_thread_created_idx`)}
          on ${escapeIdentifier(this.messageTableName)} (thread_id, created_at)
        `,
      },
      {
        sql: `
          create table if not exists ${escapeIdentifier(this.stateTableName)} (
            thread_id text primary key,
            state_json text not null,
            updated_at text not null
          )
        `,
      },
      {
        sql: `
          create table if not exists ${escapeIdentifier(this.workingMemoryTableName)} (
            thread_id text not null,
            resource_id text not null,
            working_memory text not null,
            updated_at text not null,
            primary key (thread_id, resource_id)
          )
        `,
      },
    ], 'write');
    await ensureColumn(this.client, this.messageTableName, 'replaced_by_message_id', 'text');
    await ensureColumn(this.client, this.messageTableName, 'om_type', 'text');
    await ensureColumn(this.client, this.messageTableName, 'om_generation', 'integer');
    this.schemaReady = true;
  }
}

async function ensureColumn(
  client: Client,
  tableName: string,
  columnName: string,
  columnDefinition: string,
) {
  const result = await client.execute(`pragma table_info(${escapeIdentifier(tableName)})`);
  const hasColumn = result.rows.some((row) => String(row.name) === columnName);

  if (hasColumn) {
    return;
  }

  await client.execute(`alter table ${escapeIdentifier(tableName)} add column ${escapeIdentifier(columnName)} ${columnDefinition}`);
}
