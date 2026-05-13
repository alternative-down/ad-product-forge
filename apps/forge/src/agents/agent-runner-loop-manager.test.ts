import { describe, it, expect } from 'vitest';
import {
  createLoopManager,
  createLoopManagerState,
  type LoopManager,
} from './agent-runner-loop-manager';

describe('agent-runner-loop-manager', () => {
  describe('createLoopManagerState', () => {
    it('returns initial zero state', () => {
      const state = createLoopManagerState();
      expect(state.lastLoopSignature).toBeNull();
      expect(state.repeatedLoopCount).toBe(0);
    });
  });

  describe('LoopManager', () => {
    let manager: LoopManager;
    beforeEach(() => {
      manager = createLoopManager(createLoopManagerState());
    });

    describe('reset', () => {
      it('clears signature and count', () => {
        manager.register('sig-1');
        manager.register('sig-1');
        expect(manager.getSignatureCount()).toBe(2);

        manager.reset();

        expect(manager.getCurrentSignature()).toBeNull();
        expect(manager.getSignatureCount()).toBe(0);
      });
    });

    describe('register', () => {
      it('registers first signature with count 1', () => {
        const count = manager.register('loop-abc');
        expect(count).toBe(1);
        expect(manager.getCurrentSignature()).toBe('loop-abc');
      });

      it('increments count when same signature repeats', () => {
        manager.register('loop-abc');
        expect(manager.register('loop-abc')).toBe(2);
        expect(manager.register('loop-abc')).toBe(3);
        expect(manager.getSignatureCount()).toBe(3);
      });

      it('resets count on new signature', () => {
        manager.register('loop-abc');
        manager.register('loop-abc');
        manager.register('loop-xyz');

        expect(manager.getCurrentSignature()).toBe('loop-xyz');
        expect(manager.getSignatureCount()).toBe(1);
      });
    });

    describe('isStuck', () => {
      it('returns false when below repeat limit', () => {
        manager.register('loop');
        manager.register('loop');
        manager.register('loop');
        expect(manager.isStuck()).toBe(false);
      });

      it('returns true at stuckLoopRepeatLimit (default 6)', () => {
        for (let i = 0; i < 6; i++) {
          manager.register('stuck-loop');
        }
        expect(manager.isStuck()).toBe(true);
      });

      it('resets after new signature', () => {
        for (let i = 0; i < 6; i++) {
          manager.register('stuck-loop');
        }
        expect(manager.isStuck()).toBe(true);

        manager.register('new-sig');
        expect(manager.isStuck()).toBe(false);
        expect(manager.getSignatureCount()).toBe(1);
      });

      it('respects custom stuckLoopRepeatLimit', () => {
        const customManager = createLoopManager(createLoopManagerState(), { stuckLoopRepeatLimit: 3 });
        for (let i = 0; i < 3; i++) {
          customManager.register('stuck');
        }
        expect(customManager.isStuck()).toBe(true);
      });
    });

    describe('getSignatureCount', () => {
      it('returns current count', () => {
        expect(manager.getSignatureCount()).toBe(0);
        manager.register('sig-a');
        expect(manager.getSignatureCount()).toBe(1);
        manager.register('sig-a');
        expect(manager.getSignatureCount()).toBe(2);
      });
    });

    describe('getCurrentSignature', () => {
      it('returns null when no signature', () => {
        expect(manager.getCurrentSignature()).toBeNull();
      });

      it('returns current signature', () => {
        manager.register('current-sig');
        expect(manager.getCurrentSignature()).toBe('current-sig');
      });
    });
  });
});