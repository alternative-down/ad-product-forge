import { describe, expect, it, vi, beforeEach } from 'vitest';
import { installAgentWorkspaceSkillsArchive } from './workspace-skill-archive';
import { zipSync } from 'fflate';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    stat: vi.fn(),
    mkdir: vi.fn(() => Promise.resolve()),
    rm: vi.fn(() => Promise.resolve()),
    writeFile: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('./workspace-skill-paths', () => ({
  resolveAgentSkillsRoot: vi.fn(() => '/mock/skills'),
}));

const fsMocks = {
  statMock: vi.fn(),
  mkdirMock: vi.fn(),
  rmMock: vi.fn(),
  writeFileMock: vi.fn(),
};

beforeEach(async () => {
  vi.clearAllMocks();
  
  const fs = await import('node:fs/promises');
  fsMocks.statMock.mockRejectedValue(new Error('ENOENT'));
  fsMocks.mkdirMock.mockResolvedValue(undefined);
  fsMocks.writeFileMock.mockResolvedValue(undefined);
});

function createZipArchive(entries: Record<string, string | null>) {
  const buffer = Buffer.from(zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([k, v]) => [k, v ? Buffer.from(v) : Buffer.from([])])
    )
  ));
  return buffer.toString('base64');
}

describe('installAgentWorkspaceSkillsArchive', () => {
  const mockAgent = {
    id: 'agent-1',
    workspaceFilesystem: null,
  };

  describe('archive installation', () => {
    it('extracts files from archive and returns skill names', async () => {
      const fs = await import('node:fs/promises');
      fsMocks.mkdirMock.mockResolvedValue(undefined);
      
      const zipBase64 = createZipArchive({
        'skills/test-skill/readme.md': '# Test Skill',
        'skills/test-skill/skill.json': '{"name": "test-skill"}',
      });

      const result = await installAgentWorkspaceSkillsArchive({
        workspaceBasePath: '/workspace',
        agent: mockAgent,
        zipBase64,
      });

      expect(result).toEqual(['test-skill']);
    });

    it('throws when archive contains only directory entries', async () => {
      const zipBase64 = createZipArchive({
        'skills/empty-skill/': null,
      });

      await expect(installAgentWorkspaceSkillsArchive({
        workspaceBasePath: '/workspace',
        agent: mockAgent,
        zipBase64,
      })).rejects.toThrow('Skill archive did not contain any files');
    });

    it('handles Windows-style path separators', async () => {
      const fs = await import('node:fs/promises');
      fsMocks.mkdirMock.mockResolvedValue(undefined);
      fsMocks.writeFileMock.mockResolvedValue(undefined);

      const zipBase64 = createZipArchive({
        'skills\\windows-skill\\file.txt': 'content',
      });

      const result = await installAgentWorkspaceSkillsArchive({
        workspaceBasePath: '/workspace',
        agent: mockAgent,
        zipBase64,
      });

      expect(result).toEqual(['windows-skill']);
    });

    it('normalizes paths with leading slashes', async () => {
      const fs = await import('node:fs/promises');
      fsMocks.mkdirMock.mockResolvedValue(undefined);
      fsMocks.writeFileMock.mockResolvedValue(undefined);

      const zipBase64 = createZipArchive({
        '///skills/leading-slash/file.txt': 'content',
      });

      const result = await installAgentWorkspaceSkillsArchive({
        workspaceBasePath: '/workspace',
        agent: mockAgent,
        zipBase64,
      });

      expect(result).toEqual(['leading-slash']);
    });

    it('sorts skill names in result', async () => {
      const fs = await import('node:fs/promises');
      fsMocks.mkdirMock.mockResolvedValue(undefined);
      fsMocks.writeFileMock.mockResolvedValue(undefined);

      const zipBase64 = createZipArchive({
        'skills/zebra/file.txt': 'z',
        'skills/alpha/file.txt': 'a',
        'skills/beta/file.txt': 'b',
      });

      const result = await installAgentWorkspaceSkillsArchive({
        workspaceBasePath: '/workspace',
        agent: mockAgent,
        zipBase64,
      });

      expect(result).toEqual(['alpha', 'beta', 'zebra']);
    });
  });

  describe('security', () => {
    it('rejects paths with parent directory traversal', async () => {
      const zipBase64 = createZipArchive({
        '../../etc/passwd': 'malicious',
      });

      await expect(installAgentWorkspaceSkillsArchive({
        workspaceBasePath: '/workspace',
        agent: mockAgent,
        zipBase64,
      })).rejects.toThrow('Invalid skill archive entry');
    });

    it('rejects paths with embedded parent traversal', async () => {
      const zipBase64 = createZipArchive({
        'skills/../../../etc/passwd': 'malicious',
      });

      await expect(installAgentWorkspaceSkillsArchive({
        workspaceBasePath: '/workspace',
        agent: mockAgent,
        zipBase64,
      })).rejects.toThrow('Invalid skill archive entry');
    });

    it('rejects directory path outside skills folder', async () => {
      const zipBase64 = createZipArchive({
        'skills/': null, // directory at top level - should fail validation
      });

      await expect(installAgentWorkspaceSkillsArchive({
        workspaceBasePath: '/workspace',
        agent: mockAgent,
        zipBase64,
      })).rejects.toThrow('Invalid skill archive entry');
    });
  });
});
