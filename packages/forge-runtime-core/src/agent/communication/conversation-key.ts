import crypto from 'node:crypto';

export function createCommunicationConversationKey(provider: string, providerConversationKey: string) {
  const hash = crypto
    .createHash('sha1')
    .update(`${provider}:${providerConversationKey}`)
    .digest('hex')
    .slice(0, 24);

  return `conv_${hash}`;
}
