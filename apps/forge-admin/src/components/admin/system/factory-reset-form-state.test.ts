// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  FACTORY_RESET_CONFIRM_STRING,
  WIPE_TARGET_LABELS,
  backToWarning,
  classifyResetError,
  closeForm,
  getInitialFormState,
  isConfirmationValid,
  markError,
  markSuccess,
  openWarning,
  openConfirmation,
  setTypedInput,
  startSubmitting,
} from './factory-reset-form-state';

describe('factory-reset-form-state', () => {
  describe('constants', () => {
    it('FACTORY_RESET_CONFIRM_STRING matches backend z.literal', () => {
      expect(FACTORY_RESET_CONFIRM_STRING).toBe('FACTORY_RESET');
    });

    it('WIPE_TARGET_LABELS has 6 entries with name and description', () => {
      expect(WIPE_TARGET_LABELS).toHaveLength(6);
      for (const entry of WIPE_TARGET_LABELS) {
        expect(typeof entry.name).toBe('string');
        expect(entry.name.length).toBeGreaterThan(0);
        expect(typeof entry.description).toBe('string');
        expect(entry.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getInitialFormState', () => {
    it('returns the closed step with empty typed input and no error', () => {
      const state = getInitialFormState();
      expect(state).toEqual({
        step: 'closed',
        typedInput: '',
        errorMessage: null,
        errorKind: null,
      });
    });
  });

  describe('openWarning', () => {
    it('transitions from closed to warning and clears errors', () => {
      const initial = getInitialFormState();
      const next = openWarning(initial);
      expect(next.step).toBe('warning');
      expect(next.typedInput).toBe('');
      expect(next.errorMessage).toBeNull();
    });

    it('clears prior error when reopening from error step', () => {
      const errored = markError(getInitialFormState(), 'boom', 'server-error');
      const next = openWarning(errored);
      expect(next.step).toBe('warning');
      expect(next.errorMessage).toBeNull();
      expect(next.errorKind).toBeNull();
    });
  });

  describe('openConfirmation', () => {
    it('transitions from warning to confirmation without resetting typed input', () => {
      const warning = setTypedInput(openWarning(getInitialFormState()), 'partial');
      const next = openConfirmation(warning);
      expect(next.step).toBe('confirmation');
      expect(next.typedInput).toBe('partial');
    });
  });

  describe('setTypedInput + isConfirmationValid', () => {
    it('rejects an empty string', () => {
      const state = setTypedInput(getInitialFormState(), '');
      expect(isConfirmationValid(state)).toBe(false);
    });

    it('rejects a partial string', () => {
      const state = setTypedInput(getInitialFormState(), 'FACTORY');
      expect(isConfirmationValid(state)).toBe(false);
    });

    it('rejects a case-mismatched string (case-sensitive)', () => {
      const state = setTypedInput(getInitialFormState(), 'factory_reset');
      expect(isConfirmationValid(state)).toBe(false);
    });

    it('rejects a string with extra whitespace', () => {
      const state = setTypedInput(getInitialFormState(), ' FACTORY_RESET ');
      expect(isConfirmationValid(state)).toBe(false);
    });

    it('accepts the exact FACTORY_RESET string', () => {
      const state = setTypedInput(getInitialFormState(), FACTORY_RESET_CONFIRM_STRING);
      expect(isConfirmationValid(state)).toBe(true);
    });
  });

  describe('startSubmitting + markSuccess', () => {
    it('transitions to submitting then success', () => {
      const submitting = startSubmitting(getInitialFormState());
      expect(submitting.step).toBe('submitting');
      expect(submitting.errorMessage).toBeNull();
      const success = markSuccess(submitting);
      expect(success.step).toBe('success');
    });
  });

  describe('markError', () => {
    it('records message and error kind', () => {
      const next = markError(getInitialFormState(), 'boom', 'server-error');
      expect(next.step).toBe('error');
      expect(next.errorMessage).toBe('boom');
      expect(next.errorKind).toBe('server-error');
    });
  });

  describe('backToWarning', () => {
    it('clears error and returns to warning step', () => {
      const errored = markError(getInitialFormState(), 'boom', 'server-error');
      const next = backToWarning(errored);
      expect(next.step).toBe('warning');
      expect(next.errorMessage).toBeNull();
      expect(next.errorKind).toBeNull();
    });
  });

  describe('closeForm', () => {
    it('resets all state to initial values', () => {
      // closeForm takes no args; this test just asserts the function always returns the initial state
      const next = closeForm();
      expect(next).toEqual(getInitialFormState());
    });
  });

  describe('classifyResetError', () => {
    it('classifies status 401 as unauthorized', () => {
      const result = classifyResetError({ status: 401 });
      expect(result.kind).toBe('unauthorized');
      expect(result.message).toMatch(/sessão/i);
    });

    it('classifies status 403 as forbidden', () => {
      const result = classifyResetError({ status: 403 });
      expect(result.kind).toBe('forbidden');
      expect(result.message).toMatch(/permissão/i);
    });

    it('classifies status 500 as server-error', () => {
      const result = classifyResetError({ status: 500 });
      expect(result.kind).toBe('server-error');
      expect(result.message).toMatch(/servidor/i);
    });

    it('classifies status 408 as timeout', () => {
      const result = classifyResetError({ status: 408 });
      expect(result.kind).toBe('timeout');
    });

    it('classifies status 504 as timeout', () => {
      const result = classifyResetError({ status: 504 });
      expect(result.kind).toBe('timeout');
    });

    it('classifies network error messages', () => {
      const result = classifyResetError(new Error('Failed to fetch'));
      expect(result.kind).toBe('network');
      expect(result.message).toMatch(/rede/i);
    });

    it('classifies Error instances with non-network messages as unknown', () => {
      const result = classifyResetError(new Error('Some custom failure'));
      expect(result.kind).toBe('unknown');
      expect(result.message).toBe('Some custom failure');
    });

    it('classifies non-Error values as unknown with default message', () => {
      const result = classifyResetError('just a string');
      expect(result.kind).toBe('unknown');
      expect(result.message).toBe('Não foi possível concluir a operação.');
    });

    it('classifies null/undefined as unknown with default message', () => {
      const result = classifyResetError(null);
      expect(result.kind).toBe('unknown');
      expect(result.message).toBe('Não foi possível concluir a operação.');
    });
  });
});
