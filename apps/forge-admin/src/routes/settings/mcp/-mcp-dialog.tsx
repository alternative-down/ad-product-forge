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
import type { UpsertSystemMcpServerInput } from '@/lib/admin-api';

type McpForm = {
  serverId?: string;
  name: string;
  description: string;
  transport: 'stdio' | 'http_streamable';
  command: string;
  argsText: string;
  envVarsText: string;
  url: string;
  headersText: string;
  isActive: boolean;
};

export function createEmptyMcpForm(): McpForm {
  return {
    name: '',
    description: '',
    transport: 'stdio',
    command: '',
    argsText: '',
    envVarsText: '',
    url: '',
    headersText: '',
    isActive: true,
  };
}

export function createMcpForm(input: {
  serverId: string;
  name: string;
  description?: string;
  transport: 'stdio' | 'http_streamable';
  command: string;
  argsText: string;
  envVarsText: string;
  url: string;
  headersText: string;
  isActive: boolean;
}): McpForm {
  return {
    serverId: input.serverId,
    name: input.name,
    description: input.description ?? '',
    transport: input.transport,
    command: input.command,
    argsText: input.argsText,
    envVarsText: input.envVarsText,
    url: input.url,
    headersText: input.headersText,
    isActive: input.isActive,
  };
}

export function toSystemMcpInput(input: McpForm): UpsertSystemMcpServerInput {
  if (input.transport === 'stdio') {
    return {
      serverId: input.serverId,
      name: input.name.trim(),
      description: input.description.trim() || undefined,
      transport: 'stdio',
      command: input.command.trim(),
      argsText: input.argsText.trim() || undefined,
      envVarsText: input.envVarsText.trim() || undefined,
      isActive: input.isActive,
    };
  }

  return {
    serverId: input.serverId,
    name: input.name.trim(),
    description: input.description.trim() || undefined,
    transport: 'http_streamable',
    url: input.url.trim(),
    headersText: input.headersText.trim() || undefined,
    isActive: input.isActive,
  };
}

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
          <AdminDialogTitle>{input.form.serverId ? 'Editar servidor MCP' : 'Novo servidor MCP'}</AdminDialogTitle>
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
                <label className="text-sm font-medium" htmlFor="settings-mcp-name">Nome</label>
                <AdminInput
                  id="settings-mcp-name"
                  value={input.form.name}
                  onChange={(event) => input.onFormChange({ ...input.form, name: event.target.value })}
                  disabled={input.pending}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="settings-mcp-description">Descrição</label>
                <AdminTextarea
                  id="settings-mcp-description"
                  rows={4}
                  value={input.form.description}
                  onChange={(event) => input.onFormChange({ ...input.form, description: event.target.value })}
                  disabled={input.pending}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="settings-mcp-transport">Transporte</label>
                <Select
                  value={input.form.transport}
                  onValueChange={(value: 'stdio' | 'http_streamable') =>
                    input.onFormChange({ ...input.form, transport: value })
                  }
                  disabled={input.pending}
                >
                  <SelectTrigger id="settings-mcp-transport" className="w-full">
                    <SelectValue />
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
                    <label className="text-sm font-medium" htmlFor="settings-mcp-command">Command</label>
                    <AdminInput
                      id="settings-mcp-command"
                      value={input.form.command}
                      onChange={(event) => input.onFormChange({ ...input.form, command: event.target.value })}
                      disabled={input.pending}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="settings-mcp-args">Args JSON</label>
                    <AdminTextarea
                      id="settings-mcp-args"
                      rows={4}
                      value={input.form.argsText}
                      onChange={(event) => input.onFormChange({ ...input.form, argsText: event.target.value })}
                      disabled={input.pending}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="settings-mcp-env">Env vars JSON</label>
                    <AdminTextarea
                      id="settings-mcp-env"
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
                    <label className="text-sm font-medium" htmlFor="settings-mcp-url">URL</label>
                    <AdminInput
                      id="settings-mcp-url"
                      value={input.form.url}
                      onChange={(event) => input.onFormChange({ ...input.form, url: event.target.value })}
                      disabled={input.pending}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="settings-mcp-headers">Headers JSON</label>
                    <AdminTextarea
                      id="settings-mcp-headers"
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
