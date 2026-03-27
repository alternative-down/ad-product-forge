import { useState } from 'react';
import { Info, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useWizardStore, validateConfiguration, type AIModel } from '../stores/wizard-store';
import { listWorkspaces } from '../../lib/api';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Select } from '../../components/ui/select';
import { Card } from '../../components/ui/card';

const MODEL_OPTIONS: { value: AIModel; label: string; cost: string; description: string }[] = [
  { value: 'gpt-4o', label: 'GPT-4o', cost: '💰💰💰', description: 'Mais capaz, mais caro' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', cost: '💰💰', description: 'Bom custo-benefício' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', cost: '💰💰', description: 'Rápido e capaz' },
  { value: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet', cost: '💰💰', description: 'Excelente raciocínio' },
  { value: 'claude-3-5-haiku', label: 'Claude 3.5 Haiku', cost: '💰', description: 'Rápido, econômico' },
];

export function Step2Configuration() {
  const { configuration, setConfiguration, nextStep, prevStep } = useWizardStore();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Fetch workspaces from API
  const { data: workspaces, isLoading: workspacesLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: listWorkspaces,
  });

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors(validateConfiguration(configuration));
  };

  const handleNext = () => {
    setErrors(validateConfiguration(configuration));
    setTouched({ model: true, instructions: true, workspace: true });
    if (Object.keys(validateConfiguration(configuration)).length === 0) {
      nextStep();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Configuration</h2>
        <p className="text-sm text-muted-foreground">Configure o modelo de IA e instruções do agent.</p>
        <p className="text-xs text-muted-foreground mt-1">Step 2 de 5</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium flex items-center gap-1">
            Modelo <span className="text-destructive">*</span>
            <Info className="w-3 h-3 text-muted-foreground" title="Modelo de IA usado para gerar respostas." />
          </label>
          <Select
            value={configuration.model}
            onChange={(value) => setConfiguration({ model: value as AIModel })}
            onBlur={() => handleBlur('model')}
            className={touched.model && errors.model ? 'border-destructive' : ''}
          >
            <option value="">Selecione o modelo</option>
            {MODEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label} {opt.cost}</option>
            ))}
          </Select>
          {touched.model && errors.model && <p className="text-xs text-destructive mt-1">{errors.model}</p>}
        </div>

        <Card className="p-4">
          <h3 className="text-sm font-medium mb-3">Model Comparison</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {MODEL_OPTIONS.map((opt) => (
              <div
                key={opt.value}
                className={\`p-2 rounded border text-xs \${
                  configuration.model === opt.value ? 'border-primary bg-primary/5' : 'border-muted'
                }\`}
              >
                <div className="font-medium">{opt.label}</div>
                <div className="text-muted-foreground">{opt.cost}</div>
                <div className="text-muted-foreground">{opt.description}</div>
              </div>
            ))}
          </div>
        </Card>

        <div>
          <label className="text-sm font-medium flex items-center gap-1">
            Instructions <span className="text-destructive">*</span>
            <Info className="w-3 h-3 text-muted-foreground" title="Instruções detalhadas que guiam o comportamento do agent." />
          </label>
          <Textarea
            placeholder="Descreva o que este agent deve fazer..."
            value={configuration.instructions}
            onChange={(e) => setConfiguration({ instructions: e.target.value })}
            onBlur={() => handleBlur('instructions')}
            rows={6}
            className={touched.instructions && errors.instructions ? 'border-destructive' : ''}
          />
          {touched.instructions && errors.instructions && (
            <p className="text-xs text-destructive mt-1">{errors.instructions}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Seja específico sobre responsabilidades e comportamento.
            Mínimo 50 caracteres ({configuration.instructions.length}/5000)
          </p>
        </div>

        <div>
          <label className="text-sm font-medium flex items-center gap-1">
            Workspace <span className="text-destructive">*</span>
            <Info className="w-3 h-3 text-muted-foreground" title="Espaço de armazenamento para arquivos e memória persistente." />
          </label>
          {workspacesLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando workspaces...
            </div>
          ) : (
            <Select
              value={configuration.workspace}
              onChange={(value) => setConfiguration({ workspace: value })}
              onBlur={() => handleBlur('workspace')}
              className={touched.workspace && errors.workspace ? 'border-destructive' : ''}
            >
              <option value="">Selecione um workspace</option>
              {workspaces?.map((ws) => (
                <option key={ws.workspaceId} value={ws.workspaceId}>
                  {ws.name}
                </option>
              ))}
            </Select>
          )}
          {touched.workspace && errors.workspace && <p className="text-xs text-destructive mt-1">{errors.workspace}</p>}
          <p className="text-xs text-muted-foreground mt-1">Diretório de trabalho para arquivos e memória.</p>
        </div>
      </div>
    </div>
  );
}
