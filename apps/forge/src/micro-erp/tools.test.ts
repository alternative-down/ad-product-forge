import { describe, expect, test, vi } from 'vitest';
import type { Tool } from '@forge-runtime/core';

const mocks = vi.hoisted(() => ({
  readModel: {
    getCompanyCashBalance: vi.fn<() => Promise<{ balanceUsd: number }>>(),
    listCompanyCashMovements: vi.fn<() => Promise<{ items: unknown[]; summary: { totalIn: number; totalOut: number } }>>(),
    listActiveInternalAgentContracts: vi.fn<() => Promise<{ items: unknown[] }>>(),
  },
  cashOps: {
    recordCashIn: vi.fn<() => Promise<{ movementId: string }>>(),
    recordCashOut: vi.fn<() => Promise<{ movementId: string }>>(),
    postCashMovement: vi.fn<() => Promise<{ movementId: string }>>(),
    cancelCashMovement: vi.fn<() => Promise<{ movementId: string }>>(),
  },
}));

vi.mock('@forge-runtime/core', () => ({
  createTool: vi.fn(({ id, description, inputSchema, execute }) => ({ id, description, inputSchema, execute })),
  forgeDebug: vi.fn(),
}));

vi.mock('./read-model', () => ({
  createMicroErpReadModel: vi.fn(() => mocks.readModel),
}));

vi.mock('../finance/company-cash-operations', () => ({
  createCompanyCashOperations: vi.fn(() => mocks.cashOps),
}));

import { createMicroErpTools } from './tools';

describe('createMicroErpTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readModel.getCompanyCashBalance.mockResolvedValue({ balanceUsd: 1000 });
    mocks.readModel.listCompanyCashMovements.mockResolvedValue({ items: [], summary: { totalIn: 0, totalOut: 0 } });
    mocks.readModel.listActiveInternalAgentContracts.mockResolvedValue({ items: [] });
    mocks.cashOps.recordCashIn.mockResolvedValue({ movementId: 'mov_1' });
    mocks.cashOps.recordCashOut.mockResolvedValue({ movementId: 'mov_2' });
    mocks.cashOps.postCashMovement.mockResolvedValue({ movementId: 'mov_3' });
    mocks.cashOps.cancelCashMovement.mockResolvedValue({ movementId: 'mov_4' });
  });

  // ── Tool availability ────────────────────────────────────────────────────

  test('creates all 5 tools when allowedToolIds is undefined', () => {
    const tools = createMicroErpTools({} as any);
    expect(Object.keys(tools)).toHaveLength(5);
  });

  test('creates all tools when allowedToolIds is null', () => {
    const tools = createMicroErpTools({} as any, null);
    expect(Object.keys(tools)).toHaveLength(5);
  });

  test('creates no tools when allowedToolIds is empty set', () => {
    const tools = createMicroErpTools({} as any, new Set());
    expect(Object.keys(tools)).toHaveLength(0);
  });

  test('creates only the single allowed tool', () => {
    const tools = createMicroErpTools({} as any, new Set(['get_company_cash']));
    expect(Object.keys(tools)).toEqual(['get_company_cash']);
  });

  test('creates multiple allowed tools', () => {
    const tools = createMicroErpTools({} as any, new Set(['get_company_cash', 'list_company_cash']));
    expect(Object.keys(tools)).toContain('get_company_cash');
    expect(Object.keys(tools)).toContain('list_company_cash');
    expect(Object.keys(tools)).not.toContain('list_internal_agent_contracts');
  });

  // ── get_company_cash ─────────────────────────────────────────────────────

  test('returns balance on success', async () => {
    const tools = createMicroErpTools({} as any);
    const tool = tools['get_company_cash'] as Tool<unknown, unknown>;
    const result = await tool.execute({});
    expect(result).toEqual({ balanceUsd: 1000 });
  });

  test('returns error object on db failure', async () => {
    mocks.readModel.getCompanyCashBalance.mockRejectedValueOnce(new Error('DB unavailable'));
    const tools = createMicroErpTools({} as any);
    const tool = tools['get_company_cash'] as Tool<unknown, unknown>;
    const result = await tool.execute({});
    expect(result).toMatchObject({ valid: false, error: 'DB unavailable' });
  });

  // ── list_company_cash ───────────────────────────────────────────────────

  test('returns movements on success', async () => {
    const tools = createMicroErpTools({} as any);
    const tool = tools['list_company_cash'] as Tool<unknown, unknown>;
    const result = await tool.execute({});
    expect(result).toMatchObject({ items: [] });
  });

  test('returns error object on db failure', async () => {
    mocks.readModel.listCompanyCashMovements.mockRejectedValueOnce(new Error('query failed'));
    const tools = createMicroErpTools({} as any);
    const tool = tools['list_company_cash'] as Tool<unknown, unknown>;
    const result = await tool.execute({});
    expect(result).toMatchObject({ valid: false, error: 'query failed' });
  });

  // ── list_internal_agent_contracts ───────────────────────────────────────

  test('returns contracts on success', async () => {
    const tools = createMicroErpTools({} as any);
    const tool = tools['list_internal_agent_contracts'] as Tool<unknown, unknown>;
    const result = await tool.execute({});
    expect(result).toMatchObject({ items: [] });
  });

  test('returns error object on db failure', async () => {
    mocks.readModel.listActiveInternalAgentContracts.mockRejectedValueOnce(new Error('DB error'));
    const tools = createMicroErpTools({} as any);
    const tool = tools['list_internal_agent_contracts'] as Tool<unknown, unknown>;
    const result = await tool.execute({});
    expect(result).toMatchObject({ valid: false, error: 'DB error' });
  });

  // ── manage_company_cash_movement ────────────────────────────────────────

  test('has correct id and description', () => {
    const tools = createMicroErpTools({} as any);
    const tool = tools['manage_company_cash_movement'] as Tool<unknown, unknown>;
    expect(tool.id).toBe('manage_company_cash_movement');
    expect(typeof tool.description).toBe('string');
  });

  test('accepts valid record_in action', async () => {
    const tools = createMicroErpTools({} as any);
    const tool = tools['manage_company_cash_movement'] as Tool<unknown, unknown>;
    const result = await tool.execute({
      action: 'record_in',
      recordIn: { type: 'infrastructure', amountUsd: 500 },
    });
    expect(result).toMatchObject({ valid: true, action: 'record_in', movementId: 'mov_1' });
    expect(mocks.cashOps.recordCashIn).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'infrastructure', amountUsd: 500 }),
    );
  });

  test('accepts valid record_out action', async () => {
    const tools = createMicroErpTools({} as any);
    const tool = tools['manage_company_cash_movement'] as Tool<unknown, unknown>;
    const result = await tool.execute({
      action: 'record_out',
      recordOut: { type: 'payroll', amountUsd: 2000 },
    });
    expect(result).toMatchObject({ valid: true, action: 'record_out', movementId: 'mov_2' });
    expect(mocks.cashOps.recordCashOut).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'payroll', amountUsd: 2000 }),
    );
  });

  // ── adjust_agent_contract_budget ───────────────────────────────────────

  test('has correct id', () => {
    const tools = createMicroErpTools({} as any);
    const tool = tools['adjust_agent_contract_budget'] as Tool<unknown, unknown>;
    expect(tool.id).toBe('adjust_agent_contract_budget');
  });
});
