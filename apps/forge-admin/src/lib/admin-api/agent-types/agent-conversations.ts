export type AgentRecentConversation = {

  conversationId: string;

  conversationKey: string;

  provider: string;

  type: string;

  name?: string;

  participants: string[];

  updatedAt: number;

  messages: Array<{

    messageId: string;

    content: string;

    unread: boolean;

    authorDisplayName: string;

    createdAt: number;

  }>;

};


