import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LocalBashWorkspaceGateway } from '../integrations/gateways/local-bash-workspace.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })),
  );
});

describe('LocalBashWorkspaceGateway', () => {
  it('executes a bash command and captures stdout', async () => {
    const gateway = new LocalBashWorkspaceGateway();
    const result = await gateway.execute({
      command: 'printf hello',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hello');
  });

  it('executes commands inside a rooted just-bash filesystem', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'local-bash-workspace-'));
    temporaryDirectories.push(root);
    await writeFile(path.join(root, 'hello.txt'), 'hello just bash');

    const gateway = new LocalBashWorkspaceGateway({
      root,
    });
    const result = await gateway.execute({
      command: 'cat hello.txt',
      cwd: root,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello just bash');
  });

  it('maps configured alias roots into the workspace sandbox root', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'local-bash-workspace-'));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, 'workspace'), { recursive: true });

    const gateway = new LocalBashWorkspaceGateway({
      root: path.join(root, 'workspace'),
      pathAliases: [root],
    });
    const result = await gateway.execute({
      command: 'pwd',
      cwd: root,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('/');
  });

  it('enables curl, python, and node-compatible javascript commands', async () => {
    const gateway = new LocalBashWorkspaceGateway();
    const availabilityResult = await gateway.execute({
      command: 'which curl && which python3 && which node',
    });

    expect(availabilityResult.exitCode).toBe(0);
    expect(availabilityResult.stdout).toContain('/bin/curl');
    expect(availabilityResult.stdout).toContain('/bin/python3');
    expect(availabilityResult.stdout).toContain('/bin/node');
  });
});
