import { create } from 'zustand';
import { hireAgent, type HireAgentInput } from '../../../../lib/api';

// Wizard step labels
export const WIZARD_STEPS = [
  { number: 1, label: 'Basic Info' },
  { number: 2, label: 'Configuration' },
  { number: 3, label: 'Contract' },
  { number: 4, label: 'Review' },
  { number: 5, label: 'Confirm' },
];

// Types based on wireframes
export type AIModel = 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo' | 'claude-3-5-sonnet' | 'claude-3-5-haiku';
export type BudgetType = 'week' | 'month' | 'year';
export type ScheduleType = 'always' | 'scheduled';

export interface BasicInfo {
  agentName: string;
  role: string;
  description: string;
}

export interface Configuration {
  model: AIModel;
  instructions: string;
  workspace: string;
}

export interface Contract {
  budgetType: BudgetType;
  budgetAmount: string;
  estimatedUsage: number;
  scheduleType: ScheduleType;
  scheduleDays?: string[];
  scheduleStartTime?: string;
  scheduleEndTime?: string;
}

export interface WizardState {
  currentStep: number;
  basicInfo: BasicInfo;
  configuration: Configuration;
  contract: Contract;
  isSubmitting: boolean;
  error: string | null;
  isComplete: boolean;
  createdAgentId: string | null;
}

export interface WizardActions {
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  setBasicInfo: (info: Partial<BasicInfo>) => void;
  setConfiguration: (config: Partial<Configuration>) => void;
  setContract: (contract: Partial<Contract>) => void;
  setSubmitting: (submitting: boolean) => void;
  setError: (error: string | null) => void;
  setComplete: (agentId: string) => void;
  reset: () => void;
  submit: () => Promise<void>;
}

const initialState: WizardState = {
  currentStep: 1,
  basicInfo: { agentName: '', role: '', description: '' },
  configuration: { model: 'gpt-4o-mini', instructions: '', workspace: '' },
  contract: { budgetType: 'month', budgetAmount: '25', estimatedUsage: 0, scheduleType: 'always', scheduleDays: ['tue', 'wed', 'thu', 'fri'], scheduleStartTime: '09:00', scheduleEndTime: '18:00' },
  isSubmitting: false, error: null, isComplete: false, createdAgentId: null,
};

export const useWizardStore = create<WizardState & WizardActions>((set, get) => ({
  ...initialState,

  setStep: (step: number) => set({ currentStep: step }),
  nextStep: () => { const { currentStep } = get(); if (currentStep < 5) set({ currentStep: currentStep + 1 }); },
  prevStep: () => { const { currentStep } = get(); if (currentStep > 1) set({ currentStep: currentStep - 1 }); },
  setBasicInfo: (info: Partial<BasicInfo>) => set((state: WizardState) => ({ basicInfo: { ...state.basicInfo, ...info } })),
  setConfiguration: (config: Partial<Configuration>) => set((state: WizardState) => ({ configuration: { ...state.configuration, ...config } })),
  setContract: (contract: Partial<Contract>) => set((state: WizardState) => ({ contract: { ...state.contract, ...contract } })),
  setSubmitting: (submitting: boolean) => set({ isSubmitting: submitting }),
  setError: (error: string | null) => set({ error, isSubmitting: false }),
  setComplete: (agentId: string) => set({ isComplete: true, createdAgentId: agentId, isSubmitting: false, error: null }),
  reset: () => set(initialState),

  submit: async () => {
    const { basicInfo, configuration, contract } = get();
    
    set({ isSubmitting: true, error: null });

    try {
      // Build hiring request from wizard data
      const scheduleDescription = contract.scheduleType === 'always'
        ? 'Always active'
        : `${contract.scheduleDays?.join(', ')} ${contract.scheduleStartTime}-${contract.scheduleEndTime}`;

      const hiringRequest = `
Agent: ${basicInfo.agentName}
Role: ${basicInfo.role}
Description: ${basicInfo.description || 'N/A'}

Configuration:
- Model: ${configuration.model}
- Workspace: ${configuration.workspace}
- Instructions: ${configuration.instructions}

Contract:
- Budget: $${contract.budgetAmount} per ${contract.budgetType}
- Schedule: ${scheduleDescription}
      `.trim();

      // Calculate weekly budget (API expects weekly)
      let weeklyBudgetUsd: number;
      const amount = parseFloat(contract.budgetAmount);
      switch (contract.budgetType) {
        case 'week':
          weeklyBudgetUsd = amount;
          break;
        case 'month':
          weeklyBudgetUsd = amount / 4; // Approximate
          break;
        case 'year':
          weeklyBudgetUsd = amount / 52; // Approximate
          break;
        default:
          weeklyBudgetUsd = amount;
      }

      const input: HireAgentInput = {
        hiringRequest,
        additionalContext: `Model: ${configuration.model}, Workspace: ${configuration.workspace}, Schedule: ${scheduleDescription}`,
        weeklyBudgetUsd,
      };

      const result = await hireAgent(input);
      set({ isComplete: true, createdAgentId: result.agentId, isSubmitting: false, error: null });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido ao contratar agent';
      set({ error: errorMessage, isSubmitting: false });
      throw err;
    }
  },
}));

export const validateBasicInfo = (info: BasicInfo): Record<string, string> => {
  const errors: Record<string, string> = {};
  if (!info.agentName?.trim()) errors.agentName = 'Nome é obrigatório';
  else if (info.agentName.length < 3) errors.agentName = 'Nome deve ter pelo menos 3 caracteres';
  else if (info.agentName.length > 50) errors.agentName = 'Nome deve ter no máximo 50 caracteres';
  else if (!/^[a-z0-9-]+$/.test(info.agentName)) errors.agentName = 'Use apenas letras minúsculas, números e hífens';
  if (!info.role?.trim()) errors.role = 'Informe um role';
  if (info.description?.length > 500) errors.description = 'Máximo 500 caracteres';
  return errors;
};

export const validateConfiguration = (config: Configuration): Record<string, string> => {
  const errors: Record<string, string> = {};
  if (!config.model) errors.model = 'Selecione um modelo';
  if (!config.instructions?.trim()) errors.instructions = 'Instruções são obrigatórias';
  else if (config.instructions.length < 50) errors.instructions = 'Mínimo 50 caracteres necessários';
  else if (config.instructions.length > 5000) errors.instructions = 'Máximo 5000 caracteres';
  if (!config.workspace) errors.workspace = 'Selecione um workspace';
  return errors;
};

export const validateContract = (contract: Contract): Record<string, string> => {
  const errors: Record<string, string> = {};
  const amount = parseFloat(contract.budgetAmount);
  if (!contract.budgetAmount || isNaN(amount)) errors.budgetAmount = 'Valor é obrigatório';
  else if (amount < 5) errors.budgetAmount = 'Valor mínimo: $5.00';
  if (contract.scheduleType === 'scheduled' && !contract.scheduleDays?.length) errors.scheduleDays = 'Selecione pelo menos um dia';
  return errors;
};
