import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerSystemWriteRoutes } from './write';

const EXPECTED_ROUTES = [
  '/admin/system/settings/upsert',
  '/admin/system/mcp/upsert',
  '/admin/system/mcp/delete',
  '/admin/system/skills/upload',
  '/admin/system/skills/delete',
  '/admin/system/llm/price/upsert',
  '/admin/system/integration/upsert',
  '/admin/system/integration/delete',
  '/admin/system/llm/profile/upsert',
  '/admin/system/llm/profile/delete',
  '/admin/system/llm/defaults/update',
  '/admin/system/oauth/sync',
];

vi.mock('@forge-runtime/core', () => ({
  syncOpenAICodexCredential: vi.fn().mockResolvedValue(undefined),
  syncAnthropicCredential: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./oauth-state.js', () => ({
  buildOauthState: vi.fn().mockResolvedValue({ storePath: '/mock', providers: [] }),
}));

describe('registerSystemWriteRoutes', () => {
  let routes: { method: string; path: string }[];

  const mockHttpServer = {
    registerRoute: vi.fn((route: { method: string; path: string; handler: unknown }) => {
      routes.push(route);
    }),
  };

  const mockDb = {
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue([]),
    valuesBatch: vi.fn().mockResolvedValue(undefined),
  } as any;

  const mockSystemSettings = { upsertSettings: vi.fn().mockResolvedValue({}) } as any;
  const mockLlmModelPriceStore = { upsert: vi.fn().mockResolvedValue(undefined) } as any;
  const mockLlmSettingsStore = {
    upsertProfile: vi.fn().mockResolvedValue(undefined),
    deleteProfile: vi.fn().mockResolvedValue(undefined),
    updateDefaults: vi.fn().mockResolvedValue(undefined),
  } as any;
  const mockSystemIntegrationStore = {
    upsert: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  } as any;

  const mockRegistry = { list: vi.fn().mockReturnValue([]), add: vi.fn().mockResolvedValue(undefined) } as any;
  const mockLoaderConfig = {} as any;
  const mockDbForLoader = {} as any;

  beforeEach(() => {
    routes = [];
    vi.clearAllMocks();
  });

  function registerAll() {
    registerSystemWriteRoutes({
      httpServer: mockHttpServer as any,
      db: mockDb,
      registry: mockRegistry,
      loaderConfig: mockLoaderConfig,
      dbForLoader: mockDbForLoader,
      systemSettings: mockSystemSettings,
      llmModelPriceStore: mockLlmModelPriceStore,
      llmSettingsStore: mockLlmSettingsStore,
      systemIntegrationStore: mockSystemIntegrationStore,
    });
  }

  it('registers 12 system write routes', () => {
    registerAll();
    expect(routes).toHaveLength(12);
  });

  it('registers all expected route paths', () => {
    registerAll();
    for (const path of EXPECTED_ROUTES) {
      expect(routes.find(r => r.path === path && r.method === 'POST')).toBeDefined();
    }
  });

  it('all routes are POST method', () => {
    registerAll();
    expect(routes.every(r => r.method === 'POST')).toBe(true);
  });
});