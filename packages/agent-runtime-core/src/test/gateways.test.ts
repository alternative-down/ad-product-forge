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
  it('executes a real shell command and captures stdout', async () => {
    const gateway = new LocalBashWorkspaceGateway();
    const result = await gateway.execute({
      command: 'printf hello',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hello');
  });

  it('executes commands inside a rooted real filesystem', async () => {
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

  it('accepts configured alias roots as valid cwd locations', async () => {
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
    expect(result.stdout.trim()).toBe(root);
  });

  it('uses real curl, python, and node from the environment', async () => {
    const gateway = new LocalBashWorkspaceGateway();
    const availabilityResult = await gateway.execute({
      command: 'which curl && which python3 && which node',
    });

    expect(availabilityResult.exitCode).toBe(0);
    expect(availabilityResult.stdout).toContain('/bin/curl');
    expect(availabilityResult.stdout).toContain('/bin/node');
  });

  it('inherits HOME from the host environment', async () => {
    const gateway = new LocalBashWorkspaceGateway();
    const result = await gateway.execute({
      command: 'printf %s "$HOME"',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim().length).toBeGreaterThan(0);
  });

  it('supports background processes with output inspection and kill', async () => {
    const gateway = new LocalBashWorkspaceGateway();
    const started = await gateway.startBackground!({
      command: 'printf "hello\\n"; sleep 5; printf "done\\n"',
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const output = await gateway.getProcessOutput!({
      pid: started.pid,
      tail: 10,
    });

    expect(output.pid).toBe(started.pid);
    expect(output.stdout).toContain('hello');
    expect(output.running).toBe(true);

    const killed = await gateway.killProcess!(started.pid);

    expect(killed?.pid).toBe(started.pid);
    expect(killed?.running).toBe(false);
  });
});
