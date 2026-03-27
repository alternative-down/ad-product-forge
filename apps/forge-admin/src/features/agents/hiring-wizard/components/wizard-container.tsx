import { X } from 'lucide-react';
import { useWizardStore, WIZARD_STEPS } from './stores/wizard-store';
import { StepIndicator } from './components/step-indicator';
import { Step1BasicInfo } from './components/step1-basic-info';
import { Step2Configuration } from './components/step2-configuration';
import { Step3Contract } from './components/step3-contract';
import { Step4Review } from './components/step4-review';
import { Step5Confirm } from './components/step5-confirm';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';

interface WizardContainerProps {
  onCancel?: () => void;
  onComplete?: () => void;
}

export function WizardContainer({ onCancel, onComplete }: WizardContainerProps) {
  const { currentStep, nextStep, prevStep, isSubmitting, isComplete } = useWizardStore();

  const renderStepContent = () => {
    switch (currentStep) {
      case 1: return <Step1BasicInfo />;
      case 2: return <Step2Configuration />;
      case 3: return <Step3Contract />;
      case 4: return <Step4Review />;
      case 5: return <Step5Confirm />;
      default: return <Step1BasicInfo />;
    }
  };

  const isLastStep = currentStep === 5;
  const isFirstStep = currentStep === 1;

  return (
    <div className="max-w-2xl mx-auto">
      <Card className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Hiring Wizard</h1>
          {onCancel && (
            <Button variant="ghost" size="icon" onClick={onCancel}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Step Indicator */}
        {!isComplete && <StepIndicator steps={WIZARD_STEPS} currentStep={currentStep} />}

        {/* Step Content */}
        <div className="min-h-[400px]">
          {renderStepContent()}
        </div>

        {/* Navigation - Only show for steps 1-4 */}
        {!isComplete && currentStep < 5 && (
          <div className="flex justify-between mt-8 pt-6 border-t">
            <Button
              variant="outline"
              onClick={isFirstStep ? onCancel : prevStep}
              disabled={isFirstStep}
            >
              {isFirstStep ? 'Cancelar' : 'Voltar ◀'}
            </Button>
            <Button onClick={nextStep} disabled={isSubmitting}>
              Próximo ▶
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
