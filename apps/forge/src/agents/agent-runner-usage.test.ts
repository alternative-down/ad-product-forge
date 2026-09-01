import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { InternalAgentRuntime } from './runtime/types';

function createMockStore() {
  return {
    getExecutionState: vi.fn<() => Promise<'idle' | 'running' | 'absent'>>(),
    setExecutionState: vi.fn<() => Promise<void>>(),
    setExecutionAbsent: vi.fn<() => Promise<void>>(),
    getRunnableContract: vi.fn<() => Promise<null>>(),
    listRecentSteps: vi.fn(),
    getContractSpend: vi.fn<() => Promise<number>>(),
    getUsagePricing: vi.fn(),
    recordAgentStep: vi.fn(),
    refundActiveContractBalance: vi.fn<() => Promise<null>>(),
    renewContract: vi.fn(),
    fundContractIfNeeded: vi.fn(),
  } as any;
}

function createMockRuntime(overrides: Partial<InternalAgentRuntime> = {}): InternalAgentRuntime {
  return {
    id: 'runtime-1',
    modelProfileId: 'claude-sonnet-4-20250514',
    pricingModelKey: 'claude',
    ...overrides,
  } as InternalAgentRuntime;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('agent-runner-usage', () => {
  describe('estimateStepCostUsd', () => {
    it('returns null when no recent steps exist', async () => {
      const mockStore = createMockStore();
      mockStore.listRecentSteps.mockResolvedValue([]);

      const { createAgentRunnerUsage } = await import('./agent-runner-usage');
      const { estimateStepCostUsd } = createAgentRunnerUsage({
        store: mockStore,
        runtime: createMockRuntime(),
      });

      const result = await estimateStepCostUsd();
      expect(result).toBeNull();
    });

    it('throws when runtime has no modelProfileId', async () => {
      const mockStore = createMockStore();

      const { createAgentRunnerUsage } = await import('./agent-runner-usage');
      const { estimateStepCostUsd } = createAgentRunnerUsage({
        store: mockStore,
        runtime: createMockRuntime({ modelProfileId: undefined }),
      });

      await expect(estimateStepCostUsd()).rejects.toThrow(/missing primary model profile/);
    });

    it('averages cost from recent steps when no modelPrice', async () => {
      const mockStore = createMockStore();
      mockStore.listRecentSteps.mockResolvedValue([
        { costUsd: 0.001, inputTokens: 100, cachedInputTokens: 0, outputTokens: 50 },
        { costUsd: 0.002, inputTokens: 200, cachedInputTokens: 0, outputTokens: 100 },
      ]);
      mockStore.getUsagePricing.mockResolvedValue({
        pricingModelKey: 'claude',
        profileId: 'claude-sonnet-4-20250514',
        contractCostMultiplier: 1,
        modelPrice: null,
      });

      const { createAgentRunnerUsage } = await import('./agent-runner-usage');
      const { estimateStepCostUsd } = createAgentRunnerUsage({
        store: mockStore,
        runtime: createMockRuntime(),
      });

      const result = await estimateStepCostUsd();
      expect(result).toBeCloseTo(0.0015, 5);
    });

    it('computes weighted cost using pricing rates and contract multiplier', async () => {
      const mockStore = createMockStore();
      // Single step with known token counts
      mockStore.listRecentSteps.mockResolvedValue([
        {
          costUsd: 0,
          inputTokens: 1_000_000,
          cachedInputTokens: 200_000,
          outputTokens: 500_000,
        },
      ]);
      mockStore.getUsagePricing.mockResolvedValue({
        pricingModelKey: 'claude',
        profileId: 'claude-sonnet-4-20250514',
        contractCostMultiplier: 1.5,
        modelPrice: {
          inputPerMillionUsd: 3,
          inputCachePerMillionUsd: 0.3,
          outputPerMillionUsd: 15,
        },
      });

      const { createAgentRunnerUsage } = await import('./agent-runner-usage');
      const { estimateStepCostUsd } = createAgentRunnerUsage({
        store: mockStore,
        runtime: createMockRuntime(),
      });

      // Uncached = 800k, cached = 200k, output = 500k
      // cost = ((0.8 * 3) + (0.2 * 0.3) + (0.5 * 15)) * 1.5
      //      = (2.4 + 0.06 + 7.5) * 1.5 = 9.96 * 1.5 = 14.94
      const result = await estimateStepCostUsd();
      expect(result).toBeCloseTo(14.94, 3);
    });

    it('averages cost across multiple recent steps', async () => {
      const mockStore = createMockStore();
      mockStore.listRecentSteps.mockResolvedValue([
        {
          costUsd: 0,
          inputTokens: 1_000_000,
          cachedInputTokens: 0,
          outputTokens: 1_000_000,
        },
        {
          costUsd: 0,
          inputTokens: 2_000_000,
          cachedInputTokens: 0,
          outputTokens: 2_000_000,
        },
      ]);
      mockStore.getUsagePricing.mockResolvedValue({
        pricingModelKey: 'claude',
        profileId: 'claude-sonnet-4-20250514',
        contractCostMultiplier: 1,
        modelPrice: {
          inputPerMillionUsd: 3,
          inputCachePerMillionUsd: 0.3,
          outputPerMillionUsd: 15,
        },
      });

      const { createAgentRunnerUsage } = await import('./agent-runner-usage');
      const { estimateStepCostUsd } = createAgentRunnerUsage({
        store: mockStore,
        runtime: createMockRuntime(),
      });

      // Avg: (1M in, 1M out) and (2M in, 2M out)
      // Step 1: (1*3 + 0*0.3 + 1*15) = 18
      // Step 2: (2*3 + 0*0.3 + 2*15) = 36
      // Average = (18 + 36) / 2 = 27
      const result = await estimateStepCostUsd();
      expect(result).toBeCloseTo(27, 5);
    });
  });

  describe('recordAgentStep', () => {
    it('records step with computed cost using pricing', async () => {
      const mockStore = createMockStore();
      mockStore.getUsagePricing.mockResolvedValue({
        pricingModelKey: 'claude',
        profileId: 'claude-sonnet-4-20250514',
        contractCostMultiplier: 1,
        modelPrice: {
          inputPerMillionUsd: 3,
          inputCachePerMillionUsd: 0.3,
          outputPerMillionUsd: 15,
        },
      });
      mockStore.recordAgentStep.mockResolvedValue({ id: 'step-1' });

      const { createAgentRunnerUsage } = await import('./agent-runner-usage');
      const { recordAgentStep } = createAgentRunnerUsage({
        store: mockStore,
        runtime: createMockRuntime(),
      });

      const result = await recordAgentStep('contract-1', 1_000_000, 200_000, 500_000);

      expect(result).toEqual({ id: 'step-1' });
      expect(mockStore.recordAgentStep).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'runtime-1',
          contractId: 'contract-1',
          llmProfileId: 'claude-sonnet-4-20250514',
          modelKey: 'claude',
          kind: 'agent-step',
          inputTokens: 1_000_000,
          cachedInputTokens: 200_000,
          outputTokens: 500_000,
          costUsd: expect.any(Number),
        }),
      );
    });

    it('throws when runtime has no modelProfileId', async () => {
      const mockStore = createMockStore();

      const { createAgentRunnerUsage } = await import('./agent-runner-usage');
      const { recordAgentStep } = createAgentRunnerUsage({
        store: mockStore,
        runtime: createMockRuntime({ modelProfileId: undefined }),
      });

      await expect(recordAgentStep('contract-1', 1000, 0, 500)).rejects.toThrow(
        /missing primary model profile/,
      );
    });

    it('computes cost correctly with uncached and cached tokens', async () => {
      const mockStore = createMockStore();
      mockStore.getUsagePricing.mockResolvedValue({
        pricingModelKey: 'claude',
        profileId: 'claude-sonnet-4-20250514',
        contractCostMultiplier: 2,
        modelPrice: {
          inputPerMillionUsd: 3,
          inputCachePerMillionUsd: 0.3,
          outputPerMillionUsd: 15,
        },
      });
      mockStore.recordAgentStep.mockResolvedValue({ id: 'step-1' });

      const { createAgentRunnerUsage } = await import('./agent-runner-usage');
      const { recordAgentStep } = createAgentRunnerUsage({
        store: mockStore,
        runtime: createMockRuntime(),
      });

      await recordAgentStep('contract-1', 1_000_000, 600_000, 500_000);

      const call = mockStore.recordAgentStep.mock.calls[0][0];
      // Uncached = 400k, cached = 600k, output = 500k
      // cost = ((0.4 * 3) + (0.6 * 0.3) + (0.5 * 15)) * 2
      //      = (1.2 + 0.18 + 7.5) * 2 = 8.88 * 2 = 17.76
      expect(call.costUsd).toBeCloseTo(17.76, 3);
    });

    it('handles missing modelPrice gracefully (costUsd = 0)', async () => {
      const mockStore = createMockStore();
      mockStore.getUsagePricing.mockResolvedValue({
        pricingModelKey: 'claude',
        profileId: 'claude-sonnet-4-20250514',
        contractCostMultiplier: 1,
        modelPrice: null,
      });
      mockStore.recordAgentStep.mockResolvedValue({ id: 'step-1' });

      const { createAgentRunnerUsage } = await import('./agent-runner-usage');
      const { recordAgentStep } = createAgentRunnerUsage({
        store: mockStore,
        runtime: createMockRuntime(),
      });

      await recordAgentStep('contract-1', 1_000_000, 0, 500_000);

      const call = mockStore.recordAgentStep.mock.calls[0][0];
      expect(call.costUsd).toBe(0);
    });
  });

  describe('getUsageFromResult', () => {
    it('extracts usage from result with full inputTokenDetails', async () => {
      const mockStore = createMockStore();

      const { createAgentRunnerUsage } = await import('./agent-runner-usage');
      const { getUsageFromResult } = createAgentRunnerUsage({
        store: mockStore,
        runtime: createMockRuntime(),
      });

      const result = getUsageFromResult({
        usage: {
          inputTokens: 1000,
          outputTokens: 500,
          inputTokenDetails: {
            cacheReadTokens: 200,
          },
        },
      });

      expect(result).toEqual({
        inputTokens: 1000,
        cachedInputTokens: 200,
        outputTokens: 500,
      });
    });

    it('falls back to cachedInputTokens when inputTokenDetails is absent', async () => {
      const mockStore = createMockStore();

      const { createAgentRunnerUsage } = await import('./agent-runner-usage');
      const { getUsageFromResult } = createAgentRunnerUsage({
        store: mockStore,
        runtime: createMockRuntime(),
      });

      const result = getUsageFromResult({
        usage: {
          inputTokens: 1000,
          outputTokens: 500,
          cachedInputTokens: 300,
        },
      });

      expect(result).toEqual({
        inputTokens: 1000,
        cachedInputTokens: 300,
        outputTokens: 500,
      });
    });

    it('uses promptTokens/completionTokens as fallbacks', async () => {
      const mockStore = createMockStore();

      const { createAgentRunnerUsage } = await import('./agent-runner-usage');
      const { getUsageFromResult } = createAgentRunnerUsage({
        store: mockStore,
        runtime: createMockRuntime(),
      });

      const result = getUsageFromResult({
        usage: {
          promptTokens: 2000,
          completionTokens: 800,
          cachedInputTokens: 500,
        },
      });

      expect(result).toEqual({
        inputTokens: 2000,
        cachedInputTokens: 500,
        outputTokens: 800,
      });
    });

    it('throws when usage is undefined', async () => {
      const mockStore = createMockStore();

      const { createAgentRunnerUsage } = await import('./agent-runner-usage');
      const { getUsageFromResult } = createAgentRunnerUsage({
        store: mockStore,
        runtime: createMockRuntime(),
      });

      expect(() => getUsageFromResult({})).toThrow(TypeError);
    });

    it('prioritizes inputTokenDetails.cacheReadTokens over cachedInputTokens', async () => {
      const mockStore = createMockStore();

      const { createAgentRunnerUsage } = await import('./agent-runner-usage');
      const { getUsageFromResult } = createAgentRunnerUsage({
        store: mockStore,
        runtime: createMockRuntime(),
      });

      const result = getUsageFromResult({
        usage: {
          inputTokens: 1000,
          outputTokens: 500,
          cachedInputTokens: 100,
          inputTokenDetails: {
            cacheReadTokens: 400,
          },
        },
      });

      // cacheReadTokens wins
      expect(result.cachedInputTokens).toBe(400);
    });
  });
});
