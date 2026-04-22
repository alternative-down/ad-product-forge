import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createClient } from '@libsql/client';
import { afterEach, describe, expect, it } from 'vitest';

import { LibsqlCommunicationContactsStore } from './libsql-communication-contacts-store.js';

const tempDirectories: string[] = [];

afterEach(async () => {
  while (tempDirectories.length > 0) {
    const directoryPath = tempDirectories.pop();

    if (directoryPath) {
      await rm(directoryPath, { recursive: true, force: true });
    }
  }
});

describe('LibsqlCommunicationContactsStore', () => {
  it('persists contacts in sqlite', async () => {
    const directoryPath = await mkdtemp(path.join(os.tmpdir(), 'forge-runtime-contacts-'));
    const databasePath = path.join(directoryPath, 'contacts.db');
    tempDirectories.push(directoryPath);
    const client = createClient({
      url: `file:${databasePath}`,
    });
    const store = new LibsqlCommunicationContactsStore({
      client,
      tablePrefix: 'agent_test',
    });

    try {
      await store.saveContacts([
        {
          slug: 'nicolas',
          displayName: 'Nicolas',
          description: 'Founder',
        },
      ]);

      await expect(store.listContacts()).resolves.toEqual([
        {
          slug: 'nicolas',
          displayName: 'Nicolas',
          description: 'Founder',
        },
      ]);
    } finally {
      client.close();
    }
  });
});
