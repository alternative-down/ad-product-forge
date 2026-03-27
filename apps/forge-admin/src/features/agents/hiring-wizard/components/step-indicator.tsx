import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Step {
  number: number;
  label: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number;
  completedSteps?: number[];
}

export function StepIndicator({ steps, currentStep, completedSteps = [] }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((step, index) => {
        const isCompleted = completedSteps.includes(step.number);
        const isCurrent = step.number === currentStep;
        const isClickable = step.number < currentStep || isCompleted;

        return (
          <div key={step.number} className="flex items-center">
            <button
              type="button"
              onClick={() => isClickable && window.history.pushState(null, '', `?step=${step.number}`)}
              disabled={!isClickable}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                isCurrent && 'bg-primary text-primary-foreground',
                isCompleted && 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-100',
                !isCurrent && !isCompleted && 'text-muted-foreground hover:bg-muted'
              )}
            >
              <span className={cn(
                'flex items-center justify-center w-6 h-6 rounded-full text-xs',
                isCurrent && 'bg-primary-foreground/20',
                isCompleted && 'bg-green-600 text-white',
                !isCurrent && !isCompleted && 'bg-muted'
              )}>
                {isCompleted ? <Check className="w-4 h-4" /> : step.number}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
            </button>
            {index < steps.length - 1 && (
              <div className={cn(
                'w-8 h-0.5 mx-1',
                step.number < currentStep ? 'bg-green-500' : 'bg-muted'
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export const WIZARD_STEPS = [
  { number: 1, label: 'Basic Info' },
  { number: 2, label: 'Config' },
  { number: 3, label: 'Contract' },
  { number: 4, label: 'Review' },
  { number: 5, label: 'Confirm' },
] as const;
