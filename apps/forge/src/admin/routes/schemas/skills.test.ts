import { describe, it, expect } from 'vitest';
import {
  uploadSystemSkillsSchema,
  deleteSystemSkillSchema,
} from './skills';

describe('uploadSystemSkillsSchema', () => {
  it('validates valid archive base64', () => {
    const result = uploadSystemSkillsSchema.parse({
      archiveBase64: 'aGVsbG8gd29ybGQ=',
    });
    expect(result.archiveBase64).toBe('aGVsbG8gd29ybGQ=');
  });

  it('rejects missing archiveBase64', () => {
    expect(() => uploadSystemSkillsSchema.parse({})).toThrow();
  });

  it('rejects empty archiveBase64', () => {
    expect(() => uploadSystemSkillsSchema.parse({ archiveBase64: '' })).toThrow();
  });
});

describe('deleteSystemSkillSchema', () => {
  it('validates valid skillName', () => {
    const result = deleteSystemSkillSchema.parse({ skillName: 'my-skill' });
    expect(result.skillName).toBe('my-skill');
  });

  it('rejects missing skillName', () => {
    expect(() => deleteSystemSkillSchema.parse({})).toThrow();
  });

  it('rejects empty skillName', () => {
    expect(() => deleteSystemSkillSchema.parse({ skillName: '' })).toThrow();
  });
});
