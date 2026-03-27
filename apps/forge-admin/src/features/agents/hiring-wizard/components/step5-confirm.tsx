import { CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { useWizardStore } from '../stores/wizard-store';
import { Button } from '../../../../components/ui/button';
import { Card } from '../../../../components/ui/card';
import { Link } from '@tanstack/react-router';

export function Step5Confirm() {
  const { isSubmitting, error, isComplete, createdAgentId, basicInfo, reset, prevStep } = useWizardStore();

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <Card className="p-8 text-center border-destructive">
          <AlertCircle className="w-16 h-16 mx-auto text-destructive mb-4" />
          <h2 className="text-xl font-semibold mb-2">Falha ao Contratar</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <div className="flex gap-4 justify-center">
            <Button variant="secondary" onClick={prevStep}>
              Voltar
            </Button>
            <Button onClick={() => window.location.reload()}>
              Tentar Novamente
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Loading state
  if (isSubmitting) {
    return (
      <div className="space-y-6">
        <Card className="p-8 text-center">
          <Loader2 className="w-16 h-16 mx-auto text-primary animate-spin mb-4" />
          <h2 className="text-xl font-semibold mb-2">Contratando agent...</h2>
          <p className="text-muted-foreground">Por favor, aguarde enquanto preparamos tudo</p>
        </Card>
      </div>
    );
  }

  // Success state
  if (isComplete) {
    return (
      <div className="space-y-6">
        <Card className="p-8 text-center border-green-500 bg-green-50 dark:bg-green-950/20">
          <CheckCircle className="w-16 h-16 mx-auto text-green-600 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Agent Contratado!</h2>
          <p className="text-muted-foreground mb-6">
            {basicInfo.agentName} está inicializando...
          </p>
          <div className="flex gap-4 justify-center">
            <Button variant="secondary" onClick={reset}>
              Contratar Novo Agent
            </Button>
            {createdAgentId && (
              <Link to="/agents/$agentId/runtime/$runtimeView" params={{ agentId: createdAgentId, runtimeView: 'assignment' }}>
                <Button>Ver Runtime</Button>
              </Link>
            )}
          </div>
        </Card>
      </div>
    );
  }

  // Default/initial state
  return null;
}
