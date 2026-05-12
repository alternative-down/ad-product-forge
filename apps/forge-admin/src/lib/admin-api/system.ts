import { request } from './core';
import type {
  LlmProfile,
  SyncOauthResult,
  SystemIntegration,
  SystemLlmResponse,
  SystemMcpServer,
  SystemOauthState,
  SystemSkill,
  SystemSettings,
  UpdateLlmDefaultsInput,
  UpsertSystemMcpServerInput,
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
  return request('/admin/system/llm/price/upsert', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateLlmDefaults(input: UpdateLlmDefaultsInput) {
  return request('/admin/system/llm/defaults/update', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getSystemIntegrations() {
  return request<SystemIntegration[]>('/admin/system/integrations');
}

export function getSystemMcpServers() {
  return request<SystemMcpServer[]>('/admin/system/mcp');
}

export function upsertSystemMcpServer(input: UpsertSystemMcpServerInput) {
  return request<SystemMcpServer>('/admin/system/mcp/upsert', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteSystemMcpServer(serverId: string) {
  return request<{ success: true; serverId: string }>('/admin/system/mcp/delete', {
    method: 'POST',
    body: JSON.stringify({ serverId }),
  });
}

export function getSystemSkills() {
  return request<SystemSkill[]>('/admin/system/skills');
}

export function uploadSystemSkills(input: { archiveBase64: string }) {
  return request<{ success: true; installedSkillNames: string[] }>('/admin/system/skills/upload', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteSystemSkill(skillName: string) {
  return request<{ success: true; skillName: string }>('/admin/system/skills/delete', {
    method: 'POST',
    body: JSON.stringify({ skillName }),
  });
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
