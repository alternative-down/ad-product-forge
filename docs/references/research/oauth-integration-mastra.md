# OAuth Gateway for Model Providers

**Status:** ✅ FULLY IMPLEMENTED

This document describes the OAuth authentication system for accessing Claude and OpenAI Codex via account-based credentials (Claude Pro, ChatGPT Plus) rather than API keys.

---

## 1. Overview

Standard API integration uses fixed API keys for per-usage billing. To use account-based subscriptions (Claude Pro, ChatGPT Plus), we use **OAuth access tokens** instead.

**Gateway:** `OAuthGateway` (extends `MastraModelGateway`)

**Supported providers:**

- `claude-max` — Anthropic Claude via OAuth
- `openai-codex` — OpenAI Codex via OAuth

**Gateway ID:** `account-oauth`

---

## 2. Architecture

### Location

- **Main gateway:** `packages/mastra-engine/src/llm/oauth-gateway.ts`
- **Auth handlers:** `packages/mastra-engine/src/llm/auth/anthropic.ts` and `openai-codex.ts`
- **Storage:** `packages/mastra-engine/src/llm/auth/store.ts`

### Key Components

| Component                        | Purpose                                                        |
| -------------------------------- | -------------------------------------------------------------- |
| `OAuthGateway`                   | Mastra gateway extending `MastraModelGateway`                  |
| `resolveAnthropicCredential()`   | Fetch/refresh Claude OAuth tokens                              |
| `resolveOpenAICodexCredential()` | Fetch/refresh Codex OAuth tokens                               |
| `oauthStore`                     | Persistent credential storage in `~/.mastra-engine/oauth.json` |
| Middleware chain                 | Provider-specific request/response transformation              |
| Custom fetch                     | Token injection and header management                          |

### Supported Features

- ✅ Token refresh with automatic expiry tracking
- ✅ Secure storage (mode 0o600, parent 0o700)
- ✅ Ephemeral prompt caching for Claude (TTL 1h)
- ✅ Store instructions middleware for Codex
- ✅ Fine-grained streaming response buffering

---

## 3. Token Resolution and Refresh

### 3.1 Anthropic (Claude)

**File:** `packages/mastra-engine/src/llm/auth/anthropic.ts`

**Resolution order:**

1. Check stored token in `~/.mastra-engine/oauth.json`
2. If not expired, return stored token
3. If expired but refresh token exists, call refresh endpoint
4. If no stored token, read from `setupTokenFilePath` (default: `/tmp/claude_oauth_token`)
5. If `authFilePath` provided, read from that file

**Refresh process:**

```
POST https://console.anthropic.com/v1/oauth/token
Content-Type: application/json

{
  "grant_type": "refresh_token",
  "client_id": "OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl",
  "refresh_token": "<refresh_token>"
}
```

**Token storage:**

```typescript
type OAuthCredential = {
  access: string; // access token
  refresh?: string; // refresh token
  expires?: number; // milliseconds since epoch
};
```

**Expiry tracking:** Tokens expire 5 minutes early (300s skew) to prevent edge-case failures

### 3.2 OpenAI Codex

**File:** `packages/mastra-engine/src/llm/auth/openai-codex.ts`

**Resolution order:**

1. Check stored token in `~/.mastra-engine/oauth.json`
2. If not expired, return stored token
3. If expired but refresh token exists, call refresh endpoint
4. Read from OpenAI CLI auth file `~/.codex/auth.json`

**CLI auth file format:**

```json
{
  "tokens": {
    "access_token": "...",
    "refresh_token": "...",
    "account_id": "..."
  }
}
```

**Refresh process:**

```
POST https://auth.openai.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&
refresh_token=<refresh_token>&
client_id=app_EMoamEEZ73f0CkXaXp7hrann
```

**Expiry decoding:** For Codex tokens, expiry is decoded from JWT payload if refresh token unavailable

**Account switching:** Account ID is preserved across token refreshes for ChatGPT account selection

### 3.3 Token Storage

**Location:** `~/.mastra-engine/oauth.json`

**File permissions:**

- File: mode `0o600` (user read/write only)
- Parent directory: mode `0o700` (user rwx only)

**Storage schema:**

```json
{
  "anthropic": {
    "access": "sk-ant-...",
    "refresh": "...",
    "expires": 1726531200000
  },
  "openai-codex": {
    "access": "...",
    "refresh": "...",
    "expires": 1726531200000,
    "accountId": "..."
  }
}
```

---

## 4. Middleware and Request Transformation

### 4.1 Claude Middleware

**Location:** `oauth-gateway.ts`, `claudeCodeMiddleware`

**Transformations:**

1. Inject identity system message: "You are Claude Code, Anthropic's official CLI for Claude."
2. Remove `topP` parameter if `temperature` is set (API incompatibility)

**Headers added:**

- `anthropic-beta`: OAuth-2025-04-20, claude-code-20250219, interleaved-thinking-2025-05-14, fine-grained-tool-streaming-2025-05-14
- `anthropic-version`: 2023-06-01

### 4.2 Codex Middleware

**Location:** `oauth-gateway.ts`, `openAIMiddleware`

**Transformations:**

1. Extract system prompts and convert to `store.instructions` parameter
2. Handle streamed responses with fine-grained buffering:
   - Text streaming: `text-start` → `text-delta` → `text-end`
   - Reasoning streaming: `reasoning-start` → `reasoning-delta` → `reasoning-end`
   - Tool calls and sources
3. Accumulate stream parts into complete response

### 4.3 Prompt Caching Middleware (Claude)

**Location:** `oauth-gateway.ts`, `promptCacheMiddleware`

**Feature:** Ephemeral prompt caching for reduced latency and cost

**Configuration:**

- Applies to system message and last user message
- TTL: 1 hour (ephemeral)
- Cache-control type: `ephemeral`
- Prevents cache invalidation on dynamic context injection

### 4.4 Custom Fetch Handlers

Each provider has a custom fetch implementation that:

1. **Removes default auth headers:**
   - Strips `authorization`, `x-api-key`

2. **Injects OAuth token:**
   - `Authorization: Bearer <access_token>`

3. **Adds provider-specific headers:**
   - Claude: `anthropic-beta`, `anthropic-version`
   - Codex: ChatGPT-specific headers (routing, account ID)

4. **Logging:**
   - Logs requests/responses via `forgeDebug()` for troubleshooting

---

## 5. Using the Gateway

### 5.1 Registration

```typescript
import { createOAuthGateway } from './llm/oauth-gateway';

const gateway = createOAuthGateway({
  anthropic: {
    setupTokenFilePath?: string;  // default: /tmp/claude_oauth_token
    authFilePath?: string;         // custom auth file path
    storePath?: string;            // default: ~/.mastra-engine/oauth.json
  },
  openaiCodex: {
    cliAuthFilePath?: string;      // default: ~/.codex/auth.json
    storePath?: string;            // default: ~/.mastra-engine/oauth.json
  },
});

// Register with Mastra agent system
const agent = new Agent({
  model: 'account-oauth/claude-max/claude-3-5-sonnet-20241022',
  // ... other config
});
```

### 5.2 Model Format

Gateway-referenced models use the format:

```
account-oauth/<provider>/<model-id>
```

**Supported providers:**

- `claude-max` — Anthropic Claude
- `openai-codex` — OpenAI Codex

**Supported models:**

- Claude: All models in `CLAUDE_MAX_MODELS` list
- Codex: All models in `OPENAI_CODEX_MODELS` list

### 5.3 Token Setup

**Claude:**

1. Place access token in `/tmp/claude_oauth_token`, OR
2. Provide `authFilePath` pointing to JSON with `access_token` and `refresh_token`, OR
3. Let it read from previously cached `~/.mastra-engine/oauth.json`

**Codex:**

1. OpenAI CLI automatically creates `~/.codex/auth.json` when you authenticate, OR
2. Provide custom `cliAuthFilePath` to override location, OR
3. Let it read from previously cached `~/.mastra-engine/oauth.json`

---

## 6. Error Handling

**Common errors:**

| Error                                                     | Cause                                 | Resolution                                                 |
| --------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------- |
| `Claude setup token not found in /tmp/claude_oauth_token` | Token file missing                    | Write token to `/tmp/claude_oauth_token` or configure path |
| `Anthropic refresh token missing`                         | No refresh token in stored credential | Re-authenticate or provide auth file                       |
| `Codex access token not found in ~/.codex/auth.json`      | CLI auth file missing                 | Run OpenAI CLI auth flow                                   |
| `Token refresh failed: 401`                               | Invalid refresh token                 | Re-authenticate or manually update store                   |

All errors include detailed context for debugging. Check `~/.mastra-engine/oauth.json` to verify stored credentials and expiry.

---

## 7. Implementation Notes

**Thread safety:** Token refresh is not synchronized; concurrent refreshes may occur. The second refresh will overwrite the first, but both should produce valid tokens.

**Expiry skew:** Tokens expire 300 seconds early to prevent edge-case API failures near the true expiry time.

**Storage location:** Credentials always stored in home directory (`~/.mastra-engine/oauth.json`), not in agent storage, to allow sharing across multiple agents.
