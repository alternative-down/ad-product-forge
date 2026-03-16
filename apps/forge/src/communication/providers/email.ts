import type { CommunicationProvider } from '@mastra-engine/core';

/**
 * Email provider without encryption (for development)
 * Stores credentials in plain text
 */
export type EmailProviderConfig = {
  email: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser?: string;
  smtpPassword?: string;
  fromName?: string;
};

export function createEmailProvider(config: EmailProviderConfig): CommunicationProvider {
  return {
    id: 'email',
    async getAccount() {
      return {
        externalAccountId: config.email,
        displayName: config.fromName || config.email,
      };
    },
    async sendMessage(input) {
      // For now, just log and return a mock message ID
      console.log(`[Email Provider] Would send email to ${input.contactExternalId || 'unknown'}`);
      console.log(`Content: ${input.content}`);

      return {
        providerConversationKey: input.providerConversationKey || `email-${Date.now()}`,
        providerMessageId: `email-msg-${Date.now()}`,
        conversationName: `Email with ${input.contactExternalId}`,
      };
    },
  };
}
