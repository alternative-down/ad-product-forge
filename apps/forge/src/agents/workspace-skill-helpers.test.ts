/**
 * Unit tests for agents/workspace-skill-helpers.ts.
 *
 * The only pure/exported function is normalizeArchiveEntryPath.
 * ensureDirectory and ensureParentDirectories perform async I/O with forgeDebug
 * side-effects; they are not directly unit-tested here.
 */
import { describe, expect, it, vi } from 'vitest';
import { normalizeArchiveEntryPath, type NormalizeResult } from './workspace-skill-helpers';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

// ─── Tests: normalizeArchiveEntryPath ────────────────────────────────────────

describe('normalizeArchiveEntryPath', () => {
  // --- Valid: basic paths ---

  it('returns path for simple filename', () => {
    const result = normalizeArchiveEntryPath('agent.ts');
    expect(result).toEqual({ safePath: 'agent.ts', isDirectory: false });
  });

  it('returns path for nested filename', () => {
    const result = normalizeArchiveEntryPath('src/agent.ts');
    expect(result).toEqual({ safePath: 'src/agent.ts', isDirectory: false });
  });

  it('normalizes backslashes to forward slashes', () => {
    const result = normalizeArchiveEntryPath('src\\agent.ts');
    expect(result).toEqual({ safePath: 'src/agent.ts', isDirectory: false });
  });

  it('strips leading slashes', () => {
    const result = normalizeArchiveEntryPath('///src/agent.ts');
    expect(result).toEqual({ safePath: 'src/agent.ts', isDirectory: false });
  });

  it('normalizes POSIX paths from tar/zip (with slashes)', () => {
    const result = normalizeArchiveEntryPath('path/to/file.txt');
    expect(result).toEqual({ safePath: 'path/to/file.txt', isDirectory: false });
  });

  // --- Valid: directory entries (trailing slash) ---

  it('marks directory entries (trailing slash)', () => {
    const result = normalizeArchiveEntryPath('src/');
    expect(result).toEqual({ safePath: 'src', isDirectory: true });
  });

  it('normalizes and strips trailing slash from directory', () => {
    const result = normalizeArchiveEntryPath('src/lib/');
    expect(result).toEqual({ safePath: 'src/lib', isDirectory: true });
  });

  // --- Valid: skills/ prefix ---

  it('strips skills/ prefix from file path', () => {
    const result = normalizeArchiveEntryPath('skills/agent.ts');
    expect(result).toEqual({ safePath: 'agent.ts', isDirectory: false });
  });

  it('strips skills/ prefix from nested path', () => {
    const result = normalizeArchiveEntryPath('skills/src/agent.ts');
    expect(result).toEqual({ safePath: 'src/agent.ts', isDirectory: false });
  });

  it('strips skills/ prefix from directory', () => {
    const result = normalizeArchiveEntryPath('skills/lib/');
    expect(result).toEqual({ safePath: 'lib', isDirectory: true });
  });

  it('does NOT strip skills/ from path that does not start with it', () => {
    const result = normalizeArchiveEntryPath('my-skills/agent.ts');
    expect(result).toEqual({ safePath: 'my-skills/agent.ts', isDirectory: false });
  });

  // --- Edge cases ---

  it('handles deeply nested path', () => {
    const result = normalizeArchiveEntryPath('a/b/c/d/e.ts');
    expect(result).toEqual({ safePath: 'a/b/c/d/e.ts', isDirectory: false });
  });

  it('handles single-character filename', () => {
    const result = normalizeArchiveEntryPath('a');
    expect(result).toEqual({ safePath: 'a', isDirectory: false });
  });

  it('handles mixed back/forward slashes', () => {
    const result = normalizeArchiveEntryPath('src\\lib\\agent.ts');
    expect(result).toEqual({ safePath: 'src/lib/agent.ts', isDirectory: false });
  });

  it('strips leading slashes AND skills/ prefix', () => {
    const result = normalizeArchiveEntryPath('///skills/src/agent.ts');
    expect(result).toEqual({ safePath: 'src/agent.ts', isDirectory: false });
  });

  // --- Invalid: throws ---

  it('throws for empty string', () => {
    expect(() => normalizeArchiveEntryPath('')).toThrow('Invalid skill archive entry');
  });

  it('throws for "." (current dir)', () => {
    expect(() => normalizeArchiveEntryPath('.')).toThrow('Invalid skill archive entry');
  });

  it('throws for path starting with ../', () => {
    expect(() => normalizeArchiveEntryPath('../agent.ts')).toThrow('Invalid skill archive entry');
  });

  it('throws for path starting with ../../', () => {
    expect(() => normalizeArchiveEntryPath('../../secrets')).toThrow('Invalid skill archive entry');
  });

  it('does NOT throw for path containing /../ (path.posix.normalize resolves it)', () => {
    // path.posix.normalize('src/lib/../agent.ts') = 'src/agent.ts' — no /../ remains → passes
    expect(() => normalizeArchiveEntryPath('src/lib/../agent.ts')).not.toThrow();
    expect(normalizeArchiveEntryPath('src/lib/../agent.ts')).toEqual({ safePath: 'src/agent.ts', isDirectory: false });
  });

  it('does NOT throw for absolute-looking paths (leading slashes are stripped)', () => {
    // All leading slashes are stripped → '/etc/passwd' → 'etc/passwd' → valid
    expect(() => normalizeArchiveEntryPath('/etc/passwd')).not.toThrow();
    expect(normalizeArchiveEntryPath('/etc/passwd')).toEqual({ safePath: 'etc/passwd', isDirectory: false });
  });

  it('throws for skills/../ (directory traversal via skills prefix)', () => {
    expect(() => normalizeArchiveEntryPath('skills/../secrets')).toThrow('Invalid skill archive entry');
  });

  it('throws for empty path after stripping skills/ prefix', () => {
    // "skills/" alone → empty after prefix strip → should throw
    expect(() => normalizeArchiveEntryPath('skills/')).toThrow('Invalid skill archive entry');
  });

  it('throws for skills/ (directory resolves to "." after stripping skills/ prefix)', () => {
    // 'skills/' → isDirectory=true → withoutSkillsPrefix = '' → path.posix.normalize('') = '.' → throws
    expect(() => normalizeArchiveEntryPath('skills/')).toThrow('Invalid skill archive entry');
  });

  // --- Return type shape ---

  it('returns safePath as string', () => {
    const result = normalizeArchiveEntryPath('agent.ts');
    expect(typeof result.safePath).toBe('string');
  });

  it('returns isDirectory as boolean', () => {
    const result = normalizeArchiveEntryPath('agent.ts');
    expect(typeof result.isDirectory).toBe('boolean');
  });

  it('NormalizeResult type is correct shape', () => {
    const result: NormalizeResult = { safePath: 'x', isDirectory: false };
    expect(result.safePath).toBe('x');
    expect(result.isDirectory).toBe(false);
  });
});