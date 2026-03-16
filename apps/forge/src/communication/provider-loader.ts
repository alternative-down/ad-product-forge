import type { CommunicationProvider } from '@mastra-engine/core';
import { createEmailProvider, type EmailProviderConfig } from './providers/email';
import { createInternalChatProvider, type InternalChatProviderConfig } from './providers/internal-chat';

export type ProviderCredentialsMap = {
  email?: EmailProviderConfig;
  'internal-chat'?: InternalChatProviderConfig;
};

/**
 * Load communication providers from credentials map
 * Supports: email, internal-chat (no encryption yet)
 */
export function loadCommunicationProviders(credentials: ProviderCredentialsMap): CommunicationProvider[] {
  const providers: CommunicationProvider[] = [];

  // Load email provider if configured
  if (credentials.email) {
    providers.push(createEmailProvider(credentials.email));
  }

  // Load internal chat provider if configured
  if (credentials['internal-chat']) {
    providers.push(createInternalChatProvider(credentials['internal-chat']));
  }

  return providers;
}
