import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerAgentWriteOpsRoutes } from './write-ops';

describe('debug rewakeup', () => {
  it('should handle rewakeup correctly', async () => {
    const notifyExternalEvent = vi.fn();
    const forceIdle = vi.fn();
    let rewakeupHandler: any;
    
    const httpServer = {
      registerRoute: ({ handler, path }: { method: string; path: string; handler: Function }) => {
        console.log(`registerRoute: ${path}`);
        if (path === '/admin/agent/rewakeup') {
          rewakeupHandler = handler;
        }
      },
    };
    
    const registry = new Map([
      ['test-agent', { runner: { notifyExternalEvent, forceIdle } } as any],
    ]);
    
    registerAgentWriteOpsRoutes(
      httpServer as any,
      { db: {}, workspaceBasePath: '/tmp', loaderConfig: {} },
      registry,
      { 
        loadAgent: vi.fn().mockResolvedValue({ runner: { notifyExternalEvent: vi.fn(), forceIdle: vi.fn() } }),
        topUpActiveAgentContract: vi.fn(),
        adjustAgentContractBudget: vi.fn(),
        renewAgentContract: vi.fn(),
        runInternalHiring: vi.fn(),
        runInternalTermination: vi.fn(),
        changeAgentRoleFromAdmin: vi.fn(),
        reloadAgentMcp: vi.fn(),
        updateInternalChatProviderProfile: vi.fn(),
        deleteAgentWorkspaceSkill: vi.fn(),
        installAgentWorkspaceSkillsFromZip: vi.fn(),
        deleteGlobalSkill: vi.fn(),
        installGlobalSkillToAgentWorkspace: vi.fn(),
        publishAgentWorkspaceSkillToGlobalCatalog: vi.fn(),
        encryptSecret: vi.fn((v: unknown) => v),
        parseProviderCredentials: vi.fn((_t: string, c: unknown) => c),
        createId: vi.fn(() => 'test-id'),
        normalizeOptionalText: vi.fn((v?: string) => v ?? null),
        normalizeJsonText: vi.fn((v: string | undefined, _f: string, _s: 'array' | 'object') => v ?? null),
        createCapabilityStore: vi.fn(),
        reloadAgentsForRole: vi.fn(),
        reloadAgentIfLoaded: vi.fn(),
      },
    );
    
    console.log('rewakeupHandler:', rewakeupHandler);
    console.log('Before calling handler');
    await rewakeupHandler({ bodyText: JSON.stringify({ agentId: 'test-agent' }) });
    console.log('After calling handler');
    console.log('notifyExternalEvent mock calls:', notifyExternalEvent.mock.calls);
    console.log('forceIdle mock calls:', forceIdle.mock.calls);
    
    expect(notifyExternalEvent).toHaveBeenCalled();
  });
});
