# Browser Automation Architecture — Spike #1037

> Decision date: 2026-05-03
> Status: spike recommendation — not yet implemented
> PR: #1242

---

## Context

`docs/planning/prd-07-browser-service.md` marks browser automation as "needs investigation." The PRD raises valid concerns about sandbox compatibility, isolation, session management, and whether Playwright runs in-process, locally, or as a dedicated service.

This document resolves those questions and provides a concrete first-version recommendation.

---

## Decision: Playwright in-process, per-agent browser context, with worker-thread isolation

### Rationale

| Option | Isolation | Complexity | Performance | Reliability | Verdict |
|--------|-----------|------------|-------------|-------------|---------|
| In-process (shared browser) | ❌ No | ✅ Low | ✅ Best | ❌ Crash affects runtime | Rejected |
| In-process (per-agent context) | ✅ Per-context | ✅ Low | ✅ Best | ✅ Crash isolated per context | **Selected** |
| Separate local process | ✅ Full | ⚠️ Medium | ⚠️ IPC overhead | ✅ Full isolation | Deferred |
| Remote service/container | ✅ Full | ❌ High | ⚠️ Network | ✅ Full isolation | Deferred |

**In-process with per-agent browser contexts** is the right first step because:
- No additional process or network boundary needed for MVP
- Playwright's browser context API already provides cookie/localStorage isolation
- The worker-thread model keeps browser crashes isolated from the main Node.js event loop
- Easier to ship, test, and iterate on than a microservice

---

## Architecture

### Component model

```
Agent Workspace
    └── browser-automation/service.ts
            ├── per-agent Playwright browser instance
            │       ├── one BrowserContext per agent (isolated cookies/storage)
            │       └── one Page per navigation task
            └── exposes tools.ts for agent-facing operations
```

### Isolation model

Each agent gets its own `Browser` instance. Within the browser, each concurrent task gets its own `BrowserContext`. This gives:

- **Cookies/storage**: isolated per agent via separate context
- **Concurrency limit**: 1 browser per agent, 1 page per task, max N tasks queued
- **Cleanup**: browser context is closed on agent shutdown, or after configurable idle timeout
- **Crash isolation**: a crashed page cannot affect other pages or the browser itself (browser is auto-restarted)

### Concurrency and timeouts

| Parameter | Value | Rationale |
|-----------|-------|----------|
| Max concurrent pages per agent | 2 | Prevent memory exhaustion on busy agents |
| Page navigation timeout | 30s | Catch hanging navigations |
| Default screenshot timeout | 5s | Fast feedback |
| Idle browser cleanup | 30min after last use | Prevent resource leaks |
| Max page lifetime | 5min | Prevent runaway pages |

### What the agent receives

| Output | When | Format |
|--------|------|--------|
| Accessibility tree | Every navigation/step | Structured text (AX tree) |
| Screenshot | On demand or on interaction | PNG, stored in workspace |
| DOM snapshot | On demand | Textual HTML (no dynamic frames) |
| Extracted data | After interaction | Structured JSON via querySelector |

**Accessibility tree** is the primary output because:
- It is structured, searchable, and concise
- It works across all page types (SPA, SSR, JS-heavy)
- Agents can query it programmatically without parsing HTML
- Playwright's `accessibility.snapshot()` is fast and stable

Screenshots are on-demand to avoid inflating context with base64 data.

### Artifact management

- Screenshots are written to `{workspacePath}/browser-artifacts/screenshots/{page-id}/{timestamp}.png`
- DOM snapshots are written to `{workspacePath}/browser-artifacts/dom/{page-id}/{timestamp}.html`
- Cleanup policy: artifacts older than 24h are purged; max 50 screenshots per agent per day
- Cleanup runs on agent startup and periodically during run

### Integration with existing tools

The browser automation module plugs into the existing workspace and tool system:

- **Workspace filesystem**: artifacts written to workspace path, accessible to agent
- **Tools**: exposed as agent tools alongside workspace filesystem operations
- **No new provider needed**: browser automation is a tool capability, not a communication provider

### Risks and limits

| Risk | Severity | Mitigation |
|------|----------|------------|
| Browser crash kills agent | Medium | Restart on crash, limit concurrent pages |
| Memory leak from unreleased pages | Medium | Auto-close after timeout, max page lifetime |
| Infinite navigation loops | Low | Hard timeout on navigation, max steps per run |
| JavaScript-heavy page never loads | Medium | Configurable waitForSelector fallback |
| Headless browser not available in all environments | High | Detect and surface clear error message; document Docker requirement |
| Credentials/cookies from one agent leak to another | Low | Per-agent browser context — no shared state |

---

## Agent-facing API (minimum viable)

### Tools

```
browser_navigate(url: string, waitForSelector?: string) → { pageId, accessibilityTree, url }
browser_click(selector: string, pageId?: string) → { accessibilityTree }
browser_fill(selector: string, value: string, pageId?: string) → { accessibilityTree }
browser_screenshot(pageId?: string) → { screenshotPath }
browser_query(selector: string, pageId?: string) → { elements: [{ text, attributes, tag }] }
browser_get_dom(pageId?: string) → { html }
browser_wait(selector: string, timeoutMs?: number, pageId?: string) → { accessibilityTree }
```

### Tool arguments

All selectors accept CSS selectors. `pageId` defaults to current active page.

### Tool response shape

```typescript
type BrowserToolResult = {
  pageId: string;
  accessibilityTree?: string;     // AX tree text
  screenshotPath?: string;       // workspace-relative path
  elements?: BrowserElement[];   // extracted structured data
  url?: string;
};
```

---

## Next steps (implementation issues to create)

1. **Implement**: Playwright service with per-agent browser contexts
2. **Implement**: Agent tools (navigate, click, fill, screenshot, query, wait)
3. **Implement**: Artifact cleanup and storage policy
4. **Document**: Docker environment requirement for browser binaries
5. **Test**: End-to-end test with a real SPA (e.g. GitHub login flow)

---

## Prototype delivered

This spike includes a prototype at `apps/forge/src/browser-automation/`:
- `service.ts` — Playwright manager with per-agent browser/context isolation
- `tools.ts` — agent-facing tool definitions
- `tools.test.ts` — basic tool execution tests

The prototype demonstrates: navigation, accessibility tree extraction, element click, and screenshot.
