/**
 * Typed Error subclasses for the discord/outbound module
 * (Pattern L, D52 #6502 batch 39).
 */
export class DiscordMessageNoChunksError extends Error {
  readonly code = 'DISCORD_MESSAGE_NO_CHUNKS' as const;
  constructor() {
    super('Discord message content produced no chunks to send');
    this.name = 'DiscordMessageNoChunksError';
  }
}
