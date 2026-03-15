# Browser Service

**Status:** Planning - Technical Analysis & Design
**Date:** 2026-03-15
**Version:** 1.0
**Feature ID:** SERVICE-033

---

## Executive Summary

**Objective:** Provide browser automation capabilities for agents by integrating an external browser service that enables web interaction, scraping, and form automation without sandbox constraints.

**Problem:** Agents need to interact with web interfaces, perform automated browsing tasks, and scrape dynamic content. Current challenges include:
- Playwright integration within sandboxed environments (path resolution issues, binary availability)
- Resource limitations when running browser instances per agent
- Complexity of managing headless browser lifecycle within agent execution context
- Need for isolated, scalable browser automation infrastructure

**Solution:** Implement a Browser Service using an external, dedicated service (similar to OpenClaw architecture) that:
- Provides a HTTP/WebSocket API for remote browser control
- Runs browser instances in an isolated, non-sandboxed environment
- Manages browser session lifecycle independently from agent execution
- Supports web scraping, form filling, element interaction, and script execution
- Handles screenshot capture, PDF generation, and content extraction

**Value Proposition:**
- Enable agents to autonomously interact with web interfaces
- Support complex automation workflows (multi-page forms, dynamic content handling)
- Provide scalable browser automation without resource contention
- Eliminate sandbox-related Playwright issues
- Support both synchronous and asynchronous browser operations
- Enable web scraping tasks with JavaScript rendering support

**Scope:** MVP implementation focuses on core browser automation; advanced features (visual regression, performance monitoring) deferred to later phases.

---

## Problem Statement

### Current State
- Agents have no capability to interact with web interfaces
- No web scraping functionality (static or dynamic content)
- Form filling and submission automation unavailable
- Cannot interact with JavaScript-heavy applications
- No screenshot/PDF generation for web content

### Pain Points
1. **No Web Interaction:** Agents cannot autonomously perform web-based tasks
2. **Sandbox Constraints:** Playwright installation/execution fails in sandboxed environments due to path resolution and binary availability issues
3. **Resource Overhead:** Running browser per agent request is resource-intensive
4. **State Management:** Complex to manage browser session state across agent interactions
5. **Latency:** Each browser startup adds significant overhead to execution time
6. **Feature Limitations:** No screenshot capture, form automation, or dynamic content rendering

### Key Assumptions
- External browser service will run on separate infrastructure (not bound by agent sandbox)
- Browser service uses Playwright internally with proper path resolution
- HTTP/WebSocket API will provide sufficient latency performance for typical tasks
- Browser sessions can persist across multiple agent requests
- Service implements proper session isolation and cleanup

---

## Objectives

### Primary Objectives
1. **Establish Browser Service Architecture:** Create an external service that manages browser instances and provides a remote API
2. **Implement Agent-Facing Browser Tools:** Provide tools for agents to control browsers, interact with elements, and capture content
3. **Handle Browser Session Management:** Implement session lifecycle management with automatic cleanup
4. **Support Core Automation Tasks:** Enable form filling, clicking, scrolling, and content extraction
5. **Enable Web Scraping:** Support both static HTML parsing and dynamic JavaScript rendering

### Secondary Objectives
6. Support concurrent browser sessions
7. Implement browser session pooling for performance
8. Provide screenshot and PDF generation
9. Support JavaScript execution in browser context
10. Enable authentication workflows (login forms, cookies)
11. Support mobile device emulation

### Success Criteria
- Agents can successfully open URLs and retrieve page content
- Form automation works across different form types and frameworks
- Web scraping handles both static and dynamically-rendered content
- Browser operations complete within acceptable latency (< 30s per operation)
- Sessions properly isolated and cleaned up
- Service handles concurrent requests from multiple agents
- Screenshot capture works reliably
- Service operates outside sandbox constraints

---

## Requirements

### Functional Requirements

#### FR1: Browser Session Management
- Create new browser sessions on demand
- Maintain session state across multiple operations
- Automatically clean up inactive sessions (timeout: 30 minutes)
- Support session persistence options (temporary/permanent within request)
- Track active sessions with agent association
- Support session invalidation by agent or timeout

#### FR2: Page Navigation and Content Retrieval
- Navigate to URLs with automatic wait for page load
- Support custom wait conditions (selector, navigation, idle)
- Retrieve full page HTML content
- Extract text content from page
- Support taking screenshots (PNG/JPEG, full page or viewport)
- Generate PDF from page content
- Retrieve page metadata (title, URL, status)

#### FR3: Element Interaction
- Query elements via CSS selectors, XPath, or text content
- Click elements and handle click interactions
- Fill form fields (text, select, checkbox, radio, file upload)
- Submit forms
- Scroll to elements or scroll page
- Hover over elements
- Support drag-and-drop operations
- Handle file uploads

#### FR4: Content Extraction
- Extract element text content
- Get element attributes (href, src, data-* attributes)
- Retrieve computed styles
- Extract data from tables and lists
- Support data extraction templates

#### FR5: JavaScript Execution
- Execute arbitrary JavaScript in page context
- Return values from executed scripts
- Wait for JavaScript execution completion
- Support async script execution
- Handle script errors gracefully

#### FR6: Page State and Cookies
- Get/set cookies
- Get/set local storage
- Get/set session storage
- Support authentication workflows (pre-set credentials)
- Clear browser data (cache, cookies, storage)

#### FR7: Network and Performance
- Capture network requests (URL, method, status, headers)
- Support request interception and modification
- Capture network errors
- Measure page load metrics (DOM content loaded, page loaded time)

#### FR8: Error Handling
- Graceful handling of navigation timeouts
- Element not found error handling with suggestions
- Network error detection and reporting
- Script execution error reporting
- Session connection errors with retry logic

### Non-Functional Requirements

#### NFR1: Performance
- Browser session creation: < 5 seconds
- Page navigation: < 15 seconds (with reasonable load time)
- Element interaction (click, fill): < 2 seconds
- Content extraction: < 3 seconds
- Screenshot capture: < 5 seconds

#### NFR2: Scalability
- Support 50+ concurrent browser sessions per service instance
- Support 1000+ total sessions across agent population
- Service load balancing support (multiple service instances)
- Automatic session timeout to manage resource consumption

#### NFR3: Reliability
- Automatic recovery from browser crashes
- Session isolation to prevent cross-session interference
- No memory leaks or resource exhaustion under sustained load
- Proper cleanup of stale processes
- Connection timeout and retry logic

#### NFR4: Security
- Session isolation between agents
- No credential leakage across sessions
- HTTPS/WSS support for production
- Authentication/authorization for service endpoints (if exposed)
- Input validation and sanitization

#### NFR5: Observability
- Logging of all browser operations with timestamps
- Error tracking and reporting
- Session lifecycle events (create, close, timeout)
- Performance metrics (operation timing, success rate)
- Debug mode with detailed request/response logging

---

## Architecture

### Service Architecture

The Browser Service consists of three components:

#### 1. Browser Service Instance (External Service)

Runs independently on separate infrastructure (Docker container, VM, or cloud instance).

**Responsibilities:**
- Manage browser instances (Chrome/Chromium via Playwright)
- Handle HTTP/WebSocket connections from agents
- Route requests to appropriate browser sessions
- Manage session lifecycle and cleanup
- Implement connection pooling and resource management

**Key characteristics:**
- Playwright-based (handles binary path resolution correctly)
- Runs outside sandbox environment
- Supports both HTTP and WebSocket protocols
- Implements proper error handling and graceful degradation

#### 2. Agent-Facing Browser Tools (in Mastra Engine)

Located in: `packages/mastra-engine/src/agent/browser/`

**Responsibilities:**
- Provide high-level tools for agents to interact with browser service
- Translate agent requests to browser service API calls
- Handle response parsing and error translation
- Manage timeout and retry logic
- Implement rate limiting per agent

**Tool categories:**
- Session management tools
- Navigation and content retrieval tools
- Element interaction tools
- Data extraction tools
- Screenshot/PDF generation tools

#### 3. Browser Service Client Library (in Mastra Engine)

Located in: `packages/mastra-engine/src/agent/browser/client.ts`

**Responsibilities:**
- Communicate with external Browser Service via HTTP/WebSocket
- Handle connection management and reconnection logic
- Implement request/response serialization
- Manage session tokens and authentication
- Buffer requests if service unavailable

### Network Architecture

```
Agent (in Mastra Engine)
  ↓
Browser Tools (mastra-engine)
  ↓
Browser Service Client
  ↓
HTTP/WebSocket
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
  ├─ Assign session ID (UUID)
  ├─ Set session timeout (30 minutes)
  └─ Return session ID to agent
       ↓
    Agent performs operations using session ID
       ├─ Navigate, interact, extract
       ├─ All operations use session ID
       └─ Session state maintained across calls
            ↓
         Session timeout or explicit close
             ├─ Close browser context
             ├─ Release resources
             └─ Cleanup associated data
```

---

## Browser Service Infrastructure

Located in: External repository/package (`@ad-product-forge/browser-service` or similar)

### Deployment Model

**As Docker Container:**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install
RUN npx playwright install chromium
EXPOSE 9000
CMD ["node", "src/server.ts"]
```

**Environment Variables:**
```
BROWSER_PORT=9000                # HTTP server port
BROWSER_WS_PORT=9001            # WebSocket port (optional)
MAX_SESSIONS=50                  # Max concurrent sessions
SESSION_TIMEOUT=1800000          # 30 minutes in ms
LOG_LEVEL=info                   # debug, info, warn, error
HEADLESS=true                    # Run browsers headless
ENABLE_METRICS=true              # Enable Prometheus metrics
```

### HTTP API Endpoints

**Session Management:**
```
POST /browser/sessions
  Request: { }
  Response: { sessionId, createdAt }

GET /browser/sessions/{sessionId}
  Response: { sessionId, createdAt, lastActivity, status }

DELETE /browser/sessions/{sessionId}
  Response: { success }
```

**Navigation:**
```
POST /browser/sessions/{sessionId}/navigate
  Request: { url, waitUntil?, timeout? }
  Response: { url, status, title, content }

GET /browser/sessions/{sessionId}/content
  Response: { html, text, url, title }

POST /browser/sessions/{sessionId}/screenshot
  Request: { fullPage?, format?, quality? }
  Response: { image (base64), width, height }
```

**Interaction:**
```
POST /browser/sessions/{sessionId}/click
  Request: { selector, options? }
  Response: { success }

POST /browser/sessions/{sessionId}/fill
  Request: { selector, value }
  Response: { success }

POST /browser/sessions/{sessionId}/scroll
  Request: { selector? | position?, behavior? }
  Response: { success }
```

**Content Extraction:**
```
POST /browser/sessions/{sessionId}/query-selector
  Request: { selector }
  Response: { element: { text, tag, attributes, boundingBox } }

POST /browser/sessions/{sessionId}/query-all
  Request: { selector }
  Response: { elements: [...] }

POST /browser/sessions/{sessionId}/extract
  Request: { template: { /* extraction rules */ } }
  Response: { data: {...} }
```

**JavaScript Execution:**
```
POST /browser/sessions/{sessionId}/execute
  Request: { script, args? }
  Response: { result }
```

**State Management:**
```
POST /browser/sessions/{sessionId}/set-cookies
  Request: { cookies: [...] }
  Response: { success }

GET /browser/sessions/{sessionId}/cookies
  Response: { cookies: [...] }
```

---

## Agent-Facing Browser Tools

Located in: `packages/mastra-engine/src/agent/browser/tools.ts`

### Session Tools

```typescript
// Create a new browser session
createBrowserSession(input: {
  options?: {
    viewport?: { width: number; height: number };
    deviceEmulation?: "mobile" | "tablet" | "desktop";
    locale?: string;
    timezone?: string;
  };
}): Promise<{
  sessionId: string;
  createdAt: string;
}>

// Get current session ID (if in active session context)
getCurrentBrowserSession(): Promise<{
  sessionId: string;
  createdAt: string;
  lastActivity: string;
}>

// Close browser session
closeBrowserSession(input: {
  sessionId: string;
}): Promise<{
  success: boolean;
}>

// List active sessions (for current agent)
listBrowserSessions(): Promise<Array<{
  sessionId: string;
  createdAt: string;
  lastActivity: string;
  url?: string;
}>>

// Clear browser data (cookies, cache, storage)
clearBrowserData(input: {
  sessionId: string;
  includeCache?: boolean;
  includeCookies?: boolean;
  includeStorage?: boolean;
}): Promise<{
  success: boolean;
}>
```

### Navigation Tools

```typescript
// Navigate to URL
navigateTo(input: {
  sessionId: string;
  url: string;
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
  timeout?: number; // ms
}): Promise<{
  url: string;
  status: number;
  title: string;
  htmlLength: number;
}>

// Get current page content
getPageContent(input: {
  sessionId: string;
  format?: "html" | "text" | "markdown";
}): Promise<{
  content: string;
  url: string;
  title: string;
  status: number;
}>

// Go back/forward in history
goBack(input: {
  sessionId: string;
  timeout?: number;
}): Promise<{ success: boolean }>

goForward(input: {
  sessionId: string;
  timeout?: number;
}): Promise<{ success: boolean }>

// Reload current page
reloadPage(input: {
  sessionId: string;
  waitUntil?: "load" | "domcontentloaded";
}): Promise<{ success: boolean }>
```

### Interaction Tools

```typescript
// Click element
clickElement(input: {
  sessionId: string;
  selector: string;
  options?: {
    waitFor?: number; // ms, wait for element before clicking
    delay?: number;   // delay between mouse down/up
  };
}): Promise<{
  success: boolean;
  elementFound: boolean;
}>

// Fill form field
fillField(input: {
  sessionId: string;
  selector: string;
  value: string;
  options?: {
    delay?: number; // delay between keystrokes
    clear?: boolean; // clear field first
  };
}): Promise<{
  success: boolean;
  elementFound: boolean;
}>

// Select option from dropdown
selectOption(input: {
  sessionId: string;
  selector: string;
  value: string | string[]; // for multi-select
}): Promise<{
  success: boolean;
  selectedValues: string[];
}>

// Submit form
submitForm(input: {
  sessionId: string;
  formSelector?: string; // optional, will submit closest form
  waitNavigation?: boolean;
  timeout?: number;
}): Promise<{
  success: boolean;
  navigated: boolean;
}>

// Scroll to element or position
scroll(input: {
  sessionId: string;
  selector?: string; // scroll to element, or...
  position?: { x?: number; y?: number }; // ...scroll to position
  behavior?: "smooth" | "auto";
}): Promise<{
  success: boolean;
  currentScroll: { x: number; y: number };
}>

// Hover over element
hoverElement(input: {
  sessionId: string;
  selector: string;
  waitFor?: number;
}): Promise<{
  success: boolean;
  elementFound: boolean;
}>

// File upload
uploadFile(input: {
  sessionId: string;
  inputSelector: string;
  filePath: string | string[]; // single or multiple files
}): Promise<{
  success: boolean;
  filesUploaded: number;
}>

// Type text (alternative to fillField for inputs)
typeText(input: {
  sessionId: string;
  selector?: string; // optional, focus element first
  text: string;
  delay?: number;
  submit?: boolean; // press Enter at end
}): Promise<{
  success: boolean;
}>

// Drag and drop
dragAndDrop(input: {
  sessionId: string;
  sourceSelector: string;
  targetSelector: string;
}): Promise<{
  success: boolean;
}>
```

### Content Extraction Tools

```typescript
// Query single element
querySelector(input: {
  sessionId: string;
  selector: string;
}): Promise<{
  found: boolean;
  element?: {
    text: string;
    html: string;
    tag: string;
    attributes: Record<string, string>;
    visible: boolean;
    boundingBox?: { x: number; y: number; width: number; height: number };
  };
}>

// Query all matching elements
querySelectorAll(input: {
  sessionId: string;
  selector: string;
  limit?: number;
}): Promise<{
  count: number;
  elements: Array<{
    text: string;
    html: string;
    tag: string;
    attributes: Record<string, string>;
  }>;
}>

// Get page text content
getPageText(input: {
  sessionId: string;
  selector?: string; // extract text from subtree
}): Promise<{
  text: string;
  length: number;
}>

// Extract data from page using CSS selectors
extractData(input: {
  sessionId: string;
  template: Record<string, string | Record<string, string>>; // CSS selectors mapped to data fields
  format?: "json" | "csv";
}): Promise<{
  data: Record<string, unknown>;
  extractedAt: string;
}>

// Extract table data
extractTable(input: {
  sessionId: string;
  tableSelector: string;
  headerRow?: number;
}): Promise<{
  headers: string[];
  rows: Array<Record<string, string>>;
  rowCount: number;
}>

// Get all links on page
getLinks(input: {
  sessionId: string;
  selector?: string; // scope to subtree
}): Promise<{
  links: Array<{
    text: string;
    href: string;
    title?: string;
  }>;
  count: number;
}>

// Search for text on page
findText(input: {
  sessionId: string;
  text: string;
  regex?: boolean;
  caseSensitive?: boolean;
}): Promise<{
  found: boolean;
  count: number;
  positions?: Array<{ line: number; column: number }>;
}>
```

### Screenshot & PDF Tools

```typescript
// Capture screenshot
takeScreenshot(input: {
  sessionId: string;
  options?: {
    fullPage?: boolean;
    selector?: string; // screenshot specific element
    format?: "png" | "jpeg";
    quality?: number; // 0-100 for jpeg
  };
}): Promise<{
  imageData: string; // base64
  width: number;
  height: number;
  format: "png" | "jpeg";
}>

// Generate PDF
generatePDF(input: {
  sessionId: string;
  options?: {
    scale?: number;
    displayHeaderFooter?: boolean;
    headerTemplate?: string;
    footerTemplate?: string;
    printBackground?: boolean;
    landscape?: boolean;
    pageRanges?: string; // e.g., "1-5"
    format?: "A4" | "Letter";
    margin?: { top?: number; bottom?: number; left?: number; right?: number };
  };
}): Promise<{
  pdfData: string; // base64
  pages: number;
}>

// Save screenshot to file
saveScreenshot(input: {
  sessionId: string;
  filePath: string;
  options?: {
    fullPage?: boolean;
    format?: "png" | "jpeg";
  };
}): Promise<{
  success: boolean;
  savedPath: string;
}>

// Save PDF to file
savePDF(input: {
  sessionId: string;
  filePath: string;
  options?: { /* same as generatePDF */ };
}): Promise<{
  success: boolean;
  savedPath: string;
  pages: number;
}>
```

### JavaScript Execution Tools

```typescript
// Execute JavaScript in page context
executeScript(input: {
  sessionId: string;
  script: string;
  args?: unknown[];
  returnValue?: boolean; // wait for return value
  timeout?: number;
}): Promise<{
  success: boolean;
  result?: unknown;
  error?: string;
}>

// Execute async script
executeAsyncScript(input: {
  sessionId: string;
  script: string;
  args?: unknown[];
  timeout?: number;
}): Promise<{
  success: boolean;
  result?: unknown;
  error?: string;
}>

// Wait for function to return true
waitForFunction(input: {
  sessionId: string;
  script: string;
  args?: unknown[];
  timeout?: number;
  polling?: number; // ms between checks
}): Promise<{
  success: boolean;
  timeoutOccurred: boolean;
}>

// Inject CSS
injectCSS(input: {
  sessionId: string;
  css: string;
}): Promise<{
  success: boolean;
}>

// Inject script
injectScript(input: {
  sessionId: string;
  script: string;
  url?: string;
}): Promise<{
  success: boolean;
}>
```

### State & Cookies Tools

```typescript
// Get all cookies
getCookies(input: {
  sessionId: string;
}): Promise<{
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: string;
  }>;
}>

// Set cookies
setCookies(input: {
  sessionId: string;
  cookies: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
  }>;
}): Promise<{
  success: boolean;
  setCookieCount: number;
}>

// Delete cookie
deleteCookie(input: {
  sessionId: string;
  name: string;
  domain?: string;
  path?: string;
}): Promise<{
  success: boolean;
}>

// Get local storage
getLocalStorage(input: {
  sessionId: string;
  key?: string; // if provided, get single key
}): Promise<{
  data: Record<string, string>;
}>

// Set local storage
setLocalStorage(input: {
  sessionId: string;
  key: string;
  value: string;
}): Promise<{
  success: boolean;
}>

// Get session storage
getSessionStorage(input: {
  sessionId: string;
  key?: string;
}): Promise<{
  data: Record<string, string>;
}>

// Set session storage
setSessionStorage(input: {
  sessionId: string;
  key: string;
  value: string;
}): Promise<{
  success: boolean;
}>
```

### Network Monitoring Tools

```typescript
// Get network requests
getNetworkRequests(input: {
  sessionId: string;
  filter?: {
    resourceType?: string; // document, stylesheet, image, etc.
    status?: number;
    urlPattern?: string; // regex pattern
  };
  limit?: number;
}): Promise<{
  requests: Array<{
    url: string;
    method: string;
    status: number;
    resourceType: string;
    duration: number; // ms
    timestamp: string;
  }>;
  count: number;
}>

// Wait for network requests to complete
waitForNetworkIdle(input: {
  sessionId: string;
  timeout?: number;
  idleTime?: number; // consider idle after this many ms without requests
}): Promise<{
  success: boolean;
  requestCount: number;
}>
```

---

## Browser Service Configuration

### Agent Configuration

```typescript
createForgeAgent({
  // ... other config ...
  browser: {
    enabled: true,
    serviceUrl: process.env.BROWSER_SERVICE_URL || "http://localhost:9000",
    timeout: 30000, // default timeout for operations

    // Session management
    sessions: {
      maxConcurrent: 5,          // per agent
      idleTimeout: 1800000,      // 30 minutes
      autoClose: true,           // close on agent termination
    },

    // Default options
    defaults: {
      viewport: { width: 1280, height: 720 },
      headless: true,
      locale: "en-US",
    },

    // Performance tuning
    performance: {
      enableScreenshot: true,
      screenshotQuality: 80,
      maxScreenshotSize: "10mb",
    },

    // Retry policy
    retry: {
      maxAttempts: 3,
      initialDelay: 1000,
      backoffMultiplier: 2,
    },
  },
})
```

### Browser Service Configuration

```typescript
// In browser-service package
{
  port: process.env.BROWSER_PORT || 9000,
  wsPort: process.env.BROWSER_WS_PORT || 9001,

  browser: {
    headless: true,
    slowMo: 0, // ms to slow down operations

    // Playwright launch options
    launchArgs: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  },

  session: {
    maxConcurrent: 50,
    idleTimeout: 1800000, // 30 minutes
    cleanupInterval: 60000, // check every 1 minute
  },

  limits: {
    maxScreenshotSize: 10_000_000, // 10MB
    maxContentSize: 50_000_000,    // 50MB
    maxScriptTimeout: 30000,       // 30s
    maxNavTimeout: 30000,          // 30s
  },

  logging: {
    level: "info",
    requests: false,
    performance: true,
  },

  metrics: {
    enabled: true,
    port: 9090,
  },
}
```

---

## Database Schema

Located in: `packages/mastra-engine/src/agent/browser/schema.ts`

**Storage** (in shared agent database):

| Table | Purpose | Key Fields |
| --- | --- | --- |
| `forge_browser_sessions` | Browser session records | session_id, agent_id, service_session_id, created_at, closed_at, status |
| `forge_browser_operations` | Operation history | operation_id, session_id, operation_type, status, duration, error_message, timestamp |
| `forge_browser_screenshots` | Screenshot metadata | screenshot_id, session_id, url, created_at, storage_path |

**Session table fields:**
- `sessionId` — UUID, primary key (agent-facing)
- `agentId` — which agent owns this session
- `serviceSessionId` — UUID assigned by browser service
- `createdAt` — ISO timestamp
- `closedAt` — nullable ISO timestamp
- `lastActivityAt` — last operation timestamp
- `status` — `active`, `idle`, `closed`, `error`
- `url` — current URL in browser
- `metadata` — JSON object for session-specific data

**Operations table fields:**
- `operationId` — UUID, primary key
- `sessionId` — foreign key to session
- `operationType` — click, navigate, fillField, executeScript, etc.
- `selector` — CSS/XPath selector if applicable
- `status` — `success`, `failure`, `timeout`
- `duration` — milliseconds
- `errorMessage` — nullable error details
- `timestamp` — when operation occurred

---

## Error Handling and Recovery

### Connection Errors

If browser service is unavailable:
- Return 503 Service Unavailable error
- Include retry instructions in error message
- Log connection failures for monitoring
- Optional: queue operations for retry (deferred to Phase 2)

```typescript
try {
  const response = await fetch(`${serviceUrl}/browser/sessions/${sessionId}/navigate`, ...);
  if (response.status === 503) {
    throw new Error("Browser service temporarily unavailable. Try again in a moment.");
  }
} catch (error) {
  logger.error(`Browser service error: ${error.message}`);
  // Return actionable error to agent
}
```

### Element Not Found

When element selector doesn't match:
- Return clear error indicating element not found
- Optionally suggest similar selectors (deferred to Phase 2)
- Log attempt for debugging
- Do not fail the operation, let agent decide next action

```typescript
if (!elementFound) {
  return {
    success: false,
    error: "Element not found",
    selector: input.selector,
    suggestions: ["Check selector spelling", "Wait for dynamic content to load"],
  };
}
```

### Timeout Errors

For operations exceeding timeout:
- Return timeout error
- Provide information about what operation timed out
- Session remains valid for retry
- Log timeout for monitoring

```typescript
if (operationTime > timeout) {
  throw new Error(
    `Operation "${operationType}" timed out after ${timeout}ms. ` +
    `Consider increasing timeout or breaking into smaller steps.`
  );
}
```

### Session Cleanup

Automatic cleanup on:
- Explicit session close
- Session idle timeout (30 min without activity)
- Browser crash/disconnect
- Service shutdown

```typescript
// Cleanup flow
Session idle for 30 minutes
  ↓
Cleanup task identifies stale session
  ↓
Close browser context on service
  ↓
Mark session as closed in database
  ↓
Release resources
```

---

## Integration Points

### Communication Module Integration

Browser tools are callable from agent messages like any other tool.

```
Agent message: "Extract the price from www.example.com"
  ↓
Agent generates:
  1. navigateTo({ url: "www.example.com" })
  2. extractData({ template: { price: ".product-price" } })
  3. Result returned to agent
```

### Tool Result Format

All browser tools return structured responses:

```typescript
interface BrowserToolResult {
  success: boolean;           // operation succeeded
  message?: string;           // human-readable result
  data?: Record<string, unknown>; // structured data
  error?: string;             // error message if failed
  metadata?: {                // operation metadata
    duration: number;         // ms taken
    timestamp: string;        // when completed
    sessionId?: string;       // which session
  };
}
```

### Wake Queue Integration

Browser operations don't trigger wake queue directly. Tools are invoked synchronously during agent execution like any other tool.

---

## File Structure

```
packages/
  mastra-engine/
    src/
      agent/
        browser/
          ├─ client.ts              ← HTTP client to browser service
          ├─ tools.ts               ← Agent-facing tools (all tools)
          ├─ session-manager.ts     ← Local session tracking
          ├─ types.ts               ← Type definitions
          ├─ config.ts              ← Configuration schema
          ├─ error-handler.ts       ← Error handling utilities
          └─ README.md              ← Usage documentation

browser-service/                    ← Separate package/repo
  ├─ src/
  │  ├─ server.ts                 ← HTTP server setup
  │  ├─ session-manager.ts        ← Session lifecycle
  │  ├─ handlers/
  │  │  ├─ navigation.ts
  │  │  ├─ interaction.ts
  │  │  ├─ extraction.ts
  │  │  └─ screenshot.ts
  │  ├─ browser-pool.ts           ← Browser instance pooling
  │  ├─ playwright-wrapper.ts     ← Playwright abstraction
  │  ├─ utils.ts
  │  └─ types.ts
  ├─ Dockerfile
  ├─ docker-compose.yml
  └─ package.json
```

---

## Out of Scope (for now)

- Visual regression testing
- Performance profiling and reporting
- Browser extension support
- Video recording of browser sessions
- 3D rendering and WebGL manipulation
- Service-to-service authentication (assume same network/VPC)
- Request/response mocking and stubbing
- Browser automation for multiple browser engines (Safari, Firefox)
- Distributed browser service with load balancing
- Browser pool optimization and auto-scaling
- Webhook notifications for long-running operations
- Browser service health checks and failover
- Advanced proxy/VPN support for regional browsing
- CAPTCHA solving (agents responsible for handling)
- JavaScript obfuscation/deobfuscation

---

## Implementation Priority

**Phase 1 (MVP):**
1. External browser service setup (Docker, basic HTTP server)
2. Browser session management (create, close, timeout)
3. Page navigation and content retrieval (navigate, getPageContent, screenshot)
4. Basic element interaction (click, fillField, submitForm)
5. Simple content extraction (querySelector, text extraction)
6. Agent-facing tools for Phase 1 operations
7. Error handling and timeout management
8. Integration with Mastra Engine agent tools

**Phase 2 (Enhancement):**
1. Advanced element interaction (drag-drop, hover, file upload)
2. Table and list data extraction
3. JavaScript execution in page context
4. Cookies and local storage management
5. Network request monitoring
6. PDF generation
7. Device emulation (mobile, tablet)
8. Performance metrics collection

**Phase 3 (Polish):**
1. Browser session pooling and optimization
2. Concurrent session limit management
3. Advanced error suggestions and debugging
4. Screen recording (low priority)
5. Service health checks and monitoring
6. Rate limiting per agent
7. Operation result caching
8. Analytics and usage reporting

**Phase 4 (Advanced):**
1. Distributed browser service with load balancing
2. Browser automation for multiple engines
3. Request/response interception
4. CAPTCHA detection and handling guidance
5. Advanced proxy support
6. Service failover and redundancy
7. Advanced session persistence options

---

## Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
| --- | --- | --- | --- |
| Browser service becomes bottleneck | High | High | Implement session pooling, horizontal scaling, performance monitoring |
| Memory leaks in browser instances | Medium | High | Regular cleanup, monitoring, container restart policies |
| Timeout-related issues | Medium | Medium | Configurable timeouts, clear error messages, agent education |
| Cross-session data leakage | Low | Critical | Strict session isolation, security testing, regular audits |
| Service availability | Medium | High | Redundant instances, health checks, failover strategy |
| Performance degradation | Medium | Medium | Load testing, performance monitoring, optimization |
| Agent misuse (resource exhaustion) | Medium | Medium | Rate limiting, session quotas, monitoring and alerts |

---

## Success Metrics

1. **Functional:**
   - 95%+ success rate for navigation operations
   - 90%+ success rate for element interaction
   - 99%+ session isolation (no cross-session data leakage)

2. **Performance:**
   - Average navigation time < 10 seconds
   - Average element interaction time < 2 seconds
   - Screenshot capture < 3 seconds

3. **Reliability:**
   - 99.5%+ uptime for browser service
   - Automatic recovery from browser crashes
   - No memory leaks over 24-hour run

4. **Adoption:**
   - Agents successfully using browser tools within 1 week of availability
   - Positive feedback on usability and reliability

---

## Conclusion

The Browser Service will provide agents with powerful web automation and scraping capabilities, enabling them to interact with web interfaces autonomously. By implementing this as an external, dedicated service, we overcome sandbox constraints while maintaining scalability and security. The phased implementation approach ensures MVP delivery while leaving room for advanced features.

