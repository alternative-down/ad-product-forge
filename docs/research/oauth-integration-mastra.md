# Research: OAuth Integration for Model Providers (Claude & Codex)

**Date:** 2026-03-11  
**Status:** Refined  
**Purpose:** Implement account-based authentication (Plan accounts) for Anthropic Claude and OpenAI Codex using Mastra Custom Gateways.

---

## 1. Context: Using Plan Accounts vs. API Keys

Standard API integration uses fixed keys (`sk-...`) which are billed per usage. To use personal/team plan accounts (e.g., Claude Pro, ChatGPT Plus), we must use **OAuth Access Tokens**.

Mastra provides the `MastraModelGateway` abstraction to handle this. By implementing a custom gateway, we can:
1. Handle token exchange/refresh.
2. Ingest the correct headers (`Authorization: Bearer <token>`).
3. Use account-based models through standard Agent interfaces.

---

## 2. Technical Implementation: Custom Provider Gateway

To integrate these providers, we extend `MastraModelGateway` from `@mastra/core/llm`.

### 2.1 Claude (Anthropic) Account Gateway

Anthropic OAuth requires the `Authorization: Bearer` header. The model IDs should be prefixed with the gateway ID.

```typescript
import { MastraModelGateway, type ProviderConfig } from '@mastra/core/llm';
import { createAnthropic } from '@ai-sdk/anthropic';

export class ClaudeAccountGateway extends MastraModelGateway {
  readonly id = 'claude-account';
  readonly name = 'Claude Account Gateway';

  async fetchProviders(): Promise<Record<string, ProviderConfig>> {
    return {
      anthropic: {
        name: 'Anthropic (Account)',
        models: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest'],
        apiKeyEnvVar: 'CLAUDE_ACCOUNT_TOKEN',
        gateway: this.id,
        url: 'https://api.anthropic.com/v1',
      },
    };
  }

  buildUrl(modelId: string): string {
    return 'https://api.anthropic.com/v1';
  }

  async getApiKey(): Promise<string> {
    const token = process.env.CLAUDE_ACCOUNT_TOKEN;
    if (!token) throw new Error('CLAUDE_ACCOUNT_TOKEN not found');
    return token;
  }

  async resolveLanguageModel({ modelId, apiKey }: { modelId: string; apiKey: string }) {
    // Note: OAuth tokens use Bearer auth, while API keys use x-api-key.
    // Some providers handle this automatically in their SDKs if we pass the token correctly.
    return createAnthropic({
      apiKey,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    }).chatModel(modelId.split('/').pop() || modelId);
  }
}
```

### 2.2 Codex (OpenAI) Account Gateway

Similar to Claude, OpenAI uses Bearer tokens for OAuth-based access.

```typescript
import { MastraModelGateway, type ProviderConfig } from '@mastra/core/llm';
import { createOpenAI } from '@ai-sdk/openai';

export class OpenAIAccountGateway extends MastraModelGateway {
  readonly id = 'openai-account';
  readonly name = 'OpenAI Account Gateway';

  async fetchProviders(): Promise<Record<string, ProviderConfig>> {
    return {
      openai: {
        name: 'OpenAI (Account)',
        models: ['gpt-4o', 'gpt-4o-mini', 'o1-preview'],
        apiKeyEnvVar: 'OPENAI_ACCOUNT_TOKEN',
        gateway: this.id,
        url: 'https://api.openai.com/v1',
      },
    };
  }

  buildUrl(): string {
    return 'https://api.openai.com/v1';
  }

  async getApiKey(): Promise<string> {
    const token = process.env.OPENAI_ACCOUNT_TOKEN;
    if (!token) throw new Error('OPENAI_ACCOUNT_TOKEN not found');
    return token;
  }

  async resolveLanguageModel({ modelId, apiKey }: { modelId: string; apiKey: string }) {
    return createOpenAI({
      apiKey,
    }).chatModel(modelId.split('/').pop() || modelId);
  }
}
```

---

## 3. Registering and Using the Gateways

Register the gateways in your main Mastra instance:

```typescript
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { ClaudeAccountGateway } from './gateways/claude-account';

const mastra = new Mastra({
  gateways: {
    claude: new ClaudeAccountGateway(),
  },
});

const agent = new Agent({
  id: 'my-agent',
  // Format: [gateway-id]/[provider]/[model]
  model: 'claude-account/anthropic/claude-3-5-sonnet-latest',
});
```

---

## 4. How to Obtain Tokens (CLI/Manual)

### 4.1 Claude Code Token
If you have Claude Code installed, the session token can be found in:
- Mac/Linux: `~/.claude/config.json`
- Look for the `sessionKey` or `accessToken` field.

### 4.2 OpenAI Codex/ChatGPT Token
Tokens can be extracted from the browser session (Local Storage / Cookies) after logging into `chatgpt.com` or via an OAuth application flow.

---

## 5. Security & Refresh Logic

For a production-grade implementation, the `getApiKey()` method in the gateway should include logic to check token expiration and use a `refresh_token` to rotate the `access_token` via the provider's OAuth token endpoint.

```typescript
async getApiKey() {
  if (this.isTokenExpired()) {
    await this.refreshTokens();
  }
  return this.accessToken;
}
```
