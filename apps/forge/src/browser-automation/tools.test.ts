import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBrowserTools } from './tools';

describe('BrowserTools', () => {
  let mockService: any;

  let tools: any;

  beforeEach(() => {
    mockService = {
      navigate: vi.fn(),
      click: vi.fn(),
      fill: vi.fn(),
      screenshot: vi.fn(),
      query: vi.fn(),
      wait: vi.fn(),
    };
    tools = createBrowserTools(mockService, 'agent-1');
  });

  describe('browser_navigate', () => {
    it('passes url and options to service.navigate', async () => {
      mockService.navigate.mockResolvedValue({ pageId: 'page-1', url: 'https://example.com' });
      const result = await tools.browser_navigate({ url: 'https://example.com' });
      expect(mockService.navigate).toHaveBeenCalledWith('agent-1', 'https://example.com', {});
      expect(result.pageId).toBe('page-1');
    });

    it('passes waitForSelector option', async () => {
      mockService.navigate.mockResolvedValue({ pageId: 'page-1', url: 'https://example.com' });
      await tools.browser_navigate({ url: 'https://example.com', waitForSelector: '#content' });
      expect(mockService.navigate).toHaveBeenCalledWith('agent-1', 'https://example.com', {
        waitForSelector: '#content',
        timeoutMs: undefined,
      });
    });
  });

  describe('browser_click', () => {
    it('calls service.click with selector and pageId', async () => {
      mockService.click.mockResolvedValue({
        pageId: 'page-1',
        accessibilityTree: '[button] Submit',
      });
      const result = await tools.browser_click({ selector: '#btn', pageId: 'page-1' });
      expect(mockService.click).toHaveBeenCalledWith('agent-1', '#btn', 'page-1');
      expect(result.accessibilityTree).toBeDefined();
    });

    it('works without pageId (uses current active page)', async () => {
      mockService.click.mockResolvedValue({ pageId: 'page-1' });
      await tools.browser_click({ selector: '.item' });
      expect(mockService.click).toHaveBeenCalledWith('agent-1', '.item', undefined);
    });
  });

  describe('browser_fill', () => {
    it('passes selector, value, and pageId to service', async () => {
      mockService.fill.mockResolvedValue({ pageId: 'page-1', url: 'https://example.com' });
      await tools.browser_fill({
        selector: 'input[name=email]',
        value: 'test@example.com',
        pageId: 'page-1',
      });
      expect(mockService.fill).toHaveBeenCalledWith(
        'agent-1',
        'input[name=email]',
        'test@example.com',
        'page-1',
      );
    });
  });

  describe('browser_screenshot', () => {
    it('returns screenshot path from service', async () => {
      mockService.screenshot.mockResolvedValue({
        pageId: 'page-1',
        screenshotPath: '/tmp/shot.png',
      });
      const result = await tools.browser_screenshot({ pageId: 'page-1' });
      expect(result.screenshotPath).toBe('/tmp/shot.png');
    });
  });

  describe('browser_query', () => {
    it('returns extracted elements from service', async () => {
      mockService.query.mockResolvedValue({
        pageId: 'page-1',
        elements: [
          { tag: 'a', text: 'Link text', attributes: { href: '/page' } },
          { tag: 'span', text: 'Label', attributes: {} },
        ],
      });
      const result = await tools.browser_query({ selector: 'a, span', pageId: 'page-1' });
      expect(result.elements).toHaveLength(2);
      expect(result.elements?.[0].tag).toBe('a');
    });
  });

  describe('browser_wait', () => {
    it('passes selector, timeoutMs, pageId to service.wait', async () => {
      mockService.wait.mockResolvedValue({ pageId: 'page-1', accessibilityTree: '[dialog] Modal' });
      await tools.browser_wait({ selector: '.modal', timeoutMs: 5000, pageId: 'page-1' });
      expect(mockService.wait).toHaveBeenCalledWith('agent-1', '.modal', {
        timeoutMs: 5000,
        pageId: 'page-1',
      });
    });
  });
});
