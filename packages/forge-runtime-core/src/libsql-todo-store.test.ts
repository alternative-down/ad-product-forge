import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createClient } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LibsqlTodoStore, createUpdateTodosAction } from './libsql-todo-store';

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const d = tempDirs.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

async function makeStore(tablePrefix = 'forge_runtime') {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'todo-test-'));
  tempDirs.push(dir);
  const dbPath = path.join(dir, 'todo.db');
  const client = createClient({ url: `file:${dbPath}` });
  return { store: new LibsqlTodoStore({ client, tablePrefix }), client, dir };
}

describe('LibsqlTodoStore', () => {
  describe('upsertTodos', () => {
    it('creates a new todo when no id provided', async function() {
      const { store } = await makeStore();
      const result = await store.upsertTodos('thread-1', 'resource-1', [{ title: 'Test todo' }]);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test todo');
      expect(result[0].status).toBe('pending');
      expect(result[0].threadId).toBe('thread-1');
      expect(result[0].resourceId).toBe('resource-1');
      expect(result[0].id).toBeTruthy();
    });

    it('creates with in_progress status', async function() {
      const { store } = await makeStore();
      const result = await store.upsertTodos('thread-1', 'resource-1', [{ title: 'Working', status: 'in_progress' }]);
      expect(result[0].status).toBe('in_progress');
    });

    it('creates with completed status', async function() {
      const { store } = await makeStore();
      const result = await store.upsertTodos('thread-1', 'resource-1', [{ title: 'Done', status: 'completed' }]);
      expect(result[0].status).toBe('completed');
    });

    it('updates existing todo by id', async function() {
      const { store } = await makeStore();
      const created = await store.upsertTodos('thread-1', 'resource-1', [{ title: 'Original' }]);
      const id = created[0].id;
      const updated = await store.upsertTodos('thread-1', 'resource-1', [{ id, title: 'Updated', status: 'completed' }]);
      expect(updated[0].title).toBe('Updated');
      expect(updated[0].status).toBe('completed');
    });

    it('updates title only, preserving status', async function() {
      const { store } = await makeStore();
      const created = await store.upsertTodos('thread-1', 'resource-1', [{ title: 'Original', status: 'in_progress' }]);
      const id = created[0].id;
      const updated = await store.upsertTodos('thread-1', 'resource-1', [{ id, title: 'New Title' }]);
      expect(updated[0].title).toBe('New Title');
      expect(updated[0].status).toBe('in_progress');
    });

    it('upserts multiple items', async function() {
      const { store } = await makeStore();
      const results = await store.upsertTodos('thread-1', 'resource-1', [
        { title: 'First' },
        { title: 'Second', status: 'completed' },
      ]);
      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('First');
      expect(results[1].status).toBe('completed');
    });
  });

  describe('getTodos', () => {
    it('returns empty when no todos', async function() {
      const { store } = await makeStore();
      expect(await store.getTodos('thread-1', 'resource-1')).toEqual([]);
    });

    it('returns all todos for thread/resource in insertion order', async function() {
      const { store } = await makeStore();
      await store.upsertTodos('thread-1', 'resource-1', [{ title: 'A' }, { title: 'B' }]);
      const result = await store.getTodos('thread-1', 'resource-1');
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('A');
      expect(result[1].title).toBe('B');
    });

    it('isolates per thread/resource', async function() {
      const { store } = await makeStore();
      await store.upsertTodos('t1', 'r1', [{ title: 'T1R1' }]);
      await store.upsertTodos('t2', 'r1', [{ title: 'T2R1' }]);
      expect((await store.getTodos('t1', 'r1'))[0].title).toBe('T1R1');
      expect((await store.getTodos('t2', 'r1'))[0].title).toBe('T2R1');
    });
  });

  describe('clearTodos', () => {
    it('removes all todos for thread/resource', async function() {
      const { store } = await makeStore();
      await store.upsertTodos('thread-1', 'resource-1', [{ title: 'A' }, { title: 'B' }]);
      await store.clearTodos('thread-1', 'resource-1');
      expect(await store.getTodos('thread-1', 'resource-1')).toEqual([]);
    });
  });
});

describe('createUpdateTodosAction', () => {
  it('has correct name and description', async function() {
    const { store } = await makeStore();
    const action = createUpdateTodosAction(store, 'thread-1', 'resource-1');
    expect(action.name).toBe('updateTodos');
    expect(action.description).toContain('Create, update, complete, or clear');
  });

  it('creates single todo from object input', async function() {
    const { store } = await makeStore();
    const action = createUpdateTodosAction(store, 'thread-1', 'resource-1');
    const result = await action.execute({ items: { title: 'New task' } });
    expect((result as any).todos).toHaveLength(1);
    expect((result as any).todos[0].title).toBe('New task');
    expect((result as any).todos[0].status).toBe('pending');
  });

  it('creates multiple todos from array input', async function() {
    const { store } = await makeStore();
    const action = createUpdateTodosAction(store, 'thread-1', 'resource-1');
    const result = await action.execute({
      items: [{ title: 'T1' }, { title: 'T2', status: 'completed' }],
    });
    expect((result as any).todos).toHaveLength(2);
  });

  it('clears todos with empty array', async function() {
    const { store } = await makeStore();
    await store.upsertTodos('thread-1', 'resource-1', [{ title: 'To clear' }]);
    const action = createUpdateTodosAction(store, 'thread-1', 'resource-1');
    const result = await action.execute({ items: [] });
    expect((result as any).cleared).toBe(true);
    expect((result as any).todos).toEqual([]);
    expect(await store.getTodos('thread-1', 'resource-1')).toEqual([]);
  });

  it('updates existing todo by id', async function() {
    const { store } = await makeStore();
    const created = await store.upsertTodos('thread-1', 'resource-1', [{ title: 'Original' }]);
    const id = created[0].id;
    const action = createUpdateTodosAction(store, 'thread-1', 'resource-1');
    const result = await action.execute({ items: [{ id, title: 'Updated', status: 'completed' }] });
    expect((result as any).todos[0].title).toBe('Updated');
    expect((result as any).todos[0].status).toBe('completed');
  });

  it('rejects empty title', async function() {
    const { store } = await makeStore();
    const action = createUpdateTodosAction(store, 'thread-1', 'resource-1');
    await expect(action.execute({ items: { title: '' } })).rejects.toThrow();
  });

  it('rejects invalid status', async function() {
    const { store } = await makeStore();
    const action = createUpdateTodosAction(store, 'thread-1', 'resource-1');
    await expect(
      action.execute({ items: { title: 'Test', status: 'invalid' as any } }),
    ).rejects.toThrow();
  });
});