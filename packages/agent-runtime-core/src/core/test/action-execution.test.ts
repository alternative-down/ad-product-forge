import { describe, expect, it, vi } from 'vitest';
import {
  createSequentialActionExecutionStrategy,
  createParallelActionExecutionStrategy,
} from '../action-execution.js';

describe('action execution strategies', () => {
  describe('createSequentialActionExecutionStrategy', () => {
    it('executes actions sequentially', async () => {
      const strategy = createSequentialActionExecutionStrategy();
      const executeAction = vi.fn().mockResolvedValue({ name: 'test', input: {}, output: null });

      const results = await strategy.execute(
        [{ name: 'a', input: {} }, { name: 'b', input: {} }],
        executeAction,
      );

      expect(results).toHaveLength(2);
      expect(executeAction).toHaveBeenCalledTimes(2);
    });

    it('stops on first error', async () => {
      const strategy = createSequentialActionExecutionStrategy();
      const error = new Error('action failed');
      const executeAction = vi.fn()
        .mockResolvedValueOnce({ name: 'a', input: {}, output: null })
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ name: 'c', input: {}, output: null });

      await expect(
        strategy.execute(
          [{ name: 'a', input: {} }, { name: 'b', input: {} }, { name: 'c', input: {} }],
          executeAction,
        ),
      ).rejects.toThrow('action failed');
    });
  });

  describe('createParallelActionExecutionStrategy', () => {
    it('executes all actions in parallel', async () => {
      const strategy = createParallelActionExecutionStrategy();
      let count = 0;
      const executeAction = vi.fn().mockImplementation(async () => {
        count++;
        return { name: 'test', input: {}, output: null };
      });

      const results = await strategy.execute(
        [{ name: 'a', input: {} }, { name: 'b', input: {} }, { name: 'c', input: {} }],
        executeAction,
      );

      expect(results).toHaveLength(3);
      // All called before any resolved
      expect(executeAction).toHaveBeenCalledTimes(3);
    });

    it('rejects when any action rejects', async () => {
      const strategy = createParallelActionExecutionStrategy();
      const executeAction = vi.fn().mockResolvedValue({ name: 'test', input: {}, output: null });

      executeAction.mockRejectedValueOnce(new Error('parallel error'));

      const promise = strategy.execute(
        [{ name: 'a', input: {} }, { name: 'b', input: {} }],
        executeAction,
      );

      await expect(promise).rejects.toThrow('parallel error');
    });
  });
});
