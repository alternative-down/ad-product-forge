import { z } from 'zod';
import type { Client } from '@libsql/client';

export type TodoItemStatus = 'pending' | 'in_progress' | 'completed';

export type TodoItem = {
  id: string;
  threadId: string;
  resourceId: string;
  title: string;
  status: TodoItemStatus;
  createdAt: string;
  updatedAt: string;
};

export type TodoItemInput = {
  id?: string;
  title: string;
  status?: TodoItemStatus;
};

export const todoItemInputSchema = z.union([
  z.object({
    items: z.union([
      z.object({
        id: z.string().optional(),
        title: z.string().min(1),
        status: z.enum(['pending', 'in_progress', 'completed']).optional(),
      }),
      z.array(z.object({
        id: z.string().optional(),
        title: z.string().min(1),
        status: z.enum(['pending', 'in_progress', 'completed']).optional(),
      })),
    ]),
  }),
]).transform((val) => {
  if ('items' in val) {
    const items = val.items;
    if (Array.isArray(items)) {
      return { items } as { items: TodoItemInput[] };
    }
    return { items: [items] as TodoItemInput[] };
  }
  return { items: [] as TodoItemInput[] };
});

export type LibsqlTodoStoreOptions = {
  client: Client;
  tablePrefix?: string;
};

export class LibsqlTodoStore {
  private readonly client: Client;
  private readonly tableName: string;
  private schemaReady = false;

  constructor(options: LibsqlTodoStoreOptions) {
    this.client = options.client;
    const prefix = options.tablePrefix ?? 'forge_runtime';
    this.tableName = `${prefix}_todos`;
  }

  private async ensureSchema() {
    if (this.schemaReady) return;
    await this.client.execute({
      sql: `create table if not exists "${this.tableName.replace(/"/g, '""')}" (
        id text not null,
        thread_id text not null,
        resource_id text not null,
        title text not null,
        status text not null default 'pending',
        created_at text not null,
        updated_at text not null,
        primary key (thread_id, resource_id, id)
      )`,
    });
    this.schemaReady = true;
  }

  private escapeId(value: string) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  /**
   * Upsert one or many todo items atomically.
   * Items with id → update existing. Items without id → create new (UUID).
   * No status on update → preserve existing.
   */
  async upsertTodos(
    threadId: string,
    resourceId: string,
    items: TodoItemInput[],
  ): Promise<TodoItem[]> {
    if (items.length === 0) {
      return this.getTodos(threadId, resourceId);
    }

    await this.ensureSchema();
    const now = new Date().toISOString();

    const results: TodoItem[] = [];

    for (const item of items) {
      if (item.id) {
        // Update existing
        const setClauses = ['updated_at = ?'];
        const args: (string | number)[] = [now];

        if (item.title !== undefined) {
          setClauses.push('title = ?');
          args.push(item.title);
        }
        if (item.status !== undefined) {
          setClauses.push('status = ?');
          args.push(item.status);
        }

        args.push(item.id, threadId, resourceId);

        await this.client.execute({
          sql: `update ${this.escapeId(this.tableName)} set ${setClauses.join(', ')} where id = ? and thread_id = ? and resource_id = ?`,
          args,
        });

        const existing = await this.client.execute({
          sql: `select * from ${this.escapeId(this.tableName)} where id = ? and thread_id = ? and resource_id = ?`,
          args: [item.id, threadId, resourceId],
        });
        if (existing.rows.length > 0) {
          results.push(this.rowToTodo(existing.rows[0]));
        }
      } else {
        // Create new
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await this.client.execute({
          sql: `insert into ${this.escapeId(this.tableName)} (id, thread_id, resource_id, title, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)`,
          args: [id, threadId, resourceId, item.title, item.status ?? 'pending', now, now],
        });
        results.push({
          id,
          threadId,
          resourceId,
          title: item.title,
          status: item.status ?? 'pending',
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return results;
  }

  /**
   * Get all todos for a thread/resource.
   */
  async getTodos(threadId: string, resourceId: string): Promise<TodoItem[]> {
    await this.ensureSchema();
    const result = await this.client.execute({
      sql: `select * from ${this.escapeId(this.tableName)} where thread_id = ? and resource_id = ? order by created_at asc`,
      args: [threadId, resourceId],
    });
    return Array.from(result.rows).map((row) => this.rowToTodo(row));
  }

  /**
   * Clear all todos for a thread/resource.
   */
  async clearTodos(threadId: string, resourceId: string): Promise<void> {
    await this.ensureSchema();
    await this.client.execute({
      sql: `delete from ${this.escapeId(this.tableName)} where thread_id = ? and resource_id = ?`,
      args: [threadId, resourceId],
    });
  }

  private rowToTodo(row: Record<string, unknown>): TodoItem {
    return {
      id: String(row['id']),
      threadId: String(row['thread_id']),
      resourceId: String(row['resource_id']),
      title: String(row['title']),
      status: String(row['status']) as TodoItemStatus,
      createdAt: String(row['created_at']),
      updatedAt: String(row['updated_at']),
    };
  }
}

export type UpdateTodosInput = z.infer<typeof todoItemInputSchema>;

/**
 * Creates the updateTodos runtime action.
 * Requires threadId and resourceId to scope todos per agent/thread/resource.
 */
export function createUpdateTodosAction(
  store: LibsqlTodoStore,
  threadId: string,
  resourceId: string,
) {
  return {
    name: 'updateTodos',
    description: 'Create, update, complete, or clear operational todo items. Items without id are created; items with id are updated. Empty array clears all.',
    inputSchema: todoItemInputSchema as any,
    execute: async (rawInput: unknown): Promise<unknown> => {
      const { items } = todoItemInputSchema.parse(rawInput) as { items: TodoItemInput[] };

      if (items.length === 0) {
        await store.clearTodos(threadId, resourceId);
        return { cleared: true, todos: [] };
      }

      const updated = await store.upsertTodos(threadId, resourceId, items);
      return { todos: updated };
    },
  };
}