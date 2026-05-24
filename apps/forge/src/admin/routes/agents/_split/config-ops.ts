/**
 * Agent Config Operations — extracted from write-ops.ts
 */

import { z as _z } from 'zod';
import { sql } from 'drizzle-orm';
import { forgeDebug } from '../../debug';
import { jsonResponse, parseJsonBody } from '../../index';
import { reloadAgentIfLoaded } from '../../../../capabilities/runtime';
import {
  updateAgentGitHubManifestConfigSchema,
  updateAgentConfigSchema,
} from '../../schemas/agents';
import type { HttpHandler } from '../../../../http/server';
import { agents } from '../../../../database/schema';
import type { Database } from '../../../../database/schema';
import type { AgentLoaderConfig } from '../../../../agents/agent-loader';
import type { GitHubAppManager } from '../../../../github/manager';

import { errorMsg } from '../../../../agents/agent-runner-error-formatting';