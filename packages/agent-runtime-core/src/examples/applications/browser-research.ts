import type { AgentRuntimeOptions } from '../../core/runtime.js';
import type { BrowserGateway } from '../../integrations/gateways/browser.js';
import { z } from 'zod';

import { createRuntimeHost } from '../../integrations/hosts/runtime-host.js';

export type BrowserResearchApplicationOptions = {
  runtime: AgentRuntimeOptions;
  browser: BrowserGateway;
};

export function createBrowserResearchApplication(
  options: BrowserResearchApplicationOptions,
) {
  const host = createRuntimeHost({
    runtime: options.runtime,
  });
  let sessionPromise: Promise<Awaited<ReturnType<BrowserGateway['createSession']>>> | null = null;

  const getSession = async (sessionOptions?: Parameters<BrowserGateway['createSession']>[0]) => {
    if (!sessionPromise) {
      sessionPromise = options.browser.createSession(sessionOptions);
    }

    return sessionPromise;
  };

  host.runtime.registerAction({
    name: 'browser_navigate',
    description: 'Navigate the shared browser session to a URL.',
    inputSchema: z.object({
      url: z.string().url(),
    }),
    async execute(input) {
      const session = await getSession();
      await session.navigate(input.url);
      return session.snapshot();
    },
  });
  host.runtime.registerAction({
    name: 'browser_click',
    description: 'Click a target in the shared browser session.',
    inputSchema: z.object({
      target: z.string().min(1),
    }),
    async execute(input) {
      const session = await getSession();
      await session.click(input.target);
      return session.snapshot();
    },
  });
  host.runtime.registerAction({
    name: 'browser_type',
    description: 'Type text into a target in the shared browser session.',
    inputSchema: z.object({
      target: z.string().min(1),
      text: z.string(),
    }),
    async execute(input) {
      const session = await getSession();
      await session.type(input.target, input.text);
      return session.snapshot();
    },
  });
  host.runtime.registerAction({
    name: 'browser_snapshot',
    description: 'Read the current page snapshot from the shared browser session.',
    inputSchema: z.object({}),
    async execute() {
      const session = await getSession();
      return session.snapshot();
    },
  });
  host.runtime.registerAction({
    name: 'browser_open_session',
    description: 'Open or replace the shared browser session with specific headers, user agent, or viewport.',
    inputSchema: z.object({
      userAgent: z.string().optional(),
      viewport: z.object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      }).optional(),
      headers: z.record(z.string(), z.string()).optional(),
    }),
    async execute(input) {
      if (sessionPromise) {
        const previousSession = await sessionPromise;
        await previousSession.close();
      }

      sessionPromise = options.browser.createSession(input);
      const session = await sessionPromise;
      return {
        sessionId: session.id,
      };
    },
  });
  host.runtime.registerAction({
    name: 'browser_screenshot',
    description: 'Capture a screenshot from the shared browser session.',
    inputSchema: z.object({}),
    async execute() {
      const session = await getSession();
      return session.screenshot();
    },
  });
  host.runtime.registerAction({
    name: 'browser_close',
    description: 'Close the shared browser session.',
    inputSchema: z.object({}),
    async execute() {
      if (!sessionPromise) {
        return { closed: false };
      }

      const session = await sessionPromise;
      await session.close();
      sessionPromise = null;
      return { closed: true };
    },
  });

  return {
    runtime: host.runtime,
    journal: host.journal,
    notes: host.notes,
    async queueResearchTask(task: {
      id: string;
      text: string;
    }) {
      await host.runtime.dispatch({
        id: task.id,
        type: 'browser-task',
        payload: task,
      });
    },
    async inspectUrl(input: {
      id: string;
      url: string;
      headers?: Record<string, string>;
    }) {
      const session = await options.browser.createSession({
        headers: input.headers,
      });

      await session.navigate(input.url);
      const snapshot = await session.snapshot();
      sessionPromise = Promise.resolve(session);

      await host.runtime.dispatch({
        id: input.id,
        type: 'browser-page',
        payload: snapshot,
      });

      return snapshot;
    },
    async run(options: { maxSteps?: number } = {}) {
      return host.runtime.run(options);
    },
    async closeSession() {
      if (!sessionPromise) {
        return false;
      }

      const session = await sessionPromise;
      await session.close();
      sessionPromise = null;
      return true;
    },
  };
}
