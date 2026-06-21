import { useState } from 'react';
import type { ChangeEvent } from 'react';

import { useMutation } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';

import { AdminButton } from '@/components/admin/forms/admin-button';
import {
  AdminDialogContent,
  AdminDialogBody,
  AdminDialogFooter,
  AdminDialogHeader,
  AdminDialogTitle,
} from '@/components/admin/forms/admin-dialog';
import { AdminInput } from '@/components/admin/forms/admin-input';
import { triggerFactoryReset } from '@/lib/admin-api/system';
import { failAdminAction, startAdminAction, succeedAdminAction } from '@/lib/admin-toast';
import { Dialog, DialogDescription } from '@/components/ui/dialog';

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
  openConfirmation,
  setTypedInput,
  startSubmitting,
  type FactoryResetFormState,
} from './factory-reset-form-state';

type FactoryResetModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function FactoryResetModal({ open, onOpenChange }: FactoryResetModalProps) {
  const [state, setState] = useState<FactoryResetFormState>(getInitialFormState);

  const resetMutation = useMutation({
    mutationFn: triggerFactoryReset,
    onMutate: () => {
      startAdminAction('Resetando o sistema...');
      setState((prev) => startSubmitting(prev));
    },
    onSuccess: () => {
      succeedAdminAction(undefined, 'Sistema resetado. Recarregue a página.');
      setState((prev) => markSuccess(prev));
    },
    onError: (error) => {
      const { kind, message } = classifyResetError(error);
      failAdminAction(undefined, error, message);
      setState((prev) => markError(prev, message, kind));
    },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (state.step === 'submitting') {
      return;
    }
    if (!nextOpen) {
      setState((prev) => closeForm(prev));
    }
    onOpenChange(nextOpen);
  };

  const handleConfirmClick = () => {
    setState((prev) => openConfirmation(prev));
  };

  const handleTypedInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setState((prev) => setTypedInput(prev, event.target.value));
  };

  const handleSubmit = () => {
    if (!isConfirmationValid(state)) {
      return;
    }
    resetMutation.mutate();
  };

  const handleBackToWarning = () => {
    setState((prev) => backToWarning(prev));
  };

  const handleCloseAfterSuccess = () => {
    setState((prev) => closeForm(prev));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <AdminDialogContent>
        <AdminDialogHeader>
          <AdminDialogTitle>Factory Reset</AdminDialogTitle>
          <DialogDescription className="sr-only">
            Confirmação obrigatória para resetar o sistema para o estado de fábrica.
          </DialogDescription>
        </AdminDialogHeader>

        <AdminDialogBody>
          {state.step === 'warning' ? (
            <WarningStep onConfirm={handleConfirmClick} />
          ) : null}

          {state.step === 'confirmation' || state.step === 'submitting' || state.step === 'error' ? (
            <ConfirmationStep
              state={state}
              onInputChange={handleTypedInputChange}
              onBack={handleBackToWarning}
            />
          ) : null}

          {state.step === 'success' ? <SuccessStep /> : null}
        </AdminDialogBody>

        <AdminDialogFooter>
          {state.step === 'warning' ? (
            <>
              <AdminButton variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancelar
              </AdminButton>
              <AdminButton variant="destructive" onClick={handleConfirmClick}>
                Continuar
              </AdminButton>
            </>
          ) : null}

          {state.step === 'confirmation' || state.step === 'error' ? (
            <>
              <AdminButton
                variant="ghost"
                onClick={handleBackToWarning}
                disabled={state.step === 'submitting'}
              >
                Voltar
              </AdminButton>
              <AdminButton
                variant="destructive"
                onClick={handleSubmit}
                disabled={!isConfirmationValid(state) || state.step === 'submitting'}
              >
                {state.step === 'submitting' ? 'Resetando...' : 'Confirmar reset'}
              </AdminButton>
            </>
          ) : null}

          {state.step === 'submitting' ? (
            <AdminButton variant="destructive" disabled>
              Resetando...
            </AdminButton>
          ) : null}

          {state.step === 'success' ? (
            <AdminButton variant="default" onClick={handleCloseAfterSuccess}>
              Fechar
            </AdminButton>
          ) : null}
        </AdminDialogFooter>
      </AdminDialogContent>
    </Dialog>
  );
}

function WarningStep({ onConfirm }: { onConfirm: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="space-y-1 text-sm">
          <p className="font-medium text-foreground">Esta ação é irreversível.</p>
          <p className="text-muted-foreground">
            O sistema será resetado para o estado de fábrica. Todos os dados abaixo serão apagados.
            Um backup do banco será criado antes do reset.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Itens que serão apagados:</p>
        <ul className="space-y-1.5 text-sm">
          {WIPE_TARGET_LABELS.map((item) => (
            <li key={item.name} className="flex items-start gap-2">
              <span className="mt-0.5 text-muted-foreground">•</span>
              <div>
                <span className="font-medium">{item.name}</span>
                <span className="text-muted-foreground"> — {item.description}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {/* onConfirm is invoked from the footer's Continue button */}
      <button type="button" onClick={onConfirm} className="hidden" aria-hidden="true" />
    </div>
  );
}

type ConfirmationStepProps = {
  state: FactoryResetFormState;
  onInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onBack: () => void;
};

function ConfirmationStep({ state, onInputChange, onBack }: ConfirmationStepProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Para confirmar, digite{' '}
        <span className="font-mono font-semibold text-foreground">{FACTORY_RESET_CONFIRM_STRING}</span>{' '}
        abaixo. A confirmação diferencia maiúsculas de minúsculas.
      </p>

      <AdminInput
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={state.typedInput}
        onChange={onInputChange}
        placeholder={FACTORY_RESET_CONFIRM_STRING}
        disabled={state.step === 'submitting'}
        aria-label="Confirmação de factory reset"
      />

      {state.step === 'error' && state.errorMessage ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {state.errorMessage}
          <button
            type="button"
            onClick={onBack}
            className="mt-2 block text-xs underline"
          >
            Voltar e tentar novamente
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SuccessStep() {
  return (
    <div className="space-y-3 text-sm">
      <p className="font-medium text-foreground">Reset concluído.</p>
      <p className="text-muted-foreground">
        O sistema foi resetado para o estado de fábrica. Recomendamos recarregar a página para que
        a sessão atual seja encerrada e um novo login seja solicitado.
      </p>
    </div>
  );
}
