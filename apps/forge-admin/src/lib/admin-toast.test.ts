// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the `sonner` module before importing the SUT so that `toast.*` calls
// are captured by vi.fn() instead of rendering real toasts.
vi.mock('sonner', () => ({
  toast: {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from 'sonner';
import {
  failAdminAction,
  startAdminAction,
  succeedAdminAction,
} from './admin-toast';

const mockedLoading = vi.mocked(toast.loading);
const mockedSuccess = vi.mocked(toast.success);
const mockedError = vi.mocked(toast.error);

beforeEach(() => {
  mockedLoading.mockReset();
  mockedSuccess.mockReset();
  mockedError.mockReset();
  mockedLoading.mockReturnValue('toast-id-1');
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('startAdminAction', () => {
  it('delegates to toast.loading and returns the toast id in a context', () => {
    const context = startAdminAction('Saving agent…');
    expect(mockedLoading).toHaveBeenCalledTimes(1);
    expect(mockedLoading).toHaveBeenCalledWith('Saving agent…');
    expect(context).toEqual({ toastId: 'toast-id-1' });
  });
});

describe('succeedAdminAction', () => {
  it('delegates to toast.success with the context toast id and the success message', () => {
    const context = startAdminAction('Saving agent…');
    succeedAdminAction(context, 'Agent saved');
    expect(mockedSuccess).toHaveBeenCalledTimes(1);
    expect(mockedSuccess).toHaveBeenCalledWith('Agent saved', { id: context.toastId });
  });

  it('passes id: undefined when context is undefined (sonner creates a fresh toast)', () => {
    succeedAdminAction(undefined, 'Done');
    expect(mockedSuccess).toHaveBeenCalledWith('Done', { id: undefined });
  });
});

describe('failAdminAction', () => {
  it('delegates to toast.error with the error message and the context toast id', () => {
    const context = startAdminAction('Saving agent…');
    failAdminAction(context, new Error('Network down'));
    expect(mockedError).toHaveBeenCalledTimes(1);
    expect(mockedError).toHaveBeenCalledWith('Network down', { id: context.toastId });
  });

  it('uses the fallback message when the error is not an Error instance', () => {
    failAdminAction(undefined, { weird: 'object' });
    expect(mockedError).toHaveBeenCalledWith('Não foi possível concluir a operação.', {
      id: undefined,
    });
  });

  it('uses the fallback message when the error is an Error with an empty message', () => {
    failAdminAction(undefined, new Error('   '));
    expect(mockedError).toHaveBeenCalledWith('Não foi possível concluir a operação.', {
      id: undefined,
    });
  });

  it('uses the fallback message when the error is undefined', () => {
    failAdminAction(undefined, undefined);
    expect(mockedError).toHaveBeenCalledWith('Não foi possível concluir a operação.', {
      id: undefined,
    });
  });

  it('honors a custom fallback message', () => {
    failAdminAction(undefined, 'string error', 'Custom fallback text');
    expect(mockedError).toHaveBeenCalledWith('Custom fallback text', { id: undefined });
  });

  it('uses the custom fallback when the error is not an Error instance', () => {
    failAdminAction(undefined, 42, 'Custom fallback text');
    expect(mockedError).toHaveBeenCalledWith('Custom fallback text', { id: undefined });
  });

  it('prefers the Error message over the fallback (fallback is only used as last resort)', () => {
    failAdminAction(undefined, new Error('Specific reason'), 'Generic fallback');
    expect(mockedError).toHaveBeenCalledWith('Specific reason', { id: undefined });
  });
});
