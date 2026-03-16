import type { CommunicationProvider } from '@mastra-engine/core';
import { createInternalChatPreset } from '@mastra-engine/core';

export type ProviderCredentialsMap = {
  'internal-chat'?: { agentId: string };
};

// Global internal chat preset instance (singleton)
const internalChatPreset = createInternalChatPreset();

/**
 * Load communication providers from credentials map
 * Supports: internal-chat (uses mastra-engine preset)
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

  return providers;
}
