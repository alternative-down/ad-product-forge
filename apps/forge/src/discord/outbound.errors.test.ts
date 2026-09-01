import { describe, expect, it } from 'vitest';
import { DiscordMessageNoChunksError } from './outbound.errors';

describe('DiscordMessageNoChunksError', () => {
  it('preserves verbatim message', () => {
    const err = new DiscordMessageNoChunksError();
    expect(err).toBeInstanceOf(DiscordMessageNoChunksError);
    expect(err.name).toBe('DiscordMessageNoChunksError');
    expect(err.code).toBe('DISCORD_MESSAGE_NO_CHUNKS');
    expect(err.message).toBe('Discord message content produced no chunks to send');
  });
});
