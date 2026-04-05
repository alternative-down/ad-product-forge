import {
  AdminButton,
  AdminDialogBody,
  AdminDialogContent,
  AdminDialogFooter,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminInput,
  AdminTextarea,
} from '@/components/admin';
import { Dialog } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

import type { McpForm } from './-mcp-helpers';

export function McpDialog(input: {
  open: boolean;
  pending: boolean;
  form: McpForm;
  onOpenChange(open: boolean): void;
  onFormChange(value: McpForm): void;
  onSubmit(): void;
}) {
  return (
    <Dialog open={input.open} onOpenChange={input.onOpenChange}>
      <AdminDialogContent>
        <AdminDialogHeader>
          <AdminDialogTitle>{input.form.configId ? 'Editar servidor MCP' : 'Novo servidor MCP'}</AdminDialogTitle>
        </AdminDialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            input.onSubmit();
          }}
        >
          <AdminDialogBody>
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="mcp-name">
                  Nome
                </label>
                <AdminInput
                  id="mcp-name"
                  value={input.form.name}
                  onChange={(event) => input.onFormChange({ ...input.form, name: event.target.value })}
                  disabled={input.pending}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="mcp-description">
                  Descrição
                </label>
                <AdminTextarea
                  id="mcp-description"
                  rows={4}
                  value={input.form.description}
                  onChange={(event) => input.onFormChange({ ...input.form, description: event.target.value })}
                  disabled={input.pending}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="mcp-transport">
                  Transporte
                </label>
                <Select
                  value={input.form.transport}
                  onValueChange={(value: 'stdio' | 'http_streamable') => input.onFormChange({ ...input.form, transport: value })}
                  disabled={input.pending}
                >
                  <SelectTrigger id="mcp-transport" className="w-full">
                    <SelectValue>{input.form.transport === 'stdio' ? 'stdio' : 'http_streamable'}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stdio">stdio</SelectItem>
                    <SelectItem value="http_streamable">http_streamable</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {input.form.transport === 'stdio' ? (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="mcp-command">
                      Command
                    </label>
                    <AdminInput
                      id="mcp-command"
                      value={input.form.command}
                      onChange={(event) => input.onFormChange({ ...input.form, command: event.target.value })}
                      disabled={input.pending}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="mcp-args">
                      Args JSON
                    </label>
                    <AdminTextarea
                      id="mcp-args"
                      rows={4}
                      value={input.form.argsText}
                      onChange={(event) => input.onFormChange({ ...input.form, argsText: event.target.value })}
                      disabled={input.pending}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="mcp-env">
                      Env vars JSON
                    </label>
                    <AdminTextarea
                      id="mcp-env"
                      rows={4}
                      value={input.form.envVarsText}
                      onChange={(event) => input.onFormChange({ ...input.form, envVarsText: event.target.value })}
                      disabled={input.pending}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="mcp-url">
                      URL
                    </label>
                    <AdminInput
                      id="mcp-url"
                      value={input.form.url}
                      onChange={(event) => input.onFormChange({ ...input.form, url: event.target.value })}
                      disabled={input.pending}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="mcp-headers">
                      Headers JSON
                    </label>
                    <AdminTextarea
                      id="mcp-headers"
                      rows={4}
                      value={input.form.headersText}
                      onChange={(event) => input.onFormChange({ ...input.form, headersText: event.target.value })}
                      disabled={input.pending}
                    />
                  </div>
                </>
              )}

              <label className="flex items-center justify-between gap-4 rounded-sm border border-border px-4 py-3">
                <span className="text-sm font-medium">Ativo</span>
                <Switch
                  checked={input.form.isActive}
                  onCheckedChange={(checked) => input.onFormChange({ ...input.form, isActive: checked })}
                  disabled={input.pending}
                />
              </label>
            </div>
          </AdminDialogBody>

          <AdminDialogFooter>
            <AdminButton
              type="submit"
              disabled={
                input.pending ||
                !input.form.name.trim() ||
                (input.form.transport === 'stdio' ? !input.form.command.trim() : !input.form.url.trim())
              }
            >
              {input.pending ? 'Salvando...' : 'Salvar'}
            </AdminButton>
          </AdminDialogFooter>
        </form>
      </AdminDialogContent>
    </Dialog>
  );
}
