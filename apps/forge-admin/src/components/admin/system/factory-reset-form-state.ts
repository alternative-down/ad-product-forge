/**
 * Factory reset form state — pure logic (no React, no DOM).
 *
 * Implements the 2-step confirmation flow for the admin factory reset UI:
 *   - Step 1: warning screen showing the wipe list
 *   - Step 2: typed confirmation screen requiring exact string
 *
 * The backend POST /admin/system/reset (apps/forge/src/admin/routes/system/reset.ts)
 * expects body shape: { confirm: 'FACTORY_RESET' } (z.literal).
 *
 * This module is the source of truth for:
 *   - the typed confirmation string
 *   - step transitions
 *   - typed-input validation
 *   - error mapping for HTTP/network failures
 */

export const FACTORY_RESET_CONFIRM_STRING = 'FACTORY_RESET';

export type FactoryResetStep = 'closed' | 'warning' | 'confirmation' | 'submitting' | 'success' | 'error';

export type FactoryResetFormState = {
  step: FactoryResetStep;
  typedInput: string;
  errorMessage: string | null;
  errorKind: FactoryResetErrorKind | null;
};

export type FactoryResetErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'server-error'
  | 'network'
  | 'timeout'
  | 'unknown';

export const WIPE_TARGET_LABELS: ReadonlyArray<{ name: string; description: string }> = [
  { name: 'LLM profiles', description: 'Configured language model profiles and credentials' },
  { name: 'Agent configs', description: 'Agent definitions, contracts, and execution state' },
  { name: 'System settings', description: 'Runtime, operations, and company settings' },
  { name: 'Schedules', description: 'Cron and date-based scheduled jobs' },
  { name: 'Internal chat', description: 'Internal chat accounts and conversations' },
  { name: 'Webhooks', description: 'Webhook configurations and secrets' },
] as const;

export function getInitialFormState(): FactoryResetFormState {
  return {
    step: 'closed',
    typedInput: '',
    errorMessage: null,
    errorKind: null,
  };
}

export function openWarning(state: FactoryResetFormState): FactoryResetFormState {
  return {
    ...state,
    step: 'warning',
    typedInput: '',
    errorMessage: null,
    errorKind: null,
  };
}

export function openConfirmation(state: FactoryResetFormState): FactoryResetFormState {
  return {
    ...state,
    step: 'confirmation',
  };
}

export function setTypedInput(
  state: FactoryResetFormState,
  typedInput: string,
): FactoryResetFormState {
  return {
    ...state,
    typedInput,
  };
}

export function isConfirmationValid(state: FactoryResetFormState): boolean {
  return state.typedInput === FACTORY_RESET_CONFIRM_STRING;
}

export function startSubmitting(state: FactoryResetFormState): FactoryResetFormState {
  return {
    ...state,
    step: 'submitting',
    errorMessage: null,
    errorKind: null,
  };
}

export function markSuccess(state: FactoryResetFormState): FactoryResetFormState {
  return {
    ...state,
    step: 'success',
  };
}

export function markError(
  state: FactoryResetFormState,
  errorMessage: string,
  errorKind: FactoryResetErrorKind,
): FactoryResetFormState {
  return {
    ...state,
    step: 'error',
    errorMessage,
    errorKind,
  };
}

export function closeForm(): FactoryResetFormState {
  return getInitialFormState();
}

export function backToWarning(state: FactoryResetFormState): FactoryResetFormState {
  return {
    ...state,
    step: 'warning',
    errorMessage: null,
    errorKind: null,
  };
}

/**
 * Map an HTTP error to a user-friendly message and an error kind bucket.
 *
 * Accepts:
 *   - Response objects with a numeric `status` (e.g., from a fetch wrapper)
 *   - Error instances with messages (e.g., from request() in admin-api/core.ts)
 *   - Unknown values (default to 'unknown' kind, generic message)
 */
export function classifyResetError(error: unknown): {
  message: string;
  kind: FactoryResetErrorKind;
} {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: unknown }).status;
    if (typeof status === 'number') {
      if (status === 401) {
        return { kind: 'unauthorized', message: 'Sessão expirada. Faça login novamente.' };
      }
      if (status === 403) {
        return { kind: 'forbidden', message: 'Você não tem permissão para esta operação.' };
      }
      if (status === 408 || status === 504) {
        return { kind: 'timeout', message: 'Tempo limite excedido. Tente novamente.' };
      }
      if (status >= 500) {
        return {
          kind: 'server-error',
          message: 'Erro interno do servidor. Tente novamente em alguns minutos.',
        };
      }
    }
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (message) {
      // Network errors typically produce TypeError or "Failed to fetch" messages
      const lower = message.toLowerCase();
      if (lower.includes('network') || lower.includes('failed to fetch') || lower.includes('networkerror')) {
        return { kind: 'network', message: 'Erro de rede. Verifique sua conexão.' };
      }
      if (lower.includes('timeout') || lower.includes('aborted')) {
        return { kind: 'timeout', message: 'Tempo limite excedido. Tente novamente.' };
      }
      return { kind: 'unknown', message };
    }
  }

  return {
    kind: 'unknown',
    message: 'Não foi possível concluir a operação.',
  };
}
