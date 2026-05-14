export type HireAgentInput = {

  hiringRequest: string;

  additionalContext?: string;

  weeklyBudgetUsd: number;

};



export type HireAgentResult = {

  agentId: string;

  emailAddress: string | null;

  githubAppRegistrationUrl: string | null;

};


