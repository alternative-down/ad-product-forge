/**
 * Routing Ops — buildProvisioning, registerAgentRoutes,
 * handleRegisterPage, handleManifestCallback, handleSetupCallback, handleWebhook
 */
import { errorMsg } from '../../agents/error-formatting';
import { verifyWebhookSignature } from '../../webhooks/handler-helpers';

import type { HttpRequest } from '../../http/server';
import { App, Octokit } from 'octokit';
import type { OpsContext } from './context';
import type { GitHubAppCredentials, GitHubAppProvisioning } from '../types';
import { LogLevel } from '../../types/log-level';
import { githubAppInfoResponseSchema, githubAppManifestConversionResponseSchema } from '../types';

// Subset of AppProvisioningOps fields actually used by routing.
// createAppName/nanoid/normalizeManifestConfig/DEFAULT_GITHUB_APP_MANIFEST_CONFIG
// are on ctx, not AppProvisioningOps. routeCleanups does not exist on AppProvisioningOps.
type RoutingOpsDeps = {
  getGlobalConfig: OpsContext['getGlobalConfig'];
  createAppName: (payload: unknown) => string;
  getCredentials: (agentId: string) => Promise<GitHubAppCredentials | null>;
  saveCredentials: (agentId: string, credentials: GitHubAppCredentials) => Promise<void>;
  buildProvisioning: (agentId: string, credentials: GitHubAppCredentials) => GitHubAppProvisioning;
};

export function createRoutingOps(ctx: OpsContext, routingDeps?: Partial<RoutingOpsDeps>) {
  const routingOpsDebug = (
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): void => {
    ctx.forgeDebug({ scope: 'github-ops', level, message, context });
  };

  // Webhook delivery deduplication (Closes #6771): store recently-seen
  // x-github-delivery IDs in a per-process TTL cache so GitHub's
  // at-least-once redelivery semantics do not trigger duplicate notifications
  // or duplicate downstream actions.
  //
  // The cache distinguishes three claim states via the value type:
  //   - fresh (no entry): peer request has not yet started; caller should
  //     proceed with processing and transition to 'committed' on success or
  //     release the entry on failure.
  //   - in-flight (DELIVERING sentinel): a peer request is currently
  //     processing this delivery. Do NOT confirm success; respond with a
  //     retry-preserving status so GitHub's own retry semantics still apply.
  //   - committed (number timestamp): the notification/event was persisted.
  //     Subsequent deliveries within the TTL window can be acked (200 ok)
  //     without re-processing.
  //
  // On any processing failure path the entry is RELEASED so a legitimate
  // GitHub retry can claim it fresh. Without that release, a failed first
  // request would silently swallow all retries for the rest of the TTL.
  // Whitelist of relevant event types (Closes #6772 MEDIUM sub-item of #6760):
  // only PR lifecycle and review events trigger agent wake notifications.
  // Other events (push, star, fork, member, delete, create, etc.) are
  // acknowledged with 200 OK and a 'webhook_filtered' debug log to keep
  // notifications focused on actionable items.
  const RELEVANT_WEBHOOK_EVENTS: ReadonlySet<string> = new Set([
    'pull_request',
    'pull_request_review',
    'pull_request_review_comment',
    'issue_comment',
    'check_run',
  ]);
  const WEBHOOK_DEDUP_TTL_MS = 60 * 60 * 1000; // 1h — matches the spec minimum.
  const DELIVERING = Symbol('webhook-delivering');
  type WebhookClaimValue = number | typeof DELIVERING;
  type WebhookClaimState = 'fresh' | 'in-flight' | 'committed';
  const webhookDeliveryCache = new Map<string, WebhookClaimValue>();

  function tryClaimWebhookDelivery(agentId: string, delivery: string): WebhookClaimState {
    const key = `${agentId}::${delivery}`;
    const now = Date.now();
    // Lazy cleanup: drop committed entries whose TTL has elapsed.
    for (const [cachedKey, value] of webhookDeliveryCache) {
      if (typeof value === 'number' && now - value >= WEBHOOK_DEDUP_TTL_MS) {
        webhookDeliveryCache.delete(cachedKey);
      }
    }
    const existing = webhookDeliveryCache.get(key);
    if (existing === undefined) {
      webhookDeliveryCache.set(key, DELIVERING);
      return 'fresh';
    }
    if (existing === DELIVERING) {
      return 'in-flight'; // a peer request is currently processing this delivery.
    }
    // existing is a committed timestamp within TTL — duplicate.
    return 'committed';
  }

  function commitWebhookDelivery(agentId: string, delivery: string): void {
    webhookDeliveryCache.set(`${agentId}::${delivery}`, Date.now());
  }

  function releaseWebhookDelivery(agentId: string, delivery: string): void {
    webhookDeliveryCache.delete(`${agentId}::${delivery}`);
  }

  function _resetWebhookDeliveryCacheForTesting(): void {
    webhookDeliveryCache.clear();
  }

  function html(status: number, body: string) {
    return { status, headers: { 'content-type': 'text/html; charset=utf-8' }, body };
  }

  function buildProvisioning(
    agentId: string,
    credentials: GitHubAppCredentials,
  ): GitHubAppProvisioning {
    if (routingDeps?.buildProvisioning) return routingDeps.buildProvisioning(agentId, credentials);
    const registrationUrl = `${ctx.config.publicBaseUrl}${ctx.getRegisterPath(agentId)}`;
    const manifestConfig = credentials.manifestConfig;
    if (credentials.status === 'created' || credentials.status === 'active') {
      return {
        agentId,
        status: credentials.status,
        registrationUrl,
        installUrl: `https://github.com/apps/${credentials.appSlug}/installations/new`,
        manifestConfig,
      };
    }
    return { agentId, status: credentials.status, registrationUrl, manifestConfig };
  }

  function registerAgentRoutes(agentId: string) {
    const cleanups = [
      ctx.config.httpServer.registerRoute({
        method: 'GET',
        path: ctx.getRegisterPath(agentId),
        handler: async () => await handleRegisterPage(agentId),
      }),
      ctx.config.httpServer.registerRoute({
        method: 'GET',
        path: ctx.getManifestCallbackPath(agentId),
        handler: async (request: HttpRequest) =>
          await handleManifestCallback(
            agentId,
            request.query.get('code'),
            request.query.get('state'),
          ),
      }),
      ctx.config.httpServer.registerRoute({
        method: 'GET',
        path: ctx.getSetupPath(agentId),
        handler: async (request: HttpRequest) =>
          await handleSetupCallback(agentId, request.query.get('installation_id')),
      }),
      ctx.config.httpServer.registerRoute({
        method: 'POST',
        path: ctx.getWebhookPath(agentId),
        handler: async (request: HttpRequest) => {
          const headers = request.headers;
          const bodyText = request.bodyText;
          return await handleWebhook(
            agentId,
            headers as Record<string, string | undefined>,
            bodyText ?? '',
          );
        },
      }),
    ];
    ctx.routeCleanups.set(agentId, cleanups);
  }

  async function handleRegisterPage(agentId: string) {
    const credentials = await ctx.getCredentials(agentId);
    if (!credentials) {
      return html(
        404,
        `<h1>GitHub App not provisioned</h1><p>No pending GitHub App configuration exists for agent ${ctx.githubEscapeHtml(agentId)}.</p>`,
      );
    }
    if (credentials.status !== 'pending') {
      return html(200, `<h1>GitHub App ${ctx.githubEscapeHtml(credentials.status)}</h1>`);
    }
    const githubConfig = await ctx.getGlobalConfig();
    const manifest = JSON.stringify({
      name: credentials.appName,
      url: githubConfig.appHomeUrl,
      redirect_url: `${ctx.config.publicBaseUrl}${ctx.getManifestCallbackPath(agentId)}`,
      setup_url: `${ctx.config.publicBaseUrl}${ctx.getSetupPath(agentId)}`,
      hook_attributes: {
        url: `${ctx.config.publicBaseUrl}${ctx.getWebhookPath(agentId)}`,
        active: true,
      },
      public: false,
      default_permissions: ctx.buildManifestPermissions(credentials.manifestConfig as never),
      default_events: ctx.buildManifestEvents(credentials.manifestConfig as never),
    });
    const action = `https://github.com/organizations/${encodeURIComponent(githubConfig.organization)}/settings/apps/new?state=${encodeURIComponent(credentials.state)}`;
    return html(
      200,
      `<!doctype html><html><body><form id="f" action="${ctx.githubEscapeHtml(action)}" method="post"><input type="hidden" name="manifest" value="${ctx.githubEscapeHtml(manifest)}" /></form><p>Redirecting…</p><script>document.getElementById('f').submit();</script></body></html>`,
    );
  }

  async function handleManifestCallback(
    agentId: string,
    code: string | null,
    state: string | null,
  ) {
    const credentials = await ctx.getCredentials(agentId);
    if (!credentials || credentials.status !== 'pending') {
      return html(404, '<h1>GitHub App registration not pending</h1>');
    }
    if (code === null || code === undefined || state !== credentials.state) {
      return html(400, '<h1>Invalid manifest callback</h1>');
    }
    // Unauthenticated Octokit is sufficient for the manifest-conversion
    // endpoint (POST /app-manifests/{code}/conversions). The previous
    // implementation instantiated an App with an empty config object and
    // cast the result to a manually-typed shape, hiding the real Octokit
    // surface (paginate, retry, hooks) and bypassing type safety.
    const anonymousOctokit = new Octokit();
    try {
      const conversionResponse = await anonymousOctokit.request(
        'POST /app-manifests/{code}/conversions',
        { code },
      );
      // Runtime-validated destructure: throws ZodError on missing fields,
      // surfaced as a 500 in the catch below.
      const {
        pem,
        id: appId,
        webhook_secret,
      } = githubAppManifestConversionResponseSchema.parse(conversionResponse.data);
      const app = new App({ appId, privateKey: pem });
      const appInfoResponse = await app.octokit.request('GET /app');
      // Runtime-validated app info: surfaces missing `name` (cast site E in
      // the previous implementation) as a 500 instead of silently persisting
      // undefined into the credentials store.
      const appInfo = githubAppInfoResponseSchema.parse(appInfoResponse.data);
      const created = {
        status: 'created' as const,
        appId,
        privateKey: pem,
        webhookSecret: webhook_secret,
        appSlug: appInfo.slug ?? 'unknown',
        appName: appInfo.name,
        manifestConfig: credentials.manifestConfig,
        createdAt: credentials.createdAt,
      };
      await ctx.saveCredentials(agentId, created);
      return html(
        200,
        `<h1>GitHub App created</h1><p>Now <a href="https://github.com/apps/${ctx.githubEscapeHtml(appInfo.slug ?? 'unknown')}/installations/new">install the app</a>.</p>`,
      );
    } catch (err) {
      routingOpsDebug('error', 'handleSetupCreate createApp failed', { error: errorMsg(err) });
      return html(500, `<h1>Failed</h1><pre>${ctx.githubEscapeHtml(String(err))}</pre>`);
    }
  }

  async function handleSetupCallback(agentId: string, installationIdValue: string | null) {
    const credentials = await ctx.getCredentials(agentId);
    if (!credentials) {
      return html(404, '<h1>GitHub App not ready</h1>');
    }
    if (credentials.status === 'pending') {
      return html(404, '<h1>GitHub App registration not complete</h1>');
    }
    if (installationIdValue === null || installationIdValue === undefined)
      return html(400, '<h1>Missing installation_id</h1>');
    const installationId = Number.parseInt(installationIdValue, 10);
    if (!Number.isInteger(installationId)) return html(400, '<h1>Invalid installation_id</h1>');
    const activeCredentials: Extract<GitHubAppCredentials, { status: 'active' }> = {
      status: 'active',
      appId: credentials.appId,
      privateKey: credentials.privateKey,
      webhookSecret: credentials.webhookSecret,
      installationId,
      appSlug: credentials.appSlug,
      appName: credentials.appName,
      manifestConfig: credentials.manifestConfig,
      createdAt: credentials.createdAt,
    };
    if (credentials.status === 'active' && credentials.installationId !== installationId) {
      routingOpsDebug('info', 'handleSetupCallback: reinstall detected, updating installationId', {
        agentId,
        oldInstallationId: credentials.installationId,
        newInstallationId: installationId,
      });
    }
    await ctx.saveCredentials(agentId, activeCredentials);
    const githubConfig = await ctx.getGlobalConfig();
    await ctx.notifications.createNotification({
      agentId,
      content: String(
        ctx.createGitHubInstallWakeContent({
          agentId,
          installationId,
          organization: githubConfig.organization,
          appName: activeCredentials.appName,
          appSlug: activeCredentials.appSlug,
          timestamp: Date.now(),
        }),
      ),
    });
    return html(200, '<h1>GitHub App installed</h1>');
  }

  async function handleWebhook(
    agentId: string,
    headers: Record<string, string | undefined>,
    bodyText: string,
  ) {
    // SECURITY (Closes #6760 P0): verify x-hub-signature-256 BEFORE any processing.
    // The previous implementation accepted unauthenticated POSTs from anyone reaching
    // the public webhook URL, allowing forged events to trigger agent wake notifications.
    // Fix uses the existing verifyWebhookSignature helper (HMAC-SHA256 + timingSafeEqual),
    // matching the pattern used by stripe.ts and asaas.ts payment providers.
    const credentials = await ctx.getCredentials(agentId);
    if (!credentials || credentials.status === 'pending') {
      routingOpsDebug('warn', 'No webhook-capable credentials for agent', { agentId });
      return html(500, '<h1>Agent credentials not configured for webhooks</h1>');
    }
    const signature = ctx.getHeader(headers, 'x-hub-signature-256');
    if (!verifyWebhookSignature(bodyText, signature, credentials.webhookSecret)) {
      routingOpsDebug('warn', 'Invalid webhook signature', { agentId });
      return html(401, '<h1>Invalid signature</h1>');
    }
    const event = ctx.getHeader(headers, 'x-github-event');
    const delivery = ctx.getHeader(headers, 'x-github-delivery');
    if (event === null || event === undefined || delivery === null || delivery === undefined)
      return html(400, '<h1>Missing webhook headers</h1>');
    // Delivery deduplication (Closes #6771): the cache has three claim states.
    //   - committed  -> 200 ok + dedup log (genuine redelivery, ack and stop).
    //   - in-flight  -> 425 Too Early + in-flight log (a peer request is still
    //     processing this delivery; do NOT confirm, preserve GitHub retry).
    //   - fresh      -> proceed; release the claim on any processing failure so
    //     a legitimate GitHub retry can re-process the delivery.
    const claimState = tryClaimWebhookDelivery(agentId, delivery);
    if (claimState === 'committed') {
      routingOpsDebug('info', 'webhook_deduped', { agentId, delivery, event });
      return html(200, 'ok');
    }
    if (claimState === 'in-flight') {
      routingOpsDebug('info', 'webhook_in_flight', { agentId, delivery, event });
      return {
        status: 425,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        body: 'In flight',
      };
    }
    // claimState === 'fresh' — claim taken; release on any failure before commit.
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(bodyText);
    } catch (err) {
      routingOpsDebug('info', 'Invalid JSON: ' + errorMsg(err));
      releaseWebhookDelivery(agentId, delivery);
      return html(400, '<h1>Invalid JSON</h1>');
    }
    if (ctx.isGitHubSelfEvent(payload)) {
      routingOpsDebug('info', 'Ignoring self event', { agentId, event });
      commitWebhookDelivery(agentId, delivery);
      return html(200, 'ok');
    }
    // Event type whitelist (Closes #6772): only PR/review/comment/check_run
    // events trigger wake notifications. Other events (push, star, fork, etc.)
    // are acked with 200 OK + webhook_filtered log so the agent is not
    // woken by noise. Re-deliveries of filtered events are still dedup'd by
    // the delivery cache above.
    if (event !== null && event !== undefined && !RELEVANT_WEBHOOK_EVENTS.has(event)) {
      routingOpsDebug('info', 'webhook_filtered', { agentId, event, delivery });
      commitWebhookDelivery(agentId, delivery);
      return html(200, 'ok');
    }
    routingOpsDebug('info', `Webhook ${event}`, { agentId, delivery });
    try {
      await ctx.notifications.createNotification({
        agentId,
        content: String(ctx.createGitHubWebhookWakeContent({ event, delivery, payload })),
      });
      commitWebhookDelivery(agentId, delivery);
      return html(202, 'Accepted');
    } catch (err) {
      // Transient failure: log + release claim + return 503 so GitHub retries
      // with exponential backoff (ND-required retry semantics, not a hard 500).
      routingOpsDebug('error', 'createNotification failed for webhook', {
        agentId,
        delivery,
        event,
        error: errorMsg(err),
      });
      releaseWebhookDelivery(agentId, delivery);
      return html(503, 'Service Unavailable');
    }
  }

  return {
    buildProvisioning,
    registerAgentRoutes,
    handleRegisterPage,
    handleManifestCallback,
    handleSetupCallback,
    handleWebhook,
  };
}
