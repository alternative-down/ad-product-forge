import type { Client, Transaction } from '@libsql/client';
import { z } from 'zod';

export type TodoItemStatus = 'pending' | 'in_progress' | 'completed';

export type TodoItem = {
  id: string;
  title: string;
  status: TodoItemStatus;
};

export type TodoItemInput = {
  id?: string;
  title: string;
  status?: TodoItemStatus;
};

const todoItemSchema = z.object({
  id: z.string().regex(/^\d+$/).optional(),
  title: z.string().trim().min(1),
  status: z.enum(['pending', 'in_progress', 'completed']).optional(),
});

const updateTodosSchema = z.object({
  items: z.array(todoItemSchema),
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

  async initialize(): Promise<void> {
    await this.client.execute({
      sql: `create table if not exists ${this.escapedTableName} (
        id text primary key,
        title text not null,
        status text not null
      )`,
    });
    this.schemaReady = true;
  }

  async update(items: TodoItemInput[]): Promise<TodoItem[]> {
    this.assertReady();
    const transaction = await this.client.transaction('write');

    try {
      if (items.length === 0) {
        await transaction.execute(`delete from ${this.escapedTableName}`);
        await transaction.commit();
        return [];
      }

      const current = await this.readFrom(transaction);
      let nextId = current.reduce((largest, item) => Math.max(largest, Number(item.id)), 0) + 1;

      for (const item of items) {
        if (item.id === undefined) {
          const id = String(nextId);
          nextId += 1;
          await transaction.execute({
            sql: `insert into ${this.escapedTableName} (id, title, status) values (?, ?, ?)`,
            args: [id, item.title, item.status ?? 'pending'],
          });
          current.push({ id, title: item.title, status: item.status ?? 'pending' });
          continue;
        }

        const existing = current.find((candidate) => candidate.id === item.id);

        if (existing === undefined) {
          throw new Error(`Todo ${item.id} does not exist.`);
        }

        await transaction.execute({
          sql: `update ${this.escapedTableName} set title = ?, status = ? where id = ?`,
          args: [item.title, item.status ?? existing.status, item.id],
        });
        existing.title = item.title;
        existing.status = item.status ?? existing.status;
      }

      const updated = await this.readFrom(transaction);
      await transaction.commit();
      return updated;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async read(): Promise<TodoItem[]> {
    this.assertReady();
    return await this.readFrom(this.client);
  }

  async getContextText(): Promise<string> {
    const items = await this.read();

    if (items.length === 0) {
      return '';
    }

    return [
      '<operational_todos>',
      ...items.map(
        (item) => `  <todo id="${item.id}" status="${item.status}">${escapeXml(item.title)}</todo>`,
      ),
      '</operational_todos>',
    ].join('\n');
  }

  private assertReady() {
    if (!this.schemaReady) {
      throw new Error('Initialize the todo store before using it.');
    }
  }

  private async readFrom(executor: Pick<Client | Transaction, 'execute'>): Promise<TodoItem[]> {
    const result = await executor.execute(
      `select id, title, status from ${this.escapedTableName} order by cast(id as integer) asc`,
    );

    return result.rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      status: String(row.status) as TodoItemStatus,
    }));
  }

  private get escapedTableName() {
    return `"${this.tableName.replaceAll('"', '""')}"`;
  }
}

export type UpdateTodosInput = z.infer<typeof updateTodosSchema>;

export function createUpdateTodosAction(store: LibsqlTodoStore) {
  return {
    name: 'updateTodos',
    description:
      'Create or update persistent operational todos. Send an empty items array only when the entire list should be cleared. Completed items remain visible until cleared.',
    inputSchema: updateTodosSchema,
    async execute(input: unknown) {
      const parsed = updateTodosSchema.parse(input);
      const todos = await store.update(parsed.items);

      return { todos };
    },
  };
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
