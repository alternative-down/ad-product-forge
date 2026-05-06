/**
 * Browser Automation Tools — Spike #1037
 *
 * Agent-facing tool definitions for browser automation.
 * Each tool wraps the BrowserAutomationService with agent context.
 */

import { forgeDebug } from '@forge-runtime/core';
import type { BrowserAutomationService, BrowserToolResult } from './service';

/**
 * Tool definitions for agent consumption.
 * These are the minimal viable operations from the architecture doc.
 */

export interface BrowserNavigateInput {
  url: string;
  waitForSelector?: string;
  timeoutMs?: number;
}

export interface BrowserClickInput {
  selector: string;
  pageId?: string;
}

export interface BrowserFillInput {
  selector: string;
  value: string;
  pageId?: string;
}

export interface BrowserScreenshotInput {
  pageId?: string;
}

export interface BrowserQueryInput {
  selector: string;
  pageId?: string;
}

export interface BrowserWaitInput {
  selector: string;
  timeoutMs?: number;
  pageId?: string;
}

export function createBrowserTools(
  service: BrowserAutomationService,
  agentId: string,
) {
  return {
    /**
     * Navigate to a URL. Returns accessibility tree for agent context.
     */
    browser_navigate: async (input: BrowserNavigateInput): Promise<BrowserToolResult> => {
      try {
        return await service.navigate(agentId, input.url, {
          waitForSelector: input.waitForSelector,
          timeoutMs: input.timeoutMs,
        });
      } catch (err) {
        forgeDebug({
          scope: 'browser-automation-tools',
          level: 'error',
          agentId,
          message: `browser_navigate failed: ${err instanceof Error ? err.message : String(err)}`,
          context: { url: input.url, waitForSelector: input.waitForSelector },
        });
        throw err;
      }
    },

    /**
     * Click an element by CSS selector.
     */
    browser_click: async (input: BrowserClickInput): Promise<BrowserToolResult> => {
      try {
        return await service.click(agentId, input.selector, input.pageId);
      } catch (err) {
        forgeDebug({
          scope: 'browser-automation-tools',
          level: 'error',
          agentId,
          message: `browser_click failed: ${err instanceof Error ? err.message : String(err)}`,
          context: { selector: input.selector, pageId: input.pageId },
        });
        throw err;
      }
    },

    /**
     * Fill an input field.
     */
    browser_fill: async (input: BrowserFillInput): Promise<BrowserToolResult> => {
      try {
        return await service.fill(agentId, input.selector, input.value, input.pageId);
      } catch (err) {
        forgeDebug({
          scope: 'browser-automation-tools',
          level: 'error',
          agentId,
          message: `browser_fill failed: ${err instanceof Error ? err.message : String(err)}`,
          context: { selector: input.selector, pageId: input.pageId },
        });
        throw err;
      }
    },

    /**
     * Take a screenshot and return the file path.
     */
    browser_screenshot: async (input: BrowserScreenshotInput): Promise<BrowserToolResult> => {
      try {
        return await service.screenshot(agentId, input.pageId);
      } catch (err) {
        forgeDebug({
          scope: 'browser-automation-tools',
          level: 'error',
          agentId,
          message: `browser_screenshot failed: ${err instanceof Error ? err.message : String(err)}`,
          context: { pageId: input.pageId },
        });
        throw err;
      }
    },

    /**
     * Query elements by CSS selector and extract structured data.
     */
    browser_query: async (input: BrowserQueryInput): Promise<BrowserToolResult> => {
      try {
        return await service.query(agentId, input.selector, input.pageId);
      } catch (err) {
        forgeDebug({
          scope: 'browser-automation-tools',
          level: 'error',
          agentId,
          message: `browser_query failed: ${err instanceof Error ? err.message : String(err)}`,
          context: { selector: input.selector, pageId: input.pageId },
        });
        throw err;
      }
    },

    /**
     * Wait for an element to appear.
     */
    browser_wait: async (input: BrowserWaitInput): Promise<BrowserToolResult> => {
      try {
        return await service.wait(agentId, input.selector, {
          timeoutMs: input.timeoutMs,
          pageId: input.pageId,
        });
      } catch (err) {
        forgeDebug({
          scope: 'browser-automation-tools',
          level: 'error',
          agentId,
          message: `browser_wait failed: ${err instanceof Error ? err.message : String(err)}`,
          context: { selector: input.selector, timeoutMs: input.timeoutMs, pageId: input.pageId },
        });
        throw err;
      }
    },
  };
}

export type BrowserTools = ReturnType<typeof createBrowserTools>;