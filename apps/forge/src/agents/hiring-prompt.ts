// ─── estimateTextTokens ─────────────────────────────────────────────────────────

export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── buildHiringPrompt ─────────────────────────────────────────────────────────

export interface HiringPromptInput {
  hiringRequest: string;
  additionalContext?: string;
  companyName?: string;
  companyContext?: string;
  existingAgents: Array<{
    name: string;
    roleName: string | null;
  }>;
}

export function buildHiringPrompt(input: HiringPromptInput): string {
  const sections = [
    'Design one newly hired permanent internal collaborator from the hiring request.',
    `Hiring request:\n${input.hiringRequest.trim()}`,
    'Inspect the current capability structure with tools before deciding whether to reuse or change roles.',
    'Before calling hireAgent, make sure the chosen role exists and grants the minimum base tools listed below.',
    'Minimum base tools: list_contacts, upsert_contact, list_conversations, get_messages, send_message, change_chat_group, list_agent_notifications, publish_skill_to_catalog, list_self_crons, manage_self_crons.',
    'If the role is missing capabilities, fix that first with manage_role_capabilities.',
    'After designing the agent profile, you MUST call the tool "hireAgent" with the structured data to finalize the hiring.',
    'If hireAgent returns valid false, read the hint, fix the capability setup, and call hireAgent again only after the setup is valid.',
    'Do not finish in plain text before hireAgent returns valid true.',
    'This workflow is not complete until there is a successful hireAgent tool result.',
    'The hireAgent tool requires an object with: agentName, agentDescription, roleId, primaryGoal, secondaryGoals, backstory.',
    'secondaryGoals must be an array of short goal strings.',
    'The name must be fictional, unique, and a single word only. Do not use a common human first name, a full person name, or a multi-word name.',
    'Use a name that feels like a proper identity for a professional agent, without jokes, mascots, or caricature framing.',
    'The new name must not duplicate or closely resemble the name of any existing internal collaborator.',
    'The professional profile, backstory, and goals must be grounded in the real-world role and how that role operates in practice.',
    'Write the prompt with exactly these sections and no others: Primary Goal, Secondary Goals, Backstory.',
    'Keep the structure simple and direct, in a CrewAI-like style.',
    'Do not add sections about tools, safety rules, constraints, communication style, execution control, or environment disclaimers.',
    'Do not mention tool ids, workflow ids, or capability ids anywhere in the generated agent text.',
    'Do not turn the backstory into fiction, lore, or theatrical character writing.',
    'Make it explicit in the generated text that the collaborator is operating in a real company through software, not in a simulation, game, or roleplay.',
    'Use the backstory to give realistic vocational context to the agent, like a concise professional biography.',
    'Keep the text descriptive and role-oriented, closer to a real-world role profile than to an operational handbook.',
    'The collaborator works inside the company and primarily communicates through internal-chat.',
  ];

  if (input.existingAgents.length > 0) {
    sections.push(
      [
        'Existing internal collaborators:',
        ...input.existingAgents.map((agent) => `- ${agent.name} — ${agent.roleName ?? 'Sem função definida'}`),
        'Avoid duplicate names and avoid names that look too similar to the existing ones.',
      ].join('\n'),
    );
  }

  if (input.companyName?.trim() || input.companyContext?.trim()) {
    sections.push(
      [
        'Company context:',
        input.companyName?.trim() ? `Company name: ${input.companyName.trim()}` : null,
        input.companyContext?.trim() ? `Company information: ${input.companyContext.trim()}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  if (input.additionalContext?.trim()) {
    sections.push(`Additional hiring context:\n${input.additionalContext.trim()}`);
  }

  return sections.join('\n\n');
}