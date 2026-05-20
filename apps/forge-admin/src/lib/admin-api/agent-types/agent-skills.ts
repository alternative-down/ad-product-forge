export type UploadAgentSkillsInput = {
  agentId: string;

  archiveBase64: string;
};

export type DeleteAgentSkillInput = {
  agentId: string;

  skillName: string;
};
