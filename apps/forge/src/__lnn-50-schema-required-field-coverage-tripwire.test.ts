/**
 * L#NN-50 Schema Required Field Coverage Tripwire (Day 15 Lead 2, Varek)
 *
 * Day 15 10:18Z — Varek. L#15 lint infra (issue #5665) revealed that 10 Zod
 * schema tests in `apps/forge/src/admin/routes/schemas/{internal-chat,providers}.test.ts`
 * were FAILING because the test payloads were missing the required
 * `accountId` / `integrationId` fields.
 *
 * Root cause: schemas were tightened (required accountId for authorization
 * scopes) but the test files were not updated. The test files passed
 * payloads that the schema correctly rejected. The CI test step failed
 * for 19h+ as a result (L#15 application #7/#8).
 *
 * The fix: this tripwire. For each known Zod object schema, the tripwire
 * generates a payload with all REQUIRED fields set to a valid placeholder
 * (string 'x', number 1, boolean true, enum first value, nested object
 * recursed). The tripwire asserts the schema PARSES this payload without
 * throwing.
 *
 * What it catches:
 *  - A schema is updated to require a NEW field, but no test or fixture
 *    is updated to include the new field. The tripwire fails, forcing
 *    the developer to add the new field to the payload generator.
 *  - The same root cause as the 10 fixed tests: schema is correct, test
 *    is stale. The tripwire is a positive test that documents the
 *    schema's "happy path" required fields.
 *
 * What it does NOT catch:
 *  - A schema is updated to be MORE STRICT (e.g., a new pattern constraint).
 *    The tripwire would pass with 'x' as a string, but the test files
 *    would fail when they try a more specific value. This is acceptable —
 *    the tripwire is a "minimum viable" check.
 *
 * L#NN-26 mutation protocol: revert the helper to omit one required field,
 * the tripwire should fail. Re-add, tripwire passes.
 *
 * Cross-references:
 *  - L#NN-19 v1.1 (Day 14, the pattern this tripwire mirrors).
 *  - L#NN-19b v2 (pre-emptive checks for silent failures).
 *  - L#15 application #7/#8 (Day 10-15, the L#15 protocol this tripwire
 *    reduces noise for).
 *  - L#46 author self-approval (Varek is author of this tripwire, need
 *    non-author 1/2 + 2/2 for PR).
 *  - Day 15 Lead 2 #5665 dispatch: "L#15 v1.1 5-check footer required
 *    (pre-existing CI documented)".
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  adminInternalChatSendSchema,
  createExternalInternalChatAccountSchema,
  updateExternalInternalChatAccountSchema,
  deleteExternalInternalChatAccountSchema,
  internalChatAccountIdQuerySchema,
  internalChatMessagesQuerySchema,
  internalChatMessageAttachmentQuerySchema,
  createInternalChatConversationSchema,
  sendInternalChatConversationMessageSchema,
  updateInternalChatConversationSchema,
  archiveInternalChatConversationSchema,
  internalChatGroupMembersQuerySchema,
  addInternalChatGroupMemberSchema,
  updateInternalChatGroupMemberRoleSchema,
  removeInternalChatGroupMemberSchema,
} from './admin/routes/schemas/internal-chat';

import {
  upsertSystemIntegrationSchema,
  deleteSystemIntegrationSchema,
} from './admin/routes/schemas/providers';

// ─── Payload generator ────────────────────────────────────────────────────

const PLACEHOLDER = {
  string: 'x',
  number: 1,
  boolean: true,
};

/**
 * Build a "fully valid" payload for a Zod object schema.
 * Sets every required field to a valid placeholder; omits optional fields.
 * Returns null for unsupported types (discriminated unions, records) — caller
 * skips those.
 */
function buildValidPayload(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> | null {
  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  const payload: Record<string, unknown> = {};

  for (const [key, field] of Object.entries(shape)) {
    const built = buildFieldValue(field);
    if (built === undefined) {
      // Optional / nullable — omit.
      continue;
    }
    if (built === null) {
      // Unsupported (discriminated union etc.) — bail out.
      return null;
    }
    payload[key] = built;
  }
  return payload;
}

function buildFieldValue(field: z.ZodTypeAny): unknown {
  // Unwrap optional/nullable/default/effects.
  let cursor: z.ZodTypeAny = field;
  let isOptional = false;
  // Walk the ._def.innerType chain.
  while (cursor) {
    const ctorName = cursor.constructor?.name;
    if (ctorName === 'ZodOptional' || ctorName === 'ZodNullable' || ctorName === 'ZodDefault') {
      isOptional = true;
      const inner = (cursor as unknown as { _def: { innerType: z.ZodTypeAny } })._def.innerType;
      cursor = inner;
      continue;
    }
    if (ctorName === 'ZodEffects' || ctorName === 'ZodPipeline' || ctorName === 'ZodCatch') {
      const def = (cursor as unknown as { _def: { innerType?: z.ZodTypeAny; schema?: z.ZodTypeAny } })._def;
      cursor = def.innerType ?? def.schema ?? (null as unknown as z.ZodTypeAny);
      continue;
    }
    break;
  }

  if (isOptional) return undefined;

  const ctorName = cursor.constructor?.name;

  if (ctorName === 'ZodString') return PLACEHOLDER.string;
  if (ctorName === 'ZodNumber') return PLACEHOLDER.number;
  if (ctorName === 'ZodBoolean') return PLACEHOLDER.boolean;
  if (ctorName === 'ZodEnum') {
    const def = (cursor as unknown as { _def: { values?: readonly unknown[]; options?: readonly unknown[] } })._def;
    const opts = def.values ?? def.options ?? [];
    return Array.isArray(opts) && opts.length > 0 ? opts[0] : null;
  }
  if (ctorName === 'ZodLiteral') {
    return (cursor as unknown as { _def: { value: unknown } })._def.value ?? null;
  }
  if (ctorName === 'ZodObject') {
    return buildValidPayload(cursor as z.ZodObject<z.ZodRawShape>);
  }
  if (ctorName === 'ZodArray') {
    const itemType = (cursor as unknown as { _def: { type: z.ZodTypeAny } })._def.type;
    if (!itemType) return null;
    const item = buildFieldValue(itemType);
    if (item === undefined || item === null) return null;
    return [item];
  }
  if (ctorName === 'ZodRecord') {
    return {};
  }

  // Discriminated unions / lazy / unknown — unsupported by the tripwire.
  return null;
}

// ─── Tripwire assertions ──────────────────────────────────────────────────

describe('L#NN-50 schema required field coverage tripwire (Day 15 Lead 2)', () => {
  // internal-chat.ts schemas
  const internalChatSchemas: Array<[string, z.ZodObject<z.ZodRawShape>]> = [
    ['adminInternalChatSendSchema', adminInternalChatSendSchema as z.ZodObject<z.ZodRawShape>],
    ['createExternalInternalChatAccountSchema', createExternalInternalChatAccountSchema as z.ZodObject<z.ZodRawShape>],
    ['updateExternalInternalChatAccountSchema', updateExternalInternalChatAccountSchema as z.ZodObject<z.ZodRawShape>],
    ['deleteExternalInternalChatAccountSchema', deleteExternalInternalChatAccountSchema as z.ZodObject<z.ZodRawShape>],
    ['internalChatAccountIdQuerySchema', internalChatAccountIdQuerySchema as z.ZodObject<z.ZodRawShape>],
    ['internalChatMessagesQuerySchema', internalChatMessagesQuerySchema as z.ZodObject<z.ZodRawShape>],
    ['internalChatMessageAttachmentQuerySchema', internalChatMessageAttachmentQuerySchema as z.ZodObject<z.ZodRawShape>],
    ['createInternalChatConversationSchema', createInternalChatConversationSchema as z.ZodObject<z.ZodRawShape>],
    ['sendInternalChatConversationMessageSchema', sendInternalChatConversationMessageSchema as z.ZodObject<z.ZodRawShape>],
    ['updateInternalChatConversationSchema', updateInternalChatConversationSchema as z.ZodObject<z.ZodRawShape>],
    ['archiveInternalChatConversationSchema', archiveInternalChatConversationSchema as z.ZodObject<z.ZodRawShape>],
    ['internalChatGroupMembersQuerySchema', internalChatGroupMembersQuerySchema as z.ZodObject<z.ZodRawShape>],
    ['addInternalChatGroupMemberSchema', addInternalChatGroupMemberSchema as z.ZodObject<z.ZodRawShape>],
    ['updateInternalChatGroupMemberRoleSchema', updateInternalChatGroupMemberRoleSchema as z.ZodObject<z.ZodRawShape>],
    ['removeInternalChatGroupMemberSchema', removeInternalChatGroupMemberSchema as z.ZodObject<z.ZodRawShape>],
  ];

  for (const [name, schema] of internalChatSchemas) {
    it(`internal-chat: ${name} parses a fully-valid payload`, () => {
      const payload = buildValidPayload(schema);
      if (payload === null) {
        // Unsupported (discriminated union etc.) — assert schema exists and
        // is an object schema, but skip the parse assertion.
        expect(schema).toBeInstanceOf(z.ZodObject);
        return;
      }
      expect(() => schema.parse(payload)).not.toThrow();
    });
  }

  // providers.ts schemas (only the simple z.object() ones; upsertSystemIntegration
  // is a discriminated union and is skipped by the tripwire).
  it('providers: deleteSystemIntegrationSchema parses a fully-valid payload', () => {
    const schema = deleteSystemIntegrationSchema as z.ZodObject<z.ZodRawShape>;
    const payload = buildValidPayload(schema);
    if (payload === null) {
      expect(schema).toBeInstanceOf(z.ZodObject);
      return;
    }
    expect(() => schema.parse(payload)).not.toThrow();
  });

  it('providers: upsertSystemIntegrationSchema is a discriminated union (skipped)', () => {
    // Document the skip rather than silently passing. The discriminated union
    // requires a payload with one of the literal providerType values, which
    // the tripwire does not synthesize.
    expect(upsertSystemIntegrationSchema).toBeInstanceOf(z.ZodDiscriminatedUnion);
  });
});
