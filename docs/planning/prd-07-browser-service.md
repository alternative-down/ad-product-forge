# PRD-33: Browser Service

**Status:** Planning
**Date:** 2026-03-15
**Version:** 1.0

---

## Personal Project Note

This is a personal development project. Features follow KISS (Keep It Simple, Stupid) and YAGNI (You Aren't Gonna Need It) principles. Scope focuses on core functionality for a solo developer workflow.

---

## 1. Overview

### Classification: AD-PRODUCT-FORGE APPLICATION

**This PRD describes browser automation infrastructure specific to ad-product-forge.** Browser service enables Nicolas' agents to interact with web pages for research, data gathering, and testing. This is application-specific capability, not framework infrastructure.

**Goal:** Provide agents with web automation and scraping capabilities via an external browser service.

**Why (for ad-product-forge):** Nicolas' research and development agents need to interact with web pages, fill forms, and scrape dynamic content without sandbox constraints. Enables web-based market research and testing.

**Priority:** Medium
**Timeline:** 2-3 weeks

---

## 2. Problem

- Agents cannot interact with web interfaces
- Cannot scrape dynamic JavaScript-rendered content
- Browser automation in sandboxed environments is problematic
- Need isolated, scalable browser infrastructure

---

## 3. Use Cases

1. **Agent scrapes a website:** Agent navigates to site, extracts data
2. **Agent fills and submits forms:** Agent automates form completion workflow
3. **Agent waits for dynamic content:** Agent waits for JavaScript to render, then extracts
4. **Agent takes screenshots:** Agent captures page state for analysis

---

## 4. Requirements

### Core Features

**FR1: Browser Session Management**
- Create new browser sessions on demand
- Maintain session state across multiple operations
- Auto-cleanup inactive sessions (timeout: 30 minutes)

**FR2: Page Navigation & Content**
- Navigate to URLs
- Retrieve page HTML and text content
- Get page metadata (title, URL, status)

**FR3: Element Interaction**
- Click elements by CSS selector
- Fill form fields
- Submit forms

**FR4: Content Extraction**
- Query elements by CSS selector
- Extract text and attributes
- Basic table data extraction

**FR5: JavaScript Execution**
- Execute simple JavaScript in page context
- Basic wait conditions

### Agent-Facing Tools

```typescript
createBrowserSession(): Promise<{sessionId}>
closeBrowserSession(sessionId: string): Promise<void>
navigateTo(sessionId: string, url: string): Promise<{url, status, title}>
getPageContent(sessionId: string): Promise<{html, text, url}>
clickElement(sessionId: string, selector: string): Promise<{success}>
fillField(sessionId: string, selector: string, value: string): Promise<{success}>
submitForm(sessionId: string, formSelector?: string): Promise<{success}>
querySelector(sessionId: string, selector: string): Promise<{element}>
querySelectorAll(sessionId: string, selector: string): Promise<{elements}>
executeScript(sessionId: string, script: string): Promise<{result}>
```

---

## 5. Success Criteria

- Agents can navigate to URLs and retrieve content
- Form automation works across different form types
- Web scraping handles dynamic content
- Browser operations complete within <30 seconds
- Sessions properly isolated and cleaned up
- Service handles concurrent requests from multiple agents

---

## 6. Non-Functional Requirements

**Performance:**
- Session creation: <5 seconds
- Navigation: <15 seconds
- Element interaction: quick response
- Reasonable execution speed for solo developer use

**Reliability:**
- Session isolation (no cross-session interference)
- Proper cleanup of stale processes
- Basic timeout and retry logic

**Security:**
- Session isolation between agents
- Input validation (prevent injection)
- Error handling without exposing internals

---

## 7. Architecture

### Components

1. **External Browser Service** (separate process/container)
   - Manages Playwright browser instances
   - HTTP API for remote control
   - Session lifecycle management
   - Runs outside sandbox

2. **Agent-Facing Browser Tools** (in Mastra Engine)
   - High-level tools for agents
   - HTTP client to browser service
   - Error handling and retry logic
   - Timeout management

### Network Architecture

```
Agent (in Mastra Engine)
  ↓
Browser Tools
  ↓
HTTP Client
  ↓
Browser Service (External)
  ├─ Playwright
  └─ Chrome/Chromium
```

### Session Management

```
Agent requests new session
  ↓
Browser Service creates session
  ├─ Launch Playwright browser context
  ├─ Assign session ID
  ├─ Set 30-minute timeout
  └─ Return session ID
       ↓
    Agent performs operations using session ID
       ├─ Navigate, interact, extract
       └─ Session state maintained across calls
            ↓
         Session timeout or explicit close
         ├─ Close browser context
         ├─ Release resources
         └─ Cleanup
```

---

## 8. Scope

### In Scope
- Browser session management (create, close, timeout)
- Page navigation and content retrieval
- Basic element interaction (click, fill, submit)
- Content extraction (querySelector, text extraction)
- Simple JavaScript execution
- Error handling and timeout management

### Out of Scope
- Cookie and storage management
- Screenshot capture
- Visual regression testing
- Multiple browser engines
- Distributed browser service
- CAPTCHA solving
- Proxy/VPN support

---

## 9. Implementation Phases

**Phase 1: Core Implementation (2-3 weeks)**
1. Browser service setup (Node/Playwright)
2. Session management (create, close, timeout)
3. Page navigation and content retrieval
4. Element interaction (click, fill, submit)
5. Content extraction (basic)
6. JavaScript execution (simple)
7. Error handling and logging

---

## 10. Database Schema

**`forge_browser_sessions` table:**
```
- session_id (UUID, primary key)
- agent_id (UUID)
- service_session_id (UUID) -- assigned by browser service
- created_at (TIMESTAMP)
- closed_at (TIMESTAMP, nullable)
- status (ENUM: active, closed)
```

---

## 11. Configuration

### Browser Service Environment Variables

```
BROWSER_PORT=9000
MAX_SESSIONS=50
SESSION_TIMEOUT=1800000  # 30 minutes
LOG_LEVEL=info
HEADLESS=true
```

### Agent Configuration

```typescript
createForgeAgent({
  browser: {
    enabled: true,
    serviceUrl: process.env.BROWSER_SERVICE_URL || "http://localhost:9000",
    timeout: 30000,
    sessions: {
      maxConcurrent: 5,
      idleTimeout: 1800000,
    }
  }
})
```

---

## 12. Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| Memory leaks in browser instances | Regular cleanup, session timeouts |
| Timeout issues | Configurable timeouts, clear error messages |
| Cross-session data leakage | Strict session isolation |
| Service unavailability | Graceful error handling, clear feedback |

---

## 13. Testing Strategy

- **Unit Tests:** Session management, basic functionality
- **Integration Tests:** End-to-end navigation, interaction, extraction
- **Error Handling:** Timeout, invalid input, API failures

---

## Glossary

| Term | Definition |
|------|-----------|
| Browser Session | Isolated browser context for agent operations |
| Browser Service | HTTP service managing browser instances |
| Selector | CSS selector for identifying page elements |

---

**Next Steps:** Begin Phase 1 implementation
