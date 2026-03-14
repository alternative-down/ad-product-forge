import { agentState, type Contact } from './state';

export function createContactBook() {
  function slugify(value: string) {
    return (
      value
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-') || 'contact'
    );
  }

  async function getAgentContact(agentId: string, slug: string) {
    const state = await agentState.read();
    return state.contacts.find((contact) => contact.agentId === agentId && contact.slug === slug) ?? null;
  }

  async function listAgentContacts(agentId: string) {
    const state = await agentState.read();
    return state.contacts.filter((contact) => contact.agentId === agentId);
  }

  async function findContactByIdentity(
    agentId: string,
    provider: string,
    externalUserId?: string,
    username?: string,
  ) {
    const state = await agentState.read();

    return (
      state.contacts.find((contact) => {
        if (contact.agentId !== agentId) {
          return false;
        }

        return contact.accounts.some((account) => {
          if (account.provider !== provider) {
            return false;
          }

          if (externalUserId && account.externalUserId === externalUserId) {
            return true;
          }

          if (username && account.username === username) {
            return true;
          }

          return false;
        });
      }) ?? null
    );
  }

  async function upsertAgentContact(input: {
    agentId: string;
    slug: string;
    displayName: string;
    description?: string;
    accounts?: Array<{
      provider: string;
      externalUserId?: string;
      username?: string;
    }>;
  }) {
    const state = await agentState.read();
    const slug = slugify(input.slug);
    let contact = state.contacts.find((current) => current.agentId === input.agentId && current.slug === slug);

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
        if (current.provider !== nextIdentity.provider) {
          return false;
        }

        if (nextIdentity.externalUserId && current.externalUserId === nextIdentity.externalUserId) {
          return true;
        }

        if (nextIdentity.username && current.username === nextIdentity.username) {
          return true;
        }

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

      if (nextIdentity.externalUserId) {
        identity.externalUserId = nextIdentity.externalUserId;
      }

      if (nextIdentity.username) {
        identity.username = nextIdentity.username;
      }
    }

    await agentState.save();
    return contact;
  }

  async function syncInboundContact(input: {
    agentId: string;
    provider: string;
    authorId?: string;
    authorName?: string;
    username?: string;
  }) {
    if (!input.authorId && !input.username && !input.authorName) {
      return null;
    }

    const state = await agentState.read();
    let contact = state.contacts.find((current) => {
      if (current.agentId !== input.agentId) {
        return false;
      }

      return current.accounts.some((account) => {
        if (account.provider !== input.provider) {
          return false;
        }

        if (input.authorId && account.externalUserId === input.authorId) {
          return true;
        }

        if (input.username && account.username === input.username) {
          return true;
        }

        return false;
      });
    });

    if (!contact) {
      const baseSlug = slugify(input.username || input.authorName || input.authorId || 'contact');
      let slug = baseSlug;
      let suffix = 2;

      while (state.contacts.some((current) => current.agentId === input.agentId && current.slug === slug)) {
        slug = `${baseSlug}-${suffix}`;
        suffix += 1;
      }

      contact = {
        agentId: input.agentId,
        slug,
        displayName: input.authorName || input.username || input.authorId || slug,
        accounts: [],
      };
      state.contacts.push(contact);
    }

    let identity = contact.accounts.find((current) => {
      if (current.provider !== input.provider) {
        return false;
      }

      if (input.authorId && current.externalUserId === input.authorId) {
        return true;
      }

      if (input.username && current.username === input.username) {
        return true;
      }

      return false;
    });

    if (!identity) {
      identity = {
        provider: input.provider,
        externalUserId: input.authorId,
        username: input.username,
      };
      contact.accounts.push(identity);
    }

    if (input.authorId) {
      identity.externalUserId = input.authorId;
    }

    if (input.username) {
      identity.username = input.username;
    }

    if (input.authorName) {
      contact.displayName = input.authorName;
    }

    await agentState.save();
    return contact satisfies Contact;
  }

  return {
    getAgentContact,
    listAgentContacts,
    findContactByIdentity,
    upsertAgentContact,
    syncInboundContact,
  };
}

export const contactBook = createContactBook();
