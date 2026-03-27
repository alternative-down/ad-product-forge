import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { WizardContainer } from './components/wizard-container';
import { useWizardStore } from './stores/wizard-store';

export function HiringWizardPage() {
  const navigate = useNavigate();
  const { reset } = useWizardStore();

  // Check URL param for step restoration
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stepParam = params.get('step');
    if (stepParam) {
      const step = parseInt(stepParam, 10);
      if (step >= 1 && step <= 5) {
        useWizardStore.getState().setStep(step);
      }
    }
  }, []);

  // Navigate back to agents list when cancelled
  const handleCancel = () => {
    reset();
    navigate({ to: '/agents' });
  };

  // Navigate to agent detail when complete
  const handleComplete = () => {
    navigate({ to: '/agents' });
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <WizardContainer onCancel={handleCancel} onComplete={handleComplete} />
    </div>
  );
}
