/**
 * Browser Automation Service — Spike #1037
 *
 * Playwright-based browser automation with per-agent isolation.
 * Each agent gets its own Playwright Browser instance.
 * Each navigation task gets its own BrowserContext for cookie/storage isolation.
 *
 * Decision: in-process per-agent browser (not separate process or remote service).
 * Rationale: simpler MVP, no network/IPC overhead, browser context API already
 * provides full isolation, easier to test and iterate.
 */

import { chromium } from 'playwright';
import { forgeDebug } from '@forge-runtime/core';
import type { Browser, BrowserContext, Page } from 'playwright';
import { serializeError } from '../agents/agent-runner-error-formatting';

const DEFAULT_TIMEOUT_MS = 30_000;
const _IDLE_BROWSER_CLEANUP_MS = 30 * 60 * 1_000; // 30 min
const _MAX_CONCURRENT_PAGES = 2;
const _MAX_PAGE_LIFETIME_MS = 5 * 60 * 1_000; // 5 min

export interface BrowserPageSession {
  pageId: string;
  page: Page;
  context: BrowserContext;
  createdAt: number;
  lastUsedAt: number;
}

export interface AgentBrowserInstance {
  browser: Browser;
  sessions: Map<string, BrowserPageSession>;
  lastUsedAt: number;
}

export interface BrowserToolResult {
  pageId: string;
  accessibilityTree?: string;
  screenshotPath?: string;
  elements?: Array<{ text: string; attributes: Record<string, string>; tag: string }>;
  url?: string;
  error?: string;
}

export interface BrowserAutomationConfig {
  screenshotDir?: string;
  domDir?: string;
  maxConcurrentPages?: number;
  navigationTimeoutMs?: number;
}

/**
 * Helper for extracting Playwright accessibility snapshots from a Page.
 * Typed to avoid (page as any).accessibility.snapshot() casts.
 */
export interface A11ySnapshotHelper {
  snapshot(options?: { interestingOnly?: boolean }): Promise<{
    name?: string;
    role?: string;
    children?: unknown[];
  } | null>;
}

/** Wrap a Playwright Page with an A11ySnapshotHelper. */
function toA11yHelper(page: Page): A11ySnapshotHelper {
  return page as unknown as A11ySnapshotHelper;
}

export function createBrowserAutomationService(config: BrowserAutomationConfig = {}) {
  // One Playwright browser instance per agent
  const agentBrowsers = new Map<string, AgentBrowserInstance>();
  // Track last access for idle cleanup
  const agentLastAccess = new Map<string, number>();

  async function getOrCreateBrowser(agentId: string): Promise<Browser> {
    const existing = agentBrowsers.get(agentId);
    if (existing) {
      existing.lastUsedAt = Date.now();
      agentLastAccess.set(agentId, Date.now());
      return existing.browser;
    }
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
    } catch (err) {
      forgeDebug({
        scope: 'browser-automation-service',
        level: 'error',
        agentId,
        message: `chromium.launch failed: ${String(serializeError(err))}`,
      });
      throw err;
    }
    agentBrowsers.set(agentId, {
      browser,
      sessions: new Map(),
      lastUsedAt: Date.now(),
    });
    agentLastAccess.set(agentId, Date.now());
    return browser;
  }

  function generatePageId(): string {
    return `page-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  async function navigate(
    agentId: string,
    url: string,
    options: { waitForSelector?: string; timeoutMs?: number } = {},
  ): Promise<BrowserToolResult> {
    let browser;
    try {
      browser = await getOrCreateBrowser(agentId);
    } catch (err) {
      return { pageId: 'unknown', error: String(err) };
    }
    let context: BrowserContext;
    try {
      context = await browser.newContext();
    } catch (err) {
      forgeDebug({
        scope: 'browser-automation-service',
        level: 'error',
        agentId,
        message: `newContext failed: ${String(serializeError(err))}`,
        context: { url },
      });
      return { pageId: 'unknown', error: String(err) };
    }
    const page = await context.newPage();
    const pageId = generatePageId();
    const timeout = (options.timeoutMs ??
      config.navigationTimeoutMs ??
      DEFAULT_TIMEOUT_MS) as number;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      if ((options.waitForSelector ?? '') !== '') {
        await page.waitForSelector(String(options.waitForSelector), { timeout: timeout as number });
      }

      const a11yHelper = toA11yHelper(page);
      const accessibilityTree = await a11yHelper.snapshot();

      const result: BrowserToolResult = {
        pageId,
        url: page.url(),
        accessibilityTree: serializeA11yTree(accessibilityTree),
      };

      // Store session for subsequent operations
      const session: BrowserPageSession = {
        pageId,
        page,
        context,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      };
      agentBrowsers.get(agentId)?.sessions.set(pageId, session);
      return result;
    } catch (err) {
      forgeDebug({
        scope: 'browser-automation-service',
        level: 'error',
        agentId,
        message: `navigate failed: ${String(serializeError(err))}`,
        context: { url, timeout, waitForSelector: options.waitForSelector },
      });
      await context.close();
      return { pageId, error: String(err) };
    }
  }

  async function click(
    agentId: string,
    selector: string,
    pageId?: string,
  ): Promise<BrowserToolResult> {
    const session =
      (pageId ?? '') !== '' ? agentBrowsers.get(agentId)?.sessions.get(pageId ?? '') : null;
    if (!session) {
      return { pageId: pageId ?? 'unknown', error: 'Page not found. Call navigate() first.' };
    }
    try {
      await session.page.click(selector, { timeout: DEFAULT_TIMEOUT_MS });
      session.lastUsedAt = Date.now();
      const a11yHelper = toA11yHelper(session.page);
      const tree = await a11yHelper.snapshot();
      return {
        pageId: session.pageId,
        accessibilityTree: serializeA11yTree(tree),
        url: session.page.url(),
      };
    } catch (err) {
      forgeDebug({
        scope: 'browser-automation-service',
        level: 'error',
        agentId,
        message: `click failed: ${String(serializeError(err))}`,
        context: { selector, pageId: session.pageId },
      });
      return { pageId: session.pageId, error: String(err) };
    }
  }

  async function fill(
    agentId: string,
    selector: string,
    value: string,
    pageId?: string,
  ): Promise<BrowserToolResult> {
    const session =
      (pageId ?? '') !== '' ? agentBrowsers.get(agentId)?.sessions.get(pageId ?? '') : null;
    if (!session) {
      return { pageId: pageId ?? 'unknown', error: 'Page not found. Call navigate() first.' };
    }

    try {
      await session.page.fill(selector, value, { timeout: DEFAULT_TIMEOUT_MS });
      session.lastUsedAt = Date.now();
      const a11yHelper = toA11yHelper(session.page);
      const tree = await a11yHelper.snapshot();
      return {
        pageId: session.pageId,
        accessibilityTree: serializeA11yTree(tree),
        url: session.page.url(),
      };
    } catch (err) {
      forgeDebug({
        scope: 'browser-automation-service',
        level: 'error',
        agentId,
        message: `fill failed: ${String(serializeError(err))}`,
        context: { selector, valueLength: value.length, pageId: session.pageId },
      });
      return { pageId: session.pageId, error: String(err) };
    }
  }

  async function screenshot(agentId: string, pageId?: string): Promise<BrowserToolResult> {
    const session =
      (pageId ?? '') !== '' ? agentBrowsers.get(agentId)?.sessions.get(pageId ?? '') : null;
    if (!session) {
      return { pageId: pageId ?? 'unknown', error: 'Page not found. Call navigate() first.' };
    }
    try {
      const screenshotPath = `${config.screenshotDir ?? '/tmp'}/screenshot-${Date.now()}.png`;
      await session.page.screenshot({ path: screenshotPath });
      session.lastUsedAt = Date.now();
      return {
        pageId: session.pageId,
        screenshotPath,
        url: session.page.url(),
      };
    } catch (err) {
      forgeDebug({
        scope: 'browser-automation-service',
        level: 'error',
        agentId,
        message: `screenshot failed: ${String(serializeError(err))}`,
        context: { pageId: session.pageId },
      });
      return { pageId: session.pageId, error: String(err) };
    }
  }

  async function query(
    agentId: string,
    selector: string,
    pageId?: string,
  ): Promise<BrowserToolResult> {
    const session =
      (pageId ?? '') !== '' ? agentBrowsers.get(agentId)?.sessions.get(pageId ?? '') : null;
    if (!session) {
      return { pageId: pageId ?? 'unknown', error: 'Page not found. Call navigate() first.' };
    }
    try {
      const elements = await session.page.$$(selector);
      session.lastUsedAt = Date.now();
      const extracted = await Promise.all(
        elements.slice(0, 50).map(async (el) => {
          const text = await el.textContent();
          const attributes: Record<string, string> = {};
          for (const attr of ['id', 'class', 'name', 'type', 'placeholder']) {
            try {
              attributes[attr] = (await el.getAttribute(attr)) ?? '';
            } catch {
              attributes[attr] = '';
            }
          }
          return {
            text: text ?? '',
            attributes,
            tag: await el.evaluate((node) => node.tagName.toLowerCase()),
          };
        }),
      );
      return {
        pageId: session.pageId,
        elements: extracted,
        url: session.page.url(),
      };
    } catch (err) {
      forgeDebug({
        scope: 'browser-automation-service',
        level: 'error',
        agentId,
        message: `query failed: ${String(serializeError(err))}`,
        context: { selector, pageId: session.pageId },
      });
      return { pageId: session.pageId, error: String(err) };
    }
  }

  async function wait(
    agentId: string,
    selector: string,
    options: { timeoutMs?: number; pageId?: string } = {},
  ): Promise<BrowserToolResult> {
    const session =
      (options.pageId ?? '') !== ''
        ? agentBrowsers.get(agentId)?.sessions.get(options.pageId ?? '')
        : null;
    if (!session) {
      return {
        pageId: options.pageId ?? 'unknown',
        error: 'Page not found. Call navigate() first.',
      };
    }
    const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    try {
      await session.page.waitForSelector(selector, { timeout });
      session.lastUsedAt = Date.now();
      const a11yHelper = toA11yHelper(session.page);
      const tree = await a11yHelper.snapshot();
      return {
        pageId: session.pageId,
        accessibilityTree: serializeA11yTree(tree),
        url: session.page.url(),
      };
    } catch (err) {
      forgeDebug({
        scope: 'browser-automation-service',
        level: 'error',
        agentId,
        message: `wait failed: ${String(serializeError(err))}`,
        context: { selector, timeout, pageId: session.pageId },
      });
      return { pageId: session.pageId, error: String(err) };
    }
  }

  async function closePage(agentId: string, pageId: string): Promise<void> {
    const instance = agentBrowsers.get(agentId);
    const session = instance?.sessions.get(pageId ?? '');
    if (!session) {
      return;
    }
    try {
      await session.context.close();
      instance?.sessions.delete(pageId);
    } catch (err) {
      forgeDebug({
        scope: 'browser-automation-service',
        level: 'error',
        agentId,
        message: `closePage failed: ${String(serializeError(err))}`,
        context: { pageId },
      });
      instance?.sessions.delete(pageId);
    }
  }

  async function closeAgentBrowser(agentId: string): Promise<void> {
    const instance = agentBrowsers.get(agentId);
    if (!instance) {
      return;
    }
    try {
      await instance.browser.close();
      agentBrowsers.delete(agentId);
      agentLastAccess.delete(agentId);
    } catch (err) {
      forgeDebug({
        scope: 'browser-automation-service',
        level: 'error',
        agentId,
        message: `closeAgentBrowser failed: ${String(serializeError(err))}`,
      });
      agentBrowsers.delete(agentId);
      agentLastAccess.delete(agentId);
    }
  }

  return {
    navigate,
    click,
    fill,
    screenshot,
    query,
    wait,
    closePage,
    closeAgentBrowser,
  };
}

/**
 * Serialize AX tree to readable text format for agent context.
 */
function serializeA11yTree(
  node: { name?: string; role?: string; children?: unknown[] } | null,
): string {
  if (!node) return '(empty page)';
  const lines: string[] = [];
  function walk(n: { name?: string; role?: string; children?: unknown[] }, depth: number) {
    const indent = '  '.repeat(depth);
    if ((n.name ?? '') !== '' || (n.role ?? '') !== '') {
      lines.push(`${indent}[${n.role ?? 'unknown'}]${(n.name ?? '') !== '' ? ` ${n.name}` : ''}`);
    }
    if (n.children) {
      for (const child of n.children) {
        walk(child as typeof n, depth + 1);
      }
    }
  }
  walk(node, 0);
  return lines.join('\n').slice(0, 8000); // Truncate to avoid context bloat
}

export type BrowserAutomationService = ReturnType<typeof createBrowserAutomationService>;
