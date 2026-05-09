/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import type { Client } from '@libsql/client';
import { z } from 'zod';

import type { CommunicationContactsStore } from './communication-module.js';

const contactRecordSchema = z.object({
  slug: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().optional(),
});

const stateSchema = z.object({
  version: z.literal(1),
  contacts: z.array(contactRecordSchema),
});

type ContactRecord = z.infer<typeof contactRecordSchema>;

export type LibsqlCommunicationContactsStoreOptions = {
  client: Client;
  tablePrefix: string;
};

export class LibsqlCommunicationContactsStore implements CommunicationContactsStore {
  private readonly client: Client;
  private readonly tableName: string;
  private readonly initialized: Promise<void>;

  constructor(options: LibsqlCommunicationContactsStoreOptions) {
    this.client = options.client;
    this.tableName = `${options.tablePrefix}_communication_contacts_state`;
    this.initialized = this.initialize();
  }

  async listContacts(): Promise<ContactRecord[]> {
    await this.initialized;

    const result = await this.client.execute(`
      select state_json
      from ${this.tableName}
      where id = 1
    `);
    const row = result.rows[0];

    if (!row || typeof row.state_json !== 'string') {
      return [];
    }

    const parsed = stateSchema.safeParse(JSON.parse(row.state_json));

    if (!parsed.success) {
      return [];
    }

    return parsed.data.contacts;
  }

  async saveContacts(contacts: ContactRecord[]): Promise<void> {
    await this.initialized;

    await this.client.execute({
      sql: `
        insert into ${this.tableName} (id, state_json, updated_at)
        values (1, ?, unixepoch() * 1000)
        on conflict(id) do update set
          state_json = excluded.state_json,
          updated_at = excluded.updated_at
      `,
      args: [JSON.stringify({
        version: 1,
        contacts,
      })],
    });
  }

  private async initialize() {
    await this.client.execute(`
      create table if not exists ${this.tableName} (
        id integer primary key check (id = 1),
        state_json text not null,
        updated_at integer not null
      )
    `);
  }
}
