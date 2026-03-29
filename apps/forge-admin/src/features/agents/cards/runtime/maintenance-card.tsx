import { LoaderCircle, Trash2 } from 'lucide-react';
import type { AgentFunction, getAgent } from '../../../../lib/api';
import { Button } from '../../../../components/ui/button';
import { Card } from '../../../../components/ui/card';
import { Select } from '../../../../components/ui/select';
import { LabeledField } from '../../ui';

type AgentData = Awaited<ReturnType<typeof getAgent>>;

export function AgentMaintenanceCard(input: {
  agent: AgentData;
  functions: AgentFunction[];
  selectedFunctionId: string;
  onSelectedFunctionIdChange(functionId: string): void;
  onApplyFunctionChange(): void;
  functionPending: boolean;
  functionError: string | null;
  onTerminate(): void;
  terminatePending: boolean;
  terminateError: string | null;
}) {
  const currentFunctionId = input.agent?.function?.functionId ?? '';

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">Agent maintenance</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Human-facing adjustments only. Functions stay read-only here except for reassignment on
            the selected agent.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
            <LabeledField label="Assigned function">
              <Select
                value={input.selectedFunctionId}
                onChange={(value) => input.onSelectedFunctionIdChange(value)}
              >
                <option value="" disabled>
                  Select function
                </option>
                {input.functions.map((agentFunction) => (
                  <option key={agentFunction.functionId} value={agentFunction.functionId}>
                    {agentFunction.name}
                  </option>
                ))}
              </Select>
            </LabeledField>
            <div className="flex items-end">
              <Button
                variant="secondary"
                onClick={input.onApplyFunctionChange}
                disabled={
                  input.functionPending ||
                  !input.selectedFunctionId ||
                  input.selectedFunctionId === currentFunctionId
                }
              >
                {input.functionPending ? (
                  <>
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    Applying...
                  </>
                ) : (
                  'Apply function'
                )}
              </Button>
            </div>
          </div>

          {input.functionError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {input.functionError}
            </div>
          )}
        </div>

        <div className="w-full rounded-lg border border-red-200 bg-red-50 p-4 xl:max-w-sm">
          <div className="text-sm font-semibold text-red-800">Terminate agent</div>
          <p className="mt-2 text-sm text-red-700">
            Removes runtime, schedules, mailbox, GitHub app installation, database record, and the
            workspace directory.
          </p>
          {input.terminateError && (
            <div className="mt-3 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm text-red-700">
              {input.terminateError}
            </div>
          )}
          <Button
            className="mt-4 w-full"
            variant="danger"
            onClick={input.onTerminate}
            disabled={input.terminatePending}
          >
            {input.terminatePending ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Terminating...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Terminate agent
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}
