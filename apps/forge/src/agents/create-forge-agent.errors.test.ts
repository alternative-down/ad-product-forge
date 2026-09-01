import { describe, expect, test } from 'vitest';
import { AgentRuntimeConfigFieldMissingError } from './create-forge-agent.errors';

describe('agents/create-forge-agent.errors', () => {
  describe('AgentRuntimeConfigFieldMissingError', () => {
    test('has expected name, code, and message for totalContextTokens', () => {
      const err = new AgentRuntimeConfigFieldMissingError(
        'checkpointedOmTotalContextTokens',
      );
      expect(err.name).toBe('AgentRuntimeConfigFieldMissingError');
      expect(err.code).toBe('AGENT_RUNTIME_CONFIG_FIELD_MISSING');
      expect(err.message).toBe(
        'checkpointedOmTotalContextTokens is required in agent runtime config.',
      );
      expect(err.fieldName).toBe('checkpointedOmTotalContextTokens');
    });

    test('is instanceof Error and self', () => {
      const err = new AgentRuntimeConfigFieldMissingError('anyField');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AgentRuntimeConfigFieldMissingError);
    });

    test('preserves fieldName for all 6 documented checkpointedOm fields', () => {
      const fields = [
        'checkpointedOmTotalContextTokens',
        'checkpointedOmRecentRawTokens',
        'checkpointedOmRawObservationBatchTokens',
        'checkpointedOmObservationReflectionBatchTokens',
        'checkpointedOmObservationSupportTokens',
        'checkpointedOmReflectionSupportTokens',
      ];
      for (const field of fields) {
        const err = new AgentRuntimeConfigFieldMissingError(field);
        expect(err.fieldName).toBe(field);
        expect(err.message).toBe(`${field} is required in agent runtime config.`);
      }
    });

    test('two errors with different fields are distinguishable by fieldName', () => {
      const a = new AgentRuntimeConfigFieldMissingError('fieldA');
      const b = new AgentRuntimeConfigFieldMissingError('fieldB');
      expect(a.fieldName).toBe('fieldA');
      expect(b.fieldName).toBe('fieldB');
      expect(a.message).not.toBe(b.message);
    });
  });
});
