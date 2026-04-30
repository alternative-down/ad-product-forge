import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerFinanceWriteRoutes } from './write';

// --- Mocks for file-level imports ---

vi.mock('@forge-runtime/core', () => ({ forgeDebug: () => {} }));
vi.mock('../../../http/server', () => ({
  jsonResponse: vi.fn((body: unknown, status = 200) => ({
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  })),
}));
vi.mock('../index', () => ({
  jsonResponse: vi.fn((body: unknown, status = 200) => ({
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  })),
  parseJsonBody: vi.fn((bodyText: string, schema: { parse: (v: unknown) => unknown }) => {
    if (bodyText.trim() === '') return {};
    return schema.parse(JSON.parse(bodyText));
  }),
}));
vi.mock('../../../utils/id.js', () => ({ createId: vi.fn(() => 'mock-id-abc123') }));

// --- Helpers ---

function makeMockHttpServer() {
  const routes: Array<{ method: string; path: string; handler: unknown }> = [];
  return {
    routes,
    registerRoute: vi.fn((route: { method: string; path: string; handler: unknown }) => {
      routes.push(route);
    }),
  };
}

function makeMockCompanyCash() {
  return {
    recordCashIn: vi.fn<() => Promise<{ entryId: string }>>(),
    scheduleCashOut: vi.fn<() => Promise<{ entryId: string }>>(),
    postPlannedEntry: vi.fn<() => Promise<unknown>>(),
    cancelPlannedEntry: vi.fn<() => Promise<unknown>>(),
  };
}

function makeMockCompanyPayables() {
  return {
    createRecurringPayable: vi.fn<() => Promise<{ payableId: string; entryId: string }>>(),
    syncRecurringPayableOccurrence: vi.fn<() => Promise<unknown>>(),
    listRecurringPayables: vi.fn<() => Promise<unknown[]>>(),
    setRecurringPayableActive: vi.fn<() => Promise<unknown>>(),
  };
}

function makeMockRequest(bodyText = '{}') {
  return { bodyText } as unknown as import('../../../http/server').HttpRequest;
}

// --- Tests ---

describe('registerFinanceWriteRoutes', () => {
  let mockServer: ReturnType<typeof makeMockHttpServer>;
  let mockCompanyCash: ReturnType<typeof makeMockCompanyCash>;
  let mockCompanyPayables: ReturnType<typeof makeMockCompanyPayables>;

  beforeEach(() => {
    mockServer = makeMockHttpServer();
    mockCompanyCash = makeMockCompanyCash();
    mockCompanyPayables = makeMockCompanyPayables();
    vi.clearAllMocks();
  });

  it('registers all 5 routes', () => {
    registerFinanceWriteRoutes(mockServer, {
      companyCash: mockCompanyCash,
      companyPayables: mockCompanyPayables,
    });

    expect(mockServer.registerRoute).toHaveBeenCalledTimes(5);
    expect(mockServer.routes).toHaveLength(5);
  });

  it('registers investment/create route as POST', () => {
    registerFinanceWriteRoutes(mockServer, {
      companyCash: mockCompanyCash,
      companyPayables: mockCompanyPayables,
    });

    const route = mockServer.routes.find(r => r.path === '/admin/finance/investment/create');
    expect(route).toBeDefined();
    expect(route!.method).toBe('POST');
  });

  it('registers payable/create route as POST', () => {
    registerFinanceWriteRoutes(mockServer, {
      companyCash: mockCompanyCash,
      companyPayables: mockCompanyPayables,
    });

    const route = mockServer.routes.find(r => r.path === '/admin/finance/payable/create');
    expect(route).toBeDefined();
    expect(route!.method).toBe('POST');
  });

  it('registers ledger/post route as POST', () => {
    registerFinanceWriteRoutes(mockServer, {
      companyCash: mockCompanyCash,
      companyPayables: mockCompanyPayables,
    });

    const route = mockServer.routes.find(r => r.path === '/admin/finance/ledger/post');
    expect(route).toBeDefined();
    expect(route!.method).toBe('POST');
  });

  it('registers ledger/cancel route as POST', () => {
    registerFinanceWriteRoutes(mockServer, {
      companyCash: mockCompanyCash,
      companyPayables: mockCompanyPayables,
    });

    const route = mockServer.routes.find(r => r.path === '/admin/finance/ledger/cancel');
    expect(route).toBeDefined();
    expect(route!.method).toBe('POST');
  });

  it('registers recurring-payable/set-active route as POST', () => {
    registerFinanceWriteRoutes(mockServer, {
      companyCash: mockCompanyCash,
      companyPayables: mockCompanyPayables,
    });

    const route = mockServer.routes.find(r => r.path === '/admin/finance/recurring-payable/set-active');
    expect(route).toBeDefined();
    expect(route!.method).toBe('POST');
  });
});

describe('POST /admin/finance/investment/create — handler', () => {
  let mockServer: ReturnType<typeof makeMockHttpServer>;
  let mockCompanyCash: ReturnType<typeof makeMockCompanyCash>;
  let mockCompanyPayables: ReturnType<typeof makeMockCompanyPayables>;
  let handler: (req: unknown) => Promise<unknown>;

  beforeEach(() => {
    mockServer = makeMockHttpServer();
    mockCompanyCash = makeMockCompanyCash();
    mockCompanyPayables = makeMockCompanyPayables();
    vi.clearAllMocks();

    registerFinanceWriteRoutes(mockServer, {
      companyCash: mockCompanyCash,
      companyPayables: mockCompanyPayables,
    });

    handler = mockServer.routes.find(r => r.path === '/admin/finance/investment/create')!.handler as typeof handler;
    mockCompanyCash.recordCashIn.mockResolvedValue({ entryId: 'inv-001' });
  });

  it('calls companyCash.recordCashIn with correct params', async () => {
    await handler(makeMockRequest(JSON.stringify({ amountUsd: 1000, description: 'Seed round' })));

    expect(mockCompanyCash.recordCashIn).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'owner-investment',
        amountUsd: 1000,
        description: 'Seed round',
      }),
    );
  });

  it('uses default description when not provided', async () => {
    await handler(makeMockRequest(JSON.stringify({ amountUsd: 500 })));

    expect(mockCompanyCash.recordCashIn).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Manual owner investment' }),
    );
  });

  it('passes effectiveAt timestamp when provided', async () => {
    await handler(makeMockRequest(JSON.stringify({ amountUsd: 200, effectiveAt: '2025-06-01T10:00:00Z' })));

    expect(mockCompanyCash.recordCashIn).toHaveBeenCalledWith(
      expect.objectContaining({
        effectiveAt: expect.any(Number),
      }),
    );
    const call = mockCompanyCash.recordCashIn.mock.calls[0][0];
    expect(call.effectiveAt).toBeGreaterThan(0);
  });

  it('returns success response', async () => {
    const response = await handler(makeMockRequest(JSON.stringify({ amountUsd: 100 })));

    const { parseJsonBody } = await import('../index');
    expect(parseJsonBody).toHaveBeenCalled();
    expect(response).toMatchObject({ status: 200 });
  });
});

describe('POST /admin/finance/payable/create — handler', () => {
  let mockServer: ReturnType<typeof makeMockHttpServer>;
  let mockCompanyCash: ReturnType<typeof makeMockCompanyCash>;
  let mockCompanyPayables: ReturnType<typeof makeMockCompanyPayables>;
  let handler: (req: unknown) => Promise<unknown>;

  beforeEach(() => {
    mockServer = makeMockHttpServer();
    mockCompanyCash = makeMockCompanyCash();
    mockCompanyPayables = makeMockCompanyPayables();
    vi.clearAllMocks();

    registerFinanceWriteRoutes(mockServer, {
      companyCash: mockCompanyCash,
      companyPayables: mockCompanyPayables,
    });

    handler = mockServer.routes.find(r => r.path === '/admin/finance/payable/create')!.handler as typeof handler;
    mockCompanyCash.scheduleCashOut.mockResolvedValue({ entryId: 'pay-001' });
    mockCompanyPayables.createRecurringPayable.mockResolvedValue({ payableId: 'rec-001', entryId: 'pay-002' });
  });

  it('for single payable: calls companyCash.scheduleCashOut', async () => {
    await handler(makeMockRequest(JSON.stringify({
      name: 'Rent',
      amountUsd: 1500,
      dueAt: '2025-06-01',
      kind: 'single',
    })));

    expect(mockCompanyCash.scheduleCashOut).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'manual-payable',
        amountUsd: 1500,
        referenceType: 'manual-payable',
        dueAt: expect.any(Number),
      }),
    );
    expect(mockCompanyPayables.createRecurringPayable).not.toHaveBeenCalled();
  });

  it('for single payable: uses name as description when description not provided', async () => {
    await handler(makeMockRequest(JSON.stringify({
      name: 'Rent',
      amountUsd: 1500,
      dueAt: '2025-06-01',
      kind: 'single',
    })));

    expect(mockCompanyCash.scheduleCashOut).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Rent' }),
    );
  });

  it('for recurring payable: calls companyPayables.createRecurringPayable', async () => {
    await handler(makeMockRequest(JSON.stringify({
      name: 'Netflix',
      amountUsd: 15,
      dueAt: '2025-06-01',
      kind: 'recurring',
      recurrencePeriod: 'monthly',
    })));

    expect(mockCompanyPayables.createRecurringPayable).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Netflix',
        recurrencePeriod: 'monthly',
      }),
    );
    expect(mockCompanyCash.scheduleCashOut).not.toHaveBeenCalled();
  });

  it('defaults recurrencePeriod to monthly when not provided on recurring', async () => {
    await handler(makeMockRequest(JSON.stringify({
      name: 'Spotify',
      amountUsd: 10,
      dueAt: '2025-06-01',
      kind: 'recurring',
    })));

    expect(mockCompanyPayables.createRecurringPayable).toHaveBeenCalledWith(
      expect.objectContaining({ recurrencePeriod: 'monthly' }),
    );
  });

  it('returns 201 with entryId for single payable', async () => {
    const response = await handler(makeMockRequest(JSON.stringify({
      name: 'Rent',
      amountUsd: 1500,
      dueAt: '2025-06-01',
      kind: 'single',
    })));

    expect(response).toMatchObject({ status: 201 });
    const body = JSON.parse((response as { body: string }).body);
    expect(body.entryId).toBe('pay-001');
    expect(body.kind).toBe('single');
  });

  it('returns 201 with payableId and entryId for recurring payable', async () => {
    const response = await handler(makeMockRequest(JSON.stringify({
      name: 'Netflix',
      amountUsd: 15,
      dueAt: '2025-06-01',
      kind: 'recurring',
    })));

    expect(response).toMatchObject({ status: 201 });
    const body = JSON.parse((response as { body: string }).body);
    expect(body.payableId).toBe('rec-001');
    expect(body.entryId).toBe('pay-002');
    expect(body.kind).toBe('recurring');
  });

  it('throws on invalid dueAt date', async () => {
    await expect(handler(makeMockRequest(JSON.stringify({
      name: 'Rent',
      amountUsd: 1500,
      dueAt: 'not-a-date',
      kind: 'single',
    })))).rejects.toThrow('Invalid payable dueAt');
  });
});

describe('POST /admin/finance/ledger/post — handler', () => {
  let mockServer: ReturnType<typeof makeMockHttpServer>;
  let mockCompanyCash: ReturnType<typeof makeMockCompanyCash>;
  let mockCompanyPayables: ReturnType<typeof makeMockCompanyPayables>;
  let handler: (req: unknown) => Promise<unknown>;

  beforeEach(() => {
    mockServer = makeMockHttpServer();
    mockCompanyCash = makeMockCompanyCash();
    mockCompanyPayables = makeMockCompanyPayables();
    vi.clearAllMocks();

    registerFinanceWriteRoutes(mockServer, {
      companyCash: mockCompanyCash,
      companyPayables: mockCompanyPayables,
    });

    handler = mockServer.routes.find(r => r.path === '/admin/finance/ledger/post')!.handler as typeof handler;
    mockCompanyCash.postPlannedEntry.mockResolvedValue({ posted: true });
    mockCompanyPayables.syncRecurringPayableOccurrence.mockResolvedValue(undefined);
  });

  it('calls postPlannedEntry with entryId', async () => {
    await handler(makeMockRequest(JSON.stringify({ entryId: 'entry-abc' })));

    expect(mockCompanyCash.postPlannedEntry).toHaveBeenCalledWith('entry-abc', {});
  });

  it('calls syncRecurringPayableOccurrence with entryId', async () => {
    await handler(makeMockRequest(JSON.stringify({ entryId: 'entry-xyz' })));

    expect(mockCompanyPayables.syncRecurringPayableOccurrence).toHaveBeenCalledWith({ entryId: 'entry-xyz' });
  });

  it('passes effectiveAt when provided', async () => {
    await handler(makeMockRequest(JSON.stringify({
      entryId: 'entry-abc',
      effectiveAt: '2025-07-01T12:00:00Z',
    })));

    expect(mockCompanyCash.postPlannedEntry).toHaveBeenCalledWith(
      'entry-abc',
      expect.objectContaining({ effectiveAt: expect.any(Number) }),
    );
  });
});

describe('POST /admin/finance/ledger/cancel — handler', () => {
  let mockServer: ReturnType<typeof makeMockHttpServer>;
  let mockCompanyCash: ReturnType<typeof makeMockCompanyCash>;
  let mockCompanyPayables: ReturnType<typeof makeMockCompanyPayables>;
  let handler: (req: unknown) => Promise<unknown>;

  beforeEach(() => {
    mockServer = makeMockHttpServer();
    mockCompanyCash = makeMockCompanyCash();
    mockCompanyPayables = makeMockCompanyPayables();
    vi.clearAllMocks();

    registerFinanceWriteRoutes(mockServer, {
      companyCash: mockCompanyCash,
      companyPayables: mockCompanyPayables,
    });

    handler = mockServer.routes.find(r => r.path === '/admin/finance/ledger/cancel')!.handler as typeof handler;
    mockCompanyCash.cancelPlannedEntry.mockResolvedValue({ cancelled: true });
    mockCompanyPayables.syncRecurringPayableOccurrence.mockResolvedValue(undefined);
  });

  it('calls cancelPlannedEntry with entryId', async () => {
    await handler(makeMockRequest(JSON.stringify({ entryId: 'entry-cancel-123' })));

    expect(mockCompanyCash.cancelPlannedEntry).toHaveBeenCalledWith('entry-cancel-123');
  });

  it('also syncs recurring payable occurrence', async () => {
    await handler(makeMockRequest(JSON.stringify({ entryId: 'entry-cancel-123' })));

    expect(mockCompanyPayables.syncRecurringPayableOccurrence).toHaveBeenCalledWith({ entryId: 'entry-cancel-123' });
  });
});

describe('POST /admin/finance/recurring-payable/set-active — handler', () => {
  let mockServer: ReturnType<typeof makeMockHttpServer>;
  let mockCompanyPayables: ReturnType<typeof makeMockCompanyPayables>;
  let handler: (req: unknown) => Promise<unknown>;

  beforeEach(() => {
    mockServer = makeMockHttpServer();
    mockCompanyPayables = makeMockCompanyPayables();
    vi.clearAllMocks();

    registerFinanceWriteRoutes(mockServer, {
      companyCash: makeMockCompanyCash(),
      companyPayables: mockCompanyPayables,
    });

    handler = mockServer.routes.find(r => r.path === '/admin/finance/recurring-payable/set-active')!.handler as typeof handler;
    mockCompanyPayables.setRecurringPayableActive.mockResolvedValue({ updated: true });
  });

  it('calls setRecurringPayableActive with payableId and isActive', async () => {
    await handler(makeMockRequest(JSON.stringify({ payableId: 'payable-xyz', isActive: true })));

    expect(mockCompanyPayables.setRecurringPayableActive).toHaveBeenCalledWith('payable-xyz', true);
  });

  it('calls with false when deactivating', async () => {
    await handler(makeMockRequest(JSON.stringify({ payableId: 'payable-abc', isActive: false })));

    expect(mockCompanyPayables.setRecurringPayableActive).toHaveBeenCalledWith('payable-abc', false);
  });
});
