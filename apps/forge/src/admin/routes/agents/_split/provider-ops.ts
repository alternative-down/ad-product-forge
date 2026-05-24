/**
 * Agent Provider Operations — extracted from write-ops.ts
 */

import { z } from 'zod';
import { forgeDebug } from '../../debug';
import { jsonResponse, parseJsonBody } from '../../index';
import type { HttpHandler } from '../../../../http/server';

const upsertAgentProviderSchema = z
  .object({
    agentId: z.string(),
    providerType: z.string(),
    credentials: z.record(z.string(), z.string()),
  })
  .strict();

const deleteAgentProviderSchema = z
  .object({
    agentId: z.string(),
    providerType: z.string(),
  })
  .strict();

import { errorMsg } from '../../../../agents/agent-runner-error-formatting';