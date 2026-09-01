/**
 * AgentDetail.providers type-safety tripwire (L#NN-26 v1 + L#NN-50 sub-form for #5736)
 *
 * Locks in the discriminated-union narrowing of providers[].credentials to
 * DiscordProviderCredentials OR EmailProviderCredentials (was defensive unknown).
 * Also locks in providerType narrowing to literal 'discord' | 'email' (was bare string).
 *
 * If anyone re-introduces credentials: unknown or providerType: string,
 * expectTypeOf().toEqualTypeOf() will fail at compile time (mutation non-tautological).
 *
 * Pattern: L#NN-26 v1 mutation non-tautological + expectTypeOf for compile-time check.
 */
import { describe, it, expectTypeOf } from 'vitest';
import type { AgentDetail } from './agent-detail';
import type {
  DiscordProviderCredentials,
  EmailProviderCredentials,
} from './agent-credentials';

describe('AgentDetail.providers type-safety (L#NN-26 v1 tripwire for #5736)', () => {
  it('credentials is narrowed to DiscordProviderCredentials OR EmailProviderCredentials (no longer unknown)', () => {
    expectTypeOf<AgentDetail['providers'][number]['credentials']>().toEqualTypeOf<
      DiscordProviderCredentials | EmailProviderCredentials
    >();
  });

  it('providerType is narrowed to literal discord OR email (no longer bare string)', () => {
    expectTypeOf<AgentDetail['providers'][number]['providerType']>().toEqualTypeOf<
      'discord' | 'email'
    >();
  });

  it('mutation: refuses arbitrary-string providerType (non-tautological)', () => {
    // @ts-expect-error - 'slack' is not in the literal union 'discord' | 'email'
    const badType: 'discord' | 'email' = 'slack';
    void badType;
  });

  it('mutation: refuses wrong-shape credentials (non-tautological)', () => {
    // @ts-expect-error - { wrong: 'shape' } is not in the credentials union
    const badCred: DiscordProviderCredentials | EmailProviderCredentials = { wrong: 'shape' };
    void badCred;
  });

  it('mutation: refuses credentials with the wrong providerType literal (non-tautological)', () => {
    // @ts-expect-error - token-only shape belongs to discord, not email
    const badCred: EmailProviderCredentials = { token: 'x' };
    void badCred;
  });

  it('positive: a Discord provider assignment compiles without @ts-expect-error', () => {
    const good: AgentDetail['providers'][number] = {
      providerType: 'discord',
      createdAt: 1,
      editable: true,
      credentials: { token: 'x', channels: [] },
    };
    expectTypeOf(good).not.toBeAny();
  });

  it('positive: an Email provider assignment compiles without @ts-expect-error', () => {
    const good: AgentDetail['providers'][number] = {
      providerType: 'email',
      createdAt: 1,
      editable: true,
      credentials: {
        imap: { host: 'h', port: 1, secure: false, user: 'u', password: 'p' },
        smtp: { host: 'h', port: 1, secure: false, user: 'u', password: 'p' },
      },
    };
    expectTypeOf(good).not.toBeAny();
  });
});
