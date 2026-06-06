import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { registerAgentProviderMcpRoutes } from './provider-mcp';

// Tripwire (regression for #5583): the real implementation of
// `registerAgentProviderMcpRoutes` MUST live in `./provider-mcp` and MUST NOT
// be re-introduced as a no-op stub in `./detail-read`. The 21-day prod-broken
// state (#5583) was caused by Kaelen adding a stub to detail-read.ts
// (commit 171146dfd, May 16) to silence TS, then deleting the real
// provider-mcp.ts (commit ca5a07a11, May 23) — leaving 8 routes as a no-op.
//
// This test fails if either of these regressions returns:
//  1. detail-read.ts re-exports registerAgentProviderMcpRoutes (stub re-add)
//  2. provider-mcp.ts no longer exports registerAgentProviderMcpRoutes (real
//     impl removed without restoring the stub location)

const STUB_PATTERN = /export\s+function\s+registerAgentProviderMcpRoutes/;

describe('agent provider route registration tripwire (regression for #5583)', () => {
  it('provider-mcp.ts exports registerAgentProviderMcpRoutes (real impl present)', () => {
    expect(typeof registerAgentProviderMcpRoutes).toBe('function');
  });

  it('detail-read.ts does NOT re-introduce the no-op stub', () => {
    const src = readFileSync(join(__dirname, 'detail-read.ts'), 'utf8');
    expect(src).not.toMatch(STUB_PATTERN);
  });
});
