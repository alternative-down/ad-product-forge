import { describe, expect, it } from 'vitest';
import {
  createConsumeAllInputBatchingStrategy,
  createFixedSizeInputBatchingStrategy,
} from '../input-batching.js';

describe('createConsumeAllInputBatchingStrategy', () => {
  it('selects all pending inputs', () => {
    const strategy = createConsumeAllInputBatchingStrategy();
    const inputs = [
      { id: '1', type: 'event', payload: {}, receivedAt: '' },
      { id: '2', type: 'event', payload: {}, receivedAt: '' },
    ];
    const batch = strategy.select(inputs);
    expect(batch.selected).toHaveLength(2);
    expect(batch.remaining).toHaveLength(0);
  });

  it('returns empty on empty input', () => {
    const strategy = createConsumeAllInputBatchingStrategy();
    const batch = strategy.select([]);
    expect(batch.selected).toHaveLength(0);
    expect(batch.remaining).toHaveLength(0);
  });
});

describe('createFixedSizeInputBatchingStrategy', () => {
  it('selects up to size inputs', () => {
    const strategy = createFixedSizeInputBatchingStrategy(2);
    const inputs = [
      { id: '1', type: 'event', payload: {}, receivedAt: '' },
      { id: '2', type: 'event', payload: {}, receivedAt: '' },
      { id: '3', type: 'event', payload: {}, receivedAt: '' },
      { id: '4', type: 'event', payload: {}, receivedAt: '' },
    ];
    const batch = strategy.select(inputs);
    expect(batch.selected).toHaveLength(2);
    expect(batch.remaining).toHaveLength(2);
  });

  it('returns all when fewer inputs than size', () => {
    const strategy = createFixedSizeInputBatchingStrategy(5);
    const inputs = [
      { id: '1', type: 'event', payload: {}, receivedAt: '' },
      { id: '2', type: 'event', payload: {}, receivedAt: '' },
    ];
    const batch = strategy.select(inputs);
    expect(batch.selected).toHaveLength(2);
    expect(batch.remaining).toHaveLength(0);
  });

  it('returns all when size equals inputs', () => {
    const strategy = createFixedSizeInputBatchingStrategy(2);
    const inputs = [
      { id: '1', type: 'event', payload: {}, receivedAt: '' },
      { id: '2', type: 'event', payload: {}, receivedAt: '' },
    ];
    const batch = strategy.select(inputs);
    expect(batch.selected).toHaveLength(2);
    expect(batch.remaining).toHaveLength(0);
  });

  it('returns empty on empty input', () => {
    const strategy = createFixedSizeInputBatchingStrategy(2);
    const batch = strategy.select([]);
    expect(batch.selected).toHaveLength(0);
    expect(batch.remaining).toHaveLength(0);
  });
});
