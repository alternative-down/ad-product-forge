import { describe, expect, it } from 'vitest';
import {
  agentIdQuerySchema,
  agentExecutionStepsQuerySchema,
  agentThreadMessagesQuerySchema,
  agentConversationMessagesQuerySchema,
  roleToolPermissionSchema,
  roleWorkflowPermissionSchema,
  createRoleSchema,
  topUpAgentContractSchema,
  hireAgentSchema,
  terminateAgentSchema,
  changeAgentRoleSchema,
} from './schemas';

describe('agentIdQuerySchema', () => {
  it('parses valid agentId', () => {
    const result = agentIdQuerySchema.parse({ agentId: 'agent-abc' });
    expect(result.agentId).toBe('agent-abc');
  });

  it('rejects missing agentId', () => {
    expect(() => agentIdQuerySchema.parse({})).toThrow();
  });

  it('rejects empty string agentId', () => {
    expect(() => agentIdQuerySchema.parse({ agentId: '' })).toThrow();
  });
});

describe('agentExecutionStepsQuerySchema', () => {
  it('uses default limit and offset when not provided', () => {
    const result = agentExecutionStepsQuerySchema.parse({ agentId: 'test' });
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });

  it('accepts explicit limit and offset', () => {
    const result = agentExecutionStepsQuerySchema.parse({
      agentId: 'test',
      limit: '50',
      offset: '10',
    });
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(10);
  });

  it('rejects limit below 1', () => {
    expect(() => agentExecutionStepsQuerySchema.parse({ agentId: 'test', limit: '0' })).toThrow();
  });

  it('rejects limit above 100', () => {
    expect(() => agentExecutionStepsQuerySchema.parse({ agentId: 'test', limit: '101' })).toThrow();
  });

  it('rejects negative offset', () => {
    expect(() => agentExecutionStepsQuerySchema.parse({ agentId: 'test', offset: '-1' })).toThrow();
  });
});

describe('agentThreadMessagesQuerySchema', () => {
  it('uses defaults when not provided', () => {
    const result = agentThreadMessagesQuerySchema.parse({ agentId: 'test' });
    expect(result.page).toBe(0);
    expect(result.perPage).toBe(20);
  });

  it('accepts custom page and perPage', () => {
    const result = agentThreadMessagesQuerySchema.parse({
      agentId: 'test',
      page: '5',
      perPage: '50',
    });
    expect(result.page).toBe(5);
    expect(result.perPage).toBe(50);
  });

  it('rejects perPage below 1', () => {
    expect(() => agentThreadMessagesQuerySchema.parse({ agentId: 'test', perPage: '0' })).toThrow();
  });

  it('rejects perPage above 100', () => {
    expect(() =>
      agentThreadMessagesQuerySchema.parse({ agentId: 'test', perPage: '101' }),
    ).toThrow();
  });

  it('rejects negative page', () => {
    expect(() => agentThreadMessagesQuerySchema.parse({ agentId: 'test', page: '-1' })).toThrow();
  });
});

describe('agentConversationMessagesQuerySchema', () => {
  it('parses valid input with all fields', () => {
    const result = agentConversationMessagesQuerySchema.parse({
      agentId: 'agent-1',
      provider: 'openai',
      targetKey: 'channel-abc',
      limit: '50',
      offset: '10',
    });
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(10);
  });

  it('uses defaults for limit and offset', () => {
    const result = agentConversationMessagesQuerySchema.parse({
      agentId: 'agent-1',
      provider: 'openai',
      targetKey: 'channel-abc',
    });
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });
});

describe('roleToolPermissionSchema', () => {
  it('parses valid permission with roleId and toolId', () => {
    const result = roleToolPermissionSchema.parse({
      roleId: 'role-1',
      toolId: 'tool-1',
    });
    expect(result.roleId).toBe('role-1');
    expect(result.toolId).toBe('tool-1');
  });

  it('rejects missing roleId', () => {
    expect(() => roleToolPermissionSchema.parse({ toolId: 'tool-1' })).toThrow();
  });

  it('rejects missing toolId', () => {
    expect(() => roleToolPermissionSchema.parse({ roleId: 'role-1' })).toThrow();
  });

  it('rejects empty roleId', () => {
    expect(() => roleToolPermissionSchema.parse({ roleId: '', toolId: 'tool-1' })).toThrow();
  });
});

describe('roleWorkflowPermissionSchema', () => {
  it('parses valid permission with roleId and workflowId', () => {
    const result = roleWorkflowPermissionSchema.parse({
      roleId: 'role-1',
      workflowId: 'wf-1',
    });
    expect(result.roleId).toBe('role-1');
    expect(result.workflowId).toBe('wf-1');
  });

  it('rejects missing roleId', () => {
    expect(() => roleWorkflowPermissionSchema.parse({ workflowId: 'wf-1' })).toThrow();
  });
});

describe('createRoleSchema', () => {
  it('parses valid role with minimal fields', () => {
    const result = createRoleSchema.parse({ name: 'Editor' });
    expect(result.name).toBe('Editor');
    expect(result.description).toBeUndefined();
    expect((result as any).capabilities).toBeUndefined();
    expect((result as any).toolPermissions).toBeUndefined();
  });

  it('parses valid role with all optional fields', () => {
    const result = createRoleSchema.parse({
      name: 'Admin',
      description: 'Full access',
      capabilities: [],
      toolPermissions: [],
    });
    expect(result.name).toBe('Admin');
    expect(result.description).toBe('Full access');
  });

  it('rejects missing name', () => {
    expect(() => createRoleSchema.parse({ description: 'test' })).toThrow();
  });
});

describe('topUpAgentContractSchema', () => {
  it('parses valid top-up with USD amount', () => {
    const result = topUpAgentContractSchema.parse({
      agentId: 'agent-1',
      amountUsd: 50,
    });
    expect(result.agentId).toBe('agent-1');
    expect(result.amountUsd).toBe(50);
  });

  it('rejects negative amountUsd', () => {
    expect(() => topUpAgentContractSchema.parse({ agentId: 'agent-1', amountUsd: -10 })).toThrow();
  });

  it('rejects amountUsd of zero', () => {
    expect(() => topUpAgentContractSchema.parse({ agentId: 'agent-1', amountUsd: 0 })).toThrow();
  });

  it('accepts string input for amountUsd (coerced)', () => {
    const result = topUpAgentContractSchema.parse({
      agentId: 'agent-1',
      amountUsd: '75.50',
    });
    expect(result.amountUsd).toBeCloseTo(75.5);
  });
});

describe('hireAgentSchema', () => {
  it('parses valid hire with required fields', () => {
    const result = hireAgentSchema.parse({
      hiringRequest: 'I need a developer agent to help with our project.',
      weeklyBudgetUsd: 100,
    });
    expect(result.hiringRequest).toBe('I need a developer agent to help with our project.');
    expect(result.weeklyBudgetUsd).toBe(100);
  });

  it('accepts optional additionalContext', () => {
    const result = hireAgentSchema.parse({
      hiringRequest: 'Need a designer',
      weeklyBudgetUsd: 50,
      additionalContext: 'The agent should have design experience.',
    });
    expect(result.additionalContext).toBe('The agent should have design experience.');
  });

  it('rejects missing hiringRequest', () => {
    expect(() => hireAgentSchema.parse({ weeklyBudgetUsd: 100 })).toThrow();
  });

  it('rejects empty hiringRequest', () => {
    expect(() => hireAgentSchema.parse({ hiringRequest: '', weeklyBudgetUsd: 100 })).toThrow();
  });

  it('rejects missing weeklyBudgetUsd', () => {
    expect(() => hireAgentSchema.parse({ hiringRequest: 'test' })).toThrow();
  });

  it('rejects zero or negative budget', () => {
    expect(() => hireAgentSchema.parse({ hiringRequest: 'test', weeklyBudgetUsd: 0 })).toThrow();
    expect(() => hireAgentSchema.parse({ hiringRequest: 'test', weeklyBudgetUsd: -10 })).toThrow();
  });
});

describe('terminateAgentSchema', () => {
  it('parses valid terminate with only agentId', () => {
    const result = terminateAgentSchema.parse({ agentId: 'agent-1' });
    expect(result.agentId).toBe('agent-1');
  });

  it('rejects missing agentId', () => {
    expect(() => terminateAgentSchema.parse({})).toThrow();
  });
});

describe('changeAgentRoleSchema', () => {
  it('parses valid change with agentId and roleId', () => {
    const result = changeAgentRoleSchema.parse({ agentId: 'agent-1', roleId: 'role-2' });
    expect(result.agentId).toBe('agent-1');
    expect(result.roleId).toBe('role-2');
  });

  it('rejects missing agentId', () => {
    expect(() => changeAgentRoleSchema.parse({ roleId: 'role-2' })).toThrow();
  });

  it('rejects missing roleId', () => {
    expect(() => changeAgentRoleSchema.parse({ agentId: 'agent-1' })).toThrow();
  });
});
