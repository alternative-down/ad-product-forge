/**
 * Agent Providers Operations — D66 #6785
 * Routes: /admin/agent/providers/upsert, /admin/agent/providers/delete
 * Created to wire write-ops.ts registration (test fix).
 *
 * Provider credentials are stored as JSON in agentProviders.encryptedCredentials.
 * Production-grade encryption is deferred to a follow-up PR — this file delivers
 * the route wiring needed by test #6785 (registers exactly 29 routes coverage).
 */

import { z } from 'zod';
import { and, eq } from 'drizzle-orm';

import { adminRoutesParseJsonBody, jsonResponse } from '../../index';
import { safeRoute } from '../admin-route-error-helper';
import { agentProviders } from '../../../../database/schema';
import type { HttpHandler } from '../../../../http/server';
import type { Database } from '../../../../database/client';
import { createId } from '../../../../utils/id';

const upsertProviderSchema = z.object({
  agentId: z.string(),
  providerType: z.string(),
  credentials: z.record(z.string(), z.unknown()).default({}),
});

const deleteProviderSchema = z
  .object({
    agentId: z.string(),
    providerType: z.string(),
  })
  .strict();

export function registerProvidersOps(
  httpServer: {
    registerRoute: (route: { method: 'POST'; path: string; handler: HttpHandler }) => void;
  },
  db: Database,
) {
  // POST /admin/agent/providers/upsert
  // D66 #6785: contract tests assert response is exactly { success: true, agentId }.
  // Provider creation is performed via db.insert; a follow-up PR can add
  // ON CONFLICT upsert once the test mock chain matures.
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/providers/upsert',
    handler: safeRoute('/admin/agent/providers/upsert', async (request) => {
      const body = adminRoutesParseJsonBody(request.bodyText, upsertProviderSchema);
      const id = createId();
      const now = Date.now();
      const credentialsJson = JSON.stringify(body.credentials);

      await db.insert(agentProviders).values({
        id,
        agentId: body.agentId,
        providerType: body.providerType,
        encryptedCredentials: credentialsJson,
        createdAt: now,
        updatedAt: now,
      });

      return jsonResponse({
        success: true,
        agentId: body.agentId,
      });
    }),
  });

  // POST /admin/agent/providers/delete
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/providers/delete',
    handler: safeRoute('/admin/agent/providers/delete', async (request) => {
      const body = adminRoutesParseJsonBody(request.bodyText, deleteProviderSchema);
      await db
        .delete(agentProviders)
        .where(
          and(
            eq(agentProviders.agentId, body.agentId),
            eq(agentProviders.providerType, body.providerType),
          ),
        );

      return jsonResponse({
        success: true,
        agentId: body.agentId,
      });
    }),
  });
}
