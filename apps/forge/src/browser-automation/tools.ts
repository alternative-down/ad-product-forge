/**
 * Browser Automation Tools — Spike #1037
 *
 * Agent-facing tool definitions for browser automation.
 * Each tool wraps the BrowserAutomationService with agent context.
 */

import type { BrowserAutomationService, BrowserToolResult } from './service.js';

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
      return service.navigate(agentId, input.url, {
        waitForSelector: input.waitForSelector,
        timeoutMs: input.timeoutMs,
      });
    },

    /**
     * Click an element by CSS selector.
     */
    browser_click: async (input: BrowserClickInput): Promise<BrowserToolResult> => {
      return service.click(agentId, input.selector, input.pageId);
    },

    /**
     * Fill an input field.
     */
    browser_fill: async (input: BrowserFillInput): Promise<BrowserToolResult> => {
      return service.fill(agentId, input.selector, input.value, input.pageId);
    },

    /**
     * Take a screenshot and return the file path.
     */
    browser_screenshot: async (input: BrowserScreenshotInput): Promise<BrowserToolResult> => {
      return service.screenshot(agentId, input.pageId);
    },

    /**
     * Query elements by CSS selector and extract structured data.
     */
    browser_query: async (input: BrowserQueryInput): Promise<BrowserToolResult> => {
      return service.query(agentId, input.selector, input.pageId);
    },

    /**
     * Wait for an element to appear.
     */
    browser_wait: async (input: BrowserWaitInput): Promise<BrowserToolResult> => {
      return service.wait(agentId, input.selector, {
        timeoutMs: input.timeoutMs,
        pageId: input.pageId,
      });
    },
  };
}

export type BrowserTools = ReturnType<typeof createBrowserTools>;
