import { createAccountRegistry } from './account-registry';
import { createMessageDelivery } from './message-delivery';
import { createMessageIngest } from './message-ingest';
import { createMessageReadModel } from './message-read-model';

function createMessageStore() {
  const accounts = createAccountRegistry();
  const ingest = createMessageIngest();
  const readModel = createMessageReadModel({
    getAgentAccountIds: accounts.getAgentAccountIds,
  });
  const delivery = createMessageDelivery({
    getAgentProviderAccount: accounts.getAgentProviderAccount,
    getSender: accounts.getSender,
  });

  return {
    ensureAccount: accounts.ensureAccount,
    registerAccountSender: accounts.registerSender,
    unregisterAccountSender: accounts.unregisterSender,
    ingestInboundMessage: ingest.ingestInboundMessage,
    listAgentContacts: readModel.listAgentContacts,
    getAgentContact: readModel.getAgentContact,
    upsertAgentContact: readModel.upsertAgentContact,
    listMessageConversations: readModel.listMessageConversations,
    getMessages: readModel.getMessages,
    sendAccountMessage: delivery.sendAccountMessage,
  };
}

export const messageStore = createMessageStore();
