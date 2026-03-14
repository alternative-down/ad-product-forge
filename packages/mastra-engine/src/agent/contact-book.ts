import type { ContactIdentity, State } from './message-state';

function createContactBook() {
  function findContactBySlug(state: State, agentId: string, slug: string) {
    return state.contacts.find((contact) => contact.agentId === agentId && contact.slug === slug) ?? null;
  }

  function findContactByIdentity(
    state: State,
    agentId: string,
    provider: string,
    externalUserId?: string,
    username?: string,
  ) {
    return (
      state.contacts.find((contact) => {
        if (contact.agentId !== agentId) return false;

        return contact.accounts.some((identity) => {
          if (identity.provider !== provider) return false;
          if (externalUserId && identity.externalUserId === externalUserId) return true;
          if (username && identity.username === username) return true;
          return false;
        });
      }) ?? null
    );
  }

  function ensureContact(state: State, input: {
    agentId: string;
    provider: string;
    externalUserId?: string;
    username?: string;
    displayName?: string;
  }) {
    let contact = findContactByIdentity(
      state,
      input.agentId,
      input.provider,
      input.externalUserId,
      input.username,
    );

    if (!contact) {
      const baseSlug = (input.username || input.displayName || input.externalUserId || 'contact')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
      let slug = baseSlug || 'contact';
      let suffix = 2;

      while (findContactBySlug(state, input.agentId, slug)) {
        slug = `${baseSlug}-${suffix}`;
        suffix += 1;
      }

      contact = {
        agentId: input.agentId,
        slug,
        displayName: input.displayName || input.username || input.externalUserId || slug,
        accounts: [],
      };
      state.contacts.push(contact);
    }

    let identity = contact.accounts.find((account) => {
      if (account.provider !== input.provider) return false;
      if (input.externalUserId && account.externalUserId === input.externalUserId) return true;
      if (input.username && account.username === input.username) return true;
      return false;
    });

    if (!identity) {
      identity = {
        provider: input.provider,
        externalUserId: input.externalUserId,
        username: input.username,
      };
      contact.accounts.push(identity);
    }

    if (input.externalUserId) identity.externalUserId = input.externalUserId;
    if (input.username) identity.username = input.username;
    if (input.displayName) contact.displayName = input.displayName;

    return contact;
  }

  function upsertContact(state: State, input: {
    agentId: string;
    slug: string;
    displayName: string;
    description?: string;
    accounts?: ContactIdentity[];
  }) {
    const baseSlug = input.slug
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    const slug = baseSlug || 'contact';
    let contact = findContactBySlug(state, input.agentId, slug);

    if (!contact) {
      contact = {
        agentId: input.agentId,
        slug,
        displayName: input.displayName,
        accounts: [],
      };
      state.contacts.push(contact);
    }

    contact.displayName = input.displayName;
    contact.description = input.description;

    for (const nextIdentity of input.accounts ?? []) {
      let identity = contact.accounts.find((current) => {
        if (current.provider !== nextIdentity.provider) return false;
        if (nextIdentity.externalUserId && current.externalUserId === nextIdentity.externalUserId) return true;
        if (nextIdentity.username && current.username === nextIdentity.username) return true;
        return false;
      });

      if (!identity) {
        identity = {
          provider: nextIdentity.provider,
          externalUserId: nextIdentity.externalUserId,
          username: nextIdentity.username,
        };
        contact.accounts.push(identity);
      }

      if (nextIdentity.externalUserId) identity.externalUserId = nextIdentity.externalUserId;
      if (nextIdentity.username) identity.username = nextIdentity.username;
    }

    return contact;
  }

  return {
    findContactBySlug,
    findContactByIdentity,
    ensureContact,
    upsertContact,
  };
}

export const contactBook = createContactBook();
