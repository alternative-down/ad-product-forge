import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerFinanceReadRoutes } from './read';

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

function makeMockReadModel() {
  return {
    companyCash: {
      getOverview: vi.fn<() => Promise<unknown>>(),
      listContractSummaries: vi.fn<() => Promise<unknown>>(),
    },
  } as any;
}

describe('registerFinanceReadRoutes', () => {
  let mockServer: ReturnType<typeof makeMockHttpServer>;
  let mockReadModel: ReturnType<typeof makeMockReadModel>;

  beforeEach(() => {
    mockServer = makeMockHttpServer();
    mockReadModel = makeMockReadModel();
    vi.clearAllMocks();
  });

  it('registers exactly 2 routes', () => {
    registerFinanceReadRoutes(mockServer, mockReadModel);
    expect(mockServer.registerRoute).toHaveBeenCalledTimes(2);
    expect(mockServer.routes).toHaveLength(2);
  });

  it('registers GET /admin/finance route', () => {
    registerFinanceReadRoutes(mockServer, mockReadModel);
    const route = mockServer.routes.find((r) => r.path === '/admin/finance');
    expect(route).toBeDefined();
    expect(route!.method).toBe('GET');
  });

  it('registers GET /admin/finance/contracts route', () => {
    registerFinanceReadRoutes(mockServer, mockReadModel);
    const route = mockServer.routes.find((r) => r.path === '/admin/finance/contracts');
    expect(route).toBeDefined();
    expect(route!.method).toBe('GET');
  });

  it('GET /admin/finance calls getFinance and returns its result', async () => {
    registerFinanceReadRoutes(mockServer, mockReadModel);
    mockReadModel.getFinance.mockResolvedValue({ totalCash: 50000, totalPayables: 12000 });
    const handler = mockServer.routes.find((r) => r.path === '/admin/finance')!
      .handler as () => Promise<unknown>;
    const response = await handler();
    expect(mockReadModel.getFinance).toHaveBeenCalled();
    const { jsonResponse } = await import('../index');
    expect(jsonResponse).toHaveBeenCalledWith({ totalCash: 50000, totalPayables: 12000 });
    expect(response).toMatchObject({ status: 200 });
  });

  it('GET /admin/finance/contracts calls getFinanceContracts and returns its result', async () => {
    registerFinanceReadRoutes(mockServer, mockReadModel);
    mockReadModel.getFinanceContracts.mockResolvedValue([{ id: 'contract-1', amount: 1000 }]);
    const handler = mockServer.routes.find((r) => r.path === '/admin/finance/contracts')!
      .handler as () => Promise<unknown>;
    const response = await handler();
    expect(mockReadModel.getFinanceContracts).toHaveBeenCalled();
    const { jsonResponse } = await import('../index');
    expect(jsonResponse).toHaveBeenCalledWith([{ id: 'contract-1', amount: 1000 }]);
    expect(response).toMatchObject({ status: 200 });
  });

  it('handlers are async functions', async () => {
    registerFinanceReadRoutes(mockServer, mockReadModel);
    mockReadModel.getFinance.mockResolvedValue(null);
    const handler = mockServer.routes.find((r) => r.path === '/admin/finance')!.handler;
    const result = (handler as Function)();
    expect(result).toBeInstanceOf(Promise);
    await result;
  });
});
