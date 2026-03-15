# Research: OAuth Integration for Model Providers (Claude & Codex)

**Date:** 2026-03-11
**Status:** Implemented
**Purpose:** Implement account-based authentication (Plan accounts) for Anthropic Claude and OpenAI Codex using Mastra Custom Gateways.

---

## 1. Context: Using Plan Accounts vs. API Keys

Standard API integration uses fixed keys (`sk-...`) which are billed per usage. To use personal/team plan accounts (e.g., Claude Pro, ChatGPT Plus), we must use **OAuth Access Tokens**.

Mastra provides the `MastraModelGateway` abstraction to handle this. By implementing a custom gateway, we can:
1. Handle token exchange/refresh.
2. Ingest the correct headers (`Authorization: Bearer <token>`).
3. Use account-based models through standard Agent interfaces.

---

## 2. Technical Implementation: OAuthGateway with Token Management

The actual implementation uses a unified `OAuthGateway` that extends `MastraModelGateway` from `@mastra/core/llm` and handles token refresh, credential storage, and middleware-based request transformation.

**File Location:** `packages/mastra-engine/src/llm/oauth-gateway.ts`

### 2.1 OAuthGateway Structure

The `OAuthGateway` class extends `MastraModelGateway` and provides two provider configurations:

**Providers:**
- `openai-codex`: Uses OpenAI Codex API via OAuth (backend-api/codex)
- `claude-max`: Uses Anthropic Claude API with OAuth support

**Key Features:**
1. **Token Management:** Handles credential resolution, refresh token logic, and storage via `oauthStore`.
2. **Middleware Chain:** Applies provider-specific middleware to transform requests and process responses.
3. **Custom Fetch:** Implements custom fetch handlers to inject OAuth tokens and manage headers.
4. **Prompt Caching:** Supports ephemeral prompt caching for Claude models (TTL 1h).

### 2.2 Token Resolution Flow

For **Anthropic (Claude)** via `resolveAnthropicCredential()`:
```
1. Check stored token in ~/.mastra-engine/oauth.json (non-expired)
2. If stored but expired, refresh using refresh_token
   POST https://console.anthropic.com/v1/oauth/token
3. If no stored token, read from authFilePath or setupTokenFilePath (/tmp/claude_oauth_token)
4. Cache result in ~/.mastra-engine/oauth.json
```

For **OpenAI Codex** via `resolveOpenAICodexCredential()`:
```
1. Check stored token in ~/.mastra-engine/oauth.json (non-expired)
2. If stored but expired, refresh using refresh_token
   POST https://auth.openai.com/oauth/token
3. Read from CLI auth file (~/.codex/auth.json)
4. Cache result in ~/.mastra-engine/oauth.json
```

Token expiry is tracked in milliseconds; credentials expire 5 minutes early (60s skew) to prevent API failures.

### 2.3 Middleware for Request/Response Transformation

**openAIMiddleware** (for openai-codex):
- Transforms system prompts into store instructions
- Handles streamed responses with fine-grained buffering (text, reasoning, tool calls)
- Processes stream parts: text-start/delta/end, reasoning-start/delta/end, tool calls, sources

**claudeCodeMiddleware** (for claude-max):
- Injects Claude Code identity system message: "You are Claude Code, Anthropic's official CLI for Claude."
- Removes `topP` if `temperature` is set (Anthropic API incompatibility)

**promptCacheMiddleware** (for claude-max):
- Adds ephemeral prompt caching (TTL 1h) to system and last message
- Prevents cache invalidation on dynamic context injection
- Uses cache control type: `ephemeral`

### 2.4 Custom Fetch Implementation

Each provider uses a custom fetch handler to:
1. Remove default authorization headers (`authorization`, `x-api-key`)
2. Set `Authorization: Bearer <token>` header with OAuth token
3. Add provider-specific headers:
   - Anthropic: `anthropic-beta`, `anthropic-version`
   - OpenAI: Custom ChatGPT headers
4. Log request/response for debugging via `forgeDebug()`

---

## 3. Registering and Using the OAuthGateway

Register the `OAuthGateway` instance and reference models using the gateway format:

```typescript
import { createOAuthGateway } from './llm/oauth-gateway';

export const oauthGateway = createOAuthGateway({
  anthropic: {
    // Optional: custom paths for auth files
    authFilePath?: string;
    setupTokenFilePath?: string;  // defaults to /tmp/claude_oauth_token
    storePath?: string;  // defaults to ~/.mastra-engine/oauth.json
  },
  openaiCodex: {
    cliAuthFilePath?: string;  // defaults to ~/.codex/auth.json
    storePath?: string;  // defaults to ~/.mastra-engine/oauth.json
  },
});

// Use in agents:
const agent = new Agent({
  id: 'my-agent',
  // Format: account-oauth/[provider]/[model]
  model: 'account-oauth/claude-max/claude-3-5-sonnet-20241022',
});
```

**Supported Models:**
- Claude: Defined in `CLAUDE_MAX_MODELS` in `model-ids.ts`
- OpenAI Codex: Defined in `OPENAI_CODEX_MODELS` in `model-ids.ts`

**Gateway ID:** Exported as `OAUTH_GATEWAY_ID = 'account-oauth'`

---

## 4. How to Obtain and Store Tokens

### 4.1 Claude (Anthropic) Token

The gateway resolves credentials in this order:
1. **Stored token:** Check `~/.mastra-engine/oauth.json` for non-expired token
2. **Setup token file:** Read from `setupTokenFilePath` (defaults to `/tmp/claude_oauth_token`)
3. **Auth file:** If provided, read from `authFilePath` (must contain JSON with `access_token` and `refresh_token`)

To use:
- Place Claude OAuth token in `/tmp/claude_oauth_token` or configure via `setupTokenFilePath`
- Once read, token is cached in `~/.mastra-engine/oauth.json` for subsequent runs

### 4.2 OpenAI Codex Token

The gateway resolves credentials in this order:
1. **Stored token:** Check `~/.mastra-engine/oauth.json` for non-expired token
2. **CLI auth file:** Read from `~/.codex/auth.json` (OpenAI Codex CLI location)

The auth file format (created by OpenAI CLI):
```json
{
  "tokens": {
    "access_token": "...",
    "refresh_token": "...",
    "account_id": "..."  // optional, used for ChatGPT account switching
  }
}
```

---

## 5. Security & Refresh Logic

The `OAuthGateway` includes built-in token refresh logic:

**Refresh Endpoints:**
- **Anthropic:** `https://console.anthropic.com/v1/oauth/token` (POST with `grant_type: refresh_token`)
- **OpenAI Codex:** `https://auth.openai.com/oauth/token` (POST with URL-encoded form body)

**Token Refresh Flow:**
1. Check if stored token is expired (with 60s skew buffer)
2. If expired and `refresh_token` exists, call provider's token endpoint
3. Parse new `access_token` and `expires_in`
4. Calculate expiry: `Date.now() + expires_in * 1000 - skew`
5. Update stored credential with new token and expiry
6. If refresh fails, throw error with details for debugging

**Storage Security:**
- OAuth store file is created with mode `0o600` (user-only read/write)
- Parent directory created with mode `0o700`
- Token expiry includes buffer to prevent edge-case API failures
- Credentials stored locally in `~/.mastra-engine/oauth.json`

**Account ID Support (OpenAI):**
- OpenAI Codex supports ChatGPT account switching via `ChatGPT-Account-Id` header
- Account ID is extracted from CLI auth file and preserved across token refreshes
