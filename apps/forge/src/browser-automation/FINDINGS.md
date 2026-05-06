# Browser Automation Service — Findings Report (#1593)

## Overview

The browser-automation service is a Playwright-based module (`apps/forge/src/browser-automation/`) that provides per-agent browser isolation for agents that need web interaction capabilities. It was introduced as Spike #1037.

---

## Architecture

### Service Layer (`service.ts`)

`createBrowserAutomationService()` creates an in-process service with:

- **Per-agent browser instances**: One `playwright.Browser` per agent, stored in `agentBrowsers` Map
- **Per-navigation contexts**: Each `navigate()` call creates a fresh `BrowserContext` for cookie/storage isolation
- **Session management**: `BrowserPageSession` tracks page, context, pageId, timestamps
- **Idle cleanup**: `IDLE_BROWSER_CLEANUP_MS = 30 min` — background job closes idle browsers
- **Page lifetime limits**: `MAX_PAGE_LIFETIME_MS = 5 min`, `MAX_CONCURRENT_PAGES = 2` per session
- **Screenshot/DOM support**: Optional screenshot and DOM element extraction

### Tools Layer (`tools.ts`)

`createBrowserTools(service, agentId)` wraps the service with 6 agent-facing tools:
- `browser_navigate(url, waitForSelector?, timeoutMs?)`
- `browser_click(selector, pageId?)`
- `browser_fill(selector, value, pageId?)`
- `browser_screenshot(pageId?)`
- `browser_query(selector, pageId?)`
- `browser_wait(selector, timeoutMs?, pageId?)`

### Test Coverage

- `service.test.ts`: 9 tests (serializeA11yTree, session lifecycle, error handling)
- `tools.test.ts`: 8 tests (each tool calls through to service correctly)
- **All 17 tests pass**

---

## Key Implementation Decisions

### In-Process Browser (not separate process)
Rationale from spike doc: simpler MVP, no network/IPC overhead, Playwright's BrowserContext API already provides full isolation.

### Isolation Strategy
- Agent → Browser instance (long-lived, shared within agent)
- Navigation → BrowserContext (per navigation, isolated cookies/storage)
- Page → within context (multiple pages per context, limited to 2)

---

## Current State

### Integration Points
- **Not yet integrated** into any agent or route
- No imports from other modules (only `playwright` as external dep)
- `BrowserAutomationService` and `BrowserTools` types exported but not instantiated anywhere

### Configuration
- `screenshotDir`: directory for screenshots
- `domDir`: directory for DOM dumps  
- `maxConcurrentPages`: default 2
- `navigationTimeoutMs`: default 30s

---

## Potential Issues / Risks

### 1. Resource Leaks — Unclosed Contexts
In `navigate()`, if an error occurs after `browser.newContext()` but before session storage, the context may not be closed. The current `catch` block only closes context on the error path, but the `page` and `context` objects persist in the session. No explicit cleanup for failed navigations.

### 2. No Hard Limit on Agent Browsers
`agentBrowsers` Map grows with each new agent. The idle cleanup only runs periodically and only closes the browser when idle > 30 min. If many agents are created and not reused, this could accumulate browser processes.

### 3. Screenshot/DOM Writing Not Covered in Tests
`writeFile` calls for screenshot and DOM dump are present in code but not tested. Could fail silently or throw in production.

### 4. `accessibility.snapshot()` is Limited
Playwright's `accessibility.snapshot()` provides a serialized tree but only captures the current viewport. Not all interactive elements may be in the accessibility tree if they're outside viewport or in iframes.

### 5. No Retry / Backoff on Navigation
Failed navigations return `{ error: String(err) }` — agent has no built-in retry logic and no distinction between transient (timeout) vs permanent (404) errors.

### 6. No URL Validation
`navigate()` accepts any URL string. Malformed or `file://` URLs could cause unexpected behavior.

### 7. `playwright` Not in Dependencies
The package uses `playwright` directly but needs to be verified as a dependency of forge-app.

---

## Recommendations

1. **Add explicit context cleanup on error** — ensure `context.close()` is called in all error paths
2. **Add agent browser count limit** — cap max concurrent browser instances
3. **Add screenshot/DOM error handling** — wrap file writes in try/catch, return error in result
4. **Add URL validation** — validate scheme (https/http only), reject `file://` and `javascript:`
5. **Add navigation retry with exponential backoff** — 2-3 retries for transient failures
6. **Add metrics** — track active browsers, sessions, navigation success/failure rates
7. **Consider external browser process** — if agents scale, in-process browser per agent may cause memory pressure. A separate browser service with IPC could be more resilient.

---

## Summary

The browser-automation service is a well-structured MVP with solid isolation boundaries and good test coverage (17 tests). It is not yet integrated into any agent. Main risks are around resource cleanup and error handling for side effects (file writes, network). The architecture decision to use in-process browsers is pragmatic for MVP but may need revisiting at scale.
