/**
 * Integration tests for sandboxed execution isolation in ConfiguredWorkspaceGateway.
 *
 * Validates that:
 *   1. Path traversal attacks are blocked (no escape from workspace root)
 *   2. Environment variables are isolated per workspace (HOME is overridden)
 *   3. Working directory is correctly scoped
 *   4. Timeout limits are enforced
 *   5. Two agents' workspaces are fully isolated from each other
 *
 * Each test creates its own unique temp directory so tests are fully independent
 * and safe to run in parallel across vitest workers.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ConfiguredWorkspaceGateway } from '../integrations/gateways/configured-workspace-gateway.js';
import type { WorkspaceGateway } from '../integrations/gateways/workspace.js';

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/** A no-op base gateway that records calls but does not execute anything */
function makeSpyBaseGateway() {
  return {
    execute: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, timedOut: false }),
    startBackground: vi.fn().mockResolvedValue({ pid: 'test-pid' }),
    getProcessOutput: vi
      .fn()
      .mockResolvedValue({ pid: 'test-pid', running: false, exitCode: 0, stdout: '', stderr: '' }),
    killProcess: vi.fn().mockResolvedValue(null),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Fixture helpers — each creates a unique, isolated temp workspace
// ─────────────────────────────────────────────────────────────────────────

/** Returns paths for two isolated agent workspace directories */
async function makeIsolatedWorkspaces() {
  // Unique suffix prevents cross-worker collisions
  const base = await fs.mkdtemp(
    path.join(os.tmpdir(), `sandbox-iso-${Date.now()}-${Math.random().toString(36).slice(2)}-`),
  );
  const agentA = path.join(base, 'agent-a');
  const agentB = path.join(base, 'agent-b');
  const subDir = path.join(agentA, 'sub');

  await fs.mkdir(path.join(agentA, 'sub'), { recursive: true });
  await fs.mkdir(agentB, { recursive: true });
  await fs.writeFile(path.join(agentA, 'a.txt'), 'a-file-content');
  await fs.writeFile(path.join(agentA, 'sub', 'nested.txt'), 'nested-content');
  await fs.writeFile(path.join(agentB, 'b.txt'), 'b-file-content');

  return { base, subDir, agentA, agentB };
}

// ─────────────────────────────────────────────────────────────────────────
// Tests — ConfiguredWorkspaceGateway cwd and env scoping
// ─────────────────────────────────────────────────────────────────────────

describe('ConfiguredWorkspaceGateway', () => {
  describe('execute() — cwd scoping', () => {
    it('uses the configured cwd when request does not provide one', async () => {
      const { agentA } = await makeIsolatedWorkspaces();
      const base = makeSpyBaseGateway();
      const gateway = new ConfiguredWorkspaceGateway({ base, cwd: agentA });

      await gateway.execute({ command: 'ls' });

      expect(base.execute).toHaveBeenCalledWith(expect.objectContaining({ cwd: agentA }));
    });

    it('request-provided cwd takes precedence over gateway default', async () => {
      const { agentA, subDir } = await makeIsolatedWorkspaces();
      const base = makeSpyBaseGateway();
      const gateway = new ConfiguredWorkspaceGateway({ base, cwd: agentA });

      await gateway.execute({ command: 'ls', cwd: subDir });

      expect(base.execute).toHaveBeenCalledWith(expect.objectContaining({ cwd: subDir }));
    });

    it('does not default to host root when cwd is unspecified and base has no cwd', async () => {
      const base = makeSpyBaseGateway();
      const gateway = new ConfiguredWorkspaceGateway({ base });

      await gateway.execute({ command: 'ls' });

      const call = base.execute.mock.calls[0][0] as { cwd?: string };
      expect(call.cwd).toBeUndefined();
    });
  });

  describe('execute() — env isolation', () => {
    it('sets HOME to workspaceRoot when workspaceRoot is configured', async () => {
      const { agentA } = await makeIsolatedWorkspaces();
      const base = makeSpyBaseGateway();
      const gateway = new ConfiguredWorkspaceGateway({ base, workspaceRoot: agentA });

      await gateway.execute({ command: 'echo $HOME' });

      expect(base.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          env: expect.objectContaining({ HOME: agentA }),
        }),
      );
    });

    // Note: buildEnv sets workspaceRoot HOME after merging request env,
    // so workspace HOME takes precedence over request HOME (sandbox isolation).
    // The request can still pass custom env vars, just not override HOME.
    it('workspace-scoped HOME takes precedence over request HOME (isolation guarantee)', async () => {
      const { agentA, base: fixtureRoot } = await makeIsolatedWorkspaces();
      const base = makeSpyBaseGateway();
      const gateway = new ConfiguredWorkspaceGateway({ base, workspaceRoot: agentA });

      await gateway.execute({
        command: 'env',
        env: { HOME: '/custom/path', OTHER_VAR: 'preserved' },
      });

      const call = base.execute.mock.calls[0][0] as { env: Record<string, string> };
      // Workspace HOME is enforced for isolation — request HOME cannot override it
      expect(call.env.HOME).toBe(agentA);
      // Non-conflicting request env vars are still preserved
      expect(call.env.OTHER_VAR).toBe('preserved');

      await fs.rm(fixtureRoot, { recursive: true, force: true });
    });

    it('base env vars are preserved when adding workspace isolation vars', async () => {
      const { agentA } = await makeIsolatedWorkspaces();
      const base = makeSpyBaseGateway();
      const gateway = new ConfiguredWorkspaceGateway({
        base,
        env: { NODE_ENV: 'test', CUSTOM_VAR: 'value' },
        workspaceRoot: agentA,
      });

      await gateway.execute({ command: 'env' });

      expect(base.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          env: expect.objectContaining({
            NODE_ENV: 'test',
            CUSTOM_VAR: 'value',
            HOME: agentA,
          }),
        }),
      );
    });

    it('workspaceRoot HOME is not set when workspaceRoot option is omitted', async () => {
      const base = makeSpyBaseGateway();
      const gateway = new ConfiguredWorkspaceGateway({
        base,
        env: { MY_VAR: 'hello' },
      });

      await gateway.execute({ command: 'env' });

      const callEnv = base.execute.mock.calls[0][0].env as Record<string, string>;
      expect(callEnv.HOME).toBeUndefined();
      expect(callEnv.MY_VAR).toBe('hello');
    });
  });

  describe('execute() — timeout enforcement', () => {
    it('applies gateway-level timeout when request has no timeout', async () => {
      const base = makeSpyBaseGateway();
      const gateway = new ConfiguredWorkspaceGateway({ base, timeoutMs: 5000 });

      await gateway.execute({ command: 'sleep 10' });

      expect(base.execute).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 5000 }));
    });

    it('request-level timeout takes precedence over gateway default', async () => {
      const base = makeSpyBaseGateway();
      const gateway = new ConfiguredWorkspaceGateway({ base, timeoutMs: 5000 });

      await gateway.execute({ command: 'sleep 10', timeoutMs: 1000 });

      expect(base.execute).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 1000 }));
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Tests — agent workspace isolation (two agents must not share state)
// ─────────────────────────────────────────────────────────────────────────

describe('ConfiguredWorkspaceGateway — agent workspace isolation', () => {
  it('two agents configured with different workspace roots see different cwd and HOME', async () => {
    const { agentA, agentB } = await makeIsolatedWorkspaces();
    const baseAgentA = makeSpyBaseGateway();
    const baseAgentB = makeSpyBaseGateway();

    const gatewayA = new ConfiguredWorkspaceGateway({
      base: baseAgentA,
      cwd: agentA,
      workspaceRoot: agentA,
    });

    const gatewayB = new ConfiguredWorkspaceGateway({
      base: baseAgentB,
      cwd: agentB,
      workspaceRoot: agentB,
    });

    await gatewayA.execute({ command: 'ls .' });
    await gatewayB.execute({ command: 'ls .' });

    // Each gateway scoped its own cwd
    expect(baseAgentA.execute).toHaveBeenCalledWith(expect.objectContaining({ cwd: agentA }));
    expect(baseAgentB.execute).toHaveBeenCalledWith(expect.objectContaining({ cwd: agentB }));

    // Each agent got its own HOME — not the other's workspace root
    const envA = baseAgentA.execute.mock.calls[0][0].env as Record<string, string>;
    const envB = baseAgentB.execute.mock.calls[0][0].env as Record<string, string>;

    expect(envA.HOME).toBe(agentA);
    expect(envB.HOME).toBe(agentB);
    expect(envA.HOME).not.toBe(agentB);
    expect(envB.HOME).not.toBe(agentA);
  });

  it("agent env vars are isolated — one gateway cannot see the other gateway's env", async () => {
    const { agentA, agentB } = await makeIsolatedWorkspaces();
    const baseA = makeSpyBaseGateway();
    const baseB = makeSpyBaseGateway();

    const gatewayA = new ConfiguredWorkspaceGateway({
      base: baseA,
      env: { AGENT_ID: 'agent-a', AGENT_ROLE: 'dev' },
      workspaceRoot: agentA,
    });

    const gatewayB = new ConfiguredWorkspaceGateway({
      base: baseB,
      env: { AGENT_ID: 'agent-b', AGENT_ROLE: 'qa' },
      workspaceRoot: agentB,
    });

    await gatewayA.execute({ command: 'env' });
    await gatewayB.execute({ command: 'env' });

    const envA = baseA.execute.mock.calls[0][0].env as Record<string, string>;
    const envB = baseB.execute.mock.calls[0][0].env as Record<string, string>;

    expect(envA.AGENT_ID).toBe('agent-a');
    expect(envB.AGENT_ID).toBe('agent-b');
    expect(envA.AGENT_ID).not.toBe(envB.AGENT_ID);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Tests — LocalWorkspaceFilesystem path boundary enforcement
// ─────────────────────────────────────────────────────────────────────────

describe('LocalWorkspaceFilesystem — path boundary enforcement', () => {
  it('writeFile throws when path escapes workspace via parent traversal', async () => {
    const { agentA, base: fixtureRoot } = await makeIsolatedWorkspaces();
    const { LocalWorkspaceFilesystem } =
      await import('../integrations/gateways/local-workspace-filesystem.js');
    const workspaceFs = new LocalWorkspaceFilesystem({ root: agentA });

    await expect(workspaceFs.writeFile('../escape.txt', 'bad')).rejects.toThrow(
      /workspace.*(must stay within|escapes).*allowed roots/i,
    );

    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });

  it('writeFile throws when symlink inside workspace points outside to agentB', async () => {
    const { agentA, agentB, base: fixtureRoot } = await makeIsolatedWorkspaces();
    const { LocalWorkspaceFilesystem } =
      await import('../integrations/gateways/local-workspace-filesystem.js');
    // Create a symlink inside agentA that points to agentB
    await fs.symlink(agentB, path.join(agentA, 'escape-link'));

    const workspaceFs = new LocalWorkspaceFilesystem({ root: agentA });

    await expect(
      workspaceFs.writeFile('escape-link/b.txt', 'should not write to agentB'),
    ).rejects.toThrow(/workspace.*(must stay within|escapes).*allowed roots/i);

    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });

  it('readFile throws when path escapes workspace via parent traversal', async () => {
    const { agentA, base: fixtureRoot } = await makeIsolatedWorkspaces();
    const { LocalWorkspaceFilesystem } =
      await import('../integrations/gateways/local-workspace-filesystem.js');
    const workspaceFs = new LocalWorkspaceFilesystem({ root: agentA });

    await expect(workspaceFs.readFile('../a.txt')).rejects.toThrow(
      /workspace.*(must stay within|escapes).*allowed roots/i,
    );

    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });

  it('exists returns false for path that would escape workspace boundary', async () => {
    const { agentA, agentB, base: fixtureRoot } = await makeIsolatedWorkspaces();
    const { LocalWorkspaceFilesystem } =
      await import('../integrations/gateways/local-workspace-filesystem.js');
    const workspaceFs = new LocalWorkspaceFilesystem({ root: agentA });

    // b.txt exists in agentB, but agentA's filesystem should not expose it
    const result = await workspaceFs.exists('../agent-b/b.txt');
    expect(result).toBe(false);

    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });

  it('exists returns false for non-existent path within workspace', async () => {
    const { agentA, base: fixtureRoot } = await makeIsolatedWorkspaces();
    const { LocalWorkspaceFilesystem } =
      await import('../integrations/gateways/local-workspace-filesystem.js');
    const workspaceFs = new LocalWorkspaceFilesystem({ root: agentA });

    const result = await workspaceFs.exists('nonexistent.txt');
    expect(result).toBe(false);

    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });

  it('readFile resolves relative path to file inside workspace', async () => {
    const { agentA, base: fixtureRoot } = await makeIsolatedWorkspaces();
    const { LocalWorkspaceFilesystem } =
      await import('../integrations/gateways/local-workspace-filesystem.js');
    const workspaceFs = new LocalWorkspaceFilesystem({ root: agentA });

    const content = await workspaceFs.readFile('a.txt');
    expect(new TextDecoder().decode(content)).toBe('a-file-content');

    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });

  it('readFile resolves absolute path to file inside workspace root', async () => {
    const { agentA, base: fixtureRoot } = await makeIsolatedWorkspaces();
    const { LocalWorkspaceFilesystem } =
      await import('../integrations/gateways/local-workspace-filesystem.js');
    const workspaceFs = new LocalWorkspaceFilesystem({ root: agentA });

    const absolutePath = path.join(agentA, 'sub', 'nested.txt');
    const content = await workspaceFs.readFile(absolutePath);
    expect(new TextDecoder().decode(content)).toBe('nested-content');

    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });

  it('readFile throws for absolute path outside workspace root', async () => {
    const { agentA, agentB, base: fixtureRoot } = await makeIsolatedWorkspaces();
    const { LocalWorkspaceFilesystem } =
      await import('../integrations/gateways/local-workspace-filesystem.js');
    const workspaceFs = new LocalWorkspaceFilesystem({ root: agentA });

    // Absolute path to agentB's file — should be rejected
    await expect(workspaceFs.readFile(path.join(agentB, 'b.txt'))).rejects.toThrow(
      /workspace.*(must stay within|escapes).*allowed roots/i,
    );

    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });

  it('listDirectory returns only files within workspace root (not agentB)', async () => {
    const { agentA, agentB, base: fixtureRoot } = await makeIsolatedWorkspaces();
    const { LocalWorkspaceFilesystem } =
      await import('../integrations/gateways/local-workspace-filesystem.js');

    // Plant a file in agentB with the same name as agentA's a.txt (to test name collision)
    await fs.writeFile(path.join(agentB, 'a.txt'), 'imposter-content');

    const workspaceFs = new LocalWorkspaceFilesystem({ root: agentA });
    const entries = await workspaceFs.listDirectory('.');

    const names = entries.map((e) => e.name).sort();
    expect(names).toContain('a.txt');
    expect(names).toContain('sub');
    // b.txt is only in agentB — should not appear in agentA's listing
    expect(names).not.toContain('b.txt');

    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Tests — background process isolation
// ─────────────────────────────────────────────────────────────────────────

describe('ConfiguredWorkspaceGateway — background process isolation', () => {
  it('startBackground applies the same cwd scope as execute', async () => {
    const { agentA, base: fixtureRoot } = await makeIsolatedWorkspaces();
    const base_ = makeSpyBaseGateway();
    const gateway = new ConfiguredWorkspaceGateway({ base: base_, cwd: agentA });

    await gateway.startBackground({ command: 'node server.js' });

    expect(base_.startBackground).toHaveBeenCalledWith(expect.objectContaining({ cwd: agentA }));

    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });

  it('startBackground applies workspace env isolation (HOME override)', async () => {
    const { agentB, base: fixtureRoot } = await makeIsolatedWorkspaces();
    const base_ = makeSpyBaseGateway();
    const gateway = new ConfiguredWorkspaceGateway({ base: base_, workspaceRoot: agentB });

    await gateway.startBackground({ command: 'node server.js' });

    expect(base_.startBackground).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({ HOME: agentB }),
      }),
    );

    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });

  it('getProcessOutput and killProcess delegate to base without modification', async () => {
    const base_ = makeSpyBaseGateway();
    const gateway = new ConfiguredWorkspaceGateway({ base: base_ });

    await gateway.getProcessOutput({ pid: 'pid-123' });
    await gateway.killProcess('pid-123');

    expect(base_.getProcessOutput).toHaveBeenCalledWith({ pid: 'pid-123' });
    expect(base_.killProcess).toHaveBeenCalledWith('pid-123');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Tests — workspace root path does not leak to base
// ─────────────────────────────────────────────────────────────────────────

describe('ConfiguredWorkspaceGateway — workspace root property isolation', () => {
  it('workspaceRoot is exposed as a read property for external inspection', async () => {
    const { agentA, base: fixtureRoot } = await makeIsolatedWorkspaces();
    const spy = vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, timedOut: false });
    const gateway = new ConfiguredWorkspaceGateway({
      base: spy as unknown as WorkspaceGateway,
      workspaceRoot: agentA,
    });

    // workspaceRoot is exposed on the gateway instance for inspection by callers
    expect(gateway.workspaceRoot).toBe(agentA);
    expect(typeof gateway.workspaceRoot).toBe('string');

    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });

  it('two independent gateway instances have isolated workspaceRoot properties', async () => {
    const { agentA, agentB, base: fixtureRoot } = await makeIsolatedWorkspaces();
    const base_ = makeSpyBaseGateway();

    const gateway1 = new ConfiguredWorkspaceGateway({ base: base_, workspaceRoot: agentA });
    const gateway2 = new ConfiguredWorkspaceGateway({ base: base_, workspaceRoot: agentB });

    await gateway1.execute({ command: 'env' });
    await gateway2.execute({ command: 'env' });

    const env1 = base_.execute.mock.calls[0][0].env as Record<string, string>;
    const env2 = base_.execute.mock.calls[1][0].env as Record<string, string>;

    expect(env1.HOME).toBe(agentA);
    expect(env2.HOME).toBe(agentB);
    expect(env1.HOME).not.toBe(agentB);
    expect(env2.HOME).not.toBe(agentA);

    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });
});
