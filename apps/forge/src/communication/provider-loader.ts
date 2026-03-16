import type { CommunicationProvider } from '@mastra-engine/core';
import { createEmailProvider } from '../email-account.js';
import { createInternalChatPreset } from './presets/internal-chat.js';

export type ProviderCredentialsMap = {
  'internal-chat'?: { agentId: string };
  email?: {
    imap: { host: string; port: number; secure: boolean; user: string; password: string };
    smtp: { host: string; port: number; secure: boolean; user: string; password: string };
    bcc?: string;
  };
};

// Global internal chat preset instance (singleton)
const internalChatPreset = createInternalChatPreset();

/**
 * Load communication providers from credentials map
 * Supports: internal-chat (preset), email (IMAP/SMTP)
 */
export function loadCommunicationProviders(credentials: ProviderCredentialsMap): CommunicationProvider[] {
  const providers: CommunicationProvider[] = [];

  // Load internal chat provider if configured
  if (credentials['internal-chat']) {
    const { agentId } = credentials['internal-chat'];
    providers.push(
      internalChatPreset.createProvider({
        id: agentId,
        displayName: agentId,
      })
    );
  }

  // Load email provider if configured
  if (credentials.email) {
    providers.push(createEmailProvider(credentials.email));
  }

  return providers;
}
