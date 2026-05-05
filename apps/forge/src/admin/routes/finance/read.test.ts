import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerFinanceReadRoutes, type FinanceReadModel } from './read';

vi.mock('../index', () => ({
  jsonResponse: vi.fn((body: unknown, status = 200) => ({
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  })),
}));

function makeMockHttpServer() {
  const routes: Array<{ method: string; path: string; handler: unknown }> = [];
  return {
    routes,
    registerRoute: vi.fn((route: { method: string; path: string; handler: unknown }) => {
      routes.push(route);
    }),
  };
}

function makeMockReadModel(): FinanceReadModel {
  return {
    getFinanceBalance: vi.fn<() => Promise<unknown>>(),
    getFinanceSummary: vi.fn<() => Promise<unknown>>(),
    getFinanceMovements: vi.fn<(limit: number, offset: number) => Promise<unknown>>(),
    getFinanceRecurring: vi.fn<() => Promise<unknown>>(),
    getFinanceContracts: vi.fn<() => Promise<unknown>>(),
  };
}

describe('registerFinanceReadRoutes', () => {
  let mockServer: ReturnType<typeof makeMockHttpServer>;
  let mockReadModel: FinanceReadModel;

  beforeEach(() => {
    mockServer = makeMockHttpServer();
    mockReadModel = makeMockReadModel();
    vi.clearAllMocks();
  });

  it('registers exactly 6 routes', () => {
    registerFinanceReadRoutes(mockServer, mockReadModel);
    expect(mockServer.registerRoute).toHaveBeenCalledTimes(6);
    expect(mockServer.routes).toHaveLength(6);
  });

  it('registers GET /admin/finance (backward compat)', () => {
    registerFinanceReadRoutes(mockServer, mockReadModel);
    const route = mockServer.routes.find(r => r.path === '/admin/finance');
    expect(route).toBeDefined();
    expect(route!.method).toBe('GET');
  });

  it('registers GET /admin/finance/balance', () => {
    registerFinanceReadRoutes(mockServer, mockReadModel);
    const route = mockServer.routes.find(r => r.path === '/admin/finance/balance');
    expect(route).toBeDefined();
    expect(route!.method).toBe('GET');
  });

  it('registers GET /admin/finance/summary', () => {
    registerFinanceReadRoutes(mockServer, mockReadModel);
    const route = mockServer.routes.find(r => r.path === '/admin/finance/summary');
    expect(route).toBeDefined();
    expect(route!.method).toBe('GET');
  });

  it('registers GET /admin/finance/movements', () => {
    registerFinanceReadRoutes(mockServer, mockReadModel);
    const route = mockServer.routes.find(r => r.path === '/admin/finance/movements');
    expect(route).toBeDefined();
    expect(route!.method).toBe('GET');
  });

  it('registers GET /admin/finance/recurring', () => {
    registerFinanceReadRoutes(mockServer, mockReadModel);
    const route = mockServer.routes.find(r => r.path === '/admin/finance/recurring');
    expect(route).toBeDefined();
    expect(route!.method).toBe('GET');
  });

  it('registers GET /admin/finance/contracts', () => {
    registerFinanceReadRoutes(mockServer, mockReadModel);
    const route = mockServer.routes.find(r => r.path === '/admin/finance/contracts');
    expect(route).toBeDefined();
    expect(route!.method).toBe('GET');
  });

  it('GET /admin/finance/balance calls getFinanceBalance', async () => {
    registerFinanceReadRoutes(mockServer, mockReadModel);
    mockReadModel.getFinanceBalance.mockResolvedValue({ balanceUsd: 50000 });
    const handler = mockServer.routes.find(r => r.path === '/admin/finance/balance')!.handler as () => Promise<unknown>;
    const response = await handler();
    expect(mockReadModel.getFinanceBalance).toHaveBeenCalled();
    const { jsonResponse } = await import('../index');
    expect(jsonResponse).toHaveBeenCalledWith({ balanceUsd: 50000 });
    expect(response).toMatchObject({ status: 200 });
  });

  it('GET /admin/finance/summary calls getFinanceSummary', async () => {
    registerFinanceReadRoutes(mockServer, mockReadModel);
    mockReadModel.getFinanceSummary.mockResolvedValue({ income: 10000, expenses: 5000 });
    const handler = mockServer.routes.find(r => r.path === '/admin/finance/summary')!.handler as () => Promise<unknown>;
    const response = await handler();
    expect(mockReadModel.getFinanceSummary).toHaveBeenCalled();
    const { jsonResponse } = await import('../index');
    expect(jsonResponse).toHaveBeenCalledWith({ income: 10000, expenses: 5000 });
    expect(response).toMatchObject({ status: 200 });
  });

  it('GET /admin/finance/movements reads limit/offset from query params', async () => {
    registerFinanceReadRoutes(mockServer, mockReadModel);
    mockReadModel.getFinanceMovements.mockResolvedValue([{ id: 'mov-1' }]);
    // Create a mock request-like object with url
    const handler = mockServer.routes.find(r => r.path === '/admin/finance/movements')!.handler as (req: { url: string }) => Promise<unknown>;
    const response = await handler({ url: 'http://localhost/admin/finance/movements?limit=20&offset=10' });
    expect(mockReadModel.getFinanceMovements).toHaveBeenCalledWith(20, 10);
    const { jsonResponse } = await import('../index');
    expect(jsonResponse).toHaveBeenCalledWith([{ id: 'mov-1' }]);
    expect(response).toMatchObject({ status: 200 });
  });

  it('GET /admin/finance/recurring calls getFinanceRecurring', async () => {
    registerFinanceReadRoutes(mockServer, mockReadModel);
    mockReadModel.getFinanceRecurring.mockResolvedValue([{ id: 'pay-1' }]);
    const handler = mockServer.routes.find(r => r.path === '/admin/finance/recurring')!.handler as () => Promise<unknown>;
    const response = await handler();
    expect(mockReadModel.getFinanceRecurring).toHaveBeenCalled();
    const { jsonResponse } = await import('../index');
    expect(jsonResponse).toHaveBeenCalledWith([{ id: 'pay-1' }]);
    expect(response).toMatchObject({ status: 200 });
  });

  it('GET /admin/finance/contracts calls getFinanceContracts', async () => {
    registerFinanceReadRoutes(mockServer, mockReadModel);
    mockReadModel.getFinanceContracts.mockResolvedValue([{ id: 'contract-1' }]);
    const handler = mockServer.routes.find(r => r.path === '/admin/finance/contracts')!.handler as () => Promise<unknown>;
    const response = await handler();
    expect(mockReadModel.getFinanceContracts).toHaveBeenCalled();
    const { jsonResponse } = await import('../index');
    expect(jsonResponse).toHaveBeenCalledWith([{ id: 'contract-1' }]);
    expect(response).toMatchObject({ status: 200 });
  });

  it('handlers are async functions', async () => {
    registerFinanceReadRoutes(mockServer, mockReadModel);
    mockReadModel.getFinanceBalance.mockResolvedValue(null);
    const handler = mockServer.routes.find(r => r.path === '/admin/finance/balance')!.handler;
    const result = (handler as Function)();
    expect(result).toBeInstanceOf(Promise);
    await result;
  });
});
