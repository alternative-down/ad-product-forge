import { type ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import { AdminButton, AdminInput } from '@/components/admin';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type RuntimeSettings = {
  memoryLastMessagesFullEnabled: boolean;
  memoryLastMessagesCount: string;
  tokenCountFilterEnabled: boolean;
  tokenCountFilterLimit: string;
  checkpointedOmEnabled: boolean;
  checkpointedOmTotalContextTokens: string;
  checkpointedOmRecentRawTokens: string;
  checkpointedOmRawObservationBatchTokens: string;
  checkpointedOmObservationReflectionBatchTokens: string;
  checkpointedOmObservationSupportTokens: string;
  checkpointedOmReflectionSupportTokens: string;
  ltmRecallScoreThreshold: string;
  ltmRecallDocumentCount: string;
};



type RuntimeSettingFieldProps = {
  label: string;
  description: string;
  tooltip?: string;
  children: ReactNode;
};

function RuntimeSettingField({ label, description, tooltip, children }: RuntimeSettingFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">{label}</label>
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger>
              <span className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground">
                <CircleHelp className="h-4 w-4" />
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-72 text-xs leading-relaxed">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <div className="text-xs leading-relaxed text-muted-foreground">{description}</div>
      {children}
    </div>
  );
}

type RuntimeSettingsSectionProps = {
  runtimeSettings: RuntimeSettings;
  settingsQuery: { data: any };
  settingsMutation: { mutate: (data: any) => void; isPending: boolean; error?: { message: string } | null; };
  onRuntimeDraftChange: (draft: RuntimeSettings) => void;
};

export function RuntimeSettingsSection({
  runtimeSettings,
  settingsQuery,
  settingsMutation,
  onRuntimeDraftChange,
}: RuntimeSettingsSectionProps) {
  return (
    <section className="space-y-5 border-t border-border pt-6">
      <div className="space-y-1">
        <div className="text-lg font-semibold tracking-[-0.03em]">Memória e contexto</div>
        <div className="max-w-3xl text-sm text-muted-foreground">
          Ajusta `lastMessages`, token limiter e a OM checkpointed. Aqui você controla o tamanho do contexto recente, o freio de tokens e a compressão ativa por camadas.
        </div>
      </div>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!settingsQuery.data) return;
          settingsMutation.mutate({
            ...settingsQuery.data,
            memoryLastMessagesFullEnabled: runtimeSettings.memoryLastMessagesFullEnabled,
            memoryLastMessagesCount: Number(runtimeSettings.memoryLastMessagesCount),
            tokenCountFilterEnabled: runtimeSettings.tokenCountFilterEnabled,
            tokenCountFilterLimit: Number(runtimeSettings.tokenCountFilterLimit),
            checkpointedOmEnabled: runtimeSettings.checkpointedOmEnabled,
            checkpointedOmTotalContextTokens: Number(runtimeSettings.checkpointedOmTotalContextTokens),
            checkpointedOmRecentRawTokens: Number(runtimeSettings.checkpointedOmRecentRawTokens),
            checkpointedOmRawObservationBatchTokens: Number(runtimeSettings.checkpointedOmRawObservationBatchTokens),
            checkpointedOmObservationReflectionBatchTokens: Number(runtimeSettings.checkpointedOmObservationReflectionBatchTokens),
            checkpointedOmObservationSupportTokens: Number(runtimeSettings.checkpointedOmObservationSupportTokens),
            checkpointedOmReflectionSupportTokens: Number(runtimeSettings.checkpointedOmReflectionSupportTokens),
            ltmRecallScoreThreshold: Number(runtimeSettings.ltmRecallScoreThreshold),
            ltmRecallDocumentCount: Number(runtimeSettings.ltmRecallDocumentCount),
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <RuntimeSettingField
            label="Last messages full load"
            description="Carrega o histórico inteiro da thread a cada generate. Útil para preservar continuidade máxima, mas aumenta custo e peso de contexto."
            tooltip="Liga carga completa do histórico e ignora o limite numérico abaixo."
          >
            <Switch
              checked={runtimeSettings.memoryLastMessagesFullEnabled}
              disabled={settingsMutation.isPending}
              onCheckedChange={(checked) => onRuntimeDraftChange({ ...runtimeSettings, memoryLastMessagesFullEnabled: checked })}
            />
          </RuntimeSettingField>

          <RuntimeSettingField
            label="Last messages count"
            description="Janela base de mensagens recentes que entra no modelo quando o full load está desligado. Valor maior preserva mais contexto; valor menor reduz custo e ruído."
            tooltip="Na prática é o tamanho inicial da janela recente da thread."
          >
            <AdminInput
              type="number"
              value={runtimeSettings.memoryLastMessagesCount}
              onChange={(event) => onRuntimeDraftChange({ ...runtimeSettings, memoryLastMessagesCount: event.target.value })}
              disabled={settingsMutation.isPending || runtimeSettings.memoryLastMessagesFullEnabled}
            />
          </RuntimeSettingField>

          <RuntimeSettingField
            label="Token count filter"
            description="Liga o filtro que corta contexto antes do generate quando a entrada fica grande demais. É a proteção mais direta contra prompts inchados."
            tooltip="Sem esse filtro o modelo recebe o contexto bruto montado pelo runtime."
          >
            <Switch
              checked={runtimeSettings.tokenCountFilterEnabled}
              disabled={settingsMutation.isPending}
              onCheckedChange={(checked) => onRuntimeDraftChange({ ...runtimeSettings, tokenCountFilterEnabled: checked })}
            />
          </RuntimeSettingField>

          <RuntimeSettingField
            label="Token count limit"
            description="Teto aproximado de tokens permitido para a entrada depois da montagem de contexto. Use como freio global para evitar steps muito pesadas."
            tooltip="Quanto menor, mais agressivo o corte do contexto; quanto maior, mais contexto entra no generate."
          >
            <AdminInput
              type="number"
              value={runtimeSettings.tokenCountFilterLimit}
              onChange={(event) => onRuntimeDraftChange({ ...runtimeSettings, tokenCountFilterLimit: event.target.value })}
              disabled={settingsMutation.isPending || !runtimeSettings.tokenCountFilterEnabled}
            />
          </RuntimeSettingField>

          <RuntimeSettingField
            label="Checkpointed OM"
            description="Liga a OM nova com checkpoint, batches de observation/reflection e montagem própria do contexto ativo."
            tooltip="Quando desligada, o runtime usa só histórico recente e token limiter."
          >
            <Switch
              checked={runtimeSettings.checkpointedOmEnabled}
              disabled={settingsMutation.isPending}
              onCheckedChange={(checked) => onRuntimeDraftChange({ ...runtimeSettings, checkpointedOmEnabled: checked })}
            />
          </RuntimeSettingField>

          <RuntimeSettingField
            label="OM total tokens"
            description="Teto de tokens para o contexto total da OM. Define o budget máximo antes de comprimir ou cortar."
            tooltip="Grosso modo: quanto maior, mais espaço para reflexão e memória de trabalho."
          >
            <AdminInput
              type="number"
              value={runtimeSettings.checkpointedOmTotalContextTokens}
              onChange={(event) => onRuntimeDraftChange({ ...runtimeSettings, checkpointedOmTotalContextTokens: event.target.value })}
              disabled={settingsMutation.isPending || !runtimeSettings.checkpointedOmEnabled}
            />
          </RuntimeSettingField>

          <RuntimeSettingField
            label="OM recent tokens"
            description="Tokens alocados para o segmento recente (window). Funciona como buffer ativo que recebe a thread."
            tooltip="O runtime divide o budget total entre recent + reflection + support."
          >
            <AdminInput
              type="number"
              value={runtimeSettings.checkpointedOmRecentRawTokens}
              onChange={(event) => onRuntimeDraftChange({ ...runtimeSettings, checkpointedOmRecentRawTokens: event.target.value })}
              disabled={settingsMutation.isPending || !runtimeSettings.checkpointedOmEnabled}
            />
          </RuntimeSettingField>

          <RuntimeSettingField
            label="OM observation batch"
            description="Tokens por batch de observation. Cada batch recebe até esse tamanho antes de ser refletido."
            tooltip="Tamanho de cada chunk de ação → reflexão."
          >
            <AdminInput
              type="number"
              value={runtimeSettings.checkpointedOmRawObservationBatchTokens}
              onChange={(event) => onRuntimeDraftChange({ ...runtimeSettings, checkpointedOmRawObservationBatchTokens: event.target.value })}
              disabled={settingsMutation.isPending || !runtimeSettings.checkpointedOmEnabled}
            />
          </RuntimeSettingField>

          <RuntimeSettingField
            label="OM observation reflection"
            description="Tokens para o summary/reflection de cada batch de observation. Recebe o batch inteiro."
            tooltip="Cada reflexão é limitada por esse teto, o batch anterior é подавается inteiramente."
          >
            <AdminInput
              type="number"
              value={runtimeSettings.checkpointedOmObservationReflectionBatchTokens}
              onChange={(event) => onRuntimeDraftChange({ ...runtimeSettings, checkpointedOmObservationReflectionBatchTokens: event.target.value })}
              disabled={settingsMutation.isPending || !runtimeSettings.checkpointedOmEnabled}
            />
          </RuntimeSettingField>

          <RuntimeSettingField
            label="OM observation support"
            description="Tokens para o context que sustenta cada batch de observation — funciona como memória de longo prazo no prompt."
            tooltip="A OM checkpointed é alimentada com LTM e histórico aqui."
          >
            <AdminInput
              type="number"
              value={runtimeSettings.checkpointedOmObservationSupportTokens}
              onChange={(event) => onRuntimeDraftChange({ ...runtimeSettings, checkpointedOmObservationSupportTokens: event.target.value })}
              disabled={settingsMutation.isPending || !runtimeSettings.checkpointedOmEnabled}
            />
          </RuntimeSettingField>

          <RuntimeSettingField
            label="OM reflection support"
            description="Tokens para o context que sustenta cada reflexão. Recebe o resumo da OM (LTM + histórico condensado)."
            tooltip="É o context de suporte para a reflexão/reflection. Não recebe o batch inteiro."
          >
            <AdminInput
              type="number"
              value={runtimeSettings.checkpointedOmReflectionSupportTokens}
              onChange={(event) => onRuntimeDraftChange({ ...runtimeSettings, checkpointedOmReflectionSupportTokens: event.target.value })}
              disabled={settingsMutation.isPending || !runtimeSettings.checkpointedOmEnabled}
            />
          </RuntimeSettingField>

          <RuntimeSettingField
            label="LTM recall score threshold"
            description="Limiar mínimo de similaridade (0–1) para um documento ser injetado na memória de trabalho. Quanto maior, mais preciso; quanto menor, mais diverso."
            tooltip="Score abaixo desse valor é descartado na recuperação vetorial."
          >
            <AdminInput
              type="number"
              step="0.01"
              value={runtimeSettings.ltmRecallScoreThreshold}
              onChange={(event) => onRuntimeDraftChange({ ...runtimeSettings, ltmRecallScoreThreshold: event.target.value })}
              disabled={settingsMutation.isPending || !runtimeSettings.checkpointedOmEnabled}
            />
          </RuntimeSettingField>

          <RuntimeSettingField
            label="LTM recall document count"
            description="Número máximo de documentos retornados pela pesquisa vetorial a cada batch de observation."
            tooltip="Quantos documentos o recall injeta no contexto de suporte."
          >
            <AdminInput
              type="number"
              value={runtimeSettings.ltmRecallDocumentCount}
              onChange={(event) => onRuntimeDraftChange({ ...runtimeSettings, ltmRecallDocumentCount: event.target.value })}
              disabled={settingsMutation.isPending || !runtimeSettings.checkpointedOmEnabled}
            />
          </RuntimeSettingField>
        </div>

        <div className="flex justify-end">
          <AdminButton type="submit" disabled={settingsMutation.isPending}>
            {settingsMutation.isPending ? 'Salvando...' : 'Salvar memória e OM'}
          </AdminButton>
        </div>
      </form>
    </section>
  );
}
