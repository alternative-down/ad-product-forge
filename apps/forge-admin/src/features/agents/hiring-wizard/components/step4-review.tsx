import { Edit2 } from 'lucide-react';
import { useWizardStore } from '../stores/wizard-store';
import { Button } from '../../../../components/ui/button';
import { Card } from '../../../../components/ui/card';
import { Badge } from '../../../../components/ui/badge';

const FUNCTION_LABELS: Record<string, string> = {
  copywriter: 'Copywriter',
  researcher: 'Researcher',
  developer: 'Developer',
  support: 'Support',
  analyst: 'Analyst',
};

const MODEL_LABELS: Record<string, string> = {
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-4-turbo': 'GPT-4 Turbo',
  'claude-3-5-sonnet': 'Claude 3.5 Sonnet',
  'claude-3-5-haiku': 'Claude 3.5 Haiku',
};

const BUDGET_TYPE_LABELS: Record<string, string> = {
  week: 'Semana',
  month: 'Mês',
  year: 'Ano',
};

interface ReviewCardProps {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}

function ReviewCard({ title, onEdit, children }: ReviewCardProps) {
  return (
    <Card>
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-medium">{title}</h3>
        <Button variant="ghost" onClick={onEdit} className="gap-1">
          <Edit2 className="w-3 h-3" /> Editar
        </Button>
      </div>
      {children}
    </Card>
  );
}

export function Step4Review() {
  const { basicInfo, configuration, contract, setStep } = useWizardStore();

  const getMonthlyEstimate = () => {
    const amount = parseFloat(contract.budgetAmount) || 0;
    switch (contract.budgetType) {
      case 'week': return amount * 4.33;
      case 'year': return amount / 12;
      default: return amount;
    }
  };

  const formatSchedule = () => {
    if (contract.scheduleType === 'always') return 'Sempre ativo';
    const days = contract.scheduleDays?.join(', ') || '';
    return `${contract.scheduleStartTime}-${contract.scheduleEndTime} (${days})`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Review</h2>
        <p className="text-sm text-muted-foreground">Revise as informações antes de contratar.</p>
        <p className="text-xs text-muted-foreground mt-1">Step 4 de 5</p>
      </div>

      <div className="space-y-4">
        <ReviewCard title="Basic Info" onEdit={() => setStep(1)}>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Agent:</span>
              <div className="font-medium">{basicInfo.agentName}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Function:</span>
              <div className="font-medium">{FUNCTION_LABELS[basicInfo.function]}</div>
            </div>
            {basicInfo.description && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Description:</span>
                <div className="text-sm">{basicInfo.description}</div>
              </div>
            )}
          </div>
        </ReviewCard>

        <ReviewCard title="Configuration" onEdit={() => setStep(2)}>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Model:</span>
              <div className="font-medium">{MODEL_LABELS[configuration.model]}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Workspace:</span>
              <div className="font-medium">{configuration.workspace}</div>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Instructions:</span>
              <div className="text-sm line-clamp-3">{configuration.instructions}</div>
            </div>
          </div>
        </ReviewCard>

        <ReviewCard title="Contract" onEdit={() => setStep(3)}>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Budget:</span>
              <div className="font-medium">
                ${contract.budgetAmount}/{BUDGET_TYPE_LABELS[contract.budgetType].toLowerCase()}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Schedule:</span>
              <div className="font-medium">{formatSchedule()}</div>
            </div>
          </div>
        </ReviewCard>

        <Card className="p-4 border-primary bg-primary/5">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-medium">Contract Summary</h3>
              <p className="text-sm text-muted-foreground">Custo mensal estimado</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">${getMonthlyEstimate().toFixed(2)}</div>
              <Badge className="mt-1">Aguardando confirmação</Badge>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
