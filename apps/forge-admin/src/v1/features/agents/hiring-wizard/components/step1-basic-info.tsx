import { useState } from 'react';
import { useWizardStore, validateBasicInfo } from '../stores/wizard-store';
import { Input } from '../../../../components/ui/input';
import { Textarea } from '../../../../components/ui/textarea';

export function Step1BasicInfo() {
  const { basicInfo, setBasicInfo } = useWizardStore();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const validationErrors = validateBasicInfo(basicInfo);
    setErrors(validationErrors);
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
            Role <span className="text-destructive">*</span>
          </label>
          <Input
            placeholder="ex: sales-ops, product-designer, finance-analyst"
            value={basicInfo.role}
            onChange={(e) => setBasicInfo({ role: e.target.value })}
            onBlur={() => handleBlur('role')}
            className={touched.role && errors.role ? 'border-destructive' : ''}
          />
          {touched.role && errors.role && (
            <p className="text-xs text-destructive mt-1">{errors.role}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">Use the role you want this agent to play in the company.</p>
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
