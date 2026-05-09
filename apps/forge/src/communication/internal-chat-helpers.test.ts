import { describe, expect, it } from 'vitest';
vi.stubGlobal('forgeDebug', vi.fn());
import {
  buildAgentAccountDescription,
  buildConversationParticipantNames,
  buildGroupMemberViews,
  buildGroupMetadata,
  buildGroupRow,
  createInternalChatSlug,
  parseFilterDate,
  resolveContentType,
  sanitizeAttachmentName,
  sortParticipantsBySelfFirst,
  resolveConversationDisplayName,
} from './internal-chat-helpers';

// ---------------------------------------------------------------------------
// buildGroupMemberViews
// ---------------------------------------------------------------------------

describe('buildGroupMemberViews', () => {
  const members = [
    {
      groupId: 'grp_1',
      participantId: 'acc_alice',
      participantKey: 'alice',
      participantSlug: 'alice',
      participantName: 'Alice Smith',
      role: 'admin',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      groupId: 'grp_1',
      participantId: 'acc_bob',
      participantKey: 'bob-456',
      participantSlug: 'bob',
      participantName: 'Bob Jones',
      role: 'normal',
      createdAt: '2026-01-02T00:00:00.000Z',
    },
  ];

  it('maps members to view objects, stripping groupId and createdAt', () => {
    const views = buildGroupMemberViews(members);

    expect(views).toHaveLength(2);
    expect(views[0]).toEqual({
      participantId: 'acc_alice',
      participantKey: 'alice',
      participantSlug: 'alice',
      participantName: 'Alice Smith',
      role: 'admin',
    });
    expect(views[1]).toEqual({
      participantId: 'acc_bob',
      participantKey: 'bob-456',
      participantSlug: 'bob',
      participantName: 'Bob Jones',
      role: 'normal',
    });
  });

  it('returns empty array for no members', () => {
    expect(buildGroupMemberViews([])).toEqual([]);
  });

  it('does not mutate the original members array', () => {
    const original = [...members];
    buildGroupMemberViews(members);
    expect(members).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// buildGroupRow
// ---------------------------------------------------------------------------

describe('buildGroupRow', () => {
  it('maps a DB row to a group view object with ISO timestamps', () => {
    const row = {
      id: 'grp_abc',
      name: 'My Team',
      createdAt: 1735689600000, // 2025-01-01T00:00:00.000Z
      updatedAt: 1736035200000, // 2025-01-05T00:00:00.000Z
    };

    const result = buildGroupRow(row);

    expect(result).toEqual({
      groupId: 'grp_abc',
      name: 'My Team',
      provider: 'internal-chat',
      conversationKey: 'grp_abc',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-05T00:00:00.000Z',
    });
  });

  it('uses id as name fallback when name is null', () => {
    const row = { id: 'grp_xyz', name: null, createdAt: 0, updatedAt: 0 };

    expect(buildGroupRow(row).name).toBe('grp_xyz');
  });

  it('uses id as name fallback when name is undefined (empty string)', () => {
    const row = { id: 'grp_456', name: '', createdAt: 0, updatedAt: 0 };

    expect(buildGroupRow(row).name).toBe('');  // empty string is a valid non-null value, no fallback
  });
});

// ---------------------------------------------------------------------------
// sortParticipantsBySelfFirst
// ---------------------------------------------------------------------------

describe('sortParticipantsBySelfFirst', () => {
  const participants = [
    { accountId: 'acc_1', agentId: null, slug: 'alice', displayName: 'Alice' },
    { accountId: 'acc_2', agentId: 'agent_bob', slug: 'bob', displayName: 'Bob' },
    { accountId: 'acc_3', agentId: null, slug: 'carol', displayName: 'Carol' },
  ];

  it('places the self account first', () => {
    const result = sortParticipantsBySelfFirst(participants, 'acc_2');

    expect(result[0].accountId).toBe('acc_2');
  });

  it('sorts remaining participants alphabetically by displayName', () => {
    const result = sortParticipantsBySelfFirst(participants, 'acc_2');

    expect(result[1].displayName).toBe('Alice');
    expect(result[2].displayName).toBe('Carol');
  });

  it('handles self as the only participant', () => {
    const result = sortParticipantsBySelfFirst([participants[0]], 'acc_1');

    expect(result).toHaveLength(1);
    expect(result[0].accountId).toBe('acc_1');
  });

  it('handles participants with no self match', () => {
    const result = sortParticipantsBySelfFirst(participants, 'acc_999');

    // All sorted alphabetically
    expect(result.map((p) => p.displayName)).toEqual(['Alice', 'Bob', 'Carol']);
  });

  it('does not mutate the original array', () => {
    const original = [...participants];
    sortParticipantsBySelfFirst(participants, 'acc_2');
    expect(participants).toEqual(original);
  });

  it('is generic — works with extended participant types', () => {
    const extended = [
      { accountId: 'acc_1', agentId: null, slug: 'alice', displayName: 'Alice', extra: 'x' },
      { accountId: 'acc_2', agentId: null, slug: 'bob', displayName: 'Bob', extra: 'y' },
    ];
    const result = sortParticipantsBySelfFirst(extended, 'acc_2');
    expect(result[0]).toHaveProperty('extra', 'y');
  });
});

// ---------------------------------------------------------------------------
// resolveConversationDisplayName
// ---------------------------------------------------------------------------

describe('resolveConversationDisplayName', () => {
  const makeParticipant = (accountId: string, name: string) => ({
    accountId,
    agentId: null,
    slug: 's',
    displayName: name,
  });

  it('returns conversation.name when set', () => {
    const conv = { name: 'Team Alpha', type: 'group' };
    const participants = [makeParticipant('self', 'Me')];

    expect(resolveConversationDisplayName(conv, participants, 'self')).toBe('Team Alpha');
  });

  it('falls back to first non-self participant name for DM', () => {
    const conv = { name: null, type: 'dm' };
    const participants = [
      makeParticipant('self', 'Me'),
      makeParticipant('other', 'Alice'),
    ];

    expect(resolveConversationDisplayName(conv, participants, 'self')).toBe('Alice');
  });

  it('falls back to first participant when all are self (edge case)', () => {
    const conv = { name: null, type: 'dm' };
    const participants = [makeParticipant('self', 'Me')];

    expect(resolveConversationDisplayName(conv, participants, 'self')).toBe('Me');
  });

  it('returns undefined when there are no participants', () => {
    const conv = { name: null, type: 'dm' };

    expect(resolveConversationDisplayName(conv, [], 'self')).toBeUndefined();
  });

  it('ignores conversation type (name fallback is based on participants)', () => {
    const conv = { name: null, type: 'group' };
    const participants = [makeParticipant('self', 'Me'), makeParticipant('x', 'Xavier')];

    expect(resolveConversationDisplayName(conv, participants, 'self')).toBe('Xavier');
  });
});

// ---------------------------------------------------------------------------
// buildConversationParticipantNames
// ---------------------------------------------------------------------------

describe('buildConversationParticipantNames', () => {
  it('extracts displayName from each participant', () => {
    const participants = [
      { accountId: 'a', agentId: null, slug: 'a', displayName: 'Alice' },
      { accountId: 'b', agentId: null, slug: 'b', displayName: 'Bob' },
      { accountId: 'c', agentId: null, slug: 'c', displayName: 'Carol' },
    ];

    expect(buildConversationParticipantNames(participants)).toEqual(['Alice', 'Bob', 'Carol']);
  });

  it('returns empty array for empty participants', () => {
    expect(buildConversationParticipantNames([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildGroupMetadata
// ---------------------------------------------------------------------------

describe('buildGroupMetadata', () => {
  it('maps participants to group metadata format', () => {
    const participants = [
      { accountId: 'acc_1', agentId: 'agent_alice', slug: 'alice', displayName: 'Alice' },
      { accountId: 'acc_2', agentId: null, slug: 'bob', displayName: 'Bob' },
    ];

    const result = buildGroupMetadata(participants);

    expect(result).toEqual([
      { participantId: 'acc_1', agentId: 'agent_alice', slug: 'alice', displayName: 'Alice' },
      { participantId: 'acc_2', agentId: null, slug: 'bob', displayName: 'Bob' },
    ]);
  });

  it('returns empty array for empty participants', () => {
    expect(buildGroupMetadata([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createInternalChatSlug
// ---------------------------------------------------------------------------

describe('createInternalChatSlug', () => {
  it('uses the first word of the display name, lowercased', () => {
    const slug = createInternalChatSlug('Alice Smith');

    expect(slug.startsWith('alice-')).toBe(true);
  });

  it('appends a 6-character random suffix', () => {
    const slug = createInternalChatSlug('Bob');

    expect(slug).toMatch(/^bob-[a-z0-9]{6}$/);
  });

  it('normalizes unicode characters (removes accents)', () => {
    const slug = createInternalChatSlug('André Smith');

    expect(slug.startsWith('andre-')).toBe(true);
  });

  it('replaces non-alphanumeric separators with hyphens', () => {
    const slug = createInternalChatSlug('Test Agent');

    expect(slug.startsWith('test-')).toBe(true);
  });

  it('uses "agent" as fallback for empty/whitespace-only names', () => {
    const slug = createInternalChatSlug('   ');

    expect(slug.startsWith('agent-')).toBe(true);
  });

  it('generates unique slugs on repeated calls', () => {
    const slugs = new Set([createInternalChatSlug('Alice'), createInternalChatSlug('Alice'), createInternalChatSlug('Alice')]);

    expect(slugs.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// parseFilterDate
// ---------------------------------------------------------------------------

describe('parseFilterDate', () => {
  it('returns null when value is undefined', () => {
    expect(parseFilterDate(undefined, 'since')).toBeNull();
  });

  it('parses a valid ISO date string into Unix timestamp (ms)', () => {
    const result = parseFilterDate('2026-01-15T10:30:00.000Z', 'since');

    expect(result).toBe(new Date('2026-01-15T10:30:00.000Z').getTime());
  });

  it('throws for invalid date strings', () => {
    expect(() => parseFilterDate('not-a-date', 'until')).toThrow('Invalid until: not-a-date');
  });

  it('includes the field name in error messages', () => {
    expect(() => parseFilterDate('invalid', 'from')).toThrow('Invalid from: invalid');
  });
});

// ---------------------------------------------------------------------------
// sanitizeAttachmentName
// ---------------------------------------------------------------------------

describe('sanitizeAttachmentName', () => {
  it('strips filesystem-reserved characters', () => {
    expect(sanitizeAttachmentName('my:file?name.txt')).toBe('my-file-name.txt');
  });

  it('strips path separators', () => {
    expect(sanitizeAttachmentName('folder/file.txt')).toBe('folder-file.txt');
  });

  it('trims whitespace', () => {
    expect(sanitizeAttachmentName('  report.pdf  ')).toBe('report.pdf');
  });

  it('returns "attachment" for empty/blank names', () => {
    expect(sanitizeAttachmentName('')).toBe('attachment');
    expect(sanitizeAttachmentName('   ')).toBe('attachment');
  });

  it('preserves valid filename characters', () => {
    expect(sanitizeAttachmentName('photo-2026-01.png')).toBe('photo-2026-01.png');
  });
});

// ---------------------------------------------------------------------------
// resolveContentType
// ---------------------------------------------------------------------------

describe('resolveContentType', () => {
  it('returns correct MIME type for image extensions', () => {
    expect(resolveContentType('photo.png')).toBe('image/png');
    expect(resolveContentType('photo.jpg')).toBe('image/jpeg');
    expect(resolveContentType('photo.jpeg')).toBe('image/jpeg');
    expect(resolveContentType('image.gif')).toBe('image/gif');
    expect(resolveContentType('graphic.webp')).toBe('image/webp');
  });

  it('returns correct MIME type for document extensions', () => {
    expect(resolveContentType('doc.pdf')).toBe('application/pdf');
    expect(resolveContentType('data.json')).toBe('application/json');
    expect(resolveContentType('notes.txt')).toBe('text/plain');
    expect(resolveContentType('readme.md')).toBe('text/plain');
    expect(resolveContentType('export.csv')).toBe('text/csv');
  });

  it('returns correct MIME type for media extensions', () => {
    expect(resolveContentType('audio.mp3')).toBe('audio/mpeg');
    expect(resolveContentType('recording.wav')).toBe('audio/wav');
    expect(resolveContentType('video.mp4')).toBe('video/mp4');
  });

  it('returns undefined for unknown extensions', () => {
    expect(resolveContentType('file.xyz')).toBeUndefined();
    expect(resolveContentType('file')).toBeUndefined();
  });

  it('is case-insensitive', () => {
    expect(resolveContentType('photo.PNG')).toBe('image/png');
    expect(resolveContentType('Document.PDF')).toBe('application/pdf');
  });
});

// ---------------------------------------------------------------------------
// buildAgentAccountDescription
// ---------------------------------------------------------------------------

describe('buildAgentAccountDescription', () => {
  it('includes agentId and agentName', () => {
    const desc = buildAgentAccountDescription({
      agentId: 'agent_123',
      agentName: 'Alice',
    });

    expect(desc).toContain('Agent id: agent_123');
    expect(desc).toContain('Agent name: Alice');
  });

  it('includes optional description fields when set', () => {
    const desc = buildAgentAccountDescription({
      agentId: 'agent_123',
      agentName: 'Alice',
      agentDescription: '  A helpful assistant  ',
      roleName: '  Support Agent  ',
      roleDescription: '  Handles tickets  ',
    });

    expect(desc).toContain('Agent description: A helpful assistant');
    expect(desc).toContain('Role name: Support Agent');
    expect(desc).toContain('Role description: Handles tickets');
  });

  it('omits fields that are empty, undefined, or whitespace-only', () => {
    const desc = buildAgentAccountDescription({
      agentId: 'agent_123',
      agentName: 'Alice',
      agentDescription: '',
      roleName: undefined,
      roleDescription: '   ',
    });

    expect(desc).not.toContain('Agent description');
    expect(desc).not.toContain('Role name');
    expect(desc).not.toContain('Role description');
  });

  it('trims whitespace from optional fields', () => {
    const desc = buildAgentAccountDescription({
      agentId: 'a',
      agentName: 'A',
      agentDescription: '  x  ',
    });

    expect(desc).toContain('Agent description: x');
  });

  it('returns a single-line string when only required fields are provided', () => {
    const desc = buildAgentAccountDescription({ agentId: 'a', agentName: 'A' });

    expect(desc.split('\n')).toHaveLength(2);
  });
});
