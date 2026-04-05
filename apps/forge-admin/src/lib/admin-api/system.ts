import { request } from './core';
import type {
  LlmProfile,
  SyncOauthResult,
  SystemIntegration,
  SystemLlmResponse,
  SystemOauthState,
  SystemSettings,
  UpdateLlmDefaultsInput,
  UpsertLlmModelPriceInput,
  UpsertLlmProfileInput,
} from './types';

export function getSystemSettings() {
  return request<SystemSettings>('/admin/system/settings');
}

export function upsertSystemSettings(input: SystemSettings) {
  return request<SystemSettings>('/admin/system/settings/upsert', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getSystemOauth() {
  return request<SystemOauthState>('/admin/system/oauth');
}

export function syncSystemOauth(providerId: 'openai-codex' | 'anthropic' | 'all') {
  return request<SyncOauthResult>('/admin/system/oauth/sync', {
    method: 'POST',
    body: JSON.stringify({ providerId }),
  });
}

export function getSystemLlm() {
  return request<SystemLlmResponse>('/admin/system/llm');
}

export function upsertLlmProfile(input: UpsertLlmProfileInput) {
  return request<LlmProfile>('/admin/system/llm/profile/upsert', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function upsertLlmModelPrice(input: UpsertLlmModelPriceInput) {
  return request<UpsertLlmModelPriceInput>('/admin/system/llm/price/upsert', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateLlmDefaults(input: UpdateLlmDefaultsInput) {
  return request<UpdateLlmDefaultsInput>('/admin/system/llm/defaults/update', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getSystemIntegrations() {
  return request<SystemIntegration[]>('/admin/system/integrations');
}

export function upsertSystemIntegration(
  input:
    | {
        providerType: 'github';
        isEnabled: boolean;
        config: {
          organization: string;
          appHomeUrl: string;
        };
      }
    | {
        providerType: 'coolify';
        isEnabled: boolean;
        config: {
          baseUrl: string;
          adminToken: string;
          serverId: string;
          destinationId: string;
          applicationsBaseDomain?: string;
        };
      }
    | {
        providerType: 'migadu';
        isEnabled: boolean;
        config: {
          apiUser: string;
          apiKey: string;
        };
      }
    | {
        providerType: 'minimax';
        isEnabled: boolean;
        config: {
          apiKey: string;
        };
      },
) {
  return request<SystemIntegration>('/admin/system/integration/upsert', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
