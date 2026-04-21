import {
  SourceBackedLongTermMemory,
  type LongTermMemoryDocument,
  type LongTermMemoryRecallRequest,
  type LongTermMemoryStore,
  type RefreshableLongTermMemoryRecall,
} from 'agent-runtime-core/integrations';

export class LongTermMemory extends SourceBackedLongTermMemory {
  constructor(input: {
    store: LongTermMemoryStore;
    recall: RefreshableLongTermMemoryRecall;
  }) {
    super(input);
  }

  async writeDocument(document: LongTermMemoryDocument) {
    return this.write(document);
  }

  async recallDocuments(request: LongTermMemoryRecallRequest) {
    return this.recall(request);
  }
}
