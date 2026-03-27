import { useState } from 'react';
import { Info } from 'lucide-react';
import { useWizardStore, validateBasicInfo, type AgentFunction } from '../stores/wizard-store';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Select } from '../../components/ui/select';

const FUNCTION_OPTIONS: { value: AgentFunction; label: string; description: string }[] = [
  { value: 'copywriter', label: 'Copywriter', description: 'Gera textos de marketing' },
  { value: 'researcher', label: 'Researcher', description: 'Pesquisa e análise de dados' },
  { value: 'developer', label: 'Developer', description: 'Escreve e revisa código' },
  { value: 'support', label: 'Support', description: 'Atende e resolve dúvidas' },
  { value: 'analyst', label: 'Analyst', description: 'Analisa dados e gera insights' },
];

export function Step1BasicInfo() {
  const { basicInfo, setBasicInfo, nextStep } = useWizardStore();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const validationErrors = validateBasicInfo(basicInfo);
    setErrors(validationErrors);
  };

  const handleNext = () => {
    const validationErrors = validateBasicInfo(basicInfo);
    setErrors(validationErrors);
    setTouched({ agentName: true, function: true, description: true });
    if (Object.keys(validationErrors).length === 0) {
      nextStep();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Basic Info</h2>
        <p className="text-sm text-muted-foreground">Configure as informações básicas do agent.</p>
        <p className="text-xs text-muted-foreground mt-1">Step 1 de 5</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium flex items-center gap-1">
            Agent name <span className="text-destructive">*</span>
          </label>
          <Input
            placeholder="ex: vox-brand-voice"
            value={basicInfo.agentName}
            onChange={(e) => setBasicInfo({ agentName: e.target.value })}
            onBlur={() => handleBlur('agentName')}
            className={touched.agentName && errors.agentName ? 'border-destructive' : ''}
          />
          {touched.agentName && errors.agentName && (
            <p className="text-xs text-destructive mt-1">{errors.agentName}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">Nome único no sistema. 3-50 caracteres.</p>
        </div>

        <div>
          <label className="text-sm font-medium flex items-center gap-1">
            Function <span className="text-destructive">*</span>
            <Info className="w-3 h-3 text-muted-foreground" title="Define permissões e ferramentas disponíveis." />
          </label>
          <Select
            value={basicInfo.function}
            onChange={(value) => setBasicInfo({ function: value as AgentFunction })}
            onBlur={() => handleBlur('function')}
            className={touched.function && errors.function ? 'border-destructive' : ''}
          >
            <option value="">Selecione uma função</option>
            {FUNCTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label} - {opt.description}</option>
            ))}
          </Select>
          {touched.function && errors.function && (
            <p className="text-xs text-destructive mt-1">{errors.function}</p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium">Description</label>
          <Textarea
            placeholder="Descreva o propósito deste agent..."
            value={basicInfo.description}
            onChange={(e) => setBasicInfo({ description: e.target.value })}
            onBlur={() => handleBlur('description')}
            rows={4}
            className={touched.description && errors.description ? 'border-destructive' : ''}
          />
          {touched.description && errors.description && (
            <p className="text-xs text-destructive mt-1">{errors.description}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Opcional, máximo 500 caracteres ({basicInfo.description.length}/500)
          </p>
        </div>
      </div>
    </div>
  );
}
