import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createClient } from '@libsql/client';
import { afterEach, describe, expect, it } from 'vitest';

import { LibsqlTodoStore, createUpdateTodosAction } from './libsql-todo-store';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function createStore(tablePrefix = 'agent') {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'forge-todos-'));
  tempDirs.push(directory);
  const client = createClient({ url: `file:${path.join(directory, 'agent.db')}` });
  const store = new LibsqlTodoStore({ client, tablePrefix });
  await store.initialize();
  return store;
}

describe('LibsqlTodoStore', () => {
  it('assigns simple stable ids and keeps completed items visible', async () => {
    const store = await createStore();

    expect(await store.update([{ title: 'Inspect failure' }, { title: 'Write fix' }])).toEqual([
      { id: '1', title: 'Inspect failure', status: 'pending' },
      { id: '2', title: 'Write fix', status: 'pending' },
    ]);

    await store.update([{ id: '1', title: 'Inspect failure', status: 'completed' }]);

    expect(await store.getContextText()).toContain(
      '<todo id="1" status="completed">Inspect failure</todo>',
    );
  });

  it('preserves status when an update omits it', async () => {
    const store = await createStore();
    await store.update([{ title: 'Original', status: 'in_progress' }]);

    expect(await store.update([{ id: '1', title: 'Renamed' }])).toEqual([
      { id: '1', title: 'Renamed', status: 'in_progress' },
    ]);
  });

  it('rolls back the complete update when one id does not exist', async () => {
    const store = await createStore();
    await store.update([{ title: 'Original' }]);

    await expect(
      store.update([
        { id: '1', title: 'Changed' },
        { id: '99', title: 'Missing' },
      ]),
    ).rejects.toThrow('Todo 99 does not exist.');
    expect(await store.read()).toEqual([{ id: '1', title: 'Original', status: 'pending' }]);
  });

  it('isolates lists by the agent-owned store', async () => {
    const firstAgent = await createStore('first_agent');
    const secondAgent = await createStore('second_agent');

    await firstAgent.update([{ title: 'First agent task' }]);
    await secondAgent.update([{ title: 'Second agent task' }]);

    expect(await firstAgent.read()).toEqual([
      { id: '1', title: 'First agent task', status: 'pending' },
    ]);
    expect(await secondAgent.read()).toEqual([
      { id: '1', title: 'Second agent task', status: 'pending' },
    ]);
  });
});

describe('createUpdateTodosAction', () => {
  it('accepts an items list and clears only with items: []', async () => {
    const store = await createStore();
    const action = createUpdateTodosAction(store);

    await action.execute({ items: [{ title: 'First' }, { title: 'Second' }] });
    expect(await store.read()).toHaveLength(2);

    expect(await action.execute({ items: [] })).toEqual({ todos: [] });
    expect(await store.read()).toEqual([]);
  });

  it('validates ids, titles, and statuses at the action boundary', async () => {
    const action = createUpdateTodosAction(await createStore());

    await expect(action.execute({ items: { title: 'Not a list' } })).rejects.toThrow();
    await expect(action.execute({ items: [{ id: 'task-a', title: 'Invalid' }] })).rejects.toThrow();
    await expect(action.execute({ items: [{ title: '' }] })).rejects.toThrow();
    await expect(
      action.execute({ items: [{ title: 'Task', status: 'blocked' }] }),
    ).rejects.toThrow();
  });
});
