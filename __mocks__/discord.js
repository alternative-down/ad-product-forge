// Mock for 'discord.js' package — used by src/discord-account.ts
module.exports = {
  ChannelType: { GuildText: 0, DM: 1, GuildVoice: 2 },
  GatewayIntentBits: { Guilds: 1 << 0, GuildMessages: 1 << 9, MessageContent: 1 << 15 },
  Events: { MessageCreate: 'messageCreate', Ready: 'ready' },
  Partials: { Channel: 1 << 0, Message: 1 << 1 },
  Client: class MockClient {
    constructor() { this.user = null; this.channels = new Map(); this.on = () => this; }
    login(token) { return Promise.resolve(token); }
    destroy() {}
  },
  Collection: class MockCollection extends Map {
    set(k, v) { return super.set(k, v); }
  },
  Message: class MockMessage {},
  User: class MockUser {},
};
