# PRD-33: Browser Service

**Status:** Planning
**Date:** 2026-03-15
**Version:** 1.0

---

## Personal Project Note

This is a personal development project. Features follow KISS (Keep It Simple, Stupid) and YAGNI (You Aren't Gonna Need It) principles. Scope focuses on core functionality for a solo developer workflow.

---

## 1. Overview

**Goal:** Provide agents with web automation and scraping capabilities via an external browser service.

**Why:** Agents need to interact with web pages, fill forms, and scrape dynamic content without sandbox constraints.

**Priority:** Medium
**Timeline:** 3-4 weeks

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
- List and close sessions

**FR2: Page Navigation & Content**
- Navigate to URLs with page load waiting
- Retrieve page HTML and text content
- Take screenshots (PNG/JPEG)
- Get page metadata (title, URL, status)

**FR3: Element Interaction**
- Click elements by CSS selector
- Fill form fields
- Submit forms
- Scroll to elements
- Handle file uploads

**FR4: Content Extraction**
- Query elements by CSS selector
- Extract text and attributes
- Extract table data
- Find specific text on page

**FR5: JavaScript Execution**
- Execute arbitrary JavaScript in page context
- Wait for JavaScript conditions
- Handle script errors

**FR6: Cookie & Storage Management**
- Get/set cookies
- Get/set local storage
- Get/set session storage

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
takeScreenshot(sessionId: string, fullPage?: boolean): Promise<{imageData}>
executeScript(sessionId: string, script: string): Promise<{result}>
getCookies(sessionId: string): Promise<{cookies}>
setCookies(sessionId: string, cookies: any[]): Promise<{success}>
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
- Element interaction: <2 seconds
- Screenshot capture: <5 seconds

**Reliability:**
- Automatic recovery from browser crashes
- Session isolation (no cross-session interference)
- Proper cleanup of stale processes
- Timeout and retry logic

**Security:**
- Session isolation between agents
- No credential leakage across sessions
- Input validation and sanitization
- HTTPS support for production

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
- JavaScript execution
- Cookie and storage management
- Screenshot capture
- Error handling and timeout management

### Out of Scope
- Visual regression testing
- Performance profiling
- Browser extension support
- Video recording
- Multiple browser engines (Safari, Firefox)
- Distributed browser service
- CAPTCHA solving
- Advanced proxy/VPN support

---

## 9. Implementation Phases

**Phase 1: MVP (Week 1-2)**
1. External browser service setup (Docker)
2. Session management (create, close)
3. Page navigation and content retrieval
4. Basic element interaction (click, fill, submit)
5. Simple content extraction
6. Error handling and timeout

**Phase 2: Enhancement (Week 2-3)**
1. Advanced element interaction (drag-drop, hover, file upload)
2. Table and list extraction
3. JavaScript execution
4. Cookies/storage management
5. Screenshot generation
6. Device emulation

**Phase 3: Optimization (Week 3-4)**
1. Session pooling
2. Performance tuning
3. Advanced error handling
4. Monitoring and metrics

---

## 10. Database Schema

**`forge_browser_sessions` table:**
```
- session_id (UUID, primary key)
- agent_id (UUID)
- service_session_id (UUID) -- assigned by browser service
- created_at (TIMESTAMP)
- closed_at (TIMESTAMP, nullable)
- last_activity_at (TIMESTAMP)
- status (ENUM: active, idle, closed, error)
- url (VARCHAR, nullable) -- current page
```

**`forge_browser_operations` table:**
```
- operation_id (UUID, primary key)
- session_id (UUID, foreign key)
- operation_type (VARCHAR) -- click, navigate, fillField, etc
- status (ENUM: success, failure, timeout)
- duration (INTEGER) -- milliseconds
- error_message (TEXT, nullable)
- timestamp (TIMESTAMP)
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

## 12. External Service

Deploy as Docker container (separate from main application):

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install
RUN npx playwright install chromium
EXPOSE 9000
CMD ["node", "src/server.ts"]
```

---

## 13. Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| Browser service bottleneck | Session pooling, horizontal scaling, monitoring |
| Memory leaks in browser instances | Regular cleanup, monitoring, container policies |
| Timeout issues | Configurable timeouts, clear error messages |
| Cross-session data leakage | Strict session isolation, security testing |
| Service unavailability | Graceful error handling, clear feedback |

---

## 14. Testing Strategy

- **Unit Tests:** Session management, client communication
- **Integration Tests:** End-to-end navigation, interaction, extraction
- **Security Tests:** Session isolation, no cross-session leakage
- **Performance Tests:** Concurrent sessions, operation timing

---

## Glossary

| Term | Definition |
|------|-----------|
| Browser Session | Isolated browser context for agent operations |
| Browser Service | External HTTP service managing browser instances |
| Selector | CSS selector for identifying page elements |
| Timeout | Maximum time for an operation before cancellation |

---

**Next Steps:** Finalize service design and begin Phase 1 (basic browser service setup)
