import { toast } from 'sonner';

export type AdminActionToastContext = {
  toastId: string | number;
};

export function startAdminAction(message: string): AdminActionToastContext {
  return {
    toastId: toast.loading(message),
  };
}

export function succeedAdminAction(
  context: AdminActionToastContext | undefined,
  message: string,
) {
  toast.success(message, {
    id: context?.toastId,
  });
}

export function failAdminAction(
  context: AdminActionToastContext | undefined,
  error: unknown,
  fallback = 'Não foi possível concluir a operação.',
) {
  toast.error(getAdminErrorMessage(error, fallback), {
    id: context?.toastId,
  });
}

function getAdminErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}
